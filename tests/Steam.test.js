import { describe, it, expect } from 'vitest';
import { Steam } from '../js/engine/Steam.js';
import { city } from '../js/config/city.js';

const props = [
    { id: 'vent', x: 100, z: 0.8, plane: 'deck', steam: { rate: 2, ttl: 2 } },
    { id: 'stack', x: 500, plane: 'far', steam: true },
    { id: 'crate', x: 300, z: 0.4, plane: 'deck' }
];

const run = (s, seconds, wind = 0, step = 1 / 60) => {
    for (let i = 0; i < Math.round(seconds / step); i++) s.update(step, wind);
};

describe('Steam', () => {
    it('takes its emitters from the manifest, not from a list in here', () => {
        // A vent that gets moved has to take its plume with it, which only
        // works if the prop is the thing that declares it.
        const s = new Steam(props);
        expect(s.emitters.map(e => e.id)).toEqual(['vent', 'stack']);
    });

    it('accepts `steam: true` and fills in the defaults', () => {
        const stack = new Steam(props).emitters.find(e => e.id === 'stack');
        expect(stack.rate).toBeGreaterThan(0);
        expect(stack.ttl).toBeGreaterThan(0);
    });

    it('emits over time rather than all at once', () => {
        const s = new Steam(props);
        expect(s.puffs).toHaveLength(0);
        run(s, 0.6);
        const early = s.puffs.length;
        expect(early).toBeGreaterThan(0);
        run(s, 1.0);
        expect(s.puffs.length).toBeGreaterThanOrEqual(early);
    });

    it('retires puffs when they expire, so the roof does not fill with fog', () => {
        const s = new Steam([props[0]]);
        run(s, 2);
        const mid = s.puffs.length;
        expect(mid).toBeGreaterThan(0);

        // Stop emitting and let everything live out its life.
        s.emitters = [];
        run(s, 6);
        expect(s.puffs).toHaveLength(0);
    });

    it('never exceeds its cap however long it runs', () => {
        // An emitter cap is the difference between atmosphere and a memory leak
        // that only shows up on a tab left open.
        const s = new Steam(props, { max: 12 });
        run(s, 120);
        expect(s.puffs.length).toBeLessThanOrEqual(12);
    });

    it('is deterministic — the same roof puffs the same way twice', () => {
        // A world that behaves differently on every load cannot be tested and
        // reads as unstable rather than as alive.
        const a = new Steam(props, { seed: 7 });
        const b = new Steam(props, { seed: 7 });
        run(a, 3); run(b, 3);
        expect(a.puffs.length).toBe(b.puffs.length);
        expect(a.puffs.map(p => p.ttl)).toEqual(b.puffs.map(p => p.ttl));
    });

    it('carries the wind it has actually lived through', () => {
        // Integrated rather than sampled, so the top of a plume lags the bottom
        // instead of the whole column snapping sideways together.
        const s = new Steam([props[0]]);
        run(s, 0.5, 1);
        const older = s.puffs[0];
        run(s, 0.5, 1);
        const newer = s.puffs[s.puffs.length - 1];
        expect(Math.abs(older.carried)).toBeGreaterThan(Math.abs(newer.carried));
    });

    it('ignores a zero or negative frame delta', () => {
        const s = new Steam(props);
        s.update(0, 0);
        s.update(-1, 0);
        expect(s.puffs).toHaveLength(0);
    });

    it('ages a puff from 0 to 1 across its life', () => {
        expect(Steam.ageOf({ life: 0, ttl: 4 })).toBe(0);
        expect(Steam.ageOf({ life: 2, ttl: 4 })).toBeCloseTo(0.5, 5);
        expect(Steam.ageOf({ life: 9, ttl: 4 })).toBe(1);
    });
});

describe('the roof actually smokes', () => {
    it('vents on the deck and chimneys on the horizon both emit', () => {
        const s = new Steam(city.props);
        const planes = new Set(s.emitters.map(e => e.plane));
        expect(planes.has('deck'), 'nothing on the roof itself').toBe(true);
        expect(planes.has('far'), 'nothing on the skyline').toBe(true);
    });

    it('only puts plumes on things that would produce one', () => {
        const s = new Steam(city.props);
        for (const e of s.emitters) {
            expect(e.id, `${e.id} does not look like a vent or a chimney`)
                .toMatch(/vent|duct|chimney|stack/);
        }
    });
});

describe('leaving a scene', () => {
    it('drops the plumes of the room you walk out of', () => {
        // Only the active scene is updated, so anything left in flight hangs
        // frozen mid-air until the tab closes, then ages out in one batch on
        // your way back in.
        const s = new Steam(props);
        run(s, 2);
        expect(s.puffs.length).toBeGreaterThan(0);

        s.clear();
        expect(s.puffs).toHaveLength(0);
    });

    it('does not hold a whole interval before puffing again on return', () => {
        const s = new Steam(props);
        run(s, 2);
        s.clear();
        run(s, 0.6);
        expect(s.puffs.length).toBeGreaterThan(0);
    });
});
