/**
 * Formatting for the instrument chrome. Everything here renders in monospace
 * with tabular numerals, so outputs are kept short and stable in width.
 */

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Live stopwatch readout: tenths under a minute so the clock visibly runs, whole seconds after. */
export function formatStopwatch(ms: number): string {
  if (ms < 60_000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  return formatDuration(ms);
}

/** How long Snap took: hundredths under ten seconds, where the differences between steps show. */
export function formatSeconds(ms: number): string {
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(2)}s`;
  return formatStopwatch(ms);
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `~${Math.round(tokens)}`;
  if (tokens < 1_000_000) return `~${Math.round(tokens / 1000)}K`;
  return `~${(tokens / 1_000_000).toFixed(1)}M`;
}

/** "6,212": an exact count, grouped. */
export function formatCount(count: number): string {
  return Math.round(count).toLocaleString("en-US");
}

export function formatProb(p: number): string {
  return clamp01(p).toFixed(2);
}

export function formatPages(start: number, end: number): string {
  return start === end ? `p. ${start}` : `pp. ${start}–${end}`;
}

function clamp01(p: number): number {
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
}
