import type { ScreenResult } from "@/lib/types";
import { useStore } from "./store";

/**
 * What happens on the page once Snap has answered: the scan rests for a beat
 * on what the read found (every clause the item contradicts lit at once),
 * then the result opens. One reveal runs at a time.
 */

export interface Reveal {
  itemId: string;
  /** "found": the grid shows the clauses the read found. "done": the result is out. */
  phase: "found" | "done";
}

/** Time on the clauses the read found before the result opens. */
const FOUND_MS = 1200;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function stopReveal(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Shows a result. Animated, the grid rests on what was found first;
 * otherwise the result is out straight away.
 */
export function runReveal(result: ScreenResult, { animate }: { animate: boolean }): void {
  stopReveal();
  const finish = () => useStore.setState({ activeId: result.itemId, reveal: { itemId: result.itemId, phase: "done" } });
  if (!animate || prefersReducedMotion()) {
    finish();
    return;
  }
  useStore.setState({ activeId: result.itemId, reveal: { itemId: result.itemId, phase: "found" } });
  timer = setTimeout(() => {
    timer = null;
    finish();
  }, FOUND_MS);
}
