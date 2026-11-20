"""Screen Scout — interactive web app.

Paste a YouTube URL, watch Snap analyze it in real time, see the
age-rating + category flags + per-chunk timeline right in the browser.

Run:
    uv run streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import time
from pathlib import Path

import streamlit as st
from PIL import Image

_LOGO_PATH = Path(__file__).parent / "assets" / "snap-logo.png"
_LOGO = Image.open(_LOGO_PATH) if _LOGO_PATH.exists() else None

from screen_scout.analyzer import FLAG_THRESHOLD, ChunkResult, Report
from screen_scout.chunker import chunk_youtube
from screen_scout.schema import build_full_question_set
from screen_scout.snap_client import SnapError, ask
from screen_scout.summary import Summary, build_summary
from screen_scout.youtube import (
    YouTubeFetchError,
    YouTubeVideo,
    fetch_playlist_video_ids,
    fetch_video,
    is_playlist_url,
)

st.set_page_config(
    page_title="Screen Scout — powered by SubQ Snap",
    page_icon=_LOGO if _LOGO is not None else "🧐",
    layout="wide",
)


# ---------- Styling ----------
st.markdown(
    """
    <style>
      .stApp { background: #000000; color: #e6ecf5; }
      /* Streamlit wraps content in a few divs that have their own backgrounds;
         force them to pure black too so the logo and header blend seamlessly. */
      [data-testid="stAppViewContainer"],
      [data-testid="stHeader"],
      [data-testid="stMain"] { background: #000000 !important; }
      h1, h2, h3 { color: #e6ecf5; }
      .age-badge {
        display: inline-block; padding: .75rem 1.5rem;
        background: #58a6ff; color: #0f1419;
        font-weight: 700; font-size: 1.3rem;
        border-radius: 8px; margin: 1rem 0;
      }
      .flag-pill {
        display: inline-block; padding: .5rem 1rem;
        border-radius: 999px; font-size: .9rem;
        margin: .3rem; font-weight: 600;
      }
      .sev-none { background: #2d4a3e; color: #e6ecf5; }
      .sev-low  { background: #665514; color: #fff; }
      .sev-med  { background: #8b4a2b; color: #fff; }
      .sev-high { background: #a93226; color: #fff; }
      .chunk-card {
        background: #171d26; padding: 1rem; margin: .5rem 0;
        border-left: 4px solid #2d4a3e; border-radius: 4px;
      }
      .chunk-card.sev-med  { border-left-color: #8b4a2b; }
      .chunk-card.sev-high { border-left-color: #a93226; }
      .verdict {
        padding: 1.25rem 1.5rem;
        border-radius: 10px;
        margin: 1rem 0 1.5rem;
        font-size: 1.1rem;
        line-height: 1.5;
      }
      .verdict.v-safe       { background: #1e3a2a; border-left: 6px solid #2e7d4a; }
      .verdict.v-mislabeled { background: #3d1d1d; border-left: 6px solid #c0392b; }
      .verdict.v-neutral    { background: #1a2432; border-left: 6px solid #58a6ff; }
      .verdict.v-borderline { background: #332817; border-left: 6px solid #d9a441; }
      .verdict-headline { font-weight: 700; font-size: 1.25rem; margin-bottom: .5rem; }
      .verdict-detail   { color: #c7d1de; font-size: .95rem; }

      /* Streamlit button styling for dark theme.
         Primary button (Analyze) keeps its default blue. Secondary buttons
         (the pre-vetted example shortcuts) get dark-friendly styling. */
      div.stButton > button {
        background-color: #171d26 !important;
        color: #e6ecf5 !important;
        border: 1px solid #2d3748 !important;
        transition: all 0.15s ease-in-out;
      }
      div.stButton > button:hover {
        background-color: #202835 !important;
        border-color: #58a6ff !important;
        color: #58a6ff !important;
      }
      /* Primary button override — SubQ Snap blue stays */
      div.stButton > button[kind="primary"] {
        background-color: #58a6ff !important;
        color: #0f1419 !important;
        border-color: #58a6ff !important;
        font-weight: 700;
      }
      div.stButton > button[kind="primary"]:hover {
        background-color: #4a9eff !important;
        color: #0f1419 !important;
      }
      /* Make the text input visible on the dark bg */
      div.stTextInput input {
        background-color: #171d26 !important;
        color: #e6ecf5 !important;
        border: 1px solid #2d3748 !important;
      }
      div.stTextInput input:focus {
        border-color: #58a6ff !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------- Category metadata ----------
CATEGORY_LABELS = {
    "profanity": "Profanity",
    "violence": "Violence",
    "scary": "Scary content",
    "sexual_content": "Romantic / sexual content",
    "substance_use": "Substance use",
    "difficult_themes": "Difficult themes",
    "hidden_ads": "Hidden ads",
    "ai_generated": "AI-generated",
}
AGE_KEYS = {
    "appropriate_under_6",
    "appropriate_6_to_9",
    "appropriate_10_to_12",
    "appropriate_13_plus",
}


def intensity_class(prob: float) -> str:
    if prob >= 0.75:
        return "sev-high"
    if prob >= 0.5:
        return "sev-med"
    if prob >= 0.25:
        return "sev-low"
    return "sev-none"


def content_only(flags: dict) -> dict:
    return {k: v for k, v in flags.items() if k not in AGE_KEYS}


# ---------- Header ----------
header_logo, header_text = st.columns([1, 6], vertical_alignment="center")
with header_logo:
    if _LOGO is not None:
        st.image(_LOGO, width=140)
with header_text:
    st.title("🧐 Screen Scout")
    st.caption(
        "**Detective mode for kids content.** Paste a YouTube **video** or **playlist URL** — "
        "Snap reads the transcript, cross-checks it against the age YouTube claims, and tells "
        "you what's actually in there. Powered by **SubQ Snap**."
    )

# ---------- Input ----------
col_a, col_b = st.columns([5, 1])
with col_a:
    url = st.text_input(
        "YouTube URL",
        placeholder="https://www.youtube.com/watch?v=...",
        label_visibility="collapsed",
    )
with col_b:
    go = st.button("Analyze", type="primary", use_container_width=True)


# ---------- Example buttons ----------
st.markdown("##### Try one of the pre-vetted examples:")
ex_cols = st.columns(4)
examples = [
    ("Blippi (clean)", "https://www.youtube.com/watch?v=Gh-XKNuvvC4"),
    ("Vlad and Niki (clean)", "https://www.youtube.com/watch?v=w56LleQggFs"),
    ("Gacha Life love story", "https://www.youtube.com/watch?v=QcjXGh0cpkA"),
    ("DHMIS (mislabeled)", "https://www.youtube.com/watch?v=z6tuTP29Zto"),
]
for col, (label, ex_url) in zip(ex_cols, examples):
    with col:
        if st.button(label, use_container_width=True):
            url = ex_url
            go = True


# ---------- Pipeline ----------
_VERDICT_CSS = {
    "safe-and-marketed-safe": "v-safe",
    "mislabeled": "v-mislabeled",
    "unmarketed-neutral": "v-neutral",
    "borderline": "v-borderline",
}


def analyze_one(
    video_url: str,
    progress_label: str = "Analyzing",
    *,
    max_chunks: int | None = None,
) -> tuple[YouTubeVideo, Report] | None:
    """Fetch + analyze one video. Returns (video, report) or None on error.

    - `max_chunks` optionally caps the number of 60s windows analyzed per video,
      useful for playlist runs over long compilation episodes.
    - Individual chunk failures are logged and skipped (rather than killing
      the whole run) so transient Snap timeouts don't throw away work.
    """
    try:
        video = fetch_video(video_url)
    except YouTubeFetchError as exc:
        st.error(f"Could not fetch {video_url}: {exc}")
        return None

    chunks = chunk_youtube(video, window_seconds=60.0)
    if max_chunks is not None and len(chunks) > max_chunks:
        total_before = len(chunks)
        chunks = chunks[:max_chunks]
        st.caption(
            f"⚠️ Long video — capping at first {max_chunks} chunks "
            f"({max_chunks} min of {total_before} min total)."
        )

    progress = st.progress(0.0, text=f"{progress_label}: starting Snap…")
    chunk_results: list[ChunkResult] = []
    failed_chunks: list[tuple[int, str]] = []
    questions = build_full_question_set()
    for i, chunk in enumerate(chunks, 1):
        progress.progress(
            i / len(chunks),
            text=f"{progress_label}: Snap chunk {i}/{len(chunks)} — window {chunk.label}",
        )
        try:
            response = ask(state=chunk.text, questions=questions)
            chunk_results.append(ChunkResult(chunk=chunk, flags=response.answers))
        except SnapError as exc:
            failed_chunks.append((i, str(exc)))
            # Keep going — a single timeout shouldn't trash a whole playlist run.
            continue
    progress.empty()

    if failed_chunks:
        st.warning(
            f"⚠️ {len(failed_chunks)} of {len(chunks)} chunk(s) failed and were skipped. "
            f"First failure: chunk {failed_chunks[0][0]}: {failed_chunks[0][1]}"
        )

    if not chunk_results:
        st.error(f"All chunks failed for {video.title}. Nothing to report.")
        return None

    return video, Report(
        source_title=video.title,
        source_url=video.url,
        chunk_results=chunk_results,
    )


def render_verdict(summary: Summary) -> None:
    cls = _VERDICT_CSS.get(summary.verdict, "v-neutral")
    st.markdown(
        f'<div class="verdict {cls}">'
        f'<div class="verdict-headline">{summary.headline}</div>'
        f'<div class="verdict-detail">{summary.detail}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )


def render_single_report(video: YouTubeVideo, report: Report) -> None:
    summary = build_summary(report, title=video.title, author=video.author)

    header_col1, header_col2 = st.columns([1, 3])
    with header_col1:
        if video.thumbnail_url:
            st.image(video.thumbnail_url, use_container_width=True)
    with header_col2:
        st.markdown(f"### [{video.title}]({video.url})")
        st.caption(f"{video.author} · {video.duration_seconds:.0f}s · {len(report.chunk_results)} chunks")
        st.caption(f"🔗 [{video.url}]({video.url})")
        # YouTube's own public claim about the video
        fs = video.is_family_safe
        if fs is True:
            fs_badge = "🟢 YouTube says: Family Safe"
        elif fs is False:
            fs_badge = "🔴 YouTube says: NOT Family Safe"
        else:
            fs_badge = "⚪ YouTube: no public safety claim"
        cat = f" · Category: *{video.category}*" if video.category else ""
        st.markdown(f"**{fs_badge}**{cat}")

    render_verdict(summary)

    min_age = summary.min_age
    st.markdown(
        f'<div class="age-badge">Recommended for ages {min_age}+</div>',
        unsafe_allow_html=True,
    )

    overall = content_only(report.categories_overall())
    pills = "".join(
        f'<span class="flag-pill {intensity_class(p)}">'
        f'{CATEGORY_LABELS.get(k, k)} · {p:.0%}</span>'
        for k, p in sorted(overall.items(), key=lambda kv: -kv[1])
        if p >= 0.25
    )
    if not pills:
        pills = '<span class="flag-pill sev-none">No concerns flagged</span>'
    st.markdown(pills, unsafe_allow_html=True)

    st.markdown("### Timeline — moments Snap flagged")
    flagged = report.flagged_chunks()
    if not flagged:
        st.success("No individual chunks flagged above threshold. This content looks clean throughout.")
    else:
        for cr in flagged:
            fc = content_only(cr.flags)
            top = sorted(fc.items(), key=lambda kv: -kv[1])[:4]
            top_badges = " ".join(
                f'<span class="flag-pill {intensity_class(v)}">{CATEGORY_LABELS.get(k, k)} {v:.0%}</span>'
                for k, v in top if v >= 0.25
            )
            text = cr.chunk.text[:400] + ("…" if len(cr.chunk.text) > 400 else "")
            st.markdown(
                f'<div class="chunk-card {intensity_class(cr.max_intensity)}">'
                f'<strong>Window {cr.chunk.label}</strong><br>'
                f'{top_badges}<br><br>'
                f'<em style="color:#8b9bb0">{text}</em>'
                f'</div>',
                unsafe_allow_html=True,
            )

    with st.expander("Full category rollup (overall probabilities)"):
        rows = sorted(overall.items(), key=lambda kv: -kv[1])
        st.table({"Category": [CATEGORY_LABELS.get(k, k) for k, _ in rows],
                  "Probability": [f"{v:.0%}" for _, v in rows]})


def run_playlist(url: str, limit: int = 10) -> None:
    """Playlist mode: fetch IDs, analyze each, show per-episode verdict + summary table."""
    try:
        video_ids = fetch_playlist_video_ids(url, limit=limit)
    except YouTubeFetchError as exc:
        st.error(str(exc))
        return

    st.info(
        f"Playlist contains {len(video_ids)} videos (limited to {limit}). "
        "Each video is capped at 30 chunks (first 30 min) for playlist mode to "
        "keep Snap credit usage sane. Analyzing each…"
    )
    results: list[tuple[YouTubeVideo, Report, Summary]] = []
    for idx, vid in enumerate(video_ids, 1):
        st.markdown(f"#### Episode {idx} of {len(video_ids)}")
        pair = analyze_one(
            f"https://www.youtube.com/watch?v={vid}",
            progress_label=f"Episode {idx}/{len(video_ids)}",
            max_chunks=30,
        )
        if pair is None:
            continue
        video, report = pair
        summary = build_summary(
            report,
            title=video.title,
            author=video.author,
            youtube_family_safe=video.is_family_safe,
            youtube_category=video.category,
        )
        results.append((video, report, summary))

        thumb_col, verdict_col = st.columns([1, 4])
        with thumb_col:
            if video.thumbnail_url:
                st.image(video.thumbnail_url, use_container_width=True)
        with verdict_col:
            st.markdown(f"**[{video.title}]({video.url})** — {video.author}")
            st.caption(f"🔗 {video.url}")
            render_verdict(summary)
            overall = content_only(report.categories_overall())
            pills = "".join(
                f'<span class="flag-pill {intensity_class(p)}">'
                f'{CATEGORY_LABELS.get(k, k)} · {p:.0%}</span>'
                for k, p in sorted(overall.items(), key=lambda kv: -kv[1])
                if p >= 0.25
            )
            if not pills:
                pills = '<span class="flag-pill sev-none">No concerns flagged</span>'
            st.markdown(pills, unsafe_allow_html=True)
        st.divider()

    if results:
        st.markdown("### Playlist summary")
        rows = {
            "Episode": [v.title[:60] for v, _, _ in results],
            "URL": [v.url for v, _, _ in results],
            "Verdict": [s.verdict for _, _, s in results],
            "Recommended age": [f"{s.min_age}+" for _, _, s in results],
            "Flagged categories": [
                ", ".join(k for k, _ in s.top_flagged_categories[:3]) or "—"
                for _, _, s in results
            ],
        }
        st.dataframe(rows, column_config={
            "URL": st.column_config.LinkColumn(
                "URL", display_text="▶ open on YouTube"
            ),
        }, use_container_width=True, hide_index=True)


# ---------- Dispatch ----------
if go and url:
    url = url.strip()
    st.divider()
    if is_playlist_url(url):
        run_playlist(url, limit=10)
    else:
        pair = analyze_one(url)
        if pair is not None:
            video, report = pair
            render_single_report(video, report)
elif go and not url:
    st.warning("Paste a YouTube URL (or playlist URL) first.")
