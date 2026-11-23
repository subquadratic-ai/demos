import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "@/lib/config";
import type { UseCase } from "@/lib/usecase";
import marketing from "./marketing";

/**
 * Every use case the app can run, by folder name. To add one, give it a
 * folder beside this file (see lib/usecase.ts for what goes in it), import
 * it here, and set USE_CASE in .env.local. The first entry is the default.
 */
export const USE_CASES: Record<string, UseCase> = { marketing };

export type UseCaseFile = "rulebook.json" | "samples.json";

/** The use case named by USE_CASE, or the first registered one. */
export function getUseCase(id: string | undefined = getConfig().useCase): UseCase {
  const known = Object.keys(USE_CASES);
  const useCase = USE_CASES[id ?? known[0]];
  if (!useCase) throw new Error(`USE_CASE "${id}" is not registered in usecases/index.ts. Known: ${known.join(", ")}.`);
  return useCase;
}

/** Where one of a use case's data files lives. */
export function dataFile(useCase: Pick<UseCase, "id">, file: UseCaseFile): string {
  return join(process.cwd(), "usecases", useCase.id, file);
}

/** A use case's JSON data file, or undefined when it does not exist yet. */
export function readUseCaseJson<T>(useCase: Pick<UseCase, "id">, file: UseCaseFile): T | undefined {
  const path = dataFile(useCase, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}
