import "server-only";
import { TooBigError } from "@/lib/snap/scan";
import { SnapError } from "@/lib/snap/types";

/** Shared JSON helpers for the route handlers: every error is `{ error }` with a real status. */

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Maps thrown errors to a status: Snap failures are upstream (502), a document too big to read is 413, everything else is ours (500). */
export function failure(error: unknown): Response {
  if (error instanceof TooBigError) return errorResponse(error.message, 413);
  if (error instanceof SnapError) {
    const status = error.status === 429 ? 429 : 502;
    return errorResponse(`Snap: ${error.message}`, status);
  }
  return errorResponse(error instanceof Error ? error.message : "Unexpected error", 500);
}

export async function readJson<T>(request: Request): Promise<T | undefined> {
  try {
    return (await request.json()) as T;
  } catch {
    return undefined;
  }
}
