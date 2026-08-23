import { describe, it, expect } from 'vitest';
import { directionFor, clipFor, DIRECTIONS, DEPTH_WEIGHT } from '../js/engine/direction.js';
import { city } from '../js/config/city.js';

describe('directionFor', () => {
    it('picks the dominant axis', () => {
        expect(directionFor(10, 0)).toBe('right');
        expect(directionFor(-10, 0)).toBe('left');
        expect(directionFor(0, 0.05)).toBe('up');
        expect(directionFor(0, -0.05)).toBe('down');
    });

    it('weighs depth against sideways travel rather than comparing raw numbers', () => {
        // A tiny z nudge must NOT beat a big sideways stride: z is a 0..1
        // fraction while x is world pixels, so raw comparison would flip the
        // character to a back view constantly.
        expect(directionFor(6, 0.002)).toBe('right');
        // But real depth movement does win.
        expect(directionFor(2, 0.05)).toBe('up');
    });

    it('breaks diagonal ties toward the side profile', () => {
        const tie = 1 / DEPTH_WEIGHT;   // equal weighted magnitude
        expect(directionFor(1, tie)).toBe('right');
        expect(directionFor(-1, tie)).toBe('left');
    });

    it('always returns a valid facing', () => {
        for (const [dx, dz] of [[0, 0], [0, 1], [0, -1], [5, 0], [-5, 0], [3, 0.01]]) {
            expect(DIRECTIONS).toContain(directionFor(dx, dz));
        }
    });
});

describe('clipFor', () => {
    it('mirrors the side sheet for left instead of needing a fourth cycle', () => {
        expect(clipFor('right', true)).toEqual({ clip: 'walk_side', flip: false });
        expect(clipFor('left', true)).toEqual({ clip: 'walk_side', flip: true });
    });

    it('uses dedicated cycles for depth facings, which cannot be mirrored', () => {
        expect(clipFor('up', true)).toEqual({ clip: 'walk_up', flip: false });
        expect(clipFor('down', true)).toEqual({ clip: 'walk_down', flip: false });
    });

    it('swaps to idle when not moving, keeping the facing', () => {
        expect(clipFor('up', false).clip).toBe('idle_up');
        expect(clipFor('left', false)).toEqual({ clip: 'idle_side', flip: true });
    });
});

describe('every clip the movement code can ask for exists on the sheet', () => {
    it('covers all four facings, moving and idle', () => {
        const anims = city.actor.animations;
        for (const dir of DIRECTIONS) {
            for (const moving of [true, false]) {
                const { clip } = clipFor(dir, moving);
                expect(anims, `${dir}/${moving ? 'walk' : 'idle'} -> ${clip}`)
                    .toHaveProperty(clip);
            }
        }
    });

    it('keeps every clip inside the sheet bounds', () => {
        const { rows, frameCount } = city.actor.sheet;
        for (const [name, clip] of Object.entries(city.actor.animations)) {
            expect(clip.row, `${name} row`).toBeLessThan(rows);
            expect((clip.offset || 0) + clip.length, `${name} columns`)
                .toBeLessThanOrEqual(frameCount);
        }
    });
});
