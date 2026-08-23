"""Compose several single-clip strips into one multi-row sprite sheet.

Sprite.js addresses an animation by row, so every clip for one actor has to live
in a single texture on a shared grid. Generated strips arrive one clip per file
with different cell sizes, so they need a common cell and a common baseline
first — otherwise the character changes size or hops vertically when the clip
switches.

Rows are padded with transparency to the widest clip; Sprite only reads
`length` frames per clip, so the empty cells are never drawn.

A clip may be mirrored from another file by suffixing the source with `:flip`.
Mirroring rather than generating the opposite facing guarantees the two are
perfectly symmetric, and costs nothing.

Usage:
    python scripts/compose.py out.png idle=char_idle_sheet.png walk=char_walk_sheet.png [--no-match-height]
    python scripts/compose.py out.png right=side_sheet.png left=side_sheet.png:flip
"""
import sys
import numpy as np
from PIL import Image


def frames_of(path):
    """Splits an already-repacked strip into its frames using empty columns."""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[:, :, 3] > 16
    cols = a.sum(axis=0) > 0

    runs, start = [], None
    for x, on in enumerate(cols):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(cols)))
    runs = [r for r in runs if r[1] - r[0] > 20]

    out = []
    for x0, x1 in runs:
        sub = a[:, x0:x1]
        ys = np.where(sub.any(axis=1))[0]
        xs = np.where(sub.any(axis=0))[0]
        out.append(im.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1)))
    return out


def compose(dst, clips, pad=8, match_height=True):
    """clips: list of (name, path), where path may end in ':flip' to mirror it."""
    cache = {}
    parsed = []
    for name, path in clips:
        flip = path.endswith(":flip")
        if flip:
            path = path[: -len(":flip")]
        if path not in cache:
            cache[path] = frames_of(path)
        parsed.append((name, path, flip))

    # Mirroring is deliberately deferred until AFTER height normalisation.
    # Nearest-neighbour resampling is not symmetric — scaling a mirrored frame
    # picks different source pixels than mirroring a scaled one — so flipping
    # first leaves the two facings subtly different instead of exact mirrors.
    loaded = [(name, cache[path]) for name, path, _ in parsed]

    if match_height:
        # Clips are generated independently, so the same character can come back
        # a different size per clip — here walk was 14% shorter than idle, which
        # would make the character visibly shrink the moment they started moving.
        # Normalise every clip to the tallest one so scale is continuous across
        # animation switches. Nearest-neighbour keeps the hard pixel edges, and
        # the sprite is heavily downscaled at render time anyway.
        peak = {name: max(f.height for f in fs) for name, fs in loaded}
        target = max(peak.values())
        rescaled = []
        for name, fs in loaded:
            k = target / peak[name]
            if abs(k - 1) < 1e-6:
                rescaled.append((name, fs))
                continue
            fs = [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))),
                           Image.NEAREST) for f in fs]
            print(f"   scaled {name} by {k:.3f} to match tallest clip ({target}px)")
            rescaled.append((name, fs))
        loaded = rescaled

    # Now mirror, so each flipped clip is an exact reflection of its source.
    loaded = [
        (name, [f.transpose(Image.FLIP_LEFT_RIGHT) for f in fs] if flip else fs)
        for (name, fs), (_, _, flip) in zip(loaded, parsed)
    ]

    all_frames = [f for _, fs in loaded for f in fs]
    cell_w = max(f.width for f in all_frames) + pad * 2
    cell_h = max(f.height for f in all_frames) + pad * 2
    cols = max(len(fs) for _, fs in loaded)

    sheet = Image.new("RGBA", (cell_w * cols, cell_h * len(loaded)), (0, 0, 0, 0))
    for row, (name, fs) in enumerate(loaded):
        for i, f in enumerate(fs):
            ox = i * cell_w + (cell_w - f.width) // 2
            oy = row * cell_h + (cell_h - pad - f.height)
            sheet.paste(f, (ox, oy), f)

    sheet.save(dst, "PNG")

    print(f"-> {dst}")
    print(f"   grid {cols} cols x {len(loaded)} rows, cell {cell_w}x{cell_h}, "
          f"sheet {sheet.width}x{sheet.height}")
    for row, (name, fs) in enumerate(loaded):
        print(f"   row {row}: {name:<6} {len(fs)} frames")
    print(f"   manifest -> sheet: {{ frameCount: {cols}, rows: {len(loaded)} }}")
    tallest = max(f.height for f in all_frames)
    print(f"   manifest -> content: {{ top: {cell_h - pad - tallest}, left: {pad}, "
          f"right: {cell_w - pad}, baseline: {cell_h - pad}, "
          f"frameW: {cell_w}, frameH: {cell_h} }}")
    print(f"   character height: {tallest}px  (scale actors by height, not width - "
          f"stride width varies per clip)")
    return sheet


if __name__ == "__main__":
    argv = sys.argv[1:]
    pad = 8
    if "--pad" in argv:
        i = argv.index("--pad")
        pad = int(argv[i + 1])
        del argv[i:i + 2]
    match_height = "--no-match-height" not in argv
    argv = [a for a in argv if a != "--no-match-height"]
    if len(argv) < 2 or "=" not in "".join(argv[1:]):
        print(__doc__)
        sys.exit(1)
    dst = argv[0]
    clips = [tuple(a.split("=", 1)) for a in argv[1:]]
    compose(dst, clips, pad, match_height)
