import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type Finding, type ScreenResult } from "@/lib/types";
import { findingVerdict, overallVerdict } from "@/lib/verdict";

function result(overrides: Partial<ScreenResult>): ScreenResult {
  return {
    itemId: "it-001",
    leafId: "3.3",
    applies: 0.95,
    complies: 0.95,
    severity: { level: "low", score: 0.1, probabilities: [0.9, 0.08, 0.02] },
    findings: [],
    read: { tokens: 212_000 },
    clausesCompared: 109,
    ...overrides,
  };
}

describe("findingVerdict", () => {
  // Live judgements from the whole-document scan of the four samples (October 2026).
  it("flags a clause that applies and is broken", () => {
    expect(findingVerdict({ applies: 0.972, complies: 0.017 }, DEFAULT_THRESHOLDS)).toBe("flagged"); // it-036 at 3.3
    expect(findingVerdict({ applies: 0.972, complies: 0.025 }, DEFAULT_THRESHOLDS)).toBe("flagged"); // it-287 at 9.12
  });

  it("clears a clause the item meets, and sends one in between to a person", () => {
    expect(findingVerdict({ applies: 0.967, complies: 0.941 }, DEFAULT_THRESHOLDS)).toBe("cleared"); // it-068 at 6.5
    expect(findingVerdict({ applies: 0.976, complies: 0.287 }, DEFAULT_THRESHOLDS)).toBe("review"); // it-251 at 4.5
  });

  it("never sends a clause Snap is not sure applies to a person on a middling compliance alone", () => {
    expect(findingVerdict({ applies: 0.256, complies: 0.933 }, DEFAULT_THRESHOLDS)).toBe("cleared"); // it-068 runner-up 6.10
    expect(findingVerdict({ applies: 0.148, complies: 0.654 }, DEFAULT_THRESHOLDS)).toBe("cleared"); // it-251 runner-up 4.7
    expect(findingVerdict({ applies: 0.6, complies: 0.4 }, DEFAULT_THRESHOLDS)).toBe("cleared");
  });

  it("sends a clause that looks broken but may not apply to a person, never to a flag", () => {
    expect(findingVerdict({ applies: 0.811, complies: 0.053 }, DEFAULT_THRESHOLDS)).toBe("review");
  });
});

describe("overallVerdict", () => {
  const finding = (leafId: string, found: number, applies: number, complies: number): Finding => ({
    leafId,
    found,
    applies,
    complies,
    severity: { level: "low", score: 0, probabilities: [1, 0, 0] },
  });
  const scanned = (findings: Finding[]) => result({ leafId: findings[0]?.leafId ?? null, applies: findings[0]?.applies ?? 0, complies: findings[0]?.complies ?? 0, findings });

  it("is flagged when any finding is", () => {
    expect(overallVerdict(scanned([finding("9.12", 0.861, 0.972, 0.025), finding("9.2", 0.074, 0.966, 0.017)]), DEFAULT_THRESHOLDS)).toBe("flagged");
    expect(overallVerdict(scanned([finding("a", 0.6, 0.97, 0.95), finding("b", 0.2, 0.95, 0.05)]), DEFAULT_THRESHOLDS)).toBe("flagged");
  });

  it("is review when no finding is flagged and one needs a person", () => {
    expect(overallVerdict(scanned([finding("4.5", 0.301, 0.976, 0.287)]), DEFAULT_THRESHOLDS)).toBe("review");
  });

  it("stays cleared when a runner-up's clause may not apply", () => {
    expect(overallVerdict(scanned([finding("6.5", 0.087, 0.967, 0.941), finding("6.10", 0.031, 0.256, 0.933), finding("x", 0.02, 0.5, 0.5)]), DEFAULT_THRESHOLDS)).toBe("cleared");
  });

  it("leaves it to a person when the read named no clause", () => {
    expect(overallVerdict(result({ leafId: null, findings: [] }), DEFAULT_THRESHOLDS)).toBe("review");
  });
});
