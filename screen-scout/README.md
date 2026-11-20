# Screen Scout

Age-appropriate content checker for streaming shows and YouTube videos.
Powered by SubQ Snap.

Snap reads a transcript (per 60-second window or per-chapter chunk) and
returns calibrated probabilities for profanity, violence, scary content,
sexual content, substance use, difficult themes, hidden ads, and
AI-generated content signals. Plus age-gate probabilities for `<6`,
`6-9`, `10-12`, `13+`.

Four demo series, each a different age-tier claim:

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

Plus a **long-context mic drop** where the whole mislabeled series is
sent to Snap in one call — the "Jev at 32K can't fit this" moment.

## Setup

```bash
cp .env.example .env     # add your SUBQ_API_KEY
uv venv
uv pip install -e .
```

## Run the live web app (the demo)

Paste a YouTube URL in the browser, watch Snap process it in real time,
see the age-rating + flags + flagged moments:

```bash
uv run streamlit run app/streamlit_app.py
```

Opens at http://localhost:8501. Includes one-click buttons for the four
pre-vetted examples (Blippi, Vlad and Niki, Gacha Life love story, DHMIS).

This is the thing you screen-record for the launch video.

## Run the full demo in one command

Sample transcripts are already in the repo for pipeline testing. Replace
them with real content before the final video.

```bash
uv run python scripts/run_demo.py
```

This runs:
1. Smoke test (text-only probe to confirm Snap wiring)
2. Bluey series analysis → `out/series_bluey.html`
3. Concerning series analysis → `out/series_concerning.html`
4. Full-series one-call → `out/full_series_concerning.html`

Open the HTML files in a browser or screenshot for the video.

## Individual scripts

| Script | Purpose |
|---|---|
| `scripts/smoke_test.py` | Confirm Snap API wiring + question wording |
| `scripts/analyze_youtube.py <url>` | One YouTube video |
| `scripts/analyze_youtube_batch.py --urls-file ...` | A batch of YouTube videos (the "Act 2" grid) |
| `scripts/analyze_show.py <path>` | One local show / movie transcript |
| `scripts/analyze_series.py <dir>` | Directory of episodes (one grid viewer) |
| `scripts/analyze_full_season.py <dir>` | Entire series in one Snap call (long-context mic drop) |
| `scripts/run_demo.py` | All of the above against the sample data |

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

data/
├── samples/           # README for sourcing + URL batch files
└── series/
    ├── bluey/         # drop Bluey episode transcripts here
    └── concerning/    # drop the "kid-marked but inappropriate" series here
```

## 20-second cut

`render_format.py` writes `output/screen-scout-16x9.mp4` and
`output/screen-scout-1x1.mp4` from the live Snap 1.2 call in
`demo_call.json` (the public Gacha Life example, YouTube family-safe,
romance 0.995). Rebuild with `python render_format.py`. The Streamlit
app is still the screen to record when the cut needs the real product.

## For the final demo video

The sample transcripts in `data/series/` are seeded placeholders. Swap
them with real transcripts before shooting:

- **Bluey:** springfieldspringfield.co.uk has transcripts for every episode. 10–15 min to grab a season.
- **Concerning series:** see `data/samples/README.md` for options (Elsagate docs, AI-slop channels, synthetic). For legal safety, anonymize channel/show names in the final video cut.

## Known gaps (deferred for v2)

- Audio transcription (Whisper) fallback when no transcript is available
- Jev side-by-side comparison (requires OpenRouter wrapper + budget)
- Multimodal thumbnail analysis for YouTube
- Caching to avoid re-paying for identical Snap calls
