import { guessKind } from "@/lib/items";
import type { Item } from "@/lib/types";
import { checkItem } from "./screening";
import { useStore, type State } from "./store";

/**
 * The item card's field is the one place an item is checked from. It opens
 * on the first sample, and the text is the visitor's to change before
 * anything is sent; Check sends whatever is there.
 */

/** Same item if the words match; spacing and line breaks are not edits. */
export function sameText(a: string, b: string): boolean {
  const norm = (text: string) => text.trim().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/** Still an edit of the picked item while at least half of its words remain; past that it is new text. */
export function stillResembles(text: string, original: string): boolean {
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9$%]+/g) ?? []);
  const before = words(original);
  if (before.size === 0) return false;
  const after = words(text);
  let kept = 0;
  for (const word of before) if (after.has(word)) kept++;
  return kept / before.size >= 0.5;
}

/** An item that already has exactly this text: checking it again replays its stored result instead of asking Snap twice. */
export function findSameText(text: string, candidates: Item[]): Item | undefined {
  return candidates.find((item) => sameText(item.text, text));
}

/** Text replaced wholesale lets go of the item it was picked from, so it is checked, labelled and kinded as new. */
export function setDraftText(text: string): void {
  useStore.setState((state) => {
    const source = state.draft.sourceId ? state.items[state.draft.sourceId] : undefined;
    return { draft: { text, sourceId: source && stillResembles(text, source.text) ? source.id : null } };
  });
}

/**
 * Checks the field. Unchanged text checks the item it came from (one
 * already checked replays its result without asking Snap again); new or
 * edited text becomes the visitor's own item, listed under "Yours", and the
 * field now belongs to it.
 */
export async function checkDraft(): Promise<void> {
  const state = useStore.getState();
  const text = state.draft.text.trim();
  if (!text || !state.rulebook) return;

  const same = findSameText(text, checkable(state));
  if (same) {
    useStore.setState({ draft: { text: state.draft.text, sourceId: same.id } });
    return checkItem(same.id);
  }

  const source = state.draft.sourceId ? state.items[state.draft.sourceId] : undefined;
  const fromSample = source !== undefined && state.samples.some((sample) => sample.id === source.id);
  const item: Item = {
    id: `own-${Date.now().toString(36)}`,
    kind: source?.kind ?? guessKind(text, state.useCase.kinds),
    text,
    source: fromSample ? "Edited sample" : "Written by you",
  };
  useStore.setState((current) => ({
    items: { ...current.items, [item.id]: item },
    own: [item.id, ...current.own],
    draft: { text: current.draft.text, sourceId: item.id },
  }));
  return checkItem(item.id);
}

/** The visitor's items, plus the samples while their rulebook is the one on screen. */
function checkable(state: State): Item[] {
  const own = state.own.map((id) => state.items[id]).filter((item): item is Item => item !== undefined);
  const onSample = state.rulebook !== null && state.rulebook.id === state.sample?.id;
  return onSample ? [...own, ...state.samples] : own;
}
