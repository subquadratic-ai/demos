import { withClauseText } from "@/lib/rulebook/tree";
import { errorResponse, failure, json } from "@/lib/server/http";
import { deleteRulebook, getRulebook, isSampleRulebook } from "@/lib/server/rulebookStore";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;
    const rulebook = await getRulebook(id);
    // The browser only ever shows the clause, and that is also what Snap judges against.
    return rulebook ? json({ ...rulebook, tree: withClauseText(rulebook.tree) }) : errorResponse(`No rulebook "${id}"`, 404);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (isSampleRulebook(id)) return errorResponse("Sample rulebooks cannot be deleted", 403);
  deleteRulebook(id);
  // Idempotent: the client fires this on tab close and may not know whether the upload still exists.
  return new Response(null, { status: 204 });
}
