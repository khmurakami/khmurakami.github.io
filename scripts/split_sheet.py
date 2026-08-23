"""Split a sheet of separate props into individual transparent PNGs.

Generating one prop per image is slow and, worse, lets each one drift in style.
A row of props generated together shares one lighting setup and one palette, so
they belong to each other before they ever reach the engine.

Props are found by vertical gaps in the alpha channel, cropped to their own
artwork, and written out in left-to-right order under the names given.

Usage:
    python scripts/split_sheet.py sheet.png outdir name1 name2 name3 ...
    python scripts/split_sheet.py sheet.png outdir --auto      (prints what it finds)
"""
import os
import sys
import numpy as np
from PIL import Image


def find_columns(alpha, min_gap=6, min_width=12):
    """Runs of occupied columns, merged across hairline gaps."""
    occupied = (alpha > 16).sum(axis=0) > 0
    runs, start = [], None
    for x, on in enumerate(occupied):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, len(occupied)])

    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [tuple(r) for r in merged if r[1] - r[0] >= min_width]


def split(sheet_path, outdir, names=None, pad=4):
    im = Image.open(sheet_path).convert("RGBA")
    a = np.asarray(im)[:, :, 3]

    cols = find_columns(a)
    print(f"{sheet_path}: found {len(cols)} props")

    if names and len(cols) != len(names):
        print(f"  WARNING: {len(cols)} found but {len(names)} names given.")
        print("  Left-to-right widths:", [c[1] - c[0] for c in cols])
        if len(cols) < len(names):
            print("  Some props are touching. Increase spacing in the prompt and retry.")
            return []

    os.makedirs(outdir, exist_ok=True)
    written = []

    for i, (x0, x1) in enumerate(cols):
        sub = a[:, x0:x1]
        ys = np.where((sub > 16).any(axis=1))[0]
        crop = im.crop((max(0, x0 - pad), max(0, ys.min() - pad),
                        min(im.width, x1 + pad), min(im.height, ys.max() + 1 + pad)))

        name = names[i] if names and i < len(names) else f"prop_{i}"
        dst = os.path.join(outdir, f"{name}.png")
        crop.save(dst)
        written.append(dst)
        print(f"  {name:<22} {crop.width:>4}x{crop.height:<4} -> {dst}")

    return written


if __name__ == "__main__":
    argv = sys.argv[1:]
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)
    sheet, outdir = argv[0], argv[1]
    rest = argv[2:]
    names = None if (not rest or rest[0] == "--auto") else rest
    split(sheet, outdir, names)
