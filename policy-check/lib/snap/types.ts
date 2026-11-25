/**
 * Wire types for the SubQ Snap "systemone" endpoint.
 *
 * Snap is a decision model: state in, typed answers with probabilities out.
 * It never generates text.
 *   - noul   -> probability that a statement is true (0..1)
 *   - score  -> position on an ordered scale, with a distribution over levels
 *   - choice -> one of N labelled options, with a distribution over options
 */

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  /** Optional rubric for each side of the statement. */
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** Option key -> one-line rubric for when that option applies (or null for a bare label). 1–255 options. */
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  /** Ordered level descriptions, lowest first. Between 2 and 10 entries. */
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted level index; may fall between levels. */
  score: number;
  /** Level index (as a string) -> the criterion text sent in the request. */
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SnapUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * The rulebook's name plus reviewer corrections. Opened once per rulebook
 * and sent along with every clause judge, so each carries only its own clause.
 */
export interface SnapSession {
  id: string;
  state: string;
}

export interface SnapRequest {
  session?: SnapSession;
  /** Per-request state: the node or clause being asked about and the items. */
  state: string;
  questions: Record<string, Question>;
}

export interface SnapResponse {
  model: string;
  answers: Record<string, Answer>;
  usage?: SnapUsage;
  /** How long Snap took to answer, timed around the attempt that succeeded (retry waits excluded). */
  latencyMs?: number;
}

export interface SnapClient {
  /** e.g. "SubQ Snap (live)"; reported with each screening response. */
  readonly name: string;
  openSession(state: string): Promise<SnapSession>;
  decide(request: SnapRequest): Promise<SnapResponse>;
}

export class SnapError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorType?: string,
  ) {
    super(message);
    this.name = "SnapError";
  }
}

/** Narrowing helpers so callers never read `.noul` off a choice answer by accident. */
export function asNoul(answer: Answer | undefined, fallback = 0.5): number {
  return answer?.type === "noul" ? clamp01(answer.noul) : fallback;
}

export function asChoice(answer: Answer | undefined): ChoiceAnswer | undefined {
  return answer?.type === "choice" ? answer : undefined;
}

export function asScore(answer: Answer | undefined): ScoreAnswer | undefined {
  return answer?.type === "score" ? answer : undefined;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
