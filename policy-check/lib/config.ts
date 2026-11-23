/** The only place environment variables are read. Everything else imports from here. */

export interface AppConfig {
  snapApiKey: string | undefined;
  snapApiUrl: string;
  snapModel: string;
  /** Snap's context window in tokens. Every page cap in the app derives from this. */
  snapContextTokens: number;
  pageIndexApiUrl: string | undefined;
  pageIndexApiKey: string | undefined;
  /** Which folder under usecases/ the app runs; the first registered one when unset. */
  useCase: string | undefined;
}

/** Rough token density of policy prose, used by the pre-flight estimate. */
export const TOKENS_PER_PAGE = 650;

/** Items per Snap request. One request = up to this many items with per-item questions in parallel. */
export const BATCH_SIZE = 50;

/** Whole-rulebook state is considered to fit when it stays under this share of the window. */
export const CONTEXT_SAFETY_FACTOR = 0.8;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const contextTokens = Number(env.SNAP_CONTEXT_TOKENS ?? 262_144);
  return {
    snapApiKey: env.SNAP_API_KEY || env.SUBQ_API_KEY || env.SNAP_KEY || undefined,
    snapApiUrl: env.SNAP_API_URL || "https://api.subq.ai/v1/systemone",
    snapModel: env.SNAP_MODEL || "subq-snap-latest",
    snapContextTokens: Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : 262_144,
    pageIndexApiUrl: env.PAGEINDEX_API_URL || undefined,
    pageIndexApiKey: env.PAGEINDEX_API_KEY || undefined,
    useCase: env.USE_CASE || undefined,
  };
}
