import { describe, it, expect } from 'vitest';
import { Camera } from '../js/engine/Camera.js';
import { World } from '../js/engine/World.js';
import { city } from '../js/config/city.js';

/**
 * Does the composition survive the shape of the window?
 *
 * The camera used to show exactly `window.innerWidth` world pixels. On a laptop
 * that is fine. On a 390px portrait phone it showed SIX PER CENT of the roof,
 * because a narrow screen is nearly as tall as a laptop — so the character came
 * out full size with almost no world beside them, and the site was effectively
 * unusable on the device most people would open it on.
 */

const DESIGN = { width: 1600, height: World.DESIGN_HEIGHT };
const MIN_VIEW_SCALE = 0.42;
const MAX_VIEW_SCALE = 1.6;

/** Mirrors `viewScaleFor` in world-main. */
const viewScaleFor = (w, h) => Math.max(MIN_VIEW_SCALE,
    Math.min(MAX_VIEW_SCALE, Math.min(w / DESIGN.width, h / DESIGN.height)));

const pixelScaleFor = (h) => Math.max(1, Math.min(4,
    Math.round(h / city.referenceHeight * 2)));

/** Builds the world exactly as `resize()` does, for a given screen. */
function screen(w, h) {
    const viewScale = viewScaleFor(w, h);
    const pixelScale = pixelScaleFor(h);
    const cam = new Camera({
        worldWidth: city.width,
        viewportWidth: w / viewScale,
        pixelScale: pixelScale / viewScale
    });
    const world = new World(city, cam);
    return {
        cam, world, viewScale, pixelScale,
        /** World px visible across the screen. */
        span: cam.viewportWidth,
        /** Character height in DISPLAY px. */
        charPx: city.actor.place.height * world.unit() * pixelScale
    };
}

const DEVICES = [
    { name: 'laptop 16:9', w: 1600, h: 900 },
    { name: 'desktop', w: 1920, h: 1080 },
    { name: 'small laptop', w: 1366, h: 768 },
    { name: 'phone landscape', w: 844, h: 390 },
    { name: 'phone portrait', w: 390, h: 844 },
    { name: 'tablet portrait', w: 820, h: 1180 }
];

describe('the world fits any screen', () => {
    it.each(DEVICES)('shows a usable slice of roof on $name', ({ w, h }) => {
        const s = screen(w, h);
        // Six per cent was the bug. A tenth of the roof is the floor of usable.
        expect(s.span / city.width).toBeGreaterThan(0.10);
    });

    it.each(DEVICES)('keeps the character readable on $name', ({ w, h }) => {
        const s = screen(w, h);
        expect(s.charPx).toBeGreaterThan(40);
        // And not so large it fills the screen.
        expect(s.charPx / h).toBeLessThan(0.45);
    });

    it('changes nothing on the viewport it was composed for', () => {
        // The design case must be untouched by all of this.
        const s = screen(1600, 900);
        expect(s.viewScale).toBe(1);
        expect(s.span).toBe(1600);
    });

    it('shows the same amount of world on every 16:9 screen', () => {
        // Composition should not depend on how big the monitor is.
        const spans = [[1280, 720], [1600, 900], [1920, 1080]].map(([w, h]) => screen(w, h).span);
        for (const s of spans) expect(s).toBeCloseTo(spans[0], 0);
    });

    it('scales positions and sizes together', () => {
        // The failure this guards is subtle: scale one and not the other and
        // props keep their size while bunching up, or spread out while
        // shrinking. Either way the roof stops looking like the same place.
        const a = screen(1600, 900);
        const b = screen(800, 450);

        const ratio = a.charPx / b.charPx;
        expect(a.span / b.span).toBeCloseTo(1, 5);        // same world visible
        expect(ratio).toBeCloseTo(1600 / 800, 1);         // sizes track the screen
    });

    it('gives a phone in landscape at least as much roof as a laptop', () => {
        // Turning the phone sideways should be the good experience, and is
        // what most people will do with a side-scroller.
        expect(screen(844, 390).span).toBeGreaterThanOrEqual(screen(1600, 900).span);
    });

    it('never lets the world get so small the character vanishes', () => {
        // Past the floor a narrow screen shows LESS roof rather than a smaller
        // world, which is the better trade.
        const tiny = screen(320, 480);
        expect(tiny.viewScale).toBe(MIN_VIEW_SCALE);
        expect(tiny.charPx).toBeGreaterThan(40);
    });
});

describe('interaction is reachable without a keyboard', () => {
    it('every door and interactable is a Triggers zone, not a key binding', () => {
        // The prompt element is the interact button on touch, and it is driven
        // entirely by the zone the player is standing in. Nothing may be
        // reachable only by a key.
        const zones = World.zonesFrom(city);
        expect(zones.length).toBeGreaterThan(10);
        for (const z of zones) {
            expect(z.label, `${z.id} has no label to tap`).toBeTruthy();
            expect(z.width, `${z.id} has no zone to stand in`).toBeGreaterThan(0);
        }
    });
});
