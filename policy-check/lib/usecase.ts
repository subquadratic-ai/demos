import { toPattern, type KindRule, type KindView } from "./items";
import type { SeverityWording } from "./snap/questions";

/**
 * A use case is one rulebook, the items to check against it, and the few
 * words that change with the domain. The engine, the questions, the
 * verdict rule and the page are shared by every use case.
 *
 * Each use case is a folder under usecases/ holding its definition
 * (index.ts, default-exporting a UseCase) and its data:
 *
 *   rulebook.json   the PageIndex tree        npm run index -- <document> --usecase <id>
 *   samples.json    the items in the picker   written by hand, checked live with
 *                                             npm run check-samples -- --usecase <id>
 *
 * Register it in usecases/index.ts and set USE_CASE in .env.local.
 */
export interface UseCase {
  /** The folder name under usecases/, and the value of USE_CASE. */
  id: string;
  /** Item kinds, in the order typed text is matched against them; the last one is the fallback. */
  kinds: KindRule[];
  /** The question above the item field, e.g. "Is this claim within our policy?". */
  question: string;
  /** Placeholder in the item field. */
  placeholder: string;
  /** How Snap's severity question is worded. Neutral wording when omitted. */
  severity?: SeverityWording;
}

/** The part of a use case the page needs, as plain JSON. */
export interface UseCaseView {
  id: string;
  kinds: KindView[];
  question: string;
  placeholder: string;
}

export function viewOf(useCase: UseCase): UseCaseView {
  return {
    id: useCase.id,
    kinds: useCase.kinds.map(({ kind, looksLike, unless }) => ({
      kind,
      ...(looksLike ? { looksLike: toPattern(looksLike) } : {}),
      ...(unless ? { unless: toPattern(unless) } : {}),
    })),
    question: useCase.question,
    placeholder: useCase.placeholder,
  };
}

/** Kind → how generated text names it. */
export function kindLabels(useCase: UseCase): Record<string, string> {
  return Object.fromEntries(useCase.kinds.map((rule) => [rule.kind, rule.label ?? rule.kind]));
}
