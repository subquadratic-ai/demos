"""SubQ lockup for demo end cards.

Source is brand/logos/SubQ_SubQwhite.png, the white lockup from the uploaded set.
It is drawn as-is. Nothing is recolored. The bitmap is only scaled down.
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "logos", "SubQ_SubQwhite.png")

_BASE = None


def _base():
    global _BASE
    if _BASE is None:
        image = Image.open(PATH).convert("RGBA")
        arr = np.array(image)
        alpha = arr[:, :, 3]
        ys, xs = np.where(alpha > 8)
        cropped = arr[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        _BASE = Image.fromarray(cropped, "RGBA")
    return _BASE


def rgba(width):
    """Raster at exactly `width` pixels. Source is wider, so this only downscales."""
    base = _base()
    width = max(1, min(int(width), base.width))
    height = max(1, round(base.height * width / base.width))
    return np.array(base.resize((width, height), Image.Resampling.LANCZOS))


def draw(ax, w, h, alpha, wide):
    """Center the lockup. Caller has already painted the black card."""
    target_w = w * (0.46 if wide else 0.72)
    logo = rgba(target_w)
    lh, lw = logo.shape[:2]
    cx, cy = w / 2, h / 2
    image = ax.imshow(
        logo,
        extent=(cx - lw / 2, cx + lw / 2, cy + lh / 2, cy - lh / 2),
        zorder=5,
        interpolation="nearest",
        aspect="auto",
    )
    image.set_alpha(alpha)
