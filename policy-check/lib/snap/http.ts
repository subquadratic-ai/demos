import { hashHex } from "./hash";
import { SnapError, type SnapClient, type SnapRequest, type SnapResponse, type SnapSession } from "./types";

export interface HttpSnapClientOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  /** Retries on 429 and 5xx, with exponential backoff. */
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable so tests can skip the backoff. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Calls the SubQ Snap API.
 *
 *   POST {apiUrl}
 *   Authorization: Bearer {apiKey}
 *   { model, state, questions }
 *   -> { model, answers: { [id]: NoulAnswer | ScoreAnswer | ChoiceAnswer }, usage }
 *
 * Errors come back as { detail: { error_type, message } }.
 */
export class HttpSnapClient implements SnapClient {
  readonly name = "SubQ Snap (live)";
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpSnapClientOptions) {
    if (!options.apiKey) throw new SnapError("SNAP_API_KEY is not set. Copy .env.example to .env.local, add your key and restart.");
    if (!options.apiUrl) throw new SnapError("SNAP_API_URL is not set.");
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 90_000;
    // Bind, or calling it as a method throws "Illegal invocation" in some runtimes.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.sleep = options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * TODO(snap-sessions): the API has no server-side session handle yet, so the
   * session state (rulebook outline + corrections) is prepended to every
   * request body. Once the API exposes one, open it here and send its id in
   * `decide` instead of resending the text.
   */
  async openSession(state: string): Promise<SnapSession> {
    return { id: `local-${hashHex(state)}`, state };
  }

  async decide(request: SnapRequest): Promise<SnapResponse> {
    const state = request.session ? `${request.session.state}\n\n${request.state}` : request.state;
    const body = JSON.stringify({ model: this.options.model, state, questions: request.questions });

    for (let attempt = 0; ; attempt++) {
      const started = performance.now();
      const response = await this.fetchImpl(this.options.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const data = (await response.json()) as Partial<SnapResponse>;
        if (!data.answers) throw new SnapError("Snap returned no answers.", response.status);
        return { model: data.model ?? this.options.model, answers: data.answers, usage: data.usage, latencyMs: performance.now() - started };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(retryDelay(response, attempt));
        continue;
      }

      const detail = await readDetail(response);
      throw new SnapError(detail.message, response.status, detail.errorType);
    }
  }
}

/** Honour Retry-After when present; otherwise 1.5 s, 4.5 s, 13.5 s ... */
function retryDelay(response: Response, attempt: number): number {
  const header = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 30_000);
  return 1500 * 3 ** attempt;
}

async function readDetail(response: Response): Promise<{ message: string; errorType?: string }> {
  const fallback = `Snap request failed with HTTP ${response.status}`;
  try {
    const json = (await response.json()) as { detail?: { message?: string; error_type?: string } };
    return { message: json.detail?.message ?? fallback, errorType: json.detail?.error_type };
  } catch {
    return { message: fallback };
  }
}
