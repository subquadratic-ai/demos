import "server-only";
import { withClauseText } from "@/lib/rulebook/tree";
import type { DemoData, Sample } from "@/lib/types";
import { viewOf } from "@/lib/usecase";
import { getUseCase, readUseCaseJson } from "@/usecases";
import { getSampleRulebook } from "./rulebookStore";

/** First-render data for the page: the use case's rulebook, samples and copy. */
export async function loadDemo(): Promise<DemoData> {
  const useCase = getUseCase();
  const rulebook = await getSampleRulebook();
  return {
    rulebook: rulebook ? { ...rulebook, tree: withClauseText(rulebook.tree) } : null,
    samples: readUseCaseJson<Sample[]>(useCase, "samples.json") ?? [],
    useCase: viewOf(useCase),
  };
}
