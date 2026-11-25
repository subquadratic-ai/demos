"""20-second policy-check cut, in the repo demo-video format.

  python render_format.py

Writes output/policy-check-16x9.mp4 and output/policy-check-1x1.mp4.

Primary prop: speed. Snap (subq-snap-latest) read the synthetic 380-page marketing rulebook,
212,082 tokens, in one request and returned in 2.86s. The claim is
"Guaranteed 5% return". Snap picked clause 3.3. Numbers are demo_call.json.
This is a motion graphic of that call, not a recording of the app.
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
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from brand.snap_logo import draw as draw_logo  # noqa: E402

for name in os.listdir(f"{ROOT}/brand/fonts"):
    if name.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{ROOT}/brand/fonts/{name}")

SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"
FPS, N = 30, 600
HOOK, SCALE, DECIDE, PROOF = 90, 270, 480, 540
BG, INK, MUTED, YELLOW, GREEN = "#0d0d0d", "#f5f2ed", "#a39e94", "#ffe237", "#7dce6a"
CALL = json.load(open(f"{HERE}/demo_call.json"))


def ease(t):
    t = min(1, max(0, t))
    return 1 - (1 - t) ** 3


def text(ax, x, y, s, size, dpi, color=INK, weight="regular", family=SANS, ha="left", va="center", alpha=1):
    ax.text(x, y, s, fontsize=size * 72 / dpi, color=color, fontweight=weight, family=family,
            ha=ha, va=va, alpha=alpha, zorder=3)


def scene(ax, w, h, frame, dpi, square):
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    ax.add_patch(Rectangle((0, 0), w, h, fc=BG, ec="none", zorder=0))
    head = 68 if not square else 52
    counter = 140 if not square else 112
    body = 36 if not square else 30

    if frame < DECIDE:
        beats = [(0, "Guaranteed 5% return"), (HOOK, "The whole handbook"), (SCALE, "Breaks clause 3.3")]
        title = beats[0][1]
        alpha = 1
        for start, label in beats:
            if frame >= start:
                title, alpha = label, ease((frame - start) / 8) if start else 1
        if frame < HOOK:
            text(ax, w / 2, h / 2, title, int(head * 1.2), dpi, weight="semibold", ha="center", alpha=ease(frame / 8))
        else:
            text(ax, w / 2, 120 if not square else 100, title, head, dpi, weight="semibold", ha="center", alpha=alpha)
    if frame < HOOK:
        return
    if frame < SCALE:
        t = ease((frame - HOOK) / (SCALE - HOOK - 12))
        tokens = int(CALL["tokens"] * t)
        n = min(len(CALL["lines"]), int(t * len(CALL["lines"]) + 0.999))
        text(ax, w / 2, h * 0.42, f"{tokens:,}", counter, dpi, color=YELLOW, family=MONO, weight="medium", ha="center")
        text(ax, w / 2, h * 0.42 + counter * 0.85, "tokens", body, dpi, color=MUTED, ha="center")
        if n:
            line = "380 pages" if n == len(CALL["lines"]) else CALL["lines"][n - 1]
            text(ax, w / 2, h * 0.74, line, 32 if not square else 28, dpi, family=MONO, ha="center",
                 color=MUTED if n == len(CALL["lines"]) else INK)
        return
    if frame < DECIDE:
        a = ease((frame - SCALE) / 12)
        text(ax, w / 2, h * 0.42, CALL["title"], 40 if not square else 32, dpi, color=YELLOW, family=MONO, ha="center", alpha=a)
        text(ax, w / 2, h * 0.58, CALL["evidence"], 36 if not square else 28, dpi, family=MONO, ha="center", alpha=a)
        text(ax, w / 2, h * 0.74, f"{CALL['p']:.3f}", 96 if not square else 80, dpi, color=GREEN, family=MONO, weight="medium", ha="center", alpha=a)
        return
    if frame < PROOF:
        a = ease((frame - DECIDE) / 10)
        text(ax, w / 2, h * 0.32, "One read. Real time.", head, dpi, weight="semibold", ha="center", alpha=a)
        text(ax, w / 2, h * 0.55, f"{CALL['wall_s']:.2f}s", counter, dpi, color=GREEN, family=MONO, weight="medium", ha="center", alpha=a)
        text(ax, w / 2, h * 0.55 + counter * 0.8, "212,082 tokens, one request", body, dpi, color=MUTED, ha="center", alpha=a)
        return
    a = ease((frame - PROOF) / 10)
    ax.add_patch(Rectangle((0, 0), w, h, fc="#000000", ec="none", zorder=2))
    draw_logo(ax, w, h, a, wide=not square)


def render(w, h, name):
    dpi = 100
    frames = f"{HERE}/frames_{name}"
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames)
    out = f"{HERE}/output"
    os.makedirs(out, exist_ok=True)
    for i in range(N):
        fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        fig.patch.set_facecolor("#000000")
        scene(ax, w, h, i, dpi, w == h)
        fig.savefig(f"{frames}/frame_{i:04d}.png", facecolor="#000000")
        plt.close(fig)
        if i % 120 == 0:
            print(f"{name} {i}/{N}", flush=True)
    shutil.copy(f"{frames}/frame_{DECIDE - 20:04d}.png", f"{out}/{name}-poster.png")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{frames}/frame_%04d.png",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", f"{out}/{name}.mp4"],
        check=True,
    )
    shutil.rmtree(frames, ignore_errors=True)
    print(f"-> {out}/{name}.mp4")


if __name__ == "__main__":
    render(1920, 1080, "policy-check-16x9")
    render(1080, 1080, "policy-check-1x1")
