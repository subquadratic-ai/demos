import { describe, expect, it } from "vitest";
import { TOKENS_PER_PAGE } from "@/lib/config";
import { isHeadingCandidate, preflight } from "@/lib/rulebook/preflight";

const prose = "The policy applies to every communication the Company publishes, in any channel, to any audience. ".repeat(6);

function pagesWithHeadings(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${i + 1}. Section ${i + 1}\n${prose}\n${i + 1}.1 Subsection\n${prose}`);
}

describe("isHeadingCandidate", () => {
  it("accepts numbered, markdown, caps and title-case lines", () => {
    expect(isHeadingCandidate("3.4 Yield and interest-rate claims")).toBe(true);
    expect(isHeadingCandidate("## Approval workflow")).toBe(true);
    expect(isHeadingCandidate("DEFINITIONS")).toBe(true);
    expect(isHeadingCandidate("Approval and Review Workflow")).toBe(true);
  });

  it("rejects sentences, numbers and long lines", () => {
    expect(isHeadingCandidate("The policy applies to every communication.")).toBe(false);
    expect(isHeadingCandidate("42")).toBe(false);
    expect(isHeadingCandidate("this is a lower case line with many words in it that goes on")).toBe(false);
  });
});

describe("preflight", () => {
  it("estimates tokens and counts headings", () => {
    const result = preflight(pagesWithHeadings(12), 262_144, 420);
    expect(result.pages).toBe(12);
    expect(result.pagesWithText).toBe(12);
    expect(result.tokens).toBe(12 * TOKENS_PER_PAGE);
    expect(result.headingCandidates).toBe(24);
    expect(result.warnings).toEqual([]);
    expect(result.elapsedMs).toBe(420);
    expect(result.contextTokens).toBe(262_144);
  });

  it("warns about a missing or partial text layer", () => {
    expect(preflight(["", "", ""], 262_144, 0).warnings).toContain("no_text_layer");
    const partial = [...pagesWithHeadings(8), "", ""];
    expect(preflight(partial, 262_144, 0).warnings).toContain("partial_text_layer");
  });

  it("warns about few headings and exceeding the context window", () => {
    const flat = Array.from({ length: 400 }, () => prose);
    const result = preflight(flat, 262_144, 0);
    expect(result.warnings).toContain("few_headings");
    expect(result.warnings).toContain("exceeds_context");
    expect(preflight(pagesWithHeadings(300), 262_144, 0).warnings).not.toContain("exceeds_context");
  });
});
