import type { TreeNode } from "@/lib/types";

/** Pure helpers over a PageIndex tree. Shared by the screening engine and the UI. */

export function isLeaf(node: TreeNode): boolean {
  return node.children.length === 0;
}

export function leavesOf(node: TreeNode): TreeNode[] {
  if (isLeaf(node)) return [node];
  return node.children.flatMap(leavesOf);
}

export function countLeaves(node: TreeNode): number {
  return leavesOf(node).length;
}

/** Every node in document order, root first. */
export function walk(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(walk)];
}

export function findNode(root: TreeNode, nodeId: string): TreeNode | undefined {
  if (root.nodeId === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return undefined;
}

/** A first paragraph shorter than this is probably a heading or a stub, so the next one is added. */
const CLAUSE_MIN_CHARS = 200;
const CLAUSE_MAX_CHARS = 1200;

/**
 * The clause itself: the opening paragraph of a leaf, without the procedure,
 * guidance and examples that follow it. This is the text Snap judges against
 * and the text quoted next to every verdict, so the two always match. It also
 * keeps requests small.
 */
export function clauseOf(node: Pick<TreeNode, "text" | "summary">): string {
  const paragraphs = (node.text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return node.summary;
  let clause = paragraphs[0];
  for (let i = 1; i < paragraphs.length && clause.length < CLAUSE_MIN_CHARS; i++) clause = `${clause}\n\n${paragraphs[i]}`;
  if (clause.length <= CLAUSE_MAX_CHARS) return clause;
  // Cut at the last sentence end inside the cap so the clause never stops mid-sentence.
  const cut = clause.slice(0, CLAUSE_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return end > CLAUSE_MIN_CHARS ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/** Words in a text, as a reader would count them. */
export function countWords(text: string | undefined): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * The tree with every leaf's text cut to its clause: all the browser shows,
 * at a fraction of the size. Each leaf keeps its full section's word count.
 */
export function withClauseText(node: TreeNode): TreeNode {
  if (isLeaf(node)) return { ...node, text: clauseOf(node), words: node.words ?? countWords(node.text) };
  return { ...node, children: node.children.map(withClauseText) };
}
