import type { AppConfig } from "@/lib/config";
import { BATCH_SIZE } from "@/lib/config";
import { isHeadingCandidate } from "@/lib/rulebook/preflight";
import { buildHeadingRequest, labelFor, type HeadingEntry } from "@/lib/snap/questions";
import { asNoul, asScore, type SnapClient } from "@/lib/snap/types";
import type { IndexJob, TreeNode } from "@/lib/types";
import { buildTreeWithPageIndex } from "./pageindexApi";

/**
 * Builds a PageIndex-style tree from extracted pages.
 *
 * With PAGEINDEX_API_URL set the real service does the work (pageindexApi.ts).
 * Otherwise the "snap" indexer: a regex prefilter picks candidate heading
 * lines, Snap classifies them in batches of 50 (is it a heading, at which
 * level), and the accepted headings become a 2–3 level tree in document
 * order. Text between headings belongs to the heading above it. Summaries
 * are the first sentence of that text: nothing here generates prose.
 */

export type BuildProgress = Partial<Pick<IndexJob, "status" | "progress" | "stage" | "pagesIndexed" | "pages" | "nodesBuilt">>;

export interface BuildTreeOptions {
  pages: string[];
  title: string;
  client: SnapClient;
  config?: Pick<AppConfig, "pageIndexApiUrl" | "pageIndexApiKey">;
  onProgress?: (progress: BuildProgress) => void;
  /** Accept a candidate line as a heading when P(heading) is at least this. */
  acceptAbove?: number;
  /** …or at least this when its number continues the outline ("7" after "6", "6.1" after "6"). */
  acceptNumberedAbove?: number;
}

export interface BuiltTree {
  tree: TreeNode;
  indexer: "snap" | "pageindex";
}

export const ROOT_ID = "root";

/** Pages per chapter when a document has no usable headings. */
const FALLBACK_PAGES_PER_CHAPTER = 10;
const FALLBACK_PAGES_PER_LEAF = 2;
/** Flat documents (one heading level) get grouped into chapters of this many leaves. */
const FLAT_GROUP_SIZE = 10;
const SUMMARY_MAX_CHARS = 180;
/** A top-level leaf with less text than this is front matter, not a clause. */
const MIN_LEAF_CHARS = 120;

export async function buildTree(options: BuildTreeOptions): Promise<BuiltTree> {
  const { pages, title, client, config, onProgress } = options;
  if (config?.pageIndexApiUrl) {
    const tree = await buildTreeWithPageIndex({
      pages,
      title,
      apiUrl: config.pageIndexApiUrl,
      apiKey: config.pageIndexApiKey,
      onProgress,
    });
    return { tree, indexer: "pageindex" };
  }

  const acceptAbove = options.acceptAbove ?? 0.5;
  // Snap judges each line on its own and is lukewarm on short ones ("7 Pricing" at ~0.4); continuing the numbering is evidence it cannot see.
  const acceptNumberedAbove = options.acceptNumberedAbove ?? 0.3;
  const report = (progress: BuildProgress) => onProgress?.({ status: "indexing", pages: pages.length, ...progress });

  // 1. Prefilter: cheap regex over every line, reported per page.
  const candidates: Candidate[] = [];
  pages.forEach((page, pageIndex) => {
    page.split("\n").forEach((line, lineIndex) => {
      if (isHeadingCandidate(line)) candidates.push({ page: pageIndex + 1, line: lineIndex, text: cleanHeading(line) });
    });
    if ((pageIndex + 1) % 10 === 0 || pageIndex === pages.length - 1) {
      report({
        progress: 0.2 * ((pageIndex + 1) / Math.max(1, pages.length)),
        stage: `Scanning for headings · page ${pageIndex + 1}/${pages.length}`,
        pagesIndexed: pageIndex + 1,
        nodesBuilt: 0,
      });
    }
  });

  // 2. Snap classifies the candidates, 50 lines per request.
  const headings: Heading[] = [];
  let lastNumber: number[] | undefined;
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const slice = candidates.slice(start, start + BATCH_SIZE);
    const entries: HeadingEntry[] = slice.map((candidate, index) => ({ label: labelFor(index), text: candidate.text }));
    const response = await client.decide(buildHeadingRequest(entries));
    slice.forEach((candidate, index) => {
      const label = labelFor(index);
      const isHeading = asNoul(response.answers[`${label}.is_heading`], 0);
      const number = numberOf(candidate.text);
      const continuesOutline = number !== undefined && continues(lastNumber, number);
      if (isHeading < (continuesOutline ? acceptNumberedAbove : acceptAbove)) return;
      if (number) lastNumber = number;
      // Numbering ("4." vs "4.2") is unambiguous, so it wins; the model's level only decides unnumbered headings.
      const answer = asScore(response.answers[`${label}.level`]);
      headings.push({ ...candidate, level: numberingLevel(candidate.text) ?? argmaxLevel(answer?.probabilities ?? {}) });
    });
    const done = Math.min(candidates.length, start + BATCH_SIZE);
    const lastPage = slice[slice.length - 1]?.page ?? pages.length;
    report({
      progress: 0.2 + 0.7 * (done / Math.max(1, candidates.length)),
      stage: `Classifying headings · page ${lastPage}/${pages.length}`,
      pagesIndexed: lastPage,
      nodesBuilt: headings.length,
    });
  }

  // 3. Assemble the tree, or fall back to page groups when the document is flat prose.
  const tree = headings.length >= 2 ? assemble(headings, pages, title) : fallbackTree(pages, title);
  report({ progress: 1, stage: "Tree built", pagesIndexed: pages.length, nodesBuilt: countNodes(tree) - 1 });
  return { tree, indexer: "snap" };
}

// ---------------------------------------------------------------------------

interface Candidate {
  /** 1-based page. */
  page: number;
  line: number;
  text: string;
}

interface Heading extends Candidate {
  /** 0 chapter, 1 section, 2 subsection. */
  level: number;
}

interface Draft {
  node: TreeNode;
  rank: number;
  heading: Heading;
  /** Text from this heading down to the next heading of any level. */
  ownText: string;
}

function assemble(headings: Heading[], pages: string[], title: string): TreeNode {
  // Normalise levels so the shallowest level used becomes the chapter level.
  const used = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
  const rankOf = new Map(used.map((level, rank) => [level, Math.min(rank, 2)]));

  const drafts: Draft[] = headings.map((heading, index) => {
    const next = headings[index + 1];
    // A heading at the top of a page ends the previous span on the page before.
    const spanEnd = next ? (next.line === 0 ? next.page - 1 : next.page) : pages.length;
    return {
      heading,
      rank: rankOf.get(heading.level) ?? 0,
      ownText: textBetween(pages, heading, next),
      node: { nodeId: "", title: heading.text, summary: "", pageStart: heading.page, pageEnd: Math.max(heading.page, spanEnd), children: [] },
    };
  });

  const root: TreeNode = { nodeId: ROOT_ID, title, summary: `${title}: ${headings.length} headings`, pageStart: 1, pageEnd: pages.length, children: [] };
  const stack: Draft[] = [];
  const usedIds = new Set<string>([ROOT_ID]);
  drafts.forEach((draft, index) => {
    while (stack.length > 0 && stack[stack.length - 1].rank >= draft.rank) stack.pop();
    const parent = stack[stack.length - 1];
    draft.node.nodeId = nodeIdFor(draft.heading.text, index, usedIds);
    // The id already carries the numbering, so the title should not repeat it.
    draft.node.title = stripNumbering(draft.heading.text);
    (parent ? parent.node : root).children.push(draft.node);
    stack.push(draft);
  });

  // Leaves carry their text. An internal node is described by its own preamble
  // when it has one, otherwise by what it contains; either way the summary is
  // the Choice criterion while descending, so it must say what is in there.
  for (const draft of drafts) {
    if (draft.node.children.length === 0) {
      draft.node.text = draft.ownText;
      draft.node.summary = summarise(draft.ownText) || draft.node.title;
    } else {
      draft.node.summary = summarise(draft.ownText) || describeChildren(draft.node);
    }
  }
  for (const draft of drafts) extendPageEnd(draft.node);

  pruneFrontMatter(root, title);
  return groupFlat(root);
}

/** "Purpose; Definitions; Roles; Exceptions", clipped. */
function describeChildren(node: TreeNode): string {
  return node.children.map((child) => child.title).join("; ").slice(0, SUMMARY_MAX_CHARS);
}

/**
 * A document's own title line, an edition note or a contents entry often pass
 * the heading filter and would become a one-line leaf under the root, next to
 * the real chapters. Drop those: a childless top-level node with next to no
 * text governs nothing. A flat document (every top-level node is a leaf) is
 * left alone; there the short leaves are the structure.
 */
function pruneFrontMatter(root: TreeNode, title: string): void {
  const structured = root.children.some((child) => child.children.length > 0);
  if (!structured) return;
  const normalisedTitle = title.trim().toLowerCase();
  root.children = root.children.filter((child) => {
    if (child.children.length > 0) return true;
    const text = child.text?.trim() ?? "";
    return text.length >= MIN_LEAF_CHARS && child.title.trim().toLowerCase() !== normalisedTitle;
  });
}

function textBetween(pages: string[], from: Heading, to: Heading | undefined): string {
  const parts: string[] = [];
  const lastPage = to ? to.page : pages.length;
  for (let page = from.page; page <= lastPage; page++) {
    const lines = pages[page - 1]?.split("\n") ?? [];
    const start = page === from.page ? from.line + 1 : 0;
    const end = to && page === to.page ? to.line : lines.length;
    parts.push(lines.slice(start, end).join("\n"));
  }
  return parts.join("\n").trim();
}

function extendPageEnd(node: TreeNode): number {
  for (const child of node.children) node.pageEnd = Math.max(node.pageEnd, extendPageEnd(child));
  return node.pageEnd;
}

/**
 * A document whose headings all sit at one level yields root → N leaves. Above a dozen,
 * group consecutive leaves into chapters so the policy keeps a chapter level to read and browse by.
 */
function groupFlat(root: TreeNode): TreeNode {
  const flat = root.children.every((child) => child.children.length === 0);
  if (!flat || root.children.length <= FLAT_GROUP_SIZE) return root;
  const groups: TreeNode[] = [];
  for (let start = 0; start < root.children.length; start += FLAT_GROUP_SIZE) {
    const slice = root.children.slice(start, start + FLAT_GROUP_SIZE);
    const first = slice[0];
    const last = slice[slice.length - 1];
    groups.push({
      nodeId: `g${groups.length + 1}`,
      title: `${first.title} … ${last.title}`,
      summary: `Sections ${first.nodeId} to ${last.nodeId}: ${slice.map((n) => n.title).join("; ")}`.slice(0, SUMMARY_MAX_CHARS),
      pageStart: first.pageStart,
      pageEnd: last.pageEnd,
      children: slice,
    });
  }
  return { ...root, children: groups };
}

/** One chapter per ~10 pages, one leaf per 2 pages. Keeps an unstructured document screenable. */
export function fallbackTree(pages: string[], title: string): TreeNode {
  const chapters: TreeNode[] = [];
  for (let start = 0; start < pages.length; start += FALLBACK_PAGES_PER_CHAPTER) {
    const end = Math.min(pages.length, start + FALLBACK_PAGES_PER_CHAPTER);
    const leaves: TreeNode[] = [];
    for (let leafStart = start; leafStart < end; leafStart += FALLBACK_PAGES_PER_LEAF) {
      const leafEnd = Math.min(end, leafStart + FALLBACK_PAGES_PER_LEAF);
      const text = pages.slice(leafStart, leafEnd).join("\n\n").trim();
      leaves.push({
        nodeId: `p${leafStart + 1}-${leafEnd}`,
        title: leafEnd - leafStart === 1 ? `Page ${leafStart + 1}` : `Pages ${leafStart + 1}–${leafEnd}`,
        summary: summarise(text),
        pageStart: leafStart + 1,
        pageEnd: leafEnd,
        text,
        children: [],
      });
    }
    chapters.push({
      nodeId: `c${chapters.length + 1}`,
      title: `Pages ${start + 1}–${end}`,
      summary: leaves.map((leaf) => leaf.summary).join(" ").slice(0, SUMMARY_MAX_CHARS),
      pageStart: start + 1,
      pageEnd: end,
      children: leaves,
    });
  }
  if (chapters.length === 0) {
    chapters.push({ nodeId: "p1", title: "Document", summary: title, pageStart: 1, pageEnd: 1, text: "", children: [] });
  }
  return { nodeId: ROOT_ID, title, summary: `${title}: ${pages.length} pages, no headings detected`, pageStart: 1, pageEnd: Math.max(1, pages.length), children: chapters };
}

// ---------------------------------------------------------------------------

const NUMBERING = /^(?:(?:chapter|part|section|article)\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+/i;

function cleanHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ");
}

function stripNumbering(text: string): string {
  const stripped = text.replace(NUMBERING, "").trim();
  return stripped || text;
}

/** Numbering from the heading when present and unused; otherwise a positional id. */
function nodeIdFor(text: string, index: number, used: Set<string>): string {
  const match = NUMBERING.exec(text);
  const candidate = match ? match[1] : `n${index + 1}`;
  const id = used.has(candidate) ? `n${index + 1}` : candidate;
  used.add(id);
  return id;
}

/** 0 for "4" or "Chapter 4", 1 for "4.2", 2 for "4.2.1"; undefined when the heading is not numbered. */
export function numberingLevel(text: string): number | undefined {
  const number = numberOf(text);
  return number ? Math.min(number.length - 1, 2) : undefined;
}

/** [4, 2] for "4.2 Purchase orders"; undefined when the line is not numbered. */
function numberOf(text: string): number[] | undefined {
  const match = NUMBERING.exec(text);
  return match ? match[1].split(".").map(Number) : undefined;
}

/**
 * Whether `next` is the heading that should follow `previous` in a numbered
 * outline: the next sibling at any level ("6.3" → "6.4" or "7"), or the first
 * child ("6" → "6.1"). A list item numbered "1" inside section 3.2 is not.
 */
export function continues(previous: number[] | undefined, next: number[]): boolean {
  if (!previous) return next.every((n) => n === 1);
  if (next.length === previous.length + 1) return previous.every((n, i) => next[i] === n) && next[next.length - 1] === 1;
  if (next.length > previous.length) return false;
  const depth = next.length - 1;
  return next.slice(0, depth).every((n, i) => previous[i] === n) && next[depth] === previous[depth] + 1;
}

function argmaxLevel(probabilities: Record<string, number>): number {
  let best = 1;
  let bestP = -1;
  for (const [key, p] of Object.entries(probabilities)) {
    if (p > bestP) {
      bestP = p;
      best = Number(key);
    }
  }
  return Number.isFinite(best) ? best : 1;
}

/** First sentence of the text, clipped. Deliberately not generated. */
export function summarise(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(flat);
  const sentence = (match ? match[0] : flat).trim();
  return sentence.length <= SUMMARY_MAX_CHARS ? sentence : `${sentence.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}

function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((n, child) => n + countNodes(child), 0);
}
