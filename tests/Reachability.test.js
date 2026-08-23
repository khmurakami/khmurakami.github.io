import { describe, it, expect } from 'vitest';
import { city } from '../js/config/city.js';
import { workshop } from '../js/config/workshop.js';
import { stairwell } from '../js/config/stairwell.js';
import { World } from '../js/engine/World.js';
import { Walkway } from '../js/engine/Walkway.js';
import { Collision } from '../js/engine/Collision.js';
import { Terrain } from '../js/engine/Terrain.js';

/**
 * Can you actually get there, and can you get back?
 *
 * Three systems decide where the character may stand — the route, the terrain
 * and the solid props — and each is individually correct while the three of
 * them together can still produce a roof with a sealed stretch, an unreachable
 * door, or a hollow you fall into and cannot climb out of. None of that is
 * visible in any one manifest entry. It shows up when someone walks there.
 *
 * So this floods the walkable space and asks the questions a player would.
 *
 * The reachability graph is DIRECTED, which is the whole reason the last test
 * here exists: `Terrain.canMove` deliberately allows any drop but limits rises,
 * so a step down is not the same edge as the step back up. That asymmetry is
 * what made the sunken lookout a trap — you could walk to the viewpoint and
 * then never leave it.
 */

const XSTEP = 25;
const ZSTEP = 0.02;

function graph(manifest) {
    const walkway = new Walkway(manifest.walkway);
    const collision = new Collision(manifest.props, manifest.collision);
    const terrain = new Terrain(manifest.platforms);
    const maxStep = manifest.maxStep;

    const xs = [];
    for (let x = 40; x <= manifest.width - 40; x += XSTEP) xs.push(x);
    const zs = [];
    for (let z = 0; z <= 1.0001; z += ZSTEP) zs.push(+z.toFixed(3));

    const key = (xi, zi) => `${xi},${zi}`;
    const standable = (xi, zi) => {
        const x = xs[xi], z = zs[zi];
        if (x === undefined || z === undefined) return false;
        if (!walkway.contains(x, z)) return false;
        return !collision.blocked(x, z);
    };

    /** Whether a single grid step from one cell to its neighbour is walkable. */
    const canStep = (a, b) => {
        if (!standable(...b)) return false;
        return terrain.canMove(xs[a[0]], zs[a[1]], xs[b[0]], zs[b[1]], maxStep);
    };

    const neighbours = ([xi, zi]) =>
        [[xi + 1, zi], [xi - 1, zi], [xi, zi + 1], [xi, zi - 1]];

    /** Cells reachable from a start, following edges forwards or backwards. */
    const flood = (start, reverse = false) => {
        const seen = new Set([key(...start)]);
        const queue = [start];
        while (queue.length) {
            const cur = queue.pop();
            for (const n of neighbours(cur)) {
                const k = key(...n);
                if (seen.has(k)) continue;
                // Forwards: can I step from cur to n? Backwards: from n to cur?
                if (!(reverse ? canStep(n, cur) && standable(...n) : canStep(cur, n))) continue;
                seen.add(k);
                queue.push(n);
            }
        }
        return seen;
    };

    const nearest = (x, z) => [
        Math.max(0, Math.min(xs.length - 1, Math.round((x - 40) / XSTEP))),
        Math.max(0, Math.min(zs.length - 1, Math.round(z / ZSTEP)))
    ];

    return { xs, zs, key, standable, flood, nearest, walkway };
}

/** The scenes, each with the point the player actually starts from. */
const SCENES = [
    { name: 'roof', manifest: city, spawn: { x: city.actor.place.x, z: 0.45 } },
    { name: 'workshop', manifest: workshop, spawn: workshop.spawn },
    { name: 'stairwell', manifest: stairwell, spawn: stairwell.spawn }
];

describe.each(SCENES)('$name is walkable', ({ manifest, spawn }) => {
    const g = graph(manifest);
    const start = g.nearest(spawn.x, g.walkway.clamp(spawn.x, spawn.z));
    const reached = g.flood(start);

    it('starts you somewhere you are allowed to stand', () => {
        expect(g.standable(...start)).toBe(true);
    });

    it('lets you reach both ends of the route', () => {
        // The classic failure: one badly placed solid seals a stretch and half
        // the content silently stops existing.
        //
        // Measured against the route's own extent, not the manifest width. The
        // route is what defines how much of the world is a place — the metres
        // of deck beyond its last control point are scenery by design.
        const xsReached = [...reached].map(k => g.xs[Number(k.split(',')[0])]);
        const lane = g.walkway.lanes[0];

        expect(Math.min(...xsReached), 'west end').toBeLessThanOrEqual(lane.from + XSTEP * 2);
        expect(Math.max(...xsReached), 'east end').toBeGreaterThanOrEqual(lane.to - XSTEP * 2);
    });

    it('puts every door and interactable within reach', () => {
        // A trigger is a span of x, so it is enough to be able to stand
        // anywhere inside that span — but you do have to be able to stand
        // somewhere inside it.
        const reachedX = new Set([...reached].map(k => g.xs[Number(k.split(',')[0])]));

        for (const zone of World.zonesFrom(manifest)) {
            const half = zone.width / 2;
            const ok = [...reachedX].some(x => Math.abs(x - zone.x) <= half);
            expect(ok, `${zone.id} (${zone.label}) is unreachable`).toBe(true);
        }
    });

    it('has no one-way drop you cannot climb back out of', () => {
        // Every reachable cell must also be able to reach the spawn. Any cell
        // in the forward flood but not the backward one is a trap: you can walk
        // into it and the world has no way back.
        const canReturn = g.flood(start, true);
        const trapped = [...reached].filter(k => !canReturn.has(k));

        const describe = trapped.slice(0, 5).map(k => {
            const [xi, zi] = k.split(',').map(Number);
            return `x=${g.xs[xi]} z=${g.zs[zi]}`;
        });
        expect(trapped, `trapped in ${trapped.length} spots, e.g. ${describe.join('; ')}`)
            .toHaveLength(0);
    });
});

describe('the roof route reads as a route', () => {
    const deck = city.walkway.lanes.find(l => l.id === 'deck');

    it('never inverts a band', () => {
        // A far edge that crosses in front of the near edge is a stretch of
        // route with negative width; it draws as a bow-tie and cannot be stood
        // on, which looks like a hole in the roof.
        const w = new Walkway(city.walkway);
        for (let x = 0; x <= city.width; x += 20) {
            for (const b of w.bandsAt(x)) {
                expect(b.far, `at x=${x} on ${b.id}`).toBeGreaterThan(b.near);
            }
        }
    });

    it('stays wide enough to walk down everywhere it exists', () => {
        // Narrower than the character's own depth and the route becomes a line
        // the collision resolver cannot fit them onto.
        const w = new Walkway(city.walkway);
        const minWidth = city.collision.depthRadius * 2;
        for (let x = 0; x <= city.width; x += 20) {
            for (const b of w.bandsAt(x)) {
                expect(b.far - b.near, `at x=${x} on ${b.id}`).toBeGreaterThan(minWidth);
            }
        }
    });

    it('opens out at the landmarks and pinches between them', () => {
        // The shaping is the whole reason the route is a polyline rather than a
        // rectangle: you should be able to see the roof widen ahead of you at
        // the next thing worth stopping at.
        const width = (x) => {
            const b = deck.edge;
            const hit = b.find(p => p.x === x);
            return hit.far - hit.near;
        };
        const landmarks = [520, 1490, 2380, 3320, 4010, 4820];
        const pinches = [880, 1900, 2900, 3800, 4600];

        for (const l of landmarks) expect(width(l), `landmark ${l}`).toBeGreaterThan(0.45);
        for (const p of pinches) expect(width(p), `pinch ${p}`).toBeLessThan(0.35);
    });

    it('keeps the front edge off the parapet except at the viewpoint', () => {
        // The lookout is the one place you are meant to get right to the lip,
        // and the route eases out toward it from the mast at x=4820 — so the
        // check stops before that approach rather than at an arbitrary x.
        const w = new Walkway(city.walkway);
        const LOOKOUT_APPROACH = 4820;

        for (let x = 200; x < LOOKOUT_APPROACH; x += 40) {
            expect(w.bandsAt(x)[0].near, `at x=${x}`).toBeGreaterThanOrEqual(0.10);
        }
        // And out on the viewpoint it genuinely does reach the lip.
        expect(w.bandsAt(5500)[0].near).toBeLessThan(0.06);
    });
});
