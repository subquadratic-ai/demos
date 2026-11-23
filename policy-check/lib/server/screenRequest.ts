import { BATCH_SIZE } from "@/lib/config";
import type { Corrections, Item, ScreenRequest, Thresholds } from "@/lib/types";

/** Longest item text accepted, in characters (about 5K tokens). The samples run to a few hundred. */
export const MAX_ITEM_CHARS = 20_000;
const MAX_ID_CHARS = 200;
const MAX_LABEL_CHARS = 200;
const MAX_CORRECTION_CHARS = 2_000;

/** A screen request as checked: thresholds may be partial; the route fills in the defaults. */
export type ParsedScreenRequest = Omit<ScreenRequest, "thresholds"> & { thresholds: Partial<Thresholds> };

export type Parsed = { ok: true; request: ParsedScreenRequest } | { ok: false; error: string };

/**
 * Checks a POST /api/screen body before any Snap request is made, so a bad
 * payload is a 400 that says what is wrong rather than a 500 from deep in the engine.
 */
export function parseScreenRequest(body: unknown): Parsed {
  if (!isObject(body) || typeof body.rulebookId !== "string" || !Array.isArray(body.items)) {
    return fail("Expected { rulebookId, items, thresholds, corrections }");
  }
  if (body.items.length === 0) return fail("No items to screen");
  if (body.items.length > BATCH_SIZE) return fail(`At most ${BATCH_SIZE} items per call`);

  const items: Item[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of body.items.entries()) {
    const where = `items[${index}]`;
    if (!isObject(raw)) return fail(`${where} must be an object { id, kind, text, source? }`);
    const { id, kind, text, source } = raw;
    if (typeof id !== "string" || !id.trim() || id.length > MAX_ID_CHARS) {
      return fail(`${where}.id must be a non-empty string of at most ${MAX_ID_CHARS} characters`);
    }
    if (ids.has(id)) return fail(`${where}.id "${id}" appears more than once`);
    ids.add(id);
    if (typeof kind !== "string" || !kind.trim() || kind.length > MAX_LABEL_CHARS) {
      return fail(`${where}.kind must be a non-empty string of at most ${MAX_LABEL_CHARS} characters`);
    }
    if (typeof text !== "string" || !text.trim()) return fail(`${where}.text must be a non-empty string`);
    if (text.length > MAX_ITEM_CHARS) {
      return fail(`${where}.text is ${text.length.toLocaleString("en-US")} characters; the limit is ${MAX_ITEM_CHARS.toLocaleString("en-US")}`);
    }
    if (source !== undefined && (typeof source !== "string" || source.length > MAX_LABEL_CHARS)) {
      return fail(`${where}.source must be a string of at most ${MAX_LABEL_CHARS} characters`);
    }
    items.push({ id, kind, text, ...(source === undefined ? {} : { source }) });
  }

  const thresholds: Partial<Thresholds> = {};
  if (body.thresholds !== undefined) {
    if (!isObject(body.thresholds)) return fail("thresholds must be an object");
    for (const key of ["clearAbove", "flagBelow", "appliesAbove"] as const) {
      const value = body.thresholds[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !(value >= 0 && value <= 1)) return fail(`thresholds.${key} must be a number from 0 to 1`);
      thresholds[key] = value;
    }
  }

  const corrections: Corrections = {};
  if (body.corrections !== undefined) {
    if (!isObject(body.corrections)) return fail("corrections must be an object of clause id to a list of notes");
    for (const [clause, notes] of Object.entries(body.corrections)) {
      if (!Array.isArray(notes) || !notes.every((note) => typeof note === "string" && note.length <= MAX_CORRECTION_CHARS)) {
        return fail(`corrections["${clause}"] must be a list of strings of at most ${MAX_CORRECTION_CHARS} characters`);
      }
      corrections[clause] = notes;
    }
  }

  return { ok: true, request: { rulebookId: body.rulebookId, items, thresholds, corrections } };
}

function fail(error: string): Parsed {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
