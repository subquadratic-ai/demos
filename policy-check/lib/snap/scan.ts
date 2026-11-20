import { getConfig } from "@/lib/config";
import { findNode, leavesOf } from "@/lib/rulebook/tree";
import type { Corrections, Evidence, Finding, Item, Rulebook, ScreenResponse, ScreenResult, Thresholds } from "@/lib/types";
import { findingVerdict } from "@/lib/verdict";
import { buildJudgeRequest, buildReadRequest, correctsItem, labelFor, NO_CONTRADICTION, type JudgeEntry, type SeverityWording } from "./questions";
import { EVIDENCE_FLOOR, evidenceFor, NEUTRAL_SEVERITY, sessionFor, toSeverity } from "./judge";
import { asChoice, asNoul, asScore, type SnapClient, type SnapRequest, type SnapResponse } from "./types";

/**
 * Whole-document screening: the engine.
 *
 *   1. Read. ONE request whose state is the entire rulebook (every clause's
 *      full section, in order, under its chapter heading) followed by the
 *      items. Per item it asks two questions only, because latency grows
 *      with the number of questions, not with the context: a Choice over
 *      `none` plus every clause ("which clause does the item contradict most
 *      clearly?"), and a Choice over the item's own passages.
 *   2. Judge. The read's top clause, plus each runner-up the read rated as a
 *      likelier contradiction than `none` (see pickCandidates), is judged on
 *      its own clause with buildJudgeRequest (applies, complies,
 *      severity, evidence on both sides). One small request per candidate
 *      rank, all in parallel; with one item that is one request per clause.
 *
 * Each candidate becomes a Finding; the verdict is arithmetic over them
 * (findingVerdict / overallVerdict in lib/verdict.ts).
 *
 * A document that does not fit the context window, or has more clauses
 * than one Choice can offer, is refused with a TooBigError that says so.
 *
 * Pure: no Next imports, any SnapClient.
 */

export interface ScanOptions {
  rulebook: Pick<Rulebook, "id" | "title" | "organisation" | "pages" | "tree">;
  items: Item[];
  thresholds: Thresholds;
  corrections: Corrections;
  client: SnapClient;
  /** The use case's wording for the severity question; neutral when omitted. */
  severity?: SeverityWording;
  /** Snap's context window in tokens; SNAP_CONTEXT_TOKENS when omitted. */
  contextTokens?: number;
}

/** The most clauses judged per item. Judges run in parallel, so each extra one costs tokens (~1K), not time. */
export const MAX_CANDIDATES = 3;

/**
 * A runner-up is judged only when the read put at least this much on it AND
 * more than on `none`. Live, the clear breaches (it-036, it-287) put under
 * 0.015 on `none` and 0.02 to 0.07 on neighbouring clauses that the judge
 * also flags; the clean alert and the borderline cashback ad put 0.78 and
 * 0.46 on `none`, so only their top clause is judged.
 */
export const MIN_FOUND = 0.02;

/** Tokens per word of policy prose. Measured 1.20 on the 380-page sample (212K tokens, 176K words); rounded up. */
export const TOKENS_PER_WORD = 1.3;

/** Kept free under the context window for the model's own framing, on top of the request's estimated size. */
export const READ_HEADROOM_TOKENS = 8_192;

/** A Choice offers at most 255 options; the read's carries `none` plus every clause. */
export const MAX_CHOICE_OPTIONS = 255;

/** The document cannot be read in one request. The message says why, for the page to show as is. */
export class TooBigError extends Error {}

export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * TOKENS_PER_WORD);
}

/** Whether the whole-document read fits: the request's estimated tokens against the window minus headroom. */
export function fitsWholeDocument(request: SnapRequest, leaves: number, contextTokens: number): { fits: boolean; tokens: number; limit: number } {
  const tokens = estimateTokens(request.state) + estimateTokens(JSON.stringify(request.questions).replace(/[{}":,]/g, " "));
  const limit = contextTokens - READ_HEADROOM_TOKENS;
  return { fits: tokens <= limit && leaves + 1 <= MAX_CHOICE_OPTIONS, tokens, limit };
}

/**
 * Which clauses to judge, from the read's Choice. The top clause always, even
 * when `none` wins, so a clean item is still shown against the clause that
 * governs it ("Yes, it meets 6.5"). Then runners-up, most likely first, while
 * they clear MIN_FOUND and beat `none`, up to MAX_CANDIDATES. Clauses a
 * reviewer has ruled on for this item (`forced`) are always judged, so a
 * re-check reads the decision.
 */
export function pickCandidates(probabilities: Record<string, number>, leafIds: string[], forced: string[] = []): { leafId: string; found: number }[] {
  const none = probabilities[NO_CONTRADICTION] ?? 0;
  const ranked = leafIds.map((leafId) => ({ leafId, found: probabilities[leafId] ?? 0 })).sort((a, b) => b.found - a.found);
  const out: { leafId: string; found: number }[] = [];
  const add = (candidate: { leafId: string; found: number }) => {
    if (!out.some((c) => c.leafId === candidate.leafId)) out.push(candidate);
  };
  if (ranked[0] && ranked[0].found > 0) add(ranked[0]);
  for (const candidate of ranked.slice(1)) {
    if (out.length >= MAX_CANDIDATES || candidate.found < MIN_FOUND || candidate.found <= none) break;
    add(candidate);
  }
  for (const leafId of forced) {
    if (leafIds.includes(leafId)) add({ leafId, found: probabilities[leafId] ?? 0 });
  }
  return out;
}

const RANK = { flagged: 0, review: 1, cleared: 2 } as const;

/** Most serious first (flagged, then needs a human, then cleared), then by how strongly the read pointed at the clause. findings[0] always carries the overall verdict. */
export function orderFindings(findings: Finding[], thresholds: Thresholds): Finding[] {
  return [...findings].sort((a, b) => RANK[findingVerdict(a, thresholds)] - RANK[findingVerdict(b, thresholds)] || b.found - a.found);
}

export async function scanDocument(options: ScanOptions): Promise<ScreenResponse> {
  const { rulebook, items, thresholds, corrections, client, severity } = options;
  const leaves = leavesOf(rulebook.tree).filter((leaf) => leaf !== rulebook.tree);
  const entries = items.map((item, index) => ({ label: labelFor(index), item }));
  const read = buildReadRequest(rulebook, leaves, entries, corrections);
  const contextTokens = options.contextTokens ?? getConfig().snapContextTokens;
  if (leaves.length < 2) throw new TooBigError("This document has no clauses to check against: its headings could not be read.");
  const fit = fitsWholeDocument(read, leaves.length, contextTokens);
  if (!fit.fits) {
    throw new TooBigError(
      leaves.length + 1 > MAX_CHOICE_OPTIONS
        ? `This document has ${leaves.length} clauses; one read can choose between at most ${MAX_CHOICE_OPTIONS - 1}.`
        : `This document is about ${Math.round(fit.tokens / 1000)}K tokens; Snap reads up to ${Math.round(fit.limit / 1000)}K in one request.`,
    );
  }

  const session = await sessionFor(client, rulebook, corrections);
  const counter = { requests: 0, inputTokens: 0, outputTokens: 0 };
  const decide = async (request: SnapRequest): Promise<SnapResponse> => {
    const response = await client.decide(request);
    counter.requests += 1;
    counter.inputTokens += response.usage?.input_tokens ?? 0;
    counter.outputTokens += response.usage?.output_tokens ?? 0;
    return response;
  };

  // Round 1: the whole document, one request. Corrections ride in its state, so no session.
  const readResponse = await decide(read);
  const readStats = { tokens: readResponse.usage?.input_tokens ?? 0, ...(readResponse.latencyMs === undefined ? {} : { ms: readResponse.latencyMs }) };
  const leafIds = leaves.map((leaf) => leaf.nodeId);
  const candidates = entries.map(({ label, item }) => {
    const probabilities = asChoice(readResponse.answers[`${label}.contradicts`])?.probabilities ?? {};
    const forced = Object.entries(corrections)
      .filter(([, lines]) => lines.some((line) => correctsItem(line, item.text)))
      .map(([leafId]) => leafId);
    return pickCandidates(probabilities, leafIds, forced);
  });

  // Round 2: one judge request per candidate rank, all at once. Request r judges every item's r-th clause.
  const ranks = Math.max(0, ...candidates.map((list) => list.length));
  const judged = await Promise.all(
    Array.from({ length: ranks }, async (_, rank) => {
      const judgeEntries: JudgeEntry[] = entries.flatMap(({ label, item }, index) => {
        const leaf = candidates[index][rank] && findNode(rulebook.tree, candidates[index][rank].leafId);
        return leaf ? [{ label, item, leaf }] : [];
      });
      const request = buildJudgeRequest(judgeEntries, severity, corrections);
      const response = await decide({ ...request, session });
      return { request, response };
    }),
  );

  const results: ScreenResult[] = entries.map(({ label, item }, index) => {
    const findings: Finding[] = candidates[index].map((candidate, rank) => {
      const { request, response } = judged[rank];
      const severityAnswer = asScore(response.answers[`${label}.severity`]);
      const evidence = evidenceFor(label, request.questions, response);
      return {
        leafId: candidate.leafId,
        found: candidate.found,
        applies: asNoul(response.answers[`${label}.applies`], 0),
        complies: asNoul(response.answers[`${label}.complies`], 0.5),
        severity: severityAnswer ? toSeverity(severityAnswer.probabilities) : NEUTRAL_SEVERITY,
        ...(evidence.item || evidence.clause ? { evidence } : {}),
        ...(response.latencyMs === undefined ? {} : { judgeMs: response.latencyMs }),
      };
    });
    const ordered = orderFindings(findings, thresholds);
    const top = ordered[0];
    // The read's own pick from the item fills the top finding's item side when its judge had none to show.
    // Not on a corrected clause: a re-check keeps the earlier marks client-side (lib/client/screening.ts).
    const readPick = pickFromRead(label, read, readResponse);
    if (top && readPick && !top.evidence?.item && !((corrections[top.leafId]?.length ?? 0) > 0)) {
      top.evidence = { ...top.evidence, item: readPick };
    }
    const judgeMs = Math.max(0, ...ordered.map((finding) => finding.judgeMs ?? 0));
    const timing = {
      ...(judgeMs > 0 ? { judgeMs } : {}),
      ...(readStats.ms !== undefined ? { decisionMs: readStats.ms + judgeMs } : {}),
    };
    if (!top) {
      // The read returned no clause at all: nothing to judge, a person places it.
      return { itemId: item.id, leafId: null, applies: 0, complies: 0, severity: NEUTRAL_SEVERITY, ...timing, clausesCompared: leaves.length, findings: [], read: readStats };
    }
    return {
      itemId: item.id,
      leafId: top.leafId,
      applies: top.applies,
      complies: top.complies,
      severity: top.severity,
      ...timing,
      clausesCompared: leaves.length,
      findings: ordered,
      read: readStats,
      ...(top.evidence ? { evidence: top.evidence } : {}),
    };
  });

  return { results, requests: counter.requests, inputTokens: counter.inputTokens, outputTokens: counter.outputTokens, clientName: client.name };
}

/** The read's pick from the item ("which part conflicts most"), when it clears EVIDENCE_FLOOR. */
function pickFromRead(label: string, request: SnapRequest, response: SnapResponse): Evidence | undefined {
  const question = request.questions[`${label}.evidence.item`];
  const answer = asChoice(response.answers[`${label}.evidence.item`]);
  if (question?.type !== "choice" || !answer) return undefined;
  const [id, probability] = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0] ?? [];
  const text = id === undefined ? null : question.criteria[id];
  if (!text || probability < EVIDENCE_FLOOR) return undefined;
  return { text, probability };
}
