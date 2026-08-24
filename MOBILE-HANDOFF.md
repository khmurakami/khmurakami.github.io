# Mobile handoff

A brief for a fresh session. Read `HANDOFF.md` first for the project as a whole;
this covers one job.

## The job

**Mobile support was built but has never been run in a browser.** Not once, on
any device, at any size. Everything below was verified by measurement and by
tests — the maths is checked to nine decimal places and there are 411 tests —
but nobody has looked at this on a phone.

Your job is to verify it on real devices, find what is actually broken, and fix
it. Expect to find things. The list of "known risks" near the bottom is where
I would look first, but it is a starting point, not a survey.

## Run it

```bash
python scripts/serve.py --lan    # dev server on the LAN, prints the phone URL
npm test                         # 411 tests, 31 files
npm run assets                   # unfilled asset slots, per scene
npm run check:assets             # manifest paths that are missing or untracked
npm run check:posts              # the blog index vs the posts' front matter
npm run check:meta               # sitemap and robots.txt vs the site
```

Use `scripts/serve.py`, not `python -m http.server`. Browsers cache ES modules
aggressively and you will spend an hour debugging a stale build.

`--lan` binds every interface and prints the address to type into the phone. It
used to be loopback-only, so the instruction here to "serve on 0.0.0.0" could
not actually be followed with the tool it pointed at.

**Test on a real device as well as devtools emulation** — the things most likely
to be broken here (URL-bar height, audio unlock, tap handling, frame rate) are
exactly the things emulation gets wrong.

## What was changed, and why

### The world no longer sizes itself from the window

It used to show exactly `window.innerWidth` world pixels. On a 390px portrait
phone that was **6% of the roof**: a narrow screen is nearly as *tall* as a
laptop, so the character came out full size with almost no world beside them.

Now the world is composed against a **design viewport of 1600x900** and fitted
to the real one.

- `viewScaleFor(w, h)` in `js/world-main.js` returns the fit, clamped to
  `[0.42, 1.6]`.
- It is folded into **`camera.pixelScale`**, which is divided by in exactly two
  places: `Camera.toScreen` and `World.unit()`.
- That single point of division is what makes positions and sizes move
  *together*. Scale one without the other and props keep their size while
  bunching up, or spread out while shrinking. `tests/Responsive.test.js` guards
  this specifically.

`World.unit()` **takes no argument any more**. It used to take the buffer
height, and that is precisely what tied the world's scale to window height
alone — the root of the phone problem.

Expected results, all from `tests/Responsive.test.js`:

| screen | world visible | character height |
|---|---|---|
| 1600x900 laptop | 1600px (26%) | 20% of screen height |
| 1920x1080 | 1600px (26%) | 20% |
| 1366x768 | 1601px (26%) | 20% |
| 844x390 phone landscape | 1948px (31%) | 20% |
| 390x844 phone portrait | 929px (15%) | 9% |

**On 16:9 this is identical to the old behaviour to the last decimal.** If you
change the fit, check that first — a mobile fix that quietly alters the desktop
composition is a bad trade.

### Touch interaction

`E` was the only way to open anything, so every door, panel, the terminal and
the guestbook were unreachable on a phone. Half the site, silently.

- **The prompt is the interact button.** `#door-prompt` takes a click. It
  already appears exactly when there is something to interact with and it is
  already a DOM element, so the affordance lands where the player is looking.
- Its text reads `tap` instead of `press E` where there is no keyboard.
- Detection is `matchMedia('(hover: none)')`, **not** sniffing for touch events,
  so a touchscreen laptop keeps its keyboard hints. `document.body` gets a
  `.touch` class and `#hint` is rewritten.
- Walking is the existing click-to-walk: a tap on the roof sets both x and
  depth (depth comes from `clientY`).
- `touch-action: manipulation` and `overscroll-behavior: none` stop the browser
  taking gestures. **Pinch zoom is deliberately not blocked** — `manipulation`
  already kills the double-tap zoom that would fight the game, and disabling the
  rest takes zoom from people who need it. Please keep it that way.

### Two mobile bugs already fixed, unverified

- `height: 100vh` on the canvas. On mobile Safari and Chrome `100vh` is the
  *large* viewport height, so the canvas ran under the URL bar and the bottom of
  the world was cut off. Now `100vh` then `100dvh`, the second winning where
  supported.
- `resize()` reallocated both canvases and discarded every baked dither tile.
  Mobile fires resize constantly as the URL bar slides and when a keyboard
  opens, so it now bails when the size is unchanged.

## Known risks — where I would look first

Ordered by how likely I think they are.

1. **Frame rate.** 224 props across 7 parallax planes, dithered light tiles,
   steam, moths, pigeons. Still never profiled on a PHONE — but no longer
   unmeasured. `npm run profile` counts what a frame asks for, and the frame
   has been cut hard since this was written:

   | per frame, roof | before | after |
   |---|---|---|
   | `filter` / `sort` calls | 8 / 8 | 0 / 0 |
   | comparator calls | 1,189 | 0 |
   | array elements walked | 1,948 | 0 |
   | gradients allocated | 25.9 | 0 |
   | draw calls | 173 | 167 |
   | ms in the draw path | 0.247 | 0.184 |

   The draw order is computed once instead of per plane per frame, the contact
   shadow is a baked tile instead of a fresh radial gradient per prop, props are
   culled before the terrain and wind lookups rather than after, and the sway
   phase is no longer derived by splitting a string into characters on every
   frame. Those milliseconds are Node with no rasterisation — the point is that
   the work removed was all JavaScript and garbage, which is exactly what a
   phone is worst at.
2. **The URL bar.** Even with `dvh`, the show/hide transition changes
   `innerHeight` mid-scroll. Watch for the world jumping or the buffer
   thrashing.
3. **Audio unlock on iOS.** `audio.resume()` is bound to the first `keydown` or
   `pointerdown` with `{ once: true }`. iOS is strict about which gestures
   count; verify sound actually starts.
4. **The terminal panel.** It has a text input. Focusing it opens the keyboard,
   which resizes the viewport, which resizes the world behind the panel. Likely
   janky at best.
5. **Tap versus drag.** Tap-to-walk uses `click`. A tap with any drag in it may
   not fire one. If walking feels unreliable, that is why.
6. **Portrait is the weak case** — 9% character height, 15% of the roof. It is
   usable, not good. Landscape is genuinely good and shows more roof than a
   laptop. Consider whether portrait deserves a rotate hint.
7. **`orientationchange`** fires before iOS updates dimensions in some versions.
   A resize on the next frame may be needed.
8. **Panels** are `min(680px, 92vw)` and `max-height: 82vh` — probably fine, but
   the guestbook form and the blog stack have not been seen on a narrow screen.

## Rules this project holds to

Please keep to these; they are why the codebase is in the state it is.

- **The manifest is the contract.** `js/config/city.js` and the two interiors
  declare every prop. The engine draws a labelled dashed box for any slot
  without art. Do not hardcode world content in the engine.
- **And `js/config/actions.js` is the other half of it.** What an action DOES is
  a registry entry, not a case in the loop's switch — which is what it used to
  be, so an action nobody had registered failed with a console line and a prop
  that did nothing when you pressed E. `tests/Actions.test.js` now walks every
  scene and fails if any declared action has no handler.
- **One scene registry.** `js/config/scenes.js`. The loop, the router and both
  asset checks read it, so a new room is checked from the moment it exists.
- **Measure, do not eyeball.** Every significant decision here came from a
  number. `npm run assets`, `stylecheck.py`, and the test suite are the tools.
- **Tests guard invariants that are invisible until they break.** Several caught
  real bugs this week: a sealed roof, three props that were never drawn, a
  sunken viewpoint you could enter and not leave. If a test fails, work out what
  it is protecting before changing it — twice it turned out the *test* was
  measuring the wrong thing, and both times the fix was to express the invariant
  better rather than to loosen the number.
- **CI runs on every push, and a push to `main` is a deploy.** GitHub Pages
  publishes `main` directly. There is no staging.
- Python heredocs in bash break on complex quoting. Write the script to a file.

## Done since this was written

The audit's list has been worked through. Briefly, so you are not surprised by
what you find:

- **Asset compression — done, 1.8MB to 899KB (50%).** `npm run images`. Note
  that the 71% figure recorded here came from octree quantisation, which is
  *lossy*: the script now verifies every file draws identically before replacing
  it, and octree fails that check. 50% is what the lossless version is worth.
- **`og:image`, `apple-touch-icon` — done.** Generated from the master rooftop
  plate by `scripts/make_share_images.py`.
- **`robots.txt`, `sitemap.xml` — done, and generated** from the post index by
  `scripts/build_site_meta.mjs`, with a CI drift check. **`404.html` — done.**
- **Global error handler — done.** `BootScreen.crash()` brings the screen back
  over a frozen frame; the loop is wrapped, and `error` /`unhandledrejection`
  are both handled. `fail()` alone could not do it — it deliberately does
  nothing once the boot screen has gone.
- **`assets/resume.pdf` — resolved honestly.** `site.resumeFile` is `null`, the
  panel says there is nothing to download rather than offering a 404, and
  `check_assets.mjs` will hold the path to existing the moment you set one.

## Loading

Measured with `npm run budget`, modelled on a phone at 120ms round trip:

| | before | after |
|---|---|---|
| time to reveal | 1,276 ms | **459 ms** |
| requests before reveal | 159 | **100** |
| bytes before reveal | 533 KB | **268 KB** |
| module round trips | 5 | **1** |
| served artwork | 420 KB PNG | **291 KB WebP** |

The module graph is declared in the head with `modulepreload` so the browser
fetches it in one go instead of discovering it five levels deep; the interiors
and the far half of the roof arrive after the reveal rather than before it.

Worth checking on a real connection — the byte and request counts are exact but
the milliseconds are a model.

## Still open

- **Nothing on this page has been run on a phone.** That is still the job.
  The frame is much cheaper than it was, but cheaper is not the same as fast
  enough, and none of the touch handling has been touched by a finger.
