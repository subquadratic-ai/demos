"use client";

import { motion } from "framer-motion";
import type { Verdict } from "@/lib/types";

export interface ConnectorProps {
  verdict: Verdict;
  /** The answer: "Yes", "No" or "Unclear". */
  heading: string;
  /** One short line under it, e.g. "It breaks clause 7.3". */
  detail?: string;
  /** Optional: seconds before the connector starts drawing. */
  delay?: number;
}

const HEADING_TEXT: Record<Verdict, string> = {
  flagged: "text-flagged",
  review: "text-review",
  cleared: "text-cleared",
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The link between the marked phrase and the clause that governs it: a dotted
 * line down from the card above, the verdict in a small pill, a dotted line on
 * to the clause below. Draws in sequence (line, pill, line) in about 0.7s.
 */
export function Connector({ verdict, heading, detail, delay = 0 }: ConnectorProps) {
  return (
    <div className="flex flex-col items-center">
      <Dot delay={delay} />
      <Line delay={delay + 0.04} />
      <motion.div
        className="rounded-md border border-line-strong bg-surface px-7 pt-3 pb-3.5 text-center shadow-[0_1px_2px_rgba(24,24,27,0.04),0_4px_14px_-6px_rgba(47,68,149,0.18)]"
        initial={{ opacity: 0, scale: 0.94, y: -3 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE, delay: delay + 0.22 }}
      >
        <p className={`font-display text-[52px] leading-[1.1] tracking-[-0.01em] ${HEADING_TEXT[verdict]}`}>{heading}</p>
        {detail && <p className="mt-1 text-[18px] leading-tight font-medium text-text sm:text-[20px]">{detail}</p>}
      </motion.div>
      <Line delay={delay + 0.42} />
      <Dot delay={delay + 0.62} />
    </div>
  );
}

/** Dotted vertical rule that grows downward. */
function Line({ delay }: { delay: number }) {
  return (
    <motion.span
      aria-hidden
      className="snap-dots block h-5 w-[3px] origin-top"
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1], delay }}
    />
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.span
      aria-hidden
      className="-my-[2px] block h-[5px] w-[5px] rounded-full bg-accent"
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16, ease: EASE, delay }}
    />
  );
}
