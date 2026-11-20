"use client";

import { formatCount, formatPages } from "@/lib/client/format";
import { clauseOf } from "@/lib/rulebook/tree";
import type { TreeNode } from "@/lib/types";

/** A full page of the policy, in words; a page with this many fills the sheet. */
const FULL_PAGE_WORDS = 480;
const MAX_LINES = 26;

/**
 * A page of the book as a thumbnail, beside its tile while the pointer is
 * over it: which clause it belongs to and how many words that clause runs
 * to, with the page drawn as grey lines as dense as the text really is.
 * Nothing to read but the one line on top; a click pins the card and shows
 * the clause's rule in its first sentence.
 */
export function PageCard({ page, leaf, pinned }: { page: number; leaf: TreeNode | undefined; pinned: boolean }) {
  const span = leaf ? Math.max(1, leaf.pageEnd - leaf.pageStart + 1) : 1;
  const perPage = leaf?.words ? leaf.words / span : FULL_PAGE_WORDS * 0.3;
  const lines = Math.max(3, Math.min(MAX_LINES, Math.round((perPage / FULL_PAGE_WORDS) * MAX_LINES)));
  const rule = leaf && pinned ? firstSentence(clauseOf(leaf)) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3.5 pt-3 pb-2.5">
        <p className="flex items-baseline gap-1.5 text-[12px]">
          <span className="font-semibold whitespace-nowrap text-text tabular-nums">p. {page}</span>
          <span className="min-w-0 truncate text-text-2">{leaf ? `Clause ${leaf.nodeId} ${leaf.title}` : "Front matter"}</span>
        </p>
        {leaf && (
          <p className="mt-0.5 text-[11.5px] text-text-3 tabular-nums">
            {formatPages(leaf.pageStart, leaf.pageEnd)}
            {leaf.words ? ` · ${formatCount(leaf.words)} words` : ""}
          </p>
        )}
      </div>
      <div className="mx-3.5 mb-3.5 min-h-0 flex-1 overflow-hidden rounded-[3px] border border-line bg-bg/40 px-3 py-3">
        {rule && (
          <p className="mb-2.5 font-display text-[13px] leading-[1.5] text-text">
            <mark className="snap-mark">{rule}</mark>
          </p>
        )}
        <Lines count={rule ? Math.max(2, lines - 6) : lines} seed={page} />
      </div>
    </div>
  );
}

/** Greyed-out lines standing in for text: ragged right edges, a short line to end each paragraph. */
function Lines({ count, seed }: { count: number; seed: number }) {
  return (
    <div className="flex flex-col gap-[5px]" aria-hidden>
      {Array.from({ length: count }, (_, index) => {
        const endsParagraph = index % 6 === 5 || index === count - 1;
        const width = endsParagraph ? 30 + jitter(seed, index) * 35 : 86 + jitter(seed, index) * 14;
        return <span key={index} className={`block h-[4px] rounded-full bg-tile-edge ${endsParagraph ? "mb-[5px]" : ""}`} style={{ width: `${width}%` }} />;
      })}
    </div>
  );
}

/** A stable 0–1 value per page and line, so a page looks the same every time it is hovered. */
function jitter(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The rule as its opening sentence; the clause can run on with scope and exceptions. */
function firstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?[.!?](?=\s+[A-Z"'(]|$)/);
  return (match ? match[0] : text).trim();
}
