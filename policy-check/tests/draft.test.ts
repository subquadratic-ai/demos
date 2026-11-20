import { describe, expect, it } from "vitest";
import { findSameText, sameText, stillResembles } from "@/lib/client/draft";
import type { Item } from "@/lib/types";

/**
 * The field decides what Check sends: an unchanged item is checked as
 * itself, anything edited becomes a new item. These pin down what counts as
 * "unchanged".
 */

const sample: Item = { id: "it-036", kind: "ad", text: "Sublinear Save: guaranteed 5.2% returns.\nOpen in four minutes." };
const mine: Item = { id: "own-1", kind: "ad", text: "Sublinear Save pays 4.3% variable." };

describe("the item field", () => {
  it("treats spacing and line breaks as the same text", () => {
    expect(sameText(sample.text, "  Sublinear Save: guaranteed 5.2% returns. Open in four minutes. ")).toBe(true);
    expect(sameText(sample.text, "Sublinear Save: 5.2% returns. Open in four minutes.")).toBe(false);
  });

  it("lets go of the picked item once its text is replaced", () => {
    expect(stillResembles("Sublinear Save: 5.2% variable returns. Open in four minutes.", sample.text)).toBe(true);
    expect(stillResembles("Subject: Weekly tips\nFive ways to save more this month.", sample.text)).toBe(false);
    expect(stillResembles("S", sample.text)).toBe(false);
    expect(stillResembles("", sample.text)).toBe(false);
  });

  it("re-uses an item with the same words instead of asking Snap again", () => {
    expect(findSameText("Sublinear Save pays 4.3% variable.", [sample, mine])?.id).toBe(mine.id);
    expect(findSameText("Sublinear Save: guaranteed 5.2% returns. Open in four minutes.", [sample, mine])?.id).toBe(sample.id);
    expect(findSameText("Something new", [sample, mine])).toBeUndefined();
  });
});
