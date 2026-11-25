# Listing Match

Screen every listing in a city against a guest's wishes with **SubQ Snap** (`subq-snap-latest`), optionally racing an LLM on the same listings **and the same cover photos**. Each wish ("real desk for work", "stylish interior", "pool") is one yes/no decision per listing, and some are judged from the photo. The page times and prices every model live, then shows how much faster and cheaper SubQ was and how closely the LLM agreed with it.

```bash
uv sync
cp .env.example .env    # SUBQ_API_KEY, and OPENROUTER_API_KEY for an LLM lane (a .env in any parent folder also works)
uv run listing-match-app    # → http://localhost:8001 (--port 8000 for another port)
```

The page opens with a search already filled in (Austin, a work trip with a dog, 7 wishes, 24 listings), with SubQ running alone. Press **Find matches** (or **Enter**). **Edit search** opens the settings: city, trip presets, hard limits, wishes (mark must-haves, add your own question), SubQ Snap alone or against one LLM (GPT-6 Luna or Claude Haiku 5.5), and the number of listings (up to 100).

> **Not for public deployment as-is.** `POST /api/run` has no authentication and no rate limit, and every run spends money on your SubQ and OpenRouter keys. Put it behind auth (or keep it local) before exposing it.

## The page

- On a window at least 700px wide the page fills the window edge to edge, scaled so the shorter side is 1080px. For a square social video, record a square window.
- Each listing is a small card: cover photo, name, price, type, bedrooms, rating and the start of the description, in 6 columns (the default 24 listings fill 4 rows). A scan line sweeps each photo once in 1.0s, and a card's verdict appears when both the sweep and the answer are done. When the run ends, the listings that didn't match fade out and the matches move into a carousel, best first. Against an LLM the lanes are half as wide and show bare photos.
- `?autorun` starts the default run a second after the page loads.
- Every listing is sent at once (`RACE_CONCURRENCY`, default 100). SubQ answers 24 listings in about 1s; a SubQ-only run takes about 3.6s end to end. Against GPT-6 Luna a run takes about 21–25s; against Claude Haiku 5.5, about 8–13s.
- **Do a warm-up run before recording.** The first run after about 10 idle minutes can include one slow SubQ request (12.8s once on production); runs right after it took 3.6–3.9s.

### Demo videos

`output/` holds two 20-second cuts, each in 16:9 and 1:1:

- `listing-match-*.mp4` (`render_format.py`): a motion graphic of one measured call, twelve Austin listings with photos (numbers in `demo_call.json`).
- `listing-match-live-*.mp4` (`render_live.py`): the middle is a real screen recording of this page, SubQ alone on 24 Austin listings, at real speed with no cuts inside the run. `scripts/record_race.py` records a take with Playwright and saves the lanes' own totals in `takes/`; the proof card uses that take's time and cost (1.20s and 1.27s, $0.0029 each, recorded 2026-11-19), and the comparison card uses the benchmark below, labelled with its date.

The render scripts use the shared `../brand` package (logo and fonts) and ffmpeg. Install their Python dependencies with `uv sync --extra video`, and run `uv run playwright install chromium` before recording takes.

## Command line

```bash
uv run listing-bench                                  # Austin, work trip with a dog, 50 listings, both LLMs
uv run listing-bench --city asheville --preset family-weekend --listings 80
uv run listing-bench --models openai/gpt-6-luna
```

It prints SubQ's top 5 and a Markdown results table. A run on 2026-10-08 on the production endpoint, with photos (Austin, 40 listings, 7 wishes including 3 from the photo, 8 requests in flight per model):

| Model | Wall time | p50 per listing | Tokens in / out | Cost | Slower | Costlier |
|---|---|---|---|---|---|---|
| SubQ Snap | 3.6s | 0.64s | 49,391 / 0 | $0.0044 | – | – |
| GPT-6 Luna (reasoning on) | 23.8s | 4.07s | 46,434 / 6,798 | $0.0091 | 6.5× | 2.0× |
| Claude Haiku 5.5 (reasoning off) | 8.3s | 1.48s | 75,365 / 2,720 | $0.0089 | 2.3× | 2.0× |

That run used an earlier 7-wish preset and fewer listing fields than the app sends now. The run before it gave 6.1× and 2.1× (SubQ 3.9s).

**Reasoning:** GPT-6 Luna runs with its default reasoning on (about 130 reasoning tokens per listing). With reasoning off it took 9.3–9.6s on the same run, so SubQ was about 2.7× faster and 1.5× cheaper. Claude Haiku 5.5 runs with reasoning off; it barely reasons by default, so its times hardly change either way. The setting is per model, in `MODELS` in `llm.py`. Both models cost $0.10 in / $0.50 out per million tokens on OpenRouter.

SubQ's cost is its input tokens × $0.09 per million (`SUBQ_PRICE_PER_MTOK` overrides it). SubQ returns decisions, so it has no output tokens. LLM costs are what OpenRouter charged.

## How it works

The design follows the System One guidance: code does what code can do exactly, and the model gets narrow questions.

1. **Hard limits are checked in code**: price per night, number of guests, bedrooms, and pets (from the listing's amenities).
2. **Each wish is one `noul` question** with explicit `true`/`false` criteria. All of a listing's questions go in one SubQ request, with the cover photo and 12 listing fields (name, property type, room type, neighborhood, guests, bedrooms, price, rating, reviews, description, neighborhood overview, amenities) plus the guest's trip. The photo goes in the request's top-level `images` field, not in `state`, which would be read as base64 text. At 7 wishes that is about 1,300 input tokens a listing.
3. **The ranking is computed in code**: a weighted mean of the yes-probabilities, where must-haves count double, and listings that meet every must-have rank first.

**The LLM baseline** gets the same listing text, the same photo (as an `image_url` content part) and the same questions in one OpenRouter call per listing, and is asked for a probability per question through JSON-schema structured output at temperature 0. This follows TypeSafe's published LLM comparison (all questions batched into one call), using structured output as the fairer version.

**Fairness:** every lane screens the same listings in the same order with the same concurrency, starting at the same moment. Photos are fetched once from Airbnb's image CDN (720px, about 35 KB) before any clock starts, kept in memory, and the same bytes go to every model. Each request carries a random `uid`, so nothing is served from a cache.

**Agreement isn't accuracy.** There are no ground-truth labels, so the page reports how often the LLM agrees with SubQ, not who is right.

## The SubQ endpoint

The app calls SubQ's production API, `https://api.subq.ai/v1/systemone` (`SUBQ_API_URL` overrides it).

Every listing is its own request, and all of them go out at once. The server keeps one pool of open connections across runs. At startup it sends one tiny text-only decision per default listing (24 billed requests, once per process), which opens the connections and wakes the endpoint; each page load reopens idle connections with unbilled `HEAD` requests. So no handshakes land inside a run's timing: warm connections cut 24 listings from 1.07s to 0.95s on the hosted API (2026-10-12). Sending all 24 listings in one request takes 16–21s, and splitting them into 2 requests takes 5.4s, so one request per listing is the fastest split.

- **Rate limit:** no run on production has hit a `429`, including back-to-back runs. SubQ and LLM calls retry 429s and 5xx errors with backoff, and retries are counted in the results.
- **Tokens:** the listing is billed once per request, not once per question: 1 question on a listing with its photo cost 825 tokens, and 4 questions cost 985. A photo costs about 250 tokens.
- **Errors:** upstream error bodies and exceptions are logged on the server; the page only gets a short message (for example `SubQ returned HTTP 429 Too Many Requests`).

## Deploying to Vercel

`api/index.py` is the entry point, and the whole app runs as one function. `vercel.json` sets `maxDuration` to 300s, which needs a Vercel Pro plan (Hobby caps functions lower; a SubQ-only run fits easily, an LLM run may not). `.vercelignore` leaves out the videos, takes and render scripts. Read the note at the top about auth before deploying anywhere public.

## Layout

```
listing_match/
  systemone.py   SubQ System One client (retries 429/5xx, cost at $0.09/M input tokens)
  llm.py         OpenRouter client: structured-output probabilities, real cost per call
  match.py       wish library (text and photo) and presets, hard filters, scoring, ranking, agreement
  photos.py      fetches and caches each listing's cover photo before the race
  race.py        runs every lane concurrently and emits progress events
  app.py         FastAPI: config, estimate, and the streamed race (POST /api/run, NDJSON)
  bench.py       command-line race with a Markdown results table
  static/        the web page and the SubQ symbol
data/            Inside Airbnb samples (see data/SOURCE.md)
scripts/         build_dataset.py rebuilds data/; record_race.py records a take
api/index.py     Vercel entry point
```

## Data and photos

Listing data is from [Inside Airbnb](https://insideairbnb.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): trimmed samples of the Austin, Asheville and San Diego snapshots from June 2026 (details in `data/SOURCE.md`). Cover photos are not stored in this repo; the app loads them at runtime from Airbnb's image CDN, using the photo links in that data.
