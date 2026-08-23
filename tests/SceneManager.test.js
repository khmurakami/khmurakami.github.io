import { describe, it, expect, vi } from 'vitest';
import { SceneManager } from '../js/engine/SceneManager.js';

const scenes = () => ([
    { id: 'roof', manifest: { width: 6200 }, spawn: { x: 560, z: 0.45 } },
    { id: 'shed', manifest: { width: 1500 }, spawn: { x: 1270, z: 0.62 }, facing: 'left' },
    { id: 'cellar', manifest: { width: 900 }, spawn: { x: 100, z: 0.5 } }
]);

const make = (over = {}) =>
    new SceneManager({ scenes: scenes(), start: 'roof', fadeDuration: 0.5, ...over });

/** Runs a full transition to completion and returns the swap arguments seen. */
const settle = (m) => {
    m.update(0.5);   // out -> swap
    m.update(0.5);   // in -> done
};

describe('SceneManager', () => {
    it('refuses to start in a scene it does not have', () => {
        expect(() => new SceneManager({ scenes: scenes(), start: 'attic' })).toThrow();
    });

    it('exposes the active manifest, which is what the engines are built from', () => {
        expect(make().manifest.width).toBe(6200);
    });

    it('swaps at the midpoint of the fade, not at the keypress', () => {
        const m = make();
        const swap = vi.fn();
        m.onSwap = swap;

        m.enter('shed', { x: 1320, z: 0.5, facing: 'up' });
        // Still on the roof while the veil is going up — this is the whole
        // point of the fade. Swapping early makes the world visibly teleport.
        expect(m.activeId).toBe('roof');
        expect(swap).not.toHaveBeenCalled();

        m.update(0.3);
        expect(m.activeId).toBe('roof');

        m.update(0.3);
        expect(m.activeId).toBe('shed');
        expect(swap).toHaveBeenCalledTimes(1);
    });

    it('hands the swap the entered scene and its declared spawn', () => {
        const m = make();
        let seen = null;
        m.onSwap = (scene, spawn) => { seen = { scene, spawn }; };

        m.enter('shed', { x: 1320, z: 0.5, facing: 'up' });
        m.update(0.5);

        expect(seen.scene.id).toBe('shed');
        expect(seen.spawn).toEqual({ x: 1270, z: 0.62, facing: 'left' });
    });

    it('puts you back on the tile you entered from, not at the spawn point', () => {
        const m = make();
        let seen = null;
        m.onSwap = (_s, spawn) => { seen = spawn; };

        m.enter('shed', { x: 1320, z: 0.53, facing: 'up' });
        settle(m);

        m.leave();
        settle(m);

        expect(m.activeId).toBe('roof');
        expect(seen).toEqual({ x: 1320, z: 0.53, facing: 'up' });
    });

    it('unwinds nested rooms one at a time', () => {
        const m = make();
        m.enter('shed', { x: 1320, z: 0.5 });
        settle(m);
        m.enter('cellar', { x: 400, z: 0.4 });
        settle(m);

        expect(m.activeId).toBe('cellar');
        m.leave();
        settle(m);
        expect(m.activeId).toBe('shed');
        m.leave();
        settle(m);
        expect(m.activeId).toBe('roof');
        expect(m.canLeave).toBe(false);
    });

    it('has nowhere to go back to from the starting scene', () => {
        const m = make();
        expect(m.canLeave).toBe(false);
        expect(m.leave()).toBe(false);
    });

    it('refuses a second transition mid-fade, so mashing E cannot stack them', () => {
        const m = make();
        expect(m.enter('shed', { x: 0, z: 0 })).toBe(true);
        expect(m.enter('cellar', { x: 0, z: 0 })).toBe(false);
        expect(m.leave()).toBe(false);

        settle(m);
        expect(m.activeId).toBe('shed');
        // One push, not two — a stacked transition would have left a stray
        // return entry that put you back somewhere you never stood.
        expect(m.stack).toHaveLength(1);
    });

    it('refuses unknown scenes and re-entering the scene you are in', () => {
        const m = make();
        expect(m.enter('attic', { x: 0, z: 0 })).toBe(false);
        expect(m.enter('roof', { x: 0, z: 0 })).toBe(false);
        expect(m.busy).toBe(false);
    });

    it('reaches full black exactly at the swap', () => {
        const m = make();
        let veilAtSwap = null;
        m.onSwap = () => { veilAtSwap = m.veil; };

        m.enter('shed', { x: 0, z: 0 });
        expect(m.veil).toBe(0);
        m.update(0.25);
        expect(m.veil).toBeCloseTo(0.5, 5);

        m.update(0.25);
        // Anything less than opaque here and the change of place is visible.
        expect(veilAtSwap).toBe(1);
    });

    it('clears the veil and the busy flag when the fade finishes', () => {
        const m = make();
        m.enter('shed', { x: 0, z: 0 });
        settle(m);
        expect(m.veil).toBe(0);
        expect(m.busy).toBe(false);
    });

    it('is not busy, and draws no veil, when nothing is happening', () => {
        const m = make();
        m.update(0.016);
        expect(m.busy).toBe(false);
        expect(m.veil).toBe(0);
    });

    it('carries frame overshoot into the second half rather than dropping it', () => {
        const m = make();
        m.enter('shed', { x: 0, z: 0 });
        // One long frame overshoots the midpoint by 0.2s. That time belongs to
        // the fade-in; discarding it makes the halves unequal on a slow frame.
        m.update(0.7);
        expect(m.activeId).toBe('shed');
        expect(m.veil).toBeCloseTo(0.6, 5);
    });

    it('completes even if a single frame spans the whole transition', () => {
        const m = make();
        m.enter('shed', { x: 0, z: 0 });
        m.update(5);
        m.update(5);
        expect(m.activeId).toBe('shed');
        expect(m.busy).toBe(false);
    });
});
