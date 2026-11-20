"""20-second listing-match cut built on a real screen recording of the app.

  uv run listing-match-app &
  python scripts/record_race.py --rival "" --size 1920x1080 --out takes/live-1920x1080 --settle 3.5 --warmup
  python scripts/record_race.py --rival "" --size 1080x1080 --out takes/live-1080x1080 --settle 3.5 --warmup
  python render_live.py

Writes output/listing-match-live-16x9.mp4 and output/listing-match-live-1x1.mp4.

Primary prop: speed, on the real product. The middle of the cut is the app
itself, recorded headless at full resolution, at real speed with no cuts inside
the run: 24 public Austin listings, each with its cover photo, seven wishes,
SubQ Snap alone. The proof card's time and cost are that take's own lane_done
totals (takes/*.json). The comparison card is the measured benchmark in the
README (2026-10-08, 40 listings, same listings and photos for both models),
labelled as such, because this take had no LLM lane.
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
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import brand.snap_logo as snap_logo  # noqa: E402

# End on the color lockup, on white: its word is dark. Same rule as the buog/color-end-card branch,
# which makes this file the default in brand/snap_logo.py. Drawn as-is, only scaled down.
snap_logo.PATH = os.path.join(ROOT, "brand", "logos", "SubQ_subQ color.png")
draw_logo = snap_logo.draw

for name in os.listdir(f"{ROOT}/subq-demo-agent/fonts"):
    if name.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{ROOT}/subq-demo-agent/fonts/{name}")

SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"
FPS, TOTAL = 30, 20.0
HOOK, END = 2.5, 3.0
LEAD, TAIL = 1.4, 3.3  # recording kept before Enter, and after SubQ's lane finished (the carousel settles)
BG, INK, MUTED, YELLOW, GREEN = "#0d0d0d", "#f5f2ed", "#a39e94", "#ffe237", "#7dce6a"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")

# README, "Command line": 2026-10-08, production endpoint, Austin, 40 listings with photos,
# 7 wishes, 8 requests in flight per model. SubQ 3.6s / $0.0044, GPT-6 Luna 23.8s / $0.0091.
BENCH = {"rival": "GPT-6 Luna", "faster": 6.5, "cheaper": 2.0, "listings": 40, "date": "8 Oct 2026"}


def ease(t):
    t = min(1, max(0, t))
    return 1 - (1 - t) ** 3


def text(ax, x, y, s, size, dpi, color=INK, weight="regular", family=SANS, ha="center", va="center", alpha=1):
    ax.text(x, y, s, fontsize=size * 72 / dpi, color=color, fontweight=weight, family=family,
            ha=ha, va=va, alpha=alpha, zorder=3)


def card(ax, w, h, kind, t, take, dpi, square):
    """One frame of a black card. t is seconds into the card."""
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    ax.add_patch(Rectangle((0, 0), w, h, fc=BG if kind != "end" else "#ffffff", ec="none", zorder=0))
    head = 72 if not square else 58
    big = 170 if not square else 140
    body = 38 if not square else 32
    small = 26 if not square else 24
    lanes = take["lanes"]["subq"]
    wall, cost, n = lanes["totals"]["wall"], lanes["totals"]["cost"], lanes["total"]

    if kind == "hook":
        a = ease(t / 0.3)
        lines = ["Screen 24 rentals", "in about a second"]
        for i, s in enumerate(lines):
            text(ax, w / 2, h / 2 + (i - 0.5) * head * 1.25, s, head * 1.15, dpi, weight="semibold", alpha=a)
        text(ax, w / 2, h / 2 + head * 1.9, "Every photo. Every listing.", body, dpi, color=MUTED, alpha=ease((t - 0.6) / 0.3))
    elif kind == "proof":
        a = ease(t / 0.25)
        text(ax, w / 2, h * 0.24, "One search, real time", head, dpi, weight="semibold", alpha=a)
        shown = wall * ease((t - 0.15) / 0.7)
        text(ax, w / 2, h * 0.47, f"{shown:.2f}s", big, dpi, color=GREEN, family=MONO, weight="medium", alpha=a)
        text(ax, w / 2, h * 0.47 + big * 0.72, f"{n} listings · 7 wishes · {n} photos", body, dpi, color=MUTED, alpha=a)
        b = ease((t - 1.2) / 0.3)
        text(ax, w / 2, h * 0.80, f"${cost:.4f} for the whole search", body * 1.15, dpi, color=YELLOW,
             family=MONO, weight="medium", alpha=b)
    elif kind == "compare":
        a = ease(t / 0.25)
        text(ax, w / 2, h * 0.22, "Same listings, same photos", head, dpi, weight="semibold", alpha=a)
        rows = [(f"{BENCH['faster']:.1f}×", "faster", GREEN), (f"{BENCH['cheaper']:.0f}×", "cheaper", YELLOW)]
        for i, (num, word, color) in enumerate(rows):
            b = ease((t - 0.2 - i * 0.35) / 0.3)
            y = h * (0.43 + i * 0.2)
            text(ax, w / 2 - 20, y, num, big * 0.8, dpi, color=color, family=MONO, weight="medium", ha="right", alpha=b)
            text(ax, w / 2 + 20, y, word, head, dpi, ha="left", alpha=b)
        # AGENTS.md: name the rival in the post copy, not on screen.
        text(ax, w / 2, h * 0.79, "than an LLM on the same task", body, dpi, color=INK, alpha=ease((t - 0.9) / 0.3))
        text(ax, w / 2, h * 0.88, f"Benchmark, {BENCH['listings']} listings, {BENCH['date']}", small, dpi, color=MUTED,
             alpha=ease((t - 0.9) / 0.3))
    else:
        draw_logo(ax, w, h, ease(t / 0.35), wide=not square)


def card_clip(w, h, kind, secs, take, path, tmp):
    dpi, square = 100, w == h
    frames = f"{tmp}/{kind}"
    os.makedirs(frames, exist_ok=True)
    n = round(secs * FPS)
    for i in range(n):
        fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        card(ax, w, h, kind, i / FPS, take, dpi, square)
        fig.savefig(f"{frames}/f_{i:04d}.png", facecolor="#000000")
        plt.close(fig)
    encode(["-framerate", str(FPS), "-i", f"{frames}/f_%04d.png"], [], path)
    return f"{frames}/f_{n - 1:04d}.png"


def pill(w, h, path):
    """'Real app · real time' tag, drawn into the page's own bottom margin."""
    dpi = 100
    fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    pw, ph = (470, 44) if w > h else (430, 40)
    y = h - 34
    ax.add_patch(FancyBboxPatch((w / 2 - pw / 2, y - ph / 2), pw, ph, boxstyle=f"round,pad=0,rounding_size={ph / 2}",
                                fc="#0d0d0d", ec="none", alpha=0.88, zorder=2))
    text(ax, w / 2, y, "Real app · real time · no cuts", 24 if w > h else 22, dpi, color=INK, weight="medium")
    fig.savefig(path, transparent=True)
    plt.close(fig)


def encode(inputs, filters, out):
    cmd = [FFMPEG, "-y", "-loglevel", "error", *inputs]
    if filters:
        cmd += ["-filter_complex", filters]
        if filters.endswith("[v]"):
            cmd += ["-map", "[v]"]
    cmd += ["-r", str(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-an", out]
    subprocess.run(cmd, check=True)


def duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    hh, mm, ss = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(hh) * 3600 + int(mm) * 60 + float(ss)


def render(w, h, name, take_prefix):
    take = json.load(open(take_prefix + ".json"))
    video = take_prefix + ".webm"
    # The page clock starts a beat before the video's first frame; line them up from the end.
    offset = take["video_end_s"] - duration(video)
    start = take["run_start_s"] - offset - LEAD
    rec = LEAD + (take["lane_finished_s"]["subq"] - take["run_start_s"]) + TAIL
    proof = 3.6
    compare = TOTAL - HOOK - rec - proof - END
    assert compare > 2.5, f"recording segment too long: {rec:.2f}s"

    tmp = f"{HERE}/frames_{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    out = f"{HERE}/output"
    os.makedirs(out, exist_ok=True)
    card_clip(w, h, "hook", HOOK, take, f"{tmp}/1.mp4", tmp)
    pill(w, h, f"{tmp}/pill.png")
    encode(["-ss", f"{start:.3f}", "-t", f"{rec:.3f}", "-i", video, "-i", f"{tmp}/pill.png"],
           f"[0:v]fps={FPS},scale={w}:{h},setsar=1[v];[v][1:v]overlay=0:0", f"{tmp}/2.mp4")
    poster = card_clip(w, h, "proof", proof, take, f"{tmp}/3.mp4", tmp)
    card_clip(w, h, "compare", compare, take, f"{tmp}/4.mp4", tmp)
    card_clip(w, h, "end", END, take, f"{tmp}/5.mp4", tmp)
    parts = [f"{tmp}/{i}.mp4" for i in range(1, 6)]
    encode(sum([["-i", p] for p in parts], []),
           "".join(f"[{i}:v]setsar=1[s{i}];" for i in range(5))
           + "".join(f"[s{i}]" for i in range(5)) + "concat=n=5:v=1:a=0[v]", f"{tmp}/all.mp4")
    shutil.move(f"{tmp}/all.mp4", f"{out}/{name}.mp4")
    # Poster: the app mid-scan, the frame people stop on.
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{HOOK + LEAD + 0.5:.2f}", "-i", f"{out}/{name}.mp4",
                    "-frames:v", "1", f"{out}/{name}-poster.png"], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"-> {out}/{name}.mp4  (recording {rec:.2f}s, SubQ {take['lanes']['subq']['totals']['wall']:.2f}s)")


if __name__ == "__main__":
    takes = os.environ.get("TAKES", f"{HERE}/takes")
    render(1920, 1080, "listing-match-live-16x9", f"{takes}/live-1920x1080")
    render(1080, 1080, "listing-match-live-1x1", f"{takes}/live-1080x1080")
