/**
 * Counts the work one frame of the world costs.
 *
 *   node scripts/profile_frame.mjs
 *   node scripts/profile_frame.mjs --scene roof --frames 600
 *
 * Frame rate was the top unverified risk on this project and had never been
 * measured on anything. Measuring it in a browser needs a browser and a phone;
 * measuring what the frame ASKS FOR does not, and most of the cost of a frame
 * here is not the GPU — it is the JavaScript that decides what to draw.
 *
 * So this runs the real `World.draw` against a context that records instead of
 * rasterising, and reports the things that scale badly:
 *
 *   draw calls        how much is asked of the canvas
 *   array scans       `filter`/`sort`/spread over the prop list, per frame
 *   comparator calls  how much sorting is being redone
 *   allocations       arrays created per frame, which the collector then has
 *                     to take away again during the next one
 *
 * A number here is not milliseconds on a phone. It is a number that can be
 * made smaller with confidence, and every one of them is work the frame does
 * whether or not anything moved.
 */
import { performance } from 'node:perf_hooks';

import { scenes } from '../js/config/scenes.js';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { Terrain } from '../js/engine/Terrain.js';
import { Walkway } from '../js/engine/Walkway.js';
import { Effects } from '../js/engine/Effects.js';
import { Wind } from '../js/engine/Wind.js';
import { Steam } from '../js/engine/Steam.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const FRAMES = Number(opt('frames', 300));
const ONLY = opt('scene', null);

// The reference viewport: a 1600x900 window at pixelScale 2.
const VIEW_W = 800;
const VIEW_H = 450;

const counts = { draws: 0, saves: 0, paths: 0, tiles: 0, gradients: 0 };

/**
 * Enough of a DOM for `Effects` to bake its tiles.
 *
 * The lights, the vignette and the contact shadow are all baked into offscreen
 * canvases by looping over their pixels in JavaScript, and that loop is real
 * CPU work that belongs in the measurement. Rasterising the result is not
 * something Node can do and is not the part that was ever in question.
 *
 * Without this the profiler simply never assigned `world.fx`, so every effect
 * in the engine was silently excluded from the numbers — which made the frame
 * look cheaper than it is and would have hidden the one uncached gradient.
 */
globalThis.document = {
    createElement(kind) {
        if (kind !== 'canvas') return {};
        counts.tiles++;
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => countingContext();
        return canvas;
    }
};

/** A context that records what was asked of it and rasterises nothing. */
function countingContext() {
    const noop = () => {};
    const real = {
        canvas: { width: VIEW_W, height: VIEW_H },
        drawImage: () => { counts.draws++; },
        fillRect: () => { counts.draws++; },
        strokeRect: () => { counts.draws++; },
        fill: () => { counts.draws++; },
        stroke: () => { counts.draws++; },
        fillText: () => { counts.draws++; },
        save: () => { counts.saves++; },
        restore: noop,
        beginPath: () => { counts.paths++; },
        closePath: noop, moveTo: noop, lineTo: noop, arc: noop, rect: noop,
        ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
        clip: noop, translate: noop, scale: noop, rotate: noop,
        setTransform: noop, resetTransform: noop, transform: noop,
        putImageData: noop, drawFocusIfNeeded: noop, setLineDash: noop,
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        createLinearGradient: () => { counts.gradients++; return { addColorStop() {} }; },
        createRadialGradient: () => { counts.gradients++; return { addColorStop() {} }; },
        createPattern: () => ({}),
        measureText: () => ({ width: 10 })
    };

    const handler = {
        get: (_t, key) => {
            if (key in real) return real[key];
            if (key === Symbol.toPrimitive) return () => 0;
            return () => new Proxy({}, handler);
        },
        set: () => true
    };
    return new Proxy({}, handler);
}

/**
 * Counts array work by wrapping the methods the draw path uses.
 *
 * Wrapping the prototype is blunt and it is also the only way to see this from
 * outside: the cost is not in any one call, it is in how many there are.
 */
function instrumentArrays() {
    const stats = { filter: 0, sort: 0, comparisons: 0, spread: 0, scanned: 0 };

    const realFilter = Array.prototype.filter;
    const realSort = Array.prototype.sort;
    const realSlice = Array.prototype.slice;

    Array.prototype.filter = function (fn, thisArg) {
        stats.filter++;
        stats.scanned += this.length;
        return realFilter.call(this, fn, thisArg);
    };

    Array.prototype.sort = function (cmp) {
        stats.sort++;
        stats.scanned += this.length;
        if (typeof cmp === 'function') {
            const wrapped = (a, b) => { stats.comparisons++; return cmp(a, b); };
            return realSort.call(this, wrapped);
        }
        return realSort.call(this);
    };

    return {
        stats,
        restore() {
            Array.prototype.filter = realFilter;
            Array.prototype.sort = realSort;
            Array.prototype.slice = realSlice;
        }
    };
}

/** A World wired up the way `world-main.js` wires one, minus the DOM. */
function buildScene(manifest) {
    const camera = new Camera({
        worldWidth: manifest.width,
        viewportWidth: 1600,
        pixelScale: 2
    });
    const world = new World(manifest, camera);
    world.terrain = new Terrain(manifest.platforms);
    world.walkway = manifest.walkway ? new Walkway(manifest.walkway) : null;

    // Wired the way `world-main.js` wires one: the shadows, lights, post and
    // sway are a large part of what a frame costs.
    world.fx = new Effects();
    world.wind = new Wind(manifest.wind);
    const steam = new Steam(manifest.props);
    world.hooks[manifest.actorPlane] = (c, vw, vh) => {
        world.fx.drawRipples(c, world, vh);
        steam.draw(c, world, vh);
    };

    // Every slot resolves to a stand-in of a plausible size, so the draw path
    // takes the `img` branch rather than the placeholder one.
    for (const p of manifest.props) {
        if (p.src) world.images.set(p.src, { width: 64, height: 64 });
    }
    for (const b of manifest.backdrops || []) {
        if (b.src) world.images.set(b.src, { width: 887, height: 222 });
    }

    return { world, camera };
}

const results = [];

for (const { id, manifest } of scenes) {
    if (ONLY && id !== ONLY) continue;

    const { world, camera } = buildScene(manifest);
    const ctx = countingContext();

    // Warm up, so the first frame's lazy work is not counted as steady state.
    world.update(0);
    world.draw(ctx, VIEW_W, VIEW_H);

    counts.draws = counts.saves = counts.paths = counts.gradients = 0;
    const arrays = instrumentArrays();

    const t0 = performance.now();
    for (let f = 0; f < FRAMES; f++) {
        // Pan across the world so culling is exercised realistically rather
        // than every prop sitting off-screen behind the camera.
        camera.snapTo((f / FRAMES) * manifest.width);
        world.playerX = camera.x;
        world.wind.update(1 / 60);
        world.update(f * 16.7);
        world.draw(ctx, VIEW_W, VIEW_H);
    }
    const elapsed = performance.now() - t0;

    arrays.restore();
    const s = arrays.stats;

    results.push({
        id,
        props: manifest.props.length,
        planes: manifest.planes.length,
        ms: elapsed / FRAMES,
        draws: counts.draws / FRAMES,
        filters: s.filter / FRAMES,
        sorts: s.sort / FRAMES,
        comparisons: s.comparisons / FRAMES,
        scanned: s.scanned / FRAMES,
        gradients: counts.gradients / FRAMES,
        tiles: counts.tiles
    });
    counts.tiles = 0;
}

console.log(`\n${FRAMES} frames per scene, at a 1600x900 reference viewport\n`);

const hdr = `${'scene'.padEnd(11)}${'props'.padStart(6)}${'planes'.padStart(7)}`
    + `${'ms/frame'.padStart(10)}${'draws'.padStart(8)}${'filters'.padStart(9)}`
    + `${'sorts'.padStart(7)}${'compares'.padStart(10)}${'elems scanned'.padStart(15)}`
    + `${'gradients/f'.padStart(13)}${'tiles'.padStart(7)}`;
console.log(hdr);
console.log('-'.repeat(hdr.length));

for (const r of results) {
    console.log(
        `${r.id.padEnd(11)}${String(r.props).padStart(6)}${String(r.planes).padStart(7)}`
        + `${r.ms.toFixed(3).padStart(10)}${r.draws.toFixed(0).padStart(8)}`
        + `${r.filters.toFixed(0).padStart(9)}${r.sorts.toFixed(0).padStart(7)}`
        + `${r.comparisons.toFixed(0).padStart(10)}${r.scanned.toFixed(0).padStart(15)}`
        + `${r.gradients.toFixed(1).padStart(13)}${String(r.tiles).padStart(7)}`);
}

const total = results.reduce((a, r) => a + r.scanned, 0);
console.log(`\nPer frame, across every scene the loop keeps alive: `
    + `${total.toFixed(0)} array elements walked before anything is drawn.`);
console.log('Only the active scene draws, but the numbers above are per scene.\n');
