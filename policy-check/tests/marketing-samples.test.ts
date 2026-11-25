import { describe, expect, it } from "vitest";
import type { Sample, SampleGroup } from "@/lib/types";
import { getUseCase, readUseCaseJson } from "@/usecases";

/**
 * What the marketing samples were curated to show. The contract every use
 * case meets is in usecases.test.ts; `npm run check-samples` confirms each
 * sample still earns its group on the live model.
 */

const marketing = getUseCase("marketing");
const SAMPLES = readUseCaseJson<Sample[]>(marketing, "samples.json")!;

describe("usecases/marketing/samples.json", () => {
  it("has 5 distinct samples: 3 that flag, 1 that clears, 1 for review", () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(["it-005", "it-036", "it-068", "it-287", "it-251"]);
    const count = (group: SampleGroup) => SAMPLES.filter((s) => s.group === group).length;
    expect([count("flags"), count("clears"), count("review")]).toEqual([3, 1, 1]);
  });

  it("opens the field on a one-line claim that breaks the 'guaranteed' clause", () => {
    expect(SAMPLES[0]).toMatchObject({ text: "Guaranteed 5% return", group: "flags", clause: "3.3" });
  });

  it("gives every other sample real text, and every sample a short hook", () => {
    for (const sample of SAMPLES) {
      if (sample !== SAMPLES[0]) expect(sample.text.length, sample.id).toBeGreaterThan(40);
      expect(sample.hook.length, sample.id).toBeLessThanOrEqual(60);
    }
  });

  it("mixes the groups instead of listing them in blocks", () => {
    // The page shows samples in file order with no labels; a run of one group would hint at the answer.
    const groups = SAMPLES.map((s) => s.group);
    const longestRun = groups.reduce((best, group, i) => {
      let run = 1;
      while (i - run >= 0 && groups[i - run] === group) run++;
      return Math.max(best, run);
    }, 0);
    expect(longestRun).toBeLessThanOrEqual(2);
    expect(groups).toEqual(expect.arrayContaining(["flags", "clears", "review"]));
  });
});

