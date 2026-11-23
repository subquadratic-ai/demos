import { hashHex } from "./hash";
import { SnapError, type SnapClient, type SnapRequest, type SnapResponse, type SnapSession } from "./types";

export interface HttpSnapClientOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  /** Retries on 429 and 5xx, with exponential backoff. */
  maxRetries?: number;
  /** Retries after a timeout or network error (no response at all), after a short pause. */
  maxNetworkRetries?: number;
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
 * Errors come back as { detail: { error_type, message } }. A request that gets
 * no response (timeout, connection reset, DNS) is retried once, then thrown as a
 * SnapError with errorType "timeout" or "network" (a 504 or 502 from the routes).
 */
export class HttpSnapClient implements SnapClient {
  readonly name = "SubQ Snap (live)";
  private readonly maxRetries: number;
  private readonly maxNetworkRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpSnapClientOptions) {
    if (!options.apiKey) throw new SnapError("SNAP_API_KEY is not set. Copy .env.example to .env.local, add your key and restart.");
    if (!options.apiUrl) throw new SnapError("SNAP_API_URL is not set.");
    this.maxRetries = options.maxRetries ?? 2;
    this.maxNetworkRetries = options.maxNetworkRetries ?? 1;
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

    let attempt = 0;
    let networkAttempt = 0;
    for (;;) {
      const started = performance.now();
      let response: Response;
      let data: Partial<SnapResponse> | undefined;
      try {
        response = await this.fetchImpl(this.options.apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        // The timeout also covers reading the body.
        if (response.ok) data = (await response.json()) as Partial<SnapResponse>;
      } catch (error) {
        // A 200 whose body is not JSON was answered; retrying would pay for the read again.
        if (error instanceof SyntaxError) throw new SnapError("Snap returned a malformed response.", 502);
        if (networkAttempt < this.maxNetworkRetries) {
          networkAttempt++;
          await this.sleep(NETWORK_RETRY_MS);
          continue;
        }
        throw transportFailure(error, this.timeoutMs);
      }

      if (data) {
        if (!data.answers) throw new SnapError("Snap returned no answers.", response.status);
        return { model: data.model ?? this.options.model, answers: data.answers, usage: data.usage, latencyMs: performance.now() - started };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(retryDelay(response, attempt++));
        continue;
      }

      const detail = await readDetail(response);
      throw new SnapError(detail.message, response.status, detail.errorType);
    }
  }
}

/** Pause before retrying a request that got no response. */
const NETWORK_RETRY_MS = 1000;

/**
 * A request that got no response: a timeout, or a network error such as a reset
 * connection or a failed DNS lookup.
 */
function transportFailure(error: unknown, timeoutMs: number): SnapError {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new SnapError(`no response within ${timeoutMs / 1000} s`, undefined, "timeout");
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new SnapError(`could not reach the API (${reason})`, undefined, "network");
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
