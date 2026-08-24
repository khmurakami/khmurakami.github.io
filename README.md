# khmurakami.github.io

A portfolio you walk around: a night-time city rooftop, rendered as a 2.5D
pixel-art side-scroller on a canvas. Every building and object on the roof opens
something — projects, the blog, a terminal, a guestbook. There is no nav bar.
The world is the navigation.

Plain HTML, CSS and ES modules. No framework, no build step, no bundler. GitHub
Pages serves `main` directly, so **a push is a deploy**.

There is also a blog at `blog.html`, which is a normal page of text — everything
in the world is reachable without playing anything.

## Running it

```bash
python scripts/serve.py            # http://127.0.0.1:8000
python scripts/serve.py --lan      # also on the LAN, for testing on a phone
npm test                           # the suite
```

Use `scripts/serve.py` rather than `python -m http.server`: browsers cache ES
modules hard, and you will spend an hour debugging a build you are not running.
Every response here is `no-store`.

## How it is put together

### The manifest is the contract

`js/config/city.js` and the two interiors declare the world: the depth planes,
and every prop slot — where each thing stands, how big it is, whether it is
solid, and what it does when you press E on it. The engine knows none of the
content. It renders a **labelled dashed box** for any slot whose art does not
exist yet, so the layout, the camera, the collision and the doors are all
walkable and tunable before a single image is made. The art is then generated to
fit the slots, rather than the slots being reverse-engineered from whatever art
came back.

What an action *does* is the other half of that contract, in
`js/config/actions.js`. Adding something to the world is one manifest entry and
one line there.

### Arrangement

A roof full of objects is not a roof that reads as a place, and arrangement is
the one part of this project nothing else can check — a prop in the wrong spot
loads fine, draws fine, and quietly makes the world feel like a warehouse.

```bash
npm run world:path      # the walkable corridor, and what is standing in it
npm run world:plan      # the roof from above, as a floor plan
npm run world:preview   # a frame, composited, so composition can be looked at
```

`world:preview` draws the same frame the engine would, from the same manifest,
with the same parallax and depth scaling. It is not the engine — no wind, no
animation, and the runtime lighting is approximated — but it is exactly right
about where everything is and how big, which is what composition is made of.

Two rules the world holds to, both guarded by `tests/Story.test.js`:

- **Every reason to walk somewhere is its own reason.** No two objects open the
  same panel, and no two prompts say the same words. Three panels used to be
  reachable twice — the résumé from a utility shed *and* a clipboard, the
  guestbook from a mailbox *and* a radio mast, the blog from a greenhouse *and*
  a newsstand — and three separate props were all labelled just "Project".
- **What an object does matches what it is.** A newsstand sells reading matter,
  so it opens the blog. A clipboard holds a CV. A greenhouse is about what
  grows. The shed and the mast went back to being scenery, which they were
  always better at.

Clutter is placed by `cluster()` rather than `scatter()`: each item picks a
reason — a drain, a hatch, a workbench — and lands near it. Measured as the
variation in gaps between siblings, where 0 is a grid and ~1 is random, the
weeds went from **0.30 to 1.38** and the puddles from 0.23 to 1.25. Ten stretches
of the roof are now empty, and the empty ones are what make the busy ones read
as busy.

| File | What it declares |
|---|---|
| `js/config/city.js` | The roof: planes, ~224 prop slots, walkway, terrain |
| `js/config/workshop.js`, `stairwell.js` | The interiors |
| `js/config/scenes.js` | Every scene, once — the loop, the router and both asset checks read it |
| `js/config/actions.js` | What each `action` id opens or does |
| `js/config/projects.js` | The projects, as panels and as props |
| `js/config/site.js` | The site's own settings: repository, résumé, guestbook |
| `js/config/tuning.js` | The loop's numbers, with the reasoning attached |
| `js/config/posts.js` | **Generated** from the posts' front matter |

### Light and depth

Three things put the character IN the scene rather than in front of it, and all
three live in `Effects`:

- **Rim light.** The lamp nearest a sprite catches its edge, in that lamp's
  colour. Made by stamping the sprite's own silhouette one pixel towards the
  light, flooding it, and cutting the sprite back out — what is left is a rim
  exactly one pixel wide, which is how a pixel artist would draw one. Without
  it you can walk up to a lit greenhouse and stay exactly as blue as you were
  on the far side of the roof.
- **Separation.** A very weak, very wide darkening behind a standing figure.
  A character the same value as the wall behind them has no silhouette, and
  silhouette is the only thing that reads at this size.
- **Reflection.** Standing water hands the nearest lamp's colour back, as a
  vertical smear rather than a mirror image — at this resolution a real
  reflection is four unreadable pixels.

Distance is handled in the ART, not at runtime. Haze can only wash a plane
towards one colour; it cannot reduce CONTRAST, so distant towers kept their
crisp internal detail and went on competing with the roof. `npm run art:depth`
bakes a per-plane grade — flatter and less saturated the further back, harder
and darker for the foreground — which costs nothing per frame.

### The pixel pipeline

The world is drawn once into a low-resolution offscreen buffer and blitted to
the display at a **whole-number scale**. That is the thing that separates pixel
art from art made of small squares: sampling at a fractional destination makes
rows of pixels double and vanish as a sprite moves. See the comment at the top
of `js/world-main.js`, which is the longest explanation in the codebase because
it is the decision everything else on screen rests on.

Composition is fitted to a **1600×900 design viewport** rather than to the
window, so a phone gets a smaller world rather than a six-per-cent slice of one.
`tests/Responsive.test.js` guards that at nine decimal places.

**The camera scrolls in whole buffer pixels.** Sprites are drawn at rounded
positions — a sprite at a fractional one is resampled and its outline crawls —
but the position being rounded used to include the camera, which moves
continuously, so every prop crossed its own rounding threshold at its own
moment. Two props a fixed distance apart were measured wobbling between 68 and
69 pixels apart, **1,480 times across a 4,000-frame pan**. Rounding the camera
instead makes each prop's fractional part constant, so a plane steps by exactly
one pixel and the scene holds together. `tests/Smoothness.test.js` guards it.

```bash
npm run profile     # what a frame asks for, per scene
npm run budget      # what a visitor waits through before the world appears
```

`profile` counts draw calls, sorts, comparator calls, array elements walked and
gradients allocated. The frame does none of the last four any more.

### Loading

`budget` models the critical path, which for a static site is decided entirely
by its shape: how many round trips deep the dependency graph is, how many
requests come out of it, and how many bytes those carry. It went from 1,276ms to
514ms on a modelled phone.

Three things did it, in order of size:

- **`modulepreload` hints for the whole module graph.** A browser discovers ES
  modules one level at a time — it cannot know a module's imports until it has
  fetched and parsed it. The graph is five deep, so that was five round trips
  (600ms) before any of this site's code ran, and the artwork could not even be
  *requested* until it did. The hints let the browser fetch all thirty-two at
  once. They are **generated** by `npm run preload` and CI fails if they drift,
  because a missing hint is not an error — it is just the old load time creeping
  back.
- **The interiors stream in behind the world.** 26 files and 94KB of rooms
  nobody has walked into were on the critical path. If somebody reaches a door
  before one arrives, the transition's veil holds at full black rather than
  opening onto placeholder boxes.
- **The roof loads in two waves.** The first is what is on screen at the spawn,
  plus two seconds of running in each direction; the rest follows. A prop that
  has not arrived draws **nothing** — the labelled dashed box is for art that
  was never made, which is a different thing from art that is still coming.

A fourth cut the bytes themselves: **the served art is lossless WebP**, 31%
smaller than the PNGs at 126 of 126 files drawing identically. WebP is Safari
14.0 and the engine already uses static class fields, which are Safari 14.1 — so
it asks less of a browser than the code loading it.

Together, 37% of the artwork is off the critical path, requests before the
reveal dropped from 159 to 100, and the wait went from 1,276ms to 459ms.

`npm run art:webp` converts and repoints the manifests; it verifies each file
draws identically before giving up its PNG, and refuses any that does not.

### The art

Generated, then put through `scripts/`, in this order:

```
cutout.py       key the background out of a raw sheet
split_sheet.py  cut the sheet into one file per prop
pixelate.py     snap to a real block size and to the 64-colour palette
stylecheck.py   measure drift against the master
tile.py         check and fix seams on tiling layers
```

Then four passes that treat the art as a set rather than as a pile of files.
Each one measures, does the smallest correct thing, and refuses anything it
cannot verify:

```bash
npm run art:fit      # author each asset at the size the world draws it
npm run art:grade    # pull drifted assets back to the world's tone
npm run images       # re-encode to a palette, losslessly
npm run art:audit    # what is still wrong, per asset
npm run art:tone     # brightness and saturation vs the rest of the world
npm run art:sheet    # every asset on one page, at its drawn size
```

**`art:fit` is the important one.** The pixel pipeline blits the buffer at a
whole-number scale so art pixels land as clean squares — but the assets
themselves were never brought into line with it. Source pixels per buffer pixel
ranged from 0.71 to 7.72, so the canvas was resampling most props at draw time
and picking a different pixel each frame as they moved. That is pixel swim,
reintroduced downstream of the machinery built to prevent it. Now: 0.49 to 2.12,
median 1.05.

**`art:grade`** closes tone drift. Assets generated one at a time came back a
little brighter and flatter each time; luminance ran from 21 to 145 against a
plate at 29, and is now 18 to 32 at the tenth and ninetieth percentiles. It
never touches a prop that declares a `light` — the manifest says which things
are lamps, and a lamp is supposed to be brighter than the night.

Both refuse rather than guess. `art:fit` will not upscale and will not resample
a sprite sheet; `art:grade` reverts any correction that turns a prop's colour
instead of its tone, which is what stopped the poster being graded brown and the
laundry olive.

The palette gained a **dark neutral ramp** along the way. The derived 64 had no
near-grey below luminance 90 at all, which is why every piece of paper and cloth
in the world was too bright: darkened, it had nowhere neutral to land.

`assets/city/prompts.json` records the verbatim prompt, the reference image and
the post-processing for every asset. Which is why `assets/city/raw/` is
gitignored: it is reproducible from that file. `assets/city/master_rooftop.png`
and `style.PNG` are **not** reproducible — they are the inputs the whole style
descends from — so they are committed on purpose despite not being served.

### The blog

Posts are Markdown in `posts/`, with YAML front matter. `js/config/posts.js` is
the index every listing reads, and it is **generated**:

```bash
npm run posts          # regenerate it from posts/*.md
npm run check:posts    # what CI runs; fails if it has drifted
```

Do not edit `posts.js` by hand — edit the post's front matter.

Posts can also be edited in the browser, on `blog.html`, by anyone holding a
GitHub token with `Contents: write`. The token is held in memory for the one
request and never stored. Publishing commits the Markdown **and** the
regenerated index in a single commit, so the site is never caught between them.

## Checks

CI runs all of these on every push, because a push is a deploy.

```bash
npm test               # the suite
npm run assets         # declared slots with no art
npm run check:assets   # manifest paths missing from disk or from git
npm run check:posts    # index vs front matter
npm run check:meta     # sitemap and robots.txt vs the site
npm run check:preload  # preload hints vs the module graph
```

The suite is not decoration. It has caught a sealed roof, three props that were
never drawn, a viewpoint you could walk into and not out of, a loading bar that
stopped short of the end, and a publish path that deleted a post's heading.
**If a test fails, work out what it is protecting before changing it** — twice
it turned out the test was measuring the wrong thing, and both times the fix was
to express the invariant better rather than to loosen the number.

## Layout

```
index.html         the world; carries its own styles inline
blog.html          the blog
js/engine/         the engine. Knows nothing about the content
js/config/         the content. Knows nothing about the engine
js/controllers/    the blog's UI
scripts/           the art pipeline, plus the dev server and the checks
posts/             Markdown, the source of truth for the blog
assets/city/       the world's art
deprecated/        superseded directions, kept but not tracked
```

## Licence

MIT. See `LICENSE`.
