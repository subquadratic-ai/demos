import fs from "fs";
import path from "path";
import { parseCatalog } from "@/lib/catalog";
import { placeDocument } from "@/lib/bundle";
import {
  type BundleSize,
  type Customer,
  type DocumentKind,
  type DocumentStatus,
  type ExceptionPlacement,
  type Scenario,
  type SourceDocument,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");

const KINDS = new Set<DocumentKind>([
  "policy",
  "terms",
  "agreement",
  "amendment",
  "record",
  "conversation",
  "historical",
  "guide",
]);

const STATUSES = new Set<DocumentStatus>([
  "active",
  "superseded",
  "expired",
  "draft",
]);

export type Library = {
  scenarios: Scenario[];
  customers: Customer[];
  documents: SourceDocument[];
  extended: SourceDocument[];
  byId: Map<string, SourceDocument>;
};

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function walk(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, extension));
    else if (entry.name.endsWith(extension)) files.push(full);
  }
  return files.sort();
}

function parseFrontmatter(block: string, filePath: string): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 0) {
      throw new Error(`Bad frontmatter line in ${filePath}: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value.length === 0 || value === "null" ? null : value;
  }
  return fields;
}

function requireField(fields: Record<string, string | null>, key: string, filePath: string) {
  const value = fields[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${filePath} is missing ${key}.`);
  }
  return value;
}

export function parseMarkdownDocument(raw: string, filePath: string): SourceDocument {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filePath} is missing frontmatter.`);
  const fields = parseFrontmatter(match[1], filePath);
  const id = requireField(fields, "id", filePath);
  const kind = requireField(fields, "kind", filePath);
  const status = requireField(fields, "status", filePath);
  if (!KINDS.has(kind as DocumentKind)) {
    throw new Error(`${id} has unknown kind ${kind}.`);
  }
  if (!STATUSES.has(status as DocumentStatus)) {
    throw new Error(`${id} has unknown status ${status}.`);
  }

  const body = match[2].trim();
  if (!body.startsWith("## ")) {
    throw new Error(`${id} must start with a section heading.`);
  }
  const sections = body.split(/^## /m).filter((part) => part.trim().length > 0);
  const parsed = sections.map((part) => {
    const newline = part.indexOf("\n");
    if (newline < 0) throw new Error(`${id} has a section heading without a title.`);
    const sectionId = part.slice(0, newline).trim();
    const rest = part.slice(newline + 1);
    const titleBreak = rest.indexOf("\n");
    const title = (titleBreak < 0 ? rest : rest.slice(0, titleBreak)).trim();
    const text = (titleBreak < 0 ? "" : rest.slice(titleBreak + 1)).trim();
    if (!/^SEC-[A-Z0-9-]+$/.test(sectionId)) {
      throw new Error(`${id} has an invalid section id ${sectionId}.`);
    }
    if (!title || !text) {
      throw new Error(`${sectionId} needs a title and body.`);
    }
    return { id: sectionId, title, text };
  });

  if (!/^DOC-[A-Z0-9-]+$/.test(id)) {
    throw new Error(`Invalid document id ${id}.`);
  }

  return {
    id,
    title: requireField(fields, "title", filePath),
    kind: kind as DocumentKind,
    customerId: fields.customerId ?? null,
    version: requireField(fields, "version", filePath),
    effectiveFrom: requireField(fields, "effectiveFrom", filePath),
    effectiveTo: fields.effectiveTo ?? null,
    status: status as DocumentStatus,
    sections: parsed,
  };
}

function parseDocumentArray(value: unknown, filePath: string): SourceDocument[] {
  if (!Array.isArray(value)) {
    throw new Error(`${filePath} must be an array of documents.`);
  }
  return value.map((entry) => coerceDocument(entry, filePath));
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function coerceDocument(value: unknown, filePath: string): SourceDocument {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${filePath} contains a document that is not an object.`);
  }
  const record = value as Record<string, unknown>;
  const id = requiredText(record.id, `${filePath} document id`);
  const kind = requiredText(record.kind, id);
  const status = requiredText(record.status, id);
  if (!KINDS.has(kind as DocumentKind)) throw new Error(`${id} has unknown kind ${kind}.`);
  if (!STATUSES.has(status as DocumentStatus)) {
    throw new Error(`${id} has unknown status ${status}.`);
  }
  if (!/^DOC-[A-Z0-9-]+$/.test(id)) throw new Error(`Invalid document id ${id}.`);
  if (!Array.isArray(record.sections) || record.sections.length === 0) {
    throw new Error(`${id} is missing sections.`);
  }
  const customerId =
    record.customerId === null || record.customerId === undefined
      ? null
      : requiredText(record.customerId, `${id} customerId`);
  const effectiveTo =
    record.effectiveTo === null || record.effectiveTo === undefined
      ? null
      : requiredText(record.effectiveTo, `${id} effectiveTo`);

  return {
    id,
    title: requiredText(record.title, id),
    kind: kind as DocumentKind,
    customerId,
    version: requiredText(record.version, id),
    effectiveFrom: requiredText(record.effectiveFrom, id),
    effectiveTo,
    status: status as DocumentStatus,
    sections: record.sections.map((section) => {
      if (typeof section !== "object" || section === null) {
        throw new Error(`${id} has an invalid section.`);
      }
      const item = section as Record<string, unknown>;
      const sectionId = requiredText(item.id, `${id} section id`);
      if (!/^SEC-[A-Z0-9-]+$/.test(sectionId)) {
        throw new Error(`${id} has an invalid section id ${sectionId}.`);
      }
      return {
        id: sectionId,
        title: requiredText(item.title, sectionId),
        text: requiredText(item.text, sectionId),
      };
    }),
  };
}

function assertUnique(documents: SourceDocument[]) {
  const documentIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const document of documents) {
    if (documentIds.has(document.id)) {
      throw new Error(`Duplicate document id ${document.id}.`);
    }
    documentIds.add(document.id);
    for (const section of document.sections) {
      if (sectionIds.has(section.id)) {
        throw new Error(`Duplicate section id ${section.id}.`);
      }
      sectionIds.add(section.id);
    }
  }
}

let cachedLibrary: Library | null = null;

export function loadLibrary(): Library {
  cachedLibrary ??= readLibrary();
  return cachedLibrary;
}

function readLibrary(): Library {
  const handwritten = [
    ...walk(path.join(DATA_DIR, "policies"), ".md").map((file) =>
      parseMarkdownDocument(fs.readFileSync(file, "utf8"), file),
    ),
    ...walk(path.join(DATA_DIR, "documents"), ".md").map((file) =>
      parseMarkdownDocument(fs.readFileSync(file, "utf8"), file),
    ),
    ...walk(path.join(DATA_DIR, "documents"), ".json").flatMap((file) =>
      parseDocumentArray(readJson(file), file),
    ),
  ];
  const extendedPath = path.join(DATA_DIR, "extended-corpus.json");
  const extended = fs.existsSync(extendedPath)
    ? parseDocumentArray(readJson(extendedPath), extendedPath)
    : [];
  const documents = [...handwritten, ...extended];
  assertUnique(documents);
  const catalog = parseCatalog(
    readJson(path.join(DATA_DIR, "scenarios.json")),
    readJson(path.join(DATA_DIR, "customers.json")),
  );
  const byId = new Map(documents.map((document) => [document.id, document]));
  for (const scenario of catalog.scenarios) {
    if (!catalog.customers.some((customer) => customer.id === scenario.customerId)) {
      throw new Error(`${scenario.id} references unknown customer ${scenario.customerId}.`);
    }
    for (const documentId of scenario.documentIds) {
      if (!byId.has(documentId)) {
        throw new Error(`${scenario.id} references unknown document ${documentId}.`);
      }
    }
    if (scenario.movableDocumentId && !scenario.documentIds.includes(scenario.movableDocumentId)) {
      throw new Error(`${scenario.id} moves a document that is not in its bundle.`);
    }
    const sectionIds = new Set(
      scenario.documentIds.flatMap((documentId) => byId.get(documentId)?.sections.map((section) => section.id) ?? []),
    );
    for (const sectionId of scenario.editableSectionIds) {
      if (!sectionIds.has(sectionId)) {
        throw new Error(`${scenario.id} edits missing section ${sectionId}.`);
      }
    }
  }
  return {
    scenarios: catalog.scenarios,
    customers: catalog.customers,
    documents,
    extended,
    byId,
  };
}

export function customerById(library: Library, customerId: string): Customer {
  const customer = library.customers.find((item) => item.id === customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}.`);
  return customer;
}

export function scenarioById(library: Library, scenarioId: string): Scenario {
  const scenario = library.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId}.`);
  return scenario;
}

export function assembleBundle(
  library: Library,
  scenario: Scenario,
  bundle: BundleSize,
  placement: ExceptionPlacement,
): SourceDocument[] {
  const selected = scenario.documentIds.map((documentId) => {
    const document = library.byId.get(documentId);
    if (!document) throw new Error(`Missing document ${documentId}.`);
    return structuredClone(document);
  });
  if (bundle === "large" && library.extended.length === 0) {
    throw new Error("The large bundle is missing. Run npm run generate:corpus.");
  }
  const extended =
    bundle === "large"
      ? library.extended
          .filter((document) => !scenario.documentIds.includes(document.id))
          .map((document) => structuredClone(document))
      : [];
  return placeDocument(
    [...extended, ...selected],
    scenario.movableDocumentId,
    placement,
  );
}
