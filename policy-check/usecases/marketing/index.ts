import type { UseCase } from "@/lib/usecase";

/**
 * Marketing and communications: ads, outbound email, agency contracts and
 * promotional spend, checked against the Marketing & Communications Policy
 * of Sublinear Financial, an invented retail-finance company. The rulebook
 * is synthetic (source/generate.ts).
 */
const marketing: UseCase = {
  id: "marketing",
  kinds: [
    { kind: "email", looksLike: /\bsubject:|\bunsubscribe\b|\bdear \w|\bhi \w+,|\bregards\b|^\s*sms\b/i },
    { kind: "contract", label: "contract clause", looksLike: /\b(shall|hereby|party|parties|agreement|indemnif|terminat)\b/i },
    {
      kind: "transaction",
      looksLike: /\b(txn|exp \d|invoice|payment|paid|wire|reimburse|receipt|PO-\d)\b/i,
      unless: /\b(apply now|sign up|offer)\b/i,
    },
    { kind: "ad", label: "advertisement" },
  ],
  question: "Is this claim within our policy?",
  placeholder: "Guaranteed 5% return",
  severity: {
    audience: "a typical recipient",
    levels: {
      low: "technical or cosmetic",
      medium: "could mislead or needs correction before use",
      high: "clear breach that must be withdrawn",
    },
  },
};

export default marketing;
