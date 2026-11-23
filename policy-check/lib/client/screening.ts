import type { Item } from "@/lib/types";
import { api, errorMessage } from "./api";
import { runReveal, stopReveal } from "./reveal";
import { setError, storeResult, useStore } from "./store";

/**
 * Checking an item is one POST to /api/screen (the server reads the policy
 * and judges the clauses it points at), then the scan rests on what it found
 * and the result opens under the card. Only one item is in flight;
 * picking another cancels the first.
 */

let controller: AbortController | null = null;

/** A sample or an earlier item. Already checked: show its stored result again, no new request. */
export async function checkItem(itemId: string): Promise<void> {
  const state = useStore.getState();
  const item = state.items[itemId];
  if (!item || !state.rulebook) return;
  const existing = state.results[itemId];
  if (existing) {
    cancelPending();
    runReveal(existing, { animate: true });
    return;
  }
  await request(item);
}

function cancelPending(): void {
  controller?.abort();
  controller = null;
  useStore.setState({ pending: null, error: null });
}

async function request(item: Item): Promise<void> {
  const state = useStore.getState();
  if (!state.rulebook) return;
  controller?.abort();
  const own = new AbortController();
  controller = own;
  stopReveal();
  useStore.setState({ activeId: item.id, pending: { itemId: item.id, startedAt: Date.now() }, reveal: null, error: null });

  try {
    const current = useStore.getState();
    const response = await api.screen(
      { rulebookId: state.rulebook.id, items: [item], thresholds: current.thresholds, corrections: {} },
      own.signal,
    );
    const result = response.results[0];
    if (!result) throw new Error("Snap returned no result for this item.");
    storeResult(result, { requests: response.requests, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    useStore.setState({ pending: null });
    runReveal(result, { animate: true });
  } catch (error) {
    if (own.signal.aborted) return;
    useStore.setState({ pending: null });
    setError(errorMessage(error));
  } finally {
    if (controller === own) controller = null;
  }
}
