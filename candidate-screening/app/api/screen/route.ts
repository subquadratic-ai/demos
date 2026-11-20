import { NextResponse } from "next/server";

import { DecisionsApiError } from "@/lib/decisions";
import {
  ExtractionError,
  candidateNameFromFile,
  extractText,
} from "@/lib/extract";
import {
  type CandidateResult,
  type ScreeningError,
  screenCandidate,
} from "@/lib/screening";

// pdf-parse / mammoth need the Node runtime, not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Screen a few candidates at a time to be gentle on rate limits.
const CONCURRENCY = 4;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  // --- Job description: file upload or pasted text ---
  const jdFile = form.get("jd");
  const jdText = (form.get("jdText") as string | null)?.trim();

  let jobDescription = "";
  try {
    if (jdFile instanceof File && jdFile.size > 0) {
      jobDescription = await extractText(jdFile);
    } else if (jdText) {
      jobDescription = jdText;
    }
  } catch (error) {
    if (error instanceof ExtractionError) {
      return NextResponse.json(
        { error: `Job description: ${error.message}` },
        { status: 422 },
      );
    }
    throw error;
  }

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Provide a job description (upload a file or paste text)." },
      { status: 400 },
    );
  }

  // --- Must-have requirements: one per line (optional) ---
  const requirements = ((form.get("requirements") as string | null) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // --- Resumes: one or more files ---
  const resumeFiles = form
    .getAll("resumes")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (resumeFiles.length === 0) {
    return NextResponse.json(
      { error: "Attach at least one resume (PDF, DOCX, TXT, or MD)." },
      { status: 400 },
    );
  }

  // --- Extract resume text up front so parse errors are per-candidate ---
  const candidates: { id: string; name: string; resume: string }[] = [];
  const errors: ScreeningError[] = [];

  await Promise.all(
    resumeFiles.map(async (file, index) => {
      const id = `${index}`;
      const name = candidateNameFromFile(file.name);
      try {
        const resume = await extractText(file);
        candidates.push({ id, name, resume });
      } catch (error) {
        errors.push({
          id,
          name,
          error:
            error instanceof ExtractionError
              ? error.message
              : (error as Error).message,
        });
      }
    }),
  );

  // --- Screen candidates with bounded concurrency ---
  const results: CandidateResult[] = [];
  let cursor = 0;

  async function worker() {
    for (;;) {
      const current = cursor++;
      if (current >= candidates.length) return;
      const c = candidates[current];
      try {
        results.push(
          await screenCandidate({
            id: c.id,
            name: c.name,
            jobDescription,
            resume: c.resume,
            requirements,
          }),
        );
      } catch (error) {
        const message =
          error instanceof DecisionsApiError
            ? `${error.status} ${error.errorType}: ${error.message}`
            : (error as Error).message;
        errors.push({ id: c.id, name: c.name, error: message });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker),
  );

  // Best candidates first.
  results.sort((a, b) => b.rankScore - a.rankScore);

  const totalUsage = results.reduce(
    (acc, r) => ({
      input_tokens: acc.input_tokens + r.usage.input_tokens,
      output_tokens: acc.output_tokens + r.usage.output_tokens,
    }),
    { input_tokens: 0, output_tokens: 0 },
  );

  return NextResponse.json({ results, errors, usage: totalUsage });
}
