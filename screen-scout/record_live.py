"""Live Screen Scout cut: the real Streamlit app, recorded headless.

  uv run streamlit run app/streamlit_app.py --server.headless true &   # :8501, key in .env
  python record_live.py record      # one take per size into takes/
  python record_live.py cut         # output/screen-scout-live-16x9.mp4 and -1x1.mp4

Primary prop: accuracy. The pre-vetted Gacha Life example: YouTube marks the
30-minute video Family Safe; Snap reads the whole transcript, window by
window, and recommends 16+ for romantic content, with the moment it flagged.
Every number on the cards is read off the page at the end of the take.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:8501/?embed=true")
EXAMPLE = "Gacha Life love story"
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}
ZOOM = {"16x9": 1.6, "1x1": 1.5}  # Streamlit's type is small; same as Cmd-+ in a browser


def drive(page, mark):
    page.get_by_role("button", name=EXAMPLE).wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    mark("start")
    page.get_by_role("button", name=EXAMPLE).click()
    # The transcript download from YouTube ends where Snap's progress bar starts; time Snap from there.
    page.get_by_text(re.compile(r"Analyzing: Snap chunk")).first.wait_for(timeout=60000)
    mark("snap")
    page.get_by_text("Snap recommends").first.wait_for(timeout=180000)
    mark("done")
    page.wait_for_timeout(300)
    # Bring the verdict up next to YouTube's own label, and hold on it.
    page.get_by_text("Snap recommends").first.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    page.wait_for_timeout(2000)
    mark("verdict")
    # Scroll to the first window Snap flagged, smoothly, like a reader would.
    flagged = page.get_by_text(re.compile(r"Romantic / sexual content \d+%")).nth(1)
    flagged.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    page.wait_for_timeout(1200)
    mark("flag")
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    rec = re.search(r"Snap recommends ages (\d+\+)", body)
    yt = re.search(r"YouTube says: ([^·\n]+)", body)
    chunks = re.search(r"(\d+)s · (\d+) chunks", body)
    flag = re.search(r"Romantic / sexual content · (\d+)%", body)
    return {"snap_age": rec.group(1), "youtube": yt.group(1).strip(), "seconds": int(chunks.group(1)),
            "chunks": int(chunks.group(2)), "romantic_pct": int(flag.group(1))}


def cut():
    for tag, (w, h) in SIZES.items():
        prefix = f"{HERE}/takes/live-{tag}"
        t = __import__("json").load(open(prefix + ".json"))
        secs = t["marks_s"]["done"] - t["marks_s"]["snap"]  # Snap reading, not the YouTube download
        mins = round(t["seconds"] / 60)
        L.cut(f"screen-scout-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["Family Safe,", "says YouTube"], "Snap reads the whole transcript"),
              [(L.versus("Same 30-minute video", ("YouTube", t["youtube"], L.GREEN),
                         ("Snap", f"Ages {t['snap_age']}", L.RED),
                         f"Romantic content: {t['romantic_pct']}%"), 1.0),
               (L.proof(f"{mins} minutes, read in", None, f"{t['chunks']} transcript windows, every one",
                        count_to=secs), 1.0)],
              clip=("start", 0.6, "flag", 1.6),
              # The 30 transcript windows go by at 4×, labelled on screen; the click, the verdict
              # and the scroll to the flagged moment stay real time. The card shows the real seconds.
              fast=("start", 1.2, "done", -0.3, 4))


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"]:
        for tag, size in SIZES.items():
            if sys.argv[2:] and tag not in sys.argv[2:]:
                continue
            m = L.record(f"{HERE}/takes/live-{tag}", size, URL, drive, settle=0.3, zoom=ZOOM[tag])
            print(tag, m["marks_s"], {k: v for k, v in m.items() if k not in ("marks_s", "size")})
    elif sys.argv[1:] == ["cut"]:
        cut()
    else:
        sys.exit(__doc__)
