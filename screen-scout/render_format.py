"""20-second Screen Scout cut, in the repo demo-video format.

  python render_format.py

Writes output/screen-scout-16x9.mp4 and output/screen-scout-1x1.mp4.

Primary prop: accuracy. YouTube marks this public Gacha Life video family safe.
Snap 1.2 reads the whole transcript in one call and scores romance at 0.995,
with 0.06 that it is appropriate for ages 6–9. Numbers are the live call in
demo_call.json (model subq-snap-1.2, 5,954 input tokens). The caption lines
on screen are real lines from that transcript.

This is a motion graphic of that call, not a recording of the Streamlit app.
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

for name in os.listdir(f"{ROOT}/subq-demo-agent/fonts"):
    if name.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{ROOT}/subq-demo-agent/fonts/{name}")

SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"
FPS = 30
N = 600
HOOK, SCALE, DECIDE, PROOF = 90, 270, 480, 540

BG = "#0d0d0d"
INK = "#f5f2ed"
MUTED = "#a39e94"
YELLOW = "#ffe237"
GREEN = "#7dce6a"

CALL = json.load(open(f"{HERE}/demo_call.json"))
LINES = CALL["lines"]
TOKENS = CALL["input_tokens"]
WORDS = CALL["words"]
EVIDENCE = CALL["evidence"]
ROMANCE = CALL["sexual_content"]
AGES = CALL["appropriate_6_to_9"]


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
    head = 72 if not square else 58
    counter = 140 if not square else 112
    body = 36 if not square else 30
    line_px = 32 if not square else 28

    if frame < DECIDE:
        beats = [(0, "Marked safe for kids?"), (HOOK, "The whole transcript"), (SCALE, "Snap flags the romance")]
        title, alpha = beats[0][1], 1
        for start, label in beats:
            if frame >= start:
                title, alpha = label, ease((frame - start) / 8) if start else 1
        if frame < HOOK:
            text(ax, w / 2, h / 2, title, int(head * 1.25), dpi, weight="semibold", ha="center", alpha=ease(frame / 8))
        else:
            text(ax, w / 2, 120 if not square else 100, title, head, dpi, weight="semibold", ha="center", alpha=alpha)

    if frame < HOOK:
        return

    if frame < SCALE:
        t = ease((frame - HOOK) / (SCALE - HOOK - 12))
        tokens = int(TOKENS * t)
        n = min(len(LINES), int(t * len(LINES) + 0.999))
        text(ax, w / 2, h * 0.42, f"{tokens:,}", counter, dpi, color=YELLOW, family=MONO, weight="medium", ha="center")
        text(ax, w / 2, h * 0.42 + counter * 0.85, "tokens", body, dpi, color=MUTED, ha="center")
        if n:
            line = f"{WORDS:,} words" if n == len(LINES) else LINES[n - 1]
            text(ax, w / 2, h * 0.74, line, line_px, dpi, family=MONO, ha="center",
                 color=MUTED if n == len(LINES) else INK)
        return

    if frame < DECIDE:
        a = ease((frame - SCALE) / 12)
        quote = 44 if not square else 34
        score = 120 if not square else 96
        text(ax, w / 2, h * 0.46, EVIDENCE, quote, dpi, color=YELLOW, family=MONO, ha="center", alpha=a)
        text(ax, w / 2, h * 0.64, f"{ROMANCE:.3f}", score, dpi, color=GREEN, family=MONO, weight="medium", ha="center", alpha=a)
        text(ax, w / 2, h * 0.64 + score * 0.85, "romance", body, dpi, color=MUTED, ha="center", alpha=a)
        return

    if frame < PROOF:
        a = ease((frame - DECIDE) / 10)
        text(ax, w / 2, h * 0.30, "Family safe. Snap says no.", head, dpi, weight="semibold", ha="center", alpha=a)
        text(ax, w / 2, h * 0.52, f"{AGES:.2f}", counter, dpi, color=GREEN, family=MONO, weight="medium", ha="center", alpha=a)
        text(ax, w / 2, h * 0.52 + counter * 0.85, "ok for ages 6–9", body, dpi, color=MUTED, ha="center", alpha=a)
        return

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
    render(1920, 1080, "screen-scout-16x9")
    render(1080, 1080, "screen-scout-1x1")


if __name__ == "__main__":
    main()
