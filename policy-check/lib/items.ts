/**
 * Item kinds. A kind is only context for Snap ("kind: email" in the item
 * block) and a label on the card, so each use case names its own and a
 * cheap pattern match is enough to guess one for typed text.
 */

export interface KindRule {
  kind: string;
  /** How generated text names it: "advertisement" for "ad". Defaults to the kind itself. */
  label?: string;
  /** Typed text matching this is guessed to be this kind… */
  looksLike?: RegExp;
  /** …unless it also matches this. */
  unless?: RegExp;
}

/** A RegExp as plain JSON, so kind rules can travel to the browser. */
export interface Pattern {
  source: string;
  flags: string;
}

/** A KindRule as the page receives it. */
export interface KindView {
  kind: string;
  looksLike?: Pattern;
  unless?: Pattern;
}

/** Rules are tried in order; the last rule's kind is the fallback when none matches. */
export function guessKind(text: string, kinds: readonly (KindRule | KindView)[]): string {
  for (const rule of kinds) {
    if (rule.looksLike && matches(rule.looksLike, text) && !(rule.unless && matches(rule.unless, text))) return rule.kind;
  }
  return kinds.at(-1)?.kind ?? "item";
}

export function toPattern(regex: RegExp): Pattern {
  return { source: regex.source, flags: regex.flags };
}

function matches(pattern: RegExp | Pattern, text: string): boolean {
  return (pattern instanceof RegExp ? pattern : new RegExp(pattern.source, pattern.flags)).test(text);
}
