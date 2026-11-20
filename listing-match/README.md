# subq-listing-match

Screen every listing in a city against a guest's wishes, with **SubQ Snap** (`subq-snap-latest`) and an LLM racing on the same listings **and the same cover photos**. Each wish ("real desk for work", "stylish interior", "pool") is one yes/no decision per listing, and some are judged from the photo. The page times and prices every model live, then shows how much faster and cheaper SubQ was and how closely the LLM agreed with it.

```bash
uv sync
cp .env.example .env    # SUBQ_API_KEY and OPENROUTER_API_KEY (a .env in any parent folder also works)
uv run listing-match-app    # → http://localhost:8001 (--port 8000 for another port)
```

The page opens with a search already filled in (Austin, a work trip with a dog, 7 criteria, 24 listings), with SubQ running alone. Press **Find matches**. **Edit search** opens the full settings: city, trip presets, hard limits, wishes (mark must-haves, add your own question), whether to run SubQ Snap alone (the default) or against one LLM (GPT-6 Luna or Claude Haiku 5.5), and the number of listings. The settings drawer closes when a run starts.

### Recording for social

- On a window at least 700px wide, the page fills the window edge to edge (since 2026-10-11), scaled so the shorter side is 1080px, with no logo bar or lane header. For a square social video, record a square window; a wider window gives the cards more room. Nothing sits below it.
- Each listing is a small card (since 2026-10-11): cover photo, name, price, type, bedrooms, rating and the start of the description. The photo runs full width with the text below, in 6 columns; the default 24 listings fill 4 rows. When the run ends, the listings that didn't match fade out and the matches move into a carousel, best first: three across, centered, with arrows (or a scroll) for the rest. Cards start in full color; there is no results popup (removed 2026-10-11). The scan line sweeps each photo once in 1.0s, about as long as SubQ's slowest answers (0.5–1.0s per listing with 24 in flight, measured 2026-10-11); a card's verdict appears when both the sweep and the answer are done. The page has a 64px margin on every side. Against an LLM the lanes are half as wide, so they fall back to bare photos.
- Adding `?autorun` to the URL starts the default race a second after the page loads, and **Enter** starts a run too.
- Every run analyzes the 24 listings on the grid, all sent at once (`RACE_CONCURRENCY`, default 100). SubQ takes about 1s for 24.
- A SubQ-only run takes about 3.6s. A run against GPT-6 Luna takes about 21–25s; against Claude Haiku 5.5, about 8–13s.
- **Do a warm-up run first.** On production, the first run after about 10 idle minutes had one slow SubQ request and took 12.8s; the runs right after it took 3.6–3.9s. Back-to-back takes are fine, with no rate-limit errors.

### Live cut

`output/listing-match-live-16x9.mp4` and `output/listing-match-live-1x1.mp4` are 20-second cuts whose middle is a real screen recording of this page: SubQ alone, 24 Austin listings with photos, real speed, no cuts inside the run. `scripts/record_race.py` records a take with Playwright (headless Chromium) and saves the lanes' own totals next to it in `takes/`; `render_live.py` cuts the takes between a hook, a proof card with that take's time and cost, the benchmark comparison from the table below (labelled with its date), and the end card. The `.webm` takes are gitignored; their `.json` totals are kept. Recorded 2026-11-19: 1.20s (16:9 take) and 1.27s (1:1 take), $0.0029 each.

## Command line

The default "Work trip, with a dog" preset has 7 criteria since 2026-10-11 (real desk, fast Wi-Fi, stylish interior, pool, walk to coffee, private outdoor space, quiet street). Each request sends the cover photo plus 12 listing fields (name, type, neighborhood, guests, bedrooms, price, rating, reviews, description, neighborhood overview, amenities) and the guest's trip (guests, max price, pet); price, guests and pets are still enforced in code first. At 24 listings that is about 1,300 input tokens a listing, and SubQ answers all 24 in about 1s. The results below were measured with an earlier 7-wish preset and fewer listing fields.

```bash
uv run listing-bench                                  # Austin, work trip with a dog, 50 listings, both LLMs
uv run listing-bench --city asheville --preset family-weekend --listings 80
uv run listing-bench --models openai/gpt-6-luna
```

It prints SubQ's top 5 and a Markdown results table you can paste into Notion. A run on 2026-10-08 on the production endpoint, with photos (Austin, 40 listings, 7 wishes including 3 from the photo, 8 requests in flight per model):

| Model | Wall time | p50 per listing | Tokens in / out | Cost | Slower | Costlier |
|---|---|---|---|---|---|---|
| SubQ Snap | 3.6s | 0.64s | 49,391 / 0 | $0.0044 | – | – |
| GPT-6 Luna (reasoning on) | 23.8s | 4.07s | 46,434 / 6,798 | $0.0091 | 6.5× | 2.0× |
| Claude Haiku 5.5 (reasoning off) | 8.3s | 1.48s | 75,365 / 2,720 | $0.0089 | 2.3× | 2.0× |

The run before it gave 6.1× and 2.1× (SubQ 3.9s). The first run of the session was slower (SubQ 12.8s, from one slow request after the endpoint sat idle). Earlier runs on the QA endpoint (2026-10-07) showed the same pattern: SubQ 3.5–3.7s, GPT-6 Luna 21–25s, and Claude Haiku 5.5 11–13s. On the page, SubQ Snap runs alone by default. When you compare, GPT-6 Luna is the rival SubQ leads by more. Both are the current low-cost vision models on OpenRouter ($0.10 in / $0.50 out per million tokens): Haiku 5.5 came out on 2026-10-07 and GPT-6 Luna on 2026-09-22. The page compares SubQ with one of them at a time. Older models (GPT-5.4 mini, Claude Haiku 4.5, Gemini 3.8 Flash) were removed on 2026-10-07.

**Reasoning:** GPT-6 Luna runs with its default reasoning on, which comes to about 130 reasoning tokens per listing. With reasoning off it took 9.3–9.6s for this run, so SubQ was about 2.7× faster and 1.5× cheaper. Claude Haiku 5.5 runs with reasoning off (`"reasoning": {"enabled": false}`); it barely reasons by default, so its times hardly change either way. The setting is per model, in `MODELS` in `llm.py`.

SubQ's cost is its input tokens × $0.09 per million (`SUBQ_PRICE_PER_MTOK` overrides it). SubQ returns decisions, so it has no output tokens. LLM costs are what OpenRouter charged.

## How it works

The design follows the System One guidance: code does what code can do exactly, and the model gets narrow questions.

1. **Hard limits are checked in code**: price per night, number of guests, and pets (from the listing's amenities). A model never sees them.
2. **Each wish is one `noul` question** with explicit `true`/`false` criteria, asked about the listing's own text (description, neighborhood overview and amenities) and its cover photo. All of a listing's questions go in one SubQ request. The photo goes in the request's top-level `images` field, not in `state`, which would be read as base64 text. Photo wishes ("Stylish interior", "Bright and airy", "Pool") tell the model to look at the photo.
3. **The ranking is computed in code**: a weighted mean of the yes-probabilities, where must-haves count double, and listings that meet every must-have rank first.

**The LLM baseline** gets the same listing text, the same photo (as an `image_url` content part) and the same questions in one OpenRouter call per listing. It's asked for a probability per question through JSON-schema structured output, at temperature 0, with each model's reasoning setting (see above). The cost is what OpenRouter reports for the call. This follows TypeSafe's published LLM comparison (all questions batched into one call), using structured output as the fairer version.

**Fairness:** every lane screens the same listings in the same order with the same concurrency, starting at the same moment. Photos are fetched once from Airbnb's image CDN (720px, about 35 KB) before any clock starts, kept in memory, and the same bytes go to every model. The server also fetches the default run's photos when it starts. Each request carries a random `uid`, so nothing is served from a cache.

**Agreement isn't accuracy.** There are no ground-truth labels here, so the table reports how often the LLMs agree with SubQ, not who is right.

## The SubQ endpoint

The app calls SubQ's production API, `https://api.subq.ai/v1/systemone` (`SUBQ_API_URL` overrides it).

Every listing is its own request, and all of them go out at once. The server keeps one pool of open connections across runs, and opens a connection per listing at startup and on each page load, so no handshakes land inside a run's timing.

**Direct endpoint (local recordings).** On the tailnet, the model's own endpoint skips the hosted API's load balancer and needs no key:

```
SUBQ_API_URL=http://vessl-skypilot/default/subq-snap-preview-pplx-vessl/v1/systemone listing-match-app --port 8003
```

24 listings with photos, measured 2026-10-12: about 0.6s direct against about 1.0s hosted. Sending all 24 listings in one request takes 16–21s, and splitting them into 2 requests takes 5.4s, so one request per listing is the fastest split.

- **Rate limit:** on production no run has hit a `429`, including back-to-back runs. On QA's default tier, `429`s started after roughly 200K tokens in a short window. A run is capped at 100 listings, and the default concurrency is 8 per model. SubQ retries 429s and 5xx errors with backoff, and retries are counted in the results.
- **Tokens:** the listing is billed once per request, not once per question: 1 question on a listing with its photo cost 825 tokens, and 4 questions cost 985. A photo costs about 250 tokens. With 7 wishes, SubQ's input tokens match the LLMs' (about 1.2K per listing).

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
  static/        the web page, the SubQ Snap logo (no longer shown), and the SubQ logo files
data/            Inside Airbnb samples (CC BY 4.0, see data/SOURCE.md)
scripts/         build_dataset.py rebuilds data/
api/index.py     Vercel entry point (vercel.json sets a 300s limit)
```

Listing data: [Inside Airbnb](https://insideairbnb.com/), CC BY 4.0.
