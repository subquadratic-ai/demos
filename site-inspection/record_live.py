"""Live site-inspection cut: the inspection page, recorded headless.

  python server.py &               # :8092, SUBQ_API_KEY in site-inspection/.env
  python record_live.py record     # one take per size into takes/ (needs Playwright)
  python record_live.py cut        # output/site-inspection-live-16x9.mp4 and -1x1.mp4

Primary prop: multimodal. Four public-domain NIOSH construction photos, each
checked against a fictional 23-rule site safety policy, four Snap requests at
once. Two are flagged with the rule they break; two follow the rules. Real
speed, no cuts. Every number on the cards is the page's own result (takes/*.json).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:8092/")
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}


def drive(page, mark):
    page.wait_for_function("() => document.querySelectorAll('.ph').length === 4", timeout=30000)
    page.wait_for_timeout(1800)  # photos paint
    mark("start")
    page.click("#run")
    page.wait_for_function("() => !!window.__result", timeout=120000)
    mark("done")
    page.wait_for_timeout(3600)
    mark("read")
    return {"result": page.evaluate("() => window.__result")}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        r = json.load(open(prefix + ".json"))["result"]
        flags = [x for x in r["photos"] if x["flagged"]]
        L.cut(f"site-inspection-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["Do these photos follow", "the site rules?"], "Snap reads the photo and the rule book"),
              [(L.proof(f"{len(r['photos'])} photos, {r['rules']} rules", None,
                        f"{len(r['photos'])} requests at once · {r['photos'][0]['tokens']:,} tokens each",
                        f"{len(flags)} flagged, {len(r['photos']) - len(flags)} cleared", count_to=r["wall_s"]), 1.0),
               (L.versus("Each flag names its rule", ("No fall protection", "Rule " + flags[0]["rule_short"].split()[0], L.RED),
                         ("Frayed sling", "Rule " + flags[1]["rule_short"].split()[0], L.RED),
                         f"{flags[0]['rule_short']} · {flags[1]['rule_short']}"), 1.0)],
              clip=("start", 1.0, "read", 0.0), poster_at=0.75)


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"]:
        for tag, size in SIZES.items():
            if sys.argv[2:] and tag not in sys.argv[2:]:
                continue
            m = L.record(f"{HERE}/takes/live-{tag}", size, URL, drive, settle=0.2)
            r = m["result"]
            print(tag, m["marks_s"], r["wall_s"], [(x["flagged"], x["conforms"], x["rule_short"]) for x in r["photos"]])
    elif sys.argv[1:] == ["cut"]:
        cut()
    else:
        sys.exit(__doc__)
