import fs from "fs";
import path from "path";
import { getEncoding } from "js-tiktoken";
import { applyEdits, buildDecisionRequest, candidateSections, fingerprintDocuments, projectDocument } from "../src/lib/bundle";
import { elapsedPurchaseDays } from "../src/lib/dates";
import { estimateInputCostUsd } from "../src/lib/format";
import {
  assembleBundle,
  customerById,
  loadLibrary,
  scenarioById,
} from "../src/lib/load";
import { requestDecision } from "../src/lib/subq";
import {
  EVALUATION_DATE,
  INPUT_USD_PER_MILLION,
  SUBQ_MODEL,
  type ExceptionPlacement,
  type SourceDocument,
} from "../src/lib/types";

type ExpectedCase = {
  id: string;
  expectedAction: string;
  expectedGoverningSectionId: string;
  elapsedDays: number | null;
  applicableExceptionSectionId?: string;
  otherCustomerExceptionSectionId?: string;
  afterRemovingApplicableException?: {
    expectedAction: string;
    expectedGoverningSectionId: string;
  };
};

type LiveRow = {
  id: string;
  run: number;
  bundle: string;
  placement: string;
  edit: string;
  action: string;
  expectedAction: string;
  governingSectionId: string;
  expectedGoverningSectionId: string;
  actionMatch: boolean;
  sectionMatch: boolean;
  inputTokens: number | null;
  providerRoundTripMs: number;
  estimatedInputCostUsd: number | null;
};

const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function sectionText(documents: SourceDocument[], sectionId: string) {
  for (const document of documents) {
    for (const section of document.sections) {
      if (section.id === sectionId) return section.text;
    }
  }
  return null;
}

async function main() {
  const root = process.cwd();
  const expected = JSON.parse(
    fs.readFileSync(path.join(root, "evaluation", "expected.json"), "utf8"),
  ) as { evaluationDate: string; cases: ExpectedCase[] };
  const library = loadLibrary();
  const source = [
    ...walk(path.join(root, "src")),
    ...walk(path.join(root, "scripts")).filter((file) => !file.endsWith("validate.ts")),
  ];
  check(
    source.every((file) => !fs.readFileSync(file, "utf8").includes("evaluation/expected.json")),
    "Application or corpus code imports the evaluation fixture.",
  );
  const clientSource = walk(path.join(root, "src", "components")).concat(
    walk(path.join(root, "src", "app")).filter((file) => !file.includes(`${path.sep}api${path.sep}`)),
  );
  check(
    clientSource.every((file) => !fs.readFileSync(file, "utf8").includes("SUBQ_API_KEY")),
    "Browser code references SUBQ_API_KEY.",
  );

  check(expected.evaluationDate === EVALUATION_DATE, "Fixture evaluation date drifted.");
  check(library.scenarios.length >= 6, `Expected at least 6 scenarios, found ${library.scenarios.length}.`);
  check(
    expected.cases.map((item) => item.id).join() === library.scenarios.map((item) => item.id).join(),
    "Scenario ids do not match the evaluation fixture.",
  );

  for (const item of expected.cases) {
    const scenario = scenarioById(library, item.id);
    check(
      elapsedPurchaseDays(scenario.purchaseDate) === item.elapsedDays,
      `${item.id} elapsed days are ${elapsedPurchaseDays(scenario.purchaseDate)}, fixture says ${item.elapsedDays}.`,
    );
    const customer = customerById(library, scenario.customerId);
    const documents = assembleBundle(library, scenario, "compact", "middle");
    const request = buildDecisionRequest(customer, scenario, documents);
    const serialized = JSON.stringify(request);
    check(request.model === SUBQ_MODEL, `${item.id} used the wrong model.`);
    check(!serialized.includes(scenario.label), `${item.id} request contains the scenario label.`);
    check(!serialized.includes(scenario.summary), `${item.id} request contains the scenario summary.`);
    check(!serialized.includes(scenario.id), `${item.id} request contains the scenario id.`);
    check(!serialized.includes("expectedAction"), `${item.id} request contains expectedAction.`);
    check(
      !serialized.includes("expectedGoverningSectionId"),
      `${item.id} request contains an expected section id field.`,
    );
    check(!serialized.includes("editableSectionIds"), `${item.id} request contains editor metadata.`);
    const state = request.state as {
      evaluationDate: string;
      purchase: { purchaseDate: string | null; elapsedDays: number | null; dateCalculation: string };
      documents: { id: string; sections: { id: string; text: string }[] }[];
    };
    check(state.evaluationDate === EVALUATION_DATE, `${item.id} is missing the fixed evaluation date.`);
    check(state.purchase.elapsedDays === item.elapsedDays, `${item.id} state elapsed days mismatch.`);
    check(
      state.purchase.dateCalculation.includes(EVALUATION_DATE),
      `${item.id} date calculation omits the evaluation date.`,
    );
    if (scenario.purchaseDate) {
      check(
        state.purchase.dateCalculation.includes(scenario.purchaseDate),
        `${item.id} date calculation omits the original purchase date.`,
      );
    }
    check(
      state.documents.map((document) => document.id).join() === documents.map((document) => document.id).join(),
      `${item.id} dropped or reordered document boundaries.`,
    );
    const questions = request.questions as {
      action: { type: string; criteria: Record<string, string> };
      governing_section: { type: string; criteria: Record<string, string> };
    };
    check(questions.action.type === "choice" && questions.governing_section.type === "choice", "Questions must both be choices.");
    check(
      questions.action.criteria.approve_refund ===
        "the available facts establish eligibility under the applicable policy.",
      "Action criteria drifted.",
    );
    const candidates = candidateSections(documents);
    check(candidates.length + 2 <= 255, `${item.id} exceeds the choice limit.`);
    check(
      questions.governing_section.criteria.insufficient_evidence ===
        "No applicable section establishes the window.",
      "Missing insufficient_evidence choice.",
    );
    check(
      questions.governing_section.criteria.conflicting_evidence ===
        "Equally authoritative current records conflict.",
      "Missing conflicting_evidence choice.",
    );
    for (const candidate of candidates) {
      check(
        questions.governing_section.criteria[candidate.id] === candidate.title,
        `${candidate.id} description is not its title.`,
      );
    }
    check(
      fingerprintDocuments(documents) ===
        fingerprintDocuments(documents.map(projectDocument) as SourceDocument[]),
      `${item.id} projection changed the fingerprint.`,
    );
  }

  const handbook = library.byId.get("DOC-POL-REFUND-2026");
  const authority = handbook?.sections.find((section) => section.id === "SEC-POL-REFUND-AUTHORITY")?.text ?? "";
  check(authority.includes("1. An applicable active signed amendment."), "Authority order is missing the amendment rank.");
  check(authority.includes("2. The customer's active signed agreement."), "Authority order is missing the agreement rank.");
  check(authority.includes("3. The general refund handbook."), "Authority order is missing the handbook rank.");
  check(
    authority.includes("An unresolved conflict between equally authoritative current records requires escalation."),
    "Conflict rule is missing from the handbook.",
  );
  check(
    authority.includes("Missing information necessary to determine eligibility requires requesting information."),
    "Missing-information rule is missing from the handbook.",
  );

  const exception = scenarioById(library, "purchase-45-agreement-exception");
  const customer = customerById(library, exception.customerId);
  const original = assembleBundle(library, exception, "compact", "middle");
  const removed = applyEdits(original, { "SEC-AGR-1042-EX-WINDOW": null });
  check(sectionText(removed, "SEC-AGR-1042-EX-WINDOW") === null, "Removing the exception left the section in the bundle.");
  check(
    fingerprintDocuments(original) !== fingerprintDocuments(removed),
    "Removing the exception did not change the request fingerprint.",
  );
  check(
    !JSON.stringify(buildDecisionRequest(customer, exception, removed).state).includes("SEC-AGR-1042-EX-WINDOW"),
    "Removed section id is still in the model state.",
  );
  const otherEdit = "Notwithstanding the Refund Handbook, customer NS-CUST-2208 may request a refund within one hundred twenty (120) days after the purchase date. This amendment applies only to customer NS-CUST-2208. It does not apply to NS-CUST-1042.";
  const editedOther = applyEdits(original, { "SEC-AMD-2208-WINDOW": otherEdit });
  check(
    sectionText(editedOther, "SEC-AGR-1042-EX-WINDOW") === sectionText(original, "SEC-AGR-1042-EX-WINDOW"),
    "Editing Copperlane's clause changed Brightline's clause.",
  );
  check(
    fingerprintDocuments(original) !== fingerprintDocuments(editedOther),
    "Editing Copperlane's clause did not change the request.",
  );

  const otherCase = scenarioById(library, "other-customer-exception");
  const otherOriginal = assembleBundle(library, otherCase, "compact", "middle");
  const otherChanged = applyEdits(otherOriginal, { "SEC-AMD-2208-WINDOW": otherEdit });
  check(
    sectionText(otherChanged, "SEC-AGR-1042-STD-WINDOW") === sectionText(otherOriginal, "SEC-AGR-1042-STD-WINDOW"),
    "Editing another customer's exception changed Avery's standard window.",
  );

  for (const placement of ["beginning", "middle", "end"] as ExceptionPlacement[]) {
    const placed = assembleBundle(library, exception, "large", placement);
    const index = placed.findIndex((document) => document.id === "DOC-AGR-1042-EX");
    const expectedIndex =
      placement === "beginning" ? 0 : placement === "end" ? placed.length - 1 : Math.floor((placed.length - 1) / 2);
    check(index === expectedIndex, `Large bundle placement ${placement} put the agreement at ${index}, expected ${expectedIndex}.`);
  }
  const placementFingerprints = (["beginning", "middle", "end"] as ExceptionPlacement[]).map((placement) =>
    fingerprintDocuments(assembleBundle(library, exception, "large", placement)),
  );
  check(new Set(placementFingerprints).size === 3, "Placement did not change the large-bundle request.");

  check(
    library.extended.every(
      (document) =>
        document.customerId !== "NS-CUST-1042" ||
        (document.kind !== "agreement" && document.kind !== "amendment"),
    ),
    "The extended archive contains an active-looking agreement for Avery Chen.",
  );

  const largeDocuments = assembleBundle(library, exception, "large", "middle");
  const largeRequest = buildDecisionRequest(customer, exception, largeDocuments);
  const encoding = getEncoding("o200k_base");
  const estimatedTokens = encoding.encode(JSON.stringify(largeRequest)).length;
  check(
    estimatedTokens >= 50_000 && estimatedTokens <= 100_000,
    `Large-bundle local token estimate is ${estimatedTokens}, outside 50,000–100,000.`,
  );
  check(estimatedTokens < 393_216, "Large bundle exceeds the documented context limit.");
  check(estimateInputCostUsd(1_000_000) === INPUT_USD_PER_MILLION, "Cost formula drifted.");
  check(candidateSections(largeDocuments).length + 2 <= 255, "Large bundle exceeds the choice limit.");

  const liveRows: LiveRow[] = [];
  const key = process.env.SUBQ_API_KEY;
  if (!key) {
    console.log("Live validation pending: SUBQ_API_KEY is not set.");
  } else {
    for (const item of expected.cases) {
      for (let run = 1; run <= 3; run += 1) {
        liveRows.push(
          await runLive(library, item, "compact", "middle", {}, run, item.expectedAction, item.expectedGoverningSectionId, "none"),
        );
      }
    }
    const exceptionCase = expected.cases.find((item) => item.id === "purchase-45-agreement-exception");
    if (exceptionCase) {
      for (const placement of ["beginning", "middle", "end"] as ExceptionPlacement[]) {
        liveRows.push(
          await runLive(
            library,
            exceptionCase,
            "large",
            placement,
            {},
            1,
            exceptionCase.expectedAction,
            exceptionCase.expectedGoverningSectionId,
            "none",
          ),
        );
      }
      if (exceptionCase.afterRemovingApplicableException && exceptionCase.applicableExceptionSectionId) {
        liveRows.push(
          await runLive(
            library,
            exceptionCase,
            "compact",
            "middle",
            { [exceptionCase.applicableExceptionSectionId]: null },
            1,
            exceptionCase.afterRemovingApplicableException.expectedAction,
            exceptionCase.afterRemovingApplicableException.expectedGoverningSectionId,
            "remove-applicable-exception",
          ),
        );
        liveRows.push(
          await runLive(
            library,
            exceptionCase,
            "compact",
            "middle",
            { "SEC-AMD-2208-WINDOW": otherEdit },
            1,
            exceptionCase.expectedAction,
            exceptionCase.expectedGoverningSectionId,
            "edit-other-customer-exception",
          ),
        );
      }
    }
    const other = expected.cases.find((item) => item.id === "other-customer-exception");
    if (other) {
      liveRows.push(
        await runLive(
          library,
          other,
          "compact",
          "middle",
          { "SEC-AMD-2208-WINDOW": otherEdit },
          1,
          other.expectedAction,
          other.expectedGoverningSectionId,
          "edit-other-customer-exception",
        ),
      );
    }
  }

  const outputDir = path.join(root, "validation");
  fs.mkdirSync(outputDir, { recursive: true });
  const output = {
    evaluationDate: EVALUATION_DATE,
    localTokenEstimate: {
      encoding: "o200k_base",
      largeBundleRequestTokens: estimatedTokens,
      note: "Local estimate of the full decision request. The desk displays usage.input_tokens from SubQ when a live call succeeds.",
    },
    localFailures: failures,
    livePending: !key,
    liveRows,
  };
  fs.writeFileSync(path.join(outputDir, "latest-results.json"), JSON.stringify(output, null, 2));

  console.log(`Large-bundle local token estimate: ${estimatedTokens}`);
  if (liveRows.length > 0) {
    for (const row of liveRows) {
      const mark = row.actionMatch && row.sectionMatch ? "match" : "UNEXPECTED";
      console.log(
        `${mark} ${row.id} run ${row.run} ${row.bundle} ${row.placement} ${row.edit}: action ${row.action} (expected ${row.expectedAction}), section ${row.governingSectionId} (expected ${row.expectedGoverningSectionId}), ${row.providerRoundTripMs.toFixed(0)} ms, ${row.inputTokens ?? "no"} tokens`,
      );
    }
  }
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

async function runLive(
  library: ReturnType<typeof loadLibrary>,
  item: ExpectedCase,
  bundle: "compact" | "large",
  placement: ExceptionPlacement,
  edits: Record<string, string | null>,
  run: number,
  expectedAction: string,
  expectedSection: string,
  edit: string,
): Promise<LiveRow> {
  const scenario = scenarioById(library, item.id);
  const customer = customerById(library, scenario.customerId);
  const documents = applyEdits(assembleBundle(library, scenario, bundle, placement), edits);
  const payload = buildDecisionRequest(customer, scenario, documents);
  let attempt = await requestDecision(payload, documents);
  if (!attempt.ok && (attempt.status === 429 || attempt.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempt = await requestDecision(payload, documents);
  }
  if (!attempt.ok) {
    return {
      id: item.id,
      run,
      bundle,
      placement,
      edit,
      action: `error: ${attempt.error}`,
      expectedAction,
      governingSectionId: "error",
      expectedGoverningSectionId: expectedSection,
      actionMatch: false,
      sectionMatch: false,
      inputTokens: null,
      providerRoundTripMs: 0,
      estimatedInputCostUsd: null,
    };
  }
  return {
    id: item.id,
    run,
    bundle,
    placement,
    edit,
    action: attempt.result.action,
    expectedAction,
    governingSectionId: attempt.result.governingSection.id,
    expectedGoverningSectionId: expectedSection,
    actionMatch: attempt.result.action === expectedAction,
    sectionMatch: attempt.result.governingSection.id === expectedSection,
    inputTokens: attempt.result.inputTokens,
    providerRoundTripMs: attempt.result.providerRoundTripMs,
    estimatedInputCostUsd: attempt.result.estimatedInputCostUsd,
  };
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
