/**
 * Minimal typed client for the subQ Decisions API (POST /v1/systemone).
 *
 * The server keeps SUBQ_API_KEY private; this module is only ever imported
 * from server-side code (API routes).
 */

const BASE_URL = process.env.SUBQ_BASE_URL ?? "https://api.subq.ai/v1";
const MODEL = process.env.SUBQ_MODEL ?? process.env.SNAP_MODEL ?? "subq-snap-latest";

// ---- Question definitions (what we ask the model) -------------------------

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;

// ---- Answer shapes (what the model returns) -------------------------------

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type DecisionResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
};

export type DecisionImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export class DecisionsApiError extends Error {
  constructor(
    public status: number,
    public errorType: string,
    message: string,
  ) {
    super(message);
    this.name = "DecisionsApiError";
  }
}

/**
 * Call the Decisions API once. `state` can be text, an object, or an array.
 */
export async function decide(params: {
  state: unknown;
  questions: Questions;
  images?: DecisionImage[];
  signal?: AbortSignal;
}): Promise<DecisionResponse> {
  const apiKey =
    process.env.SUBQ_API_KEY ?? process.env.SNAP_API_KEY ?? process.env.SNAP_KEY;
  if (!apiKey) {
    throw new DecisionsApiError(
      500,
      "configuration_error",
      "SUBQ_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    state: params.state,
    questions: params.questions,
  };
  if (params.images?.length) body.images = params.images;

  const response = await fetch(`${BASE_URL}/systemone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    let errorType = "error";
    let message = `Request failed with status ${response.status}`;
    try {
      const err = await response.json();
      errorType = err?.detail?.error_type ?? errorType;
      message = err?.detail?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new DecisionsApiError(response.status, errorType, message);
  }

  return (await response.json()) as DecisionResponse;
}

/**
 * Retry helper for transient failures (429 / 503) with exponential backoff.
 * 422 and other client errors are not retried.
 */
export async function decideWithRetry(
  params: Parameters<typeof decide>[0],
  { retries = 3, baseDelayMs = 500 } = {},
): Promise<DecisionResponse> {
  let attempt = 0;
  for (;;) {
    try {
      return await decide(params);
    } catch (error) {
      const retriable =
        error instanceof DecisionsApiError &&
        (error.status === 429 || error.status === 503);
      if (!retriable || attempt >= retries) throw error;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
