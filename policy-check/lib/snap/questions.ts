import { SEVERITY_LEVELS, type Corrections, type Item, type Rulebook, type SeverityLevel, type TreeNode } from "@/lib/types";
import { clauseOf } from "@/lib/rulebook/tree";
import { segmentsOf } from "./segments";
import type { ChoiceQuestion, NoulQuestion, Question, ScoreQuestion, SnapRequest } from "./types";

/**
 * Every question the app asks Snap, and the state blocks they refer to.
 *
 * The layout is written so the model reads it naturally: one `## HEADING` per block,
 * the document or the clause first, items last. Items in a request are
 * labelled i00..i49 both in the `## ITEM` headings and in the question ids,
 * so a question like "i07.complies" unambiguously points at one item block.
 *
 * The read carries the whole document; each judge carries only the clause
 * it asks about, so the per-clause checks stay small.
 */

/** "i07" for the 8th item in a batch. */
export function labelFor(index: number): string {
  return `i${String(index).padStart(2, "0")}`;
}

/** The domain words in the severity question. Everything else Snap is asked is the same for every use case. */
export interface SeverityWording {
  /** Who a breach affects, as in "how serious is the breach for a typical recipient?". */
  audience?: string;
  /** What each level means in this domain. */
  levels: Record<SeverityLevel, string>;
}

export const DEFAULT_SEVERITY: SeverityWording = {
  levels: {
    low: "minor or technical",
    medium: "needs correcting before it goes ahead",
    high: "serious breach that must be stopped",
  },
};

export const HEADING_LEVELS = ["chapter", "section", "subsection"] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

// ---------------------------------------------------------------------------
// State blocks

/** Names the rulebook. The outline itself is not sent: each NODE block already lists the children a step chooses from. */
export function rulebookBlock(rulebook: Pick<Rulebook, "title">): string {
  return `## RULEBOOK ${rulebook.title}`;
}

export function correctionsBlock(leafId: string, lines: string[]): string {
  return `## CORRECTIONS ${leafId}\n${lines.join("\n")}`;
}

/**
 * One reviewer decision, as Snap reads it under CORRECTIONS. Live runs showed
 * the wording matters: a terse "<item> judged cleared by reviewer" was
 * ignored or even read against the item; quoting the item and naming the
 * clause and the outcome is followed.
 */
export function correctionLine(itemText: string, leafId: string, verdict: "cleared" | "flagged"): string {
  const decision = verdict === "cleared" ? "complies with" : "breaches";
  return `Reviewer decision: the item "${itemText.trim()}" ${decision} clause ${leafId}. Treat it as ${verdict}.`;
}

/** Whether a correction line is about this item. */
export function correctsItem(line: string, itemText: string): boolean {
  return line.includes(`"${itemText.trim()}"`);
}

export function clauseBlock(leaf: Pick<TreeNode, "nodeId" | "title" | "text" | "summary">): string {
  return [`## CLAUSE ${leaf.nodeId}`, leaf.title, clauseOf(leaf)].join("\n");
}

/**
 * The whole document as one state block, for the whole-document read: a
 * heading naming the rulebook, then every chapter heading and every clause's
 * full section text (not just clauseOf), in document order. Nothing is cut;
 * the read is only asked when this fits the context window (see scan.ts).
 */
export function documentBlock(rulebook: Pick<Rulebook, "title" | "organisation" | "pages" | "tree">): string {
  const parts = [`## RULEBOOK ${rulebook.title} (${rulebook.organisation}), ${rulebook.pages} pages`];
  const visit = (node: TreeNode, depth: number) => {
    if (node.children.length === 0) {
      parts.push(`### CLAUSE ${node.nodeId} ${node.title} (pp. ${node.pageStart}-${node.pageEnd})\n${(node.text ?? node.summary).trim()}`);
      return;
    }
    if (depth > 0) parts.push(`## ${depth === 1 ? "CHAPTER" : "SECTION"} ${node.nodeId} ${node.title}`);
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(rulebook.tree, 0);
  return parts.join("\n\n");
}

export interface ReadEntry {
  label: string;
  item: Item;
}

/** Option key for "the item contradicts no clause" in the read's Choice. Never a clause id. */
export const NO_CONTRADICTION = "none";

/**
 * The whole-document read: the entire rulebook and the items in one state,
 * and per item two questions only (latency grows with the question count,
 * not with the context). A Choice over every clause plus `none`: which
 * clause does the item contradict most clearly; and a Choice over the
 * item's own passages: which part conflicts most. Corrections are carried
 * as blocks after the document so a re-check reads the reviewer's decision.
 */
export function buildReadRequest(
  rulebook: Pick<Rulebook, "title" | "organisation" | "pages" | "tree">,
  leaves: Pick<TreeNode, "nodeId" | "title">[],
  entries: ReadEntry[],
  corrections: Corrections = {},
): SnapRequest {
  const clauses: Record<string, string | null> = { [NO_CONTRADICTION]: "It contradicts no clause." };
  for (const leaf of leaves) clauses[leaf.nodeId] = `Clause ${leaf.nodeId}: ${leaf.title}`;
  const questions: Record<string, Question> = {};
  for (const { label, item } of entries) {
    questions[`${label}.contradicts`] = {
      type: "choice",
      instructions: `Which clause of the RULEBOOK does item ${label} contradict most clearly? Pick ${NO_CONTRADICTION} if it contradicts no clause.`,
      criteria: clauses,
    };
    const segments = segmentsOf(item.text, "item");
    if (segments.length >= 2) {
      questions[`${label}.evidence.item`] = {
        type: "choice",
        instructions: `Which part of item ${label} conflicts most with the RULEBOOK? If nothing conflicts, pick the part that matters most. Each option is quoted from item ${label}.`,
        criteria: segmentCriteria(segments),
      };
    }
  }
  const correctionBlocks = Object.entries(corrections)
    .filter(([, lines]) => lines.length > 0)
    .map(([leafId, lines]) => correctionsBlock(leafId, lines));
  return {
    state: [documentBlock(rulebook), ...correctionBlocks, ...entries.map(({ label, item }) => itemBlock(label, item))].join("\n\n"),
    questions,
  };
}

export function itemBlock(label: string, item: Item): string {
  return [`## ITEM ${label} ${item.id}`, `kind: ${item.kind}`, item.text.trim()].join("\n");
}

export function lineBlock(label: string, text: string): string {
  return `## LINE ${label}\n${text.trim()}`;
}

/** The session state: which rulebook, plus every reviewer correction. Prepended to each request in the session. */
export function buildSessionState(rulebook: Pick<Rulebook, "title">, corrections: Corrections): string {
  const blocks = [rulebookBlock(rulebook)];
  for (const [leafId, lines] of Object.entries(corrections)) {
    if (lines.length > 0) blocks.push(correctionsBlock(leafId, lines));
  }
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Requests

export interface JudgeEntry {
  label: string;
  item: Item;
  leaf: TreeNode;
}

/**
 * At a leaf: does the clause apply, does the item comply, how bad is it.
 * Three narrow questions, never one verdict, plus the two evidence Choices
 * (see evidenceQuestions). When a reviewer has corrected an item under this
 * clause, the questions say how to read that decision; a correction block
 * on its own is not enough for the model to act on. A corrected clause gets
 * no evidence Choices.
 */
export function buildJudgeRequest(
  entries: JudgeEntry[],
  severityWording: SeverityWording = DEFAULT_SEVERITY,
  corrections: Corrections = {},
): SnapRequest {
  const audience = severityWording.audience ? ` for ${severityWording.audience}` : "";
  const leaves = dedupeBy(entries.map((entry) => entry.leaf), (leaf) => leaf.nodeId);
  const items = dedupeBy(entries, (entry) => entry.label);
  const questions: Record<string, Question> = {};
  for (const entry of entries) {
    const { label, leaf } = entry;
    const item = label;
    const corrected = (corrections[leaf.nodeId]?.length ?? 0) > 0;
    const applies = appliesQuestion(item, leaf.nodeId);
    if (corrected) {
      applies.instructions += ` A reviewer's decisions on this clause are under CORRECTIONS ${leaf.nodeId}; if one is about item ${item}, the clause applies to it.`;
    }
    questions[`${label}.applies`] = applies;
    const complies: NoulQuestion = {
      type: "noul",
      instructions:
        `Judged only against clause ${leaf.nodeId} (${leaf.title}), does item ${item} comply with it? ` +
        "Ignore every other clause. Treat a missing required disclosure or label as non-compliance." +
        (corrected
          ? ` A reviewer's decisions on this clause are under CORRECTIONS ${leaf.nodeId}. If one of them is about item ${item}, follow it: true if the reviewer decided the item complies, false if they decided it breaches the clause.`
          : ""),
      criteria: {
        true: "The item meets every requirement the clause states, or the clause places no requirement on it.",
        false: "The item breaches the clause, omits something the clause requires, or uses wording the clause prohibits.",
      },
    };
    questions[`${label}.complies`] = complies;
    const severity: ScoreQuestion = {
      type: "score",
      instructions:
        `If item ${item} breaches clause ${leaf.nodeId}, how serious is the breach${audience}? ` +
        "Answer low when the item is compliant or the issue is cosmetic.",
      criteria: SEVERITY_LEVELS.map((level) => `${level}: ${severityWording.levels[level]}`),
    };
    questions[`${label}.severity`] = severity;
    // A re-check after a reviewer's decision is asked exactly as before: live, the evidence choices
    // moved the cleared cashback ad (it-251 at 4.5) from 0.91 to 0.89 complies, back under the line.
    if (corrected) continue;
    const evidence = evidenceQuestions(item, entry.item, leaf);
    if (evidence.item) questions[`${label}.evidence.item`] = evidence.item;
    if (evidence.clause) questions[`${label}.evidence.clause`] = evidence.clause;
  }
  return {
    state: [...leaves.map(clauseBlock), ...items.map((entry) => itemBlock(entry.label, entry.item))].join("\n\n"),
    questions,
  };
}

/**
 * Evidence, asked alongside the judgement: which passage of the item and
 * which passage of the clause the judgement turns on. Each is a Choice over
 * segments of that text (lib/snap/segments.ts), so the page can highlight
 * exactly what Snap picked. They read the same CLAUSE and ITEM blocks as the
 * judgement and add no state. A text with fewer than two segments gets no
 * question: there is nothing to choose.
 *
 * Live runs showed the clause question needs pointing at the rule: asked
 * only which part the item "meets or breaks", Snap split between the
 * prohibition in 3.3 and the sentence saying which products it covers, and
 * the order of the options decided between them.
 */
export function evidenceQuestions(item: string, source: Item, leaf: Pick<TreeNode, "nodeId" | "title" | "text" | "summary">): { item?: ChoiceQuestion; clause?: ChoiceQuestion } {
  const out: { item?: ChoiceQuestion; clause?: ChoiceQuestion } = {};
  const itemSegments = segmentsOf(source.text, "item");
  if (itemSegments.length >= 2) {
    out.item = {
      type: "choice",
      instructions:
        `Which part of item ${item} bears most directly on clause ${leaf.nodeId} (${leaf.title})? ` +
        "If the item breaches the clause, pick the words that breach it; otherwise pick the words that satisfy it. " +
        `Each option is quoted from item ${item}.`,
      criteria: segmentCriteria(itemSegments),
    };
  }
  const clauseSegments = segmentsOf(clauseOf(leaf), "clause");
  if (clauseSegments.length >= 2) {
    out.clause = {
      type: "choice",
      instructions:
        `Which requirement or prohibition in clause ${leaf.nodeId} (${leaf.title}) does the wording of item ${item} most directly meet or break? ` +
        "Pick the words that state the rule, not words that only say what the clause covers. " +
        `Each option is quoted from clause ${leaf.nodeId}.`,
      criteria: segmentCriteria(clauseSegments),
    };
  }
  return out;
}

/** Short option ids, s1..sN, each mapped to its segment's exact text. */
function segmentCriteria(segments: string[]): Record<string, string> {
  return Object.fromEntries(segments.map((segment, index) => [`s${index + 1}`, segment]));
}

export interface HeadingEntry {
  label: string;
  text: string;
}

/** Indexer: is this line a heading, and at what level. */
export function buildHeadingRequest(entries: HeadingEntry[]): SnapRequest {
  const questions: Record<string, Question> = {};
  for (const { label } of entries) {
    questions[`${label}.is_heading`] = {
      type: "noul",
      instructions:
        `Line ${label} is below, taken from a policy document. Is it a section heading rather than body text, ` +
        "a table cell, a page header/footer or a list item?",
      criteria: {
        true: "A short title that introduces the section that follows, often numbered.",
        false: "A sentence of body text, a running header, a page number, a caption or a bullet.",
      },
    };
    questions[`${label}.level`] = {
      type: "score",
      instructions: `If line ${label} is a heading, at which level of the document outline does it sit?`,
      criteria: [
        "chapter: a top-level part or chapter heading",
        "section: a numbered section within a chapter, e.g. 3.4",
        "subsection: a sub-heading within a section, e.g. 3.4.1",
      ],
    };
  }
  return {
    state: entries.map((entry) => lineBlock(entry.label, entry.text)).join("\n\n"),
    questions,
  };
}

function appliesQuestion(item: string, leafId: string): NoulQuestion {
  return {
    type: "noul",
    instructions:
      `Does clause ${leafId} apply to item ${item} at all? Answer true when the clause governs the kind of ` +
      "statement, channel, payment or contract term the item is, regardless of whether the item complies.",
    criteria: {
      true: "The clause is about what this item is or claims.",
      false: "The clause concerns a different subject; a reviewer would not read this item against it.",
    },
  };
}

function dedupeBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const k = key(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}
