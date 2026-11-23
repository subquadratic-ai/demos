# Screen Scout

Age-appropriate content checker for streaming shows and YouTube videos.
Powered by SubQ Snap.

Snap reads a transcript (per 60-second window or per-chapter chunk) and
returns calibrated probabilities for profanity, violence, scary content,
sexual content, substance use, difficult themes, hidden ads, and
AI-generated content signals. Plus age-gate probabilities for `<6`,
`6-9`, `10-12`, `13+`.

The app ships four pre-vetted public YouTube examples, each a different
age-tier claim:

- **Blippi** — clean educational content. Expected: all low, age 3+. The
  "we don't false-alarm on real kids content" baseline.
- **Vlad and Niki** — second clean baseline. Expected: all low, age 3+.
- **Tween romance** — Gacha Life love stories marketed to kids but with
  crushes, first kiss, boyfriend/girlfriend themes. Expected:
  `sexual_content` flag, age 10+. Catches content a parent of an
  8-year-old wouldn't sign up for.
- **Mislabeled as kids** — content incorrectly tagged as kids content
  despite being adult (Don't Hug Me I'm Scared puppet horror, documented
  by journalism as miscategorized). Expected: `scary`, `violence`,
  `difficult_themes` flags, age 13+.

The scripts also support a **long-context mic drop**: point
`analyze_full_season.py` at a directory of episode transcripts and the
whole series goes to Snap in one call.

## Setup

```bash
cp .env.example .env     # add your SUBQ_API_KEY
uv venv
uv pip install -e .
```

Requires Python 3.11+. To rebuild the 20-second cuts (`render_format.py`,
`record_live.py`) install the `video` extra too, which adds matplotlib and
Playwright; you also need `ffmpeg` on your PATH and the shared `brand`
module from the parent folder:

```bash
uv pip install -e ".[video]"
playwright install chromium
```

## Run the live web app (the demo)

Paste a YouTube URL in the browser, watch Snap process it in real time,
see the age-rating + flags + flagged moments:

```bash
uv run streamlit run app/streamlit_app.py
```

Opens at http://localhost:8501. Includes one-click buttons for the four
pre-vetted examples (Blippi, Vlad and Niki, Gacha Life love story, DHMIS).

Each 60-second transcript window is one Snap call. To bound cost, a single
video is capped at its first 60 windows (set `SCREEN_SCOUT_MAX_CHUNKS` to
change it) and each playlist video at 30. Fetched transcripts are cached
under `data/cache/` so repeat runs skip YouTube.

This is the thing you screen-record for the launch video.

## Run the series demo in one command

No transcripts ship with this repo (`data/` is gitignored). Supply your
own: put episode transcripts (`.txt` or `.srt`, one file per episode) in

```
data/series/blippi/
data/series/vlad_and_niki/
data/series/tween_romance/
data/series/mislabeled_as_kids/
```

then run:

```bash
uv run python scripts/run_demo.py
```

This runs:
1. Smoke test (text-only probe to confirm Snap wiring)
2. Per-episode grid for each of the four series → `out/series_<name>.html`
3. Full-series one-call on `mislabeled_as_kids` → `out/`

If a directory is missing, the script says which and exits. Open the HTML
files in a browser.

## Individual scripts

| Script | Purpose |
|---|---|
| `scripts/smoke_test.py` | Confirm Snap API wiring + question wording |
| `scripts/analyze_youtube.py <url>` | One YouTube video |
| `scripts/analyze_youtube_batch.py --urls-file ...` | A batch of YouTube videos (the "Act 2" grid) |
| `scripts/analyze_show.py <path>` | One local show / movie transcript |
| `scripts/analyze_series.py <dir>` | Directory of episodes (one grid viewer) |
| `scripts/analyze_full_season.py <dir>` | Entire series in one Snap call (long-context mic drop) |
| `scripts/run_demo.py` | All of the above against your transcripts in `data/series/` |

## Layout

```
screen_scout/
├── snap_client.py     # SubQ Snap API wrapper
├── schema.py          # content categories + age-gate questions
├── youtube.py         # YouTube transcript fetch
├── show.py            # local .txt / .srt loader
├── series.py          # directory-of-episodes loader
├── chunker.py         # transcript → windowed chunks
├── analyzer.py        # chunks → Snap calls → Report
├── batch.py           # analyze multiple items as a BatchReport
├── viewer.py          # Report → single-item HTML viewer
└── grid_viewer.py     # BatchReport → grid HTML viewer

scripts/
├── smoke_test.py
├── analyze_youtube.py
├── analyze_youtube_batch.py
├── analyze_show.py
├── analyze_series.py
├── analyze_full_season.py
└── run_demo.py

app/
└── streamlit_app.py   # the live web app

data/                  # not in the repo (gitignored); created locally
├── cache/             # transcript cache written by the app
└── series/<name>/     # your own episode transcripts for the scripts
```

## 20-second cut

`render_format.py` writes `output/screen-scout-16x9.mp4` and
`output/screen-scout-1x1.mp4` from the live Snap 1.2 call in
`demo_call.json` (the public Gacha Life example, YouTube family-safe,
romance 0.995). Rebuild with `python render_format.py`. The Streamlit
app is still the screen to record when the cut needs the real product.

## Transcripts

This repo contains no show transcripts. The web app fetches public
YouTube captions on demand; for the scripts, use transcripts you have the
rights to use (your own, public-domain, or synthetic).

## Known gaps (deferred for v2)

- Audio transcription (Whisper) fallback when no transcript is available
- Side-by-side comparison with a general-purpose LLM
- Multimodal thumbnail analysis for YouTube
- Caching Snap responses to avoid re-paying for identical calls (only
  transcripts are cached today)
