"""Render a Report to a single-file HTML page.

No frameworks, no build step — just an HTML string we can open in a browser
or screenshot for the demo video. Designed to look clean, show the timeline
clearly, and let viewers click a flagged chunk to see what Snap caught.
"""

from __future__ import annotations

from html import escape
from pathlib import Path

from screen_scout.analyzer import Report


_CATEGORY_LABELS = {
    "profanity": "Profanity",
    "violence": "Violence",
    "scary": "Scary content",
    "sexual_content": "Sexual content",
    "substance_use": "Substance use",
    "difficult_themes": "Difficult themes",
    "hidden_ads": "Hidden ads",
    "ai_generated": "AI-generated",
}

_AGE_KEYS = {
    "appropriate_under_6",
    "appropriate_6_to_9",
    "appropriate_10_to_12",
    "appropriate_13_plus",
}


def _intensity_class(prob: float) -> str:
    if prob >= 0.75:
        return "sev-high"
    if prob >= 0.5:
        return "sev-med"
    if prob >= 0.25:
        return "sev-low"
    return "sev-none"


def _content_flags_only(flags: dict) -> dict:
    return {k: v for k, v in flags.items() if k not in _AGE_KEYS}


def render_html(report: Report) -> str:
    overall = _content_flags_only(report.categories_overall())
    pills = "".join(
        f'<span class="pill {_intensity_class(prob)}">{_CATEGORY_LABELS.get(k, k)} '
        f'<span class="pill-prob">{prob:.0%}</span></span>'
        for k, prob in sorted(overall.items(), key=lambda kv: -kv[1])
        if prob >= 0.25
    )
    if not pills:
        pills = '<span class="pill sev-none">No concerns flagged</span>'

    chunk_rows = []
    for i, cr in enumerate(report.chunk_results):
        content_flags = _content_flags_only(cr.flags)
        max_prob = max(content_flags.values(), default=0.0)
        cls = _intensity_class(max_prob)
        label = escape(cr.chunk.label)
        detail_rows = "".join(
            f'<tr><td>{_CATEGORY_LABELS.get(k, k)}</td>'
            f'<td class="prob">{v:.0%}</td></tr>'
            for k, v in sorted(content_flags.items(), key=lambda kv: -kv[1])
        )
        preview = escape(cr.chunk.text[:400]) + ("…" if len(cr.chunk.text) > 400 else "")
        chunk_rows.append(
            f'<details class="chunk {cls}">'
            f'<summary><span class="chunk-label">{label}</span>'
            f'<span class="chunk-max">{max_prob:.0%}</span></summary>'
            f'<div class="chunk-body">'
            f'<table class="flag-table">{detail_rows}</table>'
            f'<div class="chunk-text">{preview}</div>'
            f'</div></details>'
        )

    min_age = report.recommended_min_age()

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Screen Scout — {escape(report.source_title)}</title>
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
    background: var(--bg);
    color: var(--text);
    margin: 0; padding: 2rem;
    max-width: 900px; margin-inline: auto;
  }}
  h1 {{ font-size: 1.4rem; margin: 0 0 .25rem; }}
  .subtitle {{ color: var(--muted); margin-bottom: 1.5rem; }}
  .age-badge {{
    display: inline-block;
    padding: .5rem 1rem;
    background: var(--accent);
    color: #0f1419;
    font-weight: 700;
    border-radius: 6px;
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }}
  .pills {{ margin-bottom: 2rem; }}
  .pill {{
    display: inline-block;
    padding: .35rem .75rem;
    border-radius: 999px;
    font-size: .9rem;
    margin: 0 .4rem .4rem 0;
    background: var(--sev-none);
  }}
  .pill-prob {{ opacity: .75; margin-left: .35rem; font-weight: 600; }}
  .sev-none {{ background: var(--sev-none); }}
  .sev-low  {{ background: var(--sev-low); }}
  .sev-med  {{ background: var(--sev-med); }}
  .sev-high {{ background: var(--sev-high); }}
  h2 {{ font-size: 1rem; margin-top: 2rem; color: var(--muted); font-weight: 600; }}
  .chunk {{
    background: var(--panel);
    margin-bottom: .5rem;
    border-left: 4px solid var(--sev-none);
    border-radius: 4px;
    overflow: hidden;
  }}
  .chunk.sev-low  {{ border-left-color: var(--sev-low); }}
  .chunk.sev-med  {{ border-left-color: var(--sev-med); }}
  .chunk.sev-high {{ border-left-color: var(--sev-high); }}
  .chunk summary {{
    display: flex; justify-content: space-between;
    padding: .75rem 1rem; cursor: pointer;
    list-style: none;
  }}
  .chunk summary::-webkit-details-marker {{ display: none; }}
  .chunk-label {{ font-family: ui-monospace, monospace; }}
  .chunk-max {{ opacity: .7; font-weight: 600; }}
  .chunk-body {{ padding: 0 1rem 1rem; }}
  .flag-table {{
    width: 100%; margin-bottom: .75rem; border-collapse: collapse;
    font-size: .85rem;
  }}
  .flag-table td {{ padding: .2rem 0; border-bottom: 1px solid #202835; }}
  .flag-table td.prob {{ text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }}
  .chunk-text {{
    font-size: .85rem; color: var(--muted);
    font-style: italic; white-space: pre-wrap;
    padding: .5rem; background: #0b0f14; border-radius: 3px;
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
  <h1>{escape(report.source_title)}</h1>
  <div class="subtitle">{escape(report.source_url)}</div>
  <div class="age-badge">Recommended for ages {min_age}+</div>
  <div class="pills">{pills}</div>
  <h2>Chunk timeline — click to see what Snap caught</h2>
  {''.join(chunk_rows)}
  <div class="brand">Screen Scout · powered by SubQ Snap</div>
</body>
</html>
"""
    return html


def write_html(report: Report, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_html(report), encoding="utf-8")
    return path
