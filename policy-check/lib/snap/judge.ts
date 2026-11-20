import type { Corrections, Evidence, Rulebook, ScreenResult, Severity } from "@/lib/types";
import { SEVERITY_LEVELS } from "@/lib/types";
import { hashHex } from "./hash";
import { buildSessionState } from "./questions";
import { asChoice, type Question, type SnapClient, type SnapResponse, type SnapSession } from "./types";

/**
 * Reading the judge's answers: the severity score, the evidence picks and the
 * session a clause's judge request rides on. Shared by scan.ts.
 *
 * Pure: no Next imports, any SnapClient.
 */

export const NEUTRAL_SEVERITY: Severity = { level: "low", score: 0.99, probabilities: [0.34, 0.33, 0.33] };

/**
 * An evidence pick is shown only when Snap put at least this much on it.
 * Below it the model is spreading its answer across several passages, and
 * highlighting one would claim more than it said. Fixed here, not a
 * Threshold: it decides what the result carries, not the verdict.
 */
export const EVIDENCE_FLOOR = 0.35;

/** The passages Snap picked for a judged clause, each side kept only when its pick clears EVIDENCE_FLOOR. */
export function evidenceFor(label: string, questions: Record<string, Question>, response: SnapResponse): NonNullable<ScreenResult["evidence"]> {
  const pick = (key: string): Evidence | undefined => {
    const question = questions[key];
    const answer = asChoice(response.answers[key]);
    if (question?.type !== "choice" || !answer) return undefined;
    const [id, probability] = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0] ?? [];
    const text = id === undefined ? null : question.criteria[id];
    if (!text || probability < EVIDENCE_FLOOR) return undefined;
    return { text, probability };
  };
  const item = pick(`${label}.evidence.item`);
  const clause = pick(`${label}.evidence.clause`);
  return { ...(item ? { item } : {}), ...(clause ? { clause } : {}) };
}

export function toSeverity(probabilities: Record<string, number>): Severity {
  const probs = SEVERITY_LEVELS.map((_, index) => probabilities[String(index)] ?? 0);
  const total = probs.reduce((a, b) => a + b, 0) || 1;
  const normalised = probs.map((p) => p / total) as [number, number, number];
  const score = normalised.reduce((sum, p, index) => sum + p * index, 0);
  const level = SEVERITY_LEVELS[normalised.indexOf(Math.max(...normalised))];
  return { level, score, probabilities: normalised };
}

// ---------------------------------------------------------------------------
// Session cache: one session per client × rulebook × corrections

const sessions = new WeakMap<SnapClient, Map<string, SnapSession>>();

export async function sessionFor(client: SnapClient, rulebook: Pick<Rulebook, "id" | "title">, corrections: Corrections): Promise<SnapSession> {
  const state = buildSessionState(rulebook, corrections);
  const key = `${rulebook.id}:${hashHex(state)}`;
  let perClient = sessions.get(client);
  if (!perClient) {
    perClient = new Map();
    sessions.set(client, perClient);
  }
  const cached = perClient.get(key);
  if (cached) return cached;
  const session = await client.openSession(state);
  // Corrections change the state and the key; bound the cache so a long demo cannot grow it forever.
  if (perClient.size > 32) perClient.clear();
  perClient.set(key, session);
  return session;
}
