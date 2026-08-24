/**
 * The invariants that decide whether the world moves smoothly.
 *
 * None of these are visible in a screenshot. All three were real, all three
 * were found by measuring rather than by looking, and every one of them would
 * come back silently the first time somebody rewrote the draw path for some
 * other reason.
 *
 *   1. Props hold their spacing while the camera pans.
 *   2. The draw order is computed once, not rebuilt every frame.
 *   3. Nothing off-screen pays for the work of being drawn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Camera } from '../js/engine/Camera.js';
import { World } from '../js/engine/World.js';
import { Terrain } from '../js/engine/Terrain.js';
import { Effects } from '../js/engine/Effects.js';
import { city } from '../js/config/city.js';
import { scenes } from '../js/config/scenes.js';

describe('the camera holds the world still while it moves', () => {
    /**
     * Two props at a fixed distance must stay a fixed number of drawn pixels
     * apart, whatever the camera is doing.
     *
     * Sprites are drawn at rounded positions, because a sprite at a fractional
     * one is resampled and its outline crawls. The position being rounded used
     * to include the camera, which moves continuously — so each prop crossed
     * its own rounding threshold at its own moment and the scene shimmered.
     * Measured before the fix: two props 137 world px apart wobbled between 68
     * and 69 pixels apart, changing 1,480 times across a 4,000-frame pan.
     */
    const spacingChanges = (parallax, a, b, steps = 2000) => {
        const cam = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        const gaps = new Set();

        for (let i = 0; i < steps; i++) {
            cam.x = 300 + i * 0.37;   // a slow pan, deliberately not whole pixels
            gaps.add(Math.round(cam.toScreen(b, parallax))
                   - Math.round(cam.toScreen(a, parallax)));
        }
        return gaps;
    };

    it('keeps two props on the ground plane exactly as far apart', () => {
        expect([...spacingChanges(1, 1000, 1137)]).toHaveLength(1);
    });

    it('keeps spacing on every parallax plane', () => {
        for (const plane of city.planes) {
            const gaps = spacingChanges(plane.parallax, 1000, 1400);
            expect([...gaps], `plane ${plane.id} shimmers`).toHaveLength(1);
        }
    });

    it('still scrolls — holding still is not the same as not moving', () => {
        const cam = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        const seen = new Set();
        for (let i = 0; i < 400; i++) {
            cam.x = 300 + i * 2;
            seen.add(Math.round(cam.toScreen(1000, 1)));
        }
        expect(seen.size).toBeGreaterThan(100);
    });

    it('moves the whole plane by one pixel at a time, never a fraction', () => {
        const cam = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        let previous = null;

        for (let i = 0; i < 3000; i++) {
            cam.x = 300 + i * 0.31;
            const at = Math.round(cam.toScreen(1000, 1));
            if (previous !== null) {
                expect(Math.abs(at - previous)).toBeLessThanOrEqual(1);
            }
            previous = at;
        }
    });
});

describe('the draw order is worked out once', () => {
    const build = () => {
        const camera = new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(city, camera);
        world.terrain = new Terrain(city.platforms);
        return { world, camera };
    };

    it('has an entry for every plane', () => {
        const { world } = build();
        for (const plane of city.planes) {
            expect(world.drawOrder.has(plane.id), `no order for ${plane.id}`).toBe(true);
        }
    });

    it('accounts for every prop exactly once', () => {
        const { world } = build();
        const total = [...world.drawOrder.values()].reduce((n, l) => n + l.length, 0);
        expect(total).toBe(city.props.length);
    });

    it('puts the furthest first on the floor, so nearer props overlap', () => {
        const { world } = build();
        const floor = world.drawOrder.get(city.actorPlane);

        for (let i = 1; i < floor.length; i++) {
            expect(world.depthOf(floor[i - 1])).toBeGreaterThanOrEqual(
                world.depthOf(floor[i]));
        }
    });

    it('does not sort or filter the prop list while drawing', () => {
        // The regression this guards: `drawProps` used to rebuild the order for
        // every plane of every frame — eight filters, eight sorts and 1,189
        // comparator calls, sixty times a second, for an answer that cannot
        // change because nothing it reads ever moves.
        const { world } = build();

        const sort = vi.spyOn(Array.prototype, 'sort');
        const filter = vi.spyOn(Array.prototype, 'filter');

        try {
            world.draw(stubContext(), 800, 450);
            expect(sort).not.toHaveBeenCalled();
            expect(filter).not.toHaveBeenCalled();
        } finally {
            sort.mockRestore();
            filter.mockRestore();
        }
    });
});

describe('what is off-screen costs nothing', () => {
    it('draws far fewer props than the world contains', () => {
        const camera = new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(city, camera);
        world.terrain = new Terrain(city.platforms);
        for (const p of city.props) {
            if (p.src) world.images.set(p.src, { width: 64, height: 64 });
        }

        camera.snapTo(3000);
        const ctx = stubContext();
        world.draw(ctx, 800, 450);

        // A 1600px view of a 6,200px roof should reach nothing like all of it.
        expect(ctx.drawn).toBeGreaterThan(0);
        expect(ctx.drawn).toBeLessThan(city.props.length);
    });

    it('never drops a prop that is genuinely on screen', () => {
        // The strong statement, and the one worth having: pan the camera the
        // full length of every scene, and for every frame compare what the
        // engine actually drew against what was actually within the viewport.
        // An optimisation that is fast and occasionally wrong is not an
        // optimisation.
        let onScreen = 0;
        const skipped = [];

        for (const { id, manifest } of scenes) {
            const camera = new Camera({
                worldWidth: manifest.width, viewportWidth: 1600, pixelScale: 2
            });
            const world = new World(manifest, camera);
            world.terrain = new Terrain(manifest.platforms);

            // No images on purpose: every prop then takes the placeholder
            // branch, which is the single point every drawn prop passes.
            const drawn = new Set();
            world.placeholder = (_ctx, prop) => { drawn.add(prop.id); };

            const ctx = stubContext();

            for (let step = 0; step <= 40; step++) {
                camera.snapTo((step / 40) * manifest.width);
                drawn.clear();
                world.draw(ctx, 800, 450);

                const unit = world.unit();
                for (const prop of manifest.props) {
                    const plane = manifest.planes.find(pl => pl.id === prop.plane);
                    if (!plane || prop.repeat) continue;

                    const isFloor = prop.plane === manifest.actorPlane && manifest.deck;
                    const dScale = isFloor ? world.depthScale(world.depthOf(prop)) : 1;
                    const w = (prop.width || prop.height) * unit * dScale;
                    const sx = camera.toScreen(prop.x, plane.parallax);

                    if (!(sx + w / 2 > 0 && sx - w / 2 < 800)) continue;
                    onScreen++;
                    if (!drawn.has(prop.id)) skipped.push(`${id}:${prop.id}`);
                }
            }
        }

        expect(onScreen).toBeGreaterThan(1000);
        expect(skipped.slice(0, 5), 'the cull dropped visible props').toEqual([]);
    });

    it('culls on width, so a prop wider than it is tall still draws', () => {
        // The first version of the cull used the prop's HEIGHT as its margin,
        // which is wrong for anything wide: a laundry line is twice as wide as
        // it is tall and vanished before it reached the edge of the screen.
        const wide = {
            id: 'wide', plane: 'deck', x: 500, y: 0.8, height: 40,
            src: './wide.png'
        };
        const manifest = {
            ...city, props: [wide], backdrops: [], platforms: [], walkway: null
        };

        const camera = new Camera({
            worldWidth: 2000, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(manifest, camera);
        world.terrain = new Terrain([]);
        // Six times as wide as it is tall.
        world.images.set('./wide.png', { width: 600, height: 100 });

        camera.snapTo(500);
        const ctx = stubContext();
        world.draw(ctx, 800, 450);
        expect(ctx.drawn, 'a wide prop at the camera centre was culled').toBeGreaterThan(0);
    });
});

describe('the contact shadow is baked, not built', () => {
    beforeEach(() => {
        window.HTMLCanvasElement.prototype.getContext = () => stubContext();
    });

    it('creates no gradient, however many props stand on the deck', () => {
        // It used to build a fresh radial gradient per prop per frame — the one
        // uncached gradient left in an engine where the blooms, the light pools
        // and the vignette are all baked and blitted. Measured at 24.9
        // allocations per frame on the roof.
        const fx = new Effects();
        const ctx = stubContext();

        for (let i = 0; i < 50; i++) fx.contactShadow(ctx, i * 7, 300, 40 + i, 0.4);

        expect(ctx.gradients).toBe(0);
    });

    it('shares one tile between props of a similar width', () => {
        const fx = new Effects();
        const ctx = stubContext();

        const a = fx.shadowTile(40);
        const b = fx.shadowTile(42);
        const c = fx.shadowTile(400);

        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(ctx.gradients).toBe(0);
    });
});

/** A canvas context that counts rather than rasterising. */
function stubContext() {
    const state = { drawn: 0, gradients: 0 };
    const noop = () => {};

    const real = {
        get drawn() { return state.drawn; },
        get gradients() { return state.gradients; },
        canvas: { width: 800, height: 450 },
        drawImage: () => { state.drawn++; },
        createRadialGradient: () => { state.gradients++; return { addColorStop: noop }; },
        createLinearGradient: () => { state.gradients++; return { addColorStop: noop }; },
        createImageData: (w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
        getImageData: (_x, _y, w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
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

describe('the reveal waits only for what is on screen', () => {
    /**
     * The roof is loaded in two waves: the art in the first frame, then
     * everything else. That is only safe if the deferred half is far enough
     * away that it cannot arrive late in front of anybody.
     *
     * The margin is large — the nearest deferred prop is half a screen from
     * the spawn, which at walking pace is seconds, against a fraction of a
     * second of downloading. This asserts the margin rather than trusting it,
     * because it is the kind of thing a later change to the spawn point or the
     * design viewport would quietly eat.
     */
    // The same radius the loader uses, from the same function.
    const RADIUS = World.firstFrameRadius(city, 1600);

    const split = () => {
        const camera = new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(city, camera);
        return { world, ...world.assetSrcsByDistance(city.actor.place.x, RADIUS) };
    };

    it('defers a real share of the artwork', () => {
        const { near, far, world } = split();
        expect(near.length + far.length).toBe(world.assetSrcs.length);
        expect(far.length).toBeGreaterThan(near.length / 4);
    });

    it('never defers anything that is on screen at the spawn', () => {
        const { far } = split();
        const spawn = city.actor.place.x;

        for (const src of far) {
            const nearest = Math.min(...city.props
                .filter(p => p.src === src)
                .map(p => Math.abs(p.x - spawn)));
            expect(nearest, `${src} was deferred but is on screen`)
                .toBeGreaterThan(RADIUS);
        }
    });

    it('leaves seconds of walking before a deferred prop could be reached', () => {
        const { far } = split();
        const spawn = city.actor.place.x;

        const nearestDeferred = Math.min(...far.map(src => Math.min(...city.props
            .filter(p => p.src === src)
            .map(p => Math.abs(p.x - spawn)))));

        // How long before the character could bring it on screen: the distance
        // to it, less the half-screen already visible, at a full run.
        const seconds = (nearestDeferred - 1600 / 2)
            / (city.walkSpeed * city.runMultiplier);

        expect(seconds, 'a deferred prop is reachable too soon').toBeGreaterThan(1);
    });

    it('always keeps the backdrops, which are behind everything', () => {
        const { near } = split();
        for (const b of city.backdrops || []) {
            expect(near, `backdrop ${b.src} was deferred`).toContain(b.src);
        }
    });
});

describe('a slot that is still arriving is not a slot with no art', () => {
    const world = () => {
        const w = new World(city, new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        }));
        w.terrain = new Terrain(city.platforms);
        return w;
    };

    const prop = city.props.find(p => p.src && Math.abs(p.x - city.actor.place.x) < 400);

    /**
     * Whether THIS prop drew a placeholder.
     *
     * Scoped to one prop on purpose: every other slot in an unloaded world is
     * also unmade and also draws a box, so a bare count says nothing about the
     * one under test.
     */
    const drewBox = (w) => {
        let seen = false;
        w.placeholder = (_ctx, p) => { if (p.id === prop.id) seen = true; };
        w.camera.snapTo(prop.x);
        w.draw(stubContext(), 800, 450);
        return seen;
    };

    it('shows a labelled box for art that was never made', () => {
        const w = world();
        w.missing.add(prop.src);
        expect(drewBox(w)).toBe(true);
    });

    it('shows nothing at all for art that is in flight', () => {
        // The roof loads in waves, so this is a normal state rather than an
        // error. A dashed debug box for a prop that is simply in transit is
        // worse than the half-second of nothing.
        const w = world();
        w.pending.add(prop.src);
        expect(drewBox(w)).toBe(false);
    });

    it('treats a world nobody has loaded as unmade, not in flight', () => {
        // Inferring "in flight" from "not failed" got this backwards: a World
        // that has never been asked to load has no images and no failures, and
        // every one of its slots is unmade rather than arriving.
        expect(drewBox(world())).toBe(true);
    });
});
