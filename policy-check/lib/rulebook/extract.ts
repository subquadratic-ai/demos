import { isHeadingCandidate } from "./preflight";

/**
 * Turns an uploaded file into per-page text. PDFs keep their real pages;
 * DOCX and plain text have none, so they are cut into ~480-word pages that
 * give the preflight estimate and the tree's page ranges something to point at.
 * Nothing is written to disk.
 */

export interface ExtractedDocument {
  pages: string[];
  title: string;
}

export interface ExtractOptions {
  /** Called as pages come in, for the upload stream's progress events. */
  onPage?: (done: number, total: number) => void;
}

/** Target length of a synthetic page for formats without pagination. */
export const WORDS_PER_PAGE = 480;

export async function extractDocument(
  buffer: Uint8Array,
  filename: string,
  mime: string,
  options: ExtractOptions = {},
): Promise<ExtractedDocument> {
  const kind = detectKind(filename, mime);
  let pages: string[];
  if (kind === "pdf") pages = await extractPdf(buffer, options);
  else if (kind === "docx") pages = await extractDocx(buffer);
  else pages = paginateText(new TextDecoder("utf-8", { fatal: false }).decode(buffer));
  if (kind !== "pdf") options.onPage?.(pages.length, pages.length);
  return { pages, title: guessTitle(pages, filename) };
}

export type DocumentKind = "pdf" | "docx" | "text";

export function detectKind(filename: string, mime: string): DocumentKind {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx";
  }
  return "text";
}

async function extractPdf(buffer: Uint8Array, options: ExtractOptions): Promise<string[]> {
  // Imported lazily: pdf.js is heavy and most requests never touch it.
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js transfers the buffer to its worker; hand it a copy so the caller's bytes survive.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  options.onPage?.(0, pdf.numPages);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map(normaliseWhitespace);
  options.onPage?.(pages.length, pdf.numPages);
  return pages;
}

async function extractDocx(buffer: Uint8Array): Promise<string[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return paginateText(value);
}

/**
 * Cut running text into pages. Prefer breaking just before a heading once a page is
 * at least half full, so headings start pages the way they do in real documents.
 */
export function paginateText(text: string, wordsPerPage = WORDS_PER_PAGE): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const pages: string[] = [];
  let current: string[] = [];
  let words = 0;
  const flush = () => {
    const page = current.join("\n").trim();
    if (page) pages.push(page);
    current = [];
    words = 0;
  };
  for (const line of lines) {
    const lineWords = line.trim() ? line.trim().split(/\s+/).length : 0;
    const headingBreak = words >= wordsPerPage / 2 && isHeadingCandidate(line);
    if (headingBreak || (words > 0 && words + lineWords > wordsPerPage)) flush();
    current.push(line);
    words += lineWords;
  }
  flush();
  return pages;
}

/** First heading-like line of the opening pages, else the filename without its extension. */
export function guessTitle(pages: string[], filename: string): string {
  for (const page of pages.slice(0, 2)) {
    for (const raw of page.split("\n")) {
      const line = raw.replace(/^#+\s*/, "").trim();
      if (line.length >= 4 && line.length <= 100 && isHeadingCandidate(raw) && !/^\d+(\.\d+)*\.?$/.test(line)) {
        return line.replace(/^(?:\d{1,2}(?:\.\d{1,2})*\.?\s+)/, "");
      }
    }
  }
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled document";
}

function normaliseWhitespace(page: string): string {
  return page
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
