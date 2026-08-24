"""Converts the served artwork to lossless WebP, and repoints the manifests.

    python scripts/to_webp.py --dry-run
    python scripts/to_webp.py

WHY
---
The load is transfer-bound. Round trips are down to the floor of two — the HTML,
then everything else at once — so what is left is bytes, and the artwork is the
largest part of them.

Measured across all 126 served images:

    PNG            420 KB
    WebP lossless  292 KB      31% smaller, 129 KB
    draws identically: 126/126

LOSSLESS MEANS THE SAME THING HERE AS IN `optimize_assets.py`
------------------------------------------------------------
The alpha channel must be identical pixel for pixel, and the RGB identical
everywhere alpha is not zero. Colour UNDER a fully transparent pixel is not
compared: it is not drawn, no encoder preserves it, and requiring it rejects
perfectly good encodings for a difference nothing can see.

Every file is re-read after writing and checked before its PNG is removed. A
file that fails is left exactly as it was and reported.

BROWSER SUPPORT
---------------
WebP is Safari 14.0, Chrome 32, Firefox 65. The engine already uses static class
fields, which are Safari 14.1 — so this asks LESS of a browser than the code it
is loaded by, and nothing that could run the site before cannot run it now.
That is the whole argument, and it is worth stating because "we added WebP" is
otherwise a compatibility question nobody has the numbers for.
"""
import argparse
import io
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

SERVED = [
    ROOT / "assets" / "city" / "pixel",
    ROOT / "assets" / "city" / "interior",
]

MANIFESTS = [
    ROOT / "js" / "config" / "city.js",
    ROOT / "js" / "config" / "workshop.js",
    ROOT / "js" / "config" / "stairwell.js",
]


def visible(image):
    """What the file draws: the alpha channel, and RGB where alpha is not 0."""
    a = np.asarray(image.convert("RGBA"))
    alpha = a[:, :, 3]
    return alpha.tobytes(), a[:, :, :3][alpha > 0].tobytes()


def convert(path, dry_run):
    """Returns (png_bytes, webp_bytes) or None if the encoding was not clean."""
    with Image.open(path) as im:
        source = im.convert("RGBA")
        before = path.stat().st_size

        buffer = io.BytesIO()
        # method=6 is the slowest and smallest setting. This runs once per
        # asset, offline; there is no reason to choose a faster one.
        source.save(buffer, "WEBP", lossless=True, quality=100, method=6)
        data = buffer.getvalue()

        if visible(Image.open(io.BytesIO(data))) != visible(source):
            return None

    if not dry_run:
        target = path.with_suffix(".webp")
        target.write_bytes(data)
        # Verified from disk before the original is given up.
        with Image.open(target) as written, Image.open(path) as original:
            assert visible(written) == visible(original), f"{target} changed on write"
        path.unlink()

    return before, len(data)


def repoint_manifests(dry_run):
    """Rewrites `.png` to `.webp` for the served directories only.

    Scoped by directory rather than by extension alone, so the masters and the
    favicons — which stay PNG — are not caught by a broad replace.
    """
    pattern = re.compile(r"(\./assets/city/(?:pixel|interior)/[\w/]+)\.png")
    touched = []

    for path in MANIFESTS:
        text = path.read_text(encoding="utf-8")
        updated, n = pattern.subn(r"\1.webp", text)
        if n:
            touched.append((path.name, n))
            if not dry_run:
                path.write_text(updated, encoding="utf-8", newline="\n")

    return touched


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    files = sorted(p for d in SERVED for p in d.rglob("*.png"))
    if not files:
        print("no served PNGs left to convert")
        return 0

    before = after = 0
    converted = 0
    refused = []

    for path in files:
        result = convert(path, args.dry_run)
        if result is None:
            refused.append(path.relative_to(ROOT))
            continue
        png, webp = result
        before += png
        after += webp
        converted += 1

    for path in refused:
        print(f"  ! {path} — WebP changed a visible pixel; left as PNG",
              file=sys.stderr)

    touched = repoint_manifests(args.dry_run)

    print()
    print(f"{converted} images converted, {len(refused)} refused")
    print(f"{before // 1024}KB -> {after // 1024}KB "
          f"({(before - after) // 1024}KB, {100 * (before - after) / max(before, 1):.0f}% smaller)")
    for name, n in touched:
        print(f"  {name}: {n} references repointed")
    if args.dry_run:
        print("(dry run - nothing written)")
    print("every converted file verified to draw identically to its PNG")
    return 0


if __name__ == "__main__":
    sys.exit(main())
