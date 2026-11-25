import { findNode, isLeaf } from "@/lib/rulebook/tree";
import { errorResponse, failure, json } from "@/lib/server/http";
import { getRulebook } from "@/lib/server/rulebookStore";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; nodeId: string }> };

/** One clause's whole section: the rule first, then its procedures, guidance and examples. The page loads it when a clause is opened. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { id, nodeId } = await params;
    const rulebook = await getRulebook(id);
    const node = rulebook ? findNode(rulebook.tree, nodeId) : undefined;
    if (!node || !isLeaf(node)) return errorResponse(`No clause "${nodeId}"`, 404);
    return json({ nodeId, text: node.text ?? "" });
  } catch (error) {
    return failure(error);
  }
}
