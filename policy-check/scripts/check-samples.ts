/**
 * Screens a use case's samples against the live Snap API and checks each
 * verdict against the group it was written for, so a sample that drifts is
 * caught before a demo. Run it after changing the samples, the questions or
 * the rulebook:
 *
 *   npm run check-samples                    (every sample of USE_CASE; reads SNAP_API_KEY etc. from .env.local)
 *   npm run check-samples -- it-346 it-142   (just these)
 *   npm run check-samples -- --usecase hr    (another use case)
 *
 * Each sample is screened on its own, exactly as the page does: the whole document read in one
 * request, then each clause it points at judged on its own (lib/snap/scan.ts). Samples run one
 * after another so the times printed are the ones a visitor sees. Exits non-zero if any sample's
 * verdict does not match its group, or, when the sample names its clause, lands elsewhere: a flag
 * must have that clause among its flagged findings; a clear or a review must have it on top.
 * Writes nothing.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "@/lib/config";
import { createSnapClient } from "@/lib/snap/client";
import { scanDocument } from "@/lib/snap/scan";
import { DEFAULT_THRESHOLDS, type Rulebook, type Sample, type SampleGroup, type ScreenResponse, type ScreenResult, type Verdict } from "@/lib/types";
import { findingVerdict, overallVerdict } from "@/lib/verdict";
import { getUseCase, readUseCaseJson } from "@/usecases";

export const EXPECTED: Record<SampleGroup, Verdict> = { flags: "flagged", clears: "cleared", review: "review" };

async function main(): Promise<void> {
  const config = getConfig();
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--usecase");
  const useCase = getUseCase(flag >= 0 ? argv[flag + 1] : config.useCase);
  const rulebook = readUseCaseJson<Rulebook>(useCase, "rulebook.json");
  if (!rulebook) throw new Error(`usecases/${useCase.id} has no rulebook.json yet: npm run index -- <document> --usecase ${useCase.id}`);
  const all = readUseCaseJson<Sample[]>(useCase, "samples.json") ?? [];
  if (all.length === 0) throw new Error(`usecases/${useCase.id}/samples.json has no samples to check.`);
  const only = new Set(argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--usecase"));
  const unknown = [...only].filter((id) => !all.some((sample) => sample.id === id));
  if (unknown.length > 0) throw new Error(`Not in usecases/${useCase.id}/samples.json: ${unknown.join(", ")}`);
  const samples = only.size > 0 ? all.filter((sample) => only.has(sample.id)) : all;
  const client = createSnapClient(config);

  const drifted: string[] = [];
  let tokens = 0;
  let requests = 0;
  for (const sample of samples) {
    const { group, hook, clause, ...item } = sample;
    void hook;
    const started = performance.now();
    const response: ScreenResponse = await scanDocument({
      rulebook,
      items: [item],
      thresholds: DEFAULT_THRESHOLDS,
      corrections: {},
      client,
      severity: useCase.severity,
      contextTokens: config.snapContextTokens,
    });
    const wall = performance.now() - started;
    const result = response.results[0];
    tokens += response.inputTokens;
    requests += response.requests;
    const verdict = overallVerdict(result, DEFAULT_THRESHOLDS);
    const landed = landsAt(result, verdict, clause);
    const ok = verdict === EXPECTED[group] && landed;
    if (!ok) drifted.push(`${sample.id} (${group}${clause ? ` at ${clause}` : ""}) came back ${verdict} at ${result.leafId ?? "—"}`);
    const timing = `read ${secs(result.read?.ms)} + judge ${secs(result.judgeMs)} = ${secs(result.decisionMs)} (wall ${secs(wall)})`;
    console.log(`${ok ? " " : "!"} ${sample.id} ${verdict.padEnd(8)} at ${result.leafId ?? "—"}  ${hook}`);
    console.log(`    ${describe(result)}`);
    console.log(`    ${timing} · ${response.requests} requests · ${Math.round(response.inputTokens / 1000)}K tokens (read ${Math.round((result.read?.tokens ?? 0) / 1000)}K)`);
  }

  console.log(`\nChecked ${samples.length} ${useCase.id} samples with ${config.snapModel} · ${requests} requests · ~${Math.round(tokens / 1000)}K input tokens.`);
  if (drifted.length > 0) {
    console.error(`\n${drifted.length} sample(s) no longer match their group:\n  ${drifted.join("\n  ")}`);
    process.exitCode = 1;
  }
}

/** Where the verdict must rest: a flag among its flagged findings, a clear or a review on its top clause. */
function landsAt(result: ScreenResult, verdict: Verdict, clause: string | undefined): boolean {
  if (!clause) return true;
  if (verdict === "flagged") {
    return result.findings.some((finding) => finding.leafId === clause && findingVerdict(finding, DEFAULT_THRESHOLDS) === "flagged");
  }
  return result.leafId === clause;
}

function describe(result: ScreenResult): string {
  return result.findings
    .map((f) => `${f.leafId} ${findingVerdict(f, DEFAULT_THRESHOLDS)} (found ${f.found.toFixed(3)}, applies ${f.applies.toFixed(2)}, complies ${f.complies.toFixed(2)})`)
    .join(" · ");
}

function secs(ms: number | undefined): string {
  return ms === undefined ? "—" : `${(ms / 1000).toFixed(2)}s`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
