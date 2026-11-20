import {
  EVALUATION_DATE,
  type Catalog,
  type Customer,
  type ExceptionPlacement,
  type Scenario,
  type BundleSize,
} from "@/lib/types";

const BUNDLE_SIZES = new Set<BundleSize>(["compact", "large"]);
const PLACEMENTS = new Set<ExceptionPlacement>(["beginning", "middle", "end"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing a string ${key}.`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${label} has an invalid ${key}.`);
  }
  return value.length === 0 ? null : value;
}

function stringList(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} is missing a string list ${key}.`);
  }
  return value as string[];
}

export function parseCustomer(value: unknown): Customer {
  if (!isRecord(value)) throw new Error("A customer entry is not an object.");
  const id = requiredString(value, "id", "Customer");
  return {
    id,
    name: requiredString(value, "name", id),
    email: requiredString(value, "email", id),
    organization: requiredString(value, "organization", id),
    plan: requiredString(value, "plan", id),
    accountStatus: requiredString(value, "accountStatus", id),
    accountOpened: requiredString(value, "accountOpened", id),
  };
}

export function parseScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new Error("A scenario entry is not an object.");
  const id = requiredString(value, "id", "Scenario");
  const amount = value.amountUsd;
  if (amount !== null && typeof amount !== "number") {
    throw new Error(`${id} has an invalid amountUsd.`);
  }
  const movable = value.movableDocumentId;
  if (movable !== null && typeof movable !== "string") {
    throw new Error(`${id} has an invalid movableDocumentId.`);
  }
  return {
    id,
    label: requiredString(value, "label", id),
    category: requiredString(value, "category", id),
    summary: requiredString(value, "summary", id),
    customerId: requiredString(value, "customerId", id),
    purchaseDate: optionalString(value, "purchaseDate", id),
    productName: optionalString(value, "productName", id),
    amountUsd: amount,
    orderId: optionalString(value, "orderId", id),
    refundRequest: requiredString(value, "refundRequest", id),
    documentIds: stringList(value, "documentIds", id),
    movableDocumentId: movable,
    editableSectionIds: stringList(value, "editableSectionIds", id),
  };
}

export function parseCatalog(scenarios: unknown, customers: unknown): Catalog {
  if (!Array.isArray(scenarios) || !Array.isArray(customers)) {
    throw new Error("Scenario and customer files must be arrays.");
  }
  return {
    evaluationDate: EVALUATION_DATE,
    scenarios: scenarios.map(parseScenario),
    customers: customers.map(parseCustomer),
  };
}

export function isBundleSize(value: string): value is BundleSize {
  return BUNDLE_SIZES.has(value as BundleSize);
}

export function isPlacement(value: string): value is ExceptionPlacement {
  return PLACEMENTS.has(value as ExceptionPlacement);
}
