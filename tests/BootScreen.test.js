import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BootScreen } from '../js/engine/BootScreen.js';

const markup = () => {
    document.body.innerHTML = `
        <div id="boot" aria-busy="true">
            <div class="boot-bar" data-boot-bar></div>
            <p class="boot-status" data-boot-status>waking the city</p>
        </div>`;
    return document.getElementById('boot');
};

const make = (over = {}) => new BootScreen({ root: markup(), cells: 10, ...over });
const lit = (b) => b.cells.filter(c => c.classList.contains('lit')).length;

describe('BootScreen', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('builds the bar out of the requested number of windows', () => {
        expect(make().cells).toHaveLength(10);
    });

    it('shows nothing until a total is known', () => {
        // A bar that guesses, then jumps backwards when the real total lands,
        // is worse than a bar that waits.
        const b = make();
        b.step();
        b.step();
        expect(b.progress).toBe(0);
        expect(lit(b)).toBe(0);
    });

    it('lights windows in step with the real count', () => {
        const b = make();
        b.begin(10);
        for (let i = 0; i < 5; i++) b.step();
        expect(b.progress).toBeCloseTo(0.5, 5);
        expect(lit(b)).toBe(5);
    });

    it('reports the count for anyone who cannot see the bar', () => {
        const b = make();
        b.begin(120);
        b.step();
        expect(b.statusEl.textContent).toBe('1 / 120');
    });

    it('never overruns, however many extra steps arrive', () => {
        const b = make();
        b.begin(4);
        for (let i = 0; i < 40; i++) b.step();
        expect(b.progress).toBe(1);
        expect(lit(b)).toBe(10);
    });

    it('fills the bar before it leaves', () => {
        // Some slots are legitimately missing and settle as errors, so the bar
        // can finish short. Leaving on a partial bar reads as a failure.
        const b = make();
        b.begin(10);
        b.step();
        b.done();
        expect(lit(b)).toBe(10);
    });

    it('clears aria-busy and fades out when done', () => {
        const b = make();
        b.begin(1);
        b.done();
        expect(b.root.getAttribute('aria-busy')).toBe('false');
        expect(b.root.classList.contains('gone')).toBe(true);
    });

    it('leaves the DOM once the fade has actually run', () => {
        const b = make();
        b.done();
        expect(b.root.hidden).toBe(false);
        b.root.dispatchEvent(new Event('transitionend'));
        expect(b.root.hidden).toBe(true);
    });

    it('gives up waiting for a transition that never fires', () => {
        vi.useFakeTimers();
        const b = make();
        b.done();
        vi.advanceTimersByTime(1300);
        expect(b.root.hidden).toBe(true);
        vi.useRealTimers();
    });

    it('goes straight out under reduced motion', () => {
        const b = make({ reducedMotion: true });
        b.done();
        expect(b.root.hidden).toBe(true);
    });

    it('is idempotent, so a second reveal cannot resurrect it', () => {
        const b = make({ reducedMotion: true });
        b.done();
        b.root.hidden = false;
        b.done();
        expect(b.root.hidden).toBe(false);   // the second call did nothing
    });

    it('stops updating once it is finished', () => {
        const b = make({ reducedMotion: true });
        b.begin(10);
        b.done();
        b.step();
        expect(b.statusEl.textContent).not.toBe('1 / 10');
    });

    it('says so when the world cannot be loaded at all', () => {
        // Otherwise it fills up forever, which is indistinguishable from a
        // slow connection.
        const b = make();
        b.begin(10);
        b.fail('could not load the world');
        expect(b.root.classList.contains('failed')).toBe(true);
        expect(b.root.getAttribute('aria-busy')).toBe('false');
        expect(b.statusEl.textContent).toBe('could not load the world');
    });

    it('does not take the game down if its markup is missing', () => {
        const b = new BootScreen({ root: null });
        expect(() => { b.begin(5); b.step(); b.done(); b.fail('x'); }).not.toThrow();
    });
});

describe('splash ripples', () => {
    it('reuses a fixed pool instead of accumulating', async () => {
        // Footsteps fire about three times a second forever. A growing array
        // here would be the one thing in the world that never stops.
        const { Effects } = await import('../js/engine/Effects.js');
        const fx = new Effects();
        for (let i = 0; i < 500; i++) fx.splash(100 + i, 0.4, 100 + i);
        expect(fx.ripples.length).toBeLessThanOrEqual(16);
    });

    it('retires a ripple once it has expanded', async () => {
        const { Effects } = await import('../js/engine/Effects.js');
        const fx = new Effects();
        const r = fx.splash(100, 0.4, 100);
        expect(r.life).toBeLessThan(r.ttl);
        for (let i = 0; i < 120; i++) fx.updateRipples(1 / 60);
        expect(r.life).toBeGreaterThanOrEqual(r.ttl);
    });

    it('does not fall over when asked to draw before anything splashed', async () => {
        const { Effects } = await import('../js/engine/Effects.js');
        const fx = new Effects();
        expect(() => { fx.updateRipples(0.1); fx.drawRipples(null, null, 800); }).not.toThrow();
    });
});
