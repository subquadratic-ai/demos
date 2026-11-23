import type { Finding, ScreenResult, Thresholds, Verdict } from "./types";

/**
 * Verdicts are arithmetic over Snap's probabilities, never a Snap question.
 * Thresholds are plain numbers (DEFAULT_THRESHOLDS), so this runs anywhere, client included.
 */

/**
 * Whole-document mode: one finding's verdict, judged against its own clause.
 *
 *   - complies >= clearAbove                          -> cleared
 *   - applies >= appliesAbove and complies <= flagBelow -> flagged
 *   - applies >= appliesAbove, anything in between      -> review
 *   - applies <  appliesAbove and complies <= flagBelow -> review (looks broken, may not apply)
 *   - applies <  appliesAbove, anything else            -> cleared
 *
 * The last line is what sets it apart from verdictFor. The read hands the
 * judge clauses it only suspects; one Snap is not sure governs the item, and
 * that the item does not clearly break, is not a contradiction, so it never
 * turns a clean item into "review" on a middling compliance alone. Live, the
 * clean security alert's runner-up 6.10 came back applies 0.26, complies 0.93.
 */
export function findingVerdict(finding: Pick<Finding, "applies" | "complies">, thresholds: Thresholds): Verdict {
  if (finding.complies >= thresholds.clearAbove) return "cleared";
  if (finding.applies < thresholds.appliesAbove) return finding.complies <= thresholds.flagBelow ? "review" : "cleared";
  return finding.complies <= thresholds.flagBelow ? "flagged" : "review";
}

const SERIOUSNESS: Record<Verdict, number> = { flagged: 2, review: 1, cleared: 0 };

/**
 * The answer for a result. In whole-document mode, the most serious finding
 * decides: flagged if any finding is, else review if any is, else cleared.
 * Which clauses get judged at all is the read's call (pickCandidates in
 * lib/snap/scan.ts: its top clause, and runners-up only when it rated them
 * likelier than "no contradiction"), so every finding is one worth counting.
 * The engine orders findings most serious first, so findings[0], which the
 * result's leafId mirrors, always carries this verdict. A read that named
 * no clause at all leaves it to a person.
 */
export function overallVerdict(result: ScreenResult, thresholds: Thresholds): Verdict {
  if (result.findings.length === 0) return "review";
  return result.findings
    .map((finding) => findingVerdict(finding, thresholds))
    .reduce((worst, verdict) => (SERIOUSNESS[verdict] > SERIOUSNESS[worst] ? verdict : worst), "cleared" as Verdict);
}
