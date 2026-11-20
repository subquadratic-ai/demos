import type { Item, Rulebook, TreeNode } from "@/lib/types";

/** A small 3-level tree (root → chapter → section → leaf) used across the engine tests. */

function leaf(nodeId: string, title: string, text: string, page: number): TreeNode {
  return { nodeId, title, summary: text.split(". ")[0] + ".", pageStart: page, pageEnd: page, text, children: [] };
}

export function syntheticTree(): TreeNode {
  return {
    nodeId: "root",
    title: "Test Policy",
    summary: "A tiny policy for tests.",
    pageStart: 1,
    pageEnd: 12,
    children: [
      {
        nodeId: "1",
        title: "Claims",
        summary: "Standards for factual claims, guarantees and rates.",
        pageStart: 1,
        pageEnd: 6,
        children: [
          {
            nodeId: "1.1",
            title: "Guarantees",
            summary: "Guarantee and certainty language.",
            pageStart: 1,
            pageEnd: 3,
            children: [
              leaf("1.1.1", "Certainty words", "Words such as guaranteed or risk-free are prohibited for variable products. Use plain language.", 1),
              leaf("1.1.2", "Rates", "Any quoted rate states whether it is fixed or variable. A variable rate is never presented as fixed.", 2),
            ],
          },
          {
            nodeId: "1.2",
            title: "Comparisons",
            summary: "Comparative and superlative claims.",
            pageStart: 4,
            pageEnd: 6,
            children: [
              leaf("1.2.1", "Superlatives", "Best, number one and lowest require independent substantiation. Keep the evidence on file.", 4),
              leaf("1.2.2", "Competitor comparisons", "A comparison names its basis and date. It never disparages.", 5),
            ],
          },
        ],
      },
      {
        nodeId: "2",
        title: "Email",
        summary: "Consent, unsubscribe and quiet hours for outbound messages.",
        pageStart: 7,
        pageEnd: 12,
        children: [
          {
            nodeId: "2.1",
            title: "Consent",
            summary: "Opt-in and unsubscribe.",
            pageStart: 7,
            pageEnd: 9,
            children: [
              leaf("2.1.1", "Opt-in", "Marketing email is sent only to recipients with recorded consent. Keep the record.", 7),
              leaf("2.1.2", "Unsubscribe", "Every marketing email contains a working unsubscribe link. Honour it within five days.", 8),
            ],
          },
          {
            nodeId: "2.2",
            title: "Timing",
            summary: "Quiet hours and frequency.",
            pageStart: 10,
            pageEnd: 12,
            children: [
              leaf("2.2.1", "Quiet hours", "No marketing SMS is sent between 21:00 and 08:00. Schedule sends in daytime only.", 10),
              leaf("2.2.2", "Frequency", "No more than three marketing emails per week. Count every campaign.", 11),
            ],
          },
        ],
      },
    ],
  };
}

export function syntheticRulebook(): Pick<Rulebook, "id" | "title" | "tree"> {
  return { id: "test-policy", title: "Test Policy", tree: syntheticTree() };
}

export function item(id: string, text: string, kind: Item["kind"] = "ad"): Item {
  return { id, kind, text };
}
