"""Grade an asset to match the world's style reference.

Assets are generated in separate batches, so each arrives with its own exposure
and colour balance. Individually they all look fine; composited they betray
themselves — one crate is lit for daylight, one chair is silver in a scene where
nothing is. Judging that by eye across forty props does not work, and asking the
generator to try again is slow and unreliable.

This measures the asset against the reference and applies the correction needed
to bring luminance, saturation and shadow hue into line, the way a colorist
matches shots rather than reshooting them. Corrections are clamped: the point is
to remove drift, not to flatten every prop into the same grey.

Only opaque pixels are measured. Alpha is preserved exactly.

Usage:
    python scripts/match.py reference.png asset.png [asset2.png ...] [--strength 1.0] [--dry]
"""
import sys
import numpy as np
from PIL import Image

# Clamps. Beyond these the asset is wrong in a way grading should not paper over.
MAX_GAIN = 2.2
MIN_GAIN = 0.25
MAX_SAT = 2.0
MIN_SAT = 0.6


def stats(rgb):
    lum = rgb[:, 0] * .2126 + rgb[:, 1] * .7152 + rgb[:, 2] * .0722
    mx, mn = rgb.max(axis=1), rgb.min(axis=1)
    sat = ((mx - mn) / np.maximum(mx, 1)).mean()
    dark = rgb[lum < np.percentile(lum, 30)]
    return {
        'lum': lum.mean(),
        'sat': sat,
        'rb': dark[:, 0].mean() - dark[:, 2].mean(),
        'gb': dark[:, 1].mean() - dark[:, 2].mean(),
    }


def opaque(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    mask = a[:, :, 3] > 128
    return a, mask, a[:, :, :3][mask]


def match(ref_path, path, strength=1.0, dry=False):
    _, _, ref_px = opaque(ref_path)
    a, mask, px = opaque(path)
    if px.shape[0] < 64:
        print(f'{path}: too few opaque pixels, skipped')
        return

    r, s = stats(ref_px), stats(px)

    gain = np.clip(r['lum'] / max(s['lum'], 1e-6), MIN_GAIN, MAX_GAIN)
    satk = np.clip(r['sat'] / max(s['sat'], 1e-6), MIN_SAT, MAX_SAT)

    # Ease each correction by `strength`, so a partial match is possible.
    gain = 1 + (gain - 1) * strength
    satk = 1 + (satk - 1) * strength

    out = a[:, :, :3].copy()
    out *= gain

    # Saturation about each pixel's own luminance, so hue is preserved.
    grey = (out[:, :, 0] * .2126 + out[:, :, 1] * .7152 + out[:, :, 2] * .0722)[..., None]
    out = grey + (out - grey) * satk

    # Shadow tint: push the darker half toward the reference's shadow hue. Applied
    # with a luminance-weighted mask so highlights keep their own colour — a lamp
    # should stay warm even in a scene with cold shadows.
    lum = (out[:, :, 0] * .2126 + out[:, :, 1] * .7152 + out[:, :, 2] * .0722)
    shadow_w = np.clip(1 - lum / max(np.percentile(lum, 70), 1e-6), 0, 1)[..., None]

    d_rb = (r['rb'] - s['rb']) * strength
    d_gb = (r['gb'] - s['gb']) * strength
    out[:, :, 0] += shadow_w[:, :, 0] * d_rb * 0.5
    out[:, :, 1] += shadow_w[:, :, 0] * d_gb * 0.5
    out[:, :, 2] -= shadow_w[:, :, 0] * (d_rb + d_gb) * 0.25

    out = np.clip(out, 0, 255)

    after = stats(out[mask])
    print(f'{path.split("/")[-1].split(chr(92))[-1]:<22} '
          f'lum {s["lum"]:5.0f}->{after["lum"]:5.0f}   '
          f'sat {s["sat"]:.2f}->{after["sat"]:.2f}   '
          f'gain {gain:.2f} sat_k {satk:.2f}')

    if dry:
        return

    result = a.copy()
    result[:, :, :3] = out
    # Untouched pixels stay untouched, alpha included.
    result[~mask] = a[~mask]
    Image.fromarray(result.astype(np.uint8)).save(path)


if __name__ == '__main__':
    argv = sys.argv[1:]
    strength = 1.0
    if '--strength' in argv:
        i = argv.index('--strength')
        strength = float(argv[i + 1])
        del argv[i:i + 2]
    dry = '--dry' in argv
    argv = [x for x in argv if not x.startswith('--')]
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)
    for p in argv[1:]:
        match(argv[0], p, strength, dry)
