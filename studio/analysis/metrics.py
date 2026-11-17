"""Metrics: the ways a cloud can be measured, as plug-ins.

Each metric is registered with `@metric(...)` and supplies two functions:

    measure(ctx)                   -> a JSON-able value for one image
    compare(ref, got, tolerance)   -> rows, one per thing it checks

Nothing else in the toolchain knows which metrics exist. A target lists the
metrics it uses and a tolerance for each, so changing how clouds are judged is
a matter of adding a metric here, or editing a target, never rewriting the
pipeline. To try a different idea of "close to the reference", write a new
metric and add its name to a target.

`Context` holds one image and computes the shared pieces lazily (the cloud
mask, its palette, its tone map) so metrics stay small.
"""
from dataclasses import dataclass
from functools import cached_property
import numpy as np

from . import measure as M


class Context:
    """One image under measurement.

    `palette` (optional) is the palette to read tones against: a target's
    palette when scoring a render, so the same tone means the same thing on
    both sides. Without it, the image's own palette is used.
    """

    def __init__(self, img, k=5, palette=None, rule=None, mask=None):
        self.img = img
        self.k = k
        self.rule = M.sky_rule(rule)
        self.given_palette = None if palette is None else np.asarray(palette, dtype=np.float64)
        self.cloud, self.sky = M.segment(img, self.rule, mask)
        if self.cloud.sum() < 100:
            raise ValueError('no cloud found in the image')
        self.pixels = img[self.cloud]

    @cached_property
    def silhouette(self):
        """The outer shape: not-sky, specks removed, holes filled."""
        return M.silhouette(self.sky)

    @cached_property
    def _own(self):
        return M.kmeans(self.pixels, self.k)

    @cached_property
    def own_palette(self):
        return self._own[0]

    @cached_property
    def own_labels(self):
        return self._own[1]

    @cached_property
    def palette(self):
        return self.given_palette if self.given_palette is not None else self.own_palette

    @cached_property
    def tones(self):
        return M.tone_map(self.img, self.cloud, self.palette)


@dataclass
class Metric:
    name: str
    label: str
    tolerance: object
    measure: object
    compare: object
    about: str = ''


REGISTRY = {}


def metric(name, label, tolerance, about=''):
    """Registers a metric. Decorates its `measure`; attach `compare` with `.compare`."""
    def wrap(fn):
        m = Metric(name, label, tolerance, fn, None, about or (fn.__doc__ or '').strip())
        REGISTRY[name] = m

        def set_compare(cmp):
            m.compare = cmp
            return cmp
        fn.compare = set_compare
        return fn
    return wrap


def row(label, target, actual, off, tolerance, relative=False):
    ok = abs(off) <= tolerance if isinstance(off, (int, float)) else False
    return {'metric': label, 'target': target, 'actual': actual, 'off': off, 'tolerance': tolerance, 'ok': bool(ok), 'relative': relative}


def _hex(c):
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in c)


# ── The metrics ──────────────────────────────────────────────────────────

@metric('palette', 'palette', 8.0)
def palette(ctx):
    """The tones the image is painted in (k-means in Lab), dark to light."""
    return [_hex(c) for c in ctx.own_palette]


@palette.compare
def _(ref, got, tol):
    rows = []
    for i, (a, b) in enumerate(zip(ref, got)):
        ca = np.array([int(a[j:j + 2], 16) for j in (1, 3, 5)], float)
        cb = np.array([int(b[j:j + 2], 16) for j in (1, 3, 5)], float)
        rows.append(row(f'tone {i + 1} colour', a, b, round(float(M.delta_e(ca, cb)), 2), tol))
    return rows


@metric('tone_shares', 'tone shares', 0.05)
def tone_shares(ctx):
    """Share of the cloud covered by each tone of the palette in use."""
    counts = np.bincount(ctx.tones[ctx.cloud], minlength=len(ctx.palette))
    return [round(float(c), 4) for c in counts / counts.sum()]


@tone_shares.compare
def _(ref, got, tol):
    return [row(f'tone {i + 1} share', a, b, round(b - a, 4), tol) for i, (a, b) in enumerate(zip(ref, got))]


@metric('brightness', 'brightness distribution', 12.0)
def brightness(ctx):
    """Normalised brightness histogram of the cloud (32 bins over 0..255)."""
    return M.histogram(ctx.img, ctx.cloud)


@brightness.compare
def _(ref, got, tol):
    a, b = np.asarray(ref, float), np.asarray(got, float)
    emd = float(np.abs(np.cumsum(a) - np.cumsum(b)).sum() * 255 / len(a))
    return [row('brightness distribution (EMD)', 0, round(emd, 2), round(emd, 2), tol)]


@metric('outline', 'outline bumpiness', 0.06)
def outline(ctx):
    """Box-counting dimension of the silhouette edge. 1.0 is smooth."""
    return round(M.outline_dimension(ctx.silhouette), 4)


@outline.compare
def _(ref, got, tol):
    return [row('outline bumpiness', ref, got, round(got - ref, 4), tol)]


def _relative(label):
    def cmp(ref, got, tol):
        off = round((got - ref) / ref, 3) if ref else 0.0
        return [row(label, ref, got, off, tol, relative=True)]
    return cmp


@metric('outline_length', 'outline length', 0.35)
def outline_length(ctx):
    """Perimeter squared over area of the silhouette."""
    return round(M.perimeter_ratio(ctx.silhouette), 2)


outline_length.compare(_relative('outline length'))


@metric('tone_boundary', 'tone boundaries', 0.25)
def tone_boundary(ctx):
    """Length of the boundaries between tones, per square root of area."""
    return round(M.tone_boundary(ctx.tones, ctx.cloud), 3)


tone_boundary.compare(_relative('tone boundaries'))


# ── Craft: qualities any style can be held to ────────────────────────────
#
# These say nothing about which colours a cloud is painted in, only how well
# it is painted: how many tones it uses, how evenly, with how much contrast.
# Together with the shape metrics above they hold a style of our own to the
# reference's level of craft without pulling it toward the reference's look.

@metric('tone_count', 'effective number of tones', 1.0)
def tone_count(ctx):
    """How many tones the cloud really uses: exp of the entropy of its spread over 8 colour clusters. Five tones used equally score 5; one dominant tone scores near 1."""
    _, labels = M.kmeans(ctx.pixels, 8, min_share=0.0)
    shares = np.bincount(labels, minlength=8) / len(labels)
    shares = shares[shares > 0]
    return round(float(np.exp(-(shares * np.log(shares)).sum())), 2)


@tone_count.compare
def _(ref, got, tol):
    return [row('effective number of tones', ref, got, round(got - ref, 2), tol)]


@metric('tone_balance', 'largest tone share', 0.12)
def tone_balance(ctx):
    """Share of the cloud taken by its most-used tone. Lower means its tones are used more evenly."""
    shares = np.bincount(ctx.own_labels, minlength=ctx.k) / len(ctx.own_labels)
    return round(float(shares.max()), 4)


@tone_balance.compare
def _(ref, got, tol):
    # One-sided: using tones more evenly than the reference is never a fault.
    return [row('largest tone share', ref, got, round(max(0.0, got - ref), 4), tol)]


@metric('big_shapes', 'share in the 8 largest tone shapes', 0.1)
def big_shapes(ctx):
    """Share of the cloud covered by its 8 largest single-tone shapes. A few big masses score high; many small, repeated shapes score low."""
    areas = M.tone_regions(ctx.tones, ctx.cloud)
    return round(float(areas[:8].sum() / max(1, areas.sum())), 4)


@big_shapes.compare
def _(ref, got, tol):
    return [row('share in the 8 largest tone shapes', ref, got, round(got - ref, 4), tol)]


@metric('value_range', 'value range', 10.0)
def value_range(ctx):
    """Lightness (Lab L) from the cloud's darkest tone to its lightest: the contrast it is painted with."""
    lab = M.srgb_to_lab(ctx.own_palette)
    return round(float(lab[:, 0].max() - lab[:, 0].min()), 2)


@value_range.compare
def _(ref, got, tol):
    return [row('value range', ref, got, round(got - ref, 2), tol)]


# ── Running them ─────────────────────────────────────────────────────────

def measure_all(ctx, names=None):
    names = names or list(REGISTRY)
    return {n: REGISTRY[n].measure(ctx) for n in names}


def compare_all(target_metrics, got_values):
    """Rows for every metric a target uses. Metrics the target names but the
    registry no longer has are reported, not fatal: targets outlive ideas."""
    rows = []
    for name, spec in target_metrics.items():
        m = REGISTRY.get(name)
        if m is None:
            rows.append({'metric': f'{name} (unknown metric, skipped)', 'target': None, 'actual': None, 'off': None,
                         'tolerance': None, 'ok': True, 'skipped': True})
            continue
        rows.extend(m.compare(spec['value'], got_values[name], spec.get('tolerance', m.tolerance)))
    return rows
