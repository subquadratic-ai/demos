"""Smoke test: send one chunk of known-content text to Snap and print flags.

Run this first to confirm:
  1. SUBQ_API_KEY is set and valid
  2. The account has credits (no 402)
  3. Snap returns the expected `answers.<key>.noul` shape
  4. The question wording produces sensible probabilities on an obvious example

Usage:
    uv run python scripts/smoke_test.py
or
    python scripts/smoke_test.py
"""

from __future__ import annotations

from rich.console import Console
from rich.table import Table

from screen_scout.schema import build_full_question_set
from screen_scout.snap_client import SnapError, ask

console = Console()


SAMPLE_SCARY = (
    "The Other Mother smiled at Coraline. Her teeth were long and sharp. "
    "Where her eyes should have been were two large black buttons sewn into her skin. "
    "'Come here, my sweet,' she whispered. 'I have been waiting for you.' "
    "Coraline felt her heart pound. The walls of the room began to crawl with beetles."
)

SAMPLE_SAFE = (
    "Bluey and Bingo giggled as they chased each other around the garden. "
    "'Tag, you're it!' called Bluey, tapping her sister on the shoulder. "
    "Mum watched from the kitchen window and smiled. "
    "It was going to be a wonderful afternoon."
)


def _render(label: str, state: str) -> None:
    console.rule(f"[bold cyan]{label}")
    console.print(state, style="dim")
    try:
        result = ask(state=state, questions=build_full_question_set())
    except SnapError as exc:
        console.print(f"[bold red]Snap error:[/] {exc}")
        return

    table = Table(title="Snap flags", show_lines=False)
    table.add_column("Question", style="cyan")
    table.add_column("Probability", justify="right")
    table.add_column("Verdict", justify="center")

    for key, prob in sorted(result.answers.items(), key=lambda kv: -kv[1]):
        verdict = "FLAG" if prob >= 0.5 else "-"
        verdict_style = "bold red" if prob >= 0.5 else "dim green"
        table.add_row(key, f"{prob:.2f}", f"[{verdict_style}]{verdict}[/]")

    console.print(table)


def main() -> None:
    _render("SCARY sample (expect: scary=HIGH, violence=MEDIUM, difficult_themes=HIGH)", SAMPLE_SCARY)
    _render("SAFE sample (expect: nearly all flags LOW)", SAMPLE_SAFE)


if __name__ == "__main__":
    main()
