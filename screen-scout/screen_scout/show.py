"""Read a TV show episode or movie transcript from a local file.

Supply your own transcripts (ones you have the rights to use) as local
files; nothing is scraped on the fly.

Supports plain .txt (treated as flat prose) and .srt subtitles (timestamped).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from screen_scout.youtube import TranscriptSegment


@dataclass
class ShowScript:
    title: str
    source_path: Path
    segments: list[TranscriptSegment] = field(default_factory=list)
    raw_text: str = ""

    @property
    def has_timestamps(self) -> bool:
        return len(self.segments) > 0

    @property
    def full_text(self) -> str:
        if self.raw_text:
            return self.raw_text
        return " ".join(s.text for s in self.segments)

    @property
    def duration_seconds(self) -> float:
        if not self.segments:
            return 0.0
        return self.segments[-1].end


_SRT_TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)


def _srt_time_to_seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def _parse_srt(text: str) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        time_line = lines[1] if lines[0].isdigit() else lines[0]
        match = _SRT_TIME_RE.search(time_line)
        if not match:
            continue
        start = _srt_time_to_seconds(*match.group(1, 2, 3, 4))
        end = _srt_time_to_seconds(*match.group(5, 6, 7, 8))
        content_lines = lines[2:] if lines[0].isdigit() else lines[1:]
        content = " ".join(content_lines).strip()
        if not content:
            continue
        segments.append(
            TranscriptSegment(start=start, duration=max(end - start, 0.0), text=content)
        )
    return segments


def read_show(path: str | Path, title: str | None = None) -> ShowScript:
    """Load a show/movie transcript. Auto-detects .srt vs plain text."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"Transcript not found at {path}. "
            "Put your transcript file there before running."
        )

    text = path.read_text(encoding="utf-8", errors="replace")
    inferred_title = title or path.stem.replace("_", " ").replace("-", " ").title()

    if path.suffix.lower() == ".srt":
        segments = _parse_srt(text)
        return ShowScript(title=inferred_title, source_path=path, segments=segments)

    # Plain text (a script or transcript as flat prose)
    return ShowScript(title=inferred_title, source_path=path, raw_text=text)
