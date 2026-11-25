import { getConfig } from "@/lib/config";
import { createSnapClient } from "@/lib/snap/client";
import type { SnapClient } from "@/lib/snap/types";

/**
 * The tests under tests/live call the real Snap API, the same way the app
 * does: no fakes, no recordings. They read SNAP_API_KEY from .env.local and
 * cost a few tens of thousands of input tokens per run.
 */
export function liveClient(): SnapClient {
  const config = getConfig();
  if (!config.snapApiKey) {
    throw new Error("The live tests call the Snap API. Copy .env.example to .env.local and set SNAP_API_KEY.");
  }
  return createSnapClient(config);
}

/** Cold starts on the API can take tens of seconds, and the client retries 5xx twice. */
export const LIVE_TIMEOUT = 240_000;
