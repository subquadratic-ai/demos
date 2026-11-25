import type { TreeNode } from "@/lib/types";
import type { BuildProgress } from "./build";

/**
 * Adapter for a hosted PageIndex service. Kept isolated so the rest of the
 * indexer never depends on it, and so this file is the only one to touch
 * when the real API differs from what is assumed here.
 *
 * ASSUMED SHAPE (not verified against a live service):
 *   POST {apiUrl}/documents            { title, pages: string[] }   -> { id }
 *   GET  {apiUrl}/documents/{id}       -> { status: "queued" | "processing" | "completed" | "failed",
 *                                           error?: string, tree?: PageIndexNode[] }
 *   PageIndexNode: { node_id, title, summary?, start_index, end_index, text?, nodes?: PageIndexNode[] }
 *     start_index / end_index are 1-based inclusive page numbers.
 */

export interface PageIndexNode {
  node_id: string;
  title: string;
  summary?: string;
  start_index: number;
  end_index: number;
  text?: string;
  nodes?: PageIndexNode[];
}

interface SubmitResponse {
  id: string;
}

interface StatusResponse {
  status: "queued" | "processing" | "completed" | "failed";
  error?: string;
  tree?: PageIndexNode[];
}

export interface PageIndexOptions {
  pages: string[];
  title: string;
  apiUrl: string;
  apiKey?: string;
  onProgress?: (progress: BuildProgress) => void;
  pollMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function buildTreeWithPageIndex(options: PageIndexOptions): Promise<TreeNode> {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const pollMs = options.pollMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const base = options.apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;

  options.onProgress?.({ status: "indexing", progress: 0.05, stage: "Uploading to PageIndex", pagesIndexed: 0, pages: options.pages.length, nodesBuilt: 0 });
  const submit = await fetchImpl(`${base}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: options.title, pages: options.pages }),
  });
  if (!submit.ok) throw new Error(`PageIndex submit failed with HTTP ${submit.status}`);
  const { id } = (await submit.json()) as SubmitResponse;

  const deadline = Date.now() + timeoutMs;
  for (let poll = 0; Date.now() < deadline; poll++) {
    const response = await fetchImpl(`${base}/documents/${encodeURIComponent(id)}`, { headers });
    if (!response.ok) throw new Error(`PageIndex status failed with HTTP ${response.status}`);
    const status = (await response.json()) as StatusResponse;
    if (status.status === "completed" && status.tree) {
      const tree = toTreeNode(options.title, status.tree, options.pages.length);
      options.onProgress?.({ status: "indexing", progress: 1, stage: "Tree built", pagesIndexed: options.pages.length, pages: options.pages.length, nodesBuilt: countNodes(tree) - 1 });
      return tree;
    }
    if (status.status === "failed") throw new Error(status.error ?? "PageIndex reported a failure.");
    // The service reports no granular progress; ease the bar toward 90% while we wait.
    options.onProgress?.({ status: "indexing", progress: Math.min(0.9, 0.1 + poll * 0.02), stage: "PageIndex is building the tree", pagesIndexed: 0, pages: options.pages.length, nodesBuilt: 0 });
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("PageIndex timed out.");
}

export function toTreeNode(title: string, nodes: PageIndexNode[], pages: number): TreeNode {
  const used = new Set<string>(["root"]);
  const convert = (node: PageIndexNode, index: number): TreeNode => {
    const children = (node.nodes ?? []).map(convert);
    const nodeId = used.has(node.node_id) || !node.node_id ? `n${used.size + index}` : node.node_id;
    used.add(nodeId);
    const text = children.length === 0 ? node.text ?? "" : undefined;
    return {
      nodeId,
      title: node.title,
      summary: node.summary ?? firstSentence(text ?? "") ?? node.title,
      pageStart: node.start_index,
      pageEnd: node.end_index,
      ...(text !== undefined ? { text } : {}),
      children,
    };
  };
  return { nodeId: "root", title, summary: title, pageStart: 1, pageEnd: Math.max(1, pages), children: nodes.map(convert) };
}

function firstSentence(text: string): string | undefined {
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim());
  return match ? match[0].trim() : undefined;
}

function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((n, child) => n + countNodes(child), 0);
}
