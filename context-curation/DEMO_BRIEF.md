# Demo brief: "context curation with a decision model", 3-5 s clip

Goal: a 3-5 second video (mp4, 1920x1080, 30 fps, no audio) that shows an LLM coding agent reading less of a repository
because a decision model hands it a small, targeted packet first. Factual only: every number below comes from one real
trial per arm of one DeepSWE task. No claims about mechanism beyond "the packet names files and line ranges; the agent
reads less and finishes with the same result".

## The sample (same task, same hidden tests, all three arms solved 96/96)

Task: true-myth-iterable-collection-combinators (TypeScript repo, 56 files; add iterator/collection helpers to maybe,
result, task, toolbelt). Statement: /mnt/data/ashmal/deepswe-peg16/stage/deep-swe/tasks/true-myth-iterable-collection-combinators/instruction.md

| arm | LLM input | LLM output | requests | file reads | result |
|---|---|---|---|---|---|
| alone (stock Claude Code, Sonnet 5, 10 Oct) | 5.91M | 63k | 110 | 46 | solved 96/96 |
| spec-v5 (decision-model packet + review, Sonnet 5, 10 Oct) | 3.06M | 23k | 32 | 15 | solved 96/96 |
| static-v4 (decision-model find packet, Sonnet 5, 8 Oct) | 4.15M | 34k | – | – | solved 96/96 |

Trial directories (each holds agent/sessions/projects/-app/<session>.jsonl = the full Claude Code session, one record per
assistant turn with usage {input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens} and the
tool_use blocks; dedupe assistant records by message.id):

- alone:   /mnt/data/ashmal/deepswe-peg16/analysis/poc/studies/peg16-s5stop-r73-alone-n06/cells/true-myth-iterable-collection-combinators__bypass__r1/true-myth-iterable-collection-combinators__bypass__r1/true-myth-iterable-collection-co__vFrFexQ
  session: agent/sessions/projects/-app/68e679ef-d11f-40a5-aed4-e636f3a488a1.jsonl
- spec-v5: /mnt/data/ashmal/deepswe-peg16/analysis/poc/studies/peg16-s5stop-r73-spec5-n05/cells/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-co__s2MpNoc
  session: agent/sessions/projects/-app/1e1266a1-bf5f-4635-bda6-45153446dd18.jsonl
  packet (what the agent saw from the decision model, 7 kB): agent/state/snapit/speculative/20261010T224551Z-afb478/output.txt
  review (2 kB, came back clean): agent/state/snapit/speculative/20261010T225459Z-091967/output.txt
- static-v4: /mnt/data/ashmal/deepswe-peg16/analysis/poc/studies/peg16-v4sft-6-n02/cells/true-myth-iterable-collection-combinators__peg16-static-v4__r1/true-myth-iterable-collection-combinators__peg16-static-v4__r1/true-myth-iterable-collection-co__MdFeuGB
  session: agent/sessions/projects/-app/ad827ef3-de96-4ee0-bc3d-39b47b60d949.jsonl
  packet (find, 24 kB): agent/state/snapit/find/20261008T083158Z-8ba65e/output.txt

Readable timelines (one line per tool call: request index, phase, context size, kind, file):
/mnt/data/ashmal/deepswe-peg16/analysis/poc/notsaved_v5/timelines/spec-v5/true-myth-iterable-collection-combinators.txt
Parser to reuse: /mnt/data/ashmal/deepswe-peg16/analysis/poc/notsaved_v5/trace.py (parse_session, classify).

## The clip (one idea, keep it)

Split screen, same task on both sides, a timeline that plays at the same speed:
- Left, "Agent alone": each request is a tick; a bar fills with the context size (grows to ~100k tokens); file names
  flash past as it reads 46 files; the counter ends at 5.91M input tokens, 110 requests.
- Right, "Agent + decision model": first ~0.5 s shows the decision model returning a small card: 5 questions, the 4
  files it points at with line ranges (src/maybe.ts 67-300, src/toolbelt.ts 1-30, src/task.ts 75-223, src/result.ts);
  then the same timeline plays, 15 reads, 32 requests, counter ends at 3.06M.
- Both end on the same green "96/96 tests pass". End card for the last second: "Same result. 48% fewer input tokens."
  (One trial; say "on this task".)

## How to produce it without manual work

1. Extract per-request series from the two session JSONLs: for each assistant record (deduped by message.id) take
   context = input + cache_creation + cache_read, the tool names, and the file paths of Read calls. ~40 lines of Python.
2. Render frames: matplotlib (two axes, bar/line of context per request, a text counter, a file-name ticker) or an HTML
   page with CSS animation captured with playwright. 4 s x 30 fps = 120 frames; map request index to time.
3. Encode: ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 demo.mp4
   (ffmpeg and the conductor venv's matplotlib are on this host: /mnt/data/ashmal/conductor/.venv/bin/python).
4. Do not read the repository source into the video; file names and counts only. The packet text is safe to show
   (it names files and line ranges). Replace the engine host in the packet header with "decision model".
