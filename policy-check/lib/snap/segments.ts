/**
 * Cuts a text into the candidate passages an evidence Choice picks from.
 *
 * Every segment is an exact substring of the input, found verbatim with
 * `indexOf`, so the page can highlight what Snap picked without any fuzzy
 * matching. Segments are worked out as character spans over the original
 * text; merging two spans takes everything between them, so a merged
 * segment is still a substring.
 *
 *   - "item": one segment per line and per sentence, with every
 *     parenthesised span ("(Paid post: …)") and every " · "-separated field
 *     on its own. Items are short; a sentence is the unit a reviewer quotes.
 *   - "clause": finer phrases. Sentences are cut again at ; : and dashes,
 *     and at a comma that opens a new clause ("…, where the rate moves").
 *     A comma inside a list ("'guaranteed', 'risk-free'") does not cut.
 *
 * Fragments too short to mean anything are merged into a neighbour in the
 * same sentence or line, and the count is capped so the Choice stays small.
 */

export type SegmentMode = "item" | "clause";

/** The most options an evidence Choice offers. Beyond this, the shortest neighbours are merged. */
export const MAX_SEGMENTS = 16;

/** A fragment with fewer words than this is merged into a neighbour. */
const MIN_WORDS: Record<SegmentMode, number> = { item: 2, clause: 3 };

/**
 * A comma followed by one of these starts a new phrase in a clause. Any other
 * comma, including ", and" and ", or", is read as part of a list or an aside
 * ("whose return, rate or value can vary") and does not cut.
 */
const CLAUSE_OPENERS = new Set(
  "although at because but even except for if in including on otherwise provided regardless so though unless until when where whether which while who without".split(" "),
);

/** A cut at an opening comma must leave at least this many words on each side ("The warning states, in plain language, …" stays whole). */
const COMMA_MIN_WORDS = 4;

/**
 * A clause phrase longer than MAX_WORDS is cut again at its most even
 * SPLIT_AT point: before a word that opens a condition, or at a last ", and"
 * / ", or" (an earlier one is an aside). Each side keeps at least SPLIT_MIN_WORDS.
 */
const MAX_WORDS = 20;
const SPLIT_MIN_WORDS = 5;
const SPLIT_AT = /(?:,|\s)(?=\s*(?:only when|only if|regardless of|unless|until|where|which|whether|provided that|except|including|without)\s)|,(?=\s(?:and|or)\s[^,]*$)/gi;

/** A period after one of these does not end a sentence. Single letters ("D. Reyes") and "e.g." are caught by shape. */
const ABBREVIATIONS = new Set(["dr", "etc", "inc", "ltd", "mr", "mrs", "ms", "no", "st", "vs"]);

interface Span {
  start: number;
  end: number;
  /** Fragments are only merged with others in the same block: a sentence (clause) or a line (item). */
  block: number;
}

export function segmentsOf(text: string, mode: SegmentMode): string[] {
  let spans = mode === "item" ? itemSpans(text) : clauseSpans(text);
  spans = spans.map((span) => trimSpan(text, span)).filter((span) => wordCount(text, span) > 0);
  spans = mergeShort(text, spans, MIN_WORDS[mode]);
  spans = capSpans(text, spans, MAX_SEGMENTS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const span of spans) {
    const segment = text.slice(span.start, span.end);
    if (seen.has(segment)) continue;
    seen.add(segment);
    out.push(segment);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cutting

/** Lines, then parenthesised spans and " · " fields, then sentences. */
function itemSpans(text: string): Span[] {
  const spans: Span[] = [];
  let block = 0;
  for (const line of linesOf(text)) {
    for (const piece of parenPieces(text, line.start, line.end)) {
      if (piece.paren) {
        spans.push({ start: piece.start, end: piece.end, block });
        continue;
      }
      for (const field of cutAt(text, piece.start, piece.end, /\s[·|•]\s/g)) {
        for (const sentence of sentencesOf(text, field.start, field.end)) spans.push({ ...sentence, block });
      }
    }
    block++;
  }
  return spans;
}

/** Sentences, then ; : and dashes, then commas that open a new phrase. Parentheses stay inside their phrase. */
function clauseSpans(text: string): Span[] {
  const spans: Span[] = [];
  let block = 0;
  for (const line of linesOf(text)) {
    for (const sentence of sentencesOf(text, line.start, line.end)) {
      for (const part of cutAt(text, sentence.start, sentence.end, /[;:](?=\s)|\s[—–]\s|\s-\s/g)) {
        for (const phrase of cutAtOpeningCommas(text, part.start, part.end)) {
          for (const piece of cutLong(text, phrase.start, phrase.end)) spans.push({ ...piece, block });
        }
      }
      block++;
    }
  }
  return spans;
}

function linesOf(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      out.push({ start, end: i });
      start = i + 1;
    }
  }
  return out;
}

/** Top-level "( … )" spans as their own pieces, the text around them as the others. An unclosed "(" is plain text. */
function parenPieces(text: string, start: number, end: number): { start: number; end: number; paren: boolean }[] {
  const out: { start: number; end: number; paren: boolean }[] = [];
  let cursor = start;
  for (let i = start; i < end; i++) {
    if (text[i] !== "(") continue;
    let depth = 0;
    let close = -1;
    for (let j = i; j < end; j++) {
      if (text[j] === "(") depth++;
      else if (text[j] === ")" && --depth === 0) {
        close = j;
        break;
      }
    }
    if (close < 0) break;
    if (i > cursor) out.push({ start: cursor, end: i, paren: false });
    out.push({ start: i, end: close + 1, paren: true });
    cursor = close + 1;
    i = close;
  }
  if (cursor < end) out.push({ start: cursor, end, paren: false });
  return out;
}

/** Cut [start, end) after each match of `separator`; the separator stays at the end of the piece before it and is trimmed later. */
function cutAt(text: string, start: number, end: number, separator: RegExp): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const slice = text.slice(start, end);
  let cursor = 0;
  for (const match of slice.matchAll(separator)) {
    const cut = match.index + match[0].length;
    out.push({ start: start + cursor, end: start + cut });
    cursor = cut;
  }
  out.push({ start: start + cursor, end });
  return out;
}

/** Sentence ends: . ! ? (with any closing quote or bracket) before whitespace and a capital, digit, quote or bracket. */
function sentencesOf(text: string, start: number, end: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const slice = text.slice(start, end);
  let cursor = 0;
  for (const match of slice.matchAll(/[.!?]['"’”)\]]*(?=\s+['"‘“(\[]?[\p{Lu}\p{N}])/gu)) {
    if (match[0][0] === "." && isAbbreviation(slice, match.index)) continue;
    const cut = match.index + match[0].length;
    out.push({ start: start + cursor, end: start + cut });
    cursor = cut;
  }
  out.push({ start: start + cursor, end });
  return out;
}

function isAbbreviation(slice: string, dot: number): boolean {
  const word = /[\p{L}.]+$/u.exec(slice.slice(0, dot))?.[0] ?? "";
  if (/^(?:\p{L}\.)*\p{L}$/u.test(word)) return true; // "D." or "e.g."
  return ABBREVIATIONS.has(word.toLowerCase());
}

function cutAtOpeningCommas(text: string, start: number, end: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const slice = text.slice(start, end);
  let cursor = 0;
  for (const match of slice.matchAll(/,\s+(\p{L}+)/gu)) {
    if (!CLAUSE_OPENERS.has(match[1].toLowerCase())) continue;
    const cut = match.index + 1;
    const before = wordCount(text, { start: start + cursor, end: start + cut });
    const after = wordCount(text, { start: start + cut, end });
    if (before < COMMA_MIN_WORDS || after < COMMA_MIN_WORDS) continue;
    out.push({ start: start + cursor, end: start + cut });
    cursor = cut;
  }
  out.push({ start: start + cursor, end });
  return out;
}

/** Halve an over-long phrase at its most even SPLIT_AT point, recursively; leave it whole when there is none. */
function cutLong(text: string, start: number, end: number): { start: number; end: number }[] {
  const total = wordCount(text, { start, end });
  if (total <= MAX_WORDS) return [{ start, end }];
  let best = -1;
  let bestLonger = Infinity;
  for (const match of text.slice(start, end).matchAll(SPLIT_AT)) {
    const cut = start + match.index + 1;
    const before = wordCount(text, { start, end: cut });
    const longer = Math.max(before, total - before);
    if (Math.min(before, total - before) >= SPLIT_MIN_WORDS && longer < bestLonger) {
      best = cut;
      bestLonger = longer;
    }
  }
  if (best < 0) return [{ start, end }];
  return [...cutLong(text, start, best), ...cutLong(text, best, end)];
}

// ---------------------------------------------------------------------------
// Tidying

/** Drop surrounding whitespace and the separators a cut leaves behind; a closing "." stays. */
function trimSpan(text: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && /[\s,;:·|•—–-]/.test(text[start])) start++;
  while (end > start && /[\s,;:·|•—–-]/.test(text[end - 1])) end--;
  return { start, end, block: span.block };
}

function wordCount(text: string, span: Pick<Span, "start" | "end">): number {
  return text
    .slice(span.start, span.end)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Fold each short fragment into the previous fragment of its block, or the next one when it comes first. */
function mergeShort(text: string, spans: Span[], minWords: number): Span[] {
  const out = [...spans];
  for (let i = 0; i < out.length; i++) {
    if (wordCount(text, out[i]) >= minWords) continue;
    const prev = out[i - 1];
    const next = out[i + 1];
    if (prev && prev.block === out[i].block) {
      out.splice(i - 1, 2, { start: prev.start, end: out[i].end, block: prev.block });
      i -= 2;
    } else if (next && next.block === out[i].block) {
      out.splice(i, 2, { start: out[i].start, end: next.end, block: next.block });
      i -= 1;
    }
  }
  return out;
}

/** Over the cap, merge the adjacent pair with the fewest words between them, preferring pairs in the same block. */
function capSpans(text: string, spans: Span[], cap: number): Span[] {
  const out = [...spans];
  while (out.length > cap) {
    let best = 1;
    let bestCost = Infinity;
    for (let i = 1; i < out.length; i++) {
      const cost = wordCount(text, out[i - 1]) + wordCount(text, out[i]) + (out[i - 1].block === out[i].block ? 0 : 1000);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    out.splice(best - 1, 2, { start: out[best - 1].start, end: out[best].end, block: out[best - 1].block });
  }
  return out;
}
