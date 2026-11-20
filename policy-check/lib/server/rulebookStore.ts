import "server-only";
import { readFile } from "node:fs/promises";
import type { Rulebook } from "@/lib/types";
import { dataFile, getUseCase } from "@/usecases";

/**
 * In-memory rulebook store. The use case's rulebook loads lazily from
 * usecases/<id>/rulebook.json on first use and never expires; uploads live
 * for two hours and are deleted when the tab closes. Nothing is written to
 * disk. State hangs off globalThis so Next's dev-server hot reloads don't
 * drop uploads mid-demo.
 */

interface StoreState {
  /** The active use case's rulebook; null when it has none yet. */
  sample?: { useCase: string; rulebook: Rulebook | null };
  uploads: Map<string, { rulebook: Rulebook; storedAt: number }>;
}

const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

const globalStore = globalThis as unknown as { __rulebookStore?: StoreState };
const store: StoreState = (globalStore.__rulebookStore ??= { uploads: new Map() });

function sweep(): void {
  const cutoff = Date.now() - UPLOAD_TTL_MS;
  for (const [id, entry] of store.uploads) if (entry.storedAt < cutoff) store.uploads.delete(id);
}

/** The active use case's rulebook, the one the page opens with. */
export async function getSampleRulebook(): Promise<Rulebook | undefined> {
  const useCase = getUseCase();
  if (store.sample?.useCase !== useCase.id) {
    let rulebook: Rulebook | null = null;
    try {
      rulebook = JSON.parse(await readFile(dataFile(useCase, "rulebook.json"), "utf8")) as Rulebook;
    } catch {
      // Not indexed yet (npm run index); uploads still work.
    }
    store.sample = { useCase: useCase.id, rulebook };
  }
  return store.sample.rulebook ?? undefined;
}

export async function getRulebook(id: string): Promise<Rulebook | undefined> {
  sweep();
  const upload = store.uploads.get(id);
  if (upload) return upload.rulebook;
  const sample = await getSampleRulebook();
  return sample?.id === id ? sample : undefined;
}

export function putRulebook(rulebook: Rulebook): void {
  sweep();
  store.uploads.set(rulebook.id, { rulebook, storedAt: Date.now() });
}

/** Uploads only; the use case's rulebook cannot be deleted. Returns false when nothing was removed. */
export function deleteRulebook(id: string): boolean {
  return store.uploads.delete(id);
}

export function isSampleRulebook(id: string): boolean {
  return store.sample?.rulebook?.id === id;
}
