"""Reads the world manifests from Python, via Node.

The manifests are ES modules — they are the site's own configuration and they
compute things (the `scatter` helper generates sixty props from one entry), so
they cannot be parsed as data. The Python art tools need them anyway: what
resolution an asset SHOULD be is a fact about where the manifest draws it, and
that is not knowable from the file on disk.

So this asks Node, which is the only thing that can answer, and hands Python a
list of plain dicts. One source of truth, no second copy of the layout in a
format the art pipeline happens to find convenient.

    from manifest_read import props_with_draw_size
    for p in props_with_draw_size(scene="roof"):
        ...
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The render scale the art is authored for.
#
# `pixelScaleFor` in `world-main.js` is `round(displayHeight / referenceHeight *
# 2)`, clamped to 1..4. A 900px-tall design viewport and a 1080p laptop both
# give 2, which makes it the case to author against: at 2, one source pixel
# lands on exactly one buffer pixel and is blitted out as a clean 2x2 square.
#
# The other values stay clean because they are INTEGER multiples of it — at 1
# the art is doubled, at 4 it is halved. Non-integer is the thing that ruins
# pixel art, and there is no non-integer case here.
REFERENCE_PIXEL_SCALE = 2

_SCRIPT = r"""
import { scenes } from './js/config/scenes.js';
import { Ambient } from './js/engine/Ambient.js';
import { CatActor } from './js/engine/Critters.js';
import { existsSync, readFileSync } from 'node:fs';

const PIXEL_SCALE = %d;
const DESIGN_HEIGHT = 900;

// The render buffer's height at the reference viewport. `resize()` sets
// `renderH = ceil(displayHeight / pixelScale)`, and everything sized off the
// viewport — the sky sprites — is sized off THAT, not off the window.
const VIEW_H = DESIGN_HEIGHT / PIXEL_SCALE;

/**
 * Width and height straight out of the file header. No decoding needed.
 *
 * PNG keeps them in the IHDR at a fixed offset. Lossless WebP keeps them in the
 * VP8L chunk as two 14-bit fields, minus one, packed little-endian after a
 * one-byte signature — which is fiddly, and still far cheaper than decoding a
 * few hundred images to ask how big they are.
 */
function imageSize(path) {
    const b = readFileSync(path);

    // PNG: PNG, then IHDR width/height as big-endian 32-bit.
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
        return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }

    // WebP: 'RIFF' .... 'WEBP' then a chunk tag.
    if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF'
        && b.toString('ascii', 8, 12) === 'WEBP') {
        const tag = b.toString('ascii', 12, 16);

        if (tag === 'VP8L') {
            // 0x2f signature, then 14 bits width-1 and 14 bits height-1.
            const bits = b.readUInt32LE(21);
            return {
                w: (bits & 0x3fff) + 1,
                h: ((bits >> 14) & 0x3fff) + 1
            };
        }
        if (tag === 'VP8X') {
            // Extended: 24-bit canvas width-1 and height-1.
            return {
                w: (b.readUIntLE(24, 3)) + 1,
                h: (b.readUIntLE(27, 3)) + 1
            };
        }
        if (tag === 'VP8 ') {
            return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
        }
    }

    throw new Error(`cannot read the dimensions of ${path}`);
}

const out = [];

/**
 * One measured entry.
 *
 * `drawnH` is the height in RENDER-BUFFER pixels. `frameH` is the height of the
 * part of the file that is actually drawn, which differs from the file height
 * for a sprite sheet: a 12x4 sheet is drawn one frame at a time, so its
 * resolution has to be judged per frame.
 */
function add(scene, id, src, drawnH, kind, opts = {}) {
    if (!src) return;
    const file = src.replace(/^\.\//, '');
    if (!existsSync(file)) return;

    const { w: srcW, h: srcH } = imageSize(file);
    const frameH = opts.frameH || srcH;
    const frameW = opts.frameW || srcW;

    out.push({
        scene, id, file, kind,
        plane: opts.plane || null,
        src_w: srcW,
        src_h: srcH,
        frame_w: frameW,
        frame_h: frameH,
        cols: opts.cols || 1,
        rows: opts.rows || 1,
        buffer_h: drawnH,
        buffer_w: drawnH * frameW / frameH,
        ratio: frameH / drawnH
    });
}

for (const { id: scene, manifest } of scenes) {
    const unit = DESIGN_HEIGHT / manifest.referenceHeight / PIXEL_SCALE;
    const deck = manifest.deck;
    const depthScale = (z) => deck
        ? deck.frontScale + (deck.backScale - deck.frontScale) * (z != null ? z : 0.5)
        : 1;

    // ── Props ────────────────────────────────────────────────────
    for (const prop of manifest.props) {
        add(scene, prop.id, prop.src,
            prop.height * unit * depthScale(prop.z),
            'prop', { plane: prop.plane });
    }

    // ── Backdrops ────────────────────────────────────────────────
    // Drawn to fill the buffer's height, so the buffer height IS the drawn
    // height. These are the largest files on the site.
    for (const b of manifest.backdrops || []) {
        // `World.drawBackdrops`: heightFrac of the buffer, or the whole of it.
        const drawH = b.heightFrac ? VIEW_H * b.heightFrac : VIEW_H;
        add(scene, b.id || b.plane || 'backdrop', b.src, drawH, 'backdrop',
            { plane: b.plane });
    }

    // ── The character ────────────────────────────────────────────
    //
    // `World.actorFromEntry`: worldScale = place.height / (baseline - top), and
    // `World.drawActor` multiplies that by unit() and the depth scale. What is
    // drawn is ONE FRAME, so the sheet is judged per frame — resampling it as a
    // whole would be measuring the wrong thing by a factor of twelve.
    if (manifest.actor) {
        const a = manifest.actor;
        const c = a.content;
        const worldScale = a.place.height / (c.baseline - c.top);
        add(scene, 'character', a.src,
            c.frameH * worldScale * unit * depthScale(0.45),
            'actor', {
                plane: 'deck',
                frameW: c.frameW, frameH: c.frameH,
                cols: a.sheet.frameCount, rows: a.sheet.rows || 1
            });
    }

    // ── Sky sprites ──────────────────────────────────────────────
    // Sized off the buffer, by the fractions `Ambient` declares.
    for (const [name, src] of Object.entries(manifest.skySprites || {})) {
        const fraction = name === 'searchlight'
            ? Ambient.SEARCHLIGHT_HEIGHT_FRACTION
            : Ambient.BLIMP_HEIGHT_FRACTION;
        add(scene, name, src, VIEW_H * fraction, 'sky', { plane: 'sky' });
    }

    // ── The cat ──────────────────────────────────────────────────
    // `CatActor.worldScale` is HEIGHTS[pose] / image.height, so the drawn
    // height is simply HEIGHTS[pose] scaled — the file's own resolution
    // cancels out, which is exactly why it was free to be ten times too big.
    const cat = manifest.critters && manifest.critters.cat;
    for (const [pose, src] of Object.entries((cat && cat.poses) || {})) {
        const h = CatActor.HEIGHTS[pose];
        if (!h) continue;
        add(scene, `cat_${pose}`, src, h * unit * depthScale(cat.z), 'critter',
            { plane: 'deck' });
    }
}

process.stdout.write(JSON.stringify(out));
"""


def props_with_draw_size(scene=None, pixel_scale=REFERENCE_PIXEL_SCALE):
    """Every prop that has art, with the size the world draws it at.

    `buffer_h` is the height in RENDER-BUFFER pixels, which is the number that
    matters: the buffer is blitted to the display at a whole-number scale, so a
    source pixel that maps to one buffer pixel is drawn as a clean square, and
    anything else is resampled.

    `ratio` is source pixels per buffer pixel. 1.0 is exact. Above 1 the art is
    being squeezed and detail is thrown away every frame; below 1 it is being
    stretched.
    """
    result = subprocess.run(
        [_node(), "--input-type=module", "-e", _SCRIPT % pixel_scale],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        raise RuntimeError(f"could not read the manifests:\n{result.stderr}")

    props = json.loads(result.stdout)
    if scene:
        props = [p for p in props if p["scene"] == scene]
    return props


def by_file(props):
    """Groups props by source file, keeping the largest use of each.

    A file used by several props — the scattered weeds, both railings, every
    puddle — has one resolution and several drawn sizes. The largest is the one
    its resolution has to satisfy; anything else means upscaling somewhere.
    """
    out = {}
    for p in props:
        cur = out.get(p["file"])
        if cur is None or p["buffer_h"] > cur["buffer_h"]:
            out[p["file"]] = p
    return out


def _node():
    return "node.exe" if sys.platform == "win32" else "node"
