"""Re-encodes the served PNGs smaller, and proves it changed nothing visible.

    python scripts/optimize_assets.py --dry-run     report only
    python scripts/optimize_assets.py               rewrite the files

The roof is well over a megabyte of PNG and every byte of it is downloaded
before the boot screen finishes. The art is already quantised to a 64-colour
palette by `pixelate.py`, so most of these files are RGBA images holding fewer
than eighty colours — which PNG stores as four bytes per pixel unless it is told
to use a palette.

The saving is therefore in the ENCODING, not in the image:

  - `optimize=True` searches filter and compression settings instead of taking
    the defaults.
  - Storing one palette index per pixel instead of four channels, with a single
    transparency index for the cut-out background.

WHAT "LOSSLESS" MEANS HERE
--------------------------
Every candidate encoding is re-read and compared against the original before it
is allowed to replace anything. The comparison is:

  - the alpha channel must be identical, pixel for pixel; and
  - the RGB must be identical everywhere alpha is not zero.

RGB *under* a fully transparent pixel is deliberately not compared. It is not
drawn, no encoder preserves it, and requiring it rejects every palettised
encoding for a difference nothing can see — which is exactly what an earlier
version of this script did, reporting a 3% saving on files that could give up
sixty.

That distinction is the whole reason this script asserts rather than assumes. A
previously recorded measurement of "71%, no visual cost" came from octree
quantisation, which is lossy on more than 256 colours and silently moves real
pixels; anything that does that here is rejected and reported, whatever it saves.

Nothing here touches `assets/city/raw/`, the masters, or the deprecated tree.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Only what the site actually serves. The masters (`master_rooftop.png`,
# `char_sheet.png`, `style.PNG`) are provenance, not payload, and re-encoding
# them would churn a large binary for no visitor's benefit.
SERVED = [
    ROOT / "assets" / "city" / "pixel",
    ROOT / "assets" / "city" / "interior",
]


def visible(path):
    """What this file actually draws: (alpha bytes, RGB where alpha is not 0).

    Two files with the same pair are indistinguishable on screen, whatever they
    differ by on disk.
    """
    with Image.open(path) as im:
        rgba = im.convert("RGBA").tobytes()

    alpha = rgba[3::4]
    rgb = bytearray()
    for i in range(0, len(rgba), 4):
        if rgba[i + 3]:
            rgb += rgba[i:i + 3]
    return bytes(alpha), bytes(rgb)


def palettised(im):
    """The image as mode P with one transparency index, or None.

    Built explicitly rather than through `quantize`, which for RGBA input only
    offers octree and libimagequant — both of which will happily approximate.
    This either maps every colour exactly or gives up.
    """
    rgba = im.convert("RGBA")

    counted = rgba.getcolors(maxcolors=100_000)
    if counted is None:
        return None

    colours = [c for _, c in counted]
    alphas = {c[3] for c in colours}

    # Partial transparency needs a real alpha channel, which mode P has not got.
    if not alphas <= {0, 255}:
        return None

    opaque = [c for c in colours if c[3] == 255]
    if len(opaque) > 255:          # one index is reserved for transparency
        return None

    index = {c: i for i, c in enumerate(opaque)}
    transparent = len(opaque)

    palette = []
    for c in opaque:
        palette.extend(c[:3])
    palette.extend((0, 0, 0))
    palette.extend([0] * (768 - len(palette)))

    out = Image.new("P", rgba.size)
    out.putpalette(palette)
    out.putdata([
        index[px] if px[3] == 255 else transparent
        for px in rgba.get_flattened_data()
    ])

    return out, transparent


def candidates(im):
    """Ways of saving this image, as (name, image, save-kwargs)."""
    out = []

    made = palettised(im)
    if made:
        image, transparent = made
        out.append(("palette", image, {"transparency": transparent}))

    out.append(("reencode", im, {}))
    return out


def optimise(path, dry_run):
    """Returns (before, after, how)."""
    before = path.stat().st_size
    original = visible(path)

    with Image.open(path) as im:
        im.load()
        options = candidates(im)

    best = None
    rejected = []

    for how, image, kwargs in options:
        # One temp file PER candidate. Sharing a single name meant the second
        # candidate overwrote the first's file and the loser's cleanup then
        # deleted the winner's — which surfaced as a rename of a file that was
        # no longer there.
        tmp = path.with_suffix(f".{how}.tmp.png")
        try:
            image.save(tmp, "PNG", optimize=True, **kwargs)
        except (OSError, ValueError):
            tmp.unlink(missing_ok=True)
            continue

        # The whole point. An encoding that moves a visible pixel is not an
        # optimisation, it is a bug with a size win attached.
        if visible(tmp) != original:
            rejected.append(how)
            tmp.unlink(missing_ok=True)
            continue

        size = tmp.stat().st_size
        if best is None or size < best[1]:
            if best is not None:
                best[2].unlink(missing_ok=True)
            best = (how, size, tmp)
        else:
            tmp.unlink(missing_ok=True)

    if rejected:
        print(f"  ! {path.relative_to(ROOT)}: rejected {', '.join(rejected)} "
              f"— would have changed visible pixels", file=sys.stderr)

    if best is None:
        return before, before, "unchanged"

    how, size, tmp = best

    if size >= before:
        tmp.unlink(missing_ok=True)
        return before, before, "already minimal"

    if dry_run:
        tmp.unlink(missing_ok=True)
    else:
        tmp.replace(path)
        # Belt and braces: verify the file that is now on disk.
        assert visible(path) == original, f"{path} changed on write"

    return before, size, how


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    files = sorted(p for d in SERVED for p in d.rglob("*.png"))
    if not files:
        # Not a failure. The served art is lossless WebP now, which has its own
        # encoder and nothing for a PNG re-packer to do. This is kept because
        # the masters are still PNG and a future asset might be.
        print("no served PNGs — the art is WebP, which this does not re-pack")
        return 0

    total_before = total_after = 0
    changed = 0

    for path in files:
        before, after, how = optimise(path, args.dry_run)
        total_before += before
        total_after += after
        if after < before:
            changed += 1
            if not args.quiet:
                print(f"  {path.relative_to(ROOT)}  "
                      f"{before // 1024}KB -> {after // 1024}KB  ({how})")

    saved = total_before - total_after
    pct = (saved / total_before * 100) if total_before else 0

    print()
    print(f"{len(files)} files, {changed} smaller")
    print(f"{total_before // 1024}KB -> {total_after // 1024}KB "
          f"({saved // 1024}KB, {pct:.0f}% saved)")
    if args.dry_run:
        print("(dry run - nothing written)")
    print("every rewritten file verified to draw identically to the original")
    return 0


if __name__ == "__main__":
    sys.exit(main())
