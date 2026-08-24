"""Lays every asset out on one sheet, at the size the world actually draws it.

    python scripts/contact_sheet.py                     everything
    python scripts/contact_sheet.py --scene roof        one scene
    python scripts/contact_sheet.py --out tmp/x.png

Assets are made one at a time and looked at one at a time, which is why drift
survives: a prop that is a little soft, or a little brighter, or built out of
pixels twice the size of its neighbour's, looks fine on its own. The whole point
of a contact sheet is to defeat that — twenty of them side by side and the odd
one out is instantly obvious.

Crucially each prop is drawn at its DRAWN size, not its file size. A file that
is 92x61 and drawn 16px tall is a file whose detail the visitor never sees, and
showing it at 92x61 here would hide exactly the problem worth seeing.

Nearest-neighbour throughout, on a background the colour of the world's own
night, with names under each cell.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from manifest_read import props_with_draw_size          # noqa: E402

BG = (26, 20, 46)
GRID = (44, 34, 70)
TEXT = (150, 140, 175)
WARN = (230, 120, 100)

PAD = 10
LABEL = 12
COLUMNS = 12


def build(entries, out_path, cell_scale=1.0):
    """One cell per prop, sized by what the world draws."""
    cells = []

    for e in entries:
        try:
            with Image.open(e["file"]) as im:
                art = im.convert("RGBA")
        except OSError:
            continue

        h = max(8, int(round(e["buffer_h"] * cell_scale)))
        w = max(8, int(round(h * art.width / art.height)))
        cells.append((e, art.resize((w, h), Image.NEAREST)))

    if not cells:
        print("nothing to draw", file=sys.stderr)
        return None

    # Rows are packed to a fixed column count; the row's height is its tallest
    # cell, so a mast does not force every thumbnail to its own height.
    rows = [cells[i:i + COLUMNS] for i in range(0, len(cells), COLUMNS)]

    col_w = max(c.width for _, c in cells) + PAD * 2
    row_hs = [max(c.height for _, c in r) + PAD * 2 + LABEL for r in rows]

    sheet = Image.new("RGB", (col_w * COLUMNS, sum(row_hs)), BG)
    draw = ImageDraw.Draw(sheet)

    y = 0
    for row, row_h in zip(rows, row_hs):
        for i, (e, art) in enumerate(row):
            x = i * col_w
            draw.rectangle([x, y, x + col_w - 1, y + row_h - 1], outline=GRID)

            # Bottom-aligned: props stand on a floor, and centring them
            # vertically makes a set of standing objects look like a set of
            # floating ones.
            ax = x + (col_w - art.width) // 2
            ay = y + row_h - LABEL - PAD - art.height
            sheet.paste(art, (ax, ay), art)

            colour = WARN if e["ratio"] > 4 or e["ratio"] < 1.4 else TEXT
            label = f"{e['id'][:16]} {e['ratio']:.1f}x"
            draw.text((x + 4, y + row_h - LABEL), label, fill=colour)
        y += row_h

    sheet.save(out_path)
    return sheet


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--scene")
    parser.add_argument("--kinds", default="prop,critter,sky",
                        help="which kinds to include; backdrops are excluded by "
                             "default because one is 1798px wide and sets the "
                             "column width for the whole sheet")
    parser.add_argument("--out", default="tmp/contact_sheet.png")
    parser.add_argument("--scale", type=float, default=1.0,
                        help="magnify every cell equally, to see detail")
    parser.add_argument("--unique", action="store_true",
                        help="one cell per FILE rather than per prop")
    args = parser.parse_args(argv)

    kinds = set(args.kinds.split(","))
    entries = [e for e in props_with_draw_size(scene=args.scene)
               if e.get("kind", "prop") in kinds]

    if args.unique:
        seen = {}
        for e in entries:
            # Keep the largest use of each file, since that is the one whose
            # resolution has to be right.
            if e["file"] not in seen or e["buffer_h"] > seen[e["file"]]["buffer_h"]:
                seen[e["file"]] = e
        entries = sorted(seen.values(), key=lambda e: e["id"])

    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)

    sheet = build(entries, out, args.scale)
    if sheet is None:
        return 1

    print(f"{len(entries)} cells -> {out.relative_to(ROOT)}  ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
