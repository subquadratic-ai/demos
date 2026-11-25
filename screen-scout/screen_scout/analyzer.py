"""Orchestrator: chunks + Snap calls → structured report.

Given a list of Chunks, calls Snap per chunk with the content question
set, and aggregates results into a Report that the viewer can render.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from screen_scout.chunker import Chunk
from screen_scout.schema import (
    AGE_GATE_QUESTIONS,
    build_content_only_question_set,
    build_full_question_set,
)
from screen_scout.snap_client import ask

FLAG_THRESHOLD = 0.5

# Age-gate answers ("appropriate for 13+" etc.) are suitability scores, not
# risks: a clean chunk scores ~1.0 on them. Keep them out of flagging.
AGE_KEYS = frozenset(AGE_GATE_QUESTIONS)


@dataclass
class ChunkResult:
    chunk: Chunk
    flags: dict[str, float]

    @property
    def risk_flags(self) -> dict[str, float]:
        """Content-risk categories only (age-gate scores removed)."""
        return {k: v for k, v in self.flags.items() if k not in AGE_KEYS}

    def flagged_categories(self, threshold: float = FLAG_THRESHOLD) -> list[str]:
        return [k for k, v in self.risk_flags.items() if v >= threshold]

    @property
    def max_intensity(self) -> float:
        return max(self.risk_flags.values(), default=0.0)


@dataclass
class Report:
    source_title: str
    source_url: str
    chunk_results: list[ChunkResult] = field(default_factory=list)

    def categories_overall(self) -> dict[str, float]:
        """Max probability per category across all chunks."""
        overall: dict[str, float] = {}
        for cr in self.chunk_results:
            for k, v in cr.flags.items():
                overall[k] = max(overall.get(k, 0.0), v)
        return overall

    def flagged_chunks(self, threshold: float = FLAG_THRESHOLD) -> list[ChunkResult]:
        return [cr for cr in self.chunk_results if cr.max_intensity >= threshold]

    def recommended_min_age(self) -> int:
        """Derive minimum age from content-flag intensities.

        Uses max probability per concerning category across all chunks. Higher
        thresholds here are deliberate — Snap's category scores are often
        inflated on normal kids content (pretend play looks like 'violence',
        family affection looks like 'romantic', 3D animation looks like 'AI').
        Require a strong signal to bump the age up.
        """
        if not self.chunk_results:
            return 16

        overall = self.categories_overall()
        scary = overall.get("scary", 0.0)
        violence = overall.get("violence", 0.0)
        sexual = overall.get("sexual_content", 0.0)
        profanity = overall.get("profanity", 0.0)
        difficult = overall.get("difficult_themes", 0.0)
        substance = overall.get("substance_use", 0.0)

        # 16+ — truly extreme content (>=0.9 in a serious category)
        if (scary >= 0.9 or violence >= 0.9 or sexual >= 0.9
                or profanity >= 0.9 or substance >= 0.8):
            return 16

        # 13+ — strong signal in a serious category
        if (scary >= 0.75 or violence >= 0.75 or sexual >= 0.7
                or profanity >= 0.7 or substance >= 0.6):
            return 13

        # 10+ — moderate signal, especially any clear romantic/dating content
        if (sexual >= 0.5 or scary >= 0.55 or violence >= 0.5
                or difficult >= 0.65 or profanity >= 0.5):
            return 10

        # 6+ — mild signal in any category
        if (scary >= 0.3 or violence >= 0.3 or difficult >= 0.4
                or sexual >= 0.25 or profanity >= 0.3):
            return 6

        # 3+ — all below mild thresholds
        return 3


def analyze_chunks(
    chunks: list[Chunk],
    *,
    include_age_gates: bool = True,
    source_title: str = "",
    source_url: str = "",
) -> Report:
    """Call Snap for each chunk and build the Report."""
    questions = (
        build_full_question_set() if include_age_gates else build_content_only_question_set()
    )
    results: list[ChunkResult] = []
    for chunk in chunks:
        response = ask(state=chunk.text, questions=questions)
        results.append(ChunkResult(chunk=chunk, flags=response.answers))
    return Report(
        source_title=source_title,
        source_url=source_url,
        chunk_results=results,
    )
