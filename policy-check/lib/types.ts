/**
 * Shared domain types. Everything in the app (use cases, Snap clients, API
 * routes, UI) builds on these. Keep them boring and serialisable: they cross
 * the server/client boundary as JSON.
 */

import type { UseCaseView } from "./usecase";

// ---------------------------------------------------------------------------
// Rulebook = a PageIndex tree

/**
 * A PageIndex-style tree node. Internal nodes group leaves; leaves carry the
 * clause text that is shown next to every verdict. A node is a leaf when
 * `children` is empty.
 */
export interface TreeNode {
  /** Stable id, unique within a rulebook. Fixtures use "3.4"-style ids; "root" for the root. */
  nodeId: string;
  title: string;
  /** One line describing what the node covers. Used as the Choice criterion while descending. */
  summary: string;
  /** 1-based inclusive page range in the source document. */
  pageStart: number;
  pageEnd: number;
  /** Full clause text. Leaves only. */
  text?: string;
  /** Words in the leaf's full section. Set when the text is cut for the browser (withClauseText), so the page can show how much is there. */
  words?: number;
  children: TreeNode[];
}

export type PreflightWarning = "no_text_layer" | "partial_text_layer" | "few_headings" | "exceeds_context";

export interface Preflight {
  pages: number;
  pagesWithText: number;
  /** Estimated at ~650 tokens per page. */
  tokens: number;
  /** The window the estimate was compared against (SNAP_CONTEXT_TOKENS). */
  contextTokens: number;
  /** Heading-like lines found; a rough preview of how many leaves the tree will have. */
  headingCandidates: number;
  warnings: PreflightWarning[];
  /** Wall-clock time for reading the file, for the stopwatch. */
  elapsedMs: number;
}

export interface Rulebook {
  id: string;
  title: string;
  /** Who the policy belongs to; invented. */
  organisation: string;
  source: "fixture" | "upload";
  pages: number;
  preflight: Preflight;
  tree: TreeNode;
  /** Time the PageIndex build took, for "Indexed 288 pages in 3m 12s". */
  indexMs: number;
  /** "pageindex" (real service), "snap" (Snap-classified headings), or "fixture" (pre-indexed). */
  indexer: "pageindex" | "snap" | "fixture";
}

export type IndexJobStatus = "queued" | "extracting" | "indexing" | "done" | "error";

/** Progress of a background PageIndex build. Polled by the client. */
export interface IndexJob {
  id: string;
  rulebookId: string;
  status: IndexJobStatus;
  /** 0..1 */
  progress: number;
  /** Human label for the current stage, e.g. "Classifying headings · page 140/288". */
  stage: string;
  pagesIndexed: number;
  pages: number;
  nodesBuilt: number;
  startedAt: number;
  elapsedMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Items

export interface Item {
  /** e.g. "it-042" */
  id: string;
  /** One of the use case's kinds, e.g. "email". Context for Snap, not a branch in code. */
  kind: string;
  /** The item itself: ad copy, an email, a contract clause, a transaction line… */
  text: string;
  /** Optional source label shown in the UI, e.g. "Landing page · Q3 refresh". */
  source?: string;
}

/**
 * What a sample was picked to show. Never displayed (the list must not give
 * the verdict away); the recorder and the tests check every sample's live
 * verdict against it, so the set stays balanced.
 */
export type SampleGroup = "flags" | "clears" | "review";

/** A ready-made item in the picker: usecases/<id>/samples.json. */
export interface Sample extends Item {
  group: SampleGroup;
  /** One line on why the item is in the set, for maintainers. Not shown on the page. */
  hook: string;
  /**
   * The clause the sample was written against, for maintainers. When set,
   * check-samples also checks where the verdict lands: among the flagged
   * findings for "flags", the top finding otherwise. Not shown on the page.
   */
  clause?: string;
}

/** Everything the page needs on first render; loaded on the server so there is no client bootstrap. */
export interface DemoData {
  /** The use case's rulebook, leaf text cut to the clause (see withClauseText). Null when it has none yet. */
  rulebook: Rulebook | null;
  samples: Sample[];
  useCase: UseCaseView;
}

// ---------------------------------------------------------------------------
// Decisions

export interface Thresholds {
  /** Clear when item_complies >= this. */
  clearAbove: number;
  /** Flag when item_complies <= this AND applies_to_item >= appliesAbove. */
  flagBelow: number;
  /** The applies gate: a clause Snap is less sure than this applies is never a contradiction. */
  appliesAbove: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  clearAbove: 0.9,
  flagBelow: 0.15,
  appliesAbove: 0.85,
};

export type Verdict = "cleared" | "flagged" | "review";

export type SeverityLevel = "low" | "medium" | "high";
export const SEVERITY_LEVELS: readonly SeverityLevel[] = ["low", "medium", "high"];

export interface Severity {
  level: SeverityLevel;
  /** Probability-weighted score across the three levels, 0..2. */
  score: number;
  /** Probability per level, in SEVERITY_LEVELS order. Sums to 1. */
  probabilities: [number, number, number];
}

/**
 * Raw Snap output for one item. No verdict here: verdicts are computed in
 * code from Thresholds (see lib/verdict.ts), so the rule lives in one place.
 */
export interface ScreenResult {
  itemId: string;
  /**
   * The clauses Snap found the item may contradict when it read the entire
   * document in one request, each then judged on its own clause. The most
   * serious first; leafId, applies, complies, severity and evidence below
   * mirror findings[0]. Empty only when the read named no clause at all.
   */
  findings: Finding[];
  /** The one request that read the entire document. */
  read: { tokens: number; ms?: number };
  /** The top finding's clause; null when there is none. */
  leafId: string | null;
  /** noul applies_to_item, judged at the top finding's clause. */
  applies: number;
  /** noul item_complies, judged at the top finding's clause. */
  complies: number;
  severity: Severity;
  /** The slowest of the clause judgements, which run side by side. Live answers only. */
  judgeMs?: number;
  /** How long Snap took to decide: the read plus the slowest judgement. Live answers only. */
  decisionMs?: number;
  /** Clauses the read chose between: every clause in the document. */
  clausesCompared: number;
  /**
   * The part of the item and the part of the top clause Snap tied together,
   * each picked by a Choice over segments of that text. Absent when its
   * clause carries a reviewer correction (the re-check is asked without
   * evidence) or when the pick was too unsure to show (below EVIDENCE_FLOOR
   * in lib/snap/judge.ts).
   */
  evidence?: { item?: Evidence; clause?: Evidence };
}

/** One clause the whole-document read pointed at, judged against that clause alone. */
export interface Finding {
  leafId: string;
  /** Probability, from the whole-document read, that the item contradicts this clause. */
  found: number;
  /** noul applies_to_item, judged at the clause. */
  applies: number;
  /** noul item_complies, judged at the clause. */
  complies: number;
  severity: Severity;
  /** Snap's picks from the item and from this clause, as in ScreenResult.evidence. */
  evidence?: { item?: Evidence; clause?: Evidence };
  /** How long Snap took to judge this clause. */
  judgeMs?: number;
}

/** One segment Snap picked: an exact substring of the item text or of clauseOf(leaf), with its probability. */
export interface Evidence {
  text: string;
  probability: number;
}

/** Reviewer corrections appended to a leaf's state, keyed by leaf id. */
export type Corrections = Record<string, string[]>;

// ---------------------------------------------------------------------------
// API contracts

export interface ScreenRequest {
  rulebookId: string;
  /** Up to 50 items per call; they share the one read of the document. */
  items: Item[];
  thresholds: Thresholds;
  corrections: Corrections;
}

export interface ScreenResponse {
  results: ScreenResult[];
  /** Snap requests made to serve this call (shows batching cost). */
  requests: number;
  /** Total input tokens sent across those requests, when the client reports usage. */
  inputTokens: number;
  /** Total output tokens across those requests. Snap answers with probabilities, not text, so this stays small. */
  outputTokens: number;
  /** The Snap client's name, "SubQ Snap (live)". */
  clientName: string;
}

/**
 * Events streamed (NDJSON, one per line) by POST /api/rulebook (upload).
 * Upload, extract and preflight finish within seconds; the PageIndex build
 * then continues as a background job that the client polls.
 */
export type RulebookStep = "upload" | "extract" | "preflight";

export type RulebookEvent =
  | { type: "step"; step: RulebookStep; progress: number; label: string }
  | { type: "preflight"; preflight: Preflight; title: string }
  | { type: "indexing"; jobId: string; rulebookId: string }
  | { type: "error"; message: string };
