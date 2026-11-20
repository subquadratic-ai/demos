"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Highlighted } from "@/components/check/Highlighted";
import { Button } from "@/components/ui";
import { checkDraft, setDraftText } from "@/lib/client/draft";
import { useStore } from "@/lib/client/store";
import type { Item } from "@/lib/types";

/** The field grows with its text up to this height, then scrolls. */
const FIELD_MAX_PX = 320;

const CARD = "rounded-md border border-line bg-surface";
const BODY = "px-4 pt-2 pb-4 text-[20px] leading-snug text-text-2";

/** The question the card asks of whatever is in it, e.g. "Is this claim within our policy?". */
function CardHeader({ children }: { children?: React.ReactNode }) {
  const question = useStore((state) => state.useCase.question);
  return (
    <div className="flex min-h-9 items-center gap-2 px-4 pt-4">
      <span className="font-display text-[26px] leading-tight text-text">{question}</span>
      <span className="ml-auto shrink-0">{children}</span>
    </div>
  );
}

/** The item being checked, or the one that was: read-only, with Snap's pick from it marked once the result is in. */
export function ItemView({ item, phrase, onEdit }: { item: Item; phrase?: string; onEdit?: () => void }) {
  return (
    <article className={CARD} aria-label="Item">
      <CardHeader>
        {onEdit && (
          <Button variant="quiet" className="text-[12.5px]" onClick={onEdit}>
            Edit
          </Button>
        )}
      </CardHeader>
      <p className={`${BODY} whitespace-pre-line`}>
        <Highlighted text={item.text} phrase={phrase} delay={0.15} />
      </p>
    </article>
  );
}

/** The item card as the field: the one place a check starts. Check (or ⌘/Ctrl+Enter) sends whatever is in it. */
export function ItemField({ autoFocus = false }: { autoFocus?: boolean }) {
  const text = useStore((state) => state.draft.text);
  const placeholder = useStore((state) => state.useCase.placeholder);
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, FIELD_MAX_PX)}px`;
  }, [text]);

  // "Edit" on a result opens the field with the caret at the end.
  useEffect(() => {
    const el = field.current;
    if (!el || !autoFocus) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  return (
    <div className={`${CARD} transition-colors focus-within:border-line-strong`}>
      <CardHeader />
      <label htmlFor="item-text" className="sr-only">
        Item to check
      </label>
      <textarea
        id="item-text"
        ref={field}
        value={text}
        onChange={(event) => setDraftText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        spellCheck={false}
        className={`${BODY} block w-full resize-none bg-transparent placeholder:text-text-4 focus:outline-none`}
      />
    </div>
  );
}

/** The Check button under the field. */
export function CheckBar() {
  const empty = useStore((state) => !state.draft.text.trim());
  const busy = useStore((state) => state.pending !== null);

  return (
    <div className="mt-3 flex justify-end">
      <Button onClick={submit} disabled={empty || busy}>
        Check
      </Button>
    </div>
  );
}

function submit(): void {
  const { draft, pending } = useStore.getState();
  if (draft.text.trim() && !pending) void checkDraft();
}
