"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageGrid, type PageGridProps, type PageRange } from "@/components/check/PageGrid";
import { ScanFrame } from "@/components/check/ScanFrame";
import { Button } from "@/components/ui";
import { prefersReducedMotion, type Reveal } from "@/lib/client/reveal";
import { sameText } from "@/lib/client/draft";
import { setError, useStore } from "@/lib/client/store";
import { findNode, leavesOf } from "@/lib/rulebook/tree";
import type { ScreenResult, Thresholds, TreeNode } from "@/lib/types";
import { CheckBar, ItemField, ItemView } from "./ItemCard";
import { PageCard } from "./PageCard";
import { answerFor, clausesOf } from "@/lib/client/result";
import { Result } from "./Result";

/**
 * The right column. One card, which is the field until Check is pressed.
 * Beneath it the book, one tile per page; a page under the pointer opens a
 * card with its clause and section beside it. On Check a frame draws around
 * the card and the same grid scans while Snap reads the whole policy; when
 * the answer arrives every clause the item contradicts lights up at once.
 * Then the frame lets go, and the answer and the clause it rests on take the
 * grid's place under the card.
 */
export function Stage() {
  const rulebook = useStore((state) => state.rulebook);
  const items = useStore((state) => state.items);
  const results = useStore((state) => state.results);
  const draft = useStore((state) => state.draft);
  const reveal = useStore((state) => state.reveal);
  const waiting = useStore((state) => state.pending);
  const error = useStore((state) => state.error);
  const thresholds = useStore((state) => state.thresholds);
  const [editingFor, setEditingFor] = useState<Reveal | null>(null);
  const stage = useRef<HTMLElement>(null);

  // Scanning: waiting on a check, or resting on what it found once it is in.
  const replaying = !waiting && reveal && reveal.phase !== "done" ? reveal : null;
  const scanningId = waiting?.itemId ?? replaying?.itemId ?? null;
  // The result shows while the card still holds the item it belongs to; changing the words lets it go.
  const done = !scanningId && reveal?.phase === "done" ? reveal : null;
  const doneItem = done ? items[done.itemId] : undefined;
  const shown = done && doneItem && draft.sourceId === done.itemId && sameText(draft.text, doneItem.text) ? done : null;
  const result = shown ? results[shown.itemId] : undefined;
  const editing = shown !== null && editingFor === shown;
  // Before a check, and again once the words change after one: the book is there to browse.
  const idle = !scanningId && !shown;
  const card = usePageCard(rulebook?.tree, rulebook?.id, idle);
  const gridMax = useGridBudget();

  const now = useNow(waiting !== null);
  const replayResult = replaying ? results[replaying.itemId] : undefined;
  // The stopwatch runs while Snap is asked, then shows how long Snap itself took to decide; it leaves with the frame.
  const timed = replayResult;
  const ms = waiting ? Math.max(0, now - waiting.startedAt) : (timed?.decisionMs ?? null);
  // Once the answer is in, the frame also says what the check cost.
  const replayCost = useStore((state) => (replaying ? state.costs[replaying.itemId] : undefined));
  const tokens = replayCost ? replayCost.inputTokens + replayCost.outputTokens : null;

  const scanningItem = scanningId ? items[scanningId] : undefined;
  // The whole policy goes in one request.
  const tab = `${(rulebook?.pages ?? 0).toLocaleString("en-US")} pages · 1 request`;
  const cardItem = scanningItem ?? (shown && !editing ? doneItem : undefined);

  // A scan that would run below the fold, as it does on a phone, brings the card to the top once the grid has opened.
  const scanning = scanningId !== null;
  useEffect(() => {
    const el = stage.current;
    if (!el || !scanning) return;
    const timer = window.setTimeout(() => {
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top + SCAN_HEIGHT_PX > window.innerHeight) scrollToStage(el);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [scanning]);

  if (!rulebook) return <section />;

  return (
    <section ref={stage} className="scroll-mt-4 pb-24 sm:-mx-3.5 lg:flex lg:max-h-dvh lg:flex-col lg:overflow-y-auto lg:py-6" aria-label="Check">
      <div className="lg:shrink-0">
        <ScanFrame active={scanningId !== null} tab={tab} ms={ms} tokens={tokens} done={waiting === null}>
          {cardItem ? (
            <ItemView
              item={cardItem}
              phrase={!scanningItem ? result?.evidence?.item?.text : undefined}
              onEdit={!scanningItem ? () => setEditingFor(shown) : undefined}
            />
          ) : (
            <ItemField autoFocus={editing} />
          )}
          <AnimatePresence initial={false}>
            {idle && (
              <motion.div key="bar" exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden px-3.5">
                <CheckBar />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {(idle || scanningId) && (
              <motion.div
                key="grid"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className={idle ? "pt-5" : "pt-3"}>
                  {idle ? (
                    <PageGrid
                      pages={rulebook.pages}
                      phase="idle"
                      highlight={card.highlight}
                      onHoverPage={card.setHovered}
                      onPickPage={card.pickPage}
                      popover={card.popover}
                      maxHeight={gridMax}
                    />
                  ) : (
                    <Scan pages={rulebook.pages} root={rulebook.tree} reveal={replaying} result={replayResult} thresholds={thresholds} maxHeight={gridMax} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </ScanFrame>
      </div>


      <div className="px-3.5 lg:shrink-0">
        {error && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-[13px]" role="alert">
            <span className="text-danger">{error}</span>
            <Button variant="quiet" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </p>
        )}
      </div>
      {shown && result && !editing && (
        <div className="px-3.5 lg:shrink-0">
          <Result key={shown.itemId} itemId={shown.itemId} result={result} />
        </div>
      )}
    </section>
  );
}

/**
 * The page card on the grid: it follows the pointer, and a click pins it to
 * one page so its section can be scrolled. Escape, or a click anywhere off the
 * card and the grid, lets go. Kept per rulebook, so an upload starts clear.
 */
function usePageCard(root: TreeNode | undefined, rulebookId: string | undefined, active: boolean) {
  const leaves = useMemo(() => (root ? leavesOf(root) : []), [root]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pin, setPin] = useState<{ rulebookId: string; page: number } | null>(null);
  const pinned = active && pin && pin.rulebookId === rulebookId ? pin.page : null;

  const pickPage = useCallback((page: number) => setPin((current) => (current?.page === page || !rulebookId ? null : { rulebookId, page })), [rulebookId]);

  useEffect(() => {
    if (pinned === null) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("[data-page-card], canvas")) setPin(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setPin(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [pinned]);

  const page = pinned ?? hovered;
  const leaf = page !== null ? leaves.find((node) => page >= node.pageStart && page <= node.pageEnd) : undefined;

  return {
    highlight: leaf ? { start: leaf.pageStart, end: leaf.pageEnd } : null,
    popover: page !== null ? { page, pinned: pinned !== null, content: <PageCard key={page} page={page} leaf={leaf} pinned={pinned !== null} /> } : null,
    setHovered,
    pickPage,
  };
}

/** Roughly the card plus the page grid: what has to fit on screen for the scan to be seen. */
const SCAN_HEIGHT_PX = 560;

function scrollToStage(el: HTMLElement): void {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/**
 * The page grid for the current moment: scanning while Snap reads, then every
 * clause the item contradicts or a person should decide lit at once.
 */
function Scan({
  pages,
  root,
  reveal,
  result,
  thresholds,
  maxHeight,
}: {
  pages: number;
  root: TreeNode;
  reveal: Reveal | null;
  result: ScreenResult | undefined;
  thresholds: Thresholds;
  maxHeight?: number;
}) {
  const titleFor = useTitleFor(root);
  const props = useMemo((): Omit<PageGridProps, "pages" | "titleFor"> => {
    if (!reveal || !result) return { phase: "scanning", caption: `Reading ${pages.toLocaleString("en-US")} pages` };
    const clauses = clausesOf(result, thresholds);
    const open = clauses.filter((clause) => clause.verdict !== "cleared");
    const leaves = open.map((clause) => findNode(root, clause.leafId)).filter((node): node is TreeNode => node !== undefined);
    const caption =
      clauses.length === 0
        ? "No clause fits"
        : leaves.length === 1
          ? nameOf(leaves[0])
          : leaves.length > 1
            ? `Clauses ${listOf(leaves.map((leaf) => leaf.nodeId))}`
            : answerFor("cleared", clauses).detail;
    return { phase: "found", spots: leaves.map((leaf): PageRange => ({ start: leaf.pageStart, end: leaf.pageEnd })), caption };
  }, [reveal, pages, result, root, thresholds]);

  return <PageGrid pages={pages} titleFor={titleFor} maxHeight={maxHeight} {...props} />;
}

/** "3.3 and 3.4", "3.3, 3.4 and 7.2". */
function listOf(words: string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** "Clause 7.3 · Paid partnerships"; ids that are not numbers are left out. */
function nameOf(node: TreeNode): string {
  return /^\d+(\.\d+)*$/.test(node.nodeId) ? `Clause ${node.nodeId} · ${node.title}` : node.title;
}

/** Hover text for a page tile: the clause it belongs to. */
function useTitleFor(root: TreeNode): (page: number) => string | undefined {
  const leaves = useMemo(() => leavesOf(root), [root]);
  return useCallback(
    (page: number) => {
      const leaf = leaves.find((node) => page >= node.pageStart && page <= node.pageEnd);
      return leaf ? `p. ${page} · ${leaf.nodeId} ${leaf.title}` : `p. ${page}`;
    },
    [leaves],
  );
}

/**
 * How tall the page grid may be so the card and the grid fit one desktop
 * screen. The same budget holds through the scan, so
 * the grid never reflows when Check is pressed. Undefined below the desktop
 * breakpoint, where the page scrolls and the grid keeps its own proportions.
 */
function useGridBudget(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => setHeight(desktop.matches ? Math.round(Math.min(420, Math.max(150, window.innerHeight - GRID_CHROME_PX))) : undefined);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

/** Everything else in the column before a check: padding, the card, the Check line and the caption. */
const GRID_CHROME_PX = 400;

/** Wall-clock time, ticking while `running`, for the stopwatch on the frame. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 100);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [running]);
  return now;
}
