"""Vercel entry point: the whole app is one FastAPI function."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from listing_match.app import app  # noqa: E402,F401

__all__ = ["app"]
