"""20-second context-curation cut, in the repo demo-video format.

  python render_format.py

Writes output/context-curation-16x9.mp4 and output/context-curation-1x1.mp4.

Primary prop: long context. The whole public true-myth repo (56 files, 225,692 tokens)
goes into one decision. Secondary: accuracy (the four files and line ranges Snap kept,
and 96/96 on both arms) and cost (5.91M → 3.06M agent input tokens on this task).

No speed timer. The only wall-clock numbers we have are the slow self-hosted engine
(254s) and an estimated QA timing that the previous cut had to label as sped up.
This cut does not invent a Snap 1.2 latency.

This is a motion graphic of the recorded trial (curation.json, series.json), not a
screen recording of a product UI. The trial has no product UI capture.
"""
import json
import os
import shutil
import subprocess
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand.snap_logo import draw as draw_logo  # noqa: E402
for name in os.listdir(f"{HERE}/fonts"):
    if name.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{HERE}/fonts/{name}")

SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"
FPS = 30
N = 600  # 20.0 s
# Beats, in frames: hook, scale, decision, proof, end card.
HOOK, SCALE, DECIDE, PROOF = 90, 270, 480, 540

BG = "#0d0d0d"
INK = "#f5f2ed"
MUTED = "#a39e94"
YELLOW = "#ffe237"
BLUE = "#0834bc"
ORANGE = "#eb521e"
GREEN = "#7dce6a"
GREY = "#999489"

CUR = json.load(open(f"{HERE}/curation.json"))
FILES = [f["path"] for f in CUR["files"]]
# Widest range in each kept file is the evidence line shown on screen.
KEPT = []
for item in CUR["kept"]:
    a, b = max(item["ranges"], key=lambda r: r[1] - r[0])
    score = next(f["p"] for f in CUR["files"] if f["path"] == item["path"])
    KEPT.append((item["path"], score, a, b))
KEPT.sort(key=lambda row: -row[1])

# Published trial totals (DEMO_BRIEF.md). Summing per-request ctx would double-count cache.
ALONE_M, CURATED_M = 5.91, 3.06
TESTS = "96/96"


def ease(t):
    t = min(1, max(0, t))
    return 1 - (1 - t) ** 3


def px(size, dpi):
    return size * 72 / dpi


def text(ax, x, y, s, size, dpi, color=INK, weight="regular", family=SANS, ha="left", va="center", alpha=1):
    ax.text(x, y, s, fontsize=px(size, dpi), color=color, fontweight=weight, family=family,
            ha=ha, va=va, alpha=alpha, zorder=3)


def scene(ax, w, h, frame, dpi, square):
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    ax.add_patch(Rectangle((0, 0), w, h, fc=BG, ec="none", zorder=0))
    head = 78 if not square else 64
    counter = 140 if not square else 112
    body = 36 if not square else 30
    file_px = 32 if not square else 26

    if frame < DECIDE:
        beats = [(0, "Which files must change?"), (HOOK, "The whole repository"), (SCALE, "Snap keeps these four")]
        title, alpha = beats[0][1], 1
        for start, label in beats:
            if frame >= start:
                title, alpha = label, ease((frame - start) / 8) if start else 1
        if frame < HOOK:
            # Hook owns the screen: one big centered headline.
            text(ax, w / 2, h / 2, title, int(head * 1.35), dpi, weight="semibold", ha="center", alpha=ease(frame / 8))
        else:
            text(ax, w / 2, 120 if not square else 100, title, head, dpi, weight="semibold", ha="center", alpha=alpha)

    if frame < HOOK:
        return

    if frame < SCALE:
        t = ease((frame - HOOK) / (SCALE - HOOK - 12))
        tokens = int(CUR["repo_tokens"] * t)
        n_files = min(len(FILES), int(t * len(FILES) + 0.999))
        text(ax, w / 2, h * 0.42, f"{tokens:,}", counter, dpi, color=YELLOW, family=MONO, weight="medium", ha="center")
        text(ax, w / 2, h * 0.42 + counter * 0.85, "tokens", body, dpi, color=MUTED, ha="center")
        if n_files:
            name = f"{len(FILES)} files" if n_files == len(FILES) else FILES[n_files - 1]
            text(ax, w / 2, h * 0.72, name, file_px, dpi, family=MONO, ha="center",
                 color=INK if n_files < len(FILES) else MUTED)
        return

    if frame < DECIDE:
        top = 270 if not square else 220
        gap = 190 if not square else 190
        fsz = 56 if not square else 40
        shown = ease((frame - SCALE) / (DECIDE - SCALE))
        for i, (path, score, a, b) in enumerate(KEPT):
            local = ease((shown * len(KEPT)) - i)
            if local <= 0:
                continue
            y = top + i * gap
            left, right = (240, w - 240) if not square else (64, w - 64)
            text(ax, left, y, path, fsz, dpi, family=MONO, weight="medium", alpha=local)
            text(ax, right, y, f"{score:.2f}", fsz, dpi, color=GREEN, family=MONO, ha="right", alpha=local)
            text(ax, left, y + fsz * 1.15, f"lines {a}–{b}", int(fsz * 0.8), dpi, color=YELLOW, family=MONO, alpha=local)
        return

    if frame < PROOF:
        a = ease((frame - DECIDE) / 10)
        text(ax, w / 2, h * 0.28, "Same tests. Fewer tokens.", head, dpi, weight="semibold", ha="center", alpha=a)
        text(ax, w / 2, h * 0.48, TESTS, counter, dpi, color=GREEN, family=MONO, weight="medium", ha="center", alpha=a)
        num = 72 if not square else 56
        ny = h * 0.60
        text(ax, w / 2, ny, f"{ALONE_M:.2f}M  →  {CURATED_M:.2f}M", num, dpi, family=MONO, ha="center", alpha=a)
        text(ax, w / 2, ny + num * 1.05, "agent alone  →  with Snap", 40 if not square else 32, dpi, color=MUTED, ha="center", alpha=a)
        return

    # End card. Black, with the lockup file. Wordmark in that file is lifted to white.
    a = ease((frame - PROOF) / 10)
    ax.add_patch(Rectangle((0, 0), w, h, fc="#000000", ec="none", zorder=2))
    draw_logo(ax, w, h, a, wide=not square)


def render(w, h, name):
    dpi = 100
    frames = f"{HERE}/frames_{name}"
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames)
    out_dir = f"{HERE}/output"
    os.makedirs(out_dir, exist_ok=True)
    for i in range(N):
        fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        fig.patch.set_facecolor("#000000")
        scene(ax, w, h, i, dpi, w == h)
        fig.savefig(f"{frames}/frame_{i:04d}.png", facecolor="#000000")
        plt.close(fig)
        if i % 60 == 0:
            print(f"{name} {i}/{N}", flush=True)
    poster = f"{out_dir}/{name}-poster.png"
    shutil.copy(f"{frames}/frame_{DECIDE - 20:04d}.png", poster)
    mp4 = f"{out_dir}/{name}.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{frames}/frame_%04d.png",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4],
        check=True,
    )
    shutil.rmtree(frames, ignore_errors=True)
    print(f"-> {mp4}")


def main():
    render(1920, 1080, "context-curation-16x9")
    render(1080, 1080, "context-curation-1x1")


if __name__ == "__main__":
    main()
