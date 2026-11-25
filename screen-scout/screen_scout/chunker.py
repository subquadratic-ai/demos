"""Split transcripts into windows for per-chunk Snap calls.

A "chunk" is a (start_label, text) pair. For YouTube/TV with timed segments
the label is "MM:SS - MM:SS". For plain-text sources (TV scripts, books)
the label is "part N" or chapter name.
"""

from __future__ import annotations

from dataclasses import dataclass

from screen_scout.youtube import TranscriptSegment, YouTubeVideo


@dataclass
class Chunk:
    label: str
    text: str
    start_seconds: float | None = None
    end_seconds: float | None = None


def _fmt_time(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes:02d}:{secs:02d}"


def chunk_youtube(
    video: YouTubeVideo,
    *,
    window_seconds: float = 60.0,
) -> list[Chunk]:
    """Group transcript segments into fixed-length time windows.

    One chunk per window. We don't split mid-segment; a chunk extends to
    include whichever segment pushes it past the window boundary. This
    keeps dialogue coherent and gives Snap a complete thought to judge.
    """
    chunks: list[Chunk] = []
    current: list[TranscriptSegment] = []
    current_start: float | None = None

    def _flush() -> None:
        if not current:
            return
        start = current_start or current[0].start
        end = current[-1].end
        text = " ".join(s.text for s in current).strip()
        chunks.append(
            Chunk(
                label=f"{_fmt_time(start)} - {_fmt_time(end)}",
                text=text,
                start_seconds=start,
                end_seconds=end,
            )
        )

    for seg in video.segments:
        if current_start is None:
            current_start = seg.start
        current.append(seg)
        if seg.end - current_start >= window_seconds:
            _flush()
            current = []
            current_start = None

    _flush()
    return chunks


def chunk_text(text: str, *, chunk_words: int = 500) -> list[Chunk]:
    """Split a plain-text transcript (e.g. TV script scrape) into word-count windows."""
    words = text.split()
    chunks: list[Chunk] = []
    for i in range(0, len(words), chunk_words):
        piece = " ".join(words[i : i + chunk_words])
        part = i // chunk_words + 1
        total = (len(words) + chunk_words - 1) // chunk_words
        chunks.append(Chunk(label=f"part {part}/{total}", text=piece))
    return chunks
