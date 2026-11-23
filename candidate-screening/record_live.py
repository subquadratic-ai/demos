"""Live Candidate Screening cut: the real Next.js page, recorded headless.

  npm run build && npm start &      # :3000, SUBQ_API_KEY in .env.local
  python record_live.py record      # one take per size into takes/ (needs Playwright)
  python record_live.py cut         # output/candidate-screening-live-16x9.mp4 and -1x1.mp4

Primary prop: speed. The sample job description and five sample resumes are
attached through the page's own file inputs (the .txt copies). One click
screens the pool; the page ranks it with per-requirement gates. Real speed, no
cuts. The time on the card is click to results on the page; tokens are the
page's own count.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:3000/")
DATA = f"{HERE}/sample-data"
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}
ZOOM = {"16x9": 1.3, "1x1": 1.0}
SCREEN = re.compile(r"^Screen \d* ?candidates")


def drive(page, mark):
    files = page.locator('input[type="file"]')
    files.first.wait_for(state="attached", timeout=30000)
    page.wait_for_timeout(800)
    files.nth(0).set_input_files(f"{DATA}/job-description.txt")
    page.wait_for_timeout(500)
    files.nth(1).set_input_files(sorted(f for f in glob.glob(f"{DATA}/*.txt") if "job-description" not in f))
    page.wait_for_timeout(1300)
    mark("start")
    page.get_by_role("button", name=SCREEN).click()
    page.get_by_text(re.compile(r"Results · \d+ ranked")).wait_for(timeout=120000)
    mark("done")
    # Down to the ranking, then through the cards to the third, where one gate fails.
    page.get_by_text(re.compile(r"Results · \d+ ranked")).evaluate(
        "e => e.scrollIntoView({behavior: 'smooth', block: 'start'})")
    page.wait_for_timeout(1700)
    # Sam's requirement checklist, top of the screen, so the one failed gate sits mid-frame.
    page.get_by_text(re.compile(r"Requirements · 6/7 met", re.I)).first.evaluate(
        "e => e.scrollIntoView({behavior: 'smooth', block: 'start'})")
    page.wait_for_timeout(1400)
    mark("gate")
    page.wait_for_timeout(1800)
    body = page.inner_text("body")
    tokens = int(re.search(r"(\d[\d,]*) tokens", body).group(1).replace(",", ""))
    ranked = re.findall(r"\n(\d)\n(.+)\n(ADVANCE|REVIEW|REJECT)\n", body)
    return {"tokens": tokens, "ranked": [{"rank": int(r), "name": n, "call": c} for r, n, c in ranked]}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        t = json.load(open(prefix + ".json"))
        secs = t["marks_s"]["done"] - t["marks_s"]["start"]
        n = len(t["ranked"]) or 5
        L.cut(f"candidate-screening-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["Rank the whole", "candidate pool"], "Every resume, every must-have"),
              [(L.proof("Whole pool, ranked", None, f"{n} resumes · 7 must-have gates each",
                        f"{t['tokens']:,} tokens", count_to=secs), 1.0),
               (L.proof("Typed answers, not text", "11", "judgments per candidate",
                        "Code owns the hiring rules", big_color=L.YELLOW), 0.9)],
              clip=("start", 1.0, "gate", 1.6), poster_at=0.6)


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"]:
        for tag, size in SIZES.items():
            if sys.argv[2:] and tag not in sys.argv[2:]:
                continue
            m = L.record(f"{HERE}/takes/live-{tag}", size, URL, drive, settle=0.2, zoom=ZOOM[tag])
            print(tag, m["marks_s"], {k: v for k, v in m.items() if k not in ("marks_s", "size")})
    elif sys.argv[1:] == ["cut"]:
        cut()
    else:
        sys.exit(__doc__)
