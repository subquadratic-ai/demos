import { actionLabel, formatDuration, formatPercent, formatTokens, formatUsd } from "@/lib/format";
import { explainDecision } from "@/lib/why";
import {
  ACTION_ORDER,
  CONFLICTING_EVIDENCE,
  INSUFFICIENT_EVIDENCE,
  INPUT_USD_PER_MILLION,
  type DecisionSuccess,
} from "@/lib/types";

type DecisionPanelProps = {
  current: DecisionSuccess | null;
  previous: DecisionSuccess | null;
  documentVersion: number;
  running: boolean;
  error: string | null;
  staleNotice: string | null;
  assemblyWarning: string | null;
  showPlacement: boolean;
  customerName: string;
  elapsedDays: number | null;
  onOpenSection: (sectionId: string, source: DecisionSuccess) => void;
};

export function DecisionPanel({
  current,
  previous,
  documentVersion,
  running,
  error,
  staleNotice,
  assemblyWarning,
  showPlacement,
  customerName,
  elapsedDays,
  onOpenSection,
}: DecisionPanelProps) {
  const comparing = previous !== null;

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-white shadow-sm" aria-live="polite">
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-base font-semibold text-ink">Decision</h2>
      </div>
      <div className="space-y-5 px-6 py-6">
        {staleNotice ? (
          <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink">
            {staleNotice}
          </p>
        ) : null}
        {assemblyWarning ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
            {assemblyWarning}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-900">
            {error}
          </p>
        ) : null}
        {!current && !previous && !running && !error ? (
          <EmptyState />
        ) : (
          <div className={`grid gap-4 ${comparing ? "xl:grid-cols-2" : ""}`}>
            {previous ? (
              <DecisionCard
                result={previous}
                tone="previous"
                showPlacement={showPlacement}
                customerName={customerName}
                elapsedDays={elapsedDays}
                onOpenSection={onOpenSection}
              />
            ) : null}
            {running ? (
              <LoadingCard version={documentVersion} />
            ) : current ? (
              <DecisionCard
                result={current}
                tone="current"
                showPlacement={showPlacement}
                customerName={customerName}
                elapsedDays={elapsedDays}
                onOpenSection={onOpenSection}
              />
            ) : previous ? (
              <p className="rounded-md border border-dashed border-line px-4 py-6 text-sm leading-6 text-muted">
                Document version {documentVersion} has not been sent. Run decision to evaluate the
                edited file. The card beside this note is the previous version.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="px-1 py-8">
      <p className="text-xl font-semibold tracking-tight text-ink">No decision yet</p>
      <p className="mt-3 max-w-sm text-base leading-7 text-muted">
        Run this file to see the action and how likely each outcome is.
      </p>
    </div>
  );
}

function LoadingCard({ version }: { version: number }) {
  return (
    <div className="rounded-md border border-line px-4 py-6" aria-busy="true">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        Document version {version}
      </p>
      <p className="mt-3 text-sm leading-6 text-ink">Reviewing the file…</p>
      <p className="mt-1 text-sm leading-6 text-muted">
        The clock starts on the server when the request goes out.
      </p>
    </div>
  );
}

function DecisionCard({
  result,
  tone,
  showPlacement,
  customerName,
  elapsedDays,
  onOpenSection,
}: {
  result: DecisionSuccess;
  tone: "current" | "previous";
  showPlacement: boolean;
  customerName: string;
  elapsedDays: number | null;
  onOpenSection: (sectionId: string, source: DecisionSuccess) => void;
}) {
  const why = explainDecision({
    action: result.action,
    customerName,
    elapsedDays,
    sectionId: result.governingSection.id,
    sectionTitle: result.governingSection.title,
    sectionText: result.governingSection.text,
  });
  const known = ACTION_ORDER.includes(result.action as (typeof ACTION_ORDER)[number]);
  return (
    <article className="rounded-2xl border border-line px-5 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          {tone === "previous" ? "Previous document version" : "Current document version"}{" "}
          {result.documentVersion}
        </p>
        <p className="font-mono text-xs text-muted">{result.fingerprint.slice(0, 8)}</p>
      </header>
      <p className="mt-1 text-xs text-muted">
        {result.bundle === "large" ? "Large bundle" : "Compact bundle"}
        {showPlacement ? ` · agreement placed at the ${result.placement}` : ""}
      </p>
      <p className="mt-6 text-sm text-muted">Selected action</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{actionLabel(result.action)}</p>
      {!known ? (
        <p className="mt-2 text-sm leading-6 text-ink">
          The desk returned <span className="font-mono">{result.action}</span>, which is outside the
          four prepared actions.
        </p>
      ) : null}
      {result.responseWarning ? (
        <p className="mt-3 text-sm leading-6 text-amber-950">{result.responseWarning}</p>
      ) : null}

      <h3 className="mt-6 text-sm text-muted">Why</h3>
      <p className="mt-2 text-base leading-7 text-ink">{why}</p>

      <h3 className="mt-8 text-sm text-muted">Probability</h3>
      <div className="mt-4 space-y-5">
        {ACTION_ORDER.map((action) => {
          const value = result.actionProbabilities[action];
          const present = typeof value === "number";
          const width = present ? `${Math.max(0, Math.min(1, value)) * 100}%` : "0%";
          const selected = result.action === action;
          return (
            <div key={action}>
              <div className="flex items-baseline justify-between gap-4 text-base">
                <span className={selected ? "font-semibold text-ink" : "text-ink"}>
                  {actionLabel(action)}
                </span>
                <span className="tabular-nums text-muted">
                  {present ? formatPercent(value) : "Not returned"}
                </span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-paper">
                <div
                  className={`h-3 rounded-full ${selected ? "bg-accent" : "bg-[#b7c9d8]"}`}
                  style={{ width }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <SectionBlock result={result} onOpen={() => onOpenSection(result.governingSection.id, result)} />

      <dl className="mt-5 grid gap-4 border-t border-line pt-4 text-sm">
        <Metric
          label="Input tokens"
          value={result.inputTokens === null ? "Not returned" : formatTokens(result.inputTokens)}
          detail="Token count returned with the decision."
        />
        <Metric
          label="Response time"
          value={formatDuration(result.providerRoundTripMs)}
          detail="Measured on the server, from sending the request until the reply arrives."
        />
        <Metric
          label="Estimated input cost"
          value={
            result.estimatedInputCostUsd === null
              ? "Unavailable"
              : formatUsd(result.estimatedInputCostUsd)
          }
          detail={`input_tokens / 1,000,000 × $${INPUT_USD_PER_MILLION.toFixed(2)}`}
        />
      </dl>

      <details className="mt-4 rounded-md border border-line bg-paper">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">
          Developer details
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <p className="text-xs leading-5 text-muted">
            Output tokens{" "}
            {result.outputTokens === null ? "not returned" : formatTokens(result.outputTokens)}.
            The API key is not included.
          </p>
          <JsonBlock title="Response" value={result.rawResponse} />
          <details>
            <summary className="cursor-pointer text-sm text-ink">Request</summary>
            <JsonBlock title="Request" value={result.request} />
          </details>
        </div>
      </details>
    </article>
  );
}

function SectionBlock({
  result,
  onOpen,
}: {
  result: DecisionSuccess;
  onOpen: () => void;
}) {
  const section = result.governingSection;
  const reserved =
    section.id === INSUFFICIENT_EVIDENCE || section.id === CONFLICTING_EVIDENCE;
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        Policy section selected
      </h3>
      <p className="mt-2 font-mono text-xs text-ink">{section.id}</p>
      {section.found && section.text ? (
        <>
          <p className="mt-2 text-sm font-medium text-ink">{section.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {section.documentId}
            {section.customerId ? ` · ${section.customerId}` : " · company-wide"}
            {section.effectiveFrom ? ` · effective ${section.effectiveFrom}` : ""}
            {section.status ? ` · ${section.status}` : ""}
          </p>
          <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-accent pl-3 text-sm leading-7 text-ink">
            {section.text}
          </blockquote>
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 text-sm font-medium text-accent hover:underline"
          >
            Open this section
          </button>
        </>
      ) : reserved ? (
        <p className="mt-2 text-sm leading-6 text-ink">
          Selected {section.id}. That choice is not a passage in the file.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink">
          Selected {section.id}. That id was not in the documents sent with this result.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 tabular-nums text-ink">{value}</dd>
      {detail ? <dd className="mt-1 text-xs leading-5 text-muted">{detail}</dd> : null}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-white p-3 font-mono text-xs leading-5 text-ink">
      {title}
      {"\n"}
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
