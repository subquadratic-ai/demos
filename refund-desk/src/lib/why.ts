import { CONFLICTING_EVIDENCE, INSUFFICIENT_EVIDENCE } from "@/lib/types";

export function explainDecision(input: {
  action: string;
  customerName: string;
  elapsedDays: number | null;
  sectionId: string;
  sectionTitle: string | null;
  sectionText: string | null;
}): string {
  const name = input.customerName;
  if (input.sectionId === INSUFFICIENT_EVIDENCE || input.action === "request_information") {
    if (input.elapsedDays === null) {
      return `The purchase date is missing from ${name}'s account, so the refund window cannot be applied.`;
    }
    return `A fact required to decide ${name}'s refund is missing.`;
  }
  if (input.sectionId === CONFLICTING_EVIDENCE || input.action === "escalate") {
    return `${name} has current records of equal authority, and they disagree.`;
  }
  const clock =
    input.elapsedDays === null
      ? ""
      : `${input.elapsedDays} days have passed since the purchase. `;
  const title = input.sectionTitle ? `${input.sectionTitle} is the section that sets the window. ` : "";
  return `${clock}${title}`.trim();
}
