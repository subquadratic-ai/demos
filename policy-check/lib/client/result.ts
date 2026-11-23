import type { Evidence, ScreenResult, Thresholds, Verdict } from "@/lib/types";
import { findingVerdict } from "@/lib/verdict";

/**
 * What a result says, in the shapes the page shows it: the answer and the
 * clauses behind it.
 */

/** One clause the item was judged against, with its own verdict and Snap's picks from both sides. */
export interface ClauseVerdict {
  leafId: string;
  verdict: Verdict;
  evidence?: { item?: Evidence; clause?: Evidence };
}

/**
 * The clauses worth showing: every one the item contradicts or a person
 * should decide, flags first; with none of those, the one clause it best
 * meets. Empty when the read named no clause.
 */
export function clausesOf(result: ScreenResult, thresholds: Thresholds): ClauseVerdict[] {
  const judged = result.findings.map((finding) => ({ leafId: finding.leafId, verdict: findingVerdict(finding, thresholds), evidence: finding.evidence }));
  const open = judged.filter((clause) => clause.verdict !== "cleared");
  const flags = open.filter((clause) => clause.verdict === "flagged");
  return open.length > 0 ? [...flags, ...open.filter((clause) => clause.verdict === "review")] : judged.slice(0, 1);
}

/**
 * The answer to "Is this in policy?" in one word, and the clause it rests
 * on: the first clause it breaks (and how many more), the clause a person
 * should check, or the clause it meets.
 */
export function answerFor(verdict: Verdict, clauses: ClauseVerdict[]): { heading: string; detail: string } {
  const top = clauses[0];
  if (!top) return { heading: "Unclear", detail: "No clause fits it. A person should check." };
  if (verdict === "flagged") {
    const more = clauses.filter((clause) => clause.verdict === "flagged").length - 1;
    return { heading: "No", detail: `It breaks clause ${top.leafId}${more > 0 ? ` and ${more} more` : ""}` };
  }
  if (verdict === "review") return { heading: "Unclear", detail: `A person should check clause ${top.leafId}` };
  return { heading: "Yes", detail: `It meets clause ${top.leafId}` };
}
