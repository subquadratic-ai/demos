import { describe, expect, it } from "vitest";
import { MAX_ITEM_CHARS, parseScreenRequest } from "@/lib/server/screenRequest";

const item = { id: "it-005", kind: "ad", source: "Claim", text: "Guaranteed 5% return" };

function error(body: unknown): string {
  const parsed = parseScreenRequest(body);
  if (parsed.ok) throw new Error("expected a rejection");
  return parsed.error;
}

describe("parseScreenRequest", () => {
  it("accepts what the page sends, with partial thresholds left for the route to fill", () => {
    const parsed = parseScreenRequest({ rulebookId: "marketing-policy", items: [item], thresholds: { clearAbove: 0.9 }, corrections: {} });
    expect(parsed).toEqual({ ok: true, request: { rulebookId: "marketing-policy", items: [item], thresholds: { clearAbove: 0.9 }, corrections: {} } });
  });

  it("rejects a body that is not a request", () => {
    expect(error(undefined)).toMatch(/Expected \{ rulebookId, items/);
    expect(error({ rulebookId: "marketing-policy", items: "x" })).toMatch(/Expected/);
    expect(error({ rulebookId: "marketing-policy", items: [] })).toBe("No items to screen");
    expect(error({ rulebookId: "marketing-policy", items: Array.from({ length: 51 }, (_, i) => ({ ...item, id: `i${i}` })) })).toMatch(/At most 50/);
  });

  it("names the item and the field that is wrong", () => {
    expect(error({ rulebookId: "marketing-policy", items: [{ id: "x" }] })).toBe("items[0].kind must be a non-empty string of at most 200 characters");
    expect(error({ rulebookId: "marketing-policy", items: [{ ...item, text: 42 }] })).toBe("items[0].text must be a non-empty string");
    expect(error({ rulebookId: "marketing-policy", items: [item, "x"] })).toMatch(/^items\[1\] must be an object/);
    expect(error({ rulebookId: "marketing-policy", items: [item, item] })).toMatch(/appears more than once/);
    expect(error({ rulebookId: "marketing-policy", items: [{ ...item, text: "a".repeat(MAX_ITEM_CHARS + 1) }] })).toMatch(/the limit is 20,000/);
  });

  it("checks thresholds and corrections", () => {
    expect(error({ rulebookId: "marketing-policy", items: [item], thresholds: { flagBelow: 2 } })).toBe("thresholds.flagBelow must be a number from 0 to 1");
    expect(error({ rulebookId: "marketing-policy", items: [item], corrections: { "3.3": "cleared" } })).toMatch(/^corrections\["3.3"\]/);
  });
});
