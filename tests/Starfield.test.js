import { describe, it, expect } from 'vitest';
import { Starfield } from '../js/engine/Starfield.js';
import { Camera } from '../js/engine/Camera.js';

const field = (over = {}) => new Starfield({ worldWidth: 6000, count: 100, seed: 7, ...over });

describe('Starfield', () => {
    it('is deterministic for a given seed, so the sky never reshuffles', () => {
        const a = field().stars.map(s => [s.x, s.y]);
        const b = field().stars.map(s => [s.x, s.y]);
        expect(a).toEqual(b);
    });

    it('produces a different sky for a different seed', () => {
        expect(field({ seed: 7 }).stars[0].x).not.toBe(field({ seed: 8 }).stars[0].x);
    });

    it('spreads stars across the whole world', () => {
        const xs = field().stars.map(s => s.x);
        expect(Math.min(...xs)).toBeLessThan(600);
        expect(Math.max(...xs)).toBeGreaterThan(5400);
    });

    it('gives each star its own twinkle, so the field never pulses as one', () => {
        const phases = new Set(field().stars.map(s => s.phase.toFixed(4)));
        expect(phases.size).toBeGreaterThan(90);
    });

    it('draws nothing at zero intensity', () => {
        let calls = 0;
        const ctx = { save: () => {}, restore: () => {}, beginPath: () => { calls++; },
                      arc: () => {}, fill: () => {}, set globalAlpha(v) {}, set fillStyle(v) {} };
        field().draw(ctx, new Camera({ worldWidth: 6000, viewportWidth: 800 }), 800, 600, 0, 0);
        expect(calls).toBe(0);
    });

    it('culls stars outside the viewport', () => {
        let drawn = 0;
        const ctx = { save: () => {}, restore: () => {}, beginPath: () => { drawn++; },
                      arc: () => {}, fill: () => {}, set globalAlpha(v) {}, set fillStyle(v) {} };
        const cam = new Camera({ worldWidth: 6000, viewportWidth: 800 });
        field({ count: 400 }).draw(ctx, cam, 800, 600, 0, 1);
        expect(drawn).toBeLessThan(400);
    });
});
