# Studio

Where the site's art gets made and judged: study pages that paint one thing in
isolation, and tools that measure the result against a reference.

The rule is **one thing at a time**. Get a cloud right on its own page before
it goes into a scene. The numbers here help you see what changed between two
renders; the verdict is always by eye, next to the live site.

Nothing here is a fixed method. Metrics, targets, studies and cloud engines are
all pluggable, so any part of the approach can be swapped out without
rewriting the rest.

## The loop

```bash
node scripts/study.mjs styles                       # every style variant, scored, plus a contact sheet
node scripts/study.mjs styles --only=showa          # one of them
node scripts/study.mjs cloud --query=engine=lit     # any page query
node scripts/study.mjs cloud --label=more-ao        # keep this run's files apart
```

## Two kinds of target

- **Likeness** (`summer-cumulus`): palette, tone shares, brightness. How close a
  render is to a particular reference's look. Useful for learning how a
  reference is built; aiming at it makes a copy.
- **Craft** (`summer-craft`): outline, tone boundaries, effective number of
  tones, balance, big shapes, value range. Nothing about colour. This is the
  bar for a style of our own: as well made as the reference, without looking
  like it.

Each run writes to `renders/studies/`:

- `cloud.png`: the render
- `cloud-<target>.png`: the reference and the render side by side, both as tone
  maps in the reference's palette, with the scorecard underneath
- `cloud-<target>.json`: the same scores, for scripts

Scores are advisory. Add `--strict` to make the exit code fail when something
is out of tolerance.

## Pieces

| Piece | What it is | How to change it |
|---|---|---|
| `studio/*.html` | Study pages. Each paints one subject; `?engine=` picks how, `?mask=1` renders the silhouette. | Add an engine (or a style to `STYLES`). |
| `studio/studies.json` | Which page to render, at what size, scored against which targets. | Edit the JSON. |
| `studio/targets/*.json` | A reference's measurements, with a tolerance per metric. | Edit the JSON: drop a metric, loosen a tolerance. |
| `studio/references/` | The reference images. **Not committed**: they are other people's work. | `python -m studio.analysis target …` |
| `studio/analysis/metrics.py` | The metrics, as plug-ins. | Add a function with `@metric`. |

## Metrics

```bash
python -m studio.analysis metrics      # what is available
```

| Metric | Measures |
|---|---|
| `palette` | The tones the cloud is painted in (k-means in Lab), dark to light |
| `tone_shares` | How much of the cloud each tone covers |
| `brightness` | The brightness histogram, compared by earth mover's distance |
| `outline` | Box-counting dimension of the silhouette: 1.0 smooth, higher bumpier |
| `outline_length` | Perimeter² / area of the silhouette |
| `tone_boundary` | Length of boundaries between tones, per √area |
| `tone_count` | Effective number of tones: exp of the entropy of the cloud's spread over 8 colour clusters |
| `tone_balance` | Share taken by the most-used tone (one-sided: more even is never a fault) |
| `big_shapes` | Share of the cloud in its 8 largest single-tone shapes: big masses vs many small repeats |
| `value_range` | Lightness from darkest to lightest tone |

Outline metrics measure the outer silhouette: everything that is not sky, with
specks removed and holes filled, so ink lines and enclosed shadows are part of
the cloud, not its edge.

## Telling cloud from sky

- **Masks** (best): a study page renders its own silhouette with `?mask=1`;
  studies with `"mask": true` are measured against it, so nothing is guessed.
- `--sky border`: the sky is whatever colour the frame's edges are, row by
  row. Works for any palette.
- `--sky blue`: a saturated blue sky, ignoring clearly warm things like
  wooden poles. For real pictures with clutter in them.

All of them are independent of image size. Sky is told apart from cloud by
being sky-coloured **and connected to the frame**, because painters use the
sky's own blue for a cloud's deepest shadow.

A new metric is one function:

```python
@metric('coverage', 'coverage', 0.1)
def coverage(ctx):
    """How much of the frame is cloud."""
    return float(ctx.cloud.mean())

@coverage.compare
def _(ref, got, tol):
    return [row('coverage', ref, got, got - ref, tol)]
```

Then add `"coverage": {"value": …, "tolerance": 0.1}` to a target, or
rebuild the target with `--metrics`.

## Adding a reference

```bash
python -m studio.analysis target NAME path/to/image.png --box x0,y0,x1,y1 --note "where it came from"
```

Choose a box with sky and cloud only: frames, poles and furniture skew the
palette. The command writes `studio/targets/NAME.json`, plus a picture of the
measurement next to the reference, `studio/references/NAME-measured.png`.
Check that picture before trusting the target.

## Other tools

```bash
python -m studio.analysis measure IMAGE --box … --sheet out.png    # measure anything
python -m studio.analysis check IMAGE --target NAME --sheet out.png # score anything
python -m studio.analysis contact OUT.png --item IMG|LABEL|SCORES.json ...  # lay renders out with scores
node scripts/render.mjs 1200x900 --page=studio/cloud.html?seed=3    # render any page
python -m unittest discover -s studio/analysis/tests -t .           # test the analysis
```
