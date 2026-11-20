"""Live Policy Check cut: the real Next.js page, recorded headless.

  npm run dev &                     # :3000, SNAP_API_KEY in .env.local
  python record_live.py record      # one take per size into takes/ (needs Playwright)
  python record_live.py cut         # output/policy-check-live-16x9.mp4 and -1x1.mp4

Primary prop: long context. The page's own opening claim, "Guaranteed 5% return",
checked against the whole 380-page synthetic rulebook in one request. The
recording runs at real speed, no cuts. Every number on the cards is read off
the page's own result line at the end of the take.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:3000/")
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}
ZOOM = {"16x9": 1.15, "1x1": 1.0}


def drive(page, mark):
    page.get_by_role("button", name="Check").wait_for(timeout=30000)
    page.wait_for_timeout(1800)
    mark("start")
    page.get_by_role("button", name="Check").click()
    page.get_by_text("to decide").first.wait_for(timeout=120000)
    mark("done")
    page.wait_for_timeout(3500)  # the answer, the quoted clause and the numbers settle
    mark("read")
    body = page.inner_text("main")
    labels = "pages read|clauses compared|requests|tokens|to decide"
    nums = {k: v for k, v in re.findall(rf"({labels})\s*\n\s*([\d,.]+s?)\s*(?:\n|$)", body)}
    nums.update({k: v for v, k in re.findall(rf"(?:^|\n)\s*([\d,.]+s?)\s*\n\s*({labels})", body) if k not in nums})
    verdict = re.search(r"\n(Yes|No|Unclear)\n", body).group(1)
    clause = re.search(r"It breaks clause ([\d.]+)", body)
    return {"verdict": verdict, "clause": clause.group(1) if clause else None,
            "pages": int(nums["pages read"]), "clauses": int(nums["clauses compared"]),
            "requests": int(nums["requests"]), "tokens": int(nums["tokens"].replace(",", "")),
            "seconds": float(nums["to decide"].rstrip("s"))}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        t = json.load(open(prefix + ".json"))
        L.cut(f"policy-check-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["Is this ad", "in policy?"], "Snap reads the whole rulebook"),
              [(L.proof("The whole policy, in context", f"{t['tokens']:,}",
                        f"tokens · {t['pages']} pages · {t['requests']} requests", big_color=L.YELLOW), 1.0),
               (L.proof("Clause found, quoted, decided", None, f"{t['clauses']} clauses compared",
                        f"It breaks clause {t['clause']}", count_to=t["seconds"]), 1.1)],
              clip=("start", 1.0, "read", 0.0), poster_at=0.75)


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
