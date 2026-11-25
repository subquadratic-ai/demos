"""Load a directory of episode transcripts as a series.

A "series" is any directory containing one transcript file per episode.
Files are sorted alphabetically — name them like `s01e01_pilot.txt`,
`s01e02_...` to keep order sensible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from screen_scout.show import ShowScript, read_show


@dataclass
class Series:
    title: str
    source_dir: Path
    episodes: list[ShowScript] = field(default_factory=list)

    @property
    def total_duration_seconds(self) -> float:
        return sum(ep.duration_seconds for ep in self.episodes)

    @property
    def total_word_count(self) -> int:
        return sum(len(ep.full_text.split()) for ep in self.episodes)

    def concatenated_text(self, episode_separator: str = "\n\n--- EPISODE BREAK ---\n\n") -> str:
        parts = []
        for ep in self.episodes:
            parts.append(f"[EPISODE: {ep.title}]\n{ep.full_text}")
        return episode_separator.join(parts)


_SUPPORTED_SUFFIXES = {".txt", ".srt", ".vtt"}


def load_series(dir_path: str | Path, title: str | None = None) -> Series:
    """Load every supported transcript file in a directory as one Series."""
    dir_path = Path(dir_path)
    if not dir_path.is_dir():
        raise FileNotFoundError(
            f"Series directory not found: {dir_path}. "
            "Create it and drop episode transcripts inside."
        )

    files = sorted(
        p for p in dir_path.iterdir()
        if p.is_file() and p.suffix.lower() in _SUPPORTED_SUFFIXES
    )
    if not files:
        raise FileNotFoundError(
            f"No transcript files found in {dir_path}. "
            f"Supported suffixes: {sorted(_SUPPORTED_SUFFIXES)}"
        )

    episodes = [read_show(f) for f in files]
    inferred_title = title or dir_path.name.replace("_", " ").replace("-", " ").title()
    return Series(title=inferred_title, source_dir=dir_path, episodes=episodes)
