"""The LLM baseline: the same listing and the same criteria, in one OpenRouter chat completion per listing.

Each call asks for a probability per criterion through JSON-schema structured output, at temperature 0, and
reads the real cost back from OpenRouter (`usage.include`). This follows TypeSafe's LLM comparison
(every question batched into one call returning JSON), with structured output. Each model's
reasoning setting is in MODELS.
"""

import asyncio
import json
import logging
import os
import re
import time
import uuid

import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"
log = logging.getLogger(__name__)

# name, OpenRouter id, $/Mtok in, $/Mtok out (checked on OpenRouter 2026-10-07; cost shown is OpenRouter's own)
MODELS = {
    # reasoning: False sends "reasoning": {"enabled": false}; True leaves the model's default reasoning on.
    "openai/gpt-6-luna": {"name": "GPT-6 Luna", "in": 0.10, "out": 0.50, "reasoning": True},
    "anthropic/claude-haiku-5.5": {"name": "Claude Haiku 5.5", "in": 0.10, "out": 0.50, "reasoning": False},
}
DEFAULT_MODELS = ["openai/gpt-6-luna", "anthropic/claude-haiku-5.5"]

SYSTEM = ("You evaluate rental listings. For each question, give the probability from 0 to 1 that the answer is "
          "yes, based only on the listing and its photo. Reply with JSON only.")


class LLMError(RuntimeError):
    pass


class LLM:
    def __init__(self, model: str, api_key: str | None = None):
        if model not in MODELS:
            raise LLMError(f"Unknown model {model!r}")
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise LLMError("OPENROUTER_API_KEY is not set. Add it to a .env file (see .env.example).")
        self.model = model
        self.name = MODELS[model]["name"]
        self._client = httpx.AsyncClient(timeout=120, headers={"Authorization": f"Bearer {self.api_key}"})

    async def close(self):
        await self._client.aclose()

    async def ask(self, state: dict, questions: dict[str, str], photo: str | None = None, retries: int = 4) -> dict:
        """Probability of yes for each question. Returns {"answers", "input_tokens", "output_tokens", "cost",
        "latency", "retries"}; `answers` is None if the reply couldn't be parsed."""
        schema = {"type": "object", "additionalProperties": False, "required": list(questions),
                  "properties": {k: {"type": "number", "minimum": 0, "maximum": 1} for k in questions}}
        listed = "\n".join(f"- {k}: {q}" for k, q in questions.items())
        text = f"Listing:\n{json.dumps({'uid': uuid.uuid4().hex, **state})}\n\nQuestions:\n{listed}"
        content = [{"type": "text", "text": text}]
        if photo:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{photo}"}})
        body = {
            "model": self.model, "temperature": 0, "usage": {"include": True},
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": content}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "answers", "strict": True, "schema": schema}},
        }
        if not MODELS[self.model].get("reasoning", True):
            body["reasoning"] = {"enabled": False}
        for attempt in range(retries + 1):
            start = time.perf_counter()
            try:
                resp = await self._client.post(URL, json=body)
            except httpx.TransportError as e:
                if attempt == retries:
                    log.warning("OpenRouter network error: %r", e)
                    raise LLMError("Network error reaching OpenRouter") from e
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            latency = time.perf_counter() - start
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                await asyncio.sleep(min(8.0, 0.5 * 2**attempt))
                continue
            if resp.status_code != 200:
                log.warning("OpenRouter HTTP %s (%s): %s", resp.status_code, self.model, resp.text[:1000])
                raise LLMError(f"OpenRouter returned HTTP {resp.status_code} {resp.reason_phrase}".rstrip())
            data = resp.json()
            usage = data.get("usage") or {}
            return {"answers": _parse(data, questions), "input_tokens": usage.get("prompt_tokens", 0),
                    "output_tokens": usage.get("completion_tokens", 0), "cost": usage.get("cost") or 0.0,
                    "latency": latency, "retries": attempt}
        raise LLMError("unreachable")


def _parse(data: dict, questions: dict) -> dict | None:
    try:
        text = data["choices"][0]["message"]["content"] or ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        raw = json.loads(text)
        return {k: min(1.0, max(0.0, float(raw[k]))) for k in questions}
    except (KeyError, IndexError, TypeError, ValueError):
        return None
