import { describe, it, expect } from 'vitest';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { Terrain } from '../js/engine/Terrain.js';
import { Walkway } from '../js/engine/Walkway.js';
import { Effects } from '../js/engine/Effects.js';
import { city } from '../js/config/city.js';
import { beforeEach } from 'vitest';

/**
 * Does the world actually land on whole pixels?
 *
 * This cannot be checked by looking at the code, because the failure is one
 * rounding call missing in one draw path out of six, and it shows up as a
 * shimmer on one kind of prop while everything else looks right. So the frame
 * is rendered against a recording context and every destination is measured.
 *
 * Pixel swim — nearest-neighbour sampling at a fractional destination doubling
 * and dropping rows of pixels as a sprite moves — is the single most
 * recognisable tell that something is not really pixel art, and it is invisible
 * in a still screenshot.
 */

// jsdom has no canvas, and Effects bakes its dither tiles into real ones.
beforeEach(() => {
    window.HTMLCanvasElement.prototype.getContext = () => ({
        createImageData: (w, h) => ({ width: w, height: h,
            data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        drawImage: () => {},
        fillRect: () => {},
        save: () => {}, restore: () => {},
        translate: () => {}, scale: () => {}
    });
});

/** A context that records every drawImage destination. */
function recorder() {
    const draws = [];
    const stub = {
        canvas: { width: 800, height: 450 },
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}),
        measureText: () => ({ width: 10 }),
        drawImage: (img, ...rest) => {
            // The 9-argument form passes source rect first; the destination is
            // always the last four.
            const d = rest.length >= 8 ? rest.slice(4) : rest;
            draws.push(d);
        }
    };
    const handler = {
        get: (_t, k) => (k in stub ? stub[k] : () => new Proxy({}, handler)),
        set: () => true
    };
    return { ctx: new Proxy({}, handler), draws };
}

/** Renders one frame of the roof at a given camera position and render scale. */
function frame(scroll, { pixelScale = 2, renderW = 800, renderH = 450 } = {}) {
    const cam = new Camera({
        worldWidth: city.width, viewportWidth: renderW * pixelScale, pixelScale
    });
    cam.x = scroll;

    const w = new World(city, cam);
    w.terrain = new Terrain(city.platforms);
    w.walkway = new Walkway(city.walkway);
    w.fx = new Effects();
    w.playerX = scroll + 400;
    for (const src of w.assetSrcs) w.images.set(src, { width: 64, height: 96 });

    const { ctx, draws } = recorder();
    w.draw(ctx, renderW, renderH);
    return draws;
}

const whole = (n) => Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;

describe('everything lands on whole pixels', () => {
    it.each([0, 700, 1800, 3300, 4600])('at camera %i', (scroll) => {
        const draws = frame(scroll);
        expect(draws.length).toBeGreaterThan(10);

        const bad = draws.filter(d => !d.every(whole));
        expect(bad.length, `${bad.length} of ${draws.length} draws are on fractions,`
            + ` e.g. ${JSON.stringify(bad[0])}`).toBe(0);
    });

    it('stays snapped at fractional camera positions', () => {
        // The camera is eased and almost never lands on a whole number, which
        // is exactly the condition that produces swim.
        const draws = frame(1234.567);
        expect(draws.every(d => d.every(whole))).toBe(true);
    });

    it('never collapses a sprite to zero width', () => {
        // Snapping by rounding both edges can round a sub-pixel sprite away
        // entirely; the floor of one pixel is what stops distant props blinking
        // out of existence.
        //
        // Only sized draws are checked: the baked light tiles use the
        // three-argument drawImage and carry no destination size at all.
        const sized = frame(2000).filter(d => d.length === 4);
        expect(sized.length).toBeGreaterThan(10);
        for (const d of sized) {
            expect(d[2]).toBeGreaterThanOrEqual(1);
            expect(d[3]).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('the render scale does not change what is on screen', () => {
    it('draws the same number of things at 1x and 2x', () => {
        // 1x is native resolution and is the escape hatch. If the two disagree
        // about what is visible, the scale is changing the field of view, which
        // is precisely what it must not do.
        const native = frame(1500, { pixelScale: 1, renderW: 1600, renderH: 900 });
        const scaled = frame(1500, { pixelScale: 2, renderW: 800, renderH: 450 });
        expect(Math.abs(native.length - scaled.length)).toBeLessThanOrEqual(2);
    });

    it('fills the buffer rather than a corner of it', () => {
        // The exact scale equivalence is proved on the camera itself, where it
        // can be asserted to nine places. What is worth checking HERE is the
        // thing that would go wrong at the render level: content laid out for
        // one size while the buffer is another, leaving most of the frame
        // empty or drawing far outside it.
        const draws = frame(1500).filter(d => d.length === 4);
        const xs = draws.map(d => d[0]);
        expect(Math.min(...xs)).toBeLessThan(200);
        expect(Math.max(...xs)).toBeGreaterThan(500);
        expect(Math.max(...xs)).toBeLessThan(1400);
    });
});

describe('dithered lighting is baked, not recomputed', () => {
    it('reuses one tile per distinct lamp instead of rebuilding per frame', () => {
        // Per-pixel dithering every frame for nineteen lamps would be
        // unaffordable; the shape never changes, so it is built once.
        const fx = new Effects();
        const a = fx.poolTile(120, [255, 200, 130]);
        const b = fx.poolTile(120, [255, 200, 130]);
        expect(a).toBe(b);
    });

    it('quantises the radius so a resize cannot mint endless tiles', () => {
        // Dragging a window edge walks the radius through every intermediate
        // value. Bucketed to 4px, so a sweep of forty radii is about ten tiles
        // rather than forty.
        const fx = new Effects();
        for (let r = 100; r < 140; r++) fx.poolTile(r, [255, 200, 130]);
        expect(fx.tiles.size).toBeLessThanOrEqual(12);
        expect(fx.poolTile(100, [255, 200, 130]))
            .toBe(fx.poolTile(101, [255, 200, 130]));
    });

    it('caps the cache, so a long resize drag cannot grow it forever', () => {
        // Bounded is the invariant; the bound itself is a tuning value and is
        // read from the class rather than written out here. It was 48 and is
        // now 128, because the roof's steady-state working set is 45 tiles and
        // a cap three tiles above the working set is a thrash waiting to
        // happen rather than a cache.
        const fx = new Effects();
        for (let r = 8; r < 4000; r += 4) fx.poolTile(r, [255, 200, 130]);
        expect(fx.tiles.size).toBeLessThanOrEqual(Effects.TILE_CACHE_LIMIT);
    });

    it('evicts the least recently used tile, not the oldest', () => {
        // FIFO throws away whatever went in first, which for tiles drawn every
        // frame means throwing away one still in use. The roof would then
        // rebake it next frame, evict another, and so on — a collapse in frame
        // rate with no obvious cause.
        const fx = new Effects();
        const colour = [255, 200, 130];

        const first = fx.poolTile(8, colour);
        for (let i = 1; i < Effects.TILE_CACHE_LIMIT; i++) {
            fx.poolTile(8 + i * 4, colour);
            // Keep reaching for the first one, so it is never the least
            // recently used however much goes in after it.
            fx.poolTile(8, colour);
        }
        fx.poolTile(9000, colour);   // one more, forcing an eviction

        expect(fx.poolTile(8, colour), 'the tile in constant use was evicted')
            .toBe(first);
    });

    it('uses a fixed Bayer matrix rather than noise', () => {
        // A stable threshold matrix is what makes the pattern read as
        // deliberate crosshatch instead of as grain, and stops a light pool
        // crawling frame to frame.
        expect(Effects.BAYER).toHaveLength(16);
        expect(Math.min(...Effects.BAYER)).toBe(0);
        expect(Math.max(...Effects.BAYER)).toBeCloseTo(15 / 16, 10);
    });
});
