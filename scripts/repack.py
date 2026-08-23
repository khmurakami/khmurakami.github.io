"""Normalise a generated sprite strip into an engine-ready sheet.

Image models place frames by eye, not on a grid: cells drift, frames are not
evenly spaced, and baselines wobble by a few pixels. Slicing such a sheet into
N equal columns clips the artwork and makes the animation jitter.

This finds the actual frame clusters from the alpha channel, then re-emits them
on a strict uniform grid, each frame centred horizontally and aligned to a
common baseline — which is what Sprite.js expects.

Usage:
    python scripts/repack.py in.png out.png --frames 4 [--pad 8] [--equal] [--largest]
"""
import sys
import numpy as np
from PIL import Image


def find_clusters(alpha, expected, min_gap=8):
    """Splits the sheet into `expected` frame clusters using empty columns."""
    cols = (alpha > 16).sum(axis=0)
    occupied = cols > 0

    runs, start = [], None
    for x, on in enumerate(occupied):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(occupied)))

    # Merge runs separated by a hairline gap — a raised arm can briefly break
    # a column without being a separate frame.
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r))
            merged[-1] = tuple(merged[-1])
    merged = [tuple(m) for m in merged]

    if len(merged) != expected:
        # Keep the widest `expected` runs; stray specks otherwise split frames.
        merged = sorted(sorted(merged, key=lambda r: r[1] - r[0], reverse=True)[:expected])
    return merged


def split_by_valleys(alpha, expected):
    """Fallback splitter for sheets whose frames touch.

    Empty-column detection fails when a swinging arm bridges two frames, which
    collapses the whole strip into one cluster. Here the sheet is divided into
    `expected` nominal cells and each internal boundary is nudged to the least
    inky column nearby, so the cut lands in the gap between two figures rather
    than through one of them.
    """
    cols = (alpha > 16).sum(axis=0).astype(float)
    w = alpha.shape[1]
    step = w / expected
    search = int(step * 0.35)

    cuts = [0]
    for i in range(1, expected):
        nominal = int(i * step)
        lo, hi = max(1, nominal - search), min(w - 1, nominal + search)
        cuts.append(lo + int(cols[lo:hi].argmin()))
    cuts.append(w)
    return [(cuts[i], cuts[i + 1]) for i in range(expected)]


def keep_largest_blob(frame):
    """Drop everything but the biggest connected shape in a frame.

    When frames touch, a cell inherits a sliver of its neighbour — a stray boot
    or hand at the edge. Those slivers flicker during playback. The subject is
    always the largest blob, so keeping only that removes them without needing
    to find perfect cut lines.

    Iterative flood fill; scipy is not a dependency of this project.
    """
    import numpy as np
    a = np.asarray(frame)
    mask = a[:, :, 3] > 16
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    best, best_size = None, 0

    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sy, sx)]
            seen[sy, sx] = True
            pixels = []
            while stack:
                y, x = stack.pop()
                pixels.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(pixels) > best_size:
                best_size, best = len(pixels), pixels

    if best is None:
        return frame

    out = np.zeros_like(a)
    ys = [p[0] for p in best]
    xs = [p[1] for p in best]
    out[ys, xs] = a[ys, xs]
    return Image.fromarray(out)


def split_equal(alpha, expected):
    """Divide into `expected` equal columns, phase-aligned to the gaps.

    Use when the generator laid frames out on a regular pitch but they touch, so
    neither gap detection nor valley splitting can find the boundaries. Valley
    splitting in particular goes wrong when some frames are much narrower than
    others — a tight idle pose beside a wide stride — because it assumes the
    least-inky column near each nominal boundary is a gap.

    A fixed grid starting at zero usually lands at least one cut through a
    figure. The pitch is right but the phase is not, so the whole grid is slid
    across one pitch and the offset whose cut columns carry the least ink wins.
    """
    cols = (alpha > 16).sum(axis=0)
    w = alpha.shape[1]
    step = w / expected

    best_offset, best_ink = 0, None
    for off in range(int(step)):
        cuts = [int(off + i * step) for i in range(1, expected)]
        bounds = [0] + [c for c in cuts if 0 < c < w] + [w]
        if len(bounds) != expected + 1:
            continue
        # Reject any phase that leaves a cell with no artwork in it — that means
        # a boundary landed past the last figure rather than between figures.
        if any(cols[bounds[i]:bounds[i + 1]].sum() == 0 for i in range(expected)):
            continue
        ink = sum(int(cols[c]) for c in cuts if 0 <= c < w)
        if best_ink is None or ink < best_ink:
            best_ink, best_offset = ink, off

    bounds = [max(0, int(best_offset + i * step)) for i in range(expected)]
    bounds.append(w)
    # The first cell absorbs anything left of the phase offset.
    bounds[0] = 0
    return [(bounds[i], bounds[i + 1]) for i in range(expected)]


def repack(src, dst, frames, pad=8, split="auto", largest=False):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im)[:, :, 3]

    if split == "equal":
        clusters = split_equal(a, frames)
    else:
        clusters = find_clusters(a, frames)
        if len(clusters) != frames:
            print(f"  gap detection found {len(clusters)} clusters, expected {frames}"
                  f" - frames touch, falling back to valley splitting")
            clusters = split_by_valleys(a, frames)

    if largest:
        # Clean before measuring, so stray slivers cannot inflate the boxes.
        cleaned = Image.new("RGBA", im.size, (0, 0, 0, 0))
        for x0, x1 in clusters:
            cleaned.paste(keep_largest_blob(im.crop((x0, 0, x1, im.height))), (x0, 0))
        im = cleaned
        a = np.asarray(im)[:, :, 3]

    boxes = []
    for x0, x1 in clusters:
        sub = a[:, x0:x1]
        ys = np.where((sub > 16).any(axis=1))[0]
        xs = np.where((sub > 16).any(axis=0))[0]
        if len(xs) == 0 or len(ys) == 0:
            raise SystemExit(
                f"cell {x0}-{x1} is empty — the split put a boundary in the wrong "
                f"place. Try a different --frames count, or drop --equal.")
        boxes.append((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))

    widths = [b[2] - b[0] for b in boxes]
    heights = [b[3] - b[1] for b in boxes]
    cell_w = max(widths) + pad * 2
    cell_h = max(heights) + pad * 2

    out = Image.new("RGBA", (cell_w * frames, cell_h), (0, 0, 0, 0))
    for i, b in enumerate(boxes):
        frame = im.crop(b)
        # Centre horizontally, sit on a common baseline `pad` above the bottom.
        ox = i * cell_w + (cell_w - frame.width) // 2
        oy = cell_h - pad - frame.height
        out.paste(frame, (ox, oy), frame)

    out.save(dst, "PNG")

    print(f"{src} -> {dst}")
    print(f"  detected frame widths : {widths}")
    print(f"  detected frame heights: {heights}")
    print(f"  cell {cell_w}x{cell_h}, sheet {out.width}x{out.height}")
    print(f"  content box per frame : left={pad + (cell_w - 2*pad - max(widths))//2}, "
          f"baseline={cell_h - pad}")
    return out


if __name__ == "__main__":
    argv = sys.argv[1:]
    def take(flag, default):
        if flag in argv:
            i = argv.index(flag)
            v = int(argv[i + 1]); del argv[i:i + 2]; return v
        return default
    n = take("--frames", 4)
    pad = take("--pad", 8)
    split = "equal" if "--equal" in argv else "auto"
    largest = "--largest" in argv
    argv = [a for a in argv if a not in ("--equal", "--largest")]
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__); sys.exit(1)
    repack(args[0], args[1], n, pad, split, largest)
