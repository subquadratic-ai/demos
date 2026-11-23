"""Context curation with SubQ Snap, live, on the public true-myth repository.

Pass 1: the whole repository (every tracked text file, in full) and the task go
to Snap in one request, with one yes/no question per file: does the task need
changes in this file? Files at p >= KEEP are kept.

Pass 2: only the kept files go back, cut into their top-level blocks (an export,
a type, a function and its overloads), with one yes/no question per block: does
the task need changes in these lines? Blocks at p >= KEEP become the line
ranges in the agent's context packet.

Snap returns probabilities, not text. The packet is assembled in code.

  python curate.py            # runs both passes, prints the packet, writes last_run.json
"""
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "repo")
# Pinned so a recording is reproducible. `python curate.py --fetch` clones it.
REPO_URL = "https://github.com/true-myth/true-myth.git"
REPO_COMMIT = "653275d"
SKIP = re.compile(r"(pnpm-lock\.yaml|\.png)$")
KEEP = 0.3
URL = os.environ.get("SUBQ_API_URL", "https://api.subq.ai/v1/systemone")
MODEL = os.environ.get("SUBQ_MODEL", "subq-snap-latest")

TASK = (
    "Make true-myth's collection combinators accept any Iterable, not only arrays. "
    "Functions that take a collection of values, Maybes, Results or Tasks (such as all, any, "
    "allSettled, race, first, last, find, transposeArray, transposeAll, transposeAny) should also "
    "accept Sets, Map values, generators and other iterables, with the existing array overloads "
    "and their types unchanged."
)


def key():
    for name in ("SUBQ_API_KEY", "SNAP_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path):
            k, _, v = line.strip().partition("=")
            if k in ("SUBQ_API_KEY", "SNAP_API_KEY") and v:
                return v.strip().strip('"')
    raise SystemExit("Set SUBQ_API_KEY or put it in context-curation/live/.env")


def fetch():
    if not os.path.isdir(REPO):
        subprocess.run(["git", "clone", "-q", REPO_URL, REPO], check=True)
    subprocess.run(["git", "-C", REPO, "checkout", "-q", REPO_COMMIT], check=True)


def files():
    paths = subprocess.run(["git", "-C", REPO, "ls-files"], capture_output=True, text=True, check=True).stdout.split()
    out = []
    for p in paths:
        if SKIP.search(p):
            continue
        text = open(os.path.join(REPO, p), encoding="utf-8", errors="replace").read()
        out.append({"path": p, "text": text, "lines": text.count("\n") + 1, "bytes": len(text.encode())})
    return out


def decide(state, questions):
    body = json.dumps({"model": MODEL, "state": state, "questions": questions}).encode()
    for attempt in range(4):
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
        t = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r), time.perf_counter() - t
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(1.0 * 2 ** attempt)
                continue
            raise RuntimeError(f"{e.code}: {e.read().decode()[:400]}")


def repo_state(fs):
    return {"task": TASK, "repository": "\n\n".join(f"===== {f['path']} =====\n{f['text']}" for f in fs)}


def pass1(fs):
    qs = {f"f{i}": {
        "type": "noul",
        "instructions": f"Does the file `{f['path']}` define (not only call, re-export, document or test) "
                        "a function whose signature or implementation the task changes?",
        "criteria": {"true": "This file defines at least one of the functions the task changes",
                     "false": "No function the task changes is defined in this file"},
    } for i, f in enumerate(fs)}
    res, secs = decide(repo_state(fs), qs)
    scores = [round(res["answers"][f"f{i}"]["noul"], 4) for i in range(len(fs))]
    return {"scores": scores, "seconds": round(secs, 2), "usage": res["usage"]}


BLOCK = re.compile(r"^(export |declare |function |class |type |interface |const |let |enum )", re.M)


def blocks(text):
    """Top-level blocks of a TypeScript file: each starts at a top-level declaration (with the doc
    comment right above it) and runs to the next one. Consecutive overloads of one function merge."""
    lines = text.split("\n")
    starts = [i for i, l in enumerate(lines) if BLOCK.match(l)]
    if not starts:
        return [(1, len(lines))]
    # Pull each start up over its doc comment and decorators.
    fixed = []
    for s in starts:
        j = s
        while j > 0 and (lines[j - 1].strip().startswith(("*", "/**", "//", "@")) or lines[j - 1].strip() == "*/"):
            j -= 1
        fixed.append(j)
    name = lambda i: (re.search(r"function\s+(\w+)", lines[i]) or re.search(r"(\w+)", lines[i])).group(1)
    out, prev = [], None
    for k, s in enumerate(fixed):
        end = (fixed[k + 1] if k + 1 < len(fixed) else len(lines))
        nm = name(starts[k])
        if out and nm == prev and "function" in lines[starts[k]]:
            out[-1] = (out[-1][0], end)
        else:
            out.append((s + 1, end))
        prev = nm
    if fixed[0] > 0:
        out.insert(0, (1, fixed[0]))
    return out


def pass2(kept):
    units = []
    for f in kept:
        lines = f["text"].split("\n")
        for a, b in blocks(f["text"]):
            if b - a < 0:
                continue
            units.append({"path": f["path"], "start": a, "end": b, "text": "\n".join(lines[a - 1:b])})
    state = {"task": TASK, "files": "\n\n".join(f"===== {f['path']} =====\n{f['text']}" for f in kept)}
    qs = {f"u{i}": {
        "type": "noul",
        "instructions": f"To implement the task, do lines {u['start']}-{u['end']} of `{u['path']}` have to change? "
                        f"They begin: {u['text'][:160]!r}",
        "criteria": {"true": "These lines are part of the change", "false": "These lines can stay as they are"},
    } for i, u in enumerate(units)}
    res, secs = decide(state, qs)
    for i, u in enumerate(units):
        u["p"] = round(res["answers"][f"u{i}"]["noul"], 4)
        del u["text"]
    return {"units": units, "seconds": round(secs, 2), "usage": res["usage"]}


def packet(kept, p2):
    ranges = {}
    for u in p2["units"]:
        if u["p"] >= KEEP:
            r = ranges.setdefault(u["path"], [])
            if r and r[-1][1] + 1 >= u["start"]:
                r[-1][1] = u["end"]
            else:
                r.append([u["start"], u["end"]])
    lines = sum(b - a + 1 for rs in ranges.values() for a, b in rs)
    return {"ranges": ranges, "lines": lines}


def run():
    fs = files()
    p1 = pass1(fs)
    kept = [f for f, s in zip(fs, p1["scores"]) if s >= KEEP]
    p2 = pass2(kept)
    pk = packet(kept, p2)
    total_lines = sum(f["lines"] for f in fs)
    return {"task": TASK, "commit": REPO_COMMIT, "files": [{"path": f["path"], "lines": f["lines"], "p": s}
                                                           for f, s in zip(fs, p1["scores"])],
            "pass1": {k: v for k, v in p1.items() if k != "scores"}, "pass2": p2, "packet": pk,
            "repo_lines": total_lines}


if __name__ == "__main__":
    import sys
    if "--fetch" in sys.argv:
        fetch()
    out = run()
    json.dump(out, open(os.path.join(HERE, "last_run.json"), "w"), indent=1)
    print("pass1", out["pass1"])
    print("kept", [(f["path"], f["p"]) for f in out["files"] if f["p"] >= KEEP])
    print("next best", sorted((f["p"], f["path"]) for f in out["files"] if f["p"] < KEEP)[-3:])
    print("pass2", out["pass2"]["seconds"], out["pass2"]["usage"], len(out["pass2"]["units"]), "blocks")
    print("packet", out["packet"]["lines"], "of", out["repo_lines"], "lines")
    for p, rs in out["packet"]["ranges"].items():
        print(" ", p, rs)
