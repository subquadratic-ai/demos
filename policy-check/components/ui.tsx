import type { ComponentProps } from "react";
import type { Verdict } from "@/lib/types";

/** Shared primitives. Flat and quiet; colour only where it means something. */

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "quiet" };

const BUTTON_VARIANT = {
  primary:
    "h-9 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:bg-accent-tint",
  quiet: "text-[13px] text-text-3 underline-offset-4 transition-colors hover:text-text hover:underline disabled:cursor-not-allowed disabled:opacity-40",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 ${BUTTON_VARIANT[variant]} ${className}`} {...props} />;
}

export function Loader({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} role="status">
      <span className="loader" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label && <span className="text-[13px] text-text-3">{label}</span>}
    </span>
  );
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  flagged: "Flagged",
  review: "Needs a human",
  cleared: "Cleared",
};

export const VERDICT_TEXT: Record<Verdict, string> = {
  flagged: "text-flagged",
  review: "text-review",
  cleared: "text-cleared",
};

export const VERDICT_BG: Record<Verdict, string> = {
  flagged: "bg-flagged",
  review: "bg-review",
  cleared: "bg-cleared",
};

const VERDICT_GLYPH: Record<Verdict, string> = { flagged: "▲", review: "●", cleared: "✓" };

/** The word carries the meaning; the colour and glyph only reinforce it. */
export function VerdictLabel({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${VERDICT_TEXT[verdict]} ${className}`}>
      <span aria-hidden className="text-[0.8em]">
        {VERDICT_GLYPH[verdict]}
      </span>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** A hairline meter. Width is inline so the Tailwind scanner never sees a dynamic class. */
export function Meter({
  value,
  className = "",
  fill = "bg-accent",
  track = "bg-tile",
}: {
  value: number;
  className?: string;
  fill?: string;
  track?: string;
}) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <span className={`block h-[2px] overflow-hidden rounded-full ${track} ${className}`} aria-hidden>
      <span className={`meter-fill block h-full ${fill}`} style={{ width }} />
    </span>
  );
}

