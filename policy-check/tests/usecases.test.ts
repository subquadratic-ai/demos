import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guessKind } from "@/lib/items";
import { leavesOf } from "@/lib/rulebook/tree";
import type { Rulebook, Sample, SampleGroup } from "@/lib/types";
import { viewOf } from "@/lib/usecase";
import { readUseCaseJson, USE_CASES } from "@/usecases";

/**
 * The contract every use case meets. A folder registered in
 * usecases/index.ts is checked by these without a test of its own. Whether
 * each sample still earns its group on the live model is checked by
 * `npm run check-samples`, which needs the API.
 */

const GROUPS: SampleGroup[] = ["flags", "clears", "review"];
const USECASES_DIR = join(process.cwd(), "usecases");

describe("usecases/index.ts", () => {
  it("registers every use case folder under its own name", () => {
    const folders = readdirSync(USECASES_DIR).filter((name) => statSync(join(USECASES_DIR, name)).isDirectory());
    expect(Object.keys(USE_CASES).sort()).toEqual(folders.sort());
    for (const [key, useCase] of Object.entries(USE_CASES)) expect(useCase.id).toBe(key);
  });
});

describe.each(Object.values(USE_CASES))("usecases/$id", (useCase) => {
  const rulebook = readUseCaseJson<Rulebook>(useCase, "rulebook.json");
  const samples = readUseCaseJson<Sample[]>(useCase, "samples.json") ?? [];
  const kinds = useCase.kinds.map((rule) => rule.kind);

  it("has a rulebook whose clauses carry their text", () => {
    expect(rulebook, "run npm run index").toBeDefined();
    expect(rulebook!.tree.nodeId).toBe("root");
    const leaves = leavesOf(rulebook!.tree);
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) expect(leaf.text?.trim().length, leaf.nodeId).toBeGreaterThan(0);
  });

  it("names each kind once, and guesses the same kind in the browser as on the server", () => {
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds).size).toBe(kinds.length);
    const view = viewOf(useCase).kinds;
    for (const sample of samples) expect(guessKind(sample.text, view), sample.id).toBe(guessKind(sample.text, useCase.kinds));
  });

  it("has samples with distinct ids, its own kinds and a group", () => {
    expect(new Set(samples.map((s) => s.id)).size).toBe(samples.length);
    for (const sample of samples) {
      expect(kinds, sample.id).toContain(sample.kind);
      expect(GROUPS, sample.id).toContain(sample.group);
      expect(sample.text.trim().length, sample.id).toBeGreaterThan(0);
    }
  });

});
