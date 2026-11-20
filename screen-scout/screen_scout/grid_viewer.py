"""Render a BatchReport as a grid of mini-reports.

Each item becomes a card showing: title, age-gate badge, max flag per
category as a mini bar. Clicking expands to the per-chunk timeline (same
layout as the single-item viewer, scoped to the card).
"""

from __future__ import annotations

from html import escape
from pathlib import Path

from screen_scout.analyzer import Report
from screen_scout.batch import BatchReport
from screen_scout.viewer import _AGE_KEYS, _CATEGORY_LABELS, _content_flags_only, _intensity_class


def _card(report: Report, idx: int) -> str:
    overall = _content_flags_only(report.categories_overall())
    max_prob = max(overall.values(), default=0.0)
    cls = _intensity_class(max_prob)
    min_age = report.recommended_min_age()

    rows = "".join(
        f'<div class="bar-row"><span class="bar-label">{_CATEGORY_LABELS.get(k, k)}</span>'
        f'<div class="bar"><div class="bar-fill {_intensity_class(v)}" style="width:{v * 100:.0f}%"></div></div>'
        f'<span class="bar-prob">{v:.0%}</span></div>'
        for k, v in sorted(overall.items(), key=lambda kv: -kv[1])
    )

    flagged_chunks = report.flagged_chunks()
    if flagged_chunks:
        chunk_html = "".join(
            f'<div class="flagged-chunk"><span class="flag-time">{escape(cr.chunk.label)}</span> '
            f'{escape(cr.chunk.text[:200])}{"…" if len(cr.chunk.text) > 200 else ""}</div>'
            for cr in flagged_chunks[:5]
        )
        flagged_section = (
            f'<details class="flagged"><summary>Flagged moments ({len(flagged_chunks)})</summary>'
            f'<div class="flagged-list">{chunk_html}</div></details>'
        )
    else:
        flagged_section = '<div class="no-flags">No flagged moments</div>'

    return (
        f'<div class="card {cls}">'
        f'<div class="card-head"><span class="card-idx">#{idx + 1}</span>'
        f'<span class="card-title">{escape(report.source_title)}</span></div>'
        f'<div class="card-age">Ages {min_age}+</div>'
        f'<div class="card-bars">{rows}</div>'
        f'{flagged_section}'
        f'</div>'
    )


def render_grid_html(batch: BatchReport) -> str:
    cards = "".join(_card(r, i) for i, r in enumerate(batch.items))

    error_html = ""
    if batch.errors:
        error_rows = "".join(
            f"<li><code>{escape(label)}</code>: {escape(msg)}</li>"
            for label, msg in batch.errors
        )
        error_html = (
            f'<div class="errors"><h3>Skipped ({len(batch.errors)})</h3>'
            f'<ul>{error_rows}</ul></div>'
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Screen Scout — {escape(batch.title)}</title>
<style>
  :root {{
    --bg: #0f1419;
    --panel: #171d26;
    --muted: #6b7a8f;
    --text: #e6ecf5;
    --accent: #58a6ff;
    --sev-none: #2d4a3e;
    --sev-low: #665514;
    --sev-med: #8b4a2b;
    --sev-high: #a93226;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg); color: var(--text);
    margin: 0; padding: 2rem;
    max-width: 1200px; margin-inline: auto;
  }}
  h1 {{ font-size: 1.4rem; margin: 0 0 .25rem; }}
  .subtitle {{ color: var(--muted); margin-bottom: 1.5rem; }}
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }}
  .card {{
    background: var(--panel);
    border-left: 4px solid var(--sev-none);
    border-radius: 6px;
    padding: 1rem;
  }}
  .card.sev-low  {{ border-left-color: var(--sev-low); }}
  .card.sev-med  {{ border-left-color: var(--sev-med); }}
  .card.sev-high {{ border-left-color: var(--sev-high); }}
  .card-head {{ display: flex; gap: .5rem; align-items: baseline; margin-bottom: .35rem; }}
  .card-idx {{ color: var(--muted); font-variant-numeric: tabular-nums; font-size: .85rem; }}
  .card-title {{ font-weight: 600; font-size: .95rem; }}
  .card-age {{
    display: inline-block;
    background: var(--accent); color: #0f1419;
    padding: .15rem .5rem; border-radius: 4px;
    font-size: .75rem; font-weight: 700;
    margin-bottom: .75rem;
  }}
  .card-bars {{ margin-bottom: .5rem; }}
  .bar-row {{
    display: grid;
    grid-template-columns: 110px 1fr 40px;
    align-items: center; gap: .5rem;
    font-size: .75rem; padding: .15rem 0;
  }}
  .bar-label {{ color: var(--muted); }}
  .bar {{ background: #0b0f14; height: 6px; border-radius: 3px; overflow: hidden; }}
  .bar-fill {{ height: 100%; }}
  .bar-fill.sev-none {{ background: var(--sev-none); }}
  .bar-fill.sev-low  {{ background: var(--sev-low); }}
  .bar-fill.sev-med  {{ background: var(--sev-med); }}
  .bar-fill.sev-high {{ background: var(--sev-high); }}
  .bar-prob {{ font-variant-numeric: tabular-nums; text-align: right; color: var(--muted); }}
  details.flagged {{ font-size: .8rem; margin-top: .5rem; }}
  details.flagged summary {{ cursor: pointer; color: var(--accent); }}
  .flagged-list {{ padding: .5rem 0; }}
  .flagged-chunk {{
    padding: .4rem; background: #0b0f14; border-radius: 3px;
    margin-top: .35rem; font-style: italic; color: var(--muted);
  }}
  .flag-time {{
    font-family: ui-monospace, monospace; font-style: normal;
    color: var(--text); margin-right: .35rem;
  }}
  .no-flags {{ font-size: .75rem; color: #4a5568; margin-top: .5rem; }}
  .errors {{
    margin-top: 2rem; padding: 1rem;
    background: #2a1a1a; border-radius: 6px;
  }}
  .errors h3 {{ margin: 0 0 .5rem; font-size: .9rem; }}
  .errors ul {{ margin: 0; padding-left: 1.25rem; font-size: .8rem; color: var(--muted); }}
  .errors code {{
    color: var(--text); background: #0b0f14;
    padding: .1rem .3rem; border-radius: 2px; font-size: .75rem;
  }}
  .brand {{
    margin-top: 3rem; padding-top: 1rem;
    border-top: 1px solid #202835;
    color: var(--muted); font-size: .8rem;
    text-align: center;
  }}
</style>
</head>
<body>
  <h1>{escape(batch.title)}</h1>
  <div class="subtitle">{len(batch.items)} items analyzed</div>
  <div class="grid">{cards}</div>
  {error_html}
  <div class="brand">Screen Scout · powered by SubQ Snap</div>
</body>
</html>
"""
    return html


def write_grid_html(batch: BatchReport, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_grid_html(batch), encoding="utf-8")
    return path
