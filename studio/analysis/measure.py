"""Primitives for measuring a painted cloud: loading, colour, segmentation,
tones and shape. The metrics built from them live in metrics.py.

Shape measures are independent of the image's size, so a render and a
reference can be compared directly. All images are resampled so their longest
side is ANALYSIS_SIZE before being measured.
"""
from dataclasses import dataclass, field
import numpy as np
from PIL import Image

ANALYSIS_SIZE = 700


@dataclass
class SkyRule:
    """What counts as sky: saturated blue, connected to the edge of the frame.

    Sky-coloured pixels enclosed by cloud are not sky: painters use the sky's
    own blue for a cloud's deepest shadow, so colour alone cannot separate
    them. Connection to the frame can.
    """
    mode: str = 'blue'             # 'blue': saturated blue sky. 'border': learn the sky from the frame's edges
    tolerance: float = 14          # 'border' mode: how far (CIE76) a pixel may be from its row's sky colour
    min_blue: float = 150
    min_blue_minus_red: float = 95
    max_red: float = 95
    exclude_warm: bool = True      # wood, poles, anything redder than it is blue
    min_cloud_luminance: float = 100   # window frames, wires, furniture: darker than any cloud shadow


# ── Loading ──────────────────────────────────────────────────────────────

def load(path, box=None, size=ANALYSIS_SIZE):
    """RGB float32 array of the image (optionally cropped to box=(x0,y0,x1,y1)),
    resampled so its longest side is `size`."""
    im = Image.open(path).convert('RGB')
    if box:
        im = im.crop(tuple(int(v) for v in box))
    scale = size / max(im.size)
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.BOX)
    return np.asarray(im).astype(np.float32)


# ── Colour ───────────────────────────────────────────────────────────────

def srgb_to_lab(rgb):
    """sRGB (0..255) to CIE Lab (D65)."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = (c @ m.T) / np.array([0.95047, 1.0, 1.08883])
    d = 6 / 29
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def delta_e(a, b):
    """CIE76 colour difference between two sRGB colours (or arrays of them)."""
    return np.linalg.norm(srgb_to_lab(a) - srgb_to_lab(b), axis=-1)


def luminance(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


# ── Segmentation ─────────────────────────────────────────────────────────

def _grow(seed, allowed):
    """Pixels of `allowed` connected (4-way) to `seed`."""
    region = seed & allowed
    while True:
        grown = region.copy()
        grown[1:, :] |= region[:-1, :]
        grown[:-1, :] |= region[1:, :]
        grown[:, 1:] |= region[:, :-1]
        grown[:, :-1] |= region[:, 1:]
        grown &= allowed
        if np.array_equal(grown, region):
            return region
        region = grown


def _row_sky(img, window=12):
    """The sky's colour on each row, read from the left and right edges of the
    frame (skies are vertical gradients), smoothed over nearby rows."""
    h = img.shape[0]
    edges = np.concatenate([img[:, :3], img[:, -3:]], axis=1)
    out = np.empty((h, 3))
    for y in range(h):
        out[y] = np.median(edges[max(0, y - window):y + window + 1].reshape(-1, 3), axis=0)
    return out


def sky_rule(spec):
    """A SkyRule from a name ('blue', 'border') or a dict of its fields."""
    if spec is None or isinstance(spec, SkyRule):
        return spec
    if isinstance(spec, str):
        return SkyRule(mode=spec)
    return SkyRule(**spec)


def load_mask(path, box=None, size=ANALYSIS_SIZE):
    """A silhouette mask (white = cloud) loaded and resampled like its image."""
    return load(path, box, size)[..., 0] >= 128


def segment(img, rule=None, mask=None):
    """(cloud, sky) boolean masks.

    With `mask` (a known silhouette, e.g. rendered by a study page) there is
    nothing to guess: sky is everything outside it. Otherwise the sky is found
    by `rule`.
    """
    if mask is not None:
        cloud = mask & (luminance(img) >= 0)
        return cloud, ~mask
    rule = rule or SkyRule()
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    if rule.mode == 'border':
        # Style-agnostic: the sky is whatever the frame's edges are, row by row.
        sky_lab = srgb_to_lab(_row_sky(img))
        skyish = np.linalg.norm(srgb_to_lab(img) - sky_lab[:, None, :], axis=-1) <= rule.tolerance
    else:
        skyish = (b >= rule.min_blue) & (b - r >= rule.min_blue_minus_red) & (r <= rule.max_red)
    border = np.zeros_like(skyish)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    sky = _grow(border, skyish)
    cloud = ~sky & (luminance(img) >= rule.min_cloud_luminance)
    if rule.mode == 'blue':
        cloud &= b > 110
    if rule.exclude_warm and rule.mode == 'blue':
        # Clearly warm things only (wood, rust): a cloud's whites can come out
        # a hair warmer than blue, and dropping those riddles it with holes.
        cloud &= ~((r - b > 25) & (r - g > 10))
    return cloud, sky


def _shift_all(mask, op):
    out = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        out = op(out, np.roll(np.roll(mask, dy, 0), dx, 1))
    return out


def open_mask(mask, radius=2):
    """Morphological opening: specks and hairlines smaller than `radius` go."""
    m = mask
    for _ in range(radius):
        m = _shift_all(m, np.logical_and)
    for _ in range(radius):
        m = _shift_all(m, np.logical_or)
    return m


def silhouette(sky):
    """A cloud's outer silhouette: everything that is not sky (its ink lines
    and shadows included), with specks opened away and holes filled."""
    return fill_holes(open_mask(~sky))


def tone_regions(tones, cloud):
    """Areas of the connected single-tone regions inside the cloud (4-way),
    largest first. Labels spread by repeated neighbour minimum until stable."""
    h, w = tones.shape
    big = h * w + 1
    labels = np.where(cloud, np.arange(h * w).reshape(h, w), big)
    while True:
        prev = labels
        best = labels.copy()
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            nb = np.roll(labels, step, axis)
            same = np.roll(tones, step, axis) == tones
            # Rolling wraps around the edge; neighbours across it do not count.
            if axis == 0:
                same[0 if step == 1 else -1, :] = False
            else:
                same[:, 0 if step == 1 else -1] = False
            best = np.where(same & cloud, np.minimum(best, nb), best)
        labels = best
        if np.array_equal(labels, prev):
            break
    ids = labels[cloud]
    _, counts = np.unique(ids, return_counts=True)
    return np.sort(counts)[::-1]


def fill_holes(mask):
    """The mask with every enclosed hole filled: its outer silhouette."""
    outside = np.zeros_like(mask)
    outside[0, :] = outside[-1, :] = True
    outside[:, 0] = outside[:, -1] = True
    return ~_grow(outside, ~mask)


# ── Tones ────────────────────────────────────────────────────────────────

def kmeans(pixels, k, iters=40, min_share=0.02):
    """k-means that will not spend a tone on a handful of stray pixels.

    After converging, a cluster covering less than `min_share` of the pixels
    is re-seeded by splitting the cluster with the widest spread along its
    main axis, and the whole thing runs again. Deterministic.

    Returns (centres as sRGB, labels), centres sorted dark to light.
    """
    lab = srgb_to_lab(pixels)
    seeds = None
    for _ in range(k + 1):
        centres, labels = _kmeans_lab(lab, k, iters, seeds)
        shares = np.bincount(labels, minlength=k) / len(labels)
        small = np.flatnonzero(shares < min_share)
        if not len(small):
            break
        spread = np.array([((lab[labels == j] - centres[j]) ** 2).sum() if shares[j] else 0 for j in range(k)])
        wide = int(np.argmax(spread))
        members = lab[labels == wide]
        axis = np.linalg.svd(members - members.mean(0), full_matrices=False)[2][0]
        sd = np.sqrt(((members - members.mean(0)) @ axis).var())
        seeds = centres.copy()
        seeds[wide] = members.mean(0) - axis * sd
        seeds[small[0]] = members.mean(0) + axis * sd
    rgb = np.stack([pixels[labels == j].mean(0) if (labels == j).any() else np.zeros(3) for j in range(k)])
    rank = np.argsort(centres[:, 0])
    remap = np.empty(k, dtype=np.int64)
    remap[rank] = np.arange(k)
    return rgb[rank], remap[labels]


def _kmeans_lab(lab, k, iters, seeds=None):
    """Plain k-means in Lab. Returns (centres in Lab, labels), unsorted.

    Without seeds, seeds are chosen one at a time as the colour farthest from
    those already chosen, starting from the darkest. (Seeding at brightness
    quantiles fails when one tone dominates: two seeds land on it and two real
    tones merge.)
    """
    if seeds is None:
        step = max(1, len(lab) // 6000)
        sample = lab[::step]
        picked = [sample[np.argmin(sample[:, 0])]]
        dist = ((sample - picked[0]) ** 2).sum(-1)
        for _ in range(1, k):
            picked.append(sample[np.argmax(dist)])
            dist = np.minimum(dist, ((sample - picked[-1]) ** 2).sum(-1))
        seeds = np.stack(picked)
    centres = np.array(seeds, dtype=np.float64)
    labels = np.full(len(lab), -1, dtype=np.int64)
    for _ in range(iters):
        d = ((lab[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
        new = d.argmin(1)
        for j in range(k):
            members = new == j
            if members.any():
                centres[j] = lab[members].mean(0)
        if np.array_equal(new, labels):
            break
        labels = new
    return centres, labels


def assign(pixels, palette_rgb):
    """Index of the nearest palette colour (Lab distance) for each pixel."""
    lab = srgb_to_lab(pixels)
    pal = srgb_to_lab(np.asarray(palette_rgb, dtype=np.float64))
    return ((lab[:, None, :] - pal[None, :, :]) ** 2).sum(-1).argmin(1)


def tone_map(img, cloud, palette_rgb):
    """Per-pixel tone index (-1 outside the cloud) against a given palette."""
    tones = np.full(cloud.shape, -1, dtype=np.int64)
    tones[cloud] = assign(img[cloud], palette_rgb)
    return tones


# ── Shape ────────────────────────────────────────────────────────────────

def edge_of(mask):
    """Pixels of the mask with a 4-neighbour outside it."""
    inner = mask.copy()
    inner[1:, :] &= mask[:-1, :]
    inner[:-1, :] &= mask[1:, :]
    inner[:, 1:] &= mask[:, :-1]
    inner[:, :-1] &= mask[:, 1:]
    return mask & ~inner


def outline_dimension(mask):
    """Box-counting dimension of the silhouette's edge, with boxes sized
    relative to the silhouette so the result does not depend on resolution.
    Holes are filled first: a hole inside a cloud is not part of its outline."""
    edge = edge_of(fill_holes(mask))
    ys, xs = np.nonzero(edge)
    if len(xs) < 16:
        return 1.0
    span = max(xs.max() - xs.min(), ys.max() - ys.min()) + 1
    sizes, counts = [], []
    for div in (4, 8, 16, 32, 64):
        s = max(1, int(round(span / div)))
        boxes = len(set(zip((xs // s).tolist(), (ys // s).tolist())))
        sizes.append(s)
        counts.append(boxes)
    sizes, counts = np.array(sizes, float), np.array(counts, float)
    if len(np.unique(sizes)) < 3:
        return 1.0
    return float(-np.polyfit(np.log(sizes), np.log(counts), 1)[0])


def perimeter_ratio(mask):
    """Perimeter squared over area of the outer silhouette (holes filled)."""
    mask = fill_holes(mask)
    area = mask.sum()
    return float(edge_of(mask).sum() ** 2 / area) if area else 0.0


def tone_boundary(tones, cloud):
    """Length of boundaries between different tones inside the cloud, per
    square root of the cloud's area."""
    inside = cloud.copy()
    inside[1:, :] &= cloud[:-1, :]
    inside[:, 1:] &= cloud[:, :-1]
    diff = np.zeros_like(cloud)
    diff[1:, :] |= tones[1:, :] != tones[:-1, :]
    diff[:, 1:] |= tones[:, 1:] != tones[:, :-1]
    area = cloud.sum()
    return float((diff & inside).sum() / np.sqrt(area)) if area else 0.0


def histogram(img, cloud, bins=32):
    lum = luminance(img[cloud])
    h, _ = np.histogram(lum, bins=bins, range=(0, 255))
    return (h / max(1, h.sum())).tolist()
