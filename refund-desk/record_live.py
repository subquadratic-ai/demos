"""Live Refund Desk cut: the real Next.js page, recorded headless.

  npm run build && npm start &      # :3000, SUBQ_API_KEY in .env.local
  python record_live.py record      # one take per size into takes/ (needs Playwright)
  python record_live.py cut         # output/refund-desk-live-16x9.mp4 and -1x1.mp4

Primary prop: accuracy. Avery Chen's purchase is 45 days old; the handbook's
window is 30 days, but Avery's signed agreement allows 60. Snap approves and
names that clause. Then the clause is removed in the document viewer and the
same file runs again: Snap declines and names the handbook's 30-day window.
Both results stay side by side on the page. Real speed, no cuts. Numbers on
the card are the page's own (response time, input tokens, estimated cost).
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
ZOOM = {"16x9": 1.2, "1x1": 1.0}  # 1.2 keeps the three columns and reads on a phone


def selected(page):
    return re.findall(r"Selected action\s*\n\s*(.+)", page.inner_text("body"))


def show(locator, wait=900):
    """Scroll something into view smoothly, as a person would. A no-op when it is already on screen."""
    locator.evaluate("e => { const r = e.getBoundingClientRect();"
                     " if (r.top < 0 || r.bottom > innerHeight) e.scrollIntoView({behavior: 'smooth', block: 'center'}) }")
    page = locator.page
    page.wait_for_timeout(wait)


def drive(page, mark):
    run = page.get_by_role("button", name="Run decision")
    run.wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    mark("start")
    run.click()
    page.wait_for_function("() => (document.body.innerText.match(/Selected action/g) || []).length >= 1", timeout=60000)
    mark("first")
    # On a narrow (square) window the decision panel stacks below the documents.
    show(page.get_by_text("Selected action").first, 700)
    page.wait_for_timeout(1500)
    # Remove the customer's 60-day clause, the way a presenter would: scroll to it, click.
    remove = page.get_by_role("button", name="Remove exception")
    show(remove)
    remove.click()
    mark("removed")
    page.wait_for_timeout(700)
    show(run, 700)
    run.click()
    page.wait_for_function("() => (document.body.innerText.match(/Selected action/g) || []).length >= 2", timeout=60000)
    mark("second")
    show(page.get_by_text("Selected action").nth(1), 700)
    if page.viewport_size["width"] > page.viewport_size["height"]:
        page.evaluate("() => window.scrollTo({top: 0, behavior: 'smooth'})")
    page.wait_for_timeout(2200)
    mark("read")
    body = page.inner_text("body")
    ms = [int(x.replace(",", "")) for x in re.findall(r"Response time\s*\n\s*([\d,]+)\s*ms", body)]
    tokens = [int(x.replace(",", "")) for x in re.findall(r"Input tokens\s*\n\s*([\d,]+)", body)]
    cost = re.findall(r"Estimated input cost\s*\n\s*\$([\d.]+)", body)
    return {"actions": selected(page), "response_ms": ms, "input_tokens": tokens, "cost_usd": [float(c) for c in cost]}


def cut():
    for tag in SIZES:
        prefix = f"{HERE}/takes/live-{tag}"
        t = json.load(open(prefix + ".json"))
        ms = max(t["response_ms"])
        L.cut(f"refund-desk-live-{tag}", prefix, f"{HERE}/output",
              L.hook(["45 days.", "Refund or not?"], "Snap reads the policy and the contract"),
              [(L.versus("Same file, one clause removed", ("With the clause", "Approve", L.GREEN),
                         ("Without it", "Decline", L.RED), "Each call names the section it used"), 1.0),
               (L.proof("Each decision", f"{ms} ms", f"{t['input_tokens'][0]:,} tokens · 14 documents",
                        f"${t['cost_usd'][0]:.5f} per decision"), 1.0)],
              clip=("start", 0.8, "read", 0.0), hook_s=2.3, poster_at=0.85)


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
