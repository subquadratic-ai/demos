"""Replay the exact decision-model call from the spec-v5 trial (both passes, same state and questions)
against SubQ's System One endpoint (subq-snap-latest), timing each pass and comparing answers.
Writes qa_replay/result.json."""
import json, os, sys, time
import httpx

D = ("/mnt/data/ashmal/deepswe-peg16/analysis/poc/studies/peg16-s5stop-r73-spec5-n05/cells/true-myth-iterable-collection-combinators__peg16-spec-v5__r1/"
     "true-myth-iterable-collection-combinators__peg16-spec-v5__r1/true-myth-iterable-collection-co__s2MpNoc/agent/state/snapit/speculative/20261010T224551Z-afb478")
KEY = os.environ["SNAP_API_KEY"]   # export the SubQ QA key before running; never commit it
URL = "https://api.subq.ai/v1/systemone"
HERE = os.path.dirname(os.path.abspath(__file__))
reqs = [json.loads(l) for l in open(f"{D}/requests.jsonl")]
out = {"endpoint": URL, "model": "subq-snap-latest", "passes": []}
with httpx.Client(timeout=900, headers={"Authorization": f"Bearer {KEY}"}) as c:
    for r in reqs:
        body = {"model": "subq-snap-latest", **r["request"]}
        size = len(json.dumps(body))
        t0 = time.time()
        resp = c.post(URL, json=body)
        dt = time.time() - t0
        rec = {"stage": r["stage"], "n_questions": len(r["request"]["questions"]), "body_bytes": size, "status": resp.status_code,
               "elapsed_s": round(dt, 2), "selfhosted_elapsed_s": r["elapsed_s"]}
        if resp.status_code == 200:
            js = resp.json()
            rec["usage"] = js.get("usage")
            rec["answers"] = js.get("answers")
        else:
            rec["error"] = resp.text[:500]
        out["passes"].append(rec)
        print(rec["stage"], rec["status"], f"{dt:.2f}s (self-hosted {r['elapsed_s']:.1f}s)", f"{size/1e6:.2f} MB", rec.get("usage"), rec.get("error", ""))
json.dump(out, open(f"{HERE}/qa_replay/result.json", "w"))
