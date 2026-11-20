"""One-command demo runner: analyzes both series and the full-series mic drop.

Runs every piece end-to-end against the sample data so you can see the full
output before polishing.

Order of operations:
  1. Smoke test (text-only) — confirms Snap wiring
  2. Analyze Bluey series — grid viewer, expect mostly green
  3. Analyze Concerning series — grid viewer, expect flags
  4. Full-series Snap call on Concerning — the long-context mic drop

Usage:
    uv run python scripts/run_demo.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from rich.console import Console

console = Console()

STEPS = [
    ("Smoke test (Snap wiring + question tuning)",
     [sys.executable, "scripts/smoke_test.py"]),
    ("Blippi (expect clean, age 3+)",
     [sys.executable, "scripts/analyze_series.py", "data/series/blippi", "--title", "Blippi"]),
    ("Vlad and Niki (expect clean, age 3+)",
     [sys.executable, "scripts/analyze_series.py", "data/series/vlad_and_niki",
      "--title", "Vlad and Niki"]),
    ("Tween romance (expect sexual_content flag, age 10+)",
     [sys.executable, "scripts/analyze_series.py", "data/series/tween_romance",
      "--title", "Gacha Life love stories"]),
    ("Mislabeled as kids (expect scary/violence flags, age 13+)",
     [sys.executable, "scripts/analyze_series.py", "data/series/mislabeled_as_kids",
      "--title", "Mislabeled as kid content"]),
    ("Full-series one-call on mislabeled (long-context mic drop)",
     [sys.executable, "scripts/analyze_full_season.py", "data/series/mislabeled_as_kids",
      "--title", "Mislabeled as kid content"]),
]


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    for name, cmd in STEPS:
        console.rule(f"[bold cyan]{name}")
        result = subprocess.run(cmd, cwd=repo_root)
        if result.returncode != 0:
            console.print(f"[bold red]Step failed: {name}[/]")
            return result.returncode
        console.print()
    console.rule("[bold green]Demo run complete")
    console.print("Open the HTML files in [bold]out/[/] to see the viewers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
