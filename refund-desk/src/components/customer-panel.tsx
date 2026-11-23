import { elapsedPurchaseDays, formatIsoDate } from "@/lib/dates";
import type {
  BundleSize,
  Catalog,
  Customer,
  ExceptionPlacement,
  Scenario,
} from "@/lib/types";

type QueuePanelProps = {
  scenario: Scenario;
  customer: Customer;
  scenarios: Catalog["scenarios"];
  customers: Customer[];
  bundle: BundleSize;
  placement: ExceptionPlacement;
  draftFingerprint: string | null;
  running: boolean;
  onScenario: (scenarioId: string) => void;
  onBundle: (bundle: BundleSize) => void;
  onPlacement: (placement: ExceptionPlacement) => void;
  onRun: () => void;
};

export function QueuePanel({
  scenario,
  customer,
  scenarios,
  customers,
  bundle,
  placement,
  draftFingerprint,
  running,
  onScenario,
  onBundle,
  onPlacement,
  onRun,
}: QueuePanelProps) {
  const groups = customerGroups(scenarios, customers);
  const elapsed = elapsedPurchaseDays(scenario.purchaseDate);
  const canMove = scenario.movableDocumentId !== null;

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line px-4 py-4">
        <h2 className="text-base font-semibold text-ink">Queue</h2>
        <p className="mt-1 text-sm text-muted">{groups.length} customers</p>
      </div>
      <ul className="max-h-[28rem] space-y-1 overflow-y-auto p-2">
        {groups.map((group) => {
          const open = group.customer.id === scenario.customerId;
          const only = group.files.length === 1 ? group.files[0] : null;
          const days = only ? elapsedPurchaseDays(only.purchaseDate) : null;
          return (
            <li key={group.customer.id}>
              <button
                type="button"
                onClick={() => {
                  if (open) return;
                  onScenario(group.files[0].id);
                }}
                className={`w-full rounded-xl px-3 py-3 text-left ${
                  open ? "bg-[#e7eef5]" : "hover:bg-paper"
                }`}
                aria-current={open ? "true" : undefined}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{group.customer.name}</span>
                  <span className="shrink-0 text-xs font-medium text-accent">
                    {only ? only.category : `${group.files.length} files`}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-muted">{group.customer.organization}</span>
                {only ? (
                  <span className="mt-0.5 block text-sm leading-5 text-muted">
                    {days === null ? "Purchase date missing" : `${days} days since purchase`}
                  </span>
                ) : null}
              </button>
              {open && group.files.length > 1 ? (
                <ul className="mt-1 space-y-1 pl-3">
                  {group.files.map((file) => {
                    const fileDays = elapsedPurchaseDays(file.purchaseDate);
                    const active = file.id === scenario.id;
                    return (
                      <li key={file.id}>
                        <button
                          type="button"
                          onClick={() => onScenario(file.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                            active ? "bg-white font-medium text-ink" : "text-muted hover:bg-paper"
                          }`}
                          aria-current={active ? "true" : undefined}
                        >
                          {file.category}
                          {" · "}
                          {fileDays === null ? "date missing" : `${fileDays} days`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="space-y-3 border-t border-line px-4 py-4">
        <div>
          <p className="text-xs font-medium text-accent">{scenario.category}</p>
          <p className="mt-1 text-base font-semibold text-ink">{customer.name}</p>
          <p className="mt-0.5 text-sm text-muted">{customer.organization}</p>
        </div>
        <p className="text-sm leading-6 text-muted">
          {scenario.purchaseDate ? formatIsoDate(scenario.purchaseDate) : "Purchase date missing"}
          {" · "}
          {elapsed === null ? "elapsed unknown" : `${elapsed} days`}
          {scenario.amountUsd === null ? "" : ` · $${scenario.amountUsd.toLocaleString("en-US")}`}
        </p>
        <details>
          <summary className="cursor-pointer text-sm text-muted">File options</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Choice checked={bundle === "compact"} onChange={() => onBundle("compact")} label="Case file" />
              <Choice checked={bundle === "large"} onChange={() => onBundle("large")} label="Full archive" />
            </div>
            <div className={`grid grid-cols-3 gap-2 ${canMove ? "" : "opacity-40"}`}>
              {(["beginning", "middle", "end"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canMove}
                  onClick={() => onPlacement(value)}
                  className={`rounded-lg border px-2 py-2 text-sm capitalize ${
                    placement === value && canMove
                      ? "border-accent bg-[#e7eef5] text-accent"
                      : "border-line text-ink"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </details>
        <button
          type="button"
          onClick={onRun}
          disabled={running || !draftFingerprint}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#173e61] disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {running ? "Reviewing…" : "Run decision"}
        </button>
      </div>
    </section>
  );
}

function customerGroups(scenarios: Scenario[], customers: Customer[]) {
  const byCustomer = new Map<string, Scenario[]>();
  for (const item of scenarios) {
    const list = byCustomer.get(item.customerId) ?? [];
    list.push(item);
    byCustomer.set(item.customerId, list);
  }
  return customers
    .filter((customer) => byCustomer.has(customer.id))
    .map((customer) => ({ customer, files: byCustomer.get(customer.id) ?? [] }))
    .sort((left, right) => {
      const byCount = left.files.length - right.files.length;
      if (byCount !== 0) return byCount;
      return left.customer.name.localeCompare(right.customer.name);
    });
}

function Choice({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-lg border px-2 py-2 text-sm ${
        checked ? "border-accent bg-[#e7eef5] text-accent" : "border-line text-ink"
      }`}
    >
      {label}
    </button>
  );
}
