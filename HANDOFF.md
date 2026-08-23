# Handoff

State of the rooftop side-scroller as of 2026-08-22. Everything below was
verified against the repo while writing, not recalled.

## What this is

A personal portfolio built as a 2.5D pixel-art side-scroller. You walk a
character along a night-time city rooftop; buildings and objects on the roof
open the portfolio's content. It replaces a conventional page — there is no nav
bar, the world *is* the navigation.

**`index.html` is the game**, and is the live site. It is served from `main`
by GitHub Pages.

`blog.html` is the pre-existing blog and still works; it is deliberately kept
alive as a plain HTML route so posts stay indexable and readable on a phone.

The old isometric room that used to be `index.html` is retired to
`deprecated/isometric-room/` — its page, `js/main.js`, `Scene.js`,
`RoomMapper.js`, `ParallaxScene.js`, `config/scene.js`, its tests and its 21MB
of `room_v3` art, all in their original layout so any of it restores by
reversing its path. That directory is **gitignored**, so it exists on the
working machine only.

## Run it

```bash
python scripts/serve.py 8000     # dev server, sends no-store
npm test                         # 254 tests, 22 files
npm run assets                   # which asset slots are unfilled
```

Use `scripts/serve.py`, not `python -m http.server`. Browsers cache ES modules
aggressively and you will spend an hour debugging a stale build. This happened.

## Architecture

### The manifest is the contract

`js/config/city.js` declares the entire world: depth planes, every prop slot,
platforms, the character, and tuning values. The engine renders a **labelled
placeholder** for any prop whose image is missing, so layout, collision, camera
and interactions are all workable before art exists. Art is generated to fit
declared slots, never the other way round.

Current roof: **6200px wide, 5 planes, 85 props (37 solid), 5 doors, 10
interactables, 6 platforms.**

The same contract describes interiors. `js/config/workshop.js` is a room, not a
special case: same planes, same slots, same solids, so `World`, `Collision`,
`Terrain` and `Triggers` cross the threshold unchanged and the room was walkable
as dashed boxes before any interior art existed.

### Engine (`js/engine/`)

| File | Role |
|---|---|
| `World.js` | Draws planes, props, actors. Depth sorting, per-plane haze, placeholders. |
| `Camera.js` | Horizontal scroll with deadzone, look-ahead, vertical tilt for stargazing. |
| `Sprite.js` | Sheet playback: clips by row, `offset`, `loop`/`pingpong`/`once`, `flipX`, `rate`. |
| `Collision.js` | Solid props. Footprints on the floor (x, z), per-axis resolution. |
| `Terrain.js` | Elevation. Platforms and ramps, `maxStep` gating. |
| `Walkway.js` | The route: shaped lanes of walkable floor. Drives movement *and* the floor art. |
| `locomotion.js` | Pure function arbitrating keyboard vs click-to-walk. |
| `direction.js` | Facing from (dx, dz); maps facing to clip + mirror. |
| `Wind.js` | One global wind signal; every swaying prop reads from it. |
| `Ambient.js` | Plane crossings, skyline window toggles, startled pigeons. |
| `Starfield.js` | Procedural twinkling stars, seeded. |
| `Effects.js` | Light pools, bloom, contact shadows, vignette, film grain. |
| `Audio.js` | Fully synthesised: city hum, wind, footsteps, neon buzz. No audio files. |
| `Panel.js` | Diegetic DOM panels. Focus trap, Esc, reduced-motion aware. |
| `Terminal.js` | Working shell: `ls`, `cat`, history, tab completion. |
| `Triggers.js` | Interaction zones, enter/exit transitions. |
| `SceneManager.js` | Which place you are in. Scene stack, fade timing, `busy` input lock. |
| `BootScreen.js` | Load progress. Drives markup already in the page; reveals after frame 1. |

Everything in `js/engine/` is live. The engines belonging to earlier directions
were retired to `deprecated/isometric-room/` when the rooftop became the site.

### Entry points

- `js/world-main.js` — the game loop
- `js/content.js` — panel content (projects, blog stack, resume, guestbook, terminal, workshop panels)
- `js/config/city.js` — the roof
- `js/config/workshop.js` — the first interior
- `js/main.js` — old isometric room, drives `index.html`

## The route

`Walkway.js`, declared as `walkway` in each manifest.

Walkability used to be "the whole deck minus the solid props" — invisible.
Nothing on screen said where the floor ended, so you wandered into the back wall
and off the front lip, and the roof read as a field of scenery you were loose in.

Now the route is data, movement is clamped to it, and **`World.drawWalkway`
draws the worn path from the same object**. The path you can see is not a
decoration over the collision volume; it *is* the collision volume. They cannot
drift apart because there is only one of them.

### Lanes

A lane is a polyline of control points, each naming the `near` and `far` z of
the band at that x, smoothstepped between. The roof has **two**: `deck` and the
raised `service` level along the back. The gap between them is deliberately not
described here — a 46px face is a wall because it is 46px, which is `Terrain`'s
business.

`clamp()` pulls to the *nearest* lane, so stepping off the back of the service
level lands you on its own edge rather than teleporting to the deck below.

### Three systems, one order

Movement composes as: **route limits where you may aim → terrain limits what you
may climb → collision limits what you may walk through.**

The route clamps the *intent*, before terrain and collision. Clamp after and the
route fights terrain at every platform edge, dragging you off ledges terrain has
already said you may stand on.

Click-to-walk sets depth directly and is clamped too — otherwise a click on the
sky is a free teleport into the back wall, the one input that could put you
somewhere walking never can.

### The route is the world's extent

x is bounded by the route, not by `manifest.width`. Past the last control point
no lane covers the deck, `clamp` has no band to pull onto, and depth stops being
constrained at all.

### Shaping

The edges swell at the six zone landmarks and pinch between them — that is what
makes a wide open deck still read as having somewhere to go. There is a test
asserting landmarks are wider than 0.45 and pinches narrower than 0.35.

**No band may be narrower than `collision.depthRadius * 2`** or the resolver
cannot fit the character onto it. Both service-level step landings were 0.07
against a 0.08 character and were step-to-nowhere until a test caught it.

### tests/Reachability.test.js

The important one. It floods the walkable space of every scene and asks what a
player would: can you reach both ends, is every door and interactable standable-
next-to, and — the one that matters — **is there anywhere you can get into and
not get back out of.**

That graph is *directed*: `Terrain.canMove` deliberately allows any drop but
limits rises, so a step down is not the same edge as the step back up. Which is
how the **sunken lookout was a trap** — an 18px drop in, and 18 > `maxStep` to
climb out, so walking to the viewpoint stranded you at the end of the roof with
no way back and nothing explaining why. Fixed with a `lookout_ramp` along its
landward edge, not by changing the physics: "always allows stepping down" is a
deliberate rule with its own test.

## Coordinate system

Three axes, deliberately separate:

- **x** — along the roof, world pixels
- **z** — into the roof, `0` at the front lip to `1` at the back wall. Drives
  screen position *and* scale, and depth-sorts the character among props.
- **elevation** — height in reference px. Lifts up the screen, does **not**
  change scale. Conflating this with depth is what makes fake-3D read wrong.

`horizonY: 0.66` must equal `1 - backdrops.deck.heightFrac`. Far-plane props
stand on it. There is a test.

## The asset pipeline

`assets/city/prompts.json` is the reproducibility record: verbatim prompts,
which reference image was passed, exact post-processing commands, and what went
wrong in each raw output. Read it before generating anything.

Generation is Codex CLI with the `openai/skills` `imagegen` skill, running on
ChatGPT auth (no `OPENAI_API_KEY`):

```bash
codex exec -s workspace-write --skip-git-repo-check -i <ref.png> - <<'EOF'
...prompt...
EOF
```

`-i` is variadic and swallows a positional prompt — pass prompts on **stdin**.

### Pipeline order

```
raw/sheet.png
  → scripts/cutout.py    --tolerance 40 --erode 1 --pockets --pocket-tolerance 30
  → scripts/split_sheet.py  <outdir> name1 name2 ...
  → scripts/pixelate.py  --apply --block 2|3
  → scripts/stylecheck.py   (verify against master)
```

Tiling layers additionally go through `scripts/tile.py fix`.

### Rules that cost real time to learn

- **Generate to `raw/`, never to a processed path.** A background generator
  finishing late overwrites whatever sits at its output path. This silently
  destroyed processed layers and painted white over the entire sky.
- **Check the transparency *percentage*, not the mode.** One sheet came back
  RGBA at 0% transparent (white background in an alpha-capable file). Another
  came back with real alpha, and keying it as white-backed deleted the artwork.
- **`--pockets` is mandatory on prop sheets.** Enclosed background the border
  fill cannot reach — between bench slats, under a railing — survives as solid
  white blocks. It needs a *much tighter* tolerance (~30) than the border fill,
  because the border fill stops at the first out-of-range pixel while a global
  colour test does not.
- **cutout tolerance 40 + erode 1.** Tolerance 70 leaks through anti-aliased
  edges into light artwork and destroys the sprite.
- **Demand wide empty gaps between props in the prompt.** Touching props defeat
  the splitter.
- **Keep lit props dim in the asset.** The engine adds glow additively, which is
  what lets neon flicker. `neon_sign` came back at luminance 162 against a
  master of 29 and had to be graded down.
- **No ground shadows in prompts.** The engine draws contact shadows so they
  respond to depth and elevation.

### Pixel art

Measured finding: **asking for pixel art does not produce pixel art.** The
"pixel art" sheets still measure ~80,000 unique colours with no detectable pixel
grid. The generator produces the *look*; `pixelate.py` makes it real. Both
halves are required — art designed as a sprite quantises cleanly, a photoreal
render turns to mush.

`assets/city/palette.json` is 64 colours, every asset snapped to it. Built from
8 sources sampled **equally** — concatenating raw pixels weights by area, which
made a full-frame skyline drown out the props and produced 0 warm slots in 64
(a wooden crate came out purple). 9 accent colours are appended by hand, because
a median-cut of a 91%-shadow night scene has no room for the few bright colours
the eye actually goes to.

`ctx.imageSmoothingEnabled = false` must be reset **after every
`setTransform`** — the DPR transform silently re-enables smoothing.

Note: `style.PNG` in the repo root is the user's original reference. It is
**not** pixel art (87,929 colours, no grid); it was used for treatment and mood
only.

## Booting

Loading every scene up front means the wait is long enough to need covering.
`#boot` is **markup in `world.html`**, not built by JavaScript — a loading
screen created by JS cannot cover the gap it exists to cover, because the gap
starts before the JS does. `BootScreen.js` only drives it.

Two things it gets right that are easy to get wrong:

- **It reveals on frame 1, not when loading finishes.** The gap between the last
  image settling and the first frame appearing is long enough to show an
  unpainted canvas, which reads as a crash on the finish line.
- **Progress counts settled, not loaded.** Most interior slots have no art and
  settle as errors; counting successes would stall the bar at whatever fraction
  of the world happens to be drawn. `done()` also fills the bar on the way out,
  so a legitimately-short load does not look like a failure.

The total is `World.assetSrcs` summed across scenes, plus the character sheet —
**deduplicated**, because every chimney and every scattered puddle share one
image. Counting slots instead sets a target the loader never reaches. Adding a
room moves the number automatically.

The bar is a row of lit windows rather than a progress bar, which is the same
thing the skyline does all night in `Ambient`.

## Scenes

`SceneManager` owns which place you are in. A scene is a manifest plus a spawn
point; the roof is one, the workshop is another.

Three things it owns that the game loop should not:

- a **stack**, so leaving a room puts you back on the tile you entered from
  rather than at the roof's spawn point;
- a **transition**, so the swap happens at the midpoint of a fade instead of the
  world visibly teleporting under the character;
- **`busy`**, so input is ignored while the veil is up. Without it you keep
  walking behind the veil and arrive somewhere you did not aim for.

It touches no DOM and no canvas — it decides what is active and how opaque the
veil is, and the game draws that. That is what makes the timing testable.

### The two verbs

Door and interact actions are strings. Two of them go somewhere rather than
opening something, and they are checked before the panel switch so a scene can
never be shadowed by a panel of the same name:

- `scene:<id>` — enter that scene
- `leave` — pop back to wherever you entered from

The shack door on the roof is `scene:workshop` and the stair hut is
`scene:stairwell`. They used to be `projects` and `about`, which is why
`World.test.js` now tests that every section is **reachable across scenes**
rather than that every section has a door on the roof — checking only the roof
would have gone quiet at exactly the moment a section became unreachable.

### What crosses the threshold, and what does not

Per scene: `World`, `Collision`, `Terrain`, `Triggers`. Rebuilt from the
manifest, held in `built[id]`.

Shared: camera, wind, effects, audio, panel, and the character. They belong to
the player, not the place. The character is added to every scene's actor list
once at boot rather than moved across on each swap.

All scenes are loaded up front. The alternative is a door that opens onto a room
of placeholders which then pop in one by one while you stand in it.

### Camera modes fall out of the width

There is no mode switch. `Camera.originX` is the left margin when a world is
narrower than the viewport, so a 1500px room centres itself and a 6200px roof is
unaffected. Two things this got wrong first time and now has tests for:

- the origin is added **outside** the parallax term. Folding it into `renderX`
  scales it by each plane's parallax and slides the back wall sideways against
  its own floor;
- `renderX` stays the exact inverse of screen-x to world-x, because that is how
  click-to-walk converts a click.

## The interiors

Two rooms exist. `tests/Interiors.test.js` runs one parameterised set of
invariants over both — horizon, unique ids, one way out, spawn not inside a
solid, a walkway that crosses the room, every action wired *and* every declared
action used, doorway taller than a person. A third room inherits the whole set
by being added to that list rather than by someone remembering to.

Registering a room means four places: its manifest, the `SceneManager` scene
list and `built` map in `world-main.js`, `SCENES` in `scripts/asset_spec.mjs`,
and `INTERIORS` in the test.

### The landing — `js/config/stairwell.js`

Inside the stair hut, 1100px. The threshold: the city is down the stairs, the
roof is back through the door.

This is the **first door in the world** — it sits at the spawn point with a lit
doorway — which makes it the door that teaches what doors do. It opened an About
panel while a door across the roof entered a room, so the world contradicted
itself at exactly the moment it was explaining itself. That is the whole reason
it is a room.

The about-me lives on the noticeboard here, which also replaced the old `about`
case: it used to render the *rooftop-world project body* as biography, and read
like a project write-up because that is what it was. `content.js` has a real
`aboutPanel()` now.

Lit cold on purpose. The two interiors have one thing to say against each
other — the workshop is worked in, the landing is only passed through — and
equal warmth loses it. There is a test on the haze colour.

### The workshop — `js/config/workshop.js`

Inside the corrugated shack, 1500px wide.

The premise is that this is the room the rooftop was built in, and every object
in it is a real artefact of building this site — the pegboard is the actual
pipeline scripts, the paint shelf is the actual 64-colour palette fetched from
`palette.json`, the plans are the manifest counted live off `city`, and the CRT
runs the same terminal that stands out on the roof (same asset file, which is
the joke).

That premise is load-bearing, not decoration. A room of *plausible workshop
objects* reads as set dressing however good the art is, because nothing in it
rewards looking. It also settles what belongs in the room and what does not,
which is the only thing that stops an interior turning into a prop dump.

The radio is a diegetic mute. A switch labelled "sound" in the corner of the
screen is UI; a radio you walk over and turn off is the room. Stepping inside
also muffles the city bed via `Audio.setIndoors`.

One thing the room exposed: `Triggers` zones are **x-only**. On a 6200px roof
that is invisible; in a 1500px room it means standing at the front of the room,
nowhere near the bench, still offers "Use the terminal" because you share an x
with it. Not fixed — it would want a z band on the zone — but it will get more
noticeable with every interior added.

Panel styles for the workshop (`.tools`, `.swatches`, `.spec`) live in
`world.html` alongside the rest of the panel CSS, not in `style.css`.

**26 interior slots are still unmade** across the two rooms — `npm run assets`
now prints a line per scene with the unmade count, and lists the slots. Both
rooms are fully walkable as labelled placeholders until then.

## Layout design

The roof is composed as six zones, each with one landmark, a cluster of props
that explain the space, and empty roof between:

| x | Zone | Landmark |
|---|---|---|
| 200–900 | Arrival | stair hut |
| 900–1900 | Workshop | corrugated shack |
| 1900–2900 | Garden | greenhouse |
| 2900–3800 | Study | utility shed |
| 3800–4600 | Post | *(none — see open items)* |
| 4600–6200 | Lookout | radio mast |

Even scatter was the previous approach and made every stretch look identical.
`scatter()` still exists but is now used only for genuine texture — puddles and
weeds — which aren't solid.

## Open items

- **The Post zone has no landmark** over 250px. It's the one stretch with
  nothing tall to pull you toward it.
- **No run cycle.** Shift-to-run plays the walk faster with the frame rate
  scaled to speed. It reads acceptably but a real run has a flight phase.
- **Bulb strings hang in open air on the roof** with nothing to string them
  between. They are used correctly indoors, strung across the workshop ceiling
  as that room's light source; the roof still needs posts or a rethink.
- **Three of the five doors still have no interior** — resume (utility shed),
  contact (mailbox/mast) and blog. The blog door goes to `blog.html` on purpose.
  The other two should become rooms: with two doors now entering and two opening
  panels, the world is still inconsistent about what a door means.
- **`assets/resume.pdf` does not exist.** The clipboard panel says so plainly
  rather than failing silently. Drop the file in and it works.
- **Edge props are still missing.** The route is legible as wear, but nothing
  physical marks its edges — kerbs, gutter channels and railings were the other
  half of the plan and would make the boundary an object rather than a tone.
- **No nav bypass.** A recruiter must walk 6200px to reach the resume. A
  `Tab`-key destination list that flies the camera and opens the panel was
  recommended and not built. I'd treat this as the highest-priority gap — it
  risks the site's actual purpose.
- **Walk side row is slightly softer** than the up/down rows: that sheet
  generated at a third the resolution and was upscaled during compose.
- **Nothing here has been seen running.** There is no browser in this
  environment. `tests/WorldBoot.test.js` boots the real module against a stubbed
  canvas and drives a full round trip through the roof door and back out, which
  covers the wiring — but not one pixel of how any of it looks. The workshop
  needs a human to walk into it.

## Bugs fixed (don't reintroduce)

- `World.elevationOf()` read `o.x` as world position. On a Sprite, `x` is the
  **screen** position, reassigned every frame during draw — the character
  floated. Reads `worldX` first now.
- Plane `darken` used `source-atop` over the full viewport, tinting every pixel
  drawn so far rather than that plane's. It dimmed the whole scene by 45%. The
  feature was removed; doing it correctly needs a per-plane offscreen buffer.
- Keyboard movement didn't clear the click-to-walk destination, so releasing a
  key handed control back to a stale target and walked the character backwards.
- `Terrain.elevationAt()` seeded its search at `0` and only accepted higher
  values, making negative elevations impossible — the sunken lookout returned 0.
- The interaction prompt is faded out with `opacity`, not removed, so it stayed
  in the accessibility tree holding its last message. A screen reader could be
  offered a door in a room you had already left. It now toggles `aria-hidden`,
  and *un-hides before writing the text* — it is a polite live region, and a
  live region only announces changes made while it is in the tree.
- The workshop doorway was authored at 196px and measured 167cm once depth
  scaling took 8% off at the back wall: a door shorter than the person walking
  through it. `Workshop.test.js` measures it in human scale now, the same way
  `Scale.test.js` does for the roof.

## Deprecated

`deprecated/` holds four superseded art directions, six unused pre-existing
directories, dead config, and four superseded Python scripts. Nothing there is
referenced by the live site. `deprecated/README.md` explains each and maps old
scripts to their replacements. The tree mirrors the original layout, so anything
restores by reversing its path.

## Deploying

The repo is a GitHub Pages user site: **pushing `main` publishes it.** There is
no build step — the browser loads the ES modules directly, which is also why
`scripts/serve.py` (no-store) is the right dev server.

### What is deliberately not in git

`.gitignore` excludes ~120MB that the site never serves:

| Path | Why |
|---|---|
| `assets/city/raw/` | Raw generator output, ~31MB. Reproducible from `prompts.json`. |
| `deprecated/` | Superseded directions and the retired room, ~70MB. |
| `assets/city/_*.png` | Scratch comparison renders from tuning sessions. |
| `.claude/`, `.agents/`, `conductor/`, `tmp/` | Local tooling, not the site. |

**`deprecated/` has no backup.** It is not reproducible the way `raw/` is, and
it lives on the working machine only. That was a deliberate call to keep a
public website repo lean; if it matters later, push it somewhere else rather
than un-ignoring it.

`vitest.config.js` excludes `deprecated/` too, or the retired room's tests run
and fail against code the site no longer ships.

## Conventions

- Verify with measurements, not by eye. The repo has tools for this:
  `stylecheck.py` (palette drift), `tile.py check` (seams), `scripts/asset_spec.mjs`
  (unfilled slots, all scenes), and `tests/Scale.test.js` /
  `tests/Workshop.test.js` (props in human scale).
- Tests guard invariants that are invisible until they break: no blocker seals
  the roof, every far prop sits on the horizon, every clip the movement code can
  request exists on the sheet.
- Python heredocs in bash break on complex quoting. Write the script to a file
  and run it. The same applies to writing JS files with a bash heredoc — the
  workshop manifest had to be written with an editor tool rather than `cat`.
- A sealed room can fail in a way an open roof cannot: solids arranged into a
  wall you cannot get past. `Workshop.test.js` walks the collision resolver from
  the spawn tile to the far wall for exactly this. Note that the walkway is
  *downstage of the bench* — walking straight in from the door correctly stops
  at the workbench, which is a bench doing its job, not a blocked room.
