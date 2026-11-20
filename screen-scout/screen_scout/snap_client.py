"""Minimal SubQ Snap client for Screen Scout.

Sends a `state` text plus a question dict and returns parsed probabilities
keyed by question name. Raises on auth/credit errors with a human-readable
message so we can see them in the demo without digging through tracebacks.
"""

import json
import os
from dataclasses import dataclass
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()


class SnapError(RuntimeError):
    """Raised when the Snap API returns an error we can't recover from."""


@dataclass
class SnapResponse:
    raw: dict[str, Any]
    answers: dict[str, float]

    def probability(self, key: str) -> float | None:
        return self.answers.get(key)


def _api_url() -> str:
    return os.environ.get("SUBQ_API_URL", "https://api.subq.ai/v1/systemone")


def _model() -> str:
    return os.environ.get("SUBQ_MODEL") or os.environ.get("SNAP_MODEL") or "subq-snap-latest"


def _api_key() -> str:
    key = os.environ.get("SUBQ_API_KEY") or os.environ.get("SNAP_API_KEY") or os.environ.get("SNAP_KEY")
    if not key:
        raise SnapError(
            "SUBQ_API_KEY is not set. Add it to .env or export it in your shell."
        )
    return key


def _parse_answers(raw: dict[str, Any]) -> dict[str, float]:
    """Pull the per-question probabilities out of the Snap response envelope.

    Snap returns answers at `answers.<question_key>.noul` per the Quickstart.
    Returns a flat {question_name: float} dict for easy use downstream.
    """
    answers = raw.get("answers") or {}
    flat: dict[str, float] = {}
    for key, value in answers.items():
        if isinstance(value, dict) and "noul" in value:
            flat[key] = float(value["noul"])
        elif isinstance(value, (int, float)):
            flat[key] = float(value)
    return flat


def ask(
    state: str,
    questions: dict[str, dict[str, Any]],
    *,
    timeout: float = 180.0,
    max_retries: int = 2,
) -> SnapResponse:
    """Send one Snap request. One `state`, many questions, calibrated answers back.

    Retries on transient network errors (timeouts, connection resets). Does
    NOT retry on auth / credit / client errors — those are permanent.
    """
    payload = {
        "model": _model(),
        "state": state,
        "questions": questions,
    }
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(
                _api_url(), json=payload, headers=headers, timeout=timeout
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt == max_retries:
                raise SnapError(
                    f"Snap API unreachable after {max_retries + 1} attempts: {exc}"
                ) from exc
            continue  # retry

        if response.status_code == 402:
            raise SnapError(
                "Snap returned 402: account has no credits. Check console.subq.ai."
            )
        if response.status_code == 401:
            raise SnapError("Snap returned 401: SUBQ_API_KEY is invalid or expired.")
        if response.status_code == 429:
            # rate-limited — retry once
            if attempt == max_retries:
                raise SnapError("Snap returned 429 (rate limited) and we're out of retries.")
            continue
        if response.status_code >= 500:
            # server error — retry
            last_exc = SnapError(
                f"Snap returned {response.status_code}: {response.text[:200]}"
            )
            if attempt == max_retries:
                raise last_exc
            continue
        if response.status_code >= 400:
            raise SnapError(
                f"Snap returned {response.status_code}: {response.text[:300]}"
            )

        try:
            raw = response.json()
        except json.JSONDecodeError as exc:
            raise SnapError(f"Snap returned non-JSON: {response.text[:300]}") from exc

        return SnapResponse(raw=raw, answers=_parse_answers(raw))

    # Shouldn't reach here, but if we do, raise the last recorded error.
    raise SnapError(f"Snap request failed: {last_exc}") from last_exc
