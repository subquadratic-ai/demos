import { describe, expect, it } from "vitest";
import { buildTree } from "@/lib/pageindex/build";
import { countLeaves, findNode, isLeaf, leavesOf } from "@/lib/rulebook/tree";
import type { TreeNode } from "@/lib/types";
import { LIVE_TIMEOUT, liveClient } from "./client";

const depthOf = (node: TreeNode): number => (isLeaf(node) ? 0 : 1 + Math.max(...node.children.map(depthOf)));

/** The upload indexer ("snap" mode): Snap classifies candidate heading lines and the tree is built from them. */
describe("building a tree with live Snap", { timeout: LIVE_TIMEOUT }, () => {
  const client = liveClient();
  const body = (topic: string) => `This section sets out the rule on ${topic}. It applies to every communication. Records are kept for seven years.`;

  it("builds chapters and clauses with text, summaries and page ranges", async () => {
    const pages = [
      `1 Scope and Governance\n${body("scope")}\n\n1.1 Purpose\n${body("purpose")}\n\n1.2 Definitions\n${body("definitions")}`,
      `2 Claims\n${body("claims")}\n\n2.1 Guarantees\n${body("guarantees")}`,
      `2.2 Rates\n${body("rates")}\n\n2.3 Comparisons\n${body("comparisons")}\n\n3 Email\n${body("email")}`,
      `3.1 Consent\n${body("consent")}\n\n3.2 Unsubscribe\n${body("unsubscribe")}`,
    ];
    const stages: string[] = [];
    const { tree, indexer } = await buildTree({ pages, title: "Test Policy", client, onProgress: (p) => p.stage && stages.push(p.stage) });

    expect(indexer).toBe("snap");
    expect(tree.children.map((c) => [c.nodeId, c.title])).toEqual([
      ["1", "Scope and Governance"],
      ["2", "Claims"],
      ["3", "Email"],
    ]);
    expect(depthOf(tree)).toBe(2);
    expect(leavesOf(tree).map((leaf) => leaf.nodeId)).toEqual(["1.1", "1.2", "2.1", "2.2", "2.3", "3.1", "3.2"]);

    const rates = findNode(tree, "2.2")!;
    expect(rates.title).toBe("Rates");
    expect(rates.summary).toBe("This section sets out the rule on rates.");
    expect(rates.text).toContain("the rule on rates");
    expect([rates.pageStart, rates.pageEnd]).toEqual([3, 3]);
    const claims = findNode(tree, "2")!;
    expect([claims.pageStart, claims.pageEnd]).toEqual([2, 3]);
    expect(claims.text).toBeUndefined();

    expect(stages.some((s) => s.startsWith("Classifying"))).toBe(true);
    expect(stages[stages.length - 1]).toBe("Tree built");
  });

  it("keeps every heading of a flat numbered outline and groups them into chapters", async () => {
    // Snap judges each line alone and is lukewarm on short ones; continuing the numbering keeps them.
    const titles = ["Purpose", "Scope", "Definitions", "Roles and responsibilities", "Approvals", "Claims", "Pricing", "Disclosures", "Email and SMS", "Social media", "Vendors", "Payments"];
    const pages = titles.map((title, i) => `${i + 1} ${title}\n${body(title.toLowerCase())}`);
    const { tree } = await buildTree({ pages, title: "Flat outline", client });
    expect(leavesOf(tree).map((leaf) => leaf.title)).toEqual(titles);
    expect(tree.children.map((chapter) => chapter.children.length)).toEqual([10, 2]);
  });

  it("falls back to page groups for prose with no headings, without asking Snap", async () => {
    const pages = Array.from({ length: 23 }, (_, i) => `plain prose on page ${i + 1}. more prose follows here.`);
    const { tree } = await buildTree({ pages, title: "Flat", client });
    expect(tree.children).toHaveLength(3);
    expect(countLeaves(tree)).toBe(12);
    expect(tree.children[2].pageEnd).toBe(23);
  });
});
