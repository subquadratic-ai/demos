import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import { extractDocument } from "@/lib/rulebook/extract";
import { preflight } from "@/lib/rulebook/preflight";
import { errorResponse } from "@/lib/server/http";
import { startIndexJob } from "@/lib/server/indexJobs";
import type { RulebookEvent } from "@/lib/types";

export const runtime = "nodejs";
/** Extraction of a 300-page PDF can take a while on a cold worker; the tree build itself runs out of band. */
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Upload a rulebook. Streams NDJSON progress (upload → extract → preflight)
 * and ends with the id of the background index job, so the UI can show the
 * pre-flight line within seconds and poll for the tree afterwards.
 */
export async function POST(request: Request): Promise<Response> {
  let file: File;
  try {
    const form = await request.formData();
    const field = form.get("file");
    if (!(field instanceof File)) return errorResponse('Multipart field "file" is required', 400);
    file = field;
  } catch {
    return errorResponse("Expected multipart/form-data with a \"file\" field", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return errorResponse("File exceeds the 50 MB limit", 413);
  if (file.size === 0) return errorResponse("File is empty", 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: RulebookEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const startedAt = Date.now();
      try {
        emit({ type: "step", step: "upload", progress: 1, label: `Received ${file.name} (${formatBytes(file.size)})` });
        const buffer = new Uint8Array(await file.arrayBuffer());
        emit({ type: "step", step: "extract", progress: 0, label: "Reading text layer" });
        const { pages, title } = await extractDocument(buffer, file.name, file.type, {
          onPage: (done, total) => {
            if (total > 0) emit({ type: "step", step: "extract", progress: done / total, label: `Reading page ${done}/${total}` });
          },
        });
        emit({ type: "step", step: "extract", progress: 1, label: `Read ${pages.length} pages` });
        emit({ type: "step", step: "preflight", progress: 0.5, label: "Checking text layer and headings" });
        const result = preflight(pages, getConfig().snapContextTokens, Date.now() - startedAt);
        emit({ type: "step", step: "preflight", progress: 1, label: "Pre-flight complete" });
        emit({ type: "preflight", preflight: result, title });
        if (result.pagesWithText === 0) {
          emit({ type: "error", message: "No text layer found. Run OCR on the document and upload it again." });
          return;
        }
        const rulebookId = `upload-${randomUUID().slice(0, 8)}`;
        const job = startIndexJob({ rulebookId, pages, title, preflight: result });
        emit({ type: "indexing", jobId: job.id, rulebookId });
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Upload failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
