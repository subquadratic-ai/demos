# Handoff — subq-demo-agent (context-curation clip)

Written for: whoever picks up or edits this demo video next.

## What this is

A ~4.4 s, 1920×1080, 30 fps, silent MP4 (`output/demo_v2.mp4`) that explains, visually, how a
decision model curates context for a coding agent and why that cuts the agent's input tokens. It was
built for a marketing clip and iterated on team feedback. Rebuild it with `python render2.py`.

## The story the clip tells (and where each number comes from)

1. **The whole repository goes to the decision model** — 56 files, ~226k tokens, with the task.
2. **API request 1 — which files should change?** One pass over all 56 files. Each file is scored and
   marked kept (p ≥ 0.3, green) or dropped (red). 4 files kept; next-best file scored 0.04.
3. **API request 2 — keep files p ≥ 0.3, pick line ranges inside them.** The 4 kept files appear
   first, then the line-range bars fill in parallel (e.g. `src/maybe.ts`: 10 ranges, 493 lines).
4. **The agent starts from this packet** — 4 files, 20 line ranges, ~7 kB, instead of 226k tokens.

Every file score, probability and line range is from the real decision-model call in the trial
(`curation.json`). The token totals (5.91M→3.06M etc.) are from the two real agent sessions
(`series.json`).

## The one number that is NOT a direct measurement of this call: the timer

The on-screen "DECISION MODEL TIME · SubQ QA" is **5.0 s (request 1) + 1.0 s (request 2) ≈ 6.0 s**.

- The trial itself ran the decision model on a **slow self-hosted engine**: 163.4 s + 89.5 s = 254 s
  (that engine re-reads the whole repo per question; see `curation.json` → `pass_s`). That number was
  judged unrepresentative and is **not** shown.
- **SubQ's QA endpoint** (`subq-snap-preview`, `https://api.qa.subq.ai/v1/systemone`) is far faster.
  The team measured ~5.0 s for a comparable ~250k-token answer call, so **request 1 = 5.0 s** on screen.
- **Request 2 = 1.0 s** is a stand-in: the kept-files call is tiny (4 files, not the whole repo), so
  sub-second is expected, but it was not separately measured.
- We could not time the exact call ourselves: the QA endpoint rejects requests above ~3,500 input
  tokens with `HTTP 503 "Service temporarily unavailable"` (the real decision call sends ~226k). See
  `provenance/qa_replay.py` and the note below.

**To replace the timer with a real measured number:** time request 1 and request 2 of the exact call
on an engine that accepts a ~226k-token request, then edit `QA_PASS1_S` / `QA_PASS2_S` near the top of
`render2.py` and re-render. If request 2 becomes measured, drop "shown sped up" wording as needed.

## QA endpoint finding (provenance/qa_replay.py)

Replaying the exact two-pass call against the QA endpoint returns `503` in <1 s for anything larger
than ~3,500 input tokens (binary-searched: 11,000 chars of repo text OK, 11,250 fails). Small calls
answer in ~0.4 s. The 503 message reads like an outage but is really a size cap — worth flagging to
whoever runs QA if large-context calls are expected to work. `qa_replay.py` reads `SNAP_API_KEY` from
the environment; it needs the trial data under `.../speculative/<id>/requests.jsonl`, which is **not**
committed here.

## Files and how to regenerate the committed data

- `series.json` ← `provenance/extract.py` — parses the two agent session JSONLs (main + subagents,
  usage deduped per message id). **Needs** the trial dirs and the analysis parser (`trace.py`,
  `common.py`) from the DeepSWE analysis tree; neither is committed. The extracted `series.json` is,
  so you don't need them to rebuild the video.
- `curation.json` ← `provenance/extract_curation.py` — reads the decision call's
  `requests.jsonl` / `result.json` / `output.txt`. Same caveat: needs the trial dir (not committed).

The absolute `/mnt/data/ashmal/...` paths in the provenance scripts are where the trial lived on the
build host; they're there for traceability, not expected to resolve elsewhere.

## Editing the clip (render2.py)

Timeline is in frames at 30 fps; key constants near the top:

- `CLICK` — the "Run decision model" button is pressed.
- `SCORE0 / SCORE1` — request 1 file-scoring window (~2 s on screen).
- `NARROW0 / NARROW1` — kept files slide into a column (request 2 begins).
- `BARS0 / BARS_END` — line-range bars fill (slowed for legibility; the fill rate is the `/16` in the
  `ba = ease((frame - BARS0 - j * 3) / 16)` line).
- `PACKET0` — the context-packet card appears.
- `QA_PASS1_S, QA_PASS2_S` — the timer values described above.

`render.py` holds the shared palette, fonts and helpers (and the older split-screen race, no longer
used in `render2.py`). Fonts load from `fonts/` at import time.

## Not in this repo (by design)

- No API keys or `.env` files.
- No full agent session transcripts or repository source (the clip shows file names and counts only).
  The QA replay request bodies (which embed the open-source true-myth repo) were left out as large and
  unnecessary; regenerate them with `qa_replay.py` + the trial data if needed.
- The earlier non-agent demos (Snap Inbox email triage, SnapScreen / MovieLens) live elsewhere and are
  not part of this repo.
