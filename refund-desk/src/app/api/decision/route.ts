import {
  applyEdits,
  buildDecisionRequest,
  fingerprintDocuments,
} from "@/lib/bundle";
import { isBundleSize, isPlacement } from "@/lib/catalog";
import {
  assembleBundle,
  customerById,
  loadLibrary,
  scenarioById,
} from "@/lib/load";
import { requestDecision } from "@/lib/subq";
import type { SectionEditMap } from "@/lib/types";

type EditPayload = { sectionId: string; text: string | null };

function isEditPayload(value: unknown): value is EditPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sectionId === "string" &&
    (record.text === null || typeof record.text === "string")
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "The decision request was not valid JSON." },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null) {
    return Response.json(
      { ok: false, error: "The decision request must be an object." },
      { status: 400 },
    );
  }
  const record = body as Record<string, unknown>;
  const scenarioId = record.scenarioId;
  const bundle = record.bundle;
  const placement = record.placement;
  const clientRequestId = record.clientRequestId;
  const documentVersion = record.documentVersion;
  if (typeof scenarioId !== "string" || typeof clientRequestId !== "string") {
    return Response.json(
      { ok: false, error: "A scenario and request id are required." },
      { status: 400 },
    );
  }
  if (clientRequestId.length > 80) {
    return Response.json(
      { ok: false, error: "The request id is too long." },
      { status: 400 },
    );
  }
  if (typeof bundle !== "string" || !isBundleSize(bundle)) {
    return Response.json(
      { ok: false, error: "Choose the compact or large document bundle." },
      { status: 400 },
    );
  }
  if (typeof placement !== "string" || !isPlacement(placement)) {
    return Response.json(
      { ok: false, error: "Placement must be beginning, middle, or end." },
      { status: 400 },
    );
  }
  if (typeof documentVersion !== "number" || !Number.isInteger(documentVersion) || documentVersion < 1) {
    return Response.json(
      { ok: false, error: "Document version must be a positive integer." },
      { status: 400 },
    );
  }
  if (!Array.isArray(record.edits) || !record.edits.every(isEditPayload)) {
    return Response.json(
      { ok: false, error: "Edits must be a list of section ids and text." },
      { status: 400 },
    );
  }

  try {
    const library = loadLibrary();
    const scenario = scenarioById(library, scenarioId);
    const customer = customerById(library, scenario.customerId);
    const allowed = new Set(scenario.editableSectionIds);
    const edits: SectionEditMap = {};
    for (const edit of record.edits) {
      if (!allowed.has(edit.sectionId)) {
        return Response.json(
          { ok: false, error: `Section ${edit.sectionId} cannot be edited in this case file.` },
          { status: 400 },
        );
      }
      if (typeof edit.text === "string" && edit.text.length > 20_000) {
        return Response.json(
          { ok: false, error: "An edited section is too long." },
          { status: 400 },
        );
      }
      edits[edit.sectionId] = edit.text;
    }

    const documents = applyEdits(
      assembleBundle(library, scenario, bundle, placement),
      edits,
    );
    const payload = buildDecisionRequest(customer, scenario, documents);
    const decision = await requestDecision(payload, documents);
    if (!decision.ok) {
      return Response.json(
        { ok: false, error: decision.error, status: decision.status },
        { status: decision.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        ok: true,
        clientRequestId,
        scenarioId: scenario.id,
        documentVersion,
        fingerprint: fingerprintDocuments(documents),
        bundle,
        placement,
        ...decision.result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the decision request.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
