import { describe, it, expect, vi } from 'vitest';
import { Camera } from '../js/engine/Camera.js';

const cam = (over = {}) => new Camera({ worldWidth: 3000, viewportWidth: 1000, ...over });

describe('Camera bounds', () => {
    it('never scrolls past either edge of the world', () => {
        const c = cam();
        c.follow(-5000);
        expect(c.x).toBe(0);
        c.follow(99999);
        expect(c.x).toBe(c.maxX);
        expect(c.maxX).toBe(2000);
    });

    it('stays put when the world is narrower than the viewport', () => {
        const c = cam({ worldWidth: 400 });
        expect(c.maxX).toBe(0);
        c.follow(400);
        expect(c.x).toBe(0);
    });
});

describe('Camera deadzone', () => {
    it('ignores small movements near the centre', () => {
        const c = cam({ deadzone: 0.4 });
        c.snapTo(1500);              // centre of view is now 1500
        const before = c.x;
        c.follow(1550);              // well inside the 400px band
        expect(c.x).toBe(before);
    });

    it('follows once the target leaves the band, and only by the overshoot', () => {
        const c = cam({ deadzone: 0.4 });
        c.snapTo(1500);              // x = 1000, centre 1500, band +/-200
        c.follow(1750);              // 50 past the right edge of the band
        expect(c.x).toBeCloseTo(1050, 5);
    });

    it('follows leftward symmetrically', () => {
        const c = cam({ deadzone: 0.4 });
        c.snapTo(1500);
        c.follow(1250);              // 50 past the left edge
        expect(c.x).toBeCloseTo(950, 5);
    });
});

describe('Camera.toScreen', () => {
    it('moves the ground plane one-for-one with the camera', () => {
        const c = cam();
        c.snapTo(1500);
        expect(c.toScreen(1500, 1)).toBeCloseTo(1500 - c.x, 5);
    });

    it('drifts distant layers slower and foreground layers faster', () => {
        const c = cam();
        c.x = 1000;
        const sky = c.toScreen(0, 0);      // pinned
        const far = c.toScreen(0, 0.15);
        const ground = c.toScreen(0, 1);
        const fore = c.toScreen(0, 1.4);
        expect(sky).toBe(0);
        expect(far).toBeGreaterThan(ground);   // moved less => further right
        expect(fore).toBeLessThan(ground);     // moved more => further left
    });
});

describe('centring a world narrower than the viewport', () => {
    /** A room interior: nothing to scroll, so it should sit in the middle. */
    const room = () => new Camera({ worldWidth: 1500, viewportWidth: 1900 });

    it('offsets by half the leftover space', () => {
        expect(room().originX).toBe(200);
    });

    it('centres the room in the window', () => {
        const c = room();
        // The middle of a 1500px room lands in the middle of a 1900px window.
        expect(c.toScreen(750)).toBe(950);
    });

    it('leaves scrolling worlds exactly where they were', () => {
        // The roof is far wider than any viewport, so this must be a no-op for
        // it — otherwise every prop on the roof shifts sideways.
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1200 });
        c.x = 800;
        expect(c.originX).toBe(0);
        expect(c.toScreen(1000)).toBe(200);
        expect(c.renderX).toBe(800);
    });

    it('keeps screen-x to world-x an exact inverse, so clicking the floor works', () => {
        const c = room();
        // This is how click-to-walk converts a click: renderX + clientX.
        const clientX = 640;
        const worldX = c.renderX + clientX;
        expect(c.toScreen(worldX)).toBeCloseTo(clientX, 6);
    });

    it('does not scale the centring offset by a plane parallax', () => {
        // Folding the origin into renderX would multiply it by each plane's
        // parallax, sliding the back wall sideways against its own floor.
        const c = room();
        expect(c.toScreen(750, 0.92)).toBe(950);
        expect(c.toScreen(750, 1.12)).toBe(950);
    });
});

describe('the pixel pipeline', () => {
    it('preserves the field of view exactly at any scale', () => {
        // The whole claim of the low-res buffer: the world is rasterised
        // coarsely and then multiplied back up, so the SAME amount of roof is
        // on screen and nothing had to be re-authored.
        const native = new Camera({ worldWidth: 6200, viewportWidth: 1600 });
        const scaled = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        native.x = scaled.x = 900;

        for (const worldX of [0, 900, 1500, 3000, 6200]) {
            expect(scaled.toScreen(worldX) * 2).toBeCloseTo(native.toScreen(worldX), 9);
        }
    });

    it('scales every parallax plane by the same amount', () => {
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 3 });
        c.x = 1200;
        const native = new Camera({ worldWidth: 6200, viewportWidth: 1600 });
        native.x = 1200;
        for (const p of [0.05, 0.25, 0.55, 1, 1.4]) {
            expect(c.toScreen(2000, p) * 3).toBeCloseTo(native.toScreen(2000, p), 9);
        }
    });

    it('leaves click-to-world conversion alone', () => {
        // Clicks arrive in DISPLAY pixels, which are still world pixels. If the
        // render scale leaked into renderX, every click would land at a
        // fraction of where you aimed.
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        c.x = 800;
        expect(c.renderX).toBe(800);
        expect(c.renderX + 400).toBe(1200);
    });

    it('keeps following and clamping in world pixels', () => {
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 4 });
        const native = new Camera({ worldWidth: 6200, viewportWidth: 1600 });
        c.follow(3000); native.follow(3000);
        expect(c.x).toBe(native.x);
        expect(c.maxX).toBe(native.maxX);
    });

    it('reports the buffer width it implies', () => {
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1600, pixelScale: 2 });
        expect(c.renderWidth).toBe(800);
    });

    it('defaults to native resolution', () => {
        const c = new Camera({ worldWidth: 6200, viewportWidth: 1600 });
        expect(c.pixelScale).toBe(1);
    });
});
