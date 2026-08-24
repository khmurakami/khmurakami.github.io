"""Resamples every asset to the resolution the world actually draws it at.

    python scripts/fit_resolution.py --dry-run
    python scripts/fit_resolution.py

THE PROBLEM
-----------
`world-main.js` opens with a long comment about the pixel pipeline, and it is
right about everything it says: the world is drawn into a low-resolution buffer
and blitted out at a whole-number scale, precisely so that art pixels land on
screen as clean squares rather than swimming as the camera moves.

That fixes the BLIT. It does nothing about the assets, and the assets were never
brought into line. Measured across all three scenes:

    source pixels per buffer pixel
    min 0.71   p10 1.34   median 2.81   p90 4.93   max 7.72

Nearly eight source pixels crushed into one buffer pixel at the worst. The
canvas resolves that by nearest-neighbour — it picks ONE of those eight and
throws the rest away — and which one it picks changes as the prop moves across
the buffer. That is pixel swim, reintroduced downstream of the machinery built
to prevent it, and it is why `bare_bulb` (7.0x) reads as a smudge while
`beacon_mast` (1.3x) reads as a mast.

It also means pixel SIZE is not constant across the scene, which is the thing
the eye picks up before it can name it: a prop at 1.0x and a prop at 5.0x
standing next to each other are built out of visibly different-sized pixels.

THE FIX
-------
Author each asset at the size it is drawn. The manifest says how big every prop
is, so the target resolution is not a matter of taste — it is arithmetic, and
this does the arithmetic and the resample.

  - Down only. An asset already smaller than its drawn size is left alone and
    reported; upscaling invents detail and there is none to invent.
  - Box filter on PREMULTIPLIED alpha, then snap to the world's 64-colour
    palette, then re-harden the edge at a threshold that moves with the
    reduction. The first two of those are what `pixelate.py --apply` does; the
    premultiply and the moving threshold are corrections this needed and it
    does not, because it only ever reduces by two or three and the errors do
    not show at that scale.
  - One target per FILE, taken from its LARGEST use. The weeds are scattered at
    eighteen different sizes from one file; sizing to the biggest means the rest
    are gently downscaled rather than any of them being blown up.

  - The character's sheet is deliberately NOT touched. It is a 12x4 grid whose
    frame size, baseline and content box are declared in the manifest, so
    resampling it means resampling those numbers too, onto a grid that has to
    stay whole. At 1.44x the prize is small and the ways to get it wrong are
    many. It is listed and left alone.

The composition does not move. Nothing in any manifest changes. Every prop is
drawn at exactly the same size, in exactly the same place, out of pixels that
are finally all the same size.
"""
import argparse
import sys
from math import ceil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from manifest_read import props_with_draw_size, by_file, REFERENCE_PIXEL_SCALE  # noqa: E402
from pixelate import load_palette, snap_to_palette                             # noqa: E402
from imageio import save_art                                                   # noqa: E402

# Leave a file alone if it is already within this much of its target. Resampling
# for a 3% gain costs more in generation loss than it wins in crispness.
TOLERANCE = 1.12

# Never take a sprite below this. A prop drawn eight buffer pixels tall is a
# composition problem, not a resolution one, and grinding it to 12x8 makes it
# permanently unrecoverable — the manifest can be retuned later, and the art
# should still be there when it is.
MIN_DIMENSION = 16


def alpha_threshold(reduction):
    """Where to re-harden the edge, given how far the sprite is being reduced.

    Box filtering leaves a soft edge and a pixel-art sprite must not carry one,
    so it is thresholded back to hard. WHERE to put the threshold is not a
    constant, because it decides which thin features survive:

    a feature one source pixel wide, reduced by R, covers 1/R of a target pixel
    and comes out at roughly 255/R alpha. The cat is reduced tenfold, so its
    legs and tail arrive at about 25 — and a fixed threshold of 110 deleted
    them, which is exactly what the first pass did. It produced a cat with no
    legs.

    A low threshold everywhere is not the answer either: on a mild reduction it
    just fattens every silhouette by a pixel. So it moves with the reduction.
    """
    return 64 if reduction > 3 else 110


def resample(path, target_w, target_h, palette, dry_run):
    """Reduces one sprite to an exact size, cleanly.

    Three things have to be right at once, and each of them was got wrong once
    on the way here — the wrong version is recorded beside each, because the
    symptom is what identifies it next time.

    1. PREMULTIPLY. Pillow resizes the four channels independently, so the
       colour of a fully transparent pixel — arbitrary, and after a cutout
       usually black — is averaged into its neighbours. Every edge is dragged
       towards it and the sprite comes back with a dark fringe nobody drew.

    2. IN FLOAT. Premultiplied colour round-tripped through uint8 keeps its
       information in very small numbers: a pixel at alpha 30 carries colour in
       values under 30, and dividing that back out multiplies the rounding
       error eightfold. Symptom: bright speckles along the rim of a dark
       sprite. Both cats came back wearing a blue halo.

    3. A THRESHOLD THAT MOVES. See `alpha_threshold`. Symptom of getting it
       wrong: a walking cat with no legs.

    BOX — a plain area average — rather than Lanczos or Hamming. Both are
    sharper and both overshoot, and an overshoot snapped to a 64-colour palette
    does not land on a slightly brighter version of itself: it lands on the
    nearest ACCENT, so a brown telescope grows a cyan speckle. Tried, looked
    at, rejected.
    """
    with Image.open(path) as im:
        src = np.asarray(im.convert("RGBA")).astype(np.float32)
    before = (src.shape[1], src.shape[0])

    reduction = max(before[0] / target_w, before[1] / target_h)

    alpha = src[:, :, 3:4]
    premultiplied = np.dstack([src[:, :, :3] * (alpha / 255.0), alpha])

    # One channel at a time, in float32, so nothing is quantised until the end.
    resized = np.empty((target_h, target_w, 4), dtype=np.float32)
    for c in range(4):
        channel = Image.fromarray(premultiplied[:, :, c], mode="F")
        resized[:, :, c] = np.asarray(
            channel.resize((target_w, target_h), Image.BOX))

    coverage = np.maximum(resized[:, :, 3:4], 1e-6)
    rgb = np.clip(resized[:, :, :3] / (coverage / 255.0), 0, 255)

    rgb = snap_to_palette(rgb.astype(float), palette)
    hard = np.where(resized[:, :, 3] > alpha_threshold(reduction), 255, 0)

    image = Image.fromarray(np.dstack([rgb, hard]).astype(np.uint8), "RGBA")

    if not dry_run:
        save_art(image, path)

    return before, (target_w, target_h)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--tolerance", type=float, default=TOLERANCE)
    args = parser.parse_args(argv)

    props = props_with_draw_size()
    targets = by_file(props)
    palette = load_palette()

    resized = skipped = floored = already = sheets = 0
    bytes_before = bytes_after = 0

    for file, use in sorted(targets.items()):
        path = ROOT / file
        if not path.exists():
            continue

        # A sprite sheet's resolution is tied to a frame grid and to content
        # offsets declared in the manifest. Resampling one means resampling
        # those, onto a grid that has to stay whole.
        if use["cols"] > 1 or use["rows"] > 1:
            sheets += 1
            print(f"  = {file}  {use['ratio']:.2f}x — sprite sheet "
                  f"({use['cols']}x{use['rows']} frames), left alone")
            continue

        target_h = max(1, int(ceil(use["buffer_h"])))
        target_w = max(1, int(ceil(use["buffer_w"])))

        src_w, src_h = use["src_w"], use["src_h"]

        if src_h <= target_h * args.tolerance:
            # Already the right size, or smaller — which means it is being
            # upscaled, and there is nothing this script can do about that
            # except say so.
            if src_h < target_h / args.tolerance:
                skipped += 1
                print(f"  ! {file}  {src_w}x{src_h} is SMALLER than its drawn "
                      f"{target_w}x{target_h} — upscaled at draw time")
            else:
                already += 1
            continue

        if target_h < MIN_DIMENSION or target_w < MIN_DIMENSION:
            floored += 1
            scale = max(MIN_DIMENSION / target_h, MIN_DIMENSION / target_w)
            target_h = max(MIN_DIMENSION, int(ceil(target_h * scale)))
            target_w = max(MIN_DIMENSION, int(ceil(target_w * scale)))

        size_before = path.stat().st_size
        before, after = resample(path, target_w, target_h, palette, args.dry_run)
        size_after = size_before if args.dry_run else path.stat().st_size

        bytes_before += size_before
        bytes_after += size_after
        resized += 1

        print(f"  {file:<44} {before[0]}x{before[1]} -> {after[0]}x{after[1]}"
              f"   ({use['ratio']:.1f}x -> 1.0x)")

    print()
    print(f"{len(targets)} files: {resized} resampled, {already} already right, "
          f"{skipped} upscaled at draw time, {sheets} sprite sheets left alone, "
          f"{floored} held at the {MIN_DIMENSION}px floor")
    if not args.dry_run and bytes_before:
        print(f"{bytes_before // 1024}KB -> {bytes_after // 1024}KB "
              f"across the files touched")
    if args.dry_run:
        print("(dry run - nothing written)")
    print(f"authored for pixelScale {REFERENCE_PIXEL_SCALE} "
          f"(a 900-1080px-tall window)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
