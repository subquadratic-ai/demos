"""What the decision model did in the spec-v5 trial, for the curation scene: the 56 files it read in one pass,
each file's highest probability over the 18 'where does this change belong?' questions, and the line ranges
the packet pointed at (from the second, per-file pass). Source: the call's requests.jsonl / result.json. Writes curation.json."""
import json, os, re
D = ("/mnt/data/ashmal/deepswe-peg16/analysis/poc/studies/peg16-s5stop-r73-spec5-n05/cells/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/"
     "true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-co__s2MpNoc/agent/state/snapit/speculative/20261010T224551Z-afb478")
reqs = [json.loads(l) for l in open(f"{D}/requests.jsonl")]
res = json.load(open(f"{D}/result.json"))
A = reqs[0]["answers"]
where = [k for k in A if k.startswith("req_") or k in ("files_to_change__g0", "toolbelt_location__g0")]
pmax = {}
for k in where:
    for f, p in A[k]["probabilities"].items():
        if f != "NEW":
            pmax[f] = max(pmax.get(f, 0.0), p)
files = res["packed"]
KEEP = 0.3
kept = [f for f in files if pmax.get(f, 0) >= KEEP]
# line ranges the packet points at in the kept files (unit answers + requirement map), as printed in output.txt
txt = open(f"{D}/output.txt").read()
ranges, total = {f: set() for f in kept}, {}
cur = None
for line in txt.splitlines():
    m = re.match(r"\s+(?:[\d.]+\s+)?([\w./-]+\.\w+)\s+\((\d+) lines\)", line) or re.match(r"\s+R\d+\s+([\w./-]+\.\w+)\s+\(", line)
    if m:
        cur = m.group(1)
        if m.lastindex and m.lastindex >= 2:
            total[cur] = max(total.get(cur, 0), int(m.group(2)))
        continue
    m = re.match(r"\s+lines (\d+)-(\d+)\s", line)
    if m and cur in ranges:
        ranges[cur].add((int(m.group(1)), int(m.group(2))))
out = {"n_files": len(files), "repo_tokens": res["input_tokens"], "n_where_questions": len(where), "n_questions_total": len(A),
       "n_unit_questions": len(reqs[1]["answers"]), "keep_threshold": KEEP,
       "files": [{"path": f, "p": round(pmax.get(f, 0.0), 4), "kept": f in kept} for f in files],
       "kept": [{"path": f, "lines": total.get(f), "ranges": sorted(ranges[f])} for f in sorted(kept, key=lambda f: -pmax[f])],
       "next_best": max(p for f, p in pmax.items() if f not in kept), "packet_bytes": len(txt.encode()),
       "elapsed_s": json.load(open(f"{D}/call.json"))["elapsed_s"],
       "pass_s": {r["stage"]: r["elapsed_s"] for r in reqs}}
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "curation.json"), "w"), indent=1)
print({k: v for k, v in out.items() if k not in ("files",)})
