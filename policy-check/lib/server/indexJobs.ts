import "server-only";
import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import { buildTree, type BuildProgress } from "@/lib/pageindex/build";
import { getSnapClient } from "@/lib/snap/client";
import type { IndexJob, Preflight, Rulebook } from "@/lib/types";
import { putRulebook } from "./rulebookStore";

/**
 * Background PageIndex builds. The upload route starts a job and returns at
 * once; the client polls GET /api/rulebook/jobs/[jobId] until it is done,
 * then fetches the finished rulebook from the store.
 */

interface JobsState {
  jobs: Map<string, IndexJob>;
}

const globalJobs = globalThis as unknown as { __indexJobs?: JobsState };
const state: JobsState = (globalJobs.__indexJobs ??= { jobs: new Map() });

const JOB_TTL_MS = 2 * 60 * 60 * 1000;

export interface StartIndexJobOptions {
  rulebookId: string;
  pages: string[];
  title: string;
  preflight: Preflight;
  organisation?: string;
}

export function startIndexJob(options: StartIndexJobOptions): IndexJob {
  sweep();
  const job: IndexJob = {
    id: randomUUID(),
    rulebookId: options.rulebookId,
    status: "queued",
    progress: 0,
    stage: "Queued",
    pagesIndexed: 0,
    pages: options.pages.length,
    nodesBuilt: 0,
    startedAt: Date.now(),
    elapsedMs: 0,
  };
  state.jobs.set(job.id, job);
  // Deliberately not awaited: the HTTP response must not wait for the build.
  void run(job, options);
  return job;
}

export function getJob(id: string): IndexJob | undefined {
  const job = state.jobs.get(id);
  if (job && job.status !== "done" && job.status !== "error") job.elapsedMs = Date.now() - job.startedAt;
  return job;
}

async function run(job: IndexJob, options: StartIndexJobOptions): Promise<void> {
  const apply = (progress: BuildProgress) => {
    Object.assign(job, progress);
    job.elapsedMs = Date.now() - job.startedAt;
  };
  try {
    apply({ status: "indexing", stage: "Starting tree build" });
    const { tree, indexer } = await buildTree({
      pages: options.pages,
      title: options.title,
      client: getSnapClient(),
      config: getConfig(),
      onProgress: apply,
    });
    const indexMs = Date.now() - job.startedAt;
    const rulebook: Rulebook = {
      id: options.rulebookId,
      title: options.title,
      organisation: options.organisation ?? "Uploaded document",
      source: "upload",
      pages: options.pages.length,
      preflight: options.preflight,
      tree,
      indexMs,
      indexer,
    };
    putRulebook(rulebook);
    apply({ status: "done", progress: 1, stage: `Indexed ${options.pages.length} pages`, pagesIndexed: options.pages.length });
  } catch (error) {
    job.error = error instanceof Error ? error.message : String(error);
    apply({ status: "error", stage: "Indexing failed" });
  }
}

function sweep(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of state.jobs) if (job.startedAt < cutoff) state.jobs.delete(id);
}
