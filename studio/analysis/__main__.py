"""Cloud analysis, from the command line. Run from the repository root.

    python -m studio.analysis metrics
        Lists the metrics available, and what each measures.

    python -m studio.analysis measure IMAGE [--box x0,y0,x1,y1] [--k 5] [--metrics a,b] [--sheet OUT.png] [--json OUT.json]
        Measures an image.

    python -m studio.analysis target NAME IMAGE --box x0,y0,x1,y1 [--k 5] [--metrics a,b] [--note TEXT]
        Measures a reference and saves it as studio/targets/NAME.json, using
        the given metrics (all of them by default). The reference image is
        copied to studio/references/, which is not committed: references are
        other people's work. Edit the JSON afterwards to drop a metric or
        change a tolerance.

    python -m studio.analysis check IMAGE --target NAME [--box ...] [--sheet OUT.png] [--json OUT.json] [--strict]
        Scores an image against a target. Advisory: it always exits 0 unless
        --strict is given, in which case anything out of tolerance exits 1.

    python -m studio.analysis contact OUT.png --item IMAGE|LABEL|SCORES.json [--item ...] [--title TEXT]
        Lays renders out in a grid, each captioned with its scores.

  --mask gives the cloud's silhouette outright (study pages render one with
  ?mask=1), so nothing has to be guessed. Without it,
  --sky picks how sky is told from cloud: 'border' reads the sky from the
  frame's edges and works for any palette; 'blue' expects a saturated blue sky
  and ignores warm things like wooden poles (good for photos of real scenes).
"""
import argparse
import json
import os
import shutil
import sys

from . import measure as M
from . import metrics as X
from . import score as S
from . import sheet as SH

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TARGETS = os.path.join(ROOT, 'studio', 'targets')
REFERENCES = os.path.join(ROOT, 'studio', 'references')


def parse_box(text):
    if not text:
        return None
    box = [int(v) for v in text.split(',')]
    if len(box) != 4:
        raise SystemExit('--box takes x0,y0,x1,y1')
    return box


def parse_names(text):
    if not text:
        return None
    names = [n.strip() for n in text.split(',') if n.strip()]
    unknown = [n for n in names if n not in X.REGISTRY]
    if unknown:
        raise SystemExit(f"unknown metric(s): {', '.join(unknown)}. See: python -m studio.analysis metrics")
    return names


def write_json(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1)


def cmd_metrics(a):
    for m in X.REGISTRY.values():
        print(f'  {m.name:<15} {m.about}  (default tolerance {m.tolerance})')


def cmd_measure(a):
    img = M.load(a.image, parse_box(a.box))
    ctx = X.Context(img, k=a.k, rule=a.sky)
    values = X.measure_all(ctx, parse_names(a.metrics))
    print(json.dumps({k: v for k, v in values.items() if k != 'brightness'}, indent=1))
    if a.json:
        write_json(a.json, values)
    if a.sheet:
        SH.measurement_sheet(ctx, values, a.title or os.path.basename(a.image)).save(a.sheet)
        print(a.sheet)


def cmd_target(a):
    box = parse_box(a.box)
    img = M.load(a.image, box)
    ctx = X.Context(img, k=a.k, rule=a.sky)
    os.makedirs(REFERENCES, exist_ok=True)
    ref_copy = os.path.join(REFERENCES, a.name + (os.path.splitext(a.image)[1] or '.png'))
    if os.path.abspath(a.image) != os.path.abspath(ref_copy):
        shutil.copyfile(a.image, ref_copy)
    target = S.build_target(a.name, ctx, parse_names(a.metrics), note=a.note or '',
                            reference=os.path.relpath(ref_copy, ROOT).replace('\\', '/'), box=box)
    path = os.path.join(TARGETS, a.name + '.json')
    write_json(path, target)
    values = {n: s['value'] for n, s in target['metrics'].items()}
    # The picture shows the reference itself, so it stays with the (uncommitted) reference.
    SH.measurement_sheet(ctx, values, f'target: {a.name}').save(os.path.join(REFERENCES, a.name + '-measured.png'))
    print(path)


def cmd_check(a):
    target = S.load_target(os.path.join(TARGETS, a.target + '.json'))
    img = M.load(a.image, parse_box(a.box))
    mask = M.load_mask(a.mask, parse_box(a.box)) if a.mask else None
    rows, ctx = S.check(target, img, sky=a.sky, mask=mask)
    print(f'{a.image} against {a.target}:')
    print(S.format_table(rows))
    if a.json:
        write_json(a.json, {'target': a.target, 'image': a.image, 'summary': S.summary(rows), 'rows': rows})
    if a.sheet:
        ref_ctx = None
        ref_path = os.path.join(ROOT, target.get('reference') or '')
        if target.get('reference') and os.path.exists(ref_path):
            ref_ctx = X.Context(M.load(ref_path, target.get('box')), k=target.get('k', 5), palette=S.target_palette(target), rule=target.get('sky', 'blue'))
        SH.check_sheet(ref_ctx, ctx, rows, f'{os.path.basename(a.image)} vs {a.target}').save(a.sheet)
        print(a.sheet)
    return 1 if a.strict and not S.summary(rows)['all_within'] else 0


def cmd_contact(a):
    """A grid of renders, each captioned with its scorecard summary."""
    items = []
    for spec in a.item:
        parts = spec.split('|')
        img, label = parts[0], parts[1] if len(parts) > 1 else os.path.basename(parts[0])
        rows = None
        if len(parts) > 2 and os.path.exists(parts[2]):
            with open(parts[2], encoding='utf-8') as f:
                rows = json.load(f)['rows']
        items.append((img, label, rows))
    SH.contact_sheet(items, a.title or '').save(a.out)
    print(a.out)


def cmd_grid(a):
    """Renders side by side, each with a caption: the output of a sweep."""
    cells = [(s.split('|')[0], s.split('|')[1] if '|' in s else os.path.basename(s)) for s in a.item]
    SH.grid_sheet(cells, a.cols, a.title or '', tile_w=a.tile).save(a.out)
    print(a.out)


def cmd_animate(a):
    """Frames to a looping animation: a turntable, a time-lapse."""
    print(SH.animation(a.frames, a.out, fps=a.fps, width=a.width))


def main(argv=None):
    p = argparse.ArgumentParser(prog='python -m studio.analysis', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('metrics')

    m = sub.add_parser('measure')
    m.add_argument('image'); m.add_argument('--box'); m.add_argument('--k', type=int, default=5)
    m.add_argument('--metrics'); m.add_argument('--sheet'); m.add_argument('--json'); m.add_argument('--title')
    m.add_argument('--sky', default='border', help="'border' (any sky, read from the frame's edges) or 'blue'")

    t = sub.add_parser('target')
    t.add_argument('name'); t.add_argument('image'); t.add_argument('--box', required=True)
    t.add_argument('--k', type=int, default=5); t.add_argument('--metrics'); t.add_argument('--note')
    t.add_argument('--sky', default='blue', help="sky rule for the reference: 'blue' or 'border'")

    c = sub.add_parser('check')
    c.add_argument('image'); c.add_argument('--target', required=True); c.add_argument('--box')
    c.add_argument('--sheet'); c.add_argument('--json'); c.add_argument('--strict', action='store_true')
    c.add_argument('--sky', default='border', help="sky rule for the image being checked")
    c.add_argument('--mask', help='a silhouette image (white = cloud) to use instead of finding the sky')

    k = sub.add_parser('contact')
    k.add_argument('out'); k.add_argument('--item', action='append', required=True, help='IMAGE|LABEL|SCORES.json')
    k.add_argument('--title')

    gr = sub.add_parser('grid')
    gr.add_argument('out'); gr.add_argument('--item', action='append', required=True, help='IMAGE|CAPTION')
    gr.add_argument('--cols', type=int, default=4); gr.add_argument('--title'); gr.add_argument('--tile', type=int, default=400)

    an = sub.add_parser('animate')
    an.add_argument('out', help='.gif or .webp'); an.add_argument('frames', nargs='+')
    an.add_argument('--fps', type=float, default=12); an.add_argument('--width', type=int)

    a = p.parse_args(argv)
    return {'metrics': cmd_metrics, 'measure': cmd_measure, 'target': cmd_target, 'check': cmd_check, 'contact': cmd_contact,
            'grid': cmd_grid, 'animate': cmd_animate}[a.cmd](a) or 0


if __name__ == '__main__':
    sys.exit(main())
