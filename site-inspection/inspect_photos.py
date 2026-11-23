"""Check site photos against written safety rules, with SubQ Snap.

One request per photo, all sent at once. Each request carries the whole rule
book as state and the photo in the request's `images` field, and asks
  rule      one choice over every rule plus "none": which rule does this photo show being broken?
  conforms  one yes/no: does the work in the photo follow the rules?
The verdict is computed in code: flagged when conforms < 0.5, with the rule Snap chose.

  python inspect_photos.py      # prints one line per photo
"""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("SUBQ_API_URL", "https://api.subq.ai/v1/systemone")
MODEL = os.environ.get("SUBQ_MODEL", "subq-snap-latest")
POLICY = open(os.path.join(HERE, "data", "policy.md")).read()
PHOTOS = json.load(open(os.path.join(HERE, "data", "photos.json")))
RULES = {"r" + m.group(1).replace(".", "_"): f"{m.group(1)} {m.group(2)}"
         for m in re.finditer(r"^(\d+\.\d+) (.+)$", POLICY, re.M)}


def key():
    if os.environ.get("SUBQ_API_KEY"):
        return os.environ["SUBQ_API_KEY"]
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path):
            k, _, v = line.strip().partition("=")
            if k == "SUBQ_API_KEY" and v:
                return v.strip().strip('"')
    raise SystemExit("Set SUBQ_API_KEY or put it in site-inspection/.env")


QUESTIONS = {
    "rule": {
        "type": "choice",
        "instructions": "Which site safety rule does this photo show being broken most clearly? "
                        "Choose none if the work shown follows the rules.",
        "criteria": {"none": "No rule is broken in this photo", **RULES},
    },
    "conforms": {
        "type": "noul",
        "instructions": "Does the work shown in this photo follow the site safety rules?",
        "criteria": {"true": "The work shown follows the rules",
                     "false": "The photo shows a rule being broken, or equipment that must be removed from service"},
    },
}


def check(photo):
    img = base64.b64encode(open(os.path.join(HERE, "data", "photos", photo["file"]), "rb").read()).decode()
    body = json.dumps({"model": MODEL, "state": {"site_rules": POLICY}, "questions": QUESTIONS,
                       "images": [{"mediaType": "image/jpeg", "base64": img}]}).encode()
    for attempt in range(4):
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
        t = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                res = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{e.code}: {e.read().decode()[:300]}")
    secs = time.perf_counter() - t
    rule = res["answers"]["rule"]
    conforms = res["answers"]["conforms"]["noul"]
    top = rule["choice"]
    return {"file": photo["file"], "conforms": round(conforms, 4), "flagged": conforms < 0.5,
            "rule": None if top == "none" else RULES[top], "rule_p": round(rule["probabilities"][top], 4),
            "seconds": round(secs, 2), "tokens": res["usage"]["input_tokens"]}


# The four photos the page shows: two hazards and two compliant scenes whose right answer is clear
# from the photo itself. (The other four in data/photos are borderline ladder shots, and an eyebolt
# whose defect is only in its caption; `python inspect_photos.py --all` runs all eight.)
SET = ["construction-workers-not-wearing-fall-protection-equipment.jpg", "residential-construction-fall-arrest.jpg",
       "trench-safety-frayed-web-sling.jpg", "trench-safety-ladder.jpg"]


def inspect_all(files=SET):
    photos = [p for p in PHOTOS if p["file"] in files]
    photos.sort(key=lambda p: files.index(p["file"]))
    t = time.perf_counter()
    with ThreadPoolExecutor(len(photos)) as pool:
        out = list(pool.map(check, photos))
    return {"photos": out, "wall_s": round(time.perf_counter() - t, 2), "rules": len(RULES)}


if __name__ == "__main__":
    import sys
    r = inspect_all([p["file"] for p in PHOTOS] if "--all" in sys.argv else SET)
    print(r["wall_s"], "s for", len(r["photos"]), "photos,", r["rules"], "rules")
    for x in r["photos"]:
        print(f"{'FLAG' if x['flagged'] else ' ok '} {x['conforms']:.3f} {x['seconds']}s {x['file'][:40]:<40} {x['rule']} ({x['rule_p']})")

