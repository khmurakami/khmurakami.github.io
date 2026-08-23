"""Reduce every asset to one pixel grid and one shared palette.

Assets are generated independently, so they arrive at different effective
resolutions and with tens of thousands of colours each. Composited, a smooth
render sits next to a blocky one and the scene stops reading as a single piece
of art — no amount of per-asset grading fixes that, because the problem is
resolution and palette, not exposure.

Two passes, both deterministic:

  1. Resolution — downsample by a fixed factor so every asset shares one pixel
     size, then leave it small. The engine scales it back up with smoothing off,
     which is what keeps the pixels crisp instead of resampling them away.

  2. Palette — map every asset through ONE palette built from the style master.
     A shared palette is what makes separately-made assets look machine-cut from
     the same material; it is the single biggest cohesion win available.

Alpha is preserved and re-hardened, so cut-out props stay cut out.

Usage:
    python scripts/pixelate.py --build-palette master.png prop1.png prop2.png [--colors 64]
    python scripts/pixelate.py --apply asset.png [asset2.png ...] [--block 3]
"""
import json
import os
import sys
import numpy as np
from PIL import Image

PALETTE_FILE = 'assets/city/palette.json'


# Accent colours added on top of the derived ramp.
#
# A palette median-cut from a night scene is almost entirely shadow: it has no
# room for the few bright, saturated colours the world actually needs — a lamp,
# a lit window, neon. Those cover a tiny fraction of the frame, so they never
# win a slot, but they are the colours the eye goes to. A pixel artist builds
# the same way: a ramp for the mass, plus a handful of deliberate accents.
ACCENTS = [
    [255, 214, 150],  # warm lamp core
    [232, 168,  92],  # warm lamp falloff
    [180, 116,  60],  # deep amber
    [255, 246, 226],  # highlight / bulb
    [140, 236, 255],  # cool neon cyan
    [ 96, 176, 224],  # cold window
    [236, 110, 208],  # neon magenta
    [176, 235, 170],  # greenhouse green
    [255,  92,  92],  # aircraft warning red
]


def build_palette(sources, colors=64):
    """Derives the world palette from several sources at once.

    Building from the night master alone produces a palette with almost no warm
    mid-tones — the scene is over 90% deep shadow, so median-cut spends nearly
    every slot on indigo and violet, and any warm prop snapped through it turns
    purple. Feeding the lit props in alongside the scene keeps the warm range
    represented in proportion to how much the world actually needs it.
    """
    # Equal sample per source. Concatenating raw pixels would weight each source
    # by its area, and a full-frame skyline has hundreds of times the pixels of a
    # crate — median-cut then spends every slot on sky and none on anything the
    # player stands next to.
    PER_SOURCE = 60000
    rs = np.random.default_rng(7)

    tiles = []
    for src in sources:
        im = Image.open(src).convert('RGBA')
        # Only opaque pixels count: the empty space around a cut-out prop is not
        # part of the world's colour.
        a = np.asarray(im)
        px = a[:, :, :3][a[:, :, 3] > 128]
        if len(px) < 32:
            continue
        idx = rs.integers(0, len(px), PER_SOURCE) if len(px) > PER_SOURCE else np.arange(len(px))
        tiles.append(px[idx].reshape(-1, 1, 3))

    if not tiles:
        raise SystemExit('no usable source pixels')

    stacked = np.concatenate(tiles, axis=0).astype(np.uint8)
    strip = Image.fromarray(stacked)

    # Leave room for the accents so the total stays at `colors`.
    derived = max(8, colors - len(ACCENTS))
    q = strip.quantize(colors=derived, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = np.array(q.getpalette()[:derived * 3]).reshape(-1, 3).tolist()
    pal.extend(ACCENTS)

    os.makedirs(os.path.dirname(PALETTE_FILE), exist_ok=True)
    with open(PALETTE_FILE, 'w') as f:
        json.dump({'sources': sources, 'colors': pal}, f, indent=1)

    warm = sum(1 for c in pal if c[0] > c[2] + 12)
    print(f'palette: {len(pal)} colours from {len(sources)} sources -> {PALETTE_FILE}')
    print(f'  warm slots (R > B): {warm}/{len(pal)}')
    return np.array(pal, dtype=float)


def load_palette():
    with open(PALETTE_FILE) as f:
        return np.array(json.load(f)['colors'], dtype=float)


def snap_to_palette(rgb, palette):
    """Nearest palette colour per pixel, in one vectorised pass."""
    flat = rgb.reshape(-1, 3)
    # Chunked so a large layer does not allocate a giant distance matrix.
    out = np.empty_like(flat)
    step = 200000
    for i in range(0, len(flat), step):
        chunk = flat[i:i + step]
        d = ((chunk[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
        out[i:i + step] = palette[d.argmin(axis=1)]
    return out.reshape(rgb.shape)


def pixelate(path, block=3, palette=None, out_path=None):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    nw, nh = max(1, w // block), max(1, h // block)

    # Box-filter down: averaging before snapping gives cleaner clusters than
    # nearest, which would just pick an arbitrary pixel from each block.
    small = im.resize((nw, nh), Image.BOX)
    a = np.asarray(small).astype(float)
    rgb, alpha = a[:, :, :3], a[:, :, 3]

    if palette is not None:
        rgb = snap_to_palette(rgb, palette)

    # Re-harden alpha: box filtering softens the cut-out edge, and a pixel-art
    # sprite must not have a translucent fringe.
    alpha = np.where(alpha > 110, 255, 0)

    out = np.dstack([rgb, alpha]).astype(np.uint8)
    dst = out_path or path
    Image.fromarray(out).save(dst)
    return (w, h), (nw, nh)


if __name__ == '__main__':
    argv = sys.argv[1:]
    block = 3
    colors = 64
    if '--block' in argv:
        i = argv.index('--block'); block = int(argv[i + 1]); del argv[i:i + 2]
    if '--colors' in argv:
        i = argv.index('--colors'); colors = int(argv[i + 1]); del argv[i:i + 2]

    if '--build-palette' in argv:
        i = argv.index('--build-palette')
        srcs = [x for x in argv[i + 1:] if not x.startswith('--')]
        build_palette(srcs, colors)
        sys.exit(0)

    if '--apply' in argv:
        argv.remove('--apply')
        pal = load_palette()
        files = [x for x in argv if not x.startswith('--')]
        for f in files:
            before, after = pixelate(f, block, pal)
            name = f.replace('\\', '/').split('/')[-1]
            print(f'  {name:<24} {before[0]}x{before[1]} -> {after[0]}x{after[1]}')
        sys.exit(0)

    print(__doc__)
