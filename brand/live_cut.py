"""Record a demo's real UI and cut it into a 20-second video in the repo format.

Each demo keeps a small `record_live.py` that says how to drive its page and
what its cards say. This module does the rest:

  record(out, size, url, drive)   headless Chromium, Playwright's own video of
                                  the page at full size. `drive(page, mark)`
                                  clicks through the UI like a person and calls
                                  mark("start"), mark("done") and so on. Writes
                                  <out>.webm and <out>.json (marks in video
                                  seconds, plus whatever drive returns).
  cut(name, take, cards, ...)     hook card, the recording between two marks at
                                  real speed with a "real app" tag, proof cards,
                                  and the end card: the color SubQ lockup on
                                  white, drawn from the file as-is.

Nothing on the recorded page is mocked or retimed. Needs Playwright with
Chromium, matplotlib, and ffmpeg (FFMPEG env var, or on PATH).
"""
import json
import os
import shutil
import subprocess
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

from . import snap_logo  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for _f in os.listdir(f"{ROOT}/subq-demo-agent/fonts"):
    if _f.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{ROOT}/subq-demo-agent/fonts/{_f}")

# The color lockup, on white: its word is dark. Drawn as-is, only scaled down.
snap_logo.PATH = os.path.join(HERE, "logos", "SubQ_subQ color.png")

SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"
FPS, TOTAL = 30, 20.0
BG, INK, MUTED, YELLOW, GREEN, RED = "#0d0d0d", "#f5f2ed", "#a39e94", "#ffe237", "#7dce6a", "#ff7a66"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


# ---- Recording ------------------------------------------------------------------------------------

def record(out, size, url, drive, settle=0.0, zoom=1.0):
    """zoom > 1 sets CSS zoom on the page, so an app with fixed small type (Streamlit, a dashboard)
    reads on a phone. The text is laid out and rasterized at that size: no upscaling blur. It is the
    same as a person pressing Cmd-+ in their browser."""
    from playwright.sync_api import sync_playwright

    w, h = size
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    tmp = out + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": w, "height": h}, record_video_dir=tmp,
                                  record_video_size={"width": w, "height": h})
        if zoom != 1:
            ctx.add_init_script("document.addEventListener('DOMContentLoaded', () => "
                                f"document.documentElement.style.zoom = '{zoom}')")
        t0 = time.monotonic()
        page = ctx.new_page()
        marks = {}

        def mark(name):
            marks[name] = round(time.monotonic() - t0, 3)

        page.goto(url)
        extra = drive(page, mark) or {}
        page.wait_for_timeout(int(settle * 1000))
        mark("end")
        video = page.video.path()
        ctx.close()
        browser.close()
    shutil.move(video, out + ".webm")
    shutil.rmtree(tmp, ignore_errors=True)
    # The page clock starts a beat before the video's first frame; line them up from the end.
    offset = marks["end"] - duration(out + ".webm")
    meta = {"size": [w, h], "marks_s": {k: round(v - offset, 3) for k, v in marks.items()},
            "recorded": time.strftime("%Y-%m-%d %H:%M"), **extra}
    json.dump(meta, open(out + ".json", "w"), indent=2)
    return meta


def duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    hh, mm, ss = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(hh) * 3600 + int(mm) * 60 + float(ss)


# ---- Cards ----------------------------------------------------------------------------------------

def ease(t):
    t = min(1, max(0, t))
    return 1 - (1 - t) ** 3


def text(ax, x, y, s, size, dpi, color=INK, weight="regular", family=SANS, ha="center", va="center", alpha=1):
    ax.text(x, y, s, fontsize=size * 72 / dpi, color=color, fontweight=weight, family=family,
            ha=ha, va=va, alpha=alpha, zorder=3)


class Card:
    """Sizes for one frame. Card drawers take (c, t) where t is seconds into the card."""

    def __init__(self, ax, w, h, dpi):
        self.ax, self.w, self.h, self.dpi, self.square = ax, w, h, dpi, w == h
        sq = self.square
        self.head = 72 if not sq else 58
        self.big = 170 if not sq else 140
        self.body = 38 if not sq else 32
        self.small = 26 if not sq else 24

    def text(self, x, y, s, size, **kw):
        text(self.ax, x, y, s, size, self.dpi, **kw)


def hook(lines, sub=None):
    def draw(c, t):
        a = ease(t / 0.3)
        n = len(lines)
        for i, s in enumerate(lines):
            c.text(c.w / 2, c.h / 2 + (i - (n - 1) / 2) * c.head * 1.25, s, c.head * 1.15, weight="semibold", alpha=a)
        if sub:
            c.text(c.w / 2, c.h / 2 + c.head * (0.65 * n + 0.6), sub, c.body, color=MUTED, alpha=ease((t - 0.6) / 0.3))
    return draw


def proof(head, big, sub=None, foot=None, big_color=GREEN, foot_color=YELLOW, count_to=None, fmt="{:.2f}s"):
    """Headline, one large number, a muted line under it, and an optional line that lands a beat later.
    With count_to, the big number counts up from zero to that value using fmt."""
    def draw(c, t):
        a = ease(t / 0.25)
        c.text(c.w / 2, c.h * 0.24, head, c.head, weight="semibold", alpha=a)
        shown = fmt.format(count_to * ease((t - 0.15) / 0.7)) if count_to is not None else big
        size = c.big if len(shown) <= 7 else c.big * 7 / len(shown)
        c.text(c.w / 2, c.h * 0.47, shown, size, color=big_color, family=MONO, weight="medium", alpha=a)
        if sub:
            c.text(c.w / 2, c.h * 0.47 + c.big * 0.72, sub, c.body, color=MUTED, alpha=a)
        if foot:
            c.text(c.w / 2, c.h * 0.80, foot, c.body * 1.1, color=foot_color, family=MONO, weight="medium",
                   alpha=ease((t - 1.2) / 0.3))
    return draw


def versus(head, left, right, foot=None):
    """Two labelled values side by side, e.g. what the platform says against what Snap says.
    left/right are (label, value, color)."""
    def draw(c, t):
        a = ease(t / 0.25)
        c.text(c.w / 2, c.h * 0.22, head, c.head, weight="semibold", alpha=a)
        for i, (label, value, color) in enumerate((left, right)):
            b = ease((t - 0.2 - i * 0.6) / 0.3)
            x = c.w * (0.28 if i == 0 else 0.72)
            c.text(x, c.h * 0.42, label, c.body, color=MUTED, alpha=b)
            c.text(x, c.h * 0.55, value, c.head * 1.2, color=color, family=MONO, weight="medium", alpha=b)
        if foot:
            c.text(c.w / 2, c.h * 0.80, foot, c.body, color=INK, alpha=ease((t - 1.2) / 0.3))
    return draw


def end():
    def draw(c, t):
        snap_logo.draw(c.ax, c.w, c.h, ease(t / 0.35), wide=not c.square)
    return draw


def _card_clip(w, h, draw, secs, path, frames, light=False):
    dpi = 100
    os.makedirs(frames, exist_ok=True)
    n = round(secs * FPS)
    for i in range(n):
        fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_xlim(0, w)
        ax.set_ylim(h, 0)
        ax.axis("off")
        ax.add_patch(Rectangle((0, 0), w, h, fc="#ffffff" if light else BG, ec="none", zorder=0))
        draw(Card(ax, w, h, dpi), i / FPS)
        fig.savefig(f"{frames}/f_{i:04d}.png")
        plt.close(fig)
    _encode(["-framerate", str(FPS), "-i", f"{frames}/f_%04d.png"], None, path)


def _tag(w, h, label, path):
    """Small dark pill at the bottom of the frame, over the page's own margin."""
    dpi = 100
    fig = plt.figure(figsize=(w / dpi, h / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    size = 24 if w > h else 22
    pw, ph = len(label) * size * 0.55 + 56, size * 1.8
    y = h - 34
    ax.add_patch(FancyBboxPatch((w / 2 - pw / 2, y - ph / 2), pw, ph, boxstyle=f"round,pad=0,rounding_size={ph / 2}",
                                fc="#0d0d0d", ec="none", alpha=0.88, zorder=2))
    text(ax, w / 2, y, label, size, dpi, color=INK, weight="medium")
    fig.savefig(path, transparent=True)
    plt.close(fig)


def _encode(inputs, filters, out):
    cmd = [FFMPEG, "-y", "-loglevel", "error", *inputs]
    if filters:
        cmd += ["-filter_complex", filters]
        if filters.endswith("[v]"):
            cmd += ["-map", "[v]"]
    cmd += ["-r", str(FPS), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-an", out]
    subprocess.run(cmd, check=True)


# ---- The cut --------------------------------------------------------------------------------------

def cut(name, take_prefix, out_dir, hook_card, cards, clip, tag="Real app · real time · no cuts",
        hook_s=2.5, end_s=3.0, poster_at=0.5, fast=None):
    """clip is (from_mark, lead_s, to_mark, tail_s): the recording kept, in real time.
    fast is (from_mark, offset_s, to_mark, offset_s, factor): one stretch inside the clip played
    `factor` times faster, with its own tag saying so. Everything else stays real time.
    cards are (draw, weight) after the recording; they share the time left in 20s by weight."""
    take = json.load(open(take_prefix + ".json"))
    w, h = take["size"]
    m = take["marks_s"]
    a, lead, b, tail = clip
    start = max(0.0, m[a] - lead)
    stop = min(m[b] + tail, m["end"])
    # (from, to, speed) pieces of the recording, in video seconds.
    pieces = [(start, stop, 1)]
    if fast:
        fa, fa_off, fb, fb_off, factor = fast
        f0, f1 = m[fa] + fa_off, m[fb] + fb_off
        pieces = [(start, f0, 1), (f0, f1, factor), (f1, stop, 1)]
    rec = sum((y - x) / s for x, y, s in pieces)
    left = TOTAL - hook_s - rec - end_s
    weights = sum(wt for _, wt in cards)
    assert left >= 1.8 * len(cards), f"{name}: recording is {rec:.1f}s, too long for {len(cards)} cards"

    tmp = f"{out_dir}/frames_{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    parts = [f"{tmp}/0.mp4"]
    _card_clip(w, h, hook_card, hook_s, parts[0], f"{tmp}/hook")
    for i, (x, y, s) in enumerate(pieces):
        label = tag if s == 1 else f"Real app · {s:g}× speed"
        _tag(w, h, label, f"{tmp}/tag{i}.png")
        p = f"{tmp}/r{i}.mp4"
        _encode(["-ss", f"{x:.3f}", "-t", f"{y - x:.3f}", "-i", take_prefix + ".webm", "-i", f"{tmp}/tag{i}.png"],
                f"[0:v]setpts=PTS/{s},fps={FPS},scale={w}:{h},setsar=1[r];[r][1:v]overlay=0:0", p)
        parts.append(p)
    for i, (draw, wt) in enumerate(cards):
        p = f"{tmp}/{i + 2}.mp4"
        _card_clip(w, h, draw, left * wt / weights, p, f"{tmp}/c{i}")
        parts.append(p)
    p = f"{tmp}/end.mp4"
    _card_clip(w, h, end(), end_s, p, f"{tmp}/end", light=True)
    parts.append(p)
    n = len(parts)
    _encode(sum([["-i", q] for q in parts], []),
            "".join(f"[{i}:v]setsar=1[s{i}];" for i in range(n)) + "".join(f"[s{i}]" for i in range(n))
            + f"concat=n={n}:v=1:a=0[v]", f"{tmp}/all.mp4")
    os.makedirs(out_dir, exist_ok=True)
    shutil.move(f"{tmp}/all.mp4", f"{out_dir}/{name}.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{hook_s + rec * poster_at:.2f}", "-i",
                    f"{out_dir}/{name}.mp4", "-frames:v", "1", f"{out_dir}/{name}-poster.png"], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"-> {out_dir}/{name}.mp4  (recording {rec:.2f}s of real time)")
