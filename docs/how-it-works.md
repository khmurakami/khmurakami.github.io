# How the room works

The whole site is one canvas, drawn by hand-written JavaScript at a pixel
artist's resolution. There is no framework, no build step and no image
assets for the room: every object is painted in code each time the page
loads.

## Pixels

The room is drawn at about 480 art pixels across on a desktop (about 200 on a
phone) and shown at a whole-number scale with smoothing off, so every art
pixel is a crisp square on screen.

Every object is its own sprite (`js/pixel.js`). A sprite is drawn in values
from 0 to 1 and a material, not in colours. When it's painted, each material's
**ramp** turns values into a few fixed colours, with dithering only in the
narrow band where a ramp steps from one colour to the next. Then a
**selective outline** goes round the shape: darker where it meets the
background, lighter or absent where light hits it. Light always comes from the
open door at the upper left.

The rules the room keeps:

- flat, stepped bands of colour, never smooth gradients
- dither only where a ramp steps, never as texture
- no stray single pixels
- things move by whole pixels: a cloud drifts a pixel at a time, a squashed
  sprite repeats or drops whole rows and columns so its dither stays intact

Clouds and plants are volumes (`js/stack.js`) drawn clump by clump at the same
resolution.

## Depth

The room has a real camera, in metres (`R` in `js/scenes/tatami-pixel.js`).
Each layer (sky, clouds, far trees, paddies, the room) sits at a depth and
shifts by whole pixels when you look around: near things more than far ones.
On a computer the mouse moves your head; on a phone the room stays still
under your finger, and tilting the phone moves it a little where the phone
allows.

## Time

`js/roomtime.js` keeps the room on your real clock. The hour sets the sun (or
the moon, at its real phase), the light through the door and how dark the
room is. The date picks the season, and the season repaints the trees, the
paddies, the food on the tray and the hanging scroll. Turning the scroll (or
the season under my name on a phone) changes the season by hand, with a
painted dissolve between the two.

The light is a grade pass over the finished frame: a few stepped colour bands
for night, plus stepped pools of light from the lantern, the laptop screen
and, at night, your finger or mouse.

## Things you can touch

Every interactive thing is declared once in `js/scenes/tatami-pixel.js`:

```js
add('books', {
    order: 3.5,                       // which is on top where two overlap
    sprite: () => bookC,              // what it looks like (or `box` / `area`)
    label: 'books · what I have made',
    act: () => { poke('books'); setTimeout(() => Shelf.open(), 180); }
});
```

`pick(x, y)` finds what a pointer is on: the sprite's own pixels, with thin
parts like aerials trimmed, things behind walls ignored, and some slack for a
finger on a phone. A press lights the thing up, and lifting the finger acts
on it. `poke(id)` plays its little reaction: a hop, a squash, a stretch.

A quick swipe sends a gust, which reaches near things first and far things
later.

## The windows

The terminal (`js/terminal.js`), the bookshelf (`js/shelf.js`) and the crane
game (`js/crane.js`) are each one small canvas drawn in the same pixel style,
with real buttons laid over the drawn ones so they work with a keyboard and a
screen reader. The bookshelf and `projects` in the terminal read my public
repos from the GitHub API, cached for the visit, and fall back to a built-in
list when GitHub can't be reached.

The crane game is deliberately weak, like a real one. It gets kinder after a
run of misses, and remembers what you spent and won in your browser.

## Sound

Everything you hear is synthesized with Web Audio in `js/soundscape.js`: wind,
birds, cicadas, frogs and crickets by the season and hour, the wind chime, the radio's three
stations, and the little sounds things make when you touch them. Sound is off
until you turn it on.

## Making the art

`studio/` holds study pages that paint one subject at a time, and tools that
measure renders. `scripts/check-things.mjs` takes pictures of the room in
headless Chrome:

```bash
node scripts/check-things.mjs 390x844 --look=phone.png            # the room on a phone
node scripts/check-things.mjs --query=hour=22 --look=night.png    # at night
node scripts/check-things.mjs --map --look=map.png                # where a finger would land
```

The pictures are for looking at. The verdict on art is always by eye, next to
the live site.
