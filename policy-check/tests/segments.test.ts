import { describe, expect, it } from "vitest";
import { clauseOf, findNode, leavesOf } from "@/lib/rulebook/tree";
import { MAX_SEGMENTS, segmentsOf } from "@/lib/snap/segments";
import type { Rulebook, Sample } from "@/lib/types";
import { getUseCase, readUseCaseJson } from "@/usecases";

/** The evidence Choices pick from these segments; the page highlights the pick with indexOf, so every one must be verbatim. */

const marketing = getUseCase("marketing");
const rulebook = readUseCaseJson<Rulebook>(marketing, "rulebook.json")!;
const samples = readUseCaseJson<Sample[]>(marketing, "samples.json")!;
const clause = (id: string) => clauseOf(findNode(rulebook.tree, id)!);
const words = (segment: string) => segment.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function expectVerbatim(text: string, segments: string[]) {
  expect(segments.length).toBeGreaterThan(0);
  expect(segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  expect(new Set(segments).size).toBe(segments.length);
  for (const segment of segments) {
    expect(text.indexOf(segment)).toBeGreaterThanOrEqual(0);
    expect(segment).toBe(segment.trim());
  }
}

describe("segmentsOf, item", () => {
  it("returns exact substrings for every sample", () => {
    for (const sample of samples) expectVerbatim(sample.text, segmentsOf(sample.text, "item"));
  });

  it("cuts an ad into its sentences", () => {
    expect(segmentsOf(samples.find((s) => s.id === "it-036")!.text, "item")).toEqual([
      "Sublinear Save: guaranteed 5.2% returns, whatever the market does.",
      "Open in four minutes, no minimum balance, withdraw whenever you like.",
    ]);
  });

  it("cuts an email at its lines and sentences", () => {
    const segments = segmentsOf(samples.find((s) => s.id === "it-068")!.text, "item");
    expect(segments[0]).toBe("Subject: Security alert: password changed");
    expect(segments).toContain("If you made this change, you can ignore this email.");
    expect(segments.at(-1)).toBe("This is a service message about your account.");
  });

  it("gives each ' · ' field and each parenthesised span of a ledger line its own segment, without cutting at an initial", () => {
    const segments = segmentsOf(samples.find((s) => s.id === "it-287")!.text, "item");
    expect(segments).toContain("$9,900.00 × 3");
    expect(segments).toContain("(same day, same vendor)");
    expect(segments).toContain("Approver: D. Reyes");
    expect(segments).toContain("(manager, limit $10,000)");
    expect(segments).toContain('Memo: "Q2 branch brochures, batches A–C"');
  });

  it("keeps a parenthesised aside whole, sentence and all", () => {
    const post = "Finally moved my emergency fund to Sublinear Save. 4.3%, took me four minutes. Link in bio!  (Paid post: Sublinear is paying me for this series.)";
    const segments = segmentsOf(post, "item");
    expectVerbatim(post, segments);
    expect(segments).toEqual([
      "Finally moved my emergency fund to Sublinear Save.",
      "4.3%, took me four minutes.",
      "Link in bio!",
      "(Paid post: Sublinear is paying me for this series.)",
    ]);
  });

  it("merges the shortest neighbours to stay within the cap", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} says something.`).join("\n");
    const segments = segmentsOf(long, "item");
    expect(segments).toHaveLength(MAX_SEGMENTS);
    expectVerbatim(long, segments);
  });

  it("returns nothing for text with no words", () => {
    expect(segmentsOf("  \n · ", "item")).toEqual([]);
  });
});

describe("segmentsOf, clause", () => {
  it("returns exact substrings of every clause in the rulebook, each at least three words", () => {
    for (const leaf of leavesOf(rulebook.tree)) {
      const text = clauseOf(leaf);
      const segments = segmentsOf(text, "clause");
      expectVerbatim(text, segments);
      expect(segments.length).toBeGreaterThanOrEqual(2);
      for (const segment of segments) expect(words(segment)).toBeGreaterThanOrEqual(3);
    }
  });

  it("cuts at a comma that opens a new phrase, not at the commas of a list", () => {
    expect(segmentsOf(clause("3.3"), "clause")).toEqual([
      "Words such as 'guaranteed', 'risk-free', 'can't lose' or 'certain' are prohibited for any product whose return, rate or value can vary.",
      "This covers Sublinear Invest, the variable rate on Sublinear Save and any currency transfer through Sublinear FX",
      "where the rate moves until the transfer is executed.",
      "The prohibition extends to imagery and metaphors that convey certainty, such as a padlock placed over a return figure.",
      "'Guaranteed' may describe a contractual feature of a fixed-term product",
      "only when the guarantee is unconditional and the guarantor is named.",
    ]);
    expect(segmentsOf(clause("7.3"), "clause").slice(0, 2)).toEqual([
      "Every paid, gifted or incentivised post carries '#ad' or the platform's paid-partnership label at the start of the post",
      "in every post of a series.",
    ]);
  });

  it("cuts at a semicolon, and keeps an aside inside its sentence", () => {
    expect(segmentsOf(clause("4.1"), "clause")).toContain("for Sublinear Card it includes the annual fee and foreign transaction charges.");
    // ", or anyone acting on its behalf," is an aside, not a second clause.
    expect(segmentsOf(clause("1.1"), "clause")[0]).toBe(
      "This policy applies to every communication that Sublinear Financial, or anyone acting on its behalf, publishes to customers, prospects or the public, in any channel.",
    );
  });

  it("halves an over-long sentence at its last ', and'", () => {
    expect(segmentsOf(clause("9.3"), "clause").slice(0, 2)).toEqual([
      "Gifts or hospitality offered to a customer or prospect are capped at $150 per person per year",
      "and nothing of value is ever given to a public official.",
    ]);
  });
});
