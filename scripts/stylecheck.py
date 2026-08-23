"""Compare an asset's look against the world's style reference.

Assets are generated one at a time, so drift is the default failure mode: a prop
comes back a little brighter, a little greener, a little less hazy, and the
scene stops reading as one place. Judging that by eye across twenty assets does
not work — small differences are invisible alone and obvious once composited.

Only opaque pixels are measured, so a cut-out prop is judged on its artwork
rather than on the empty space around it.

Usage:
    python scripts/stylecheck.py reference.png asset.png [asset2.png ...]
"""
import sys
import numpy as np
from PIL import Image


def measure(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(float)
    rgb, alpha = a[:, :, :3], a[:, :, 3]

    mask = alpha > 128
    if mask.sum() < 64:
        return None
    px = rgb[mask]

    lum = px[:, 0] * .2126 + px[:, 1] * .7152 + px[:, 2] * .0722
    mx, mn = px.max(axis=1), px.min(axis=1)
    sat = (mx - mn) / np.maximum(mx, 1)

    dark = px[lum < np.percentile(lum, 25)]
    bright = px[lum > np.percentile(lum, 90)]

    return {
        "lum": lum.mean(),
        "sat": sat.mean(),
        "shadow_rb": dark[:, 0].mean() - dark[:, 2].mean(),
        "shadow_gb": dark[:, 1].mean() - dark[:, 2].mean(),
        "hi_rb": bright[:, 0].mean() - bright[:, 2].mean(),
        "mean_rgb": px.mean(axis=0),
        "coverage": 100 * mask.mean(),
    }


def report(ref_path, paths):
    ref = measure(ref_path)
    if ref is None:
        print(f"reference {ref_path} has no opaque pixels")
        return

    print(f"\nreference: {ref_path}")
    print(f"  lum {ref['lum']:.0f}  sat {ref['sat']:.2f}  "
          f"shadow R-B {ref['shadow_rb']:+.0f}  G-B {ref['shadow_gb']:+.0f}\n")

    hdr = f"{'asset':<28}{'lum':>8}{'sat':>8}{'shadowR-B':>12}{'shadowG-B':>12}   verdict"
    print(hdr)
    print("-" * len(hdr))

    for p in paths:
        m = measure(p)
        if m is None:
            print(f"{p.split('/')[-1]:<28}  (no opaque pixels)")
            continue

        d_lum = m["lum"] - ref["lum"]
        d_sat = m["sat"] - ref["sat"]
        d_rb = m["shadow_rb"] - ref["shadow_rb"]
        d_gb = m["shadow_gb"] - ref["shadow_gb"]

        # Thresholds chosen so a difference that shows once composited is flagged.
        issues = []
        if abs(d_lum) > 22: issues.append("too bright" if d_lum > 0 else "too dark")
        if abs(d_sat) > 0.13: issues.append("oversaturated" if d_sat > 0 else "washed out")
        if abs(d_rb) > 22 or abs(d_gb) > 22: issues.append("shadow hue off")

        verdict = "ok" if not issues else ", ".join(issues)
        name = p.replace("\\", "/").split("/")[-1]
        print(f"{name:<28}{m['lum']:>8.0f}{m['sat']:>8.2f}"
              f"{m['shadow_rb']:>+12.0f}{m['shadow_gb']:>+12.0f}   {verdict}")

    print()


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    report(args[0], args[1:])
