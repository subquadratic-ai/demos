"use client";

import type { CSSProperties } from "react";

export interface HighlightedProps {
  text: string;
  /** An exact substring of text to mark; absent or not found renders plain text. */
  phrase?: string;
  /** Seconds before the mark draws in. */
  delay?: number;
  className?: string;
}

/**
 * Text with one phrase picked out: a pale accent wash and a navy underline that
 * wipes in left to right. Only the first exact occurrence is marked; whitespace
 * passes through untouched so the caller's whitespace-pre-line still applies.
 */
export function Highlighted({ text, phrase, delay = 0, className }: HighlightedProps) {
  const at = phrase ? text.indexOf(phrase) : -1;
  if (!phrase || at < 0) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {text.slice(0, at)}
      <mark className="snap-mark" style={{ "--mark-delay": `${delay}s` } as CSSProperties}>
        {phrase}
      </mark>
      {text.slice(at + phrase.length)}
    </span>
  );
}
