import { estimateInputCostUsd } from "@/lib/format";
import { lookupGoverningSection } from "@/lib/bundle";
import {
  SUBQ_DECISION_URL,
  type DecisionSuccess,
  type SourceDocument,
} from "@/lib/types";

type DecisionPayload = {
  model: string;
  state: unknown;
  questions: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function providerErrorMessage(status: number, body: unknown): string {
  const detail = isRecord(body) ? body.detail : undefined;
  const detailRecord = isRecord(detail) ? detail : undefined;
  const message =
    detailRecord && typeof detailRecord.message === "string"
      ? detailRecord.message
      : null;
  const errorType =
    detailRecord && typeof detailRecord.error_type === "string"
      ? detailRecord.error_type
      : null;

  if (status === 401) {
    return "The decision service rejected the API key.";
  }
  if (status === 402) {
    return "The account does not have enough credits to run a decision.";
  }
  if (status === 403) {
    return "This API key cannot run the decision.";
  }
  if (status === 429) {
    return "The decision service is busy. Wait a moment and try again.";
  }
  if (message) {
    return `The decision service returned ${status}${errorType ? ` (${errorType})` : ""}. ${message}`;
  }
  if (status >= 500) {
    return `The decision service is unavailable (${status}).`;
  }
  return `The decision service returned ${status}.`;
}

export async function requestDecision(payload: DecisionPayload, documents: SourceDocument[]): Promise<
  | { ok: true; result: Omit<DecisionSuccess, "ok" | "clientRequestId" | "scenarioId" | "documentVersion" | "fingerprint" | "bundle" | "placement"> }
  | { ok: false; status: number; error: string; body: unknown }
> {
  const apiKey = process.env.SUBQ_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        "No API key is configured on the server. Add it to the server environment and restart.",
      body: null,
    };
  }

  const started = performance.now();
  let response: Response;
  let rawText = "";
  try {
    response = await fetch(SUBQ_DECISION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    rawText = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request failed.";
    return {
      ok: false,
      status: 502,
      error: `The server could not complete the decision request. ${message}`,
      body: null,
    };
  }
  const providerRoundTripMs = performance.now() - started;

  let body: unknown = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText) as unknown;
    } catch {
      body = { raw: rawText };
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: providerErrorMessage(response.status, body),
      body,
    };
  }

  const record = isRecord(body) ? body : {};
  const answers = isRecord(record.answers) ? record.answers : {};
  const actionAnswer = isRecord(answers.action) ? answers.action : {};
  const sectionAnswer = isRecord(answers.governing_section)
    ? answers.governing_section
    : {};
  const usage = isRecord(record.usage) ? record.usage : {};
  const warnings: string[] = [];

  const action = typeof actionAnswer.choice === "string" ? actionAnswer.choice : "(missing)";
  if (action === "(missing)") {
    warnings.push("The response did not include answers.action.choice.");
  }

  const actionProbabilities: Record<string, number> = {};
  if (isRecord(actionAnswer.probabilities)) {
    for (const [key, value] of Object.entries(actionAnswer.probabilities)) {
      if (typeof value === "number") actionProbabilities[key] = value;
    }
  } else {
    warnings.push("The response did not include answers.action.probabilities.");
  }

  const governingId =
    typeof sectionAnswer.choice === "string" ? sectionAnswer.choice : "(missing)";
  if (governingId === "(missing)") {
    warnings.push("The response did not include answers.governing_section.choice.");
  }

  const inputTokens =
    typeof usage.input_tokens === "number" ? usage.input_tokens : null;
  const outputTokens =
    typeof usage.output_tokens === "number" ? usage.output_tokens : null;
  if (inputTokens === null) {
    warnings.push("The response did not include usage.input_tokens.");
  }

  return {
    ok: true,
    result: {
      action,
      actionProbabilities,
      actionConfidence:
        typeof actionAnswer.confidence === "number" ? actionAnswer.confidence : null,
      governingSection: lookupGoverningSection(documents, governingId),
      inputTokens,
      outputTokens,
      providerRoundTripMs,
      estimatedInputCostUsd:
        inputTokens === null ? null : estimateInputCostUsd(inputTokens),
      model: typeof record.model === "string" ? record.model : null,
      responseWarning: warnings.length > 0 ? warnings.join(" ") : null,
      rawResponse: body,
      request: payload,
    },
  };
}
