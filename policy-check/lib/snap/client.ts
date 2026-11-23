import { getConfig, type AppConfig } from "@/lib/config";
import { HttpSnapClient } from "./http";
import type { SnapClient } from "./types";

/** Every decision comes from the live Snap API. The key is only ever read on the server. */
export function createSnapClient(config: AppConfig): SnapClient {
  return new HttpSnapClient({ apiUrl: config.snapApiUrl, apiKey: config.snapApiKey ?? "", model: config.snapModel });
}

let cached: { key: string; client: SnapClient } | undefined;

export function getSnapClient(): SnapClient {
  const config = getConfig();
  const key = `${config.snapApiUrl}:${config.snapModel}:${config.snapApiKey ?? ""}`;
  if (cached?.key !== key) cached = { key, client: createSnapClient(config) };
  return cached.client;
}
