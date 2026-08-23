import { describe, it, expect } from 'vitest';
import { Wind } from '../js/engine/Wind.js';
import { Ambient } from '../js/engine/Ambient.js';
import { Camera } from '../js/engine/Camera.js';

describe('Wind', () => {
    const run = (w, seconds, dt = 1 / 60) => {
        const out = [];
        for (let t = 0; t < seconds / dt; t++) out.push(w.update(dt));
        return out;
    };

    it('gusts rather than oscillating evenly', () => {
        const vals = run(new Wind(), 60).map(Math.abs);
        const mean = vals.reduce((a, b) => a + b) / vals.length;
        const peak = Math.max(...vals);
        // A plain sine peaks at ~1.6x its mean. A gusting wind spends most of
        // its time low and spikes well above that.
        expect(peak / mean).toBeGreaterThan(2.2);
    });

    it('spends most of its time not gusting', () => {
        const w = new Wind();
        let gusting = 0, n = 0;
        for (let t = 0; t < 3600; t++) { w.update(1 / 60); if (w.gust > 0.25) gusting++; n++; }
        expect(gusting / n).toBeLessThan(0.35);
    });

    it('drives every prop from one signal, so the roof leans together', () => {
        const w = new Wind();
        run(w, 12);
        // Two props with different lag still share sign for most of the time.
        let agree = 0;
        for (let i = 0; i < 600; i++) {
            w.update(1 / 60);
            if (Math.sign(w.at(0, 0)) === Math.sign(w.at(0.3, 0.2))) agree++;
        }
        expect(agree / 600).toBeGreaterThan(0.7);
    });

    it('makes stiff props move less than free ones', () => {
        const w = new Wind();
        run(w, 5);
        expect(Math.abs(w.at(0, 0.9))).toBeLessThan(Math.abs(w.at(0, 0)));
    });
});

describe('Ambient', () => {
    it('cycles the plane off and back on rather than looping visibly', () => {
        const a = new Ambient({ worldWidth: 6000, planeEvery: 5 });
        let offSeen = false, onAgain = false;
        for (let i = 0; i < 60 * 120; i++) {
            a.update(1 / 60);
            if (!a.plane.active) offSeen = true;
            else if (offSeen) onAgain = true;
        }
        expect(offSeen && onAgain).toBe(true);
    });

    it('switches windows on their own clocks, never all together', () => {
        const a = new Ambient({ worldWidth: 6000, windowCount: 60 });
        const before = a.windows.map(w => w.on);
        for (let i = 0; i < 60 * 90; i++) a.update(1 / 60);
        const after = a.windows.map(w => w.on);
        const changed = before.filter((v, i) => v !== after[i]).length;
        expect(changed).toBeGreaterThan(0);
        expect(changed).toBeLessThan(before.length);
    });

    it('startles a flock that flies off and expires', () => {
        const a = new Ambient({ worldWidth: 6000 });
        a.startle(1000);
        expect(a.birds.length).toBeGreaterThan(0);
        const x0 = a.birds[0].x;
        for (let i = 0; i < 30; i++) a.update(1 / 60);
        expect(a.birds[0].x).not.toBe(x0);
        for (let i = 0; i < 60 * 10; i++) a.update(1 / 60);
        expect(a.birds).toHaveLength(0);
    });
});

describe('Camera look-ahead', () => {
    const cam = () => new Camera({ worldWidth: 6000, viewportWidth: 1000 });

    it('leads in the direction of travel and drifts back on stopping', () => {
        const c = cam();
        c.snapTo(3000);
        c.leadBy(1);
        for (let i = 0; i < 120; i++) c.updateAhead(1 / 60);
        expect(c.ahead).toBeGreaterThan(50);

        c.leadBy(0);
        for (let i = 0; i < 240; i++) c.updateAhead(1 / 60);
        expect(Math.abs(c.ahead)).toBeLessThan(5);
    });

    it('never leads past the world edge', () => {
        const c = cam();
        c.snapTo(0);
        c.leadBy(-1);
        for (let i = 0; i < 240; i++) c.updateAhead(1 / 60);
        expect(c.renderX).toBeGreaterThanOrEqual(0);

        c.snapTo(6000);
        c.leadBy(1);
        for (let i = 0; i < 240; i++) c.updateAhead(1 / 60);
        expect(c.renderX).toBeLessThanOrEqual(c.maxX);
    });
});
