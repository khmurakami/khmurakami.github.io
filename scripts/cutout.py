"""Cut a generated sprite sheet out of its flat background.

Why not a global colour match (see remove_bg.py): sprites routinely contain
interior pixels that are close to the background colour — this character's
cream shoes sit within ~30 of white. Matching globally punches holes in them.

This fills only from the image border, so background is removed where it is
actually background, and identical colours inside the artwork survive.

Usage:
    python scripts/cutout.py in.png out.png [--tolerance 40] [--erode 1] [--pockets] [--no-snap]
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

SENTINEL = (1, 254, 1)  # a colour the artwork will not contain


def cutout(src, dst, tolerance=40, snap=True, erode=0, pockets=False, pocket_tolerance=20):
    img = Image.open(src).convert("RGB")
    w, h = img.size

    # Pad by one pixel so a single seed reaches background along every edge,
    # even where the artwork touches the frame.
    padded = Image.new("RGB", (w + 2, h + 2), img.getpixel((0, 0)))
    padded.paste(img, (1, 1))

    ImageDraw.floodfill(padded, (0, 0), SENTINEL, thresh=tolerance)

    filled = padded.crop((1, 1, w + 1, h + 1))
    rgb = img.load()
    mask = filled.load()

    out = Image.new("RGBA", (w, h))
    px = out.load()
    cleared = 0
    for y in range(h):
        for x in range(w):
            if mask[x, y] == SENTINEL:
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
            else:
                r, g, b = rgb[x, y]
                px[x, y] = (r, g, b, 255)

    if snap:
        # Pixel art wants a hard edge; no semi-transparent fringe.
        alpha = out.split()[3].point(lambda p: 255 if p > 127 else 0)
        out.putalpha(alpha)

    if pockets:
        # The border fill cannot reach background trapped inside the artwork —
        # gaps between overlapping leaves, for instance — which survive as
        # bright specks over the scene behind. Those pockets are the same flat
        # colour as the background, so clearing near-background pixels anywhere
        # removes them. Only safe for art that contains no such colour itself.
        # Deliberately much tighter than the border-fill tolerance. The fill can
        # afford slack because it stops at the first pixel outside range; this
        # test is global, so any slack eats specular highlights on the artwork.
        seed = img.getpixel((0, 0))
        px2 = out.load()
        for y in range(h):
            for x in range(w):
                if px2[x, y][3] == 0:
                    continue
                r, g, b = rgb[x, y]
                if abs(r - seed[0]) + abs(g - seed[1]) + abs(b - seed[2]) <= pocket_tolerance:
                    px2[x, y] = (0, 0, 0, 0)

    if erode:
        # Generated art has an anti-aliased rim where the subject met the
        # background. Those pixels survive the fill (they are too far from the
        # background colour) and read as a bright halo over a dark scene.
        # Shaving the outermost ring removes it; at sprite scale the lost pixel
        # is invisible.
        alpha = out.split()[3]
        for _ in range(erode):
            alpha = alpha.filter(ImageFilter.MinFilter(3))
        out.putalpha(alpha)

    out.save(dst, "PNG")
    print(f"{src} -> {dst}")
    print(f"  cleared {cleared/(w*h)*100:.1f}% of pixels to transparent")
    return out


if __name__ == "__main__":
    argv = sys.argv[1:]
    tol = 40
    if "--tolerance" in argv:
        i = argv.index("--tolerance")
        tol = int(argv[i + 1])
        del argv[i:i + 2]          # drop the flag AND its value
    pockets = "--pockets" in argv
    argv = [a for a in argv if a != "--pockets"]
    pocket_tol = 20
    if "--pocket-tolerance" in argv:
        i = argv.index("--pocket-tolerance")
        pocket_tol = int(argv[i + 1])
        del argv[i:i + 2]
    erode = 0
    if "--erode" in argv:
        i = argv.index("--erode")
        erode = int(argv[i + 1])
        del argv[i:i + 2]
    snap = "--no-snap" not in argv
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(1)
    cutout(args[0], args[1], tolerance=tol, snap=snap, erode=erode, pockets=pockets, pocket_tolerance=pocket_tol)
