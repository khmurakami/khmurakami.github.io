"""Builds the two images the site needs but never shows itself.

    python scripts/make_share_images.py

Both are derived from art that is already in the repository, so neither is a
thing to keep in step by hand:

`assets/og.jpg` — 1200x630, the link preview. Without it a shared link renders
as a grey box, which for a site whose entire pitch is that it is nice to look at
is the worst possible first impression. It is a crop of the master rooftop
plate: the actual art, at the aspect ratio the scrapers want.

`apple-touch-icon.png` — 180x180, what iOS uses when someone adds the site to
their home screen. Scaled from the favicon with NEAREST, because the source is
pixel art and any smooth filter turns it to mush.

Re-run it if the master plate or the favicon changes. Nothing depends on it at
runtime.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

MASTER = ROOT / "assets" / "city" / "master_rooftop.png"
FAVICON = ROOT / "favicon-32.png"

OG = ROOT / "assets" / "og.jpg"
TOUCH = ROOT / "apple-touch-icon.png"

OG_SIZE = (1200, 630)
TOUCH_SIZE = (180, 180)


def build_og():
    """A 1200x630 crop of the master plate.

    Cropped rather than squashed, and taken from the upper part of the frame —
    that is where the skyline and the lit windows are. Cropping from the centre
    lands on empty deck.
    """
    src = Image.open(MASTER).convert("RGB")

    target = OG_SIZE[0] / OG_SIZE[1]
    w, h = src.size

    if w / h > target:
        crop_w = int(h * target)
        left = (w - crop_w) // 2
        box = (left, 0, left + crop_w, h)
    else:
        crop_h = int(w / target)
        top = int((h - crop_h) * 0.25)
        box = (0, top, w, top + crop_h)

    # JPEG, not PNG. The plate is painterly — soft gradients, haze, bloom —
    # which is the case PNG is worst at: the same crop came out at 880KB as a
    # PNG and 116KB as a quality-88 JPEG, with no difference a link preview
    # could show. The pixel-art assets stay PNG; this one is not pixel art.
    src.crop(box).resize(OG_SIZE, Image.LANCZOS).save(
        OG, quality=88, optimize=True, progressive=True)
    return OG


def build_touch_icon():
    """180x180 from the 32px favicon, nearest-neighbour.

    180 is not a whole multiple of 32, so it is scaled to 160 (5x, exact) and
    centred on a 180 square filled with the site's background. A fractional
    upscale of pixel art gives rows of different widths, which is the one thing
    this whole codebase is organised around not doing.
    """
    src = Image.open(FAVICON).convert("RGBA")
    scaled = src.resize((160, 160), Image.NEAREST)

    # The page background, so the icon sits on the site's own colour rather
    # than on white.
    canvas = Image.new("RGB", TOUCH_SIZE, (42, 24, 54))
    canvas.paste(scaled, ((180 - 160) // 2, (180 - 160) // 2), scaled)
    canvas.save(TOUCH, optimize=True)
    return TOUCH


def main():
    for missing in [p for p in (MASTER, FAVICON) if not p.exists()]:
        print(f"missing source: {missing}", file=sys.stderr)
        return 1

    for path in (build_og(), build_touch_icon()):
        print(f"wrote {path.relative_to(ROOT)}  ({path.stat().st_size // 1024}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
