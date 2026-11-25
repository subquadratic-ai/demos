"""Batch-analyze multiple items (YouTube videos OR local episodes) and
produce one Report per item for grid rendering.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from screen_scout.analyzer import Report, analyze_chunks
from screen_scout.chunker import chunk_text, chunk_youtube
from screen_scout.show import ShowScript
from screen_scout.youtube import YouTubeFetchError, YouTubeVideo, fetch_video


@dataclass
class BatchReport:
    title: str
    items: list[Report] = field(default_factory=list)
    errors: list[tuple[str, str]] = field(default_factory=list)  # (item_label, error_msg)


def _youtube_to_report(video: YouTubeVideo, *, window_seconds: float = 60.0) -> Report:
    chunks = chunk_youtube(video, window_seconds=window_seconds)
    return analyze_chunks(
        chunks,
        include_age_gates=True,
        source_title=video.title,
        source_url=video.url,
    )


def _show_to_report(
    show: ShowScript,
    *,
    window_seconds: float = 60.0,
    chunk_words: int = 500,
) -> Report:
    if show.has_timestamps:
        pseudo = YouTubeVideo(
            video_id=show.source_path.stem,
            url=str(show.source_path),
            title=show.title,
            author="",
            thumbnail_url="",
            segments=show.segments,
        )
        chunks = chunk_youtube(pseudo, window_seconds=window_seconds)
    else:
        chunks = chunk_text(show.full_text, chunk_words=chunk_words)
    return analyze_chunks(
        chunks,
        include_age_gates=True,
        source_title=show.title,
        source_url=str(show.source_path),
    )


def analyze_youtube_batch(
    urls_or_ids: list[str],
    *,
    batch_title: str = "YouTube batch",
    window_seconds: float = 60.0,
) -> BatchReport:
    batch = BatchReport(title=batch_title)
    for url in urls_or_ids:
        try:
            video = fetch_video(url)
            report = _youtube_to_report(video, window_seconds=window_seconds)
            batch.items.append(report)
        except YouTubeFetchError as exc:
            batch.errors.append((url, str(exc)))
        except Exception as exc:  # noqa: BLE001 — demo robustness
            batch.errors.append((url, f"{type(exc).__name__}: {exc}"))
    return batch


def analyze_series_batch(
    shows: list[ShowScript],
    *,
    batch_title: str = "Series",
    window_seconds: float = 60.0,
    chunk_words: int = 500,
) -> BatchReport:
    batch = BatchReport(title=batch_title)
    for show in shows:
        try:
            report = _show_to_report(
                show, window_seconds=window_seconds, chunk_words=chunk_words
            )
            batch.items.append(report)
        except Exception as exc:  # noqa: BLE001
            batch.errors.append((show.title, f"{type(exc).__name__}: {exc}"))
    return batch
