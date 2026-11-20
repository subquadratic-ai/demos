/**
 * Extract plain text from uploaded files (PDF, DOCX, TXT/MD).
 * Runs server-side only (Node runtime).
 */

export class ExtractionError extends Error {
  constructor(
    public fileName: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

const MAX_CHARS = 60_000; // keep each state reasonably sized

function clamp(text: string): string {
  const trimmed = text.replace(/\u0000/g, "").trim();
  return trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Import the library file directly to avoid pdf-parse's index.js debug path
  // that reads a bundled sample PDF at require time.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Turn an uploaded File into clean text. Picks a parser by extension/mime.
 */
export async function extractText(file: File): Promise<string> {
  const name = file.name || "file";
  const lower = name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let text: string;
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      text = await extractPdf(buffer);
    } else if (
      lower.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      text = await extractDocx(buffer);
    } else if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      file.type.startsWith("text/")
    ) {
      text = buffer.toString("utf-8");
    } else {
      throw new ExtractionError(
        name,
        "Unsupported file type. Use PDF, DOCX, TXT, or MD.",
      );
    }

    const cleaned = clamp(text);
    if (!cleaned) {
      throw new ExtractionError(
        name,
        "No readable text found (the file may be scanned/image-only).",
      );
    }
    return cleaned;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      name,
      `Could not read file: ${(error as Error).message}`,
    );
  }
}

/** Derive a display name for a candidate from the resume file name. */
export function candidateNameFromFile(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, "") // drop extension
      .replace(/[_-]+/g, " ") // underscores/dashes to spaces
      .replace(/\s+/g, " ")
      .trim() || fileName
  );
}
