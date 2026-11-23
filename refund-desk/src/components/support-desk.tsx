"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QueuePanel } from "@/components/customer-panel";
import { DecisionPanel } from "@/components/decision-panel";
import { DiagnosticResults, type DiagnosticSlot } from "@/components/diagnostic-results";
import { DocumentsPanel } from "@/components/documents-panel";
import { applyEdits, fingerprintDocuments } from "@/lib/bundle";
import { elapsedPurchaseDays } from "@/lib/dates";
import type {
  BundleSize,
  Catalog,
  DecisionSuccess,
  ExceptionPlacement,
  SectionEditMap,
  SourceDocument,
} from "@/lib/types";

const DEFAULT_SCENARIO = "purchase-45-agreement-exception";

export function SupportDesk({ catalog }: { catalog: Catalog }) {
  const [scenarioId, setScenarioId] = useState(
    catalog.scenarios.some((scenario) => scenario.id === DEFAULT_SCENARIO)
      ? DEFAULT_SCENARIO
      : catalog.scenarios[0]?.id ?? "",
  );
  const [bundle, setBundle] = useState<BundleSize>("compact");
  const [placement, setPlacement] = useState<ExceptionPlacement>("middle");
  const [documents, setDocuments] = useState<SourceDocument[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [edits, setEdits] = useState<SectionEditMap>({});
  const [documentVersion, setDocumentVersion] = useState(1);
  const [current, setCurrent] = useState<DecisionSuccess | null>(null);
  const [previous, setPrevious] = useState<DecisionSuccess | null>(null);
  const [running, setRunning] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [assemblyWarning, setAssemblyWarning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const [diagnostic, setDiagnostic] = useState<DiagnosticSlot[] | null>(null);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);

  const latestRequest = useRef<string | null>(null);
  const bundleSeq = useRef(0);
  const shownResult = useRef<DecisionSuccess | null>(null);
  const diagnosticGeneration = useRef(0);

  const scenario = catalog.scenarios.find((item) => item.id === scenarioId) ?? catalog.scenarios[0];
  const customer = catalog.customers.find((item) => item.id === scenario?.customerId);

  const draftFingerprint = useMemo(() => {
    if (!documents) return null;
    return fingerprintDocuments(applyEdits(documents, edits));
  }, [documents, edits]);

  useEffect(() => {
    if (!scenario) return;
    const seq = bundleSeq.current + 1;
    bundleSeq.current = seq;
    const controller = new AbortController();
    const params = new URLSearchParams({
      scenarioId: scenario.id,
      bundle,
      placement,
    });
    void fetch(`/api/bundle?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          ok?: boolean;
          error?: string;
          documents?: SourceDocument[];
          scenarioId?: string;
        };
        if (seq !== bundleSeq.current) return;
        const nextDocuments = body.documents;
        if (!response.ok || !body.ok || !nextDocuments) {
          setDocuments(null);
          setDocsError(body.error ?? "Could not load the document bundle.");
          return;
        }
        setDocuments(nextDocuments);
        setSelectedDocumentId((currentId) => {
          if (currentId && nextDocuments.some((document) => document.id === currentId)) {
            return currentId;
          }
          return scenario.movableDocumentId ?? nextDocuments[0]?.id ?? null;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (seq !== bundleSeq.current) return;
        setDocsError("Could not load the document bundle.");
        setDocuments(null);
      })
      .finally(() => {
        if (seq === bundleSeq.current) setDocsLoading(false);
      });
    return () => controller.abort();
  }, [scenario, bundle, placement]);

  useEffect(() => {
    if (!focusSectionId) return;
    const element = document.getElementById(`section-${focusSectionId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSectionId, focusNonce, documents, selectedDocumentId]);

  function markPrevious(result: DecisionSuccess) {
    shownResult.current = null;
    setPrevious(result);
    setCurrent(null);
    setDocumentVersion(result.documentVersion + 1);
    latestRequest.current = null;
    setRunning(false);
  }

  function changeScenario(nextId: string) {
    if (nextId === scenarioId) return;
    latestRequest.current = null;
    shownResult.current = null;
    setRunning(false);
    setDocsLoading(true);
    setDocsError(null);
    setScenarioId(nextId);
    setEdits({});
    setCurrent(null);
    setPrevious(null);
    setDocumentVersion(1);
    setDecisionError(null);
    setStaleNotice(null);
    setAssemblyWarning(null);
    setQuery("");
    setFocusSectionId(null);
  }

  function changeBundle(next: BundleSize) {
    if (next === bundle) return;
    if (current) markPrevious(current);
    setDocsLoading(true);
    setDocsError(null);
    setBundle(next);
  }

  function changePlacement(next: ExceptionPlacement) {
    if (next === placement) return;
    if (current && scenario?.movableDocumentId) markPrevious(current);
    setDocsLoading(true);
    setDocsError(null);
    setPlacement(next);
  }

  function changeEdit(sectionId: string, text: string | null) {
    const next = { ...edits, [sectionId]: text };
    reviseEdits(next);
  }

  function restoreEdit(sectionId: string) {
    const next = { ...edits };
    delete next[sectionId];
    reviseEdits(next);
  }

  function reviseEdits(next: SectionEditMap) {
    if (!documents || !scenario) {
      setEdits(next);
      return;
    }
    const fingerprint = fingerprintDocuments(applyEdits(documents, next));
    const existing = shownResult.current;
    if (existing && existing.fingerprint !== fingerprint) {
      markPrevious(existing);
    } else if (
      !existing &&
      previous &&
      previous.fingerprint === fingerprint &&
      previous.scenarioId === scenario.id
    ) {
      shownResult.current = previous;
      setCurrent(previous);
      setPrevious(null);
      setDocumentVersion(previous.documentVersion);
    }
    setEdits(next);
  }

  async function runDecision() {
    if (!scenario || !documents || !draftFingerprint) return;
    const clientRequestId = crypto.randomUUID();
    const sentVersion = documentVersion;
    const sentScenario = scenario.id;
    const sentFingerprint = draftFingerprint;
    latestRequest.current = clientRequestId;
    setRunning(true);
    setDecisionError(null);
    setAssemblyWarning(null);
    try {
      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId,
          scenarioId: sentScenario,
          bundle,
          placement,
          documentVersion: sentVersion,
          edits: Object.entries(edits).map(([sectionId, text]) => ({ sectionId, text })),
        }),
      });
      const body = (await response.json()) as DecisionSuccess | { ok: false; error?: string };
      if (latestRequest.current !== clientRequestId) {
        setStaleNotice(
          "A response for an earlier document version arrived late and was not applied.",
        );
        return;
      }
      if (!response.ok || !body.ok) {
        setDecisionError(
          "error" in body && body.error
            ? body.error
            : "The decision service did not return a decision.",
        );
        return;
      }
      if (body.scenarioId !== sentScenario || body.documentVersion !== sentVersion) {
        setStaleNotice(
          "A response for a different case or document version arrived and was not applied.",
        );
        return;
      }
      if (body.fingerprint !== sentFingerprint) {
        setAssemblyWarning(
          "The server fingerprint does not match the editor. The decision below used the server copy.",
        );
      }
      shownResult.current = body;
      setCurrent(body);
      setFocusSectionId(null);
      setStaleNotice(null);
    } catch {
      if (latestRequest.current === clientRequestId) {
        setDecisionError("The browser could not reach the desk.");
      }
    } finally {
      if (latestRequest.current === clientRequestId) setRunning(false);
    }
  }

  async function runDiagnostic() {
    const generation = diagnosticGeneration.current + 1;
    diagnosticGeneration.current = generation;
    const ids = catalog.scenarios.map((item) => item.id);
    setDiagnosticRunning(true);
    setDiagnostic(
      ids.map((scenarioId) => ({
        scenarioId,
        status: "running",
        result: null,
        error: null,
      })),
    );
    const queue = [...ids];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const scenarioId = queue.shift();
        if (!scenarioId || diagnosticGeneration.current !== generation) return;
        const finish = (patch: Pick<DiagnosticSlot, "status" | "result" | "error">) => {
          if (diagnosticGeneration.current !== generation) return;
          setDiagnostic((current) =>
            current?.map((slot) => (slot.scenarioId === scenarioId ? { ...slot, ...patch } : slot)) ??
            current,
          );
        };
        try {
          const response = await fetch("/api/decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientRequestId: crypto.randomUUID(),
              scenarioId,
              bundle: "compact",
              placement: "middle",
              documentVersion: 1,
              edits: [],
            }),
          });
          const body = (await response.json()) as DecisionSuccess | { ok: false; error?: string };
          if (!response.ok || !body.ok) {
            finish({
              status: "error",
              result: null,
              error:
                "error" in body && body.error
                  ? body.error
                  : "The decision service did not return a decision.",
            });
          } else {
            finish({ status: "done", result: body, error: null });
          }
        } catch {
          finish({ status: "error", result: null, error: "The browser could not reach the desk." });
        }
      }
    });
    await Promise.all(workers);
    if (diagnosticGeneration.current === generation) setDiagnosticRunning(false);
  }

  function openSection(sectionId: string) {
    if (!documents) return;
    const owner = documents.find((document) =>
      document.sections.some((section) => section.id === sectionId),
    );
    if (!owner) return;
    setSelectedDocumentId(owner.id);
    setQuery("");
    setFocusSectionId(sectionId);
    setFocusNonce((value) => value + 1);
  }

  if (!scenario || !customer) {
    return <p className="p-8 text-sm">The case file catalog is empty.</p>;
  }

  const highlighted =
    focusSectionId ??
    (current?.governingSection.found === true ? current.governingSection.id : null);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-6 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-sm font-semibold text-white">
              N
            </span>
            <div>
              <p className="text-sm text-muted">Northstar Software</p>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Support desk</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void runDiagnostic()}
              disabled={diagnosticRunning}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#173e61] disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {diagnosticRunning ? "Running diagnostic…" : "Run diagnostic"}
            </button>
            <p className="text-sm text-muted">16 October 2026</p>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1720px] flex-col gap-5 px-5 py-5 sm:px-8">
        {diagnostic ? (
          <DiagnosticResults
            catalog={catalog}
            slots={diagnostic}
            running={diagnosticRunning}
            onClose={() => {
              diagnosticGeneration.current += 1;
              setDiagnostic(null);
              setDiagnosticRunning(false);
            }}
          />
        ) : null}
      <main
        className={`grid grid-cols-1 items-start gap-5 ${
          previous
            ? "xl:grid-cols-[300px_minmax(0,1fr)_minmax(460px,560px)]"
            : "xl:grid-cols-[300px_minmax(0,1fr)_380px]"
        }`}
      >
        <QueuePanel
          scenario={scenario}
          customer={customer}
          scenarios={catalog.scenarios}
          customers={catalog.customers}
          bundle={bundle}
          placement={placement}
          draftFingerprint={draftFingerprint}
          running={running}
          onScenario={changeScenario}
          onBundle={changeBundle}
          onPlacement={changePlacement}
          onRun={() => void runDecision()}
        />
        <DocumentsPanel
          documents={documents}
          loading={docsLoading}
          error={docsError}
          customers={catalog.customers}
          edits={edits}
          editableSectionIds={scenario.editableSectionIds}
          query={query}
          selectedDocumentId={selectedDocumentId}
          highlightedSectionId={highlighted}
          onQuery={setQuery}
          onSelect={setSelectedDocumentId}
          onEdit={changeEdit}
          onRestore={restoreEdit}
        />
        <DecisionPanel
          current={current}
          previous={previous}
          documentVersion={documentVersion}
          running={running}
          error={decisionError}
          staleNotice={staleNotice}
          assemblyWarning={assemblyWarning}
          showPlacement={scenario.movableDocumentId !== null}
          customerName={customer.name}
          elapsedDays={elapsedPurchaseDays(scenario.purchaseDate)}
          onOpenSection={(sectionId) => openSection(sectionId)}
        />
      </main>
      </div>
    </div>
  );
}
