import { describe, it, expect } from 'vitest';
import { intent } from '../js/engine/locomotion.js';

const base = { held: 0, heldZ: 0, target: null, x: 1000, z: 0.5, dt: 1 / 60,
               speed: 300, depthSpeed: 0.55 };

describe('keyboard vs click arbitration', () => {
    it('walks with a held key', () => {
        const r = intent({ ...base, held: 1 });
        expect(r.nextX).toBeGreaterThan(base.x);
        expect(r.wants).toBe(true);
    });

    it('clears a stale click destination the moment a key is pressed', () => {
        // Regression: the destination used to survive, so releasing the key
        // handed control back to click-to-walk and dragged the character back
        // toward wherever they last clicked - reading as a spontaneous turn.
        const r = intent({ ...base, held: 1, target: 200 });
        expect(r.target).toBeNull();
        expect(r.nextX).toBeGreaterThan(base.x);
    });

    it('stands still on key release instead of resuming an old destination', () => {
        const afterKey = intent({ ...base, held: 1, target: 200 });
        const released = intent({ ...base, x: afterKey.nextX, target: afterKey.target });
        expect(released.wants).toBe(false);
        expect(released.nextX).toBe(afterKey.nextX);
    });

    it('clears the destination when depth keys are used too', () => {
        expect(intent({ ...base, heldZ: 1, target: 200 }).target).toBeNull();
    });
});

describe('click-to-walk', () => {
    it('walks toward a destination', () => {
        const r = intent({ ...base, target: 2000 });
        expect(r.nextX).toBeGreaterThan(base.x);
        expect(r.target).toBe(2000);
    });

    it('walks left toward a destination behind it', () => {
        expect(intent({ ...base, target: 200 }).nextX).toBeLessThan(base.x);
    });

    it('clears the destination on arrival so it cannot reassert later', () => {
        const r = intent({ ...base, x: 1000, target: 1002 });
        expect(r.target).toBeNull();
        expect(r.wants).toBe(false);
    });

    it('never overshoots and oscillates around the destination', () => {
        // One frame at 300px/s covers 5px; the destination is 3px away.
        const r = intent({ ...base, x: 1000, target: 1006, dt: 1 / 60, arriveAt: 1 });
        expect(r.nextX).toBeLessThanOrEqual(1006);
        expect(r.nextX).toBeGreaterThanOrEqual(1000);
    });
});

describe('depth movement', () => {
    it('moves into and out of the scene', () => {
        expect(intent({ ...base, heldZ: 1 }).nextZ).toBeGreaterThan(0.5);
        expect(intent({ ...base, heldZ: -1 }).nextZ).toBeLessThan(0.5);
    });

    it('clamps to the floor bounds', () => {
        expect(intent({ ...base, z: 0.99, heldZ: 1, dt: 1 }).nextZ).toBe(1);
        expect(intent({ ...base, z: 0.01, heldZ: -1, dt: 1 }).nextZ).toBe(0);
    });

    it('combines with sideways movement on a diagonal', () => {
        const r = intent({ ...base, held: 1, heldZ: 1 });
        expect(r.nextX).toBeGreaterThan(base.x);
        expect(r.nextZ).toBeGreaterThan(base.z);
        expect(r.wants).toBe(true);
    });
});

describe('idle', () => {
    it('wants nothing with no input and no destination', () => {
        const r = intent(base);
        expect(r).toMatchObject({ nextX: base.x, nextZ: base.z, wants: false, target: null });
    });
});

describe('running', () => {
    it('covers more ground at a higher speed, once up to it', () => {
        // Measured over a sustained walk rather than a single frame. With
        // momentum the first frame is acceleration-limited and is IDENTICAL at
        // both speeds — which is correct, and the old per-frame form of this
        // test could not express it.
        const travel = (speed) => {
            let x = base.x, vx = 0;
            for (let i = 0; i < 120; i++) {
                const r = intent({ ...base, held: 1, x, vx, speed });
                x = r.nextX; vx = r.vx;
            }
            return x - base.x;
        };
        expect(travel(base.speed * 1.85)).toBeGreaterThan(travel(base.speed) * 1.6);
    });

    it('takes the same first step whatever the top speed', () => {
        const walk = intent({ ...base, held: 1, vx: 0 });
        const run = intent({ ...base, held: 1, vx: 0, speed: base.speed * 1.85 });
        expect(run.nextX).toBeCloseTo(walk.nextX, 6);
    });

    it('scales depth movement too, so diagonals do not skew', () => {
        const walk = intent({ ...base, heldZ: 1 });
        const run = intent({ ...base, heldZ: 1, depthSpeed: base.depthSpeed * 1.85 });
        expect(run.nextZ - base.z).toBeCloseTo((walk.nextZ - base.z) * 1.85, 5);
    });
});

describe('momentum', () => {
    const base = { held: 0, heldZ: 0, target: null, x: 100, z: 0.5, dt: 1 / 60,
                   speed: 300, depthSpeed: 0.55 };

    /** Walks with a constant input and returns the velocity trace. */
    const trace = (frames, over = {}) => {
        let x = base.x, vx = over.vx || 0;
        const out = [];
        for (let i = 0; i < frames; i++) {
            const r = intent({ ...base, ...over, x, vx });
            x = r.nextX; vx = r.vx;
            out.push(vx);
        }
        return out;
    };

    it('starts from rest rather than at full speed', () => {
        // The whole point. Instant full speed reads as a cursor being dragged.
        const v = trace(1, { held: 1 });
        expect(v[0]).toBeGreaterThan(0);
        expect(v[0]).toBeLessThan(base.speed);
    });

    it('reaches full speed and holds it', () => {
        const v = trace(40, { held: 1 });
        expect(v[v.length - 1]).toBeCloseTo(base.speed, 5);
    });

    it('coasts to a stop instead of stopping dead', () => {
        let vx = base.speed, x = base.x;
        const seen = [];
        for (let i = 0; i < 20; i++) {
            const r = intent({ ...base, held: 0, x, vx });
            x = r.nextX; vx = r.vx; seen.push(vx);
        }
        expect(seen[0]).toBeGreaterThan(0);        // still moving after release
        expect(seen[0]).toBeLessThan(base.speed);  // but slowing
        expect(seen[seen.length - 1]).toBe(0);     // and eventually stopped
    });

    it('settles to exactly zero, so the walk cycle does not twitch forever', () => {
        let vx = 4, x = base.x;
        for (let i = 0; i < 30; i++) {
            const r = intent({ ...base, held: 0, x, vx });
            x = r.nextX; vx = r.vx;
        }
        expect(vx).toBe(0);
    });

    it('hesitates when you reverse mid-stride', () => {
        // Turning is SLOWER than simply stopping. A higher rate would snap the
        // turnaround, which is right for a platformer and wrong here — the
        // hesitation is the scuff of weight that sells changing your mind.
        const framesToZero = (over) => {
            let vx = base.speed, x = base.x, n = 0;
            while (vx > 0 && n < 400) {
                const r = intent({ ...base, x, vx, ...over });
                x = r.nextX; vx = r.vx; n++;
            }
            return n;
        };
        expect(framesToZero({ held: -1 })).toBeGreaterThan(framesToZero({ held: 0 }));
    });

    it('reports moving while coasting, not just while a key is held', () => {
        // The walk cycle has to keep playing through the coast, or the
        // character slides to a halt in a standing pose.
        const r = intent({ ...base, held: 0, vx: 200 });
        expect(r.wants).toBe(false);
        expect(r.moving).toBe(true);
    });

    it('still lands exactly on a click destination', () => {
        let x = 100, vx = 0, target = 400, guard = 0;
        while (target !== null && guard++ < 600) {
            const r = intent({ ...base, x, vx, target });
            x = r.nextX; vx = r.vx; target = r.target;
        }
        expect(x).toBeCloseTo(400, 3);
        expect(target).toBeNull();
    });

    it('does not let momentum carry it past the destination', () => {
        // Arriving at speed used to be impossible; now the flag has to survive
        // a body with inertia behind it.
        let x = 100, vx = 0, target = 260, overshot = false, guard = 0;
        while (target !== null && guard++ < 600) {
            const r = intent({ ...base, x, vx, target });
            if (r.nextX > 260.001) overshot = true;
            x = r.nextX; vx = r.vx; target = r.target;
        }
        expect(overshot).toBe(false);
    });
});
