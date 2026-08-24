"""Measures the things that make pixel art read as amateur.

    python scripts/pixel_audit.py                 every served asset
    python scripts/pixel_audit.py --detail NAME   one asset, in full
    python scripts/pixel_audit.py --failing       only assets with findings

`stylecheck.py` measures TONE — is this prop the same brightness and hue as the
rest of the world. This measures CRAFT, which is a different axis entirely: an
asset can be perfectly in-palette and perfectly lit and still look wrong because
its pixels are not on a grid, or its edges are fringed, or it is speckled with
single stray dots the cutout left behind.

Those are the tells. They are individually invisible and collectively the
difference between "pixel art" and "a picture that has been made small".

WHAT IT CHECKS
--------------
resolution    Source pixels per RENDER-BUFFER pixel, from the size the
              manifest actually draws the prop at. 1.0 is exact: one source
              pixel becomes one buffer pixel and is blitted out as a clean
              square.

              This is the check that matters most, and it is not visible in the
              file — only in the file's relationship to where it is used. Above
              1, the canvas nearest-neighbours several source pixels down to
              one and picks a different one as the prop moves, which is pixel
              swim reintroduced downstream of the machinery built to prevent it.
              Below 1 the art is stretched.

              It also means pixel SIZE is not constant across the scene, which
              the eye reads long before it can name it. `fit_resolution.py`
              brings every asset to 1.0.

              (An earlier version of this check looked for flat 2x2 blocks in
              the file. That was wrong: `pixelate --apply --block 2` DOWNSAMPLES
              by two, so the block grid is consumed by the resample and does not
              survive into the output. It reported 125 of 126 assets as broken,
              which is what a check that measures the wrong thing looks like.)

palette       Every colour should be one of the 64 in `assets/city/palette.json`.
              A prop carrying colours from outside it is the one thing that
              breaks a limited-palette scene, because the eye reads the odd
              colour as a mistake long before it can name why.

colour count  Related but not the same: a file can be entirely in-palette and
              still use fifty of the sixty-four, which for a single small prop
              means mush rather than shapes.

alpha         After `cutout.py` an edge should be hard. Semi-transparent pixels
              are the ghost of a background that was keyed out imperfectly, and
              they show as a pale halo against the night sky.

strays        Opaque pixels with no opaque neighbour. Always cutout noise; never
              deliberate.

outline       The share of edge pixels that are darker than the prop's own
              median. A prop with a dark outline and one without do not sit in
              the same world, and mixed outlining across a scene is the single
              loudest inconsistency in a prop set.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from manifest_read import props_with_draw_size, by_file     # noqa: E402
from imageio import art_files                               # noqa: E402

PALETTE_FILE = ROOT / "assets" / "city" / "palette.json"

SERVED = [
    ROOT / "assets" / "city" / "pixel",
    ROOT / "assets" / "city" / "interior",
]

ALPHA_SOLID = 250
ALPHA_CLEAR = 5


def palette():
    with open(PALETTE_FILE, encoding="utf-8") as fh:
        return np.array(json.load(fh)["colors"], dtype=int)


def load(path):
    with Image.open(path) as im:
        return np.asarray(im.convert("RGBA")).astype(int)


def palette_conformance(rgba, pal):
    """Share of opaque pixels whose colour is not in the palette, and how far."""
    opaque = rgba[rgba[:, :, 3] > ALPHA_SOLID][:, :3]
    if len(opaque) == 0:
        return 0.0, 0, 0

    colours, counts = np.unique(opaque, axis=0, return_counts=True)

    # Nearest palette entry for each distinct colour.
    d = np.linalg.norm(colours[:, None, :] - pal[None, :, :], axis=2)
    nearest = d.min(axis=1)

    off = nearest > 0.5
    off_pixels = counts[off].sum()
    return (100.0 * off_pixels / len(opaque), len(colours), float(nearest.max()))


def alpha_health(rgba):
    """Share of pixels that are neither solidly opaque nor fully clear."""
    a = rgba[:, :, 3]
    edge = ((a > ALPHA_CLEAR) & (a < ALPHA_SOLID)).sum()
    ink = (a > ALPHA_CLEAR).sum()
    return (100.0 * edge / ink) if ink else 0.0


def strays(rgba):
    """Opaque pixels with no opaque neighbour among the eight around them.

    EIGHT, not four. A four-neighbour test calls every pixel of a diagonal
    one-pixel line a stray, and this world is full of diagonal one-pixel lines:
    guy wires, aerials, bicycle spokes, the cross-bracing on the water tower.
    It reported twenty strays on `bike.png`, all of which were the bicycle.
    """
    solid = rgba[:, :, 3] > ALPHA_SOLID
    if solid.sum() == 0:
        return 0

    padded = np.pad(solid, 1)
    neighbours = np.zeros_like(solid, dtype=int)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            neighbours += padded[1 + dy:1 + dy + solid.shape[0],
                                 1 + dx:1 + dx + solid.shape[1]]

    return int((solid & (neighbours == 0)).sum())


def outline_darkness(rgba):
    """Share of boundary pixels darker than the sprite's median luminance.

    100 means every edge pixel is in shadow — a fully outlined sprite. Around
    50 means the edge is as light as the middle, which is a sprite with no
    outline at all.
    """
    solid = rgba[:, :, 3] > ALPHA_SOLID
    if solid.sum() < 32:
        return None

    interior = (
        np.pad(solid[1:, :], ((0, 1), (0, 0)))
        & np.pad(solid[:-1, :], ((1, 0), (0, 0)))
        & np.pad(solid[:, 1:], ((0, 0), (0, 1)))
        & np.pad(solid[:, :-1], ((0, 0), (1, 0)))
    )
    boundary = solid & ~interior
    if boundary.sum() < 8:
        return None

    rgb = rgba[:, :, :3]
    lum = rgb[:, :, 0] * .2126 + rgb[:, :, 1] * .7152 + rgb[:, :, 2] * .0722

    median = np.median(lum[solid])
    return 100.0 * (lum[boundary] < median).mean()


def audit(path, pal, use):
    rgba = load(path)
    off_pal, colours, worst = palette_conformance(rgba, pal)

    return {
        "path": path,
        "size": f"{rgba.shape[1]}x{rgba.shape[0]}",
        "ratio": use["ratio"] if use else None,
        "unused": use is None,
        "off_palette": off_pal,
        "colours": colours,
        "worst_palette_distance": worst,
        "soft_alpha": alpha_health(rgba),
        "strays": strays(rgba),
        "outline": outline_darkness(rgba),
    }


# What counts as a finding. Set from what the good assets in this set actually
# measure, so "ok" means "like the ones that look right" rather than an
# abstract ideal.
def findings(row):
    out = []
    if row["unused"]:
        out.append("not used by any manifest")
    elif row["ratio"] > 1.6:
        out.append(f"over-resolved {row['ratio']:.1f}x")
    elif row["ratio"] < 0.85:
        out.append(f"upscaled {row['ratio']:.2f}x")
    if row["off_palette"] > 1.0:
        out.append(f"off-palette {row['off_palette']:.0f}%")
    if row["colours"] > 96:
        out.append(f"{row['colours']} colours")
    if row["soft_alpha"] > 2.0:
        out.append(f"soft edges {row['soft_alpha']:.0f}%")
    if row["strays"] > 0:
        out.append(f"{row['strays']} strays")
    # Outline darkness is REPORTED but is not a finding.
    #
    # It is a real axis — a set where some props are outlined and some are not
    # does not read as one set — but the measure is too blunt to act on
    # automatically. It scores a cloud at 5% and a wall at 91%, and both are
    # right: an atmospheric layer should not have a hard dark edge and a solid
    # object should. Turning the number into a verdict would mean outlining the
    # clouds, which would be worse.
    #
    # Left in the table so a human can scan the column and spot a prop that is
    # out of line with ITS OWN NEIGHBOURS, which is the comparison that matters
    # and the one a threshold cannot make.
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--detail", help="one asset by name")
    parser.add_argument("--failing", action="store_true")
    args = parser.parse_args(argv)

    pal = palette()
    uses = by_file(props_with_draw_size())
    files = sorted(f for d in SERVED for f in art_files(d))

    if args.detail:
        files = [p for p in files if args.detail in p.name]
        if not files:
            print(f"no asset matching {args.detail}", file=sys.stderr)
            return 1

    rows = [audit(p, pal, uses.get(str(p.relative_to(ROOT)).replace("\\", "/")))
            for p in files]

    if args.detail:
        for row in rows:
            print(f"\n{row['path'].relative_to(ROOT)}   {row['size']}")
            ratio = "unused" if row["unused"] else f"{row['ratio']:6.2f}x"
            print(f"  source px / buffer px  {ratio}")
            print(f"  off-palette pixels  {row['off_palette']:6.1f}%  "
                  f"(worst distance {row['worst_palette_distance']:.0f})")
            print(f"  distinct colours    {row['colours']:6d}")
            print(f"  soft-alpha pixels   {row['soft_alpha']:6.1f}%")
            print(f"  stray pixels        {row['strays']:6d}")
            if row["outline"] is not None:
                print(f"  edge in shadow      {row['outline']:6.0f}%")
            print(f"  -> {', '.join(findings(row)) or 'clean'}")
        return 0

    hdr = (f"{'asset':<26}{'res':>7}{'palette':>9}{'cols':>6}"
           f"{'soft':>7}{'stray':>7}{'edge':>7}   findings")
    print(hdr)
    print("-" * (len(hdr) + 20))

    clean = 0
    tally = {}

    for row in sorted(rows, key=lambda r: -len(findings(r))):
        f = findings(row)
        if not f:
            clean += 1
            if args.failing:
                continue
        for item in f:
            tally[item.split()[0]] = tally.get(item.split()[0], 0) + 1

        outline = f"{row['outline']:.0f}%" if row["outline"] is not None else "-"
        ratio = "  -  " if row["unused"] else f"{row['ratio']:.2f}"
        print(f"{row['path'].name:<26}"
              f"{ratio:>7}"
              f"{row['off_palette']:>8.0f}%"
              f"{row['colours']:>6}"
              f"{row['soft_alpha']:>6.0f}%"
              f"{row['strays']:>7}"
              f"{outline:>7}   {', '.join(f) or 'clean'}")

    print(f"\n{len(rows)} assets, {clean} clean, {len(rows) - clean} with findings")
    for key, n in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>3} x {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
