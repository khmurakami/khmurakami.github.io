import { describe, it, expect } from 'vitest';
import { Critters } from '../js/engine/Critters.js';
import { city } from '../js/config/city.js';
import { workshop } from '../js/config/workshop.js';

const run = (c, seconds, playerX = null, step = 1 / 60) => {
    for (let i = 0; i < Math.round(seconds / step); i++) c.update(step, playerX);
};

const tiny = {
    actorPlane: 'deck',
    props: [
        { id: 'lamp', x: 100, z: 0.5, plane: 'deck', light: { radius: 60, oy: 40 } },
        { id: 'neon', x: 300, plane: 'far', light: { radius: 60, pool: false } },
        { id: 'sign', x: 500, z: 0.5, plane: 'deck', light: { radius: 40, pool: false } },
        { id: 'crate', x: 700, z: 0.5, plane: 'deck' }
    ],
    critters: { mothsPerLight: 2, pigeons: [{ id: 'a', x: 1000, z: 0.3, spread: 60 }] }
};

describe('moths', () => {
    it('are derived from the lights that already exist, not configured', () => {
        // Every lamp in the world got moths the moment this existed, and any
        // lamp added later gets them without touching the manifest.
        expect(new Critters(tiny).moths.length).toBeGreaterThan(0);
    });

    it('only gather at lamps, not at every light source', () => {
        // A neon sign and the moon declare a light too. Nothing circles those,
        // and `pool: false` is already how the manifest says "not a lamp".
        const c = new Critters(tiny);
        for (const m of c.moths) expect(m.x).toBe(100);
    });

    it('ignores lights on planes the player is not standing on', () => {
        // A lamp on a distant rooftop is too far away to have visible insects.
        const c = new Critters(tiny);
        expect(c.moths.some(m => m.x === 300)).toBe(false);
    });

    it('gives the whole roof moths', () => {
        expect(new Critters(city).moths.length).toBeGreaterThan(10);
    });

    it('keeps moving without accumulating anything', () => {
        const c = new Critters(tiny);
        const before = c.moths.length;
        run(c, 30);
        expect(c.moths.length).toBe(before);
    });
});

describe('pigeons', () => {
    it('lives where the manifest says, in flocks', () => {
        const c = new Critters(city);
        expect(c.flocks.map(f => f.id)).toEqual(['arrival', 'garden', 'coop', 'lookout']);
        expect(c.grounded.length).toBeGreaterThan(8);
    });

    it('stays on the ground while nobody is near', () => {
        const c = new Critters(tiny);
        run(c, 20, 0);
        expect(c.grounded.length).toBe(c.flocks[0].birds.length);
    });

    it('scatters when you walk into them', () => {
        const c = new Critters(tiny);
        const all = c.flocks[0].birds.length;
        run(c, 1, 1000);
        expect(c.grounded.length).toBeLessThan(all);
    });

    it('comes back, rather than leaving the roof emptier than it found it', () => {
        // A flock that scatters once and never returns is worse than no flock.
        const c = new Critters(tiny);
        const all = c.flocks[0].birds.length;
        run(c, 1, 1000);
        expect(c.grounded.length).toBeLessThan(all);

        run(c, 8, 5000);   // player walks well away
        expect(c.grounded.length).toBe(all);
    });

    it('stays near home while pecking about', () => {
        const c = new Critters(tiny);
        run(c, 60, 0);
        const f = c.flocks[0];
        for (const b of f.birds) {
            expect(Math.abs(b.x - f.home)).toBeLessThanOrEqual(f.spread * 2.3);
        }
    });

    it('is deterministic, so the roof behaves the same way twice', () => {
        const a = new Critters(tiny, { seed: 5 });
        const b = new Critters(tiny, { seed: 5 });
        run(a, 5, 1000); run(b, 5, 1000);
        expect(a.grounded.length).toBe(b.grounded.length);
    });

    it('puts everyone back on the ground on a scene swap', () => {
        const c = new Critters(tiny);
        run(c, 1, 1000);
        c.reset();
        expect(c.grounded.length).toBe(c.flocks[0].birds.length);
    });

    it('ignores a zero or negative frame delta', () => {
        const c = new Critters(tiny);
        c.update(0, 1000);
        c.update(-1, 1000);
        expect(c.grounded.length).toBe(c.flocks[0].birds.length);
    });
});

describe('interiors', () => {
    it('has no flocks indoors, and does not fall over for the lack of them', () => {
        const c = new Critters(workshop);
        expect(c.flocks).toHaveLength(0);
        expect(() => run(c, 5, 700)).not.toThrow();
    });

    it('still gives an indoor lamp its moths', () => {
        expect(new Critters(workshop).moths.length).toBeGreaterThan(0);
    });
});
