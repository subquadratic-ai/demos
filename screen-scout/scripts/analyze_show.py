"""End-to-end run on a locally-stored show/movie transcript.

Expects you've dropped the script in data/samples/ (e.g.
data/samples/coraline.txt). Runs Snap per chunk, writes an HTML viewer.

Usage:
    uv run python scripts/analyze_show.py data/samples/coraline.txt
    uv run python scripts/analyze_show.py data/samples/coraline.srt --title "Coraline"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console

from screen_scout.analyzer import analyze_chunks
from screen_scout.chunker import chunk_text, chunk_youtube
from screen_scout.show import read_show
from screen_scout.viewer import write_html
from screen_scout.youtube import YouTubeVideo

console = Console()


def _as_pseudo_video(script) -> YouTubeVideo:
    """Treat a timestamped script like a YouTube video for the chunker."""
    return YouTubeVideo(
        video_id=script.source_path.stem,
        url=str(script.source_path),
        title=script.title,
        author="",
        thumbnail_url="",
        segments=script.segments,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze a local show/movie script with SubQ Snap.")
    parser.add_argument("path", type=Path, help="Path to the transcript (.txt or .srt).")
    parser.add_argument("--title", default=None, help="Override the inferred title.")
    parser.add_argument(
        "--window-seconds",
        type=float,
        default=60.0,
        help="Window size for timestamped scripts (default 60s).",
    )
    parser.add_argument(
        "--chunk-words",
        type=int,
        default=500,
        help="Word-count per chunk for plain-text scripts (default 500).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Where to write the HTML viewer (default out/<stem>.html).",
    )
    args = parser.parse_args()

    console.rule(f"[bold cyan]Reading {args.path}")
    try:
        script = read_show(args.path, title=args.title)
    except FileNotFoundError as exc:
        console.print(f"[bold red]{exc}[/]")
        return 1
    console.print(f"[bold]{script.title}[/]")

    if script.has_timestamps:
        console.print(f"Timestamped script: {len(script.segments)} segments, "
                      f"{script.duration_seconds:.0f}s")
        chunks = chunk_youtube(_as_pseudo_video(script), window_seconds=args.window_seconds)
    else:
        words = len(script.full_text.split())
        console.print(f"Plain-text script: {words} words")
        chunks = chunk_text(script.full_text, chunk_words=args.chunk_words)

    console.print(f"Chunks: {len(chunks)}")
    console.rule("[bold cyan]Running Snap per chunk (this may take a minute)")
    report = analyze_chunks(
        chunks,
        include_age_gates=True,
        source_title=script.title,
        source_url=str(script.source_path),
    )

    overall = report.categories_overall()
    for cat, prob in sorted(overall.items(), key=lambda kv: -kv[1]):
        color = "red" if prob >= 0.5 else "dim"
        console.print(f"  [{color}]{cat:<22}[/] {prob:.2f}")
    console.print(f"\n[bold green]Recommended minimum age:[/] {report.recommended_min_age()}+")

    out_path = args.out or Path("out") / f"{args.path.stem}.html"
    written = write_html(report, out_path)
    console.print(f"\n[bold]Viewer written to:[/] {written}")
    console.print("Open it in a browser or screenshot for the demo video.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
