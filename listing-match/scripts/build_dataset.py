"""Download Inside Airbnb listing snapshots and write the trimmed city files in data/.

Usage: uv run python scripts/build_dataset.py [--per-city 300]

Inside Airbnb data is licensed CC BY 4.0 (https://insideairbnb.com/data-policies/). See data/SOURCE.md.
"""

import argparse
import csv
import gzip
import html
import io
import json
import random
import re
from pathlib import Path

import httpx

CITIES = {
    "austin": ("Austin, TX", "https://data.insideairbnb.com/united-states/tx/austin/2026-06-22/data/listings.csv.gz"),
    "asheville": ("Asheville, NC", "https://data.insideairbnb.com/united-states/nc/asheville/2026-06-25/data/listings.csv.gz"),
    "san-diego": ("San Diego, CA", "https://data.insideairbnb.com/united-states/ca/san-diego/2026-06-27/data/listings.csv.gz"),
}
DATA = Path(__file__).resolve().parent.parent / "data"
MIN_DESCRIPTION = 400


def clean(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", text)).strip()


def number(value: str) -> float | None:
    try:
        return float(re.sub(r"[^0-9.]", "", value)) if value and re.search(r"\d", value) else None
    except ValueError:
        return None


def listing(row: dict) -> dict | None:
    description = clean(row.get("description", ""))
    price = number(row.get("price", ""))
    if len(description) < MIN_DESCRIPTION or not price or not row.get("number_of_reviews", "0").isdigit() \
            or int(row["number_of_reviews"]) < 3:
        return None
    try:
        amenities = json.loads(row.get("amenities") or "[]")
    except json.JSONDecodeError:
        amenities = []
    bedrooms = number(row.get("bedrooms", ""))
    return {
        "id": row["id"],
        "name": clean(row.get("name", "")),
        "url": row.get("listing_url", ""),
        "picture": row.get("picture_url", ""),
        "neighbourhood": clean(row.get("neighbourhood_cleansed", "")),
        "room_type": row.get("room_type", ""),
        "property_type": row.get("property_type", ""),
        "accommodates": int(number(row.get("accommodates", "")) or 0),
        "bedrooms": int(bedrooms) if bedrooms is not None else None,
        "price": round(price),
        "rating": number(row.get("review_scores_rating", "")),
        "reviews": int(row["number_of_reviews"]),
        "description": description,
        "neighborhood_overview": clean(row.get("neighborhood_overview", "")),
        "amenities": sorted({clean(a) for a in amenities if a})[:80],
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--per-city", type=int, default=300)
    args = p.parse_args()
    DATA.mkdir(exist_ok=True)
    for slug, (label, url) in CITIES.items():
        raw = httpx.get(url, timeout=120, follow_redirects=True).content
        rows = csv.DictReader(io.StringIO(gzip.decompress(raw).decode("utf-8")))
        pool = [l for l in map(listing, rows) if l]
        random.Random(42).shuffle(pool)  # a stable sample, not just the oldest listings
        picked = sorted(pool[: args.per_city], key=lambda l: int(l["id"]))
        out = {"city": label, "slug": slug, "source": url, "listings": picked}
        path = DATA / f"{slug}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        print(f"{label}: {len(pool)} eligible, wrote {len(picked)} to {path.name} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
