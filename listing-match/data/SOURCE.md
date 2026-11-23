# Data source

The listing files in this folder are trimmed samples of [Inside Airbnb](https://insideairbnb.com/) data,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Each city file is 300 listings drawn
at random (seed 42) from listings with at least a 400-character description, a price and 3 or more reviews.
HTML is stripped, and only the fields the demo uses are kept.

| City | Snapshot |
|---|---|
| Austin, TX | 2026-06-22 |
| Asheville, NC | 2026-06-25 |
| San Diego, CA | 2026-06-27 |

Rebuild with `uv run python scripts/build_dataset.py`. The snapshot URLs are in that script.
