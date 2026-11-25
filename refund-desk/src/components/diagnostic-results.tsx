import { elapsedPurchaseDays } from "@/lib/dates";
import { actionLabel, formatDuration, formatPercent, formatTokens } from "@/lib/format";
import { ACTION_ORDER, type Catalog, type DecisionSuccess } from "@/lib/types";
import { explainDecision } from "@/lib/why";

export type DiagnosticSlot = {
  scenarioId: string;
  status: "running" | "done" | "error";
  result: DecisionSuccess | null;
  error: string | null;
};

type DiagnosticResultsProps = {
  catalog: Catalog;
  slots: DiagnosticSlot[];
  running: boolean;
  onClose: () => void;
};

export function DiagnosticResults({ catalog, slots, running, onClose }: DiagnosticResultsProps) {
  const names = new Map(catalog.customers.map((customer) => [customer.id, customer.name]));
  const organizations = new Map(catalog.customers.map((customer) => [customer.id, customer.organization]));

  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Diagnostic</h2>
          <p className="mt-1 text-sm text-muted">
            {running ? "Running each file on its own." : `${slots.length} separate results`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-medium text-accent">
          Hide
        </button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => {
          const scenario = catalog.scenarios.find((item) => item.id === slot.scenarioId);
          const name = scenario ? (names.get(scenario.customerId) ?? scenario.customerId) : slot.scenarioId;
          const organization = scenario ? organizations.get(scenario.customerId) : null;
          const why = slot.result
            ? explainDecision({
                action: slot.result.action,
                customerName: name,
                elapsedDays: scenario ? elapsedPurchaseDays(scenario.purchaseDate) : null,
                sectionId: slot.result.governingSection.id,
                sectionTitle: slot.result.governingSection.title,
                sectionText: slot.result.governingSection.text,
              })
            : null;
          return (
            <article key={slot.scenarioId} className="rounded-xl border border-line bg-paper px-4 py-4">
              <p className="text-xs font-medium text-accent">{scenario?.category}</p>
              <h3 className="mt-1 text-base font-semibold text-ink">{name}</h3>
              <p className="mt-0.5 text-sm text-muted">{organization}</p>
              <p className="mt-1 text-sm leading-5 text-muted">{scenario?.label}</p>
              {slot.status === "error" ? (
                <p className="mt-4 text-sm leading-6 text-red-900">{slot.error}</p>
              ) : (
                <>
                  <p className="mt-4 text-xl font-semibold tracking-tight text-ink">
                    {slot.result ? actionLabel(slot.result.action) : "Reviewing…"}
                  </p>
                  {why ? (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-ink">Why</p>
                      <p className="mt-1 text-sm leading-6 text-ink">{why}</p>
                      {slot.result?.governingSection.text ? (
                        <blockquote className="mt-2 border-l-2 border-accent pl-3 text-sm leading-6 text-muted">
                          {slot.result.governingSection.text}
                        </blockquote>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {ACTION_ORDER.map((action) => {
                      const value = slot.result?.actionProbabilities[action];
                      const present = typeof value === "number";
                      const width = present ? `${Math.max(0, Math.min(1, value)) * 100}%` : "0%";
                      const selected = slot.result?.action === action;
                      return (
                        <div key={action}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className={selected ? "font-semibold text-ink" : "text-ink"}>
                              {actionLabel(action)}
                            </span>
                            <span className="tabular-nums text-muted">
                              {present ? formatPercent(value) : "—"}
                            </span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-white">
                            <div
                              className={`h-2 rounded-full ${selected ? "bg-accent" : "bg-[#b7c9d8]"}`}
                              style={{ width }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {slot.result ? (
                    <p className="mt-4 text-sm leading-6 text-muted">
                      {slot.result.governingSection.id}
                      {" · "}
                      {formatDuration(slot.result.providerRoundTripMs)}
                      {slot.result.inputTokens === null
                        ? ""
                        : ` · ${formatTokens(slot.result.inputTokens)} tokens`}
                    </p>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
