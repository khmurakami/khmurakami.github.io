import { describe, it, expect } from 'vitest';
import { Walkway } from '../js/engine/Walkway.js';

const single = () => new Walkway({
    edge: [
        { x: 0,   near: 0.10, far: 0.50 },
        { x: 100, near: 0.20, far: 0.60 }
    ]
});

const twoLanes = () => new Walkway({
    lanes: [
        { id: 'deck',    edge: [{ x: 0, near: 0.10, far: 0.55 }, { x: 100, near: 0.10, far: 0.55 }] },
        { id: 'service', edge: [{ x: 40, near: 0.70, far: 0.90 }, { x: 80, near: 0.70, far: 0.90 }] }
    ]
});

describe('Walkway', () => {
    it('refuses a lane it cannot interpolate', () => {
        expect(() => new Walkway({ edge: [{ x: 0, near: 0, far: 1 }] })).toThrow();
    });

    it('accepts control points in any order', () => {
        // They read better in the manifest beside the props they belong to,
        // which is not always left to right.
        const w = new Walkway({ edge: [
            { x: 100, near: 0.20, far: 0.60 },
            { x: 0,   near: 0.10, far: 0.50 }
        ]});
        expect(w.lanes[0].bandAt(0).near).toBeCloseTo(0.10, 5);
    });

    it('interpolates between control points', () => {
        const b = single().bandsAt(50)[0];
        expect(b.near).toBeCloseTo(0.15, 5);
        expect(b.far).toBeCloseTo(0.55, 5);
    });

    it('eases rather than kinking at every control point', () => {
        // Linear interpolation gives the route a visible corner wherever two
        // segments meet, which reads as a mistake rather than as a shape.
        const w = new Walkway({ edge: [
            { x: 0,   near: 0.10, far: 0.50 },
            { x: 100, near: 0.30, far: 0.50 }
        ]});
        // A smoothstep sits below the straight line in the first half.
        expect(w.bandsAt(25)[0].near).toBeLessThan(0.15);
        expect(w.bandsAt(50)[0].near).toBeCloseTo(0.20, 5);
    });

    it('holds the end bands rather than extrapolating past them', () => {
        // Continuing the slope eventually inverts the band and produces a
        // stretch of route with negative width.
        const lane = single().lanes[0];
        expect(lane.bandAt(-500).near).toBeCloseTo(0.10, 5);
        expect(lane.bandAt(9999).far).toBeCloseTo(0.60, 5);
    });

    it('reports no route at all beyond the lane, rather than a held one', () => {
        // Holding the end band is a guard against a bad interpolation, not a
        // claim that the route continues. Past its last control point there is
        // simply nowhere to walk, and nothing should be drawn there either.
        const w = single();
        expect(w.bandsAt(-500)).toEqual([]);
        expect(w.contains(-500, 0.30)).toBe(false);
    });

    it('knows what is on the route and what is not', () => {
        const w = single();
        expect(w.contains(0, 0.30)).toBe(true);
        expect(w.contains(0, 0.05)).toBe(false);   // off the front lip
        expect(w.contains(0, 0.80)).toBe(false);   // into the back wall
    });

    it('clamps onto the route instead of blocking at its edge', () => {
        // Sliding along an invisible edge reads as the world having a shape;
        // stopping dead at it reads as the game snagging.
        const w = single();
        expect(w.clamp(0, 0.90)).toBeCloseTo(0.50, 5);
        expect(w.clamp(0, -1)).toBeCloseTo(0.10, 5);
        expect(w.clamp(0, 0.30)).toBeCloseTo(0.30, 5);
    });

    describe('with a second, raised lane', () => {
        it('lets you stand on either', () => {
            const w = twoLanes();
            expect(w.contains(60, 0.30), 'the deck').toBe(true);
            expect(w.contains(60, 0.80), 'the service level').toBe(true);
        });

        it('leaves the gap between them off the route', () => {
            // The face between the two levels is not a place to stand. How high
            // it is, and whether it can be climbed, is Terrain's business.
            expect(twoLanes().contains(60, 0.62)).toBe(false);
        });

        it('clamps to the nearer lane, not the first one', () => {
            // Stepping off the back of the raised level must put you on its own
            // edge. Snapping to the deck below would teleport you off a ledge
            // that Terrain has already said you may stand on.
            const w = twoLanes();
            expect(w.clamp(60, 0.95)).toBeCloseTo(0.90, 5);
            expect(w.clamp(60, 0.05)).toBeCloseTo(0.10, 5);
        });

        it('only offers a lane where that lane exists', () => {
            const w = twoLanes();
            expect(w.bandsAt(60).map(b => b.id)).toEqual(['deck', 'service']);
            expect(w.bandsAt(10).map(b => b.id)).toEqual(['deck']);
            expect(w.contains(10, 0.80), 'no service level this far west').toBe(false);
        });
    });

    describe('sampling for the renderer', () => {
        it('lands exactly on both ends', () => {
            // Stopping a fraction short leaves a seam at the edge of the screen.
            const pts = single().lanes[0].sample(-50, 150, 30);
            expect(pts[0].x).toBe(0);
            expect(pts[pts.length - 1].x).toBe(100);
        });

        it('returns nothing for a range the lane does not cover', () => {
            expect(single().lanes[0].sample(500, 900)).toEqual([]);
        });

        it('carries the band with each sample, so drawing cannot re-derive it wrong', () => {
            const p = single().lanes[0].sample(0, 100, 50)[0];
            expect(p).toHaveProperty('near');
            expect(p).toHaveProperty('far');
        });
    });
});
