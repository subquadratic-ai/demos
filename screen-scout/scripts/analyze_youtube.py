"""End-to-end run on a single YouTube video.

Fetches the transcript, chunks it into 60-second windows, calls Snap per
chunk, prints a per-chunk timeline + overall category rollup + recommended
minimum age.

Usage:
    uv run python scripts/analyze_youtube.py <youtube-url-or-id>

Example:
    uv run python scripts/analyze_youtube.py https://www.youtube.com/watch?v=XqZsoesa55w
"""

from __future__ import annotations

import sys

from rich.console import Console
from rich.table import Table

from screen_scout.analyzer import FLAG_THRESHOLD, analyze_chunks
from screen_scout.chunker import chunk_youtube
from screen_scout.viewer import write_html
from screen_scout.youtube import YouTubeFetchError, fetch_video

console = Console()


def main(url_or_id: str) -> int:
    console.rule(f"[bold cyan]Fetching {url_or_id}")
    try:
        video = fetch_video(url_or_id)
    except YouTubeFetchError as exc:
        console.print(f"[bold red]{exc}")
        return 1

    console.print(f"[bold]{video.title}[/]  —  {video.author}")
    console.print(f"Duration: {video.duration_seconds:.0f}s  |  Segments: {len(video.segments)}")

    chunks = chunk_youtube(video, window_seconds=60.0)
    console.print(f"Chunks: {len(chunks)}  (60s windows)")

    console.rule("[bold cyan]Running Snap per chunk")
    report = analyze_chunks(
        chunks,
        include_age_gates=True,
        source_title=video.title,
        source_url=video.url,
    )

    # Per-chunk timeline
    timeline = Table(title="Chunk timeline", show_lines=False)
    timeline.add_column("Window", style="cyan")
    timeline.add_column("Flags", style="bold")
    timeline.add_column("Max", justify="right")
    for cr in report.chunk_results:
        flagged = cr.flagged_categories()
        label = ", ".join(flagged) if flagged else "-"
        style = "red" if flagged else "dim green"
        timeline.add_row(cr.chunk.label, f"[{style}]{label}[/]", f"{cr.max_intensity:.2f}")
    console.print(timeline)

    # Overall rollup
    rollup = Table(title="Overall categories (max across chunks)")
    rollup.add_column("Category", style="cyan")
    rollup.add_column("Max probability", justify="right")
    rollup.add_column("Flagged", justify="center")
    for cat, prob in sorted(report.categories_overall().items(), key=lambda kv: -kv[1]):
        flagged = prob >= FLAG_THRESHOLD
        style = "bold red" if flagged else "dim"
        rollup.add_row(cat, f"{prob:.2f}", f"[{style}]{'YES' if flagged else '-'}[/]")
    console.print(rollup)

    min_age = report.recommended_min_age()
    console.print(f"\n[bold green]Recommended minimum age:[/] {min_age}+")

    from pathlib import Path as _Path
    out_path = _Path("out") / f"{video.video_id}.html"
    write_html(report, out_path)
    console.print(f"\n[bold]Viewer written to:[/] {out_path}")

    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: analyze_youtube.py <youtube-url-or-id>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
