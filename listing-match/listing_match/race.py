"""Run SubQ and the LLMs over the same listings at the same time, and report events as they happen.

Every lane screens the same listings, and the same cover photos, in the same order with the same concurrency. Photos
are fetched before any clock starts. Events:
  preparing    photos are being fetched
  run_started  listings, criteria, lanes
  start        one lane sent one listing
  result       one listing answered by one lane (probabilities, latency, tokens, cost)
  lane_done    a lane's totals
  summary      speed and cost multiples against SubQ, and each LLM's agreement with SubQ
"""

import asyncio
import inspect
import time
from collections.abc import Awaitable, Callable

from . import match, photos
from .llm import LLM, LLMError
from .match import Criterion
from .systemone import SystemOne, SystemOneError

Emit = Callable[[dict], Awaitable[None] | None]

DEFAULT_CONCURRENCY = 100  # every listing in one burst: 87 listings in 1.7s vs 2.4s at 40 (2026-10-11)


async def _emit(emit: Emit | None, msg: dict):
    if emit:
        out = emit(msg)
        if inspect.isawaitable(out):
            await out


class Lane:
    def __init__(self, id: str, name: str, model: str, kind: str):
        self.id, self.name, self.model, self.kind = id, name, model, kind
        self.results: dict[str, dict | None] = {}
        self.latencies: list[float] = []
        self.input_tokens = self.output_tokens = self.retries = self.failures = 0
        self.cost = 0.0
        self.wall = 0.0
        self.error: str | None = None

    def totals(self) -> dict:
        return {"lane": self.id, "name": self.name, "model": self.model, "kind": self.kind,
                "done": len(self.results), "failures": self.failures, "wall": round(self.wall, 3),
                "p50": round(match.percentile(self.latencies, 0.5), 3),
                "p95": round(match.percentile(self.latencies, 0.95), 3),
                "input_tokens": self.input_tokens, "output_tokens": self.output_tokens,
                "cost": round(self.cost, 6), "retries": self.retries, "error": self.error}


async def _run_lane(lane: Lane, client, listings: list[dict], pics: dict[str, str | None], criteria: list[Criterion],
                    concurrency: int, emit: Emit | None, trip: dict | None = None):
    sem = asyncio.Semaphore(concurrency)
    start = time.perf_counter()

    async def one(l: dict):
        async with sem:
            state = match.listing_state(l, trip)
            await _emit(emit, {"type": "start", "lane": lane.id, "listing": l["id"]})
            try:
                if lane.kind == "subq":
                    r = await client.ask(state, {c.id: c.noul() for c in criteria}, pics.get(l["id"]))
                    probs = {c.id: float(r["answers"][c.id]["noul"]) for c in criteria}
                    cost, out_tokens = client.cost(r["input_tokens"]), 0
                else:
                    r = await client.ask(state, {c.id: c.question for c in criteria}, pics.get(l["id"]))
                    probs, cost, out_tokens = r["answers"], r["cost"], r["output_tokens"]
            except (SystemOneError, LLMError, KeyError, TypeError, ValueError) as e:
                lane.failures += 1
                lane.results[l["id"]] = None
                await _emit(emit, {"type": "result", "lane": lane.id, "listing": l["id"], "ok": False,
                                   "error": str(e)[:200], "elapsed": time.perf_counter() - start})
                return
            lane.results[l["id"]] = probs
            lane.failures += probs is None
            lane.latencies.append(r["latency"])
            lane.input_tokens += r["input_tokens"]
            lane.output_tokens += out_tokens
            lane.cost += cost
            lane.retries += r["retries"]
            await _emit(emit, {
                "type": "result", "lane": lane.id, "listing": l["id"], "ok": probs is not None, "probs": probs,
                "score": match.score(probs, criteria)[0] if probs else None,
                "met": match.score(probs, criteria)[1] if probs else None,
                "latency": round(r["latency"], 3), "tokens": r["input_tokens"] + out_tokens, "cost": cost,
                "elapsed": round(time.perf_counter() - start, 3), "lane_cost": round(lane.cost, 6),
                "lane_tokens": lane.input_tokens + lane.output_tokens, "retries": r["retries"],
            })

    try:
        await asyncio.gather(*(one(l) for l in listings))
    finally:
        lane.wall = time.perf_counter() - start
        await client.close()
    await _emit(emit, {"type": "lane_done", **lane.totals()})


def summary(lanes: list[Lane], criteria: list[Criterion]) -> dict:
    subq = next((l for l in lanes if l.kind == "subq"), None)
    rows = []
    for lane in lanes:
        row = lane.totals()
        if subq and lane is not subq and subq.wall and subq.cost:
            row["vs_subq"] = {
                "wall": round(lane.wall / subq.wall, 2) if subq.wall else None,
                "p50": round(match.percentile(lane.latencies, .5) / (match.percentile(subq.latencies, .5) or 1), 2),
                "cost": round(lane.cost / subq.cost, 1) if subq.cost else None,
                **match.agreement(subq.results, lane.results, criteria),
            }
        rows.append(row)
    top = match.ranking(subq.results, criteria)[:10] if subq else []
    return {"type": "summary", "lanes": rows, "subq_top": top}


async def race(listings: list[dict], criteria: list[Criterion], models: list[str],
               concurrency: int = DEFAULT_CONCURRENCY, emit: Emit | None = None, trip: dict | None = None,
               shown: int | None = None) -> dict:
    await _emit(emit, {"type": "preparing", "listings": len(listings)})
    pics = await photos.fetch(listings)
    lanes: list[tuple[Lane, object]] = []
    try:
        subq = SystemOne()
        lanes.append((Lane("subq", "SubQ", subq.model, "subq"), subq))
    except SystemOneError as e:
        await _emit(emit, {"type": "error", "lane": "subq", "text": str(e)})
    for i, m in enumerate(models):
        try:
            llm = LLM(m)
        except LLMError as e:
            await _emit(emit, {"type": "error", "lane": f"llm{i}", "text": str(e)})
            continue
        lanes.append((Lane(f"llm{i}", llm.name, m, "llm"), llm))
    await _emit(emit, {"type": "run_started", "listings": [match.card(l) for l in listings],
                       "criteria": [{"id": c.id, "label": c.label, "must": c.must, "photo": c.photo} for c in criteria],
                       "photos": sum(p is not None for p in pics.values()),
                       "lanes": [{"lane": l.id, "name": l.name, "model": l.model, "kind": l.kind} for l, _ in lanes],
                       "concurrency": concurrency,
                       "inputs": {"photo": True, "fields": len(match.LISTING_FIELDS), "trip": bool(trip)},
                       "shown": shown or len(listings)})
    try:
        await asyncio.gather(*(_run_lane(l, c, listings, pics, criteria, concurrency, emit, trip) for l, c in lanes))
    finally:
        for _, c in lanes:  # a cancelled run (client gone) still closes every connection
            await c.close()
    result = summary([l for l, _ in lanes], criteria)
    await _emit(emit, result)
    return result
