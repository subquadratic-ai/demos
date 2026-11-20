"""Per-request series for the demo clip, from the two real Claude Code sessions (main + subagents),
using notsaved_v5/trace.py's parser and classifier unchanged. Writes series.json."""
import glob, json, os, re, sys
POC = "/mnt/data/ashmal/deepswe-peg16/analysis/poc"
sys.path.insert(0, f"{POC}/notsaved_v5")
import trace as T

TRIALS = {
    "alone": f"{POC}/studies/peg16-s5stop-r73-alone-n06/cells/true-myth-iterable-collection-combinators__bypass__r1/true-myth-iterable-collection-combinators__bypass__r1/true-myth-iterable-collection-co__vFrFexQ",
    "spec": f"{POC}/studies/peg16-s5stop-r73-spec5-n05/cells/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-co__s2MpNoc",
}
SESS = {"alone": "68e679ef-d11f-40a5-aed4-e636f3a488a1", "spec": "1e1266a1-bf5f-4635-bda6-45153446dd18"}

def shown(p):  # display path only: strip agent worktree prefixes
    return re.sub(r"^(\.claude/worktrees/[^/]+/)", "", p)

out = {}
for arm, td in TRIALS.items():
    _, _, reqs, subs, _ = T.trial({"trial_dir": os.path.relpath(td, T.S), "session_id": SESS[arm]})
    series = []
    for r in reqs:
        reads = []
        kinds = []
        for c in r["calls"]:
            k, fs = T.classify(c)
            kinds.append(k)
            if k == "read":
                reads.append(", ".join(shown(f) for f in fs if f) or "(file)")
        series.append({"ctx": r["ctx"], "src": r["src"], "reads": reads, "kinds": kinds})
    tot = sum(s["ctx"] for s in series)
    nread = sum(len(s["reads"]) for s in series)
    out[arm] = series
    print(arm, f"input={tot/1e6:.2f}M requests={len(series)} file_reads={nread} subagents={len(subs)} ctx_max={max(s['ctx'] for s in series)}")
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "series.json"), "w"))
