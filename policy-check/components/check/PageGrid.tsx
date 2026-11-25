"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatPages } from "@/lib/client/format";

export interface PageRange {
  /** 1-based, inclusive. */
  start: number;
  end: number;
}

export interface PageGridProps {
  /** One tile per page of the rulebook. */
  pages: number;
  /**
   * "idle": the book at rest, before a check; tiles can be hovered and picked.
   * "scanning": waiting on Snap; tiles fill in and a sweep loops until the answer arrives.
   * "found": every range in `spots` is picked out at once, the first two labelled; everything else falls away.
   */
  phase: "idle" | "scanning" | "found";
  /** One line under the grid for the current step, e.g. "Reading 380 pages" or "Clauses 3.3 and 3.4". */
  caption?: string;
  /** Hover text for a tile, e.g. "p. 197 · 7.3 Paid partnerships". */
  titleFor?: (page: number) => string | undefined;
  /** Found only: several ranges at once, e.g. every clause the item contradicts, most likely first. Empty lets the whole book settle. */
  spots?: PageRange[];
  /** Upper bound on the grid's height in px; tiles shrink to fit. Defaults to a share of the width. */
  maxHeight?: number;
  /** Idle only: pages lit up, e.g. the clause under the pointer in the book's outline. */
  highlight?: PageRange | null;
  /** Idle only: the page under the pointer, or null when it leaves the grid. */
  onHoverPage?: (page: number | null) => void;
  /** Idle only: a tile was clicked. */
  onPickPage?: (page: number) => void;
  /** Idle only: a card floated beside one page's tile. Pinned, it takes the pointer so it can be scrolled. */
  popover?: { page: number; content: ReactNode; pinned: boolean } | null;
}

/** The floating page card: a page thumbnail with a line of caption above it. */
const CARD_W = 270;
const CARD_H = 330;

/* Tile geometry. Pages are a little taller than wide; gaps scale with the tile. */
const ASPECT = 1.16;
const MAX_TILE = 23;
const MIN_TILE = 6;
const gapFor = (w: number) => Math.max(1.5, Math.round(w * 0.24 * 2) / 2);

interface Geometry {
  cols: number;
  rows: number;
  w: number;
  h: number;
  gap: number;
  height: number;
}

/**
 * Largest tile that keeps the block within a height budget for this width, so
 * 380 pages at ~720px come out near 28 columns and 2000 pages shrink toward
 * 6px tiles. With more than one row the columns stretch to fill the width.
 */
function layoutFor(width: number, pages: number, maxHeight?: number): Geometry {
  const n = Math.max(1, pages);
  if (width <= 0) return { cols: 1, rows: n, w: 0, h: 0, gap: 0, height: 0 };
  const budget = maxHeight ?? Math.min(420, Math.max(220, width * 0.6));
  let w = MAX_TILE;
  let gap = gapFor(w);
  let cols = 1;
  let rows = n;
  for (;;) {
    gap = gapFor(w);
    cols = Math.max(1, Math.floor((width + gap) / (w + gap)));
    rows = Math.ceil(n / cols);
    if (rows * (w * ASPECT + gap) - gap <= budget || w <= MIN_TILE) break;
    w = Math.max(MIN_TILE, w - 0.5);
  }
  if (rows > 1) w = (width + gap) / cols - gap;
  const h = Math.round(w * ASPECT * 2) / 2;
  return { cols, rows, w, h, gap, height: Math.ceil(rows * (h + gap) - gap) };
}

type Rgb = [number, number, number];

interface Palette {
  surface: Rgb;
  edge: Rgb;
  idleLine: Rgb;
  tint: Rgb;
  tintEdge: Rgb;
  accent: Rgb;
  white: Rgb;
}

function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: string) => hexToRgb(css.getPropertyValue(name).trim() || fallback);
  return {
    surface: get("--surface", "#ffffff"),
    edge: get("--tile-edge", "#cdd0da"),
    idleLine: get("--tile", "#e4e6ec"),
    tint: get("--accent-tint", "#d2d7e6"),
    tintEdge: get("--line-strong", "#cfd3e0"),
    accent: get("--accent", "#2f4495"),
    white: [255, 255, 255],
  };
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6);
  const v = parseInt(full, 16);
  return Number.isNaN(v) ? [128, 128, 128] : [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const rgb = (c: Rgb) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/* Motion constants (ms). */
const WAVE = 520; // first appearance, top-left to bottom-right
const SWEEP = 1900; // one pass of the scan band
const SETTLE = 95; // smoothing time constant: ~300ms to settle

/** Per-tile targets for a phase: [opacity, tint, solid]. */
function targetFor(page: number, phase: PageGridProps["phase"], highlight: PageRange | undefined, spots: PageRange[]): [number, number, number] {
  if (phase === "idle") return highlight && page >= highlight.start && page <= highlight.end ? [1, 1, 0.35] : [1, 0, 0];
  if (phase === "found") {
    if (spots.length === 0) return [1, 0, 0];
    return spots.some((r) => page >= r.start && page <= r.end) ? [1, 0, 1] : [0.1, 0, 0];
  }
  return [1, 0, 0];
}

function parseRanges(key: string): PageRange[] {
  if (!key) return [];
  return key.split(",").map((part) => {
    const [start, end] = part.split("-").map(Number);
    return { start, end };
  });
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * One small page icon per page of the rulebook, drawn on a canvas so 2000
 * pages animate as smoothly as 20. Tiles fill in, a pale sweep loops while
 * Snap works, focus narrows to a range, and the clause's pages land in solid
 * navy with a page label beside them; after a whole-document read, every
 * clause it found lands at once. Decorative to screen readers; the
 * caption underneath is a polite live region.
 */
export function PageGrid({ pages, phase, spots = [], caption, titleFor, maxHeight, highlight, onHoverPage, onPickPage, popover }: PageGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const reduced = usePrefersReducedMotion();
  const geo = useMemo(() => layoutFor(width, pages, maxHeight), [width, pages, maxHeight]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animation state lives outside React: one Float32Array per channel.
  const anim = useRef({
    opacity: new Float32Array(0),
    tint: new Float32Array(0),
    solid: new Float32Array(0),
    target: new Float32Array(0), // interleaved [opacity, tint, solid]
    born: new Float64Array(0),
    sweepFrom: 0,
    phase,
    reduced,
    raf: 0,
    last: 0,
  });
  const drawRef = useRef<(now: number) => boolean>(() => false);

  const kick = useCallback(() => {
    const a = anim.current;
    if (a.raf) return;
    a.last = performance.now();
    const tick = (now: number) => {
      const busy = drawRef.current(now);
      a.raf = busy ? requestAnimationFrame(tick) : 0;
    };
    a.raf = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const a = anim.current;
    return () => {
      cancelAnimationFrame(a.raf);
      a.raf = 0;
    };
  }, []);

  // New page count: reset tiles and play the fill-in wave (unless we arrive past scanning).
  useLayoutEffect(() => {
    const a = anim.current;
    const n = Math.max(1, pages);
    const now = performance.now();
    a.opacity = new Float32Array(n);
    a.tint = new Float32Array(n);
    a.solid = new Float32Array(n);
    a.target = new Float32Array(n * 3);
    a.born = new Float64Array(n).fill(now);
    a.sweepFrom = now + WAVE * 0.7;
    if (a.phase !== "scanning") a.opacity.fill(1);
    // `born` is filled in once geometry is known (the wave depends on rows and columns).
  }, [pages]);

  // Wave order depends on the layout; only stagger tiles that have not appeared yet.
  useLayoutEffect(() => {
    const a = anim.current;
    if (!geo.w || a.phase !== "scanning") return;
    const start = a.sweepFrom - WAVE * 0.7;
    for (let i = 0; i < a.born.length; i++) {
      if (a.opacity[i] > 0) continue;
      const c = i % geo.cols;
      const r = Math.floor(i / geo.cols);
      const t = 0.65 * (c / Math.max(1, geo.cols - 1)) + 0.35 * (r / Math.max(1, geo.rows - 1));
      a.born[i] = start + t * WAVE;
    }
  }, [geo, pages]);

  // Phase or focus change: retarget every tile. Keyed on the ranges' values, not
  // the array's identity, so a parent re-rendering every tick doesn't restart anything.
  const highlightKey = highlight ? `${highlight.start}-${highlight.end}` : "";
  const spotsKey = spots.map((r) => `${r.start}-${r.end}`).join(",");
  useLayoutEffect(() => {
    const a = anim.current;
    const lit = parseRanges(highlightKey)[0];
    const found = parseRanges(spotsKey);
    if (phase === "scanning" && a.phase !== "scanning") a.sweepFrom = performance.now();
    a.phase = phase;
    a.reduced = reduced;
    for (let i = 0; i < a.born.length; i++) {
      const [o, t, s] = targetFor(i + 1, phase, lit, found);
      a.target[i * 3] = o;
      a.target[i * 3 + 1] = t;
      a.target[i * 3 + 2] = s;
    }
    kick();
  }, [phase, highlightKey, spotsKey, reduced, pages, kick]);

  // The frame painter. Returns true while anything is still moving.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geo.w) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(geo.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pal = readPalette(canvas);
    const { cols, w, h, gap } = geo;
    const lines = w >= 13 ? 3 : w >= 9 ? 2 : 0;
    const radius = Math.min(3, Math.max(1, w * 0.12));
    const stroke = w >= 9 ? 1 : 0.75;
    const lineH = Math.max(1, Math.round(w / 15));
    const snap = (v: number) => Math.round(v * dpr) / dpr;

    drawRef.current = (now: number) => {
      const a = anim.current;
      // rAF timestamps can trail performance.now(); never step backwards.
      const dt = Math.min(64, Math.max(0, now - a.last));
      a.last = Math.max(a.last, now);
      const k = a.reduced ? 1 : 1 - Math.exp(-dt / SETTLE);
      const sweeping = a.phase === "scanning" && !a.reduced;
      const sweepT = sweeping ? (now - a.sweepFrom) / SWEEP : -1;
      const head = sweepT >= 0 ? (sweepT % 1) * 1.5 - 0.15 : -9;
      let moving = sweeping;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, geo.height);
      ctx.lineWidth = stroke;

      for (let i = 0; i < a.born.length; i++) {
        const born = a.reduced || now >= a.born[i];
        if (!born) moving = true;
        const to = born ? a.target[i * 3] : 0;
        const o = (a.opacity[i] += (to - a.opacity[i]) * k);
        const tn = (a.tint[i] += (a.target[i * 3 + 1] - a.tint[i]) * k);
        const sd = (a.solid[i] += (a.target[i * 3 + 2] - a.solid[i]) * k);
        if (!moving && (Math.abs(to - o) > 0.003 || Math.abs(a.target[i * 3 + 1] - tn) > 0.003 || Math.abs(a.target[i * 3 + 2] - sd) > 0.003)) {
          moving = true;
        }
        if (o < 0.01) continue;

        const c = i % cols;
        const r = (i / cols) | 0;
        let tint = tn;
        if (a.phase === "scanning") {
          if (a.reduced) tint = 0.55;
          else if (head > -9) {
            // A soft band with a sharp leading edge and a long tail.
            const pos = (c / cols) * 0.8 + (r / Math.max(1, geo.rows)) * 0.2;
            const d = head - pos;
            tint = Math.max(tint, d >= 0 ? Math.exp(-d / 0.16) : Math.exp(d / 0.025));
          }
        }

        const x = snap(c * (w + gap)) + stroke / 2;
        const y = snap(r * (h + gap)) + stroke / 2;
        const tw = w - stroke;
        const th = h - stroke;
        const fill = mix(mix(pal.surface, pal.tint, tint), pal.accent, sd);
        const edge = mix(mix(pal.edge, pal.tintEdge, tint), pal.accent, sd);
        const line = mix(mix(pal.edge, pal.tint, tint), pal.white, sd);

        ctx.globalAlpha = o;
        ctx.beginPath();
        ctx.roundRect(x, y, tw, th, radius);
        ctx.fillStyle = rgb(fill);
        ctx.fill();
        ctx.strokeStyle = rgb(edge);
        ctx.stroke();

        if (lines) {
          ctx.fillStyle = rgb(line);
          const lx = snap(x + w * 0.24);
          const lw = w * 0.52;
          const step = h * (lines === 3 ? 0.17 : 0.2);
          const top = y + h * (lines === 3 ? 0.27 : 0.33);
          for (let l = 0; l < lines; l++) {
            const ww = l === lines - 1 ? lw * 0.62 : lw;
            ctx.fillRect(lx, snap(top + l * step), snap(ww), lineH);
          }
        }
      }
      ctx.globalAlpha = 1;
      return moving;
    };
    // Paint immediately at the new size, then let the loop continue if needed.
    anim.current.last = performance.now();
    if (drawRef.current(anim.current.last)) kick();
  }, [geo, width, kick]);

  /** The page under the pointer; gaps between tiles count as the tile before them, so moving across the grid never flickers. */
  const pageAt = (e: MouseEvent<HTMLCanvasElement>): number | null => {
    if (!geo.w) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / (geo.w + geo.gap));
    const r = Math.floor((e.clientY - rect.top) / (geo.h + geo.gap));
    const page = r * geo.cols + c + 1;
    return c >= 0 && c < geo.cols && r >= 0 && page <= pages ? page : null;
  };
  const interactive = phase === "idle" && (onHoverPage !== undefined || onPickPage !== undefined);
  const hovered = useRef<number | null>(null);
  const hover = (page: number | null) => {
    if (hovered.current === page) return;
    hovered.current = page;
    onHoverPage?.(page);
  };
  // A check starting under the pointer lets go of the hover.
  useEffect(() => {
    if (!interactive && hovered.current !== null) {
      hovered.current = null;
      onHoverPage?.(null);
    }
  }, [interactive, onHoverPage]);

  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const page = pageAt(e);
    if (interactive) {
      hover(page);
      e.currentTarget.style.cursor = page !== null && onPickPage ? "pointer" : "default";
    }
    if (!titleFor) return;
    const title = page !== null ? titleFor(page) : undefined;
    if (title) e.currentTarget.title = title;
    else e.currentTarget.removeAttribute("title");
  };

  const card = popover && phase === "idle" && geo.w ? cardPosition(popover.page, geo, width) : null;
  const labels = geo.w && phase === "found" ? labelsFor(touching(spots).slice(0, 2), spots, geo, width, pages) : [];

  return (
    <div>
      <div ref={wrapRef} className="relative w-full" style={{ height: geo.height }}>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="block"
          style={{ width, height: geo.height }}
          onMouseMove={onMove}
          onMouseLeave={() => interactive && hover(null)}
          onClick={(e) => {
            const page = interactive ? pageAt(e) : null;
            if (page !== null) onPickPage?.(page);
          }}
        />
        <AnimatePresence>
          {popover && card && (
            <motion.div
              key="page-card"
              data-page-card
              role={popover.pinned ? "dialog" : "tooltip"}
              aria-label={`Page ${popover.page}`}
              className={`absolute z-20 overflow-hidden rounded-md border border-line bg-surface shadow-[0_2px_6px_rgba(24,24,27,0.05),0_18px_40px_-16px_rgba(24,24,27,0.28)] ${
                popover.pinned ? "pointer-events-auto ring-1 ring-accent/25" : "pointer-events-none"
              }`}
              style={{ left: card.left, top: card.top, width: card.width, height: card.height, transition: "left 140ms ease-out, top 140ms ease-out" }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              {popover.content}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {labels.map(({ range, position }, index) => (
            <motion.span
              key={`${range.start}-${range.end}`}
              aria-hidden
              className="pointer-events-none absolute flex items-center rounded-[4px] bg-accent px-2 text-[12px] leading-none font-semibold whitespace-nowrap text-white shadow-[0_2px_8px_-2px_rgba(47,68,149,0.35)]"
              style={{ ...position.style, height: position.height, marginTop: -position.height / 2 }}
              initial={{ opacity: 0, x: position.side === "right" ? -4 : 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : 0.22 + index * 0.12 }}
            >
              {formatPages(range.start, range.end)}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div aria-live="polite" className="mt-2.5 min-h-[19px] text-[12.5px] leading-[19px] text-text-3">
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Beside the page's tile: to its right when the card fits there, otherwise to its left, kept inside the grid's width. */
function cardPosition(page: number, geo: Geometry, width: number) {
  const index = Math.max(0, page - 1);
  const x = (index % geo.cols) * (geo.w + geo.gap);
  const y = Math.floor(index / geo.cols) * (geo.h + geo.gap);
  const cardWidth = Math.min(CARD_W, Math.max(220, width - 24));
  const gap = 12;
  let left = x + geo.w + gap;
  if (left + cardWidth > width) left = x - gap - cardWidth;
  left = Math.max(0, Math.min(left, width - cardWidth));
  // Level with the tile, a little above it, and inside the grid plus its caption line: the grid's container clips anything past that.
  const room = geo.height + 30;
  const height = Math.min(CARD_H, room);
  const top = Math.max(0, Math.min(y - 56, room - height));
  return { left, top, width: cardWidth, height };
}

/** Ranges that touch or overlap merged into one, so a run of neighbouring clauses gets one label; in order of each run's first range. */
function touching(ranges: PageRange[]): PageRange[] {
  const runs: PageRange[] = [];
  for (const range of ranges) {
    const joined = [range, ...runs.filter((run) => run.start <= range.end + 1 && range.start <= run.end + 1)];
    const merged = { start: Math.min(...joined.map((r) => r.start)), end: Math.max(...joined.map((r) => r.end)) };
    const first = runs.findIndex((run) => joined.includes(run));
    const rest = runs.filter((run) => !joined.includes(run));
    rest.splice(first < 0 ? rest.length : Math.min(first, rest.length), 0, merged);
    runs.splice(0, runs.length, ...rest);
  }
  return runs;
}

/** A label per range, kept off the other lit pages and dropping any that would sit on top of one before it. */
function labelsFor(ranges: PageRange[], lit: PageRange[], geo: Geometry, width: number, pages: number) {
  const placed: { range: PageRange; position: ReturnType<typeof labelPosition> }[] = [];
  const covered = (page: number) => lit.some((r) => page >= r.start && page <= r.end);
  for (const range of ranges) {
    const position = labelPosition(range, geo, width, pages, covered);
    const clash = placed.some(({ position: other }) => Math.abs(other.style.top - position.style.top) < position.height);
    if (!clash) placed.push({ range, position });
  }
  return placed;
}

/** Where the page label sits: right of the range's last tile, or left of its first if that overflows or would cover other lit pages. */
function labelPosition(range: PageRange, geo: Geometry, width: number, pages: number, covered: (page: number) => boolean = () => false) {
  const pitchX = geo.w + geo.gap;
  const pitchY = geo.h + geo.gap;
  const start = Math.min(Math.max(1, range.start), pages) - 1;
  const end = Math.min(Math.max(range.start, range.end), pages) - 1;
  const text = formatPages(range.start, range.end);
  const estimate = 16 + text.length * 6.6;
  const height = Math.max(20, Math.min(24, geo.h + 2));
  const gap = Math.max(8, geo.gap * 2);

  // Would a label spanning these x positions on this row sit over a lit page that is not the range's own?
  const blocked = (row: number, from: number, to: number) => {
    for (let col = Math.max(0, Math.floor(from / pitchX)); col <= Math.min(geo.cols - 1, Math.floor(to / pitchX)); col++) {
      const page = row * geo.cols + col + 1;
      if ((page < range.start || page > range.end) && covered(page)) return true;
    }
    return false;
  };
  const endRight = (end % geo.cols) * pitchX + geo.w;
  const endRow = Math.floor(end / geo.cols);
  if (endRight + gap + estimate <= width && !blocked(endRow, endRight, endRight + gap + estimate)) {
    return { side: "right" as const, height, style: { left: endRight + gap, top: endRow * pitchY + geo.h / 2 } };
  }
  const startLeft = (start % geo.cols) * pitchX;
  const startRow = Math.floor(start / geo.cols);
  if (startLeft - gap - estimate >= 0 && !blocked(startRow, startLeft - gap - estimate, startLeft)) {
    return { side: "left" as const, height, style: { right: width - startLeft + gap, top: startRow * pitchY + geo.h / 2 } };
  }
  // Neither side fits: sit just below the range's last row.
  return { side: "right" as const, height, style: { left: Math.max(0, Math.min(endRight - estimate, width - estimate)), top: (endRow + 1) * pitchY + height / 2 } };
}
