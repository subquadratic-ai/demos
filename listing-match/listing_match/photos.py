"""Cover photos for the listings, fetched once and kept in memory.

Photos are fetched before the race starts, so download time is never part of any lane's timing, and every lane is
sent the same bytes. Airbnb's CDN resizes them (720px wide, about 35 KB).
"""

import asyncio
import base64

import httpx

from . import match

_cache: dict[str, str] = {}  # listing id -> base64 JPEG
_MAX = 1500


async def fetch(listings: list[dict], concurrency: int = 16) -> dict[str, str | None]:
    """Base64 cover photo per listing id; None if it couldn't be fetched (the listing is then judged on text alone)."""
    missing = [l for l in listings if l["id"] not in _cache]
    if missing:
        sem = asyncio.Semaphore(concurrency)
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            async def one(l: dict):
                async with sem:
                    try:
                        r = await client.get(match.photo_url(l))
                        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/jpeg"):
                            if len(_cache) >= _MAX:
                                _cache.pop(next(iter(_cache)))
                            _cache[l["id"]] = base64.b64encode(r.content).decode()
                    except httpx.HTTPError:
                        pass
            await asyncio.gather(*(one(l) for l in missing))
    return {l["id"]: _cache.get(l["id"]) for l in listings}
