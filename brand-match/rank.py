"""Rank Fernwell's 250-asset library against a new customer upload, with SubQ Snap.

One request. The state is the brand guidelines and the upload; the questions are
  match    one choice over all 250 library assets: which asset should this upload be tagged with?
  on_brand one yes/no: does the upload fit the guidelines?
Snap returns a probability for every asset, so the ranking is the probabilities, sorted in code.

  python rank.py        # prints the top ten
"""
import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("SUBQ_API_URL", "https://api.subq.ai/v1/systemone")
MODEL = os.environ.get("SUBQ_MODEL", "subq-snap-latest")
DATA = json.load(open(os.path.join(HERE, "data", "library.json")))


def key():
    if os.environ.get("SUBQ_API_KEY"):
        return os.environ["SUBQ_API_KEY"]
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path):
            k, _, v = line.strip().partition("=")
            if k == "SUBQ_API_KEY" and v:
                return v.strip().strip('"')
    raise SystemExit("Set SUBQ_API_KEY or put it in brand-match/.env")


def decide(state, questions):
    body = json.dumps({"model": MODEL, "state": state, "questions": questions}).encode()
    for attempt in range(4):
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
        t = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r), time.perf_counter() - t
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{e.code}: {e.read().decode()[:400]}")


def rank(upload=None):
    upload = upload or DATA["upload"]
    lib = DATA["library"]
    questions = {
        "match": {
            "type": "choice",
            "instructions": "Which asset in the brand library is the closest match to the customer upload "
                            "(same people, activity, setting and light), so the upload can be tagged with it?",
            "criteria": {a["id"]: a["text"] for a in lib},
        },
        "on_brand": {
            "type": "noul",
            "instructions": "Does the customer upload fit the brand guidelines?",
            "criteria": {"true": "It shows what the guidelines ask for and nothing they rule out",
                         "false": "It shows something the guidelines rule out"},
        },
    }
    res, secs = decide({"guidelines": DATA["guidelines"], "upload": upload}, questions)
    probs = res["answers"]["match"]["probabilities"]
    by_id = {a["id"]: a for a in lib}
    ranked = sorted(({"id": k, "p": round(v, 4), "text": by_id[k]["text"], "on_brand": by_id[k]["on_brand"]}
                     for k, v in probs.items()), key=lambda r: -r["p"])
    return {"upload": upload, "seconds": round(secs, 2), "usage": res["usage"], "candidates": len(lib),
            "on_brand": round(res["answers"]["on_brand"]["noul"], 4), "ranked": ranked}


if __name__ == "__main__":
    r = rank()
    print(r["seconds"], "s", r["usage"], "on_brand", r["on_brand"])
    for x in r["ranked"][:10]:
        print(f"{x['p']:.4f} {x['id']} {x['text']}")
    print("off-brand best rank:", next(i for i, x in enumerate(r["ranked"], 1) if not x["on_brand"]))
