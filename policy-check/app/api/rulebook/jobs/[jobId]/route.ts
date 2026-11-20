import { errorResponse, json } from "@/lib/server/http";
import { getJob } from "@/lib/server/indexJobs";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { jobId } = await params;
  const job = getJob(jobId);
  return job ? json(job) : errorResponse(`No index job "${jobId}"`, 404);
}
