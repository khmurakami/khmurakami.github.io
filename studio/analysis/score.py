"""Targets, and scoring a render against one.

A target (studio/targets/NAME.json) is data, not code:

    {
      "name": "summer-cumulus",
      "note": "...",
      "reference": "studio/references/summer-cumulus.png",
      "box": [x0, y0, x1, y1],
      "k": 5,
      "metrics": {
        "palette":     {"value": [...], "tolerance": 8.0},
        "tone_shares": {"value": [...], "tolerance": 0.05},
        ...
      }
    }

Edit a target by hand to drop a metric, loosen a tolerance, or add `"weight"`.
Scoring is advisory: it reports how close a render is; whether that matters is
a judgement made by looking at the sheet.
"""
import json

from . import metrics as X


def build_target(name, ctx, names=None, note='', reference='', box=None):
    values = X.measure_all(ctx, names)
    return {
        'name': name,
        'note': note,
        'reference': reference,
        'box': box,
        'k': ctx.k,
        'sky': ctx.rule.mode if ctx.rule else 'blue',
        'metrics': {n: {'value': v, 'tolerance': X.REGISTRY[n].tolerance} for n, v in values.items()},
    }


def target_palette(target):
    """The target's palette as RGB, if it measured one: renders are read
    against it, so tone 3 means the same tone on both sides."""
    spec = target.get('metrics', {}).get('palette')
    if not spec:
        return None
    return [[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in spec['value']]


def check(target, img, sky=None, mask=None):
    """(rows, context) for an image scored against a target. `sky` is the sky
    rule for the image (the target's own rule is for its reference); `mask`, a
    known silhouette, overrides it."""
    pal = target_palette(target)
    ctx = X.Context(img, k=target.get('k', 5), palette=pal, rule=sky, mask=mask)
    names = [n for n in target['metrics'] if n in X.REGISTRY]
    got = X.measure_all(ctx, names)
    return X.compare_all(target['metrics'], got), ctx


def summary(rows, target=None):
    counted = [r for r in rows if not r.get('skipped')]
    passed = sum(r['ok'] for r in counted)
    return {'passed': passed, 'total': len(counted), 'all_within': passed == len(counted)}


def format_table(rows):
    w = max(len(r['metric']) for r in rows)
    lines = []
    for r in rows:
        if r.get('skipped'):
            lines.append(f"  ----  {r['metric']}")
            continue
        off = f"{r['off']:+.0%}" if r.get('relative') else f"{r['off']:+}"
        lines.append(f"  {'ok  ' if r['ok'] else 'off '}  {r['metric']:<{w}}  target {r['target']!s:<9} actual {r['actual']!s:<9} off {off:<8} (tol {r['tolerance']})")
    s = summary(rows)
    lines.append(f"  {s['passed']}/{s['total']} within tolerance")
    return '\n'.join(lines)


def load_target(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)
