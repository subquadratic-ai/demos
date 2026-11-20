import { api, errorMessage, pollIndexJob, uploadRulebook } from "./api";
import { stopReveal } from "./reveal";
import { switchRulebook, useStore } from "./store";

/**
 * Bring-your-own rulebook: the file is read and pre-flighted on the server
 * (streamed progress), then a background job builds its PageIndex tree while
 * the page polls. Nothing touches disk; the server forgets it when the tab closes.
 */
export async function uploadAndIndex(file: File): Promise<void> {
  const state = useStore.getState();
  if (state.upload && state.upload.error === null && state.upload.finishedMs === null) return;
  const startedAt = Date.now();
  const patch = (update: Partial<NonNullable<typeof state.upload>>) =>
    useStore.setState((current) => (current.upload ? { upload: { ...current.upload, ...update } } : {}));

  useStore.setState({ upload: { fileName: file.name, startedAt, step: null, preflight: null, job: null, error: null, finishedMs: null } });
  try {
    let jobId: string | null = null;
    let rulebookId: string | null = null;
    await uploadRulebook(file, (event) => {
      switch (event.type) {
        case "step":
          patch({ step: { step: event.step, progress: event.progress, label: event.label } });
          break;
        case "preflight":
          patch({ preflight: event.preflight });
          break;
        case "indexing":
          jobId = event.jobId;
          rulebookId = event.rulebookId;
          break;
        case "error":
          throw new Error(event.message);
      }
    });
    if (!jobId || !rulebookId) throw new Error("The upload finished without starting an index job.");

    const job = await pollIndexJob(jobId, (update) => patch({ job: update }));
    if (job.status === "error") throw new Error(job.error ?? "Indexing failed.");

    const rulebook = await api.rulebook(rulebookId);
    stopReveal();
    switchRulebook(rulebook);
    useStore.setState((current) => ({ uploadedIds: [...current.uploadedIds, rulebook.id] }));
    patch({ finishedMs: Date.now() - startedAt });
  } catch (error) {
    patch({ error: errorMessage(error) });
  }
}

export function backToSample(): void {
  const { sample } = useStore.getState();
  if (!sample) return;
  stopReveal();
  switchRulebook(sample);
  useStore.setState({ upload: null });
}
