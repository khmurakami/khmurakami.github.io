"""Three-way colour grade for the world layers.

The generated art comes back cleaner and more golden than the target reference,
which is a moodier magenta/violet painting with orange only as an accent.
Regenerating to chase a colour palette is slow and unreliable; grading is
instant, reversible, and identical across every layer, which matters more than
any single layer's exactness — a scene reads as one place when everything shares
one grade.

Pixels are split by luminance into shadows / midtones / highlights with smooth
overlapping weights, and each range is pushed toward its own tint. Alpha is
preserved untouched so cut-out layers stay cut out.

Usage:
    python scripts/grade.py in.png out.png [--preset dusk] [--strength 1.0]
"""
import sys
import numpy as np
from PIL import Image

PRESETS = {
    # Magenta/violet shadows, rose midtones, warm gold highlights — the target
    # reference's signature. `lift` raises the floor so shadows glow rather than
    # crush to black, which is what makes the haze read.
    "dusk": {
        "shadow_tint":    (0.62, 0.42, 0.95),
        "mid_tint":       (1.06, 0.72, 0.92),
        "highlight_tint": (1.12, 0.90, 0.72),
        "lift":           (0.045, 0.015, 0.070),
        "saturation":     1.18,
        "contrast":       1.08,
        "exposure":       0.94,
    },
}


def grade(src, dst, preset="dusk", strength=1.0):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = a[:, :, :3], a[:, :, 3:]

    p = PRESETS[preset]

    # Perceptual luminance, used to decide which range each pixel belongs to.
    lum = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722

    # Smooth, overlapping weights so the ranges blend instead of banding.
    w_shadow = np.clip(1.0 - lum * 2.0, 0, 1)[..., None]
    w_high = np.clip((lum - 0.5) * 2.0, 0, 1)[..., None]
    w_mid = np.clip(1.0 - w_shadow - w_high, 0, 1)

    tint = (w_shadow * np.array(p["shadow_tint"], np.float32)
            + w_mid * np.array(p["mid_tint"], np.float32)
            + w_high * np.array(p["highlight_tint"], np.float32))

    out = rgb * tint
    out = out + np.array(p["lift"], np.float32) * w_shadow
    out = out * p["exposure"]
    out = (out - 0.5) * p["contrast"] + 0.5

    grey = (out[:, :, 0] * 0.2126 + out[:, :, 1] * 0.7152 + out[:, :, 2] * 0.0722)[..., None]
    out = grey + (out - grey) * p["saturation"]

    # `strength` blends back toward the original, so the grade can be dialled in.
    out = rgb + (out - rgb) * strength
    out = np.clip(out, 0, 1)

    result = np.concatenate([out, alpha], axis=2)
    Image.fromarray((result * 255).astype(np.uint8)).save(dst)
    print(f"{src} -> {dst}  [{preset} @ {strength:g}]")


if __name__ == "__main__":
    argv = sys.argv[1:]
    preset = "dusk"
    strength = 1.0
    if "--preset" in argv:
        i = argv.index("--preset"); preset = argv[i + 1]; del argv[i:i + 2]
    if "--strength" in argv:
        i = argv.index("--strength"); strength = float(argv[i + 1]); del argv[i:i + 2]
    args = [x for x in argv if not x.startswith("--")]
    if len(args) != 2:
        print(__doc__); sys.exit(1)
    grade(args[0], args[1], preset, strength)
