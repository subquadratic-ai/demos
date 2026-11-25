"""Live Context Curation cut: the curation page, recorded headless.

  python curate.py --fetch && python server.py &   # :8090, SUBQ_API_KEY in live/.env
  python record_live.py record                     # one take per size into takes/ (needs Playwright)
  python record_live.py cut                        # ../output/context-curation-live-16x9.mp4 and -1x1.mp4

Primary prop: long context. The whole public true-myth repository (89 files,
about 246K tokens) and one task go to Snap in one request; Snap scores every
file; the kept files go back for line ranges. Real speed, no cuts. The token
counts, seconds, kept files and line counts on the cards are the page's own
results from the take (takes/*.json). The 48% line is the earlier DeepSWE agent
trial in ../README.md, labelled as such: this take measures curation, not an
agent run.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from brand import live_cut as L  # noqa: E402

URL = os.environ.get("APP_URL", "http://localhost:8090/")
OUT = os.path.join(os.path.dirname(HERE), "output")
SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080)}


def drive(page, mark):
    page.wait_for_function("() => document.querySelectorAll('.tile').length > 0", timeout=30000)
    page.wait_for_timeout(1500)
    mark("start")
    page.click("#run")
    page.wait_for_function("() => document.querySelectorAll('.tile.scored').length > 0", timeout=180000)
    mark("pass1")
    page.wait_for_function("() => !!window.__result", timeout=180000)
    mark("done")
    page.wait_for_timeout(2600)
    mark("read")
    r = page.evaluate("() => window.__result")
    return {"files": r["files"], "repo_lines": r["repoLines"], "kept": r["kept"], "ranges": r["ranges"],
            "pass1": {"seconds": r["p1"]["seconds"], "tokens": r["p1"]["usage"]["input_tokens"]},
            "pass2": {"seconds": r["p2"]["seconds"], "tokens": r["p2"]["usage"]["input_tokens"]},
            "packet_lines": r["p2"]["packet"]["lines"]}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        t = json.load(open(prefix + ".json"))
        pct = t["packet_lines"] / t["repo_lines"] * 100
        L.cut(f"context-curation-live-{tag}", prefix, OUT,
              L.hook(["Which code does", "the agent need?"], "Snap reads the whole repo first"),
              [(L.proof("Whole repo, one request", f"{t['pass1']['tokens']:,}",
                        f"tokens · {t['files']} files · {t['pass1']['seconds']:.2f}s", big_color=L.YELLOW), 1.0),
               (L.proof("The agent starts from", f"{pct:.1f}%",
                        f"{t['packet_lines']:,} of {t['repo_lines']:,} lines · {len(t['kept'])} files",
                        "Earlier agent trial: 48% fewer tokens"), 1.1)],
              clip=("start", 1.0, "read", 0.0), poster_at=0.7)


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"]:
        for tag, size in SIZES.items():
            if sys.argv[2:] and tag not in sys.argv[2:]:
                continue
            m = L.record(f"{HERE}/takes/live-{tag}", size, URL, drive, settle=0.2)
            print(tag, m["marks_s"], {k: v for k, v in m.items() if k not in ("marks_s", "size")})
    elif sys.argv[1:] == ["cut"]:
        cut()
    else:
        sys.exit(__doc__)
