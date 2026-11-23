"""Screen-record one real race in the running app, for the social cut.

  uv run listing-match-app &                      # the app on :8001, with both keys in .env
  python scripts/record_race.py --rival openai/gpt-6-luna --size 1920x1080 --out output/takes/luna-16x9
  python scripts/record_race.py --rival "" --size 1080x1080 --out output/takes/subq-1x1   # SubQ alone

Needs Playwright (`pip install playwright && playwright install chromium`); it is
not an app dependency. Drives the page the way a person would: opens Edit search,
picks the rival, closes the drawer, presses Enter. Nothing on the page is changed.
Writes <out>.webm, the page exactly as it rendered, and <out>.json, the lanes'
own lane_done totals read back from the page plus where in the video the run
started and each lane finished.

Do a warm-up run first (see README): the first SubQ request after an idle spell
is slow. --warmup runs one unrecorded SubQ-only race before the take.
"""
import argparse
import json
import os
import shutil
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("APP_URL", "http://localhost:8001/")


def all_done(page):
    return page.evaluate("() => !!run && Object.values(run.lanes).every(l => l.done)")


def warmup(browser):
    page = browser.new_page()
    page.goto(URL + "?autorun")
    page.wait_for_function("() => !!run && Object.values(run.lanes).every(l => l.done)", timeout=60000)
    page.close()


def take(browser, rival, w, h, out, settle):
    tmp = out + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    ctx = browser.new_context(viewport={"width": w, "height": h}, record_video_dir=tmp,
                              record_video_size={"width": w, "height": h})
    t0 = time.monotonic()  # the video starts with the page
    page = ctx.new_page()
    page.goto(URL)
    page.wait_for_function("() => document.querySelectorAll('.tile').length > 0", timeout=30000)
    # Pick the rival in the drawer, like a person would.
    page.click("#tweak")
    page.check(f'#models input[value="{rival}"]')
    page.wait_for_timeout(600)  # the preview reloads with the rival's lane
    page.click("#closeDrawer")
    page.wait_for_function("() => document.querySelectorAll('.lane').length === %d" % (2 if rival else 1), timeout=15000)
    page.wait_for_function("() => [...document.querySelectorAll('.tile .ph')].length > 0", timeout=15000)
    page.wait_for_timeout(1500)  # photos paint
    # The page's startup toast (e.g. "Add OPENROUTER_API_KEY…" on a SubQ-only box) clears itself after 6s.
    page.wait_for_function("() => !document.querySelector('.toast')", timeout=15000)
    page.wait_for_timeout(1000)
    start = time.monotonic() - t0
    page.keyboard.press("Enter")
    finished = {}
    deadline = time.time() + 120
    while time.time() < deadline:
        state = page.evaluate("() => run ? Object.fromEntries(Object.entries(run.lanes).map(([k, l]) => [k, l.done])) : {}")
        for lane, done in state.items():
            if done and lane not in finished:
                finished[lane] = round(time.monotonic() - t0, 2)
        if state and all(state.values()):
            break
        page.wait_for_timeout(50)
    page.wait_for_timeout(int(settle * 1000))  # the matches move into the carousel
    totals = page.evaluate("() => Object.fromEntries(Object.entries(run.lanes).map(([k, l]) => [k, {name: l.name || k, kind: l.kind, totals: l.totals, matches: l.matches, total: l.total}]))")
    end = time.monotonic() - t0
    video = page.video.path()
    ctx.close()
    shutil.move(video, out + ".webm")
    shutil.rmtree(tmp, ignore_errors=True)
    meta = {"rival": rival, "size": [w, h], "run_start_s": round(start, 2), "lane_finished_s": finished,
            "video_end_s": round(end, 2), "lanes": totals, "recorded": time.strftime("%Y-%m-%d %H:%M")}
    json.dump(meta, open(out + ".json", "w"), indent=2)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rival", default="openai/gpt-6-luna", help='OpenRouter model id, or "" for SubQ alone')
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", required=True)
    ap.add_argument("--settle", type=float, default=3.0)
    ap.add_argument("--warmup", action="store_true")
    a = ap.parse_args()
    w, h = map(int, a.size.split("x"))
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        if a.warmup:
            warmup(browser)
        meta = take(browser, a.rival, w, h, a.out, a.settle)
        browser.close()
    print(json.dumps({k: meta[k] for k in ("run_start_s", "lane_finished_s", "video_end_s")}))
    for k, v in meta["lanes"].items():
        t = v["totals"] or {}
        print(f"  {k:<28} wall={t.get('wall')} cost={t.get('cost')} matches={v['matches']}/{v['total']}")


if __name__ == "__main__":
    main()
