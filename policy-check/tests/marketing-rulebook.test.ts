import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Rulebook, TreeNode } from "@/lib/types";
import { isLeaf, leavesOf, walk } from "@/lib/rulebook/tree";
import { OUTLINE, OUTLINE_LEAF_COUNT } from "@/usecases/marketing/source/outline";

/**
 * Checks the marketing use case's synthetic rulebook. Regenerate it with
 * `npm run generate:marketing` if the outline or clauses changed.
 */

const rulebook = JSON.parse(readFileSync(fileURLToPath(new URL("../usecases/marketing/rulebook.json", import.meta.url)), "utf8")) as Rulebook;

/** The contract's target page count, with a little room for the packer. */
const PAGE_RANGE: [number, number] = [350, 400];

describe("usecases/marketing/rulebook.json", () => {
  const nodes = walk(rulebook.tree);
  const leaves = leavesOf(rulebook.tree);

  it("has the expected identity and metadata", () => {
    expect(rulebook.id).toBe("marketing-policy");
    expect(rulebook.organisation).toBe("Sublinear Financial");
    expect(rulebook.source).toBe("fixture");
    expect(rulebook.indexer).toBe("fixture");
    expect(rulebook.indexMs).toBeGreaterThan(0);
    expect(rulebook.tree.nodeId).toBe("root");
    expect(rulebook.tree.title).toBe(rulebook.title);
  });

  it("has unique node ids in the fixture format", () => {
    const ids = nodes.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of rulebook.tree.children) {
      expect(chapter.nodeId).toMatch(/^\d+$/);
      for (const leaf of chapter.children) {
        expect(leaf.nodeId).toMatch(new RegExp(`^${chapter.nodeId}\\.\\d+$`));
        expect(isLeaf(leaf)).toBe(true);
      }
    }
  });

  it("gives every leaf a summary and text that opens with the summary", () => {
    for (const leaf of leaves) {
      expect(leaf.summary.trim().length).toBeGreaterThan(20);
      expect(leaf.text?.trim().length ?? 0).toBeGreaterThan(leaf.summary.length);
      expect(leaf.text?.startsWith(leaf.summary)).toBe(true);
    }
    for (const node of nodes.filter((n) => !isLeaf(n))) {
      expect(node.text).toBeUndefined();
      expect(node.summary.trim().length).toBeGreaterThan(20);
    }
  });

  it("has the expected leaf count and pages within target", () => {
    expect(leaves.length).toBe(OUTLINE_LEAF_COUNT);
    const [min, max] = PAGE_RANGE;
    expect(rulebook.pages).toBeGreaterThanOrEqual(min);
    expect(rulebook.pages).toBeLessThanOrEqual(max);
  });

  it("has monotonic page ranges within [1, pages] that nest inside their parents", () => {
    const { pages } = rulebook;
    for (const node of nodes) {
      expect(node.pageStart).toBeGreaterThanOrEqual(1);
      expect(node.pageEnd).toBeLessThanOrEqual(pages);
      expect(node.pageStart).toBeLessThanOrEqual(node.pageEnd);
    }
    // Front matter (title page, contents) precedes chapter 1 and belongs to no node.
    expect(rulebook.tree.pageStart).toBeGreaterThanOrEqual(1);
    expect(rulebook.tree.pageStart).toBeLessThanOrEqual(10);
    expect(rulebook.tree.pageEnd).toBe(pages);

    const checkChildren = (parent: TreeNode) => {
      let previous: TreeNode | undefined;
      for (const child of parent.children) {
        expect(child.pageStart).toBeGreaterThanOrEqual(parent.pageStart);
        expect(child.pageEnd).toBeLessThanOrEqual(parent.pageEnd);
        // A section may share a page with the one before it, but never start earlier.
        if (previous) expect(child.pageStart).toBeGreaterThanOrEqual(previous.pageEnd);
        previous = child;
        checkChildren(child);
      }
      if (parent.children.length > 0) {
        expect(parent.pageStart).toBe(parent.children[0].pageStart);
        expect(parent.pageEnd).toBe(parent.children[parent.children.length - 1].pageEnd);
      }
    };
    checkChildren(rulebook.tree);
  });

  it("has a preflight consistent with its pages and tree", () => {
    const { preflight } = rulebook;
    expect(preflight.pages).toBe(rulebook.pages);
    expect(preflight.pagesWithText).toBe(rulebook.pages);
    expect(preflight.tokens).toBe(rulebook.pages * 650);
    expect(preflight.tokens).toBeLessThan(preflight.contextTokens);
    expect(preflight.headingCandidates).toBe(nodes.length - 1);
    expect(preflight.warnings).toEqual([]);
    expect(preflight.elapsedMs).toBeGreaterThanOrEqual(20_000);
    expect(preflight.elapsedMs).toBeLessThanOrEqual(40_000);
  });

  it("packs text at roughly 480 words per page", () => {
    const words = leaves.reduce((n, leaf) => n + (leaf.text?.split(/\s+/).length ?? 0), 0);
    const wordsPerPage = words / rulebook.pages;
    expect(wordsPerPage).toBeGreaterThan(400);
    expect(wordsPerPage).toBeLessThan(500);
  });
});

describe("the marketing rulebook matches its outline", () => {
  it("has exactly the 109 leaves of the outline, in order", () => {
    const expected = OUTLINE.flatMap((chapter) => chapter.leaves.map((leaf) => leaf.id));
    expect(expected).toHaveLength(109);
    expect(leavesOf(rulebook.tree).map((leaf) => leaf.nodeId)).toEqual(expected);
  });

  it("uses the outline's chapter and leaf titles", () => {
    expect(rulebook.tree.children.map((c) => [c.nodeId, c.title, c.summary])).toEqual(
      OUTLINE.map((c) => [c.id, c.title, c.summary]),
    );
    const titles = new Map(leavesOf(rulebook.tree).map((leaf) => [leaf.nodeId, leaf.title]));
    for (const chapter of OUTLINE) {
      for (const leaf of chapter.leaves) expect(titles.get(leaf.id)).toBe(leaf.title);
    }
  });

  it("gives every leaf a distinct first-sentence summary", () => {
    const summaries = leavesOf(rulebook.tree).map((leaf) => leaf.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});
