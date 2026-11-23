"""Live brand-match cut: the brand-match page, recorded headless.

  python server.py &               # :8091, SUBQ_API_KEY in brand-match/.env
  python record_live.py record     # one take per size into takes/ (needs Playwright)
  python record_live.py cut        # output/brand-match-live-16x9.mp4 and -1x1.mp4

Primary prop: speed. One request ranks the whole 250-asset library of a
fictional healthy-living brand against a customer upload, and checks the upload
against the brand guidelines. Then the same ride with beer and donuts in the
basket: the match is the same scene, but the guideline check holds it. Real
speed, no cuts. Every number on the cards is the page's own result (takes/*.json).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:8091/")
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}


def drive(page, mark):
    page.wait_for_function("() => document.querySelectorAll('.a').length === 250", timeout=30000)
    page.wait_for_timeout(1500)
    mark("start")
    page.click("#run")
    page.wait_for_function("() => (window.__results || []).length >= 1", timeout=60000)
    mark("first")
    page.wait_for_timeout(2400)
    page.click(".pick[data-i='1']")
    page.wait_for_timeout(900)
    mark("second_start")
    page.click("#run")
    page.wait_for_function("() => (window.__results || []).length >= 2", timeout=60000)
    mark("second")
    page.wait_for_timeout(2400)
    mark("read")
    return {"runs": page.evaluate("() => window.__results")}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        t = json.load(open(prefix + ".json"))
        on, off = t["runs"][0], t["runs"][1]
        L.cut(f"brand-match-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["Which brand asset", "fits this post?"], "Snap ranks the whole library"),
              [(L.proof(f"{on['candidates']} assets, one request", None, f"every asset scored · {on['tokens']:,} tokens",
                        f"top match p {on['top'][0]['p']:.2f}", count_to=on["seconds"]), 1.0),
               (L.versus("Same ride, different basket", ("Peaches", "Tag it", L.GREEN), ("Beer, donuts", "Hold", L.RED),
                         f"on-brand p {on['on_brand']:.2f} vs {off['on_brand']:.3f}"), 1.0)],
              clip=("start", 1.0, "read", 0.0), poster_at=0.3)


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"]:
        for tag, size in SIZES.items():
            if sys.argv[2:] and tag not in sys.argv[2:]:
                continue
            m = L.record(f"{HERE}/takes/live-{tag}", size, URL, drive, settle=0.2)
            print(tag, m["marks_s"], [(r["seconds"], r["on_brand"], r["top"][0]["id"]) for r in m["runs"]])
    elif sys.argv[1:] == ["cut"]:
        cut()
    else:
        sys.exit(__doc__)
