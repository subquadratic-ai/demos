import { describe, expect, it } from "vitest";
import { continues, fallbackTree, numberingLevel, summarise } from "@/lib/pageindex/build";
import { countLeaves } from "@/lib/rulebook/tree";

/** The indexer's pure helpers. Building a tree with Snap is tested live in tests/live/indexer.test.ts. */
describe("indexer helpers", () => {
  it("reads the outline level from heading numbering", () => {
    expect(numberingLevel("4. Payments")).toBe(0);
    expect(numberingLevel("Chapter 4 Payments")).toBe(0);
    expect(numberingLevel("4.2 Purchase orders")).toBe(1);
    expect(numberingLevel("4.2.1 Thresholds")).toBe(2);
    expect(numberingLevel("Purchase orders")).toBeUndefined();
  });

  it("knows which number continues an outline", () => {
    expect(continues(undefined, [1])).toBe(true);
    expect(continues([6], [7])).toBe(true);
    expect(continues([6], [6, 1])).toBe(true);
    expect(continues([6, 3], [6, 4])).toBe(true);
    expect(continues([6, 3], [7])).toBe(true);
    expect(continues([3, 2], [1])).toBe(false);
    expect(continues([6], [8])).toBe(false);
    expect(continues([6], [6, 2])).toBe(false);
  });

  it("summarises with the first sentence, clipped", () => {
    expect(summarise("First sentence. Second sentence.")).toBe("First sentence.");
    expect(summarise("x".repeat(400)).length).toBeLessThanOrEqual(180);
    expect(summarise("")).toBe("");
  });

  it("never returns an empty fallback tree", () => {
    expect(countLeaves(fallbackTree([], "Empty"))).toBe(1);
  });
});
