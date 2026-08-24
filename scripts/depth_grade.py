"""Grades the artwork by how far away it is meant to be.

    python scripts/depth_grade.py --dry-run
    python scripts/depth_grade.py

Haze is drawn over a plane at runtime and it can only do one thing: wash
everything on that plane towards one colour, uniformly. What it cannot do is
reduce CONTRAST — the difference between a tower's lit windows and its shadowed
wall survives any amount of fog laid on top, so distant buildings keep their
crisp internal detail and go on competing with the roof for attention. That is
what "the background is busy" means, and no haze setting fixes it.

Distance does three things to what you see, and only the first is fog:

  1. it washes colour towards the sky        <- haze already does this
  2. it FLATTENS contrast                    <- this
  3. it drains saturation                    <- this

So each plane gets graded once, by how far back it sits, and the effect is baked
into the asset where it costs nothing per frame.

The foreground goes the other way. It is nearest, so it should be the darkest
and hardest thing in the frame — a proscenium the scene is viewed through
rather than more scenery. Its contrast is pushed up and its exposure down.

Every asset is re-read after writing and its hue checked, the same as
`regrade.py`: this may change how bright and how flat a thing is, and may not
change what colour it is.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from manifest_read import props_with_draw_size, by_file      # noqa: E402
from pixelate import load_palette, snap_to_palette           # noqa: E402
from imageio import save_art                                 # noqa: E402
# NOT `regrade`'s hue guard. That one compares the direction of the mean RGB
# vector, which desaturation deliberately moves towards grey — so it would
# reject every distant plane for doing exactly what it was asked to do. All nine
# towers were refused on that basis before this was noticed.
#
# Hue angle is the saturation-invariant version: draining colour leaves it where
# it was, and a palette snap landing on the wrong side of the wheel does not.
MAX_HUE_SHIFT = 12.0

# How each plane is treated.
#
#   contrast  <1 flattens towards the plane's own mean, >1 hardens
#   saturation <1 drains colour
#   exposure  a straight multiply afterwards
#
# The numbers come from the order of the planes, not from taste: each band back
# is flatter and less saturated than the one in front of it, by a consistent
# step. The deck is untouched — it is the subject, and `regrade.py` already owns
# its tone.
PLANES = {
    "skyline_far":  {"contrast": 0.70, "saturation": 0.72, "exposure": 1.00},
    "skyline":      {"contrast": 0.79, "saturation": 0.80, "exposure": 1.00},
    "skyline_near": {"contrast": 0.88, "saturation": 0.88, "exposure": 1.00},
    "far":          {"contrast": 0.94, "saturation": 0.94, "exposure": 1.00},
    # Nearest of all: harder and darker, so its edges cut and its interior does
    # not invite reading.
    "fore":         {"contrast": 1.18, "saturation": 1.00, "exposure": 0.82},
}


def hue_angle(rgb, alpha):
    """The mean hue of the opaque pixels, in degrees. Ignores saturation."""
    px = rgb[alpha > 128]
    if len(px) == 0:
        return None
    r, g, b = px[:, 0].mean(), px[:, 1].mean(), px[:, 2].mean()
    return float(np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)))


def hue_shift(before, after):
    """The smaller way round the wheel, in degrees."""
    if before is None or after is None:
        return 0.0
    d = abs(after - before) % 360
    return min(d, 360 - d)


def grade(path, spec, palette, dry_run):
    with Image.open(path) as im:
        source = im.convert("RGBA")
        a = np.asarray(source).astype(np.float32)

    rgb, alpha = a[:, :, :3], a[:, :, 3]
    opaque = alpha > 128
    if opaque.sum() < 16:
        return None

    lum = (rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152
           + rgb[:, :, 2] * 0.0722)

    # Contrast about the sprite's OWN mean, not about mid-grey. Pulling a
    # night-time asset towards 128 would brighten it, which is the opposite of
    # sending it into the distance.
    mean = lum[opaque].mean()
    graded = mean + (rgb - mean) * spec["contrast"]

    # Saturation about each pixel's luminance, weighted by what it already has
    # — the same rule `regrade.py` arrived at, for the same reason: a flat
    # multiply turns a near-neutral's tiny colour cast into a visible hue.
    gl = (graded[:, :, 0] * 0.2126 + graded[:, :, 1] * 0.7152
          + graded[:, :, 2] * 0.0722)[:, :, None]
    mx = graded.max(axis=2, keepdims=True)
    mn = graded.min(axis=2, keepdims=True)
    pixel_sat = (mx - mn) / np.maximum(mx, 1.0)
    weighted = 1.0 + (spec["saturation"] - 1.0) * pixel_sat
    graded = gl + (graded - gl) * weighted

    graded = np.clip(graded * spec["exposure"], 0, 255)
    graded = snap_to_palette(graded.astype(float), palette)

    shift = hue_shift(hue_angle(rgb, alpha),
                      hue_angle(graded.astype(np.float32), alpha))
    if shift > MAX_HUE_SHIFT:
        return ("refused", shift, None)

    out = Image.fromarray(np.dstack([graded, alpha]).astype(np.uint8), "RGBA")
    if not dry_run:
        save_art(out, path)

    # Handed back so a dry run can report what WOULD happen. Measuring the file
    # on disk after a dry run just reports the input twice, which is a report
    # that always says nothing changed.
    return ("graded", shift, stats(graded, alpha))


def stats(rgb, alpha):
    """Mean luminance, its spread, and mean saturation of the opaque pixels."""
    px = rgb[alpha > 128]
    if len(px) < 16:
        return None
    lum = px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722
    mx, mn = px.max(axis=1), px.min(axis=1)
    return lum.mean(), lum.std(), ((mx - mn) / np.maximum(mx, 1)).mean()


def measure(path):
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGBA")).astype(np.float32)
    return stats(a[:, :, :3], a[:, :, 3])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    palette = load_palette()

    # One plane per FILE. An asset reused on two planes would be graded twice
    # and land wherever the second call left it, so the nearest use wins —
    # under-hazing something is recoverable and over-hazing it is not.
    order = list(PLANES.keys())
    plane_of = {}
    for prop in props_with_draw_size():
        if prop["kind"] != "prop" or prop["plane"] not in PLANES:
            continue
        current = plane_of.get(prop["file"])
        if current is None or order.index(prop["plane"]) > order.index(current):
            plane_of[prop["file"]] = prop["plane"]

    by_plane = {}
    refused = []

    for file, plane in sorted(plane_of.items()):
        path = ROOT / file
        if not path.exists():
            continue

        before = measure(path)
        result = grade(path, PLANES[plane], palette, args.dry_run)
        if result is None:
            continue
        status, shift, predicted = result

        if status == "refused":
            refused.append(f"{file} ({shift:.0f} degrees)")
            continue

        after = predicted or measure(path)
        by_plane.setdefault(plane, []).append((before, after))

    print()
    hdr = (f"{'plane':<14}{'files':>6}{'luminance':>20}"
           f"{'contrast (sd)':>20}{'saturation':>20}")
    print(hdr)
    print("-" * len(hdr))

    for plane in order:
        rows = by_plane.get(plane)
        if not rows:
            continue
        b_lum = np.mean([r[0][0] for r in rows])
        a_lum = np.mean([r[1][0] for r in rows])
        b_sd = np.mean([r[0][1] for r in rows])
        a_sd = np.mean([r[1][1] for r in rows])
        b_sat = np.mean([r[0][2] for r in rows])
        a_sat = np.mean([r[1][2] for r in rows])
        print(f"{plane:<14}{len(rows):>6}"
              f"{f'{b_lum:.0f} -> {a_lum:.0f}':>20}"
              f"{f'{b_sd:.1f} -> {a_sd:.1f}':>20}"
              f"{f'{b_sat:.2f} -> {a_sat:.2f}':>20}")

    for r in refused:
        print(f"  ! refused, the grade turns its colour: {r}", file=sys.stderr)

    print()
    print(f"{sum(len(v) for v in by_plane.values())} graded, {len(refused)} refused")
    if args.dry_run:
        print("(dry run - nothing written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
