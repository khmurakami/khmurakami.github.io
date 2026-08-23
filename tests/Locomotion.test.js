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
    it('covers more ground per frame at a higher speed', () => {
        const walk = intent({ ...base, held: 1 });
        const run = intent({ ...base, held: 1, speed: base.speed * 1.85 });
        expect(run.nextX - base.x).toBeCloseTo((walk.nextX - base.x) * 1.85, 4);
    });

    it('scales depth movement too, so diagonals do not skew', () => {
        const walk = intent({ ...base, heldZ: 1 });
        const run = intent({ ...base, heldZ: 1, depthSpeed: base.depthSpeed * 1.85 });
        expect(run.nextZ - base.z).toBeCloseTo((walk.nextZ - base.z) * 1.85, 5);
    });
});
