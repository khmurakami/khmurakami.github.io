"""Measure and repair the horizontal seam on a tiling layer.

A layer marked `repeat` in the world manifest is drawn end to end, so its left
and right edges meet on screen. Generated art almost never lines up there, and
the mismatch reads as a hard vertical line sliding through the scene every time
the camera travels one image width — one of the most obvious tells that a
background is tiled.

`check` reports the mismatch. `fix` removes it by cross-fading the right edge
into a mirrored copy of the left, so the two ends converge on identical pixels.
The blend costs a strip of width at each end, which is invisible on a hazy
backdrop and cheap compared with regenerating until an edge happens to match.

Usage:
    python scripts/tile.py check in.png
    python scripts/tile.py fix in.png out.png [--blend 0.12]
"""
import sys
import numpy as np
from PIL import Image


def edge_mismatch(a):
    """Mean absolute difference between the first and last column, 0-255."""
    left = a[:, 0, :3].astype(float)
    right = a[:, -1, :3].astype(float)
    return float(np.abs(left - right).mean())


def check(src):
    a = np.asarray(Image.open(src).convert("RGBA"))
    m = edge_mismatch(a)
    # For scale: the mean difference between two random interior columns.
    w = a.shape[1]
    rng = [abs(int(a[:, i, :3].astype(float).mean() - a[:, i + 1, :3].astype(float).mean()))
           for i in range(0, w - 1, max(1, w // 64))]
    typical = float(np.mean(rng)) if rng else 0.0
    print(f"{src}")
    print(f"  size            : {a.shape[1]}x{a.shape[0]}")
    print(f"  edge mismatch   : {m:.1f}/255")
    print(f"  typical column-to-column change: {typical:.1f}/255")
    verdict = "seamless enough" if m < 6 else ("visible seam" if m < 20 else "BAD seam")
    print(f"  verdict         : {verdict}")
    return m


def fix(src, dst, blend=0.12):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    n = max(2, int(w * blend))

    before = edge_mismatch(a.astype(np.uint8))

    # Take the left strip, mirror it, and fade it in over the right strip. The
    # final column then equals the first column, so the tile closes on itself.
    left_strip = a[:, :n].copy()
    mirrored = left_strip[:, ::-1]

    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)[None, :, None]
    a[:, w - n:] = a[:, w - n:] * (1.0 - ramp) + mirrored * ramp

    # Force exact closure on the final column.
    a[:, -1] = a[:, 0]

    out = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(dst)

    after = edge_mismatch(out)
    print(f"{src} -> {dst}")
    print(f"  blended {n}px ({blend:.0%}) at the right edge")
    print(f"  edge mismatch {before:.1f} -> {after:.1f} /255")


if __name__ == "__main__":
    argv = sys.argv[1:]
    blend = 0.12
    if "--blend" in argv:
        i = argv.index("--blend")
        blend = float(argv[i + 1])
        del argv[i:i + 2]
    if not argv:
        print(__doc__); sys.exit(1)

    cmd, rest = argv[0], argv[1:]
    if cmd == "check" and len(rest) == 1:
        check(rest[0])
    elif cmd == "fix" and len(rest) == 2:
        fix(rest[0], rest[1], blend)
    else:
        print(__doc__); sys.exit(1)
