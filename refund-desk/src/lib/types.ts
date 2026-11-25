export const EVALUATION_DATE = "2026-10-16";

export const ACTION_CHOICES = {
  approve_refund:
    "the available facts establish eligibility under the applicable policy.",
  decline_refund:
    "the available facts establish ineligibility under the applicable policy.",
  request_information: "a necessary customer or purchase fact is missing.",
  escalate:
    "an unresolved authority or policy conflict requires human review.",
} as const;

export const ACTION_ORDER = [
  "approve_refund",
  "decline_refund",
  "request_information",
  "escalate",
] as const;

export type ActionChoice = (typeof ACTION_ORDER)[number];

export const INSUFFICIENT_EVIDENCE = "insufficient_evidence";
export const CONFLICTING_EVIDENCE = "conflicting_evidence";

export type DocumentKind =
  | "policy"
  | "terms"
  | "agreement"
  | "amendment"
  | "record"
  | "conversation"
  | "historical"
  | "guide";

export type DocumentStatus = "active" | "superseded" | "expired" | "draft";

export type BundleSize = "compact" | "large";
export type ExceptionPlacement = "beginning" | "middle" | "end";

export type Section = {
  id: string;
  title: string;
  text: string;
};

export type SourceDocument = {
  id: string;
  title: string;
  kind: DocumentKind;
  customerId: string | null;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: DocumentStatus;
  sections: Section[];
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  organization: string;
  plan: string;
  accountStatus: string;
  accountOpened: string;
};

export type Scenario = {
  id: string;
  label: string;
  category: string;
  summary: string;
  customerId: string;
  purchaseDate: string | null;
  productName: string | null;
  amountUsd: number | null;
  orderId: string | null;
  refundRequest: string;
  documentIds: string[];
  movableDocumentId: string | null;
  editableSectionIds: string[];
};

export type Catalog = {
  evaluationDate: string;
  customers: Customer[];
  scenarios: Scenario[];
};

export type SectionEditMap = Record<string, string | null>;

export type GoverningSectionMatch = {
  id: string;
  found: boolean;
  title: string | null;
  text: string | null;
  documentId: string | null;
  documentTitle: string | null;
  customerId: string | null;
  version: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: DocumentStatus | null;
};

export type DecisionSuccess = {
  ok: true;
  clientRequestId: string;
  scenarioId: string;
  documentVersion: number;
  fingerprint: string;
  bundle: BundleSize;
  placement: ExceptionPlacement;
  action: string;
  actionProbabilities: Record<string, number>;
  actionConfidence: number | null;
  governingSection: GoverningSectionMatch;
  inputTokens: number | null;
  outputTokens: number | null;
  providerRoundTripMs: number;
  estimatedInputCostUsd: number | null;
  model: string | null;
  responseWarning: string | null;
  rawResponse: unknown;
  request: {
    model: string;
    state: unknown;
    questions: unknown;
  };
};

export type DecisionFailure = {
  ok: false;
  error: string;
  status: number;
};

export const POLICY_KINDS = new Set<DocumentKind>([
  "policy",
  "terms",
  "agreement",
  "amendment",
]);

export const INPUT_USD_PER_MILLION = 0.05;
export const SUBQ_MODEL = "subq-snap-latest";
export const SUBQ_DECISION_URL = "https://api.subq.ai/v1/systemone";
export const CONTEXT_TOKEN_LIMIT = 393_216;
export const MAX_CHOICES = 255;
