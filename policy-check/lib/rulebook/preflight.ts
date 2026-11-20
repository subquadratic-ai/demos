import { CONTEXT_SAFETY_FACTOR, TOKENS_PER_PAGE } from "@/lib/config";
import type { Preflight, PreflightWarning } from "@/lib/types";

/**
 * Cheap checks on an extracted document before the (slow) tree build starts,
 * so the UI can say "Found text on 288/288 pages · ~190K tokens · 112 headings"
 * within a second of the drop.
 */

/** A page counts as having a text layer when it carries more than a page number and a header. */
const MIN_TEXT_CHARS = 40;

/**
 * Lines that look like headings: numbered ("3.", "3.4", "3.4.1 Title"), Chapter/Part
 * labels, short ALL CAPS lines, or short Title Case lines without a terminal period.
 */
const NUMBERED_HEADING = /^(?:(?:chapter|part|section|article)\s+)?\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+[A-Za-z]/i;
const MARKDOWN_HEADING = /^#{1,4}\s+\S/;

export function isHeadingCandidate(rawLine: string): boolean {
  const line = rawLine.trim();
  if (line.length < 3 || line.length > 120) return false;
  if (MARKDOWN_HEADING.test(line) || NUMBERED_HEADING.test(line)) return true;
  if (/[.;:,]$/.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 12) return false;
  if (line === line.toUpperCase() && /[A-Z]{3,}/.test(line) && !/^\d+$/.test(line)) return true;
  const significant = words.filter((w) => w.length > 3 && /^[A-Za-z]/.test(w));
  if (significant.length < 2) return false;
  return significant.filter((w) => /^[A-Z]/.test(w)).length / significant.length >= 0.8;
}

export function countHeadingCandidates(pages: string[]): number {
  let count = 0;
  for (const page of pages) {
    for (const line of page.split("\n")) if (isHeadingCandidate(line)) count++;
  }
  return count;
}

export function preflight(pages: string[], contextTokens: number, elapsedMs: number): Preflight {
  const pagesWithText = pages.filter((page) => page.trim().length >= MIN_TEXT_CHARS).length;
  const tokens = pages.length * TOKENS_PER_PAGE;
  const headingCandidates = countHeadingCandidates(pages);
  const warnings: PreflightWarning[] = [];
  if (pages.length > 0 && pagesWithText === 0) warnings.push("no_text_layer");
  else if (pages.length > 0 && pagesWithText / pages.length < 0.9) warnings.push("partial_text_layer");
  if (headingCandidates < 10) warnings.push("few_headings");
  // A check reads the whole document in one request, so a book near the window may be refused at
  // check time (see lib/snap/scan.ts, which measures the real request); this warns at upload.
  if (tokens > contextTokens * CONTEXT_SAFETY_FACTOR) warnings.push("exceeds_context");
  return { pages: pages.length, pagesWithText, tokens, contextTokens, headingCandidates, warnings, elapsedMs };
}
