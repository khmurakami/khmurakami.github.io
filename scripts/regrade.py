"""Pulls drifted assets back toward the tone the rest of the world already has.

    python scripts/regrade.py --dry-run
    python scripts/regrade.py
    python scripts/regrade.py --only poster,clipboard --strength 0.8

THE PROBLEM
-----------
`stylecheck.py` compares each asset against the master plate. Once declared
light sources are exempted, what is left splits cleanly into two populations:

    50 assets judged ok    luminance median 24, saturation median 0.77
    50 assets drifted      luminance median 33, saturation median 0.61
                           (worst: poster at 145 / 0.35)

That is not a quirk of the reference. It is two groups of art: one that sits in
a night scene and one that was generated a little brighter and a little flatter
each time and never brought back.

THE TARGET
----------
Not the master plate. The master is 91% deep shadow and measures 0.82
saturation, which no individual prop made of wood and galvanised steel is ever
going to reach honestly — chasing it would oversaturate the whole set.

The target is what the FIFTY ASSETS THAT ALREADY LOOK RIGHT measure. It is an
achieved value rather than an aspiration, and matching it means matching the
props a drifted prop will actually be standing next to.

HOW HARD IT PULLS
-----------------
Not all the way. A poster at luminance 145 dragged to 24 is not a corrected
poster, it is a deleted one — and the brightness ORDER within the scene carries
real information: a paper notice should be the palest thing on a wall, just not
by a factor of six.

So the correction closes a fraction of the gap, in log space, and is clamped.
The poster ends up pale, the way a poster should be, and stops glowing.

Light sources are never touched — the manifest says which they are, and
`stylecheck.py` exempts the same set.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from manifest_read import props_with_draw_size, by_file   # noqa: E402
from pixelate import load_palette, snap_to_palette        # noqa: E402
from stylecheck import measure, lit_props                 # noqa: E402
from imageio import save_art                             # noqa: E402

# What the assets that already look right measure. Recomputed by `--recalibrate`
# rather than guessed, so this stays true as the set changes.
TARGET_LUM = 24.0
TARGET_SAT = 0.77

# How much of the gap to close, in log space. 1.0 would force every prop to the
# same luminance, which would flatten the scene into a single tone.
STRENGTH = 0.65

# Bounds on a single correction. A prop that needs more than this is not
# drifted, it is a different piece of art, and quietly mangling it is worse than
# reporting it.
# The floor is 0.42 rather than 0.30 by observation, not by theory. At 0.30 the
# laundry line — white washing under a bulb — came down to luminance 37 and
# stopped reading as white washing. Something that is genuinely the brightest
# unlit thing in a scene should still be the brightest unlit thing afterwards.
EXPOSURE_RANGE = (0.42, 1.60)
SATURATION_RANGE = (0.85, 1.70)

# How far a prop's mean colour may turn before the grade is refused, in degrees.
# Deepening a blue is a few degrees; turning it olive is twenty.
MAX_HUE_SHIFT = 6.0


def corrections(m, strength):
    """Exposure and saturation multipliers for one measured asset."""
    exposure = (TARGET_LUM / max(m["lum"], 1e-3)) ** strength
    saturation = (TARGET_SAT / max(m["sat"], 1e-3)) ** strength

    return (
        float(np.clip(exposure, *EXPOSURE_RANGE)),
        float(np.clip(saturation, *SATURATION_RANGE)),
    )


def hue_direction(rgb, alpha):
    """The mean colour of the opaque pixels, as a unit vector.

    Direction rather than magnitude, so darkening a prop does not register as
    changing its colour — which is the whole point: the grade is ALLOWED to
    change how bright and how deep a thing is, and is not allowed to change
    what colour it is.
    """
    opaque = rgb[alpha > 128]
    if len(opaque) == 0:
        return np.array([0.0, 0.0, 0.0])
    mean = opaque.mean(axis=0)
    norm = np.linalg.norm(mean)
    return mean / norm if norm > 1e-6 else mean


def hue_shift_degrees(before, after):
    """Angle between two mean-colour directions, in degrees."""
    if np.linalg.norm(before) < 1e-6 or np.linalg.norm(after) < 1e-6:
        return 0.0
    cos = float(np.clip(np.dot(before, after), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def apply(path, exposure, saturation, palette, dry_run):
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGBA")).astype(np.float32)

    rgb, alpha = a[:, :, :3], a[:, :, 3]

    lum = (rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152
           + rgb[:, :, 2] * 0.0722)[:, :, None]

    # Saturation is boosted IN PROPORTION TO WHAT EACH PIXEL ALREADY HAS.
    #
    # A flat multiply looks right on paper and is wrong on paper: a white sheet
    # is near-neutral, so its channels differ by two or three values, and
    # multiplying that difference by 1.7 turns a tiny cast into a visible hue.
    # Applied flat, this graded the poster brown and the laundry olive — both
    # of which are white cloth, and both of which stopped reading as white
    # cloth. Looked at, rejected, and this is the fix.
    #
    # Weighting by the pixel's own saturation leaves neutrals neutral and
    # deepens colours that are already colours, which is what "more saturated"
    # was supposed to mean.
    mx = rgb.max(axis=2, keepdims=True)
    mn = rgb.min(axis=2, keepdims=True)
    pixel_sat = (mx - mn) / np.maximum(mx, 1.0)

    weighted = 1.0 + (saturation - 1.0) * pixel_sat
    rgb = lum + (rgb - lum) * weighted

    rgb = np.clip(rgb * exposure, 0, 255)

    # Back onto the world's palette. Without this the grade invents colours,
    # and a limited-palette scene with a few off-palette props is worse than
    # one with a few pale ones.
    rgb = snap_to_palette(rgb.astype(float), palette)

    out = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")

    # THE GUARD.
    #
    # Grading moves colours, and the palette snap that follows moves them again
    # — to the nearest of sixty-four, which for a colour the palette does not
    # cover well can be somewhere else entirely. Darkening the laundry line
    # landed its blue-white sheets on a warm accent: they came back olive with
    # red chevrons, which is not a graded laundry line, it is a different
    # object.
    #
    # So the result is checked before it is kept. If the mean colour has
    # actually TURNED rather than merely deepened, the grade is refused and the
    # asset is reported for a human to look at.
    shift = hue_shift_degrees(
        hue_direction(a[:, :, :3], alpha),
        hue_direction(rgb.astype(np.float32), alpha))

    if shift > MAX_HUE_SHIFT:
        return None, shift

    if not dry_run:
        save_art(out, path)
    return out, shift


def recalibrate(files, lit):
    """The medians of the assets currently judged ok, for the target constants."""
    ref = measure(ROOT / "assets/city/master_rooftop.png")
    lums, sats = [], []

    for path in files:
        if path.name in lit:
            continue
        m = measure(path)
        if not m:
            continue
        if (abs(m["lum"] - ref["lum"]) <= 22
                and abs(m["sat"] - ref["sat"]) <= 0.13):
            lums.append(m["lum"])
            sats.append(m["sat"])

    if not lums:
        return None
    return float(np.median(lums)), float(np.median(sats)), len(lums)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--strength", type=float, default=STRENGTH)
    parser.add_argument("--only", help="comma-separated asset names")
    parser.add_argument("--recalibrate", action="store_true",
                        help="print the target medians and stop")
    args = parser.parse_args(argv)

    palette = load_palette()
    lit = lit_props()
    files = sorted(ROOT / f for f in by_file(props_with_draw_size()))

    if args.recalibrate:
        got = recalibrate(files, lit)
        if not got:
            print("nothing measured", file=sys.stderr)
            return 1
        lum, sat, n = got
        print(f"{n} assets currently judged ok")
        print(f"  TARGET_LUM = {lum:.1f}   (file says {TARGET_LUM})")
        print(f"  TARGET_SAT = {sat:.2f}   (file says {TARGET_SAT})")
        return 0

    wanted = set(args.only.split(",")) if args.only else None
    ref = measure(ROOT / "assets/city/master_rooftop.png")

    graded = lamps = fine = refused = softened = 0

    for path in files:
        if wanted and path.stem not in wanted:
            continue

        if path.name in lit:
            lamps += 1
            continue

        m = measure(path)
        if not m:
            continue

        drifted = (abs(m["lum"] - ref["lum"]) > 22
                   or abs(m["sat"] - ref["sat"]) > 0.13)
        if not drifted and not wanted:
            fine += 1
            continue

        exposure, saturation = corrections(m, args.strength)
        if abs(exposure - 1) < 0.02 and abs(saturation - 1) < 0.02:
            fine += 1
            continue

        out, shift = apply(path, exposure, saturation, palette, args.dry_run)

        # Most of a hue shift comes from the saturation boost, not from the
        # exposure — deepening a near-neutral is what pushes it across a
        # palette boundary. So a refused grade is retried with the tone
        # correction alone, which is the part that was mostly wanted anyway.
        note = ""
        if out is None:
            out, shift = apply(path, exposure, 1.0, palette, args.dry_run)
            note = "  (tone only; the saturation boost turned its colour)"
            softened += 1

        if out is None:
            refused += 1
            softened -= 1
            print(f"  ! {path.name:<24} REFUSED — even a plain exposure change "
                  f"turns its colour {shift:.0f} degrees")
            continue

        after = measure(path) if not args.dry_run else None
        graded += 1

        arrow = (f" -> lum {after['lum']:.0f} sat {after['sat']:.2f}"
                 if after else "")
        print(f"  {path.name:<26} lum {m['lum']:>5.0f} sat {m['sat']:.2f}"
              f"   x{exposure:.2f} exposure, x{saturation:.2f} saturation{arrow}{note}")

    print()
    print(f"{graded} graded ({softened} tone only), {fine} already in range, "
          f"{lamps} light sources left alone, {refused} refused")
    if args.dry_run:
        print("(dry run - nothing written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
