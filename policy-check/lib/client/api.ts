import type { IndexJob, Rulebook, RulebookEvent, ScreenRequest, ScreenResponse } from "@/lib/types";

/** Typed wrappers for the API routes. Same-origin, no auth: the server holds the keys. */

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const detail = record.detail;
      if (detail && typeof detail === "object" && typeof (detail as Record<string, unknown>).message === "string") {
        return (detail as Record<string, string>).message;
      }
      for (const key of ["error", "message"]) {
        if (typeof record[key] === "string") return record[key] as string;
      }
    }
  } catch {
    // Not JSON; fall through to the status line.
  }
  return `${res.status} ${res.statusText || "request failed"}`;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new ApiError(await readErrorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  rulebook: (id: string) => request<Rulebook>(`/api/rulebook/${encodeURIComponent(id)}`),
  /** A clause's whole section; the page itself only carries the rule paragraph. */
  section: (rulebookId: string, nodeId: string) =>
    request<{ nodeId: string; text: string }>(`/api/rulebook/${encodeURIComponent(rulebookId)}/clause/${encodeURIComponent(nodeId)}`),
  indexJob: (jobId: string) => request<IndexJob>(`/api/rulebook/jobs/${encodeURIComponent(jobId)}`),
  screen: (body: ScreenRequest, signal?: AbortSignal) =>
    request<ScreenResponse>("/api/screen", { method: "POST", body: JSON.stringify(body), signal }),
  /** Uploads live in server memory only; `keepalive` lets the call outlive a closing tab. */
  deleteRulebook: (id: string) =>
    fetch(`/api/rulebook/${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).catch(() => undefined),
};

/**
 * POST /api/rulebook streams NDJSON: one RulebookEvent per line while the file
 * is read and pre-flighted, ending with the id of the background index job.
 */
export async function uploadRulebook(
  file: File,
  onEvent: (event: RulebookEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/api/rulebook", { method: "POST", body: form, signal });
  if (!res.ok) throw new ApiError(await readErrorMessage(res), res.status);
  if (!res.body) throw new ApiError("Empty response from upload", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) onEvent(JSON.parse(trimmed) as RulebookEvent);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      emit(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  emit(buffer);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Polls an IndexJob once a second until it is done or failed. */
export async function pollIndexJob(
  jobId: string,
  onUpdate: (job: IndexJob) => void,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<IndexJob> {
  const { intervalMs = 1000, signal } = options;
  for (;;) {
    const job = await api.indexJob(jobId);
    onUpdate(job);
    if (job.status === "done" || job.status === "error") return job;
    await sleep(intervalMs, signal);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
