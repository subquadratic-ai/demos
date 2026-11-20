import { describe, expect, it } from "vitest";
import {
  buildHeadingRequest,
  buildJudgeRequest,
  buildSessionState,
  correctionLine,
  correctsItem,
  labelFor,
} from "@/lib/snap/questions";
import { segmentsOf } from "@/lib/snap/segments";
import { clauseOf, countWords, findNode, withClauseText } from "@/lib/rulebook/tree";
import { item, syntheticRulebook, syntheticTree } from "./helpers/tree";

const tree = syntheticTree();

describe("labels", () => {
  it("pads to two digits", () => {
    expect(labelFor(0)).toBe("i00");
    expect(labelFor(7)).toBe("i07");
    expect(labelFor(49)).toBe("i49");
  });
});

describe("buildSessionState", () => {
  it("names the rulebook without resending its outline, and appends corrections per leaf", () => {
    const state = buildSessionState(syntheticRulebook(), { "1.1.1": ["Our rate is guaranteed judged cleared by reviewer"] });
    expect(state.startsWith("## RULEBOOK Test Policy\n")).toBe(true);
    // Each NODE block carries the children a step needs; resending the whole outline would only add cost.
    expect(state).not.toContain("Certainty words");
    expect(state).toContain("## CORRECTIONS 1.1.1\nOur rate is guaranteed judged cleared by reviewer");
  });
});

describe("buildJudgeRequest", () => {
  it("asks applies, complies and a 3-level severity score per clause", () => {
    const leaf = findNode(tree, "1.1.1")!;
    const request = buildJudgeRequest([{ label: "i03", item: item("x", "Guaranteed returns"), leaf }]);
    // A one-sentence item has nothing to choose between, so only the clause gets an evidence question.
    expect(Object.keys(request.questions).sort()).toEqual(["i03.applies", "i03.complies", "i03.evidence.clause", "i03.severity"]);
    const severity = request.questions["i03.severity"];
    if (severity.type !== "score") throw new Error("expected score");
    expect(severity.criteria.length).toBeGreaterThanOrEqual(2);
    expect(severity.criteria.length).toBeLessThanOrEqual(10);
    expect(severity.criteria[0]).toMatch(/^low/);
    const applies = request.questions["i03.applies"];
    if (applies.type !== "noul") throw new Error("expected noul");
    expect(applies.criteria).toEqual({ true: expect.any(String), false: expect.any(String) });
    expect(applies.instructions).toContain("clause 1.1.1");
    expect(request.questions["i03.complies"].instructions).toMatch(/Judged only against clause 1.1.1/);
    expect(request.state).toContain("## CLAUSE 1.1.1\nCertainty words\nWords such as");
  });
});

describe("evidence questions", () => {
  const leaf = findNode(tree, "1.1.1")!;
  const ad = item("x", "Guaranteed 7% returns, every year. Open an account in minutes (no minimum balance).");

  it("ask a Choice per side whose options are the exact segments of the item and of the clause", () => {
    const request = buildJudgeRequest([{ label: "i03", item: ad, leaf }]);
    const itemQ = request.questions["i03.evidence.item"];
    const clauseQ = request.questions["i03.evidence.clause"];
    if (itemQ.type !== "choice" || clauseQ.type !== "choice") throw new Error("expected choices");
    expect(itemQ.criteria).toEqual({ s1: "Guaranteed 7% returns, every year.", s2: "Open an account in minutes", s3: "(no minimum balance)" });
    expect(Object.values(clauseQ.criteria)).toEqual(segmentsOf(clauseOf(leaf), "clause"));
    for (const text of Object.values(itemQ.criteria)) expect(ad.text).toContain(text);
    for (const text of Object.values(clauseQ.criteria)) expect(clauseOf(leaf)).toContain(text);
    expect(itemQ.instructions).toBe(
      "Which part of item i03 bears most directly on clause 1.1.1 (Certainty words)? " +
        "If the item breaches the clause, pick the words that breach it; otherwise pick the words that satisfy it. " +
        "Each option is quoted from item i03.",
    );
    expect(clauseQ.instructions).toBe(
      "Which requirement or prohibition in clause 1.1.1 (Certainty words) does the wording of item i03 most directly meet or break? " +
        "Pick the words that state the rule, not words that only say what the clause covers. " +
        "Each option is quoted from clause 1.1.1.",
    );
  });

  it("add no state, and leave the judgement questions as they were", () => {
    const short = item("x", "Guaranteed returns");
    const withEvidence = buildJudgeRequest([{ label: "i03", item: ad, leaf }]);
    const without = buildJudgeRequest([{ label: "i03", item: short, leaf }]);
    expect(withEvidence.state.match(/^## (CLAUSE|ITEM) /gm)).toHaveLength(2);
    expect(withEvidence.state).toBe(without.state.replace(short.text, ad.text));
    for (const key of ["i03.applies", "i03.complies", "i03.severity"]) expect(withEvidence.questions[key]).toEqual(without.questions[key]);
  });

  it("are asked per item and clause, and skipped for a text with one segment", () => {
    const other = findNode(tree, "1.1.2")!;
    const request = buildJudgeRequest([
      { label: "i00", item: ad, leaf },
      { label: "i01", item: ad, leaf: other },
    ]);
    expect(request.questions["i01.evidence.item"].instructions).toContain("Which part of item i01 bears most directly on clause 1.1.2");
    expect(request.questions["i01.evidence.clause"].instructions).toContain("does the wording of item i01 most");
    const stub = { ...leaf, text: "Guarantees are prohibited for variable products." };
    const single = buildJudgeRequest([{ label: "i00", item: item("y", "Guaranteed returns"), leaf: stub }]);
    expect(Object.keys(single.questions).filter((key) => key.includes(".evidence."))).toEqual([]);
  });
});

describe("reviewer corrections", () => {
  const leaf = findNode(tree, "1.1.1")!;
  const guaranteed = item("it-001", "Guaranteed 7% returns, risk-free.");

  it("quote the item, name the clause and the outcome, and are recognised as being about that item", () => {
    const line = correctionLine(guaranteed.text, "1.1.1", "cleared");
    expect(line).toBe('Reviewer decision: the item "Guaranteed 7% returns, risk-free." complies with clause 1.1.1. Treat it as cleared.');
    expect(correctionLine(guaranteed.text, "1.1.1", "flagged")).toContain("breaches clause 1.1.1");
    expect(correctsItem(line, guaranteed.text)).toBe(true);
    expect(correctsItem(line, "Something else")).toBe(false);
  });

  it("change the judge questions only for a clause that has one, so uncorrected checks are asked exactly as before", () => {
    const plain = buildJudgeRequest([{ label: "i00", item: guaranteed, leaf }]);
    expect(buildJudgeRequest([{ label: "i00", item: guaranteed, leaf }], undefined, { "9.9": ["x"] })).toEqual(plain);
    const corrected = buildJudgeRequest([{ label: "i00", item: guaranteed, leaf }], undefined, { "1.1.1": [correctionLine(guaranteed.text, "1.1.1", "cleared")] });
    expect(corrected.questions["i00.complies"].instructions).toContain("CORRECTIONS 1.1.1");
    expect(corrected.questions["i00.applies"].instructions).toContain("CORRECTIONS 1.1.1");
    expect(corrected.questions["i00.severity"]).toEqual(plain.questions["i00.severity"]);
    // A re-check after a reviewer's decision is asked as it was before evidence existed: no evidence choices.
    expect(Object.keys(plain.questions)).toContain("i00.evidence.clause");
    expect(Object.keys(corrected.questions).sort()).toEqual(["i00.applies", "i00.complies", "i00.severity"]);
  });
});

describe("buildHeadingRequest", () => {
  it("pairs a noul and a 3-level score per line", () => {
    const request = buildHeadingRequest([{ label: "i00", text: "3.4 Yield claims" }]);
    expect(request.questions["i00.is_heading"].type).toBe("noul");
    const level = request.questions["i00.level"];
    if (level.type !== "score") throw new Error("expected score");
    expect(level.criteria).toHaveLength(3);
    expect(request.state).toBe("## LINE i00\n3.4 Yield claims");
  });
});

describe("clauseOf", () => {
  it("returns the opening paragraph, not the procedure and examples that follow", () => {
    const clause = "Words such as 'guaranteed' are prohibited for any product whose return can vary. ".repeat(4).trim();
    const text = `${clause}\n\nProcedure. The owner records the status of each requirement.\n\nExample: a banner that says 'guaranteed 5%'.`;
    expect(clauseOf({ text, summary: "s" })).toBe(clause);
  });

  it("adds the next paragraph when the first is a stub, and caps very long clauses at a sentence end", () => {
    expect(clauseOf({ text: "Purpose.\n\nThis section applies to every email the Company sends to a customer or a prospect, in any market.", summary: "s" })).toBe(
      "Purpose.\n\nThis section applies to every email the Company sends to a customer or a prospect, in any market.",
    );
    const long = "Every claim is substantiated before publication. ".repeat(60);
    const capped = clauseOf({ text: long, summary: "s" });
    expect(capped.length).toBeLessThanOrEqual(1200);
    expect(capped.endsWith(".")).toBe(true);
  });

  it("falls back to the summary when a leaf has no text", () => {
    expect(clauseOf({ text: undefined, summary: "The summary." })).toBe("The summary.");
  });
});

describe("withClauseText", () => {
  it("cuts each leaf to its clause and keeps the full section's word count", () => {
    const leaf = { nodeId: "1.1", title: "T", summary: "s", pageStart: 1, pageEnd: 2, text: "The rule here.\n\nGuidance that follows it, in more words.", children: [] };
    const trimmed = withClauseText({ nodeId: "root", title: "R", summary: "r", pageStart: 1, pageEnd: 2, children: [leaf] });
    expect(trimmed.children[0].text).toBe(clauseOf(leaf));
    expect(trimmed.children[0].words).toBe(10);
    expect(countWords(" a  b\nc ")).toBe(3);
  });
});
