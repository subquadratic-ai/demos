import { create } from "zustand";
import {
  DEFAULT_THRESHOLDS,
  type DemoData,
  type IndexJob,
  type Item,
  type Preflight,
  type Rulebook,
  type RulebookStep,
  type Sample,
  type ScreenResult,
  type Thresholds,
} from "@/lib/types";
import type { UseCaseView } from "@/lib/usecase";
import type { Reveal } from "./reveal";

/**
 * One store for the page. Nothing is persisted: uploads are in-memory by
 * design. Verdicts are never stored, only derived from results + thresholds
 * (lib/verdict.ts), so the rule lives in one place. The modules beside this
 * one (screening, reveal, upload) write to it with setState.
 */

export interface ScreenCost {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UploadState {
  fileName: string;
  startedAt: number;
  step: { step: RulebookStep; progress: number; label: string } | null;
  preflight: Preflight | null;
  job: IndexJob | null;
  error: string | null;
  /** Wall-clock total once the tree is built; null while running. */
  finishedMs: number | null;
}

/** The text in the item card's field, and the item it was picked from (null when typed from scratch). */
export interface Draft {
  text: string;
  sourceId: string | null;
}

export interface State {
  /** The active use case's kinds and copy. */
  useCase: UseCaseView;
  /** The pre-indexed sample, kept so an upload can be undone. */
  sample: Rulebook | null;
  /** The rulebook on screen: the sample, or an upload. */
  rulebook: Rulebook | null;
  samples: Sample[];
  /** Ids of items the visitor wrote or edited, newest first. */
  own: string[];
  draft: Draft;
  items: Record<string, Item>;
  results: Record<string, ScreenResult>;
  costs: Record<string, ScreenCost>;
  /** The item last checked or shown: the one the stage scans and whose result it shows. */
  activeId: string | null;
  /** Waiting on /api/screen since `startedAt`. */
  pending: { itemId: string; startedAt: number } | null;
  /** What the page shows of the active result: the found beat, then the result. */
  reveal: Reveal | null;
  upload: UploadState | null;
  /** Uploaded rulebooks to DELETE when the tab closes. */
  uploadedIds: string[];
  thresholds: Thresholds;
  error: string | null;
}

function initialState(data?: DemoData): State {
  return {
    useCase: data?.useCase ?? { id: "", kinds: [], question: "", placeholder: "" },
    sample: data?.rulebook ?? null,
    rulebook: data?.rulebook ?? null,
    samples: data?.samples ?? [],
    own: [],
    // The field opens on the first sample, so one click on Check runs the demo.
    draft: { text: data?.samples[0]?.text ?? "", sourceId: data?.samples[0]?.id ?? null },
    items: Object.fromEntries((data?.samples ?? []).map((sample) => [sample.id, sample])),
    results: {},
    costs: {},
    activeId: null,
    pending: null,
    reveal: null,
    upload: null,
    uploadedIds: [],
    thresholds: DEFAULT_THRESHOLDS,
    error: null,
  };
}

export const useStore = create<State>()(() => initialState());

let hydratedInBrowser = false;

/**
 * Seeds the store from server-rendered data, once per page load in the
 * browser. On the server it runs per render, which is safe: DemoData is the
 * same for every visitor and nothing else writes to the store there.
 */
export function hydrate(data: DemoData): void {
  if (typeof window !== "undefined") {
    if (hydratedInBrowser) return;
    hydratedInBrowser = true;
  }
  useStore.setState(initialState(data), true);
}

/**
 * Results belong to one tree; a different rulebook starts clean. The text
 * in the field stays, so the same item can be checked against the new rulebook.
 */
export function switchRulebook(rulebook: Rulebook): void {
  useStore.setState((state) => ({
    rulebook,
    results: {},
    costs: {},
    activeId: null,
    pending: null,
    reveal: null,
    own: [],
    draft: { text: state.draft.text, sourceId: null },
    items: Object.fromEntries(state.samples.map((sample) => [sample.id, sample])),
    error: null,
  }));
}

export function storeResult(result: ScreenResult, cost: ScreenCost): void {
  useStore.setState((state) => ({
    results: { ...state.results, [result.itemId]: result },
    costs: { ...state.costs, [result.itemId]: cost },
  }));
}

export function setError(error: string | null): void {
  useStore.setState({ error });
}
