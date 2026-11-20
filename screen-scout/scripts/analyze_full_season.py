"""Long-context mic drop: feed an entire series into Snap in ONE call.

Loads a series directory, concatenates all episodes with episode-break markers,
sends to Snap in a single state. Compare against per-episode analysis
(scripts/analyze_series.py) to show the context-length advantage: Snap can
reason across episodes (character arcs, recurring themes, cumulative content)
in one shot; Jev at 32K must chunk and misses cross-episode patterns.

Usage:
    uv run python scripts/analyze_full_season.py data/series/bluey
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from rich.console import Console

from screen_scout.analyzer import FLAG_THRESHOLD, ChunkResult, Report
from screen_scout.chunker import Chunk
from screen_scout.schema import build_full_question_set
from screen_scout.series import load_series
from screen_scout.snap_client import ask
from screen_scout.viewer import write_html

console = Console()

CROSS_EPISODE_PREAMBLE = (
    "You are analyzing an entire series or season of children's content "
    "in a single pass. Consider themes that develop across episodes "
    "(recurring characters, running jokes, cumulative emotional weight, "
    "escalating peril, repeated inappropriate content). Flag anything a "
    "parent would want to know about this series as a whole.\n\n"
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Feed an entire series into Snap in one call (long-context demo)."
    )
    parser.add_argument("series_dir", type=Path)
    parser.add_argument("--title", default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    console.rule(f"[bold cyan]Loading series from {args.series_dir}")
    series = load_series(args.series_dir, title=args.title)
    console.print(
        f"[bold]{series.title}[/]  —  {len(series.episodes)} episodes, "
        f"{series.total_word_count:,} words  (~{series.total_word_count // 4:,} tokens est.)"
    )

    full_text = CROSS_EPISODE_PREAMBLE + series.concatenated_text()

    console.rule("[bold cyan]Sending the whole series to Snap in ONE call")
    console.print("[dim]If this fails with a context-length error, the series exceeds Snap's budget. "
                  "Trim episodes or drop plain-text episodes to shorter chunks.[/]")

    t0 = time.time()
    response = ask(state=full_text, questions=build_full_question_set())
    elapsed = time.time() - t0
    console.print(f"[bold green]Done in {elapsed:.1f}s[/]")

    # Wrap the single response as a one-chunk Report for the viewer.
    chunk = Chunk(
        label=f"Full series ({len(series.episodes)} episodes)",
        text=full_text,
    )
    chunk_result = ChunkResult(chunk=chunk, flags=response.answers)
    report = Report(
        source_title=f"{series.title} — full series, single call",
        source_url=str(args.series_dir),
        chunk_results=[chunk_result],
    )

    overall = report.categories_overall()
    for cat, prob in sorted(overall.items(), key=lambda kv: -kv[1]):
        color = "red" if prob >= FLAG_THRESHOLD else "dim"
        console.print(f"  [{color}]{cat:<22}[/] {prob:.2f}")
    console.print(f"\n[bold green]Recommended minimum age (series-level):[/] "
                  f"{report.recommended_min_age()}+")

    out_path = args.out or Path("out") / f"full_series_{args.series_dir.name}.html"
    write_html(report, out_path)
    console.print(f"\n[bold]Viewer written to:[/] {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
