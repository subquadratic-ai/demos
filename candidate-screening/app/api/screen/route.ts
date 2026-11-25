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

// unpdf / mammoth need the Node runtime, not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hosting limit for the whole request; the Snap calls time out a bit earlier
// so the client still gets a JSON 504 instead of a dropped connection.
export const maxDuration = 60;

// Screen a few candidates at a time to be gentle on rate limits.
const CONCURRENCY = 4;

// Upload limits for this demo.
const MAX_FILE_BYTES = 5 * 1024 * 1024; // per file
const MAX_RESUMES = 20;
const MAX_BODY_BYTES = (MAX_RESUMES + 1) * MAX_FILE_BYTES + 64 * 1024;

// Budget for all Decisions API calls in one request.
const DECIDE_TIMEOUT_MS = 55_000;

function tooLarge(fileName: string) {
  return NextResponse.json(
    {
      error: `${fileName} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    },
    { status: 413 },
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Upload is too large for this demo." },
      { status: 413 },
    );
  }

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
  const hasJdFile = jdFile instanceof File && jdFile.size > 0;

  if (hasJdFile && jdText) {
    return NextResponse.json(
      {
        error:
          "Send the job description once: upload a file or paste text, not both.",
      },
      { status: 400 },
    );
  }
  if (hasJdFile && jdFile.size > MAX_FILE_BYTES) {
    return tooLarge(jdFile.name || "Job description");
  }

  let jobDescription = "";
  try {
    if (hasJdFile) {
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
  if (resumeFiles.length > MAX_RESUMES) {
    return NextResponse.json(
      { error: `Attach at most ${MAX_RESUMES} resumes per run.` },
      { status: 400 },
    );
  }
  const oversized = resumeFiles.find((f) => f.size > MAX_FILE_BYTES);
  if (oversized) return tooLarge(oversized.name || "A resume");

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
  const signal = AbortSignal.timeout(DECIDE_TIMEOUT_MS);
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
            signal,
          }),
        );
      } catch (error) {
        if (signal.aborted) return; // reported once below as a 504
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

  if (signal.aborted) {
    return NextResponse.json(
      {
        error: `Screening timed out after ${DECIDE_TIMEOUT_MS / 1000} s. Try fewer resumes.`,
      },
      { status: 504 },
    );
  }

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
