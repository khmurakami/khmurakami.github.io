"""Compare an asset's look against the world's style reference.

Assets are generated one at a time, so drift is the default failure mode: a prop
comes back a little brighter, a little greener, a little less hazy, and the
scene stops reading as one place. Judging that by eye across twenty assets does
not work — small differences are invisible alone and obvious once composited.

Only opaque pixels are measured, so a cut-out prop is judged on its artwork
rather than on the empty space around it.

SATURATION IS JUDGED AGAINST THE PROPS, NOT THE PLATE
-----------------------------------------------------
Luminance and shadow hue are compared to the master, which is the right
reference for both: a prop should sit at the plate's exposure and carry its
violet shadows.

Saturation is not. The plate is 91% deep shadow and measures 0.82, and a single
object made of galvanised steel and weathered wood does not reach that
honestly — measured across the hundred unlit props in this world, the median is
0.70 and only TEN of them are at 0.82 or above, including plenty that look
perfectly right. Judging every prop against the plate reported ninety failures,
which is a tool crying wolf, and a tool that cries wolf gets ignored.

So saturation is compared to the median of the props actually being measured.
That is a real, achieved value, and matching it means matching what a prop will
be standing next to — which is the thing that decides whether a scene reads as
one place.

LIGHT SOURCES ARE EXEMPT
------------------------
The reference is a night plate at luminance 29. Measured against it, the moon
scores 198, the neon sign 67 and the vending machine 63, and all three were
reported as "too bright" — which is true, and is the entire point of them.

Grading those down would have taken the light out of a night scene to make it
match a night scene. So the manifest decides: a prop that declares a `light` is
a light source, is expected to be brighter than the plate, and is measured but
not judged. Twelve of the twenty-one worst offenders turned out to be lamps.

Usage:
    python scripts/stylecheck.py reference.png asset.png [asset2.png ...]
    python scripts/stylecheck.py --world          every asset, from the manifests
"""
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def lit_props():
    """File names of every prop the manifest says emits light.

    A cycling animation counts too: `neon_sign` runs its own colour ramp along
    its length, which is the same claim about brightness made a different way.
    """
    try:
        from manifest_read import props_with_draw_size   # noqa: F401
    except ImportError:
        return set()

    import json
    import subprocess

    script = """
    import { scenes } from './js/config/scenes.js';
    const lit = [];
    for (const { manifest } of scenes) {
        for (const p of manifest.props) {
            if (!p.src) continue;
            if (p.light || (p.anim && p.anim.type === 'cycle')) lit.push(p.src);
        }
        for (const s of Object.values(manifest.skySprites || {})) lit.push(s);
    }
    process.stdout.write(JSON.stringify(lit));
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    node = "node.exe" if sys.platform == "win32" else "node"
    try:
        out = subprocess.run([node, "--input-type=module", "-e", script],
                             cwd=root, capture_output=True, text=True,
                             encoding="utf-8", check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return set()

    return {os.path.basename(p) for p in json.loads(out)}


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
    lit = lit_props()
    ref = measure(ref_path)
    if ref is None:
        print(f"reference {ref_path} has no opaque pixels")
        return

    # Measured once, up front, so the saturation reference can come from the
    # set itself. Everything below reads from this rather than re-opening.
    measured = [(p, measure(p)) for p in paths]

    unlit = [m["sat"] for p, m in measured
             if m and os.path.basename(p.replace("\\", "/")) not in lit]

    # With only a file or two on the command line there is no population to
    # take a median of, so the plate stands in.
    sat_ref = float(np.median(unlit)) if len(unlit) >= 8 else ref["sat"]
    sat_source = ("the props themselves" if len(unlit) >= 8
                  else "the plate (too few assets for a median)")

    print(f"\nreference: {ref_path}")
    print(f"  lum {ref['lum']:.0f}  shadow R-B {ref['shadow_rb']:+.0f}  "
          f"G-B {ref['shadow_gb']:+.0f}")
    print(f"  sat {sat_ref:.2f}  from {sat_source}\n")

    hdr = f"{'asset':<28}{'lum':>8}{'sat':>8}{'shadowR-B':>12}{'shadowG-B':>12}   verdict"
    print(hdr)
    print("-" * len(hdr))

    for p, m in measured:
        if m is None:
            print(f"{p.split('/')[-1]:<28}  (no opaque pixels)")
            continue

        d_lum = m["lum"] - ref["lum"]
        d_sat = m["sat"] - sat_ref
        d_rb = m["shadow_rb"] - ref["shadow_rb"]
        d_gb = m["shadow_gb"] - ref["shadow_gb"]

        # Thresholds chosen so a difference that shows once composited is flagged.
        issues = []
        if abs(d_lum) > 22: issues.append("too bright" if d_lum > 0 else "too dark")
        # Saturation is (max - min) / max, which is unstable when max is small:
        # at luminance 7 a difference of two values reads as 0.9. The `fore_*`
        # silhouettes are deliberately near-black framing elements and were all
        # reported as oversaturated on that basis alone. Below this luminance
        # the figure does not carry enough information to judge.
        if m["lum"] >= 15 and abs(d_sat) > 0.13:
            issues.append("oversaturated" if d_sat > 0 else "washed out")
        if abs(d_rb) > 22 or abs(d_gb) > 22: issues.append("shadow hue off")

        name = p.replace("\\", "/").split("/")[-1]

        # A declared light source is measured and reported, never judged.
        if name in lit:
            verdict = "lamp" if not issues else f"lamp ({', '.join(issues)})"
            issues = []
        else:
            verdict = "ok" if not issues else ", ".join(issues)
        print(f"{name:<28}{m['lum']:>8.0f}{m['sat']:>8.2f}"
              f"{m['shadow_rb']:>+12.0f}{m['shadow_gb']:>+12.0f}   {verdict}")

    print()


if __name__ == "__main__":
    args = sys.argv[1:]

    if args and args[0] == "--world":
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        from manifest_read import props_with_draw_size, by_file
        files = sorted(os.path.join(root, f)
                       for f in by_file(props_with_draw_size()))
        report(os.path.join(root, "assets/city/master_rooftop.png"), files)
        sys.exit(0)

    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    report(args[0], args[1:])
