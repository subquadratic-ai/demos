"use client";

import { useMemo } from "react";
import { formatCount } from "@/lib/client/format";
import { useStore } from "@/lib/client/store";
import { leavesOf } from "@/lib/rulebook/tree";
import type { TreeNode } from "@/lib/types";

/**
 * The left column: the policy's name, and how heavy it is in three big
 * numbers, because the point is how much is read. Nothing else competes
 * with the check beside it.
 */
export function Sidebar() {
  const rulebook = useStore((state) => state.rulebook);
  const words = useMemo(() => (rulebook ? wordsIn(rulebook.tree) : 0), [rulebook]);

  return (
    <aside className="pt-10 pb-8 lg:py-0" aria-label="Policy">
      <h1 className="text-[34px] leading-[1.05] sm:text-[38px]">{rulebook?.title ?? "Is this in policy?"}</h1>
      {rulebook ? (
        <Weight pages={rulebook.pages} words={words} tokens={words > 0 ? words * TOKENS_PER_WORD : rulebook.preflight?.tokens} />
      ) : (
        <p className="mt-8 text-[14px] text-text-2">
          This use case has no rulebook yet. Run <code className="font-data text-text">npm run index -- &lt;document&gt; --usecase &lt;id&gt;</code> and reload.
        </p>
      )}
    </aside>
  );
}

/** How heavy the policy is, in numbers rather than text: pages, words and tokens. */
function Weight({ pages, words, tokens }: { pages: number; words: number; tokens: number | undefined }) {
  const stats: [string, string][] = [[formatCount(pages), pages === 1 ? "page" : "pages"]];
  if (words > 0) stats.push([abbreviate(words), "words"]);
  if (tokens) stats.push([`~${abbreviate(tokens)}`, "tokens"]);
  return (
    <dl className="mt-8 flex gap-8 lg:mt-12 lg:flex-col lg:gap-7">
      {stats.map(([value, label]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="mt-1.5 text-[15px] text-text-2 lg:text-[18px]">{label}</dt>
          <dd className="text-[36px] leading-none font-semibold tracking-[-0.03em] text-text tabular-nums lg:text-[64px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tokens per word of policy prose, as Snap counts them: 212K tokens for the 176K words of the 380-page sample. */
const TOKENS_PER_WORD = 1.2;

/** Every leaf's section, in words. */
function wordsIn(root: TreeNode): number {
  return leavesOf(root).reduce((sum, leaf) => sum + (leaf.words ?? 0), 0);
}

/** "132K", "1.2M"; exact below a thousand. */
function abbreviate(count: number): string {
  if (count < 1000) return formatCount(count);
  if (count < 1_000_000) return `${Math.round(count / 1000)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
