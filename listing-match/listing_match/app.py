"""Web app: pick a city and a brief, then watch SubQ and the LLMs screen the same listings side by side.

POST /api/run streams the race as newline-delimited JSON (see race.py for the events). Closing the request
cancels every lane. No browser automation and no WebSocket, so the app runs as one Vercel function.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

import uvicorn
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import match, photos
from .llm import MODELS
from .race import DEFAULT_CONCURRENCY, race
from .systemone import DEFAULT_MODEL, DEFAULT_PRICE_PER_MTOK, SystemOne, SystemOneError

STATIC = Path(__file__).parent / "static"
MAX_LISTINGS = 100  # keeps a run short and caps LLM spend per run
MAX_MODELS = 1  # SubQ against one LLM at a time: more lanes clutter the page and the results
# SubQ Snap runs alone by default. GPT-6 Luna, with its default reasoning on, is the rival SubQ leads by more (2026-10-08).
DEFAULT_MODELS: list[str] = []
DEFAULT_LISTINGS = 24  # 6 columns x 4 rows on the page
DEFAULT_PRESET = "remote-work-dog"
# Tokens per listing (in, out) at seven criteria with the cover photo, measured 2026-10-07; only for the estimate.
PER_LISTING = {"openai/gpt-6-luna": (1160, 170), "anthropic/claude-haiku-5.5": (1890, 68)}

load_dotenv(find_dotenv(usecwd=True))

app = FastAPI()


@app.on_event("startup")
async def warm_photos():
    """Fetch the default run's photos in the background, so the first run starts straight away."""
    p = match.PRESETS[DEFAULT_PRESET]
    asyncio.create_task(photos.fetch(match.candidates(match.load_city("austin"), p["filters"], DEFAULT_LISTINGS)))


@app.on_event("startup")
async def warm_subq():
    """Open a connection per default listing in the background, so the first run's timing has no handshakes in it."""
    try:
        asyncio.create_task(SystemOne().warm(DEFAULT_LISTINGS))
    except SystemOneError:
        pass


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def concurrency() -> int:
    return max(1, min(100, int(os.environ.get("RACE_CONCURRENCY", DEFAULT_CONCURRENCY))))


def price_per_mtok() -> float:
    return float(os.environ.get("SUBQ_PRICE_PER_MTOK", DEFAULT_PRICE_PER_MTOK))


@app.get("/")
async def index():
    await warm_subq()  # idle connections may have closed since startup; reopen them before the next run
    return FileResponse(STATIC / "index.html")


@app.get("/api/config")
async def config():
    return {
        "subq": {"available": bool(os.environ.get("SUBQ_API_KEY") or os.environ.get("SNAP_API_KEY") or os.environ.get("SNAP_KEY")), "model": os.environ.get("SUBQ_MODEL") or os.environ.get("SNAP_MODEL") or DEFAULT_MODEL,
                 "price_per_mtok": price_per_mtok()},
        "llm_available": bool(os.environ.get("OPENROUTER_API_KEY")),
        "models": [{"id": k, **v} for k, v in MODELS.items()],
        "default_models": DEFAULT_MODELS, "default_preset": DEFAULT_PRESET, "default_listings": DEFAULT_LISTINGS,
        "cities": match.cities(),
        "presets": {k: {"title": p["title"], "filters": p["filters"],
                        "criteria": [{"id": i, "must": m} for i, m in p["criteria"]]} for k, p in match.PRESETS.items()},
        "library": [{"id": c.id, "label": c.label, "question": c.question, "photo": c.photo}
                    for c in match.LIBRARY.values()],
        "max_listings": MAX_LISTINGS, "max_models": MAX_MODELS, "concurrency": concurrency(),
    }


class RunRequest(BaseModel):
    city: str = "austin"
    filters: dict = Field(default_factory=dict)
    criteria: list[dict] = Field(default_factory=list)
    models: list[str] = Field(default_factory=lambda: list(DEFAULT_MODELS))
    listings: int = DEFAULT_LISTINGS


def prepare(req: RunRequest):
    try:
        city = match.load_city(req.city)
    except KeyError:
        raise HTTPException(404, f"Unknown city {req.city!r}")
    criteria = match.criteria_from(req.criteria)[:10]
    if not criteria:
        raise HTTPException(400, "Pick at least one criterion.")
    models = [m for m in dict.fromkeys(req.models) if m in MODELS][:MAX_MODELS]
    listings = match.candidates(city, req.filters, max(1, min(req.listings, MAX_LISTINGS)))
    return city, criteria, models, listings


@app.post("/api/estimate")
async def estimate(req: RunRequest):
    city, criteria, models, listings = prepare(req)
    n, k = len(listings), len(criteria)
    state_tokens = sum(len(json.dumps(match.listing_state(l, match.trip_context(req.filters)))) for l in listings) / 3.4
    subq_tokens = state_tokens + n * (250 + 40 * k)  # the photo is about 250 tokens; the listing is read once
    lanes = {"subq": {"tokens": round(subq_tokens), "cost": subq_tokens * price_per_mtok() / 1e6}}
    for m in models:
        tin, tout = (v * n * (k / 7 if i else 1) for i, v in enumerate(PER_LISTING.get(m, (1500, 200))))
        lanes[m] = {"tokens": round(tin + tout), "cost": (tin * MODELS[m]["in"] + tout * MODELS[m]["out"]) / 1e6}
    return {"listings": n, "eligible": len(match.candidates(city, req.filters, 10_000)), "criteria": k, "lanes": lanes,
            "city": city["city"], "cards": [match.card(l) for l in listings]}


async def stream(req: RunRequest):
    city, criteria, models, listings = prepare(req)
    queue: asyncio.Queue = asyncio.Queue()

    async def go():
        try:
            if not listings:
                await queue.put({"type": "error", "lane": None, "text": "No listings pass those filters."})
                return
            await race(listings, criteria, models, concurrency(), queue.put, trip=match.trip_context(req.filters))
        except Exception as e:  # report instead of silently ending the stream
            await queue.put({"type": "error", "lane": None, "text": f"{type(e).__name__}: {e}"})
        finally:
            await queue.put({"type": "run_finished"})

    task = asyncio.create_task(go())
    try:
        while True:
            msg = await queue.get()
            yield json.dumps(msg) + "\n"
            if msg["type"] == "run_finished":
                break
    finally:  # the client went away (Stop, or closed the tab): end the run with it
        task.cancel()


@app.post("/api/run")
async def run(req: RunRequest):
    prepare(req)  # validate before the stream starts, so errors come back as normal HTTP errors
    return StreamingResponse(stream(req), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def main():
    p = argparse.ArgumentParser(description="Listing Match web app")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8001)
    args = p.parse_args()
    print(f"Listing Match → http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
