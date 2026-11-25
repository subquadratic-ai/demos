import { ACTION_ORDER, INPUT_USD_PER_MILLION } from "@/lib/types";

export function estimateInputCostUsd(inputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(6)}`;
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString("en-US");
}

export function formatDuration(ms: number): string {
  return `${Math.round(ms).toLocaleString("en-US")} ms`;
}

export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

const ACTION_LABELS: Record<(typeof ACTION_ORDER)[number], string> = {
  approve_refund: "Approve refund",
  decline_refund: "Decline refund",
  request_information: "Request information",
  escalate: "Escalate",
};

export function actionLabel(choice: string): string {
  if (choice in ACTION_LABELS) {
    return ACTION_LABELS[choice as keyof typeof ACTION_LABELS];
  }
  return choice;
}
