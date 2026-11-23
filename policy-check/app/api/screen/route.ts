import { getConfig } from "@/lib/config";
import { getSnapClient } from "@/lib/snap/client";
import { scanDocument } from "@/lib/snap/scan";
import { errorResponse, failure, json, readJson } from "@/lib/server/http";
import { getRulebook } from "@/lib/server/rulebookStore";
import { parseScreenRequest } from "@/lib/server/screenRequest";
import { DEFAULT_THRESHOLDS, type ScreenResponse } from "@/lib/types";
import { getUseCase } from "@/usecases";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const parsed = parseScreenRequest(await readJson<unknown>(request));
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  const body = parsed.request;

  const rulebook = await getRulebook(body.rulebookId);
  if (!rulebook) return errorResponse(`Unknown rulebook "${body.rulebookId}"`, 400);

  try {
    // The whole document in one read, then each clause it points at judged on its own.
    // A document too big for the context window is refused with a 413 that says so (lib/snap/scan.ts).
    const response: ScreenResponse = await scanDocument({
      rulebook,
      items: body.items,
      thresholds: { ...DEFAULT_THRESHOLDS, ...body.thresholds },
      corrections: body.corrections,
      client: getSnapClient(),
      severity: getUseCase().severity,
      contextTokens: getConfig().snapContextTokens,
    });
    return json(response);
  } catch (error) {
    return failure(error);
  }
}
