import { BATCH_SIZE, getConfig } from "@/lib/config";
import { getSnapClient } from "@/lib/snap/client";
import { scanDocument } from "@/lib/snap/scan";
import { errorResponse, failure, json, readJson } from "@/lib/server/http";
import { getRulebook } from "@/lib/server/rulebookStore";
import { DEFAULT_THRESHOLDS, type ScreenRequest, type ScreenResponse } from "@/lib/types";
import { getUseCase } from "@/usecases";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const body = await readJson<Partial<ScreenRequest>>(request);
  if (!body || typeof body.rulebookId !== "string" || !Array.isArray(body.items)) {
    return errorResponse("Expected { rulebookId, items, thresholds, corrections }", 400);
  }
  if (body.items.length === 0) return errorResponse("No items to screen", 400);
  if (body.items.length > BATCH_SIZE) return errorResponse(`At most ${BATCH_SIZE} items per call`, 400);

  const rulebook = await getRulebook(body.rulebookId);
  if (!rulebook) return errorResponse(`Unknown rulebook "${body.rulebookId}"`, 400);

  try {
    // The whole document in one read, then each clause it points at judged on its own.
    // A document too big for the context window is refused with a 413 that says so (lib/snap/scan.ts).
    const response: ScreenResponse = await scanDocument({
      rulebook,
      items: body.items,
      thresholds: { ...DEFAULT_THRESHOLDS, ...body.thresholds },
      corrections: body.corrections ?? {},
      client: getSnapClient(),
      severity: getUseCase().severity,
      contextTokens: getConfig().snapContextTokens,
    });
    return json(response);
  } catch (error) {
    return failure(error);
  }
}
