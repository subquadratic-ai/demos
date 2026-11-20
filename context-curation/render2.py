"""Clip (~3.9 s): how the decision model curates context, in two API requests. No race, no end card.

  /mnt/data/ashmal/conductor/.venv/bin/python render2.py      -> demo_v2.mp4 + poster_v2.png

All numbers from the real decision-model call (curation.json, extract_curation.py):
  API request 1 (~2 s on screen) — the whole repository (56 files, ~226k tokens) in one pass; every file is scored
    "where does this change belong?" and marked kept (p >= 0.3, green) or dropped (red).
  API request 2 (~1 s, real time) — the 4 kept files appear first, then line ranges are picked inside them.
  -> a small context packet for the agent.
Decision-model time shown = SubQ's QA endpoint (subq-snap-preview): request 1 = 5.0 s measured on a ~250k-token call;
request 2 = 1.0 s (the kept-files call is tiny). The trial itself ran on a slow self-hosted engine (163.4 s + 89.5 s;
see curation.json pass_s).
"""
import json
import os
import shutil
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Polygon, Rectangle  # noqa: E402

import render as R  # noqa: E402  (fonts, palette, helpers and the race panels from v1)

HERE = R.HERE
W, H, FPS = R.W, R.H, R.FPS
N_FRAMES = 132                       # ~4.4 s
BG, PANEL, INK, MUTED, FAINT, LINE = R.BG, R.PANEL, R.INK, R.MUTED, R.FAINT, R.LINE
GREEN, RED, BLUE = "#3ccf7e", "#ef5a50", R.RIGHT_C
CUR = json.load(open(f"{HERE}/curation.json"))
text, rbox, ease = R.text, R.rbox, R.ease

FILES = sorted(CUR["files"], key=lambda f: f["path"])          # file-tree order
KEPT = CUR["kept"]
KEPT_ORDER = ["src/maybe.ts", "src/task.ts", "src/result.ts", "src/toolbelt.ts"]
KEPT = sorted(KEPT, key=lambda k: KEPT_ORDER.index(k["path"]))
N_RANGES = sum(len(k["ranges"]) for k in KEPT)


def merged_lines(ranges):
    out, cur = 0, None
    for a, b in sorted(ranges):
        if cur and a <= cur[1] + 1:
            cur[1] = max(cur[1], b)
        else:
            if cur:
                out += cur[1] - cur[0] + 1
            cur = [a, b]
    return out + (cur[1] - cur[0] + 1 if cur else 0)


# ---------------- scene 1 layout ----------------
COLS, ROWS = 8, 7
GX0, GY0, GX1, GY1, GAP = 60, 250, 1860, 1030, 12
TW = (GX1 - GX0 - (COLS - 1) * GAP) / COLS
TH = (GY1 - GY0 - (ROWS - 1) * GAP) / ROWS
CLICK = 12                       # the "Run decision model" button is pressed
QA_PASS1_S, QA_PASS2_S = 5.0, 1.0   # seconds (SubQ QA endpoint; see module docstring)
SCORE0, SCORE1 = 18, 68          # API request 1 (which files): probabilities ripple across the grid (~1.7 s)
NARROW0, NARROW1 = 72, 86        # API request 2 begins: dropped files fade, kept files slide into a column
BARS0 = 88                       # then line ranges fill inside the kept files (slow, in parallel)
BARS_END = 116
PACKET0 = 108
STEPS = [(0, "1", "The whole repository goes to the decision model with the task",
          f"{CUR['n_files']} files · {round(CUR['repo_tokens'] / 1000)}k tokens"),
         (SCORE0, "2", "API request 1 — which files should change?",
          f"one pass over all {CUR['n_files']} files · {round(CUR['repo_tokens'] / 1000)}k tokens of context"),
         (NARROW0, "3", "API request 2 — keep files p ≥ 0.3, pick line ranges inside them",
          f"4 files kept · next best file p = {CUR['next_best']:.2f}"),
         (PACKET0, "4", "The agent starts from this packet, not the whole repo", f"{CUR['packet_bytes'] / 1000:.0f} kB")]
QUESTION = ("“Which source files must change to add Symbol.iterator, sequence, traverse, zip… "
            "to maybe, result, task and toolbelt?”")


def tile_xy(i):
    r, c = divmod(i, COLS)
    return GX0 + c * (TW + GAP), GY0 + r * (TH + GAP)


def bar_row(j):
    return 340 + j * 150


def split_path(p):
    d, b = os.path.split(p)
    return (d + "/") if d else "", b


def scene1(ax, frame):
    # step caption
    step = max(s for s in STEPS if frame >= s[0])
    a = 1.0 if step[0] == 0 else ease((frame - step[0]) / 4)
    rbox(ax, 60, 52, 64, 64, BLUE, r=32, alpha=a)
    text(ax, 92, 96, step[1], 32, color="#071629", weight="bold", ha="center", alpha=a)
    text(ax, 146, 84, step[2], 40, weight="semibold", alpha=a)
    text(ax, 148, 122, step[3], 22, color=MUTED, alpha=a)
    # Decision-model time, SubQ QA endpoint. Request 1 animates over ~1.7 s but displays its measured 5.0 s
    # ("shown sped up"); request 2 animates in ~1 s and displays 1.0 s (real time, so no "sped up" / "est.").
    p1, p2 = QA_PASS1_S, QA_PASS2_S
    f1 = min(1, max(0, (frame - CLICK) / (SCORE1 - CLICK)))        # request 1 progress
    f2 = min(1, max(0, (frame - NARROW0) / (BARS_END - NARROW0)))  # request 2 progress
    t_s = p1 * f1 + p2 * f2
    done = frame >= BARS_END
    text(ax, W - 60, 62, "DECISION MODEL TIME · SubQ QA" + ("  ·  shown sped up" if CLICK <= frame < SCORE1 else ""),
         15, color=BLUE, weight="semibold", ha="right")
    text(ax, W - 60, 104, ("≈" if done else "") + f"{t_s:.1f} s" + (" total" if done else ""), 36, family=R.MONO,
         weight="medium", ha="right", color=GREEN if done else INK)
    # two explicit segments: request 1 then request 2
    sw, sg, sy = 268, 8, 116
    segs = [("REQUEST 1 · which files", p1, f1), ("REQUEST 2 · line ranges", p2, f2)]
    for k, (lab, secs, fr) in enumerate(segs):
        sx = W - 60 - (2 - k) * sw - (1 - k) * sg
        rbox(ax, sx, sy, sw, 26, "#1d222b", r=8)
        if fr > 0:
            rbox(ax, sx, sy, max(16, sw * fr), 26, GREEN if fr >= 1 else BLUE, r=8, alpha=0.9)
        tc = "#071629" if fr >= 1 else (INK if fr > 0 else MUTED)
        text(ax, sx + 10, sy + 18, lab, 13, color=tc, weight="semibold")
        val = f"{secs:.1f} s" if fr >= 1 or fr == 0 else f"{secs * fr:.1f} s"
        text(ax, sx + sw - 10, sy + 18, val, 13, family=R.MONO, color=tc, ha="right")

    # question chip (already written) + the button that starts the decision
    if frame < NARROW0 + 4:
        qa = 1 - ease((frame - NARROW0) / 4)
        rbox(ax, 60, 150, 1800, 74, "#121c2b", ec=BLUE, r=14, lw=1.5, alpha=qa)
        text(ax, 86, 196, "Q", 24, color=BLUE, weight="bold", alpha=qa)
        text(ax, 120, 196, QUESTION, 21, color=INK, alpha=qa)
        text(ax, 1520, 196, "+ 17 more", 19, color=MUTED, ha="right", alpha=qa)
        pressed = CLICK <= frame < CLICK + 2
        running = frame >= CLICK
        bx, by_, bw, bh = (1548, 160, 296, 54) if not pressed else (1554, 163, 284, 48)
        rbox(ax, bx, by_, bw, bh, "#1f6fd1" if running else BLUE, r=27, alpha=qa)
        label = "Running…" if running and frame < NARROW1 else ("Decision ready" if running else "Run decision model")
        text(ax, bx + bw / 2, by_ + bh / 2 + 8, label, 21, color="#ffffff", weight="semibold", ha="center", alpha=qa)
        if CLICK <= frame < CLICK + 6:      # click ripple
            rr = ease((frame - CLICK) / 6)
            rbox(ax, bx - 14 * rr, by_ - 14 * rr, bw + 28 * rr, bh + 28 * rr, "none", ec=BLUE, r=27 + 14 * rr, lw=2,
                 alpha=(1 - rr) * qa)
    # cursor glides to the button and clicks
    if frame < CLICK + 6:
        t = ease(frame / CLICK)
        cx, cy = 1180 + (1700 - 1180) * t, 640 + (196 - 640) * t
        ca = 1 - ease((frame - CLICK - 2) / 4)
        ax.add_patch(Polygon([[cx, cy], [cx, cy + 34], [cx + 9, cy + 26], [cx + 15, cy + 40], [cx + 21, cy + 37],
                              [cx + 15, cy + 24], [cx + 26, cy + 24]], closed=True, fc="#ffffff", ec="#0d0f13", lw=1.5,
                             alpha=ca, zorder=8))

    # tiles
    kept_idx = {k["path"]: j for j, k in enumerate(KEPT)}
    for i, f in enumerate(FILES):
        x, y = tile_xy(i)
        appear = 1.0                     # the repository is on screen from the first frame
        t_rev = SCORE0 + (i / len(FILES)) * (SCORE1 - SCORE0)
        rev = ease((frame - t_rev) / 3)
        kept = f["kept"]
        if kept:
            j = kept_idx[f["path"]]
            m = ease((frame - NARROW0) / (NARROW1 - NARROW0))
            tx, ty = 80, bar_row(j) - 64
            x, y = x + (tx - x) * m, y + (ty - y) * m
            w, h = TW + (420 - TW) * m, TH + (50 - TH) * m
            fc = "#10291b" if rev > 0.5 else PANEL
            ec = GREEN if rev > 0 else LINE
            alpha = appear
            lw = 1 + 2 * rev
        else:
            fade = ease((frame - NARROW0) / 8)
            w, h = TW, TH
            fc = "#2a1517" if rev > 0.5 else PANEL
            ec = RED if rev > 0 else LINE
            alpha = appear * (1 - fade)
            lw = 1 + rev
        if alpha <= 0.01:
            continue
        rbox(ax, x, y, w, h, fc, ec=ec, r=10, lw=lw, alpha=alpha)
        d, b = split_path(f["path"])
        if kept and frame >= NARROW0:
            m = ease((frame - NARROW0) / (NARROW1 - NARROW0))
            text(ax, x + 18, y + h / 2 + 9, f["path"], 19 + 7 * m, family=R.MONO, weight="medium", alpha=alpha)
            text(ax, x + w - 16, y + h / 2 + 9, f"p {f['p']:.2f}", 19, family=R.MONO, color=GREEN, ha="right", alpha=alpha)
            continue
        if len(d) > 26:
            d = "…" + d[-25:]
        if len(b) > 19:
            b = b[:18] + "…"
        text(ax, x + 12, y + 30, d or "/", 14, color=FAINT, alpha=alpha)
        text(ax, x + 12, y + 58, b, 17, family=R.MONO, color=INK, alpha=alpha)
        if rev > 0:
            pv = f["p"]
            lab = f"p {pv:.2f}" if pv >= 0.01 else "p <0.01"
            col = GREEN if kept else RED
            text(ax, x + TW - 12, y + TH - 12, lab, 15, family=R.MONO, color=col, ha="right", alpha=alpha * rev)
            ax.add_patch(Rectangle((x + 12, y + TH - 34), (TW - 24) * min(1, pv) * rev, 4, fc=col, ec="none", alpha=alpha))
            if not kept:
                text(ax, x + TW - 14, y + 30, "✕", 16, color=RED, ha="right", alpha=alpha * rev, family="DejaVu Sans")
            else:
                text(ax, x + TW - 14, y + 30, "✓", 17, color=GREEN, ha="right", weight="bold", alpha=alpha * rev, family="DejaVu Sans")

    # legend during scoring
    if SCORE0 <= frame < NARROW0 + 2:
        la = ease((frame - SCORE0) / 4) * (1 - ease((frame - NARROW0) / 3))
        text(ax, 60, 1062, "■", 20, color=GREEN, alpha=la, family="DejaVu Sans")
        text(ax, 88, 1062, "kept: p ≥ 0.3 on some question", 19, color=MUTED, alpha=la)
        text(ax, 420, 1062, "■", 20, color=RED, alpha=la, family="DejaVu Sans")
        text(ax, 448, 1062, "dropped", 19, color=MUTED, alpha=la)
        text(ax, 1860, 1062, "p = the model's highest probability that this file is where a change belongs", 17,
             color=FAINT, ha="right", alpha=la)

    # file bars with the line ranges the packet points at
    if frame >= BARS0:
        for j, k in enumerate(KEPT):
            ba = ease((frame - BARS0 - j * 3) / 16)   # slower fill so the ranges are legible
            y = bar_row(j)
            x0, L = 80, 1100
            rbox(ax, x0, y, L * ba, 28, "#1d222b", r=6)
            for a_, b_ in k["ranges"]:
                xs = x0 + L * (a_ - 1) / k["lines"]
                ws = max(4, L * (b_ - a_ + 1) / k["lines"])
                ax.add_patch(Rectangle((xs, y), ws * ba, 28, fc=GREEN, ec="none", alpha=0.9 * ba))
            nl = merged_lines(k["ranges"])
            text(ax, x0, y + 54, f"{k['lines']:,} lines", 18, family=R.MONO, color=FAINT, alpha=ba)
            text(ax, x0 + L, y + 54, f"{len(k['ranges'])} range{'s' if len(k['ranges']) > 1 else ''} · {nl:,} lines pointed at",
                 18, family=R.MONO, color=GREEN, ha="right", alpha=ba)

    # the packet
    if frame >= PACKET0:
        pa = ease((frame - PACKET0) / 6)
        px = 1300 + (1 - pa) * 30
        ax.add_patch(Polygon([[1205, 545], [1260, 545], [1260, 530], [1285, 560], [1260, 590], [1260, 575], [1205, 575]],
                             closed=True, fc=GREEN, ec="none", alpha=pa))
        rbox(ax, px, 300, 560, 520, "#16243a", ec=BLUE, r=18, lw=2, alpha=pa)
        text(ax, px + 34, 356, "CONTEXT PACKET → AGENT", 20, color=BLUE, weight="semibold", alpha=pa)
        text(ax, px + 34, 470, f"{CUR['packet_bytes'] / 1000:.0f} kB", 96, family=R.MONO, weight="medium", alpha=pa)
        text(ax, px + 34, 540, "4 files", 26, alpha=pa)
        text(ax, px + 34, 584, f"{N_RANGES} line ranges", 26, alpha=pa)
        text(ax, px + 34, 628, "+ code style, which tests to run", 22, color=MUTED, alpha=pa)
        text(ax, px + 34, 760, f"instead of {round(CUR['repo_tokens'] / 1000)}k tokens of repository", 20, color=MUTED, alpha=pa)


def frame_fig(frame):
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")
    fig.patch.set_facecolor(BG)
    scene1(ax, frame)
    return fig


def main():
    out = f"{HERE}/frames_v2"
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for i in range(N_FRAMES):
        fig = frame_fig(i)
        fig.savefig(f"{out}/frame_{i:04d}.png", facecolor=BG)
        plt.close(fig)
    shutil.copy(f"{out}/frame_{PACKET0 + 10:04d}.png", f"{HERE}/poster_v2.png")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{out}/frame_%04d.png",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", f"{HERE}/demo_v2.mp4"],
                   check=True)
    print(f"-> {HERE}/demo_v2.mp4 ({N_FRAMES} frames, {N_FRAMES / FPS:.2f} s); {N_RANGES} ranges; race {R.RATE:.2f} req/frame")


if __name__ == "__main__":
    main()
