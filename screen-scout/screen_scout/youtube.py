"""Pull transcript + metadata for a YouTube video.

Assumes transcripts are available (auto-captions or manual). If a video
has no transcript, we raise so callers can skip the video and the demo
remains honest about the gap.
"""

from __future__ import annotations

import json as _json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
)


class YouTubeFetchError(RuntimeError):
    """Raised when we cannot fetch a transcript for a YouTube video."""


# ---------- Local transcript cache ----------
# Each fetched transcript is saved under data/cache/<video_id>.srt + .meta.json
# so a repeat request skips YouTube entirely. Makes the pre-vetted demo URLs
# work even when YouTube rate-limits our IP.
_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"


def _cache_paths(video_id: str) -> tuple[Path, Path]:
    srt = _CACHE_DIR / f"{video_id}.srt"
    meta = _CACHE_DIR / f"{video_id}.meta.json"
    return srt, meta


def _srt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    sec = t % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")


def _write_cache(video_id: str, segments: list, meta: dict) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    srt_path, meta_path = _cache_paths(video_id)
    lines = []
    for i, s in enumerate(segments, 1):
        end = s.start + s.duration
        lines.append(str(i))
        lines.append(f"{_srt_time(s.start)} --> {_srt_time(end)}")
        lines.append(s.text)
        lines.append("")
    srt_path.write_text("\n".join(lines), encoding="utf-8")
    meta_path.write_text(_json.dumps(meta, indent=2), encoding="utf-8")


_SRT_TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)


def _parse_srt_to_segments(text: str) -> list["TranscriptSegment"]:
    segments: list[TranscriptSegment] = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        time_line = lines[1] if lines[0].isdigit() else lines[0]
        m = _SRT_TIME_RE.search(time_line)
        if not m:
            continue
        start = (int(m.group(1)) * 3600 + int(m.group(2)) * 60
                 + int(m.group(3)) + int(m.group(4)) / 1000.0)
        end = (int(m.group(5)) * 3600 + int(m.group(6)) * 60
               + int(m.group(7)) + int(m.group(8)) / 1000.0)
        content_lines = lines[2:] if lines[0].isdigit() else lines[1:]
        content = " ".join(content_lines).strip()
        if content:
            segments.append(TranscriptSegment(
                start=start, duration=max(end - start, 0.0), text=content
            ))
    return segments


def _read_cache(video_id: str) -> tuple[list["TranscriptSegment"], dict] | None:
    srt_path, meta_path = _cache_paths(video_id)
    if not srt_path.exists() or not meta_path.exists():
        return None
    try:
        segs = _parse_srt_to_segments(srt_path.read_text(encoding="utf-8"))
        meta = _json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    return segs, meta


@dataclass
class TranscriptSegment:
    start: float
    duration: float
    text: str

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass
class YouTubeVideo:
    video_id: str
    url: str
    title: str
    author: str
    thumbnail_url: str
    segments: list[TranscriptSegment] = field(default_factory=list)
    # YouTube's own public claims about the video (scraped from the page)
    is_family_safe: bool | None = None
    category: str | None = None

    @property
    def full_text(self) -> str:
        return " ".join(seg.text for seg in self.segments)

    @property
    def duration_seconds(self) -> float:
        if not self.segments:
            return 0.0
        return self.segments[-1].end


_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_PLAYLIST_ID_RE = re.compile(r"^(PL|UU|FL|LL|OL)[A-Za-z0-9_-]{10,}$")


def is_playlist_url(url: str) -> bool:
    """Return True if the URL looks like a YouTube playlist."""
    parsed = urlparse(url)
    if "list" in parse_qs(parsed.query):
        return True
    if parsed.path.endswith("/playlist"):
        return True
    return False


def extract_playlist_id(url: str) -> str:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "list" in qs and qs["list"]:
        pid = qs["list"][0]
        if _PLAYLIST_ID_RE.match(pid):
            return pid
    raise YouTubeFetchError(f"Could not extract playlist ID from {url!r}")


def fetch_playlist_video_ids(url: str, *, limit: int = 25) -> list[str]:
    """Scrape a public YouTube playlist page for its video IDs.

    Lightweight regex approach — no auth, no dep on pytube/yt-dlp.
    Returns up to `limit` deduplicated video IDs in playlist order.
    Raises YouTubeFetchError if the page can't be fetched or has no IDs.
    """
    playlist_id = extract_playlist_id(url)
    playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"
    try:
        response = requests.get(
            playlist_url,
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ScreenScout/0.1)"},
        )
    except requests.RequestException as exc:
        raise YouTubeFetchError(f"Could not fetch playlist page: {exc}") from exc

    if response.status_code != 200:
        raise YouTubeFetchError(
            f"Playlist page returned HTTP {response.status_code} for {playlist_url}"
        )

    # YouTube embeds video IDs as "videoId":"XXXXXXXXXXX" in ytInitialData.
    ids = re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', response.text)
    seen: set[str] = set()
    unique: list[str] = []
    for vid in ids:
        if vid not in seen:
            seen.add(vid)
            unique.append(vid)
        if len(unique) >= limit:
            break

    if not unique:
        raise YouTubeFetchError(
            f"No video IDs found in playlist {playlist_id}. "
            "Is it public? Does it have any videos?"
        )
    return unique


def extract_video_id(url_or_id: str) -> str:
    """Accept either a full YouTube URL or a bare 11-char video ID."""
    if _VIDEO_ID_RE.match(url_or_id):
        return url_or_id

    parsed = urlparse(url_or_id)
    if parsed.hostname in {"youtu.be"}:
        candidate = parsed.path.lstrip("/")
        if _VIDEO_ID_RE.match(candidate):
            return candidate

    if parsed.hostname and "youtube.com" in parsed.hostname:
        qs = parse_qs(parsed.query)
        if "v" in qs and _VIDEO_ID_RE.match(qs["v"][0]):
            return qs["v"][0]
        # /shorts/<id> or /embed/<id>
        path_parts = [p for p in parsed.path.split("/") if p]
        if path_parts and _VIDEO_ID_RE.match(path_parts[-1]):
            return path_parts[-1]

    raise YouTubeFetchError(f"Could not extract video ID from {url_or_id!r}")


def _fetch_metadata(video_id: str) -> dict:
    """Pull title/author/thumbnail via YouTube's public oembed endpoint. No API key needed."""
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    response = requests.get(oembed_url, timeout=10)
    if response.status_code != 200:
        raise YouTubeFetchError(
            f"oembed returned {response.status_code} for video {video_id}"
        )
    return response.json()


def _fetch_youtube_claims(video_id: str) -> dict:
    """Scrape YouTube's public page for the video's own `isFamilySafe` claim + category.

    Pulled from the embedded `ytInitialPlayerResponse.microformat.playerMicroformatRenderer`.
    Returns {} silently on any failure so the pipeline keeps working.
    """
    import json as _json

    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        response = requests.get(
            url,
            timeout=15,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ScreenScout/0.1)",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
    except requests.RequestException:
        return {}
    if response.status_code != 200:
        return {}

    match = re.search(r"ytInitialPlayerResponse\s*=\s*(\{.+?\});", response.text)
    if not match:
        return {}
    try:
        pr = _json.loads(match.group(1))
    except Exception:  # noqa: BLE001 — any JSON issue, bail cleanly
        return {}

    micro = pr.get("microformat", {}).get("playerMicroformatRenderer", {})
    return {
        "is_family_safe": micro.get("isFamilySafe"),
        "category": micro.get("category"),
    }


def fetch_video(url_or_id: str, *, languages: tuple[str, ...] = ("en",)) -> YouTubeVideo:
    """Fetch transcript + metadata for a YouTube video.

    Checks local cache first (data/cache/<video_id>.srt). On fresh fetches,
    saves the transcript and metadata to cache so repeat requests skip
    YouTube entirely — important when YouTube rate-limits the local IP.
    """
    video_id = extract_video_id(url_or_id)

    # ---- Cache lookup first ----
    cached = _read_cache(video_id)
    if cached is not None:
        segments, meta = cached
        return YouTubeVideo(
            video_id=video_id,
            url=f"https://www.youtube.com/watch?v={video_id}",
            title=meta.get("title", ""),
            author=meta.get("author_name", ""),
            thumbnail_url=meta.get("thumbnail_url", ""),
            segments=segments,
            is_family_safe=meta.get("is_family_safe"),
            category=meta.get("category"),
        )

    # ---- Fetch from YouTube ----
    try:
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id, languages=list(languages))
    except TranscriptsDisabled as exc:
        raise YouTubeFetchError(
            f"Transcripts disabled for video {video_id}. Pick a different video for the demo."
        ) from exc
    except NoTranscriptFound as exc:
        raise YouTubeFetchError(
            f"No transcript found for video {video_id} in languages {languages}."
        ) from exc
    except (IpBlocked, RequestBlocked) as exc:
        raise YouTubeFetchError(
            f"YouTube is rate-limiting this IP. Video {video_id} not in cache. "
            f"Options: (1) wait 1-2 hours for the block to lift, "
            f"(2) use one of the pre-vetted URLs already cached under data/cache/, "
            f"(3) manually save the transcript into data/cache/{video_id}.srt."
        ) from exc

    segments = [
        TranscriptSegment(start=float(s.start), duration=float(s.duration), text=s.text.strip())
        for s in fetched
        if s.text.strip()
    ]

    meta = _fetch_metadata(video_id)
    claims = _fetch_youtube_claims(video_id)

    # ---- Save to cache so we never re-fetch this ID ----
    cache_meta = {
        "video_id": video_id,
        "title": meta.get("title", ""),
        "author_name": meta.get("author_name", ""),
        "thumbnail_url": meta.get("thumbnail_url", ""),
        "is_family_safe": claims.get("is_family_safe"),
        "category": claims.get("category"),
    }
    try:
        _write_cache(video_id, segments, cache_meta)
    except Exception:  # noqa: BLE001 — cache write failures must not kill a run
        pass

    return YouTubeVideo(
        video_id=video_id,
        url=f"https://www.youtube.com/watch?v={video_id}",
        title=meta.get("title", ""),
        author=meta.get("author_name", ""),
        thumbnail_url=meta.get("thumbnail_url", ""),
        segments=segments,
        is_family_safe=claims.get("is_family_safe"),
        category=claims.get("category"),
    )
