import { formatIsoDate } from "@/lib/dates";
import type { Customer, SectionEditMap, SourceDocument } from "@/lib/types";

type DocumentsPanelProps = {
  documents: SourceDocument[] | null;
  loading: boolean;
  error: string | null;
  customers: Customer[];
  edits: SectionEditMap;
  editableSectionIds: string[];
  query: string;
  selectedDocumentId: string | null;
  highlightedSectionId: string | null;
  onQuery: (query: string) => void;
  onSelect: (documentId: string) => void;
  onEdit: (sectionId: string, text: string | null) => void;
  onRestore: (sectionId: string) => void;
};

export function DocumentsPanel({
  documents,
  loading,
  error,
  customers,
  edits,
  editableSectionIds,
  query,
  selectedDocumentId,
  highlightedSectionId,
  onQuery,
  onSelect,
  onEdit,
  onRestore,
}: DocumentsPanelProps) {
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  const visible = (documents ?? []).filter((document) => matches(document, edits, query));
  const selected =
    visible.find((document) => document.id === selectedDocumentId) ??
    documents?.find((document) => document.id === selectedDocumentId) ??
    null;

  return (
    <section className="flex min-h-[36rem] flex-col rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <h2 className="text-base font-semibold text-ink">Documents</h2>
        <p className="text-sm text-muted">{documents ? `${documents.length} in this file` : "Loading"}</p>
      </div>
      <div className="px-6 pb-4">
        <label className="block">
          <span className="sr-only">Search documents</span>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search this file"
            className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm"
          />
        </label>
      </div>
      {loading ? (
        <p className="px-6 py-8 text-sm text-muted">Loading the file…</p>
      ) : error ? (
        <p className="px-6 py-8 text-sm leading-6 text-red-800">{error}</p>
      ) : (
        <div className="grid min-h-[32rem] flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="max-h-[28rem] overflow-y-auto border-t border-line lg:max-h-[44rem] lg:border-t-0 lg:border-r">
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No documents match that search.</p>
            ) : (
              <ul>
                {visible.map((document) => {
                  const active = document.id === selected?.id;
                  return (
                    <li key={document.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(document.id)}
                        className={`block w-full px-4 py-3.5 text-left ${
                          active ? "bg-[#e7eef5]" : "hover:bg-paper"
                        }`}
                      >
                        <span className="block text-sm font-medium leading-5 text-ink">{document.title}</span>
                        <span className="mt-1 block text-sm capitalize text-muted">{document.status}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-8">
            {selected ? (
              <DocumentView
                document={selected}
                names={names}
                edits={edits}
                editableSectionIds={editableSectionIds}
                highlightedSectionId={highlightedSectionId}
                onEdit={onEdit}
                onRestore={onRestore}
              />
            ) : (
              <p className="text-sm text-muted">Select a document to read it.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentView({
  document,
  names,
  edits,
  editableSectionIds,
  highlightedSectionId,
  onEdit,
  onRestore,
}: {
  document: SourceDocument;
  names: Map<string, string>;
  edits: SectionEditMap;
  editableSectionIds: string[];
  highlightedSectionId: string | null;
  onEdit: (sectionId: string, text: string | null) => void;
  onRestore: (sectionId: string) => void;
}) {
  return (
    <article>
      <header>
        <h3 className="text-2xl font-semibold tracking-tight text-ink">{document.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted">
          {document.kind} · {ownerLabel(document.customerId, names)} · {document.status} ·{" "}
          {formatIsoDate(document.effectiveFrom)}
          {document.effectiveTo ? ` – ${formatIsoDate(document.effectiveTo)}` : ""}
        </p>
      </header>
      <div className="mt-8 space-y-8">
        {document.sections.map((section) => {
          const editable = editableSectionIds.includes(section.id);
          const editedValue = edits[section.id];
          const edited = Object.prototype.hasOwnProperty.call(edits, section.id);
          const removed = edited && editedValue === null;
          const text = typeof editedValue === "string" ? editedValue : section.text;
          const highlighted = section.id === highlightedSectionId;
          return (
            <section
              key={section.id}
              id={`section-${section.id}`}
              className={`scroll-mt-6 ${
                highlighted ? "rounded-2xl bg-[#f3f7fb] px-5 py-5" : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-base font-semibold text-ink">{section.title}</h4>
                <p className="font-mono text-xs text-muted">{section.id}</p>
              </div>
              {highlighted ? (
                <p className="mt-2 text-xs font-medium text-accent">Selected policy section</p>
              ) : null}
              {editable ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-accent">Editable refund clause</p>
                  {removed ? (
                    <p className="mt-2 text-sm leading-6 text-ink">
                      This section was removed from the bundle. The next decision request will not
                      include it.
                    </p>
                  ) : (
                    <textarea
                      value={text}
                      onChange={(event) => onEdit(section.id, event.target.value)}
                      rows={8}
                      className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
                      aria-label={`Edit ${section.title}`}
                    />
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {removed ? null : (
                      <button
                        type="button"
                        onClick={() => onEdit(section.id, null)}
                        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent"
                      >
                        Remove exception
                      </button>
                    )}
                    {edited ? (
                      <button
                        type="button"
                        onClick={() => onRestore(section.id)}
                        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent"
                      >
                        Restore original
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-3 max-w-3xl whitespace-pre-wrap text-base leading-8 text-ink">{section.text}</p>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}

function ownerLabel(customerId: string | null, names: Map<string, string>) {
  if (!customerId) return "Company-wide";
  const name = names.get(customerId);
  return name ? `${name} · ${customerId}` : customerId;
}

function matches(document: SourceDocument, edits: SectionEditMap, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    document.id,
    document.title,
    document.kind,
    document.customerId ?? "company-wide",
    document.status,
    document.version,
    ...document.sections.flatMap((section) => {
      const edited = edits[section.id];
      return [section.id, section.title, typeof edited === "string" ? edited : section.text];
    }),
  ];
  return parts.some((part) => part.toLowerCase().includes(needle));
}
