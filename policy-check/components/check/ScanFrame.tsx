"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatCount, formatSeconds } from "@/lib/client/format";

export interface ScanFrameProps {
  /** True from Check until the result is in place; the frame draws in, then lets go. */
  active: boolean;
  /** Left tab, e.g. "380 pages · 1 request". */
  tab: string;
  /** Right pill: elapsed seconds while waiting, then Snap's decision time. Null hides it. */
  ms: number | null;
  /**
   * Optional: the time in `ms` is Snap's final answer, so the pill turns solid.
   * Defaults to `!active` (outlined while the frame is up, solid once it lets go).
   */
  done?: boolean;
  /** Tokens the check used, shown beside the time once the answer is in. */
  tokens?: number | null;
  children: ReactNode;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The navy frame around a check while Snap works. It traces itself clockwise from the
 * top-left, carries a tab saying what is read and a stopwatch pill on its top edge, and
 * fades out when the check is over. The padding never changes, so the
 * children stay exactly where they are whether the frame is drawn or not.
 */
export function ScanFrame({ active, tab, ms, done, tokens = null, children }: ScanFrameProps) {
  const solid = done ?? !active;

  return (
    <div className="relative px-3.5 pt-[22px] pb-3.5">
      <AnimatePresence>
        {active && (
          <motion.div
            key="frame"
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.32, ease: "easeOut" } }}
          >
            <svg className="absolute inset-0 h-full w-full overflow-visible" fill="none">
              <motion.rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                rx="8"
                stroke="var(--accent)"
                strokeWidth="1.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, ease: [0.45, 0, 0.25, 1] }}
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && (
          <motion.div
            key="tab"
            className="absolute top-0 left-3 flex h-[22px] -translate-y-1/2 items-center rounded-[4px] bg-accent px-2 text-white"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.24 } }}
          >
            <span className="text-[11.5px] leading-none font-semibold whitespace-nowrap">{tab}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ms !== null && (
          <motion.div
            key="clock"
            className={`absolute top-0 right-3 flex h-[22px] -translate-y-1/2 items-center gap-1 rounded-[4px] border px-1.5 transition-colors duration-300 ${
              solid ? "border-accent bg-accent text-white" : "border-accent bg-surface text-accent"
            }`}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE, delay: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <StopwatchIcon className="h-[11px] w-[11px]" />
            <span className="text-[11.5px] leading-none font-semibold tabular-nums">{formatSeconds(ms)}</span>
            {tokens !== null && (
              <span className="text-[11.5px] leading-none font-semibold tabular-nums">
                <span className="font-normal opacity-60"> · </span>
                {formatCount(tokens)} tokens
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
}

function StopwatchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="6.8" r="4.2" />
      <path d="M6 6.8V4.6M4.8 1.2h2.4" />
    </svg>
  );
}
