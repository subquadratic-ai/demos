# Context Curation

A decision model curates context for a coding agent. Instead of letting the agent read a whole
repository, SubQ Snap gets the repo once, decides which files (and which line ranges inside them) a
change belongs to, and hands the agent a small context packet. Same task, same model, fewer input
tokens.

## The recorded trial

The 20-second clip is built from one recorded agent trial of a change to the public
[true-myth](https://github.com/true-myth/true-myth) TypeScript library (56 files). Both arms passed
the hidden tests 96/96; the only difference was how much the agent read.

| Arm | LLM input tokens | Requests | File reads |
| --- | --- | --- | --- |
| Agent alone | 5.91M | 110 | 46 |
| Agent + decision model | 3.06M | 32 | 15 |

That is 48% fewer input tokens on this task, from one trial per arm. `series.json` holds the
per-request token series for both runs and `curation.json` holds the file scores and line ranges
the decision model returned.

## What's here

```
render_format.py   the 20 s clip, 16:9 and 1:1, rebuilt from curation.json and the totals above
live/              a runnable live version against the production SubQ API
output/            rendered mp4s and poster stills
```

Fonts come from `../brand/fonts` (IBM Plex Sans and Mono, SIL OFL; see `OFL.txt` there).

## Build the clip

Needs Python 3.11+ (tested on 3.12), the packages in `requirements.txt` and ffmpeg on `PATH` (or set
`FFMPEG` to its path). No network or key: everything comes from the committed JSON.

```bash
pip install -r requirements.txt
python render_format.py      # -> output/context-curation-16x9.mp4 and -1x1.mp4, about 40 s
```

## Live version (`live/`)

`live/` runs the same idea on the current public true-myth repository with SubQ Snap on the
production API. `live/index.html` is the page, `live/server.py` serves it, and `live/curate.py`
makes the two calls:

1. The whole repository (89 tracked text files, about 246K tokens) and a task go to Snap in **one
   request**, with one yes/no question per file. Files at p ≥ 0.3 are kept.
2. The kept files go back, cut into top-level blocks, with one yes/no question per block. The kept
   blocks are the line ranges in the agent's packet.

```bash
cd live
printf "SUBQ_API_KEY=sk-...\n" > .env   # your key from console.subq.ai
python curate.py --fetch                # clone true-myth at the pinned commit, run both passes once
python server.py                        # http://localhost:8090 (optional port: python server.py 8095)
```

`curate.py` and `server.py` use the standard library only (plus `git` for `--fetch`). The server
binds to 127.0.0.1 only.

On 2026-11-20 it kept `src/maybe.ts`, `src/task.ts` and `src/result.ts` (next best 0.06) and four
line ranges, 636 of 23,149 lines, in about 1.5 s + 1.4 s. The task wording is ours, not the
trial's, so these numbers are separate from the trial above.

`output/context-curation-live-16x9.mp4` and `-1x1.mp4` are 20-second cuts recorded from that page
with `live/record_live.py` (which uses `../brand/live_cut.py`; needs `requirements.txt`, then
`python -m playwright install chromium`, and ffmpeg). The
"48% fewer tokens" line on the last card is the trial above, labelled as an earlier agent trial.

Never commit a key: `.env` is gitignored.
