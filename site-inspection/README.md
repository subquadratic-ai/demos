# Site inspection

Check construction photos against a written site safety policy, with SubQ Snap.

- `data/policy.md`: a fictional 23-rule policy (PPE, fall protection, ladders, scaffolds, trenches, rigging).
- `data/photos/`: eight NIOSH photos, public domain (US government), from Wikimedia Commons. Credits and
  source links are in `data/photos.json`.

`inspect_photos.py` sends one request per photo, all at once. Each carries the whole policy as state and
the photo in the request's `images` field, and asks one choice over every rule plus "none" (which rule is
broken?) and one yes/no (does the work follow the rules?). The verdict is computed in code: flagged below 0.5.

```bash
printf "SUBQ_API_KEY=sk-...\n" > .env
python inspect_photos.py          # the four photos the page shows
python inspect_photos.py --all    # all eight
python server.py                  # the page, http://localhost:8092
```

Measured 2026-11-20: the four page photos in 3.0–3.6 s, about 2,400 tokens each.

| Photo | Result |
|---|---|
| Workers at height, no fall protection | flagged, 2.1 Six-foot rule (conforms 0.18–0.19) |
| Framer on a ladder with fall arrest | follows the rules (0.54–0.58) |
| Frayed web sling | flagged, 6.2 Damaged slings (0.03; rule p 0.94) |
| Ladder in a trench, training day | follows the rules (0.54–0.56) |

Why four, not eight. Of the other four, three are framing photos with workers at or near the top of a
stepladder. Snap flagged them under 3.2 or 2.2, which is defensible but borderline. The fourth is an
eyebolt that NIOSH captions as improper, but its defect isn't visible in the photo, and Snap cleared it.
The page shows the four whose right answer is clear from the photo itself.

Snap takes up to four images per request. One request with all four photos gives the same verdicts, in
6–8 s. Four requests at once is faster, so the page uses that.

## Requirements

Python 3.11+ (tested on 3.12). `inspect_photos.py` and `server.py` use the standard library only. Recording and
cutting the video (`record_live.py`) also needs `pip install -r requirements.txt` (matplotlib, numpy,
Pillow, Playwright), then `python -m playwright install chromium`, and ffmpeg on `PATH` (or set
`FFMPEG` to its path). `server.py` takes an optional port: `python server.py 8095`, and
`APP_URL=http://localhost:8095/ python record_live.py record` records from it. The server binds to
127.0.0.1 only.

`output/site-inspection-live-16x9.mp4` and `-1x1.mp4` are 20-second cuts recorded from the page
(`record_live.py`, using `brand/live_cut.py`).
