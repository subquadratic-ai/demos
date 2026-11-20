"""Async client for SubQ's hosted System One decision API (api.subq.ai)."""

import asyncio
import os
import time
import uuid

import httpx

DEFAULT_URL = "https://api.subq.ai/v1/systemone"
DEFAULT_MODEL = "subq-snap-latest"
# SubQ's price per million input tokens. Output is a decision, with no output tokens.
DEFAULT_PRICE_PER_MTOK = 0.09


class SystemOneError(RuntimeError):
    pass


# One connection pool for every run, so a run doesn't pay for new connections (and TLS handshakes) inside its timing.
# Warm connections cut 24 listings from 1.07s to 0.95s on the hosted API, and 0.79s to 0.57s direct (2026-10-12).
_LIMITS = httpx.Limits(max_connections=200, max_keepalive_connections=200, keepalive_expiry=300)
_clients: dict[tuple[int, str], httpx.AsyncClient] = {}


def _client(api_key: str | None) -> httpx.AsyncClient:
    try:  # a client belongs to one event loop (a serverless runtime may start a new one)
        loop = id(asyncio.get_running_loop())
    except RuntimeError:
        loop = 0
    key = (loop, api_key or "")
    c = _clients.get(key)
    if c is None or c.is_closed:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        c = _clients[key] = httpx.AsyncClient(timeout=60, headers=headers, limits=_LIMITS)
    return c


class SystemOne:
    def __init__(self, api_key: str | None = None, url: str | None = None, model: str | None = None):
        self.api_key = api_key or os.environ.get("SUBQ_API_KEY") or os.environ.get("SNAP_API_KEY") or os.environ.get("SNAP_KEY")
        self.url = url or os.environ.get("SUBQ_API_URL", DEFAULT_URL)
        if not self.api_key and self.url == DEFAULT_URL:  # a direct endpoint on the tailnet needs no key
            raise SystemOneError("SUBQ_API_KEY is not set. Add it to a .env file (see .env.example).")
        self.model = model or os.environ.get("SUBQ_MODEL") or os.environ.get("SNAP_MODEL") or DEFAULT_MODEL
        self.price_per_mtok = float(os.environ.get("SUBQ_PRICE_PER_MTOK", DEFAULT_PRICE_PER_MTOK))
        self._client = _client(self.api_key)

    async def close(self):
        pass  # the pool is shared across runs and stays open

    async def warm(self, connections: int):
        """Open `connections` pooled connections with tiny text-only requests, before any run is timed."""
        q = {"ok": {"type": "noul", "instructions": "Is this a warm-up request?"}}
        await asyncio.gather(*(self._client.post(self.url, json={"model": self.model, "state": {"uid": uuid.uuid4().hex},
                                                                 "questions": q}) for _ in range(connections)),
                             return_exceptions=True)

    async def ask(self, state, questions: dict, photo: str | None = None, retries: int = 6) -> dict:
        """Answer named questions about one state, and optionally one JPEG photo (plain base64).

        Returns {"answers", "input_tokens", "latency", "retries"}. `latency` is the successful call's round trip;
        time spent waiting out rate limits is reported separately through `retries` and the lane's wall time.
        """
        body = {"model": self.model, "state": {"uid": uuid.uuid4().hex, **state} if isinstance(state, dict) else state,
                "questions": questions}
        if photo:  # images go in their own field; inside `state` they would be read as base64 text
            body["images"] = [{"mediaType": "image/jpeg", "base64": photo}]
        for attempt in range(retries + 1):
            start = time.perf_counter()
            try:
                resp = await self._client.post(self.url, json=body)
            except httpx.TransportError as e:
                if attempt == retries:
                    raise SystemOneError(f"Network error: {e}") from e
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            latency = time.perf_counter() - start
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                await asyncio.sleep(min(8.0, 0.5 * 2**attempt))
                continue
            if resp.status_code != 200:
                raise SystemOneError(f"HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            return {"answers": data["answers"], "input_tokens": data.get("usage", {}).get("input_tokens", 0),
                    "latency": latency, "retries": attempt}
        raise SystemOneError("unreachable")

    def cost(self, input_tokens: int) -> float:
        return input_tokens * self.price_per_mtok / 1e6
