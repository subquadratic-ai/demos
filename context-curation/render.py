"""Render the 5-second split-screen clip from series.json (real per-request data; see extract.py).

  /mnt/data/ashmal/conductor/.venv/bin/python render.py         -> frames/ + demo.mp4 + poster.png

Time axis = request index (both sides advance at the same requests per second), not wall-clock time.
Shows file names and counts only; no repository source. The decision model is named generically.
"""
import json
import os
import shutil
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
for f in os.listdir(f"{HERE}/fonts"):
    if f.endswith(".ttf"):
        font_manager.fontManager.addfont(f"{HERE}/fonts/{f}")
SANS, MONO = "IBM Plex Sans", "IBM Plex Mono"

W, H, FPS, N_FRAMES = 1920, 1080, 30, 150
T0, T_END = 8, 98            # timeline frames: both sides advance 110 requests over T_END - T0 frames
HOLD_END, END_CARD = 108, 108  # end card fades in from frame 108 to the end (frame 150 = 5.0 s)

BG, PANEL, INK, MUTED, FAINT, LINE = "#0d0f13", "#151820", "#eef0f4", "#8b929d", "#4a505b", "#252a33"
LEFT_C, RIGHT_C, GREEN = "#e0803f", "#4d9cf2", "#3ccf7e"
CTX_MAX, TOK_MAX = 130_000, 6.0e6

S = json.load(open(f"{HERE}/series.json"))
ARMS = [
    dict(key="alone", x0=40, title="Agent alone", sub="Claude Code explores the repository on its own", color=LEFT_C),
    dict(key="spec", x0=1000, title="Agent + decision model", sub="A decision model answers 5 questions first", color=RIGHT_C),
]
RATE = len(S["alone"]) / (T_END - T0)   # requests per frame, identical on both sides
PW = 880                                 # panel width
SLOT = (PW - 60) / len(S["alone"])       # px per request in the request strip (shared)
PACKET_REQ = next(i for i, r in enumerate(S["spec"]) if "snapit_spec" in r["kinds"])
PACKET_FILES = [("src/maybe.ts", "lines 67–300"), ("src/toolbelt.ts", "lines 1–30"), ("src/task.ts", "lines 75–223"),
                ("src/result.ts", "")]


def ease(t):
    t = min(1, max(0, t))
    return 1 - (1 - t) ** 3


def fmt_m(x):
    return f"{x / 1e6:.2f}M"


def text(ax, x, y, s, size, color=INK, weight="regular", family=SANS, ha="left", va="baseline", alpha=1.0, z=3):
    ax.text(x, y, s, fontsize=size * 0.75, color=color, fontweight=weight, family=family, ha=ha, va=va, alpha=alpha, zorder=z)


def rbox(ax, x, y, w, h, fc, ec="none", r=14, lw=1.0, alpha=1.0):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}", fc=fc, ec=ec, lw=lw, alpha=alpha))


def panel(ax, arm, frame):
    ser, x0, col = S[arm["key"]], arm["x0"], arm["color"]
    progress = max(0.0, (frame - T0) * RATE)          # requests completed (float)
    n_done = min(len(ser), int(progress))
    done = n_done >= len(ser)
    cum = sum(r["ctx"] for r in ser[:n_done])
    if not done and n_done < len(ser):                  # smooth counter inside the current request
        cum += ser[n_done]["ctx"] * (progress - n_done)
    reads = [f for r in ser[:n_done] for f in r["reads"]]

    rbox(ax, x0, 110, PW, 930, PANEL, r=22)
    ax.add_patch(Rectangle((x0 + 30, 140), 6, 40, fc=col, ec="none"))
    text(ax, x0 + 50, 172, arm["title"], 40, weight="semibold")
    text(ax, x0 + 50, 210, arm["sub"], 20, color=MUTED)

    # block A: the decision-model packet (right) or nothing (left)
    by, bh = 240, 240
    if arm["key"] == "alone":
        rbox(ax, x0 + 30, by, PW - 60, bh, "none", ec=LINE, r=16, lw=1.5)
        text(ax, x0 + PW / 2, by + bh / 2 + 8, "No packet: it searches and reads files itself", 21, color=FAINT, ha="center")
    else:
        t_pkt = T0 + PACKET_REQ / RATE
        if frame < t_pkt:
            rbox(ax, x0 + 30, by, PW - 60, bh, "none", ec=LINE, r=16, lw=1.5)
            dots = "." * (1 + (frame // 4) % 3)
            text(ax, x0 + PW / 2, by + bh / 2 + 8, f"Asking the decision model{dots}", 21, color=MUTED, ha="center")
        else:
            a = ease((frame - t_pkt) / 6)
            yy = by + (1 - a) * 18
            rbox(ax, x0 + 30, yy, PW - 60, bh, "#16243a", ec=col, r=16, lw=2, alpha=a)
            text(ax, x0 + 56, yy + 42, "DECISION MODEL", 17, color=col, weight="semibold", alpha=a)
            text(ax, x0 + 250, yy + 42, "5 questions answered  ·  7 kB packet", 17, color=MUTED, alpha=a)
            for i, (f, rng) in enumerate(PACKET_FILES):
                ly = yy + 92 + i * 36
                text(ax, x0 + 56, ly, f, 21, family=MONO, alpha=a)
                text(ax, x0 + 330, ly, rng, 21, family=MONO, color=MUTED, alpha=a)
            text(ax, x0 + 560, yy + 128, "4 files named,", 18, color=MUTED, alpha=a)
            text(ax, x0 + 560, yy + 156, "with line ranges", 18, color=MUTED, alpha=a)

    # counter
    text(ax, x0 + 30, 578, fmt_m(cum), 88, family=MONO, weight="medium", color=INK)
    text(ax, x0 + 34, 614, "LLM input tokens", 20, color=MUTED)
    if done:
        a = ease((frame - (T0 + len(ser) / RATE)) / 5)
        rbox(ax, x0 + PW - 300, 522, 270, 64, GREEN, r=32, alpha=a)
        text(ax, x0 + PW - 165, 564, "✓ 96/96 tests pass", 22, color="#06210f", weight="semibold", ha="center", alpha=a)

    # cumulative token bar, shared scale
    bx, bw, bty = x0 + 30, PW - 60, 640
    rbox(ax, bx, bty, bw, 16, "#20242d", r=8)
    rbox(ax, bx, bty, max(16, bw * cum / TOK_MAX), 16, col, r=8)

    # request strip: one tick per request, height = context size; same px per request on both sides
    base = 812
    for i, r in enumerate(ser[:n_done + 1]):
        if i >= len(ser):
            break
        f = 1.0 if i < n_done else (progress - n_done)
        h = 125 * min(1, r["ctx"] / CTX_MAX) * ease(f)
        c = col if "snapit_spec" not in r["kinds"] else "#bfe0ff"
        ax.add_patch(Rectangle((x0 + 30 + i * SLOT, base - h), SLOT - 2, h, fc=c, ec="none", alpha=0.95))
    ax.plot([x0 + 30, x0 + PW - 30], [base + 1, base + 1], color=LINE, lw=1)
    text(ax, x0 + 30, 852, f"{n_done}", 26, family=MONO, weight="medium")
    text(ax, x0 + 30 + 18 * len(str(n_done)) + 12, 852, "model requests  (bar height = context size)", 18, color=MUTED)

    # file-read ticker
    text(ax, x0 + 30, 904, f"{len(reads)}", 26, family=MONO, weight="medium")
    text(ax, x0 + 30 + 18 * len(str(len(reads))) + 12, 904, "file reads", 18, color=MUTED)
    recent = [f for f in reads if f != "(file)"][-3:][::-1]
    for j, f in enumerate(recent):
        nm = f if len(f) <= 46 else "…" + f[-45:]
        text(ax, x0 + 30, 948 + j * 32, nm, 19, family=MONO, color=INK if j == 0 else MUTED, alpha=1.0 - 0.3 * j)


def frame_fig(frame):
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")
    fig.patch.set_facecolor(BG)
    text(ax, W / 2, 66, "Same task, same model: add iterator helpers to a 56-file TypeScript repo  ·  Claude Code, Sonnet 5",
         20, color=MUTED, ha="center")
    for arm in ARMS:
        panel(ax, arm, frame)
    if frame >= END_CARD:
        a = ease((frame - END_CARD) / 8)
        ax.add_patch(Rectangle((0, 0), W, H, fc=BG, ec="none", alpha=a, zorder=10))
        text(ax, W / 2, 470, "Same result.", 76, weight="bold", ha="center", alpha=a, z=11)
        text(ax, W / 2, 570, "48% fewer input tokens, on this task.", 64, weight="semibold", color=RIGHT_C, ha="center", alpha=a, z=11)
        text(ax, W / 2, 660, "5.91M → 3.06M LLM input tokens   ·   110 → 32 requests   ·   46 → 15 file reads   ·   both 96/96",
             24, family=MONO, color=MUTED, ha="center", alpha=a, z=11)
        text(ax, W / 2, 712, "One real trial per arm (DeepSWE task true-myth-iterable-collection-combinators).", 20, color=FAINT,
             ha="center", alpha=a, z=11)
    return fig


def main():
    out = f"{HERE}/frames"
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for i in range(N_FRAMES):
        fig = frame_fig(i)
        fig.savefig(f"{out}/frame_{i:04d}.png", facecolor=BG)
        plt.close(fig)
    shutil.copy(f"{out}/frame_{T_END + 6:04d}.png", f"{HERE}/poster.png")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{out}/frame_%04d.png",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", f"{HERE}/demo.mp4"],
                   check=True)
    print(f"-> {HERE}/demo.mp4 ({N_FRAMES} frames, {N_FRAMES / FPS:.1f} s), poster.png; packet at request {PACKET_REQ}, "
          f"{RATE:.2f} requests/frame")


if __name__ == "__main__":
    main()
