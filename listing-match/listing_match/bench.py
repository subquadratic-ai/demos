"""Command-line race: prints progress, then a Markdown results table you can paste into a doc or report."""

import argparse
import asyncio

from dotenv import find_dotenv, load_dotenv
from rich.console import Console

from . import match
from .llm import DEFAULT_MODELS, MODELS
from .race import DEFAULT_CONCURRENCY, race


def parse_args():
    p = argparse.ArgumentParser(description="Screen a city's listings with SubQ and LLMs, and compare speed and cost.")
    p.add_argument("--city", default="austin", choices=[c["slug"] for c in match.cities()])
    p.add_argument("--preset", default="remote-work-dog", choices=list(match.PRESETS))
    p.add_argument("--listings", type=int, default=50)
    p.add_argument("--models", nargs="*", default=DEFAULT_MODELS, help=f"OpenRouter ids: {', '.join(MODELS)}")
    p.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    return p.parse_args()


def table(summary: dict) -> str:
    head = ("| Lane | Model | Listings | Wall time | p50 per listing | Input / output tokens | Cost | "
            "Slower than SubQ (wall / p50) | Costlier | Top-10 overlap | Rank corr. | Yes/no agreement |")
    lines = [head, "|" + "|".join("---" for _ in range(12)) + "|"]
    for r in summary["lanes"]:
        v = r.get("vs_subq") or {}
        lines.append(
            f"| {r['name']} | `{r['model']}` | {r['done'] - r['failures']}/{r['done']} | {r['wall']:.1f}s | {r['p50']:.2f}s | "
            f"{r['input_tokens']:,} / {r['output_tokens']:,} | ${r['cost']:.4f} | "
            + (f"{v['wall']:.1f}× / {v['p50']:.1f}× | {v['cost']:.1f}× | {v.get('top_overlap', '-')}/{v.get('top', '-')} | "
               f"{v.get('rank_correlation', '-')} | {v.get('yes_no_agreement', 0):.0%} |" if v else "– | – | – | – | – |"))
    return "\n".join(lines)


async def run(args):
    console = Console()
    load_dotenv(find_dotenv(usecwd=True))
    preset = match.PRESETS[args.preset]
    city = match.load_city(args.city)
    listings = match.candidates(city, preset["filters"], args.listings)
    criteria = match.criteria_from([{"id": i, "must": m} for i, m in preset["criteria"]])
    console.print(f"[bold]{city['city']}[/] · {preset['title']} · {len(listings)} listings · "
                  f"{len(criteria)} criteria · concurrency {args.concurrency}\n")

    def on_event(e):
        if e["type"] == "lane_done":
            console.print(f"  {e['name']:<18} done in {e['wall']:5.1f}s  p50 {e['p50']:.2f}s  "
                          f"${e['cost']:.4f}  failures {e['failures']}  retries {e['retries']}")
        elif e["type"] == "error":
            console.print(f"[red]{e['lane']}: {e['text']}[/]")

    summary = await race(listings, criteria, args.models, args.concurrency, on_event, trip=match.trip_context(preset["filters"]))
    by_id = {l["id"]: l for l in listings}
    console.print("\n[bold]SubQ's top 5[/]")
    for i, lid in enumerate(summary["subq_top"][:5], 1):
        console.print(f"  {i}. {by_id[lid]['name']}  [dim]${by_id[lid]['price']}/night · {by_id[lid]['neighbourhood']}[/]")
    print("\n" + table(summary))


def main():
    asyncio.run(run(parse_args()))


if __name__ == "__main__":
    main()
