"""Analyze a whole series (directory of episode transcripts) as a grid.

Usage:
    uv run python scripts/analyze_series.py data/series/bluey
    uv run python scripts/analyze_series.py data/series/questionable --title "Mystery Channel"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console

from screen_scout.batch import analyze_series_batch
from screen_scout.grid_viewer import write_grid_html
from screen_scout.series import load_series

console = Console()


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze a directory of episode transcripts.")
    parser.add_argument("series_dir", type=Path, help="Directory containing episode transcripts.")
    parser.add_argument("--title", default=None, help="Override the inferred series title.")
    parser.add_argument("--out", type=Path, default=None, help="Where to write the grid HTML.")
    parser.add_argument(
        "--window-seconds", type=float, default=60.0,
        help="Window size for timestamped scripts.",
    )
    parser.add_argument(
        "--chunk-words", type=int, default=500,
        help="Word-count per chunk for plain-text scripts.",
    )
    args = parser.parse_args()

    console.rule(f"[bold cyan]Loading series from {args.series_dir}")
    series = load_series(args.series_dir, title=args.title)
    console.print(f"[bold]{series.title}[/]  —  {len(series.episodes)} episodes, "
                  f"{series.total_word_count:,} words")

    console.rule("[bold cyan]Analyzing each episode")
    batch = analyze_series_batch(
        series.episodes,
        batch_title=series.title,
        window_seconds=args.window_seconds,
        chunk_words=args.chunk_words,
    )

    for i, report in enumerate(batch.items):
        overall = report.categories_overall()
        max_cat = max(overall.items(), key=lambda kv: kv[1], default=(None, 0.0))
        max_label = f"{max_cat[0]}={max_cat[1]:.2f}" if max_cat[0] else "clean"
        age = report.recommended_min_age()
        console.print(f"  [cyan]#{i + 1:>2}[/] {report.source_title:<40} ages {age}+  "
                      f"max: [bold]{max_label}[/]")

    if batch.errors:
        console.print(f"\n[yellow]Skipped {len(batch.errors)} items[/]")
        for label, msg in batch.errors:
            console.print(f"  [dim]{label}[/]: {msg}")

    out_path = args.out or Path("out") / f"series_{args.series_dir.name}.html"
    write_grid_html(batch, out_path)
    console.print(f"\n[bold]Grid viewer written to:[/] {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
