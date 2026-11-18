"""Report sheets: measurements as pictures, for judging by eye.

When a render is checked, both sides are drawn as tone maps in the target's
palette, so the same colour means the same tone on both.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

BG = (12, 14, 30)
INK = (225, 234, 255)
DIM = (160, 172, 210)
OK = (120, 220, 150)
OFF = (255, 150, 120)


def _font(size):
    for name in ('segoeui.ttf', 'DejaVuSans.ttf', 'Arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def tone_image(ctx, outside=(20, 28, 64)):
    out = np.zeros(ctx.tones.shape + (3,), np.uint8) + np.array(outside, np.uint8)
    for i, c in enumerate(ctx.palette):
        out[ctx.tones == i] = np.clip(np.round(c), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def _fit(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.NEAREST)


def measurement_sheet(ctx, values, title):
    """The image, its tone map, and whatever metric values were measured."""
    h = 420
    a = _fit(Image.fromarray(ctx.img.astype(np.uint8)), h)
    b = _fit(tone_image(ctx), h)
    pw = 400
    sheet = Image.new('RGB', (a.width + b.width + pw + 40, h + 70), BG)
    sheet.paste(a, (10, 50))
    sheet.paste(b, (a.width + 20, 50))
    d = ImageDraw.Draw(sheet)
    f, s = _font(20), _font(15)
    d.text((10, 14), title, fill=INK, font=f)
    d.text((a.width + 20, 14), 'tones', fill=INK, font=f)
    x, y = a.width + b.width + 30, 50
    shares = values.get('tone_shares')
    for i, c in enumerate(ctx.palette):
        col = tuple(int(round(v)) for v in c)
        d.rectangle([x, y, x + 30, y + 26], fill=col)
        if shares:
            d.rectangle([x + 40, y + 6, x + 40 + int(shares[i] * 240), y + 20], fill=col)
            d.text((x + 48 + int(shares[i] * 240), y + 4), f'{round(shares[i] * 100)}%', fill=DIM, font=s)
        y += 34
    hist = values.get('brightness')
    if hist:
        top = max(hist) or 1
        for i, v in enumerate(hist):
            bh = int(v / top * 90)
            d.rectangle([x + i * 10, y + 100 - bh, x + i * 10 + 8, y + 100], fill=(150, 175, 240))
        y += 112
    for k, v in values.items():
        if isinstance(v, (int, float)):
            d.text((x, y), f'{k}: {v}', fill=DIM, font=s)
            y += 20
    return sheet


def contact_sheet(items, title='', tile_w=600):
    """items: (image path, label, rows or None). Two columns, each tile
    captioned with its label, its score and whatever is out of tolerance."""
    tiles = []
    for path, label, rows in items:
        im = Image.open(path).convert('RGB')
        im = im.resize((tile_w, round(im.height * tile_w / im.width)), Image.LANCZOS)
        tiles.append((im, label, rows))
    cols = 2 if len(tiles) > 1 else 1
    th = max(t[0].height for t in tiles)
    cap = 86
    grid_rows = (len(tiles) + cols - 1) // cols
    top = 50 if title else 10
    sheet = Image.new('RGB', (cols * tile_w + (cols + 1) * 10, top + grid_rows * (th + cap + 10)), BG)
    d = ImageDraw.Draw(sheet)
    f, s = _font(20), _font(14)
    if title:
        d.text((10, 12), title, fill=INK, font=f)
    for i, (im, label, rows) in enumerate(tiles):
        x = 10 + (i % cols) * (tile_w + 10)
        y = top + (i // cols) * (th + cap + 10)
        sheet.paste(im, (x, y))
        d.text((x, y + th + 6), label, fill=INK, font=f)
        if rows:
            counted = [r for r in rows if not r.get('skipped')]
            passed = sum(r['ok'] for r in counted)
            d.text((x + tile_w - 170, y + th + 10), f'{passed}/{len(counted)} within tolerance',
                   fill=OK if passed == len(counted) else OFF, font=s)
            off = [r for r in counted if not r['ok']]
            lines = [f"{r['metric']}: {r['actual']} (target {r['target']})" for r in off] or ['all within tolerance']
            for j, line in enumerate(lines[:2]):
                # Keep each caption inside its own tile.
                while d.textlength(line, font=s) > tile_w - 10 and len(line) > 4:
                    line = line[:-2]
                d.text((x, y + th + 34 + j * 20), line, fill=DIM, font=s)
            if len(lines) > 2:
                d.text((x + tile_w - 80, y + th + 54), f'+{len(lines) - 2} more', fill=DIM, font=s)
    return sheet


def grid_sheet(cells, cols, title='', tile_w=400):
    """cells: (image path, caption), laid out left to right in `cols` columns.
    For sweeps: every combination of a few settings, side by side."""
    tiles = []
    for path, caption in cells:
        im = Image.open(path).convert('RGB')
        tiles.append((im.resize((tile_w, round(im.height * tile_w / im.width)), Image.LANCZOS), caption))
    cols = max(1, min(cols, len(tiles)))
    th = max(t.height for t, _ in tiles)
    cap = 30
    rows = (len(tiles) + cols - 1) // cols
    top = 46 if title else 8
    sheet = Image.new('RGB', (cols * tile_w + (cols + 1) * 8, top + rows * (th + cap + 8)), BG)
    d = ImageDraw.Draw(sheet)
    f, s = _font(20), _font(14)
    if title:
        d.text((8, 12), title, fill=INK, font=f)
    for i, (im, caption) in enumerate(tiles):
        x = 8 + (i % cols) * (tile_w + 8)
        y = top + (i // cols) * (th + cap + 8)
        sheet.paste(im, (x, y))
        while d.textlength(caption, font=s) > tile_w - 4 and len(caption) > 4:
            caption = caption[:-2]
        d.text((x, y + th + 6), caption, fill=DIM, font=s)
    return sheet


def animation(paths, out, fps=12, width=None):
    """Frames to an animated .gif or .webp, looping: for turntables."""
    frames = []
    for p in paths:
        im = Image.open(p).convert('RGB')
        if width and im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        frames.append(im)
    if not frames:
        raise ValueError('no frames')
    ms = round(1000 / fps)
    if out.lower().endswith('.gif'):
        frames = [f.quantize(colors=256, method=Image.Quantize.MEDIANCUT) for f in frames]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=ms, loop=0)
    return out


def check_sheet(ref_ctx, ctx, rows, title):
    """Reference and render, both in the target's tones, with the scorecard."""
    h = 380
    tiles = []
    if ref_ctx is not None:
        tiles += [('reference', _fit(Image.fromarray(ref_ctx.img.astype(np.uint8)), h)), ('reference tones', _fit(tone_image(ref_ctx), h))]
    tiles += [('render', _fit(Image.fromarray(ctx.img.astype(np.uint8)), h)), ('render tones', _fit(tone_image(ctx), h))]
    width = sum(t.width for _, t in tiles) + 10 * (len(tiles) + 1)
    sheet = Image.new('RGB', (max(width, 900), h + 120 + len(rows) * 24), BG)
    d = ImageDraw.Draw(sheet)
    f, s = _font(20), _font(15)
    d.text((10, 10), title, fill=INK, font=f)
    x = 10
    for name, t in tiles:
        sheet.paste(t, (x, 70))
        d.text((x, 44), name, fill=DIM, font=s)
        x += t.width + 10
    y = h + 90
    for r in rows:
        if r.get('skipped'):
            d.text((70, y), r['metric'], fill=DIM, font=s)
            y += 24
            continue
        off = f"{r['off']:+.0%}" if r.get('relative') else f"{r['off']:+}"
        d.text((10, y), 'ok' if r['ok'] else 'off', fill=OK if r['ok'] else OFF, font=s)
        d.text((70, y), r['metric'], fill=INK, font=s)
        d.text((360, y), f"target {r['target']}   actual {r['actual']}   off {off}   tol {r['tolerance']}", fill=DIM, font=s)
        y += 24
    counted = [r for r in rows if not r.get('skipped')]
    passed = sum(r['ok'] for r in counted)
    d.text((10, y + 6), f'{passed}/{len(counted)} within tolerance', fill=OK if passed == len(counted) else OFF, font=f)
    return sheet
