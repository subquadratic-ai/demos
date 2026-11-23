"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Connector } from "@/components/check/Connector";
import { Highlighted } from "@/components/check/Highlighted";
import { Button } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatCount, formatPages, formatSeconds } from "@/lib/client/format";
import { answerFor, clausesOf } from "@/lib/client/result";
import { useStore } from "@/lib/client/store";
import { clauseOf, findNode } from "@/lib/rulebook/tree";
import type { ScreenResult, TreeNode } from "@/lib/types";
import { overallVerdict } from "@/lib/verdict";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
});

/**
 * Under the item card: the answer (yes, no or unclear) and the clause it
 * rests on, quoted word for word with Snap's pick marked, then the numbers:
 * pages read, clauses compared, requests, tokens read and time to decide.
 */
export function Result({ itemId, result }: { itemId: string; result: ScreenResult }) {
  const root = useStore((state) => state.rulebook?.tree);
  const thresholds = useStore((state) => state.thresholds);
  const cost = useStore((state) => state.costs[itemId]);
  const pages = useStore((state) => state.rulebook?.pages ?? 0);
  const verdict = overallVerdict(result, thresholds);
  const clauses = clausesOf(result, thresholds);
  const top = clauses[0];
  const leaf = top && root ? findNode(root, top.leafId) : undefined;
  const answer = answerFor(verdict, clauses);

  const stats: [string, string][] = [
    [formatCount(pages), "pages read"],
    [formatCount(result.clausesCompared), "clauses compared"],
    [cost ? formatCount(cost.requests) : "–", cost?.requests === 1 ? "request" : "requests"],
    [cost ? formatCount(cost.inputTokens + cost.outputTokens) : "–", "tokens"],
    [result.decisionMs !== undefined ? formatSeconds(result.decisionMs) : "–", "to decide"],
  ];

  return (
    <div>
      <Connector verdict={verdict} heading={answer.heading} detail={answer.detail} />

      {leaf && (
        <motion.div {...rise(0.45)}>
          <ClauseCard leaf={leaf} phrase={top?.evidence?.clause?.text} />
        </motion.div>
      )}

      <motion.dl {...rise(leaf ? 0.7 : 0.45)} className="mt-5 grid grid-cols-3 gap-y-4 px-1 sm:grid-cols-5">
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse justify-end">
            <dt className="mt-1 text-[13px] text-text-3">{label}</dt>
            <dd className="text-[26px] leading-none font-semibold tracking-[-0.01em] text-text tabular-nums">{value}</dd>
          </div>
        ))}
      </motion.dl>
    </div>
  );
}

/** The clause, word for word from the policy, so the verdict can be checked against the source. */
function ClauseCard({ leaf, phrase }: { leaf: TreeNode; phrase?: string }) {
  const policy = useStore((state) => state.rulebook?.title ?? "Policy");
  const [open, setOpen] = useState(false);

  return (
    <figure className="rounded-md border border-line bg-surface">
      <figcaption className="flex min-h-9 flex-wrap items-baseline gap-x-1.5 px-4 pt-2.5">
        <span className="self-center">
          <DocIcon />
        </span>
        <span className="text-[12.5px] font-medium text-text">{policy}</span>
        <span className="text-[12px] text-text-3">
          · clause {leaf.nodeId}, {formatPages(leaf.pageStart, leaf.pageEnd)}
        </span>
      </figcaption>
      <blockquote className="px-4 pt-2 pb-1 font-display text-[15.5px] leading-[1.6] whitespace-pre-line text-text">
        “<Highlighted text={clauseOf(leaf)} phrase={phrase} delay={0.9} />”
      </blockquote>
      <div className="px-4 pb-3">
        <Button variant="quiet" className="text-[12.5px]" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? "Hide the rest of the section" : "Read the whole section"}
        </Button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <Section node={leaf} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </figure>
  );
}

/** Sections already fetched this visit, by rulebook and clause. */
const sections = new Map<string, string>();

/**
 * The rest of the clause's section, as many pages as its range says: the
 * procedures, guidance and examples that follow the rule in the policy.
 * Fetched once per visit; scrolls in place.
 */
function Section({ node }: { node: TreeNode }) {
  const rulebookId = useStore((state) => state.rulebook?.id ?? "");
  const key = `${rulebookId}:${node.nodeId}`;
  const [loaded, setLoaded] = useState<{ key: string; text?: string; failed?: boolean } | null>(null);
  const cached = sections.get(key);

  useEffect(() => {
    if (cached !== undefined || !rulebookId) return;
    let live = true;
    api
      .section(rulebookId, node.nodeId)
      .then(({ text }) => {
        sections.set(key, text);
        if (live) setLoaded({ key, text });
      })
      .catch(() => live && setLoaded({ key, failed: true }));
    return () => {
      live = false;
    };
  }, [cached, key, node.nodeId, rulebookId]);

  const mine = loaded?.key === key ? loaded : null;
  const text = cached ?? mine?.text;
  // The rule itself is quoted above; show what follows it.
  const rule = clauseOf(node);
  const rest = text === undefined ? "" : text.startsWith(rule) ? text.slice(rule.length).trim() : text;
  const words = text?.split(/\s+/).filter(Boolean).length;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {rest && (
        <div className="max-h-[24rem] overflow-y-auto pr-3">
          {rest.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-text-2 first:mt-0">
              {paragraph}
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] text-text-3">
        {text === undefined
          ? mine?.failed
            ? "Could not load the rest of this section."
            : "Loading the rest of the section…"
          : `Whole section · ${formatPages(node.pageStart, node.pageEnd)} · ${words?.toLocaleString("en-US")} words`}
      </p>
    </div>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" className="shrink-0 text-text-3" aria-hidden>
      <path d="M3 1.5h5.2L11 4.3v8.2H3z" strokeLinejoin="round" />
      <path d="M8 1.5v3h3M5 7h4M5 9.3h4" />
    </svg>
  );
}
