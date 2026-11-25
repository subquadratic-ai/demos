"""Generate a human-readable verdict comparing YouTube's own claim about a
video (its `isFamilySafe` tag + category) against what Snap actually found
in the transcript.

The resulting headlines are the demo's hero copy:

  - "YouTube says this is Family Safe. Snap agrees — appropriate for ages 3+."
  - "⚠️ YouTube says this is Family Safe. Snap found scary content,
    violence, and difficult themes. Recommended age 13+."
  - "YouTube says this is NOT family safe. Snap recommends ages 13+."
"""

from __future__ import annotations

from dataclasses import dataclass

from screen_scout.analyzer import Report

CATEGORY_LABELS = {
    "profanity": "profanity",
    "violence": "violence",
    "scary": "scary content",
    "sexual_content": "romantic/sexual content",
    "substance_use": "substance use",
    "difficult_themes": "difficult emotional themes",
    "hidden_ads": "undisclosed advertising",
    "ai_generated": "AI-generated content",
}

AGE_KEYS = {
    "appropriate_under_6",
    "appropriate_6_to_9",
    "appropriate_10_to_12",
    "appropriate_13_plus",
}

# Signals in a title or channel name that reinforce "marketed for kids"
# even when YouTube's own tag doesn't say so.
_KID_MARKERS = [
    "kids", "children", "toddler", "preschool", "nursery",
    "for kids", "educational videos for", "family friendly", "family-friendly",
    "made for kids",
    # specific well-known kids channels
    "blippi", "cocomelon", "pinkfong", "diana", "vlad and niki",
    "ryan's world", "chuchu tv", "little baby bum", "peppa pig", "paw patrol",
]


@dataclass
class Summary:
    headline: str
    verdict: str
    # YouTube's own public claims (from the video's microformat)
    youtube_family_safe: bool | None
    youtube_category: str | None
    # Our analysis
    min_age: int
    is_kid_marketed: bool  # inferred from title/channel in addition to YouTube's claim
    top_flagged_categories: list[tuple[str, float]]
    detail: str
    youtube_claim_str: str  # pre-formatted "YouTube says ..." phrase


def is_kid_marketed_by_text(title: str, author: str) -> bool:
    text = f"{title} {author}".lower()
    return any(marker in text for marker in _KID_MARKERS)


def _content_only(flags: dict) -> dict:
    return {k: v for k, v in flags.items() if k not in AGE_KEYS}


def _format_youtube_claim(family_safe: bool | None, category: str | None) -> str:
    """Build the 'YouTube says ...' lead-in phrase."""
    bits = []
    if family_safe is True:
        bits.append("marked **Family Safe**")
    elif family_safe is False:
        bits.append("marked **NOT Family Safe**")
    if category:
        bits.append(f"category *{category}*")
    if not bits:
        return "YouTube: no public safety claim available"
    return "YouTube " + ", ".join(bits)


def build_summary(
    report: Report,
    *,
    title: str,
    author: str,
    youtube_family_safe: bool | None = None,
    youtube_category: str | None = None,
    flag_threshold: float = 0.5,
) -> Summary:
    overall = _content_only(report.categories_overall())
    top_flags = sorted(
        [(k, v) for k, v in overall.items() if v >= flag_threshold],
        key=lambda kv: -kv[1],
    )
    min_age = report.recommended_min_age()
    kid_marketed = is_kid_marketed_by_text(title, author) or (youtube_family_safe is True)
    youtube_claim = _format_youtube_claim(youtube_family_safe, youtube_category)

    def _flag_phrase(flags: list[tuple[str, float]], limit: int = 4) -> str:
        return ", ".join(CATEGORY_LABELS.get(k, k) for k, _ in flags[:limit])

    # Decide whether this is truly "mislabeled": the age verdict is 10+ or above.
    # A category flag at >=0.5 alone is NOT enough to call something mislabeled
    # — many clean kids shows have one false-positive category (e.g. Blippi's
    # repetitive style sometimes trips AI-generated).
    is_mislabeled = min_age >= 10

    # ---- Mislabeled: YouTube says family-safe but Snap says age 10+ ----
    if youtube_family_safe is True and is_mislabeled:
        flagged = _flag_phrase(top_flags) or "concerns across multiple categories"
        return Summary(
            headline=(
                f"⚠️ YouTube marked this **Family Safe**, but Snap found "
                f"{flagged}. Recommended age {min_age}+."
            ),
            verdict="mislabeled",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=kid_marketed,
            top_flagged_categories=top_flags,
            detail=(
                f"YouTube's own metadata tags this video as Family Safe "
                f"(category *{youtube_category or 'unknown'}*). Snap's transcript "
                f"analysis found content that would not match a young-child viewing "
                f"experience. Parents should preview before showing to children under {min_age}."
            ),
            youtube_claim_str=youtube_claim,
        )

    # ---- Marketed by title/channel for kids but Snap says age 10+ ----
    if kid_marketed and is_mislabeled:
        flagged = _flag_phrase(top_flags) or "concerns across multiple categories"
        return Summary(
            headline=(
                f"⚠️ This video is marketed as kids content, but Snap found "
                f"{flagged}. Recommended age {min_age}+."
            ),
            verdict="mislabeled",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=True,
            top_flagged_categories=top_flags,
            detail=(
                "The channel or title markets this as kids content. Snap's "
                "transcript analysis found concerning material. "
                f"Parents should preview before showing to children under {min_age}."
            ),
            youtube_claim_str=youtube_claim,
        )

    # Separate out "serious" flags from the noisy ai_generated / hidden_ads ones.
    # Those two can misfire on kid-presenter style without indicating any real
    # safety concern, so we don't let them downgrade a safe verdict.
    _NOISY = {"ai_generated", "hidden_ads"}
    serious_flags = [t for t in top_flags if t[0] not in _NOISY]

    # ---- Confirmed safe: YouTube family-safe + Snap says ≤6+ with no serious flags ----
    if youtube_family_safe is True and min_age <= 6 and not serious_flags:
        suffix = ""
        if top_flags:
            noisy_names = ", ".join(CATEGORY_LABELS.get(k, k) for k, _ in top_flags)
            suffix = (
                f" (Note: Snap flagged {noisy_names} — these can misfire on "
                "kid-presenter style and don't indicate safety concerns.)"
            )
        return Summary(
            headline=(
                f"✓ YouTube marked this **Family Safe** and Snap agrees. "
                f"Appropriate for ages {min_age}+."
            ),
            verdict="safe-and-marketed-safe",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=True,
            top_flagged_categories=top_flags,
            detail=(
                f"YouTube's metadata and Snap's transcript analysis agree: this "
                f"video is appropriate for the stated age bracket. "
                f"Category: *{youtube_category or 'unknown'}*.{suffix}"
            ),
            youtube_claim_str=youtube_claim,
        )

    # ---- Marketed by title only (no YouTube signal), Snap says ≤6+ ----
    if kid_marketed and min_age <= 6 and not serious_flags:
        return Summary(
            headline=f"✓ Marketed for kids and Snap agrees. Safe for ages {min_age}+.",
            verdict="safe-and-marketed-safe",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=True,
            top_flagged_categories=top_flags,
            detail=(
                "Marketed as kids content. Snap's analysis finds no safety "
                "concerns above the flag threshold."
            ),
            youtube_claim_str=youtube_claim,
        )

    # ---- YouTube explicitly NOT family-safe ----
    if youtube_family_safe is False:
        rating = (
            f"YouTube marked this **NOT Family Safe**, and Snap agrees — "
            f"recommended ages {min_age}+."
        )
        return Summary(
            headline=rating,
            verdict="unmarketed-neutral",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=False,
            top_flagged_categories=top_flags,
            detail=(
                f"YouTube's own metadata flags this as not family-safe. "
                f"Snap's analysis recommends ages {min_age}+."
            ),
            youtube_claim_str=youtube_claim,
        )

    # ---- Unmarketed: no kid signal from title or YouTube ----
    if not kid_marketed:
        rating = (
            f"Snap rates this as appropriate for ages {min_age}+."
            if min_age <= 13
            else f"Snap recommends ages {min_age}+ — contains mature content."
        )
        return Summary(
            headline=rating,
            verdict="unmarketed-neutral",
            youtube_family_safe=youtube_family_safe,
            youtube_category=youtube_category,
            min_age=min_age,
            is_kid_marketed=False,
            top_flagged_categories=top_flags,
            detail=(
                "This video is not marketed as kids content. The age recommendation "
                "reflects Snap's analysis of the transcript."
            ),
            youtube_claim_str=youtube_claim,
        )

    # ---- Borderline fallback ----
    return Summary(
        headline=f"Marketed for kids. Snap recommends ages {min_age}+.",
        verdict="borderline",
        youtube_family_safe=youtube_family_safe,
        youtube_category=youtube_category,
        min_age=min_age,
        is_kid_marketed=True,
        top_flagged_categories=top_flags,
        detail=(
            "Marketed for kids with no severe category flags, but Snap's age "
            "gate landed above 6. Could be mild intensity across several areas."
        ),
        youtube_claim_str=youtube_claim,
    )
