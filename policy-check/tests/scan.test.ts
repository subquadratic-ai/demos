import { describe, expect, it } from "vitest";
import { leavesOf, walk } from "@/lib/rulebook/tree";
import { buildReadRequest, correctionLine, documentBlock, NO_CONTRADICTION } from "@/lib/snap/questions";
import { estimateTokens, fitsWholeDocument, MAX_CANDIDATES, orderFindings, pickCandidates } from "@/lib/snap/scan";
import { DEFAULT_THRESHOLDS, type Finding, type Rulebook } from "@/lib/types";
import { getUseCase, readUseCaseJson } from "@/usecases";
import { item, syntheticTree } from "./helpers/tree";

const marketing = readUseCaseJson<Rulebook>(getUseCase("marketing"), "rulebook.json")!;
const leaves = leavesOf(marketing.tree);
const ids = leaves.map((leaf) => leaf.nodeId);

describe("documentBlock", () => {
  const block = documentBlock(marketing);

  it("names the rulebook, its owner and its length first", () => {
    expect(block.startsWith(`## RULEBOOK ${marketing.title} (${marketing.organisation}), ${marketing.pages} pages\n`)).toBe(true);
  });

  it("carries every clause heading, in document order", () => {
    const positions = leaves.map((leaf) => block.indexOf(`### CLAUSE ${leaf.nodeId} ${leaf.title} (pp. ${leaf.pageStart}-${leaf.pageEnd})\n`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(block.match(/^### CLAUSE /gm)).toHaveLength(leaves.length);
  });

  it("puts each chapter heading before its clauses", () => {
    for (const chapter of marketing.tree.children) {
      const heading = block.indexOf(`## CHAPTER ${chapter.nodeId} ${chapter.title}\n`);
      expect(heading).toBeGreaterThan(0);
      expect(heading).toBeLessThan(block.indexOf(`### CLAUSE ${leavesOf(chapter)[0].nodeId} `));
    }
  });

  it("includes every clause's full section, not just the clause, with nothing cut", () => {
    for (const leaf of leaves) expect(block.includes(`\n${leaf.text!.trim()}`), leaf.nodeId).toBe(true);
    const sectionWords = leaves.reduce((sum, leaf) => sum + leaf.text!.split(/\s+/).filter(Boolean).length, 0);
    expect(block.split(/\s+/).filter(Boolean).length).toBeGreaterThan(sectionWords);
    // The sample is a long document: ~176K words, ~212K tokens on the live API.
    expect(sectionWords).toBeGreaterThan(150_000);
  });

  it("labels deeper internal nodes as sections and falls back to the summary for a leaf without text", () => {
    const tree = syntheticTree();
    const bare = walk(tree).find((node) => node.nodeId === "2.2.2")!;
    delete bare.text;
    const small = documentBlock({ title: "Test Policy", organisation: "Acme", pages: 12, tree });
    expect(small).toContain("## CHAPTER 1 Claims");
    expect(small).toContain("## SECTION 1.1 Guarantees");
    expect(small).toContain(`### CLAUSE 2.2.2 Frequency (pp. 11-11)\n${bare.summary}`);
  });
});

describe("buildReadRequest", () => {
  it("asks two questions per item over the whole document, with the item last", () => {
    const ad = item("it-036", "Sublinear Save: guaranteed 5.2% returns. Open in four minutes.");
    const request = buildReadRequest(marketing, leaves, [{ label: "i00", item: ad }]);
    expect(Object.keys(request.questions)).toEqual(["i00.contradicts", "i00.evidence.item"]);
    const contradicts = request.questions["i00.contradicts"];
    expect(contradicts.type).toBe("choice");
    if (contradicts.type !== "choice") return;
    expect(Object.keys(contradicts.criteria)).toEqual([NO_CONTRADICTION, ...ids]);
    expect(contradicts.criteria["3.3"]).toMatch(/^Clause 3\.3: /);
    expect(request.state.startsWith(documentBlock(marketing))).toBe(true);
    expect(request.state.endsWith(`## ITEM i00 it-036\nkind: ad\n${ad.text}`)).toBe(true);
  });

  it("skips the item evidence when the item has one passage, and carries corrections after the document", () => {
    const one = item("x", "Guaranteed returns");
    const line = correctionLine(one.text, "3.3", "cleared");
    const request = buildReadRequest(marketing, leaves, [{ label: "i00", item: one }], { "3.3": [line], "4.1": [] });
    expect(Object.keys(request.questions)).toEqual(["i00.contradicts"]);
    expect(request.state).toContain(`## CORRECTIONS 3.3\n${line}`);
    expect(request.state).not.toContain("## CORRECTIONS 4.1");
    expect(request.state.indexOf("## CORRECTIONS 3.3")).toBeGreaterThan(request.state.indexOf("### CLAUSE 9.12"));
  });
});

describe("fitsWholeDocument", () => {
  const request = buildReadRequest(marketing, leaves, [{ label: "i00", item: item("a", "Guaranteed returns. Open now.") }]);

  it("estimates the sample above its 212K live count, and fits it in a 262K window", () => {
    const fit = fitsWholeDocument(request, leaves.length, 262_144);
    expect(fit.tokens).toBeGreaterThan(212_000);
    expect(fit.tokens).toBeLessThan(250_000);
    expect(fit.fits).toBe(true);
  });

  it("does not fit a smaller window, or more clauses than one Choice can offer", () => {
    expect(fitsWholeDocument(request, leaves.length, 200_000).fits).toBe(false);
    expect(fitsWholeDocument(request, 255, 1_000_000).fits).toBe(false);
    expect(estimateTokens("one two three four five six seven eight nine ten")).toBe(13);
  });
});

describe("pickCandidates", () => {
  // Read probabilities from the live API on the four samples (October 2026).
  const guaranteed = { "3.3": 0.874, "3.4": 0.035, "5.1": 0.022, "1.1": 0.006, none: 0.005, "1.2": 0.004 };
  const alert = { none: 0.779, "6.5": 0.087, "6.10": 0.031, "1.1": 0.009 };
  const payments = { "9.12": 0.861, "9.2": 0.074, none: 0.013, "9.1": 0.013, "8.1": 0.006 };
  const cashback = { none: 0.462, "4.5": 0.301, "5.5": 0.055, "1.1": 0.014 };

  it("judges the runners-up of a clear breach, up to the cap", () => {
    expect(pickCandidates(guaranteed, ids).map((c) => c.leafId)).toEqual(["3.3", "3.4", "5.1"]);
    expect(pickCandidates(payments, ids).map((c) => c.leafId)).toEqual(["9.12", "9.2"]);
    expect(pickCandidates(guaranteed, ids)).toHaveLength(MAX_CANDIDATES);
  });

  it("keeps the top clause even when none wins, and nothing that none beats", () => {
    expect(pickCandidates(alert, ids)).toEqual([{ leafId: "6.5", found: 0.087 }]);
    // Snap's judge flags the cashback ad under 5.5 (credit warnings), but the read rated it far below "none".
    expect(pickCandidates(cashback, ids).map((c) => c.leafId)).toEqual(["4.5"]);
  });

  it("always judges a clause a reviewer ruled on, and ignores ids that are not clauses", () => {
    expect(pickCandidates(alert, ids, ["9.12"]).map((c) => c.leafId)).toEqual(["6.5", "9.12"]);
    expect(pickCandidates(alert, ids, ["6.5", "nope"]).map((c) => c.leafId)).toEqual(["6.5"]);
    expect(pickCandidates({}, ids)).toEqual([]);
  });
});

describe("orderFindings", () => {
  const finding = (leafId: string, found: number, applies: number, complies: number): Finding => ({
    leafId,
    found,
    applies,
    complies,
    severity: { level: "low", score: 0, probabilities: [1, 0, 0] },
  });

  it("puts flags first, then findings for a person, then clears, each by how strongly the read pointed", () => {
    const ordered = orderFindings(
      [finding("a", 0.6, 0.97, 0.95), finding("b", 0.1, 0.97, 0.5), finding("c", 0.05, 0.97, 0.02), finding("d", 0.2, 0.97, 0.03)],
      DEFAULT_THRESHOLDS,
    );
    expect(ordered.map((f) => f.leafId)).toEqual(["d", "c", "b", "a"]);
  });
});
