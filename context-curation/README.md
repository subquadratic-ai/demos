# subq-demo-agent

A short marketing clip that shows how a **decision model curates context** for a coding agent:
instead of letting the agent read a whole repository, the decision model is handed the repo once,
decides which files (and which line ranges inside them) a change belongs to, and gives the agent a
small context packet. Same task, same model, fewer input tokens.

The clip is built entirely from **one real DeepSWE trial** of the task
`true-myth-iterable-collection-combinators` (a 56-file TypeScript repo). All three arms of that
trial solved the hidden tests 96/96; the only thing that differed was how much the agent read.

| arm | LLM input | requests | file reads |
|---|---|---|---|
| agent alone | 5.91M | 110 | 46 |
| agent + decision model | 3.06M | 32 | 15 |

→ **48% fewer input tokens, on this task** (one trial per arm).

## What's here

```
render_format.py      the current cut (20 s, 16:9 and 1:1), in the repo demo-video format.
                      Run this. Long context, then the four files Snap kept, then 96/96 and
                      5.91M → 3.06M. No speed timer.
render2.py            the earlier ~4.4 s clip. Kept so the previous cut can be rebuilt.
render.py             the earlier clip (split-screen race + end card); kept for reference. render2 imports it
                      for shared palette/font/helpers.
series.json           per-request token series for both agent runs (input+cache tokens, tool calls, file reads)
curation.json         the decision model's file scores and the line ranges it pointed at
fonts/                IBM Plex Sans/Mono (SIL OFL, see fonts/OFL.txt)
output/               rendered mp4s + poster stills (demo_v2.* is current; demo.* is the earlier version)
DEMO_BRIEF.md         the original brief this was built from
provenance/           how series.json / curation.json were extracted, and the QA-endpoint timing probe
HANDOFF.md            start here
```

## Live version (`live/`)

`live/` is a real, runnable version of the same idea on the current public true-myth repository,
with SubQ Snap on the production API. `live/index.html` is the page; `live/server.py` serves it;
`live/curate.py` makes the two calls:

1. The whole repository (89 tracked text files, about 246K tokens) and a task go to Snap in **one
   request**, with one yes/no question per file. Files at p ≥ 0.3 are kept.
2. The kept files go back, cut into top-level blocks, with one yes/no question per block. The kept
   blocks are the line ranges in the agent's packet.

```bash
cd live
printf "SUBQ_API_KEY=sk-...\n" > .env              # your key from console.subq.ai
python curate.py --fetch                         # clone true-myth at the pinned commit, run both passes once
python server.py                                 # http://localhost:8090
```

On 2026-11-20 it kept `src/maybe.ts`, `src/task.ts` and `src/result.ts` (next best 0.06) and four line
ranges, 636 of 23,149 lines, in about 1.5 s + 1.4 s. The task wording is ours, not the DeepSWE task's,
so these numbers are separate from the trial above.

`output/context-curation-live-16x9.mp4` and `-1x1.mp4` are 20-second cuts recorded from that page
(`live/record_live.py`, using `brand/live_cut.py`). The "48% fewer tokens" line on the last card is
the trial above, labelled as an earlier agent trial.

## Build the clip

```bash
# Python 3.12 with matplotlib; ffmpeg on PATH. (We used /mnt/data/ashmal/conductor/.venv.)
pip install matplotlib
python render2.py          # -> demo_v2.mp4 + poster_v2.png (writes to repo root), ~35 s
```

`render2.py` reads `series.json` and `curation.json` (both committed), so it rebuilds the video with
no network and no trial data. Everything shown is real; the **decision-model timer** uses SubQ's QA
endpoint timings (see HANDOFF.md — request 1 measured 5.0 s, request 2 shown as 1.0 s).

No keys or secrets are in this repo. `provenance/qa_replay.py` reads `SNAP_API_KEY` from the
environment; never commit a key.
