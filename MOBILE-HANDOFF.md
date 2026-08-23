# Mobile handoff

A brief for a fresh session. Read `HANDOFF.md` first for the project as a whole;
this covers one job.

## The job

**Mobile support was built but has never been run in a browser.** Not once, on
any device, at any size. Everything below was verified by measurement and by
tests — the maths is checked to nine decimal places and there are 358 tests —
but nobody has looked at this on a phone.

Your job is to verify it on real devices, find what is actually broken, and fix
it. Expect to find things. The list of "known risks" near the bottom is where
I would look first, but it is a starting point, not a survey.

## Run it

```bash
python scripts/serve.py 8000     # dev server, sends no-store
npm test                         # 358 tests, 27 files
npm run assets                   # unfilled asset slots, per scene
node scripts/check_assets.mjs    # manifest paths that are missing or untracked
```

Use `scripts/serve.py`, not `python -m http.server`. Browsers cache ES modules
aggressively and you will spend an hour debugging a stale build.

To reach it from a phone on the same network, serve on `0.0.0.0` and hit the
machine's LAN IP. **Test on a real device as well as devtools emulation** — the
things most likely to be broken here (URL-bar height, audio unlock, tap
handling, frame rate) are exactly the things emulation gets wrong.

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
   steam, moths, pigeons. Never profiled on a phone. If it drags, the cheapest
   real win is culling props by x before the depth sort in `World.drawProps`.
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

## Still open, unrelated to mobile

From the audit, in rough order of value:

- **Asset compression.** Measured: 1.22MB of roof art becomes **350KB**, a 71%
  saving, from `optimize=True` plus octree quantisation. The assets are already
  64-colour so there is no visual cost.
- **No `og:image`.** OG tags exist but there is no preview image, so shared
  links render as a grey box.
- **No global error handler.** If the loop throws, the last frame freezes and
  the visitor gets no explanation. `BootScreen.fail()` already exists and could
  be reused.
- `404.html`, `robots.txt`, `sitemap.xml`, `apple-touch-icon`.
- **`assets/resume.pdf` does not exist.** The clipboard panel currently tells
  visitors so.
