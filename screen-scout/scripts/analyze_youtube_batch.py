"""Analyze a list of YouTube videos as a grid.

Pass either a text file (one URL per line) or URLs as CLI args.

Usage:
    uv run python scripts/analyze_youtube_batch.py --urls-file data/samples/kids_channel.txt
    uv run python scripts/analyze_youtube_batch.py https://youtu.be/XqZsoesa55w https://youtu.be/...
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console

from screen_scout.batch import analyze_youtube_batch
from screen_scout.grid_viewer import write_grid_html

console = Console()


def _load_urls(args) -> list[str]:
    if args.urls_file:
        text = Path(args.urls_file).read_text(encoding="utf-8")
        return [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
    return args.urls


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze a batch of YouTube videos.")
    parser.add_argument("urls", nargs="*", help="YouTube URLs or video IDs (positional).")
    parser.add_argument("--urls-file", type=Path, default=None,
                        help="File containing one URL per line (comments with # allowed).")
    parser.add_argument("--title", default="YouTube batch", help="Grid title.")
    parser.add_argument("--out", type=Path, default=None, help="Output HTML path.")
    parser.add_argument("--window-seconds", type=float, default=60.0,
                        help="Chunk window size.")
    args = parser.parse_args()

    urls = _load_urls(args)
    if not urls:
        parser.error("Provide URLs via positional args or --urls-file.")

    console.rule(f"[bold cyan]Analyzing {len(urls)} YouTube videos")
    batch = analyze_youtube_batch(
        urls, batch_title=args.title, window_seconds=args.window_seconds,
    )

    for i, report in enumerate(batch.items):
        overall = report.categories_overall()
        max_cat = max(overall.items(), key=lambda kv: kv[1], default=(None, 0.0))
        max_label = f"{max_cat[0]}={max_cat[1]:.2f}" if max_cat[0] else "clean"
        age = report.recommended_min_age()
        console.print(f"  [cyan]#{i + 1:>2}[/] {report.source_title:<50} ages {age}+  "
                      f"max: [bold]{max_label}[/]")

    if batch.errors:
        console.print(f"\n[yellow]Skipped {len(batch.errors)} videos[/]")
        for label, msg in batch.errors:
            console.print(f"  [dim]{label}[/]: {msg}")

    out_path = args.out or Path("out") / f"youtube_batch_{args.title.lower().replace(' ', '_')}.html"
    write_grid_html(batch, out_path)
    console.print(f"\n[bold]Grid viewer written to:[/] {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
