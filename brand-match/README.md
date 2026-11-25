# Brand match

Rank a brand's whole asset library against a new customer upload, with SubQ Snap, in one request.

Fernwell is a fictional healthy-living brand: written guidelines and a 250-asset library, each asset a
text description of a photo (what an image-to-text model would write). About one in eight assets is
deliberately off-brand. `data/build.py` generates the library deterministically into `data/library.json`.

One request (`rank.py`) carries the guidelines and the upload and asks:

- `match`: one choice over all 250 assets. Snap returns a probability for every asset, so the ranking is
  those probabilities, sorted in code.
- `on_brand`: one yes/no. Below 0.5, the page holds the upload instead of tagging it.

```bash
printf "SUBQ_API_KEY=sk-...\n" > .env
python rank.py          # top ten in the terminal
python server.py        # the page, http://localhost:8091
```

Measured 2026-11-20 on `subq-snap-latest`: about 0.5 s and 7,368 tokens per request. The market-ride upload
tags to FW-212 (p 0.72–0.89 across runs; the runner-up is the same scene in evening light), on-brand 0.9997. The same
ride with beer and donuts matches the same scene but scores on-brand 0.003, so it is held.

## Requirements

Python 3.11+ (tested on 3.12). `rank.py` and `server.py` use the standard library only. Recording and
cutting the video (`record_live.py`) also needs `pip install -r requirements.txt` (matplotlib, numpy,
Pillow, Playwright), then `python -m playwright install chromium`, and ffmpeg on `PATH` (or set
`FFMPEG` to its path). `server.py` takes an optional port: `python server.py 8095`, and
`APP_URL=http://localhost:8095/ python record_live.py record` records from it. The server binds to
127.0.0.1 only.

`output/brand-match-live-16x9.mp4` and `-1x1.mp4` are 20-second cuts recorded from the page
(`record_live.py`, using `brand/live_cut.py`).
