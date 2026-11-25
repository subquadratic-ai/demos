import { NextRequest } from "next/server";
import { isBundleSize, isPlacement } from "@/lib/catalog";
import { projectDocument } from "@/lib/bundle";
import { assembleBundle, loadLibrary, scenarioById } from "@/lib/load";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scenarioId = params.get("scenarioId") ?? "";
    const bundle = params.get("bundle") ?? "";
    const placement = params.get("placement") ?? "";
    if (!isBundleSize(bundle) || !isPlacement(placement)) {
      return Response.json(
        { ok: false, error: "Choose a compact or large bundle and a placement of beginning, middle, or end." },
        { status: 400 },
      );
    }
    const library = loadLibrary();
    const scenario = scenarioById(library, scenarioId);
    const documents = assembleBundle(library, scenario, bundle, placement);
    return Response.json(
      {
        ok: true,
        scenarioId: scenario.id,
        bundle,
        placement,
        documents: documents.map(projectDocument),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the document bundle.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
