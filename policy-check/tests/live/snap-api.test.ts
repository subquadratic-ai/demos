import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { HttpSnapClient } from "@/lib/snap/http";
import { asChoice, asNoul, asScore, SnapError } from "@/lib/snap/types";
import { LIVE_TIMEOUT, liveClient } from "./client";

/** What the app relies on from POST /v1/systemone, asked of the live API. */
describe("the Snap API", { timeout: LIVE_TIMEOUT }, () => {
  const client = liveClient();
  const config = getConfig();

  it("refuses to start without a key, and says where to put one", () => {
    expect(() => new HttpSnapClient({ apiUrl: config.snapApiUrl, apiKey: "", model: config.snapModel })).toThrow(/SNAP_API_KEY.*\.env\.local/);
  });

  it("answers noul, choice and score questions with probabilities, usage and timing", async () => {
    const response = await client.decide({
      state: "## NOTE\nThe sky over the harbour was clear and blue all afternoon.",
      questions: {
        blue: { type: "noul", instructions: "Is the sky described as blue?" },
        when: { type: "choice", instructions: "When is the note about?", criteria: { morning: "the morning", afternoon: "the afternoon", night: "the night" } },
        clear: { type: "score", instructions: "How clear was the sky?", criteria: ["overcast", "partly cloudy", "clear"] },
      },
    });

    expect(asNoul(response.answers.blue)).toBeGreaterThan(0.9);
    const when = asChoice(response.answers.when)!;
    expect(when.choice).toBe("afternoon");
    expect(Object.values(when.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    const clear = asScore(response.answers.clear)!;
    expect(clear.probabilities["2"]).toBeGreaterThan(0.9);
    expect(clear.legend["2"]).toBe("clear");

    expect(response.model).toBe(config.snapModel);
    expect(response.usage?.input_tokens).toBeGreaterThan(0);
    expect(response.latencyMs).toBeGreaterThan(0);
  });

  it("turns away a bad key with the API's own message", async () => {
    const stranger = new HttpSnapClient({ apiUrl: config.snapApiUrl, apiKey: "sk-proj-not-a-real-key", model: config.snapModel, maxRetries: 0 });
    const error = await stranger.decide({ state: "x", questions: { q: { type: "noul", instructions: "?" } } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapError);
    expect((error as SnapError).status).toBe(401);
    expect((error as SnapError).message).toMatch(/api key/i);
  });

  it("rejects a malformed question with the API's validation message", async () => {
    // A score's criteria must be an array of levels; an object is refused before anything is billed.
    const malformed = { type: "score", instructions: "?", criteria: { low: "a", high: "b" } } as unknown as { type: "score"; instructions: string; criteria: string[] };
    const error = await client.decide({ state: "x", questions: { q: malformed } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapError);
    expect((error as SnapError).status).toBe(422);
    expect((error as SnapError).message).toMatch(/criteria/);
  });
});
