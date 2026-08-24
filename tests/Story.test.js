/**
 * The world reads as a place somebody uses, not a strip of objects.
 *
 * Everything here is about ARRANGEMENT, which is the one part of this project
 * that has no other way of being checked. A prop in the wrong spot loads fine,
 * draws fine, passes every other test in this suite, and quietly makes the roof
 * feel like a warehouse.
 *
 * Three claims:
 *
 *   1. Every reason to walk somewhere is its own reason. No two objects open
 *      the same thing, and no two say the same word.
 *   2. What an object DOES matches what it IS.
 *   3. Clutter is where clutter would be, not spread evenly along six thousand
 *      pixels of roof.
 */
import { describe, it, expect } from 'vitest';

import { city } from '../js/config/city.js';
import { scenes } from '../js/config/scenes.js';
import { Walkway } from '../js/engine/Walkway.js';
import { Collision } from '../js/engine/Collision.js';

/** Every prop you can press E on, west to east. */
const reasons = (manifest) => manifest.props
    .filter(p => p.interact || p.door)
    .map(p => ({ x: p.x, id: p.id, ...(p.door || p.interact) }))
    .sort((a, b) => a.x - b.x);

describe('every reason to walk somewhere is its own reason', () => {
    it('opens each thing from exactly one place', () => {
        // Three panels used to be reachable from two objects each: the resume
        // from a utility shed AND a clipboard, the guestbook from a mailbox AND
        // a radio mast, the blog from a greenhouse AND a newsstand. A visitor
        // who opens the same panel from a second object learns that the world
        // is decorative, and stops trying the rest of it.
        const seen = new Map();
        const duplicates = [];

        for (const { id, manifest } of scenes) {
            for (const r of reasons(manifest)) {
                // Doors into rooms are exempt: a room legitimately has a way in
                // and a way out, and both are `scene:`/`leave`.
                if (r.action.startsWith('scene:') || r.action === 'leave') continue;

                const key = `${id}:${r.action}`;
                if (seen.has(key)) duplicates.push(`${r.action} on ${seen.get(key)} and ${r.id}`);
                else seen.set(key, r.id);
            }
        }

        expect(duplicates).toEqual([]);
    });

    it('gives every prompt its own words', () => {
        // Three props said "Project" and two said "Resume". The prompt is the
        // only thing a visitor reads before deciding whether to press, so a
        // prompt that does not distinguish is a prompt that does not inform.
        const labels = reasons(city).map(r => r.label);
        const repeated = labels.filter((l, i) => labels.indexOf(l) !== i);

        expect(repeated).toEqual([]);
    });

    it('says which project, not just "Project"', () => {
        const projects = reasons(city).filter(r => r.action.startsWith('project:'));
        expect(projects.length).toBeGreaterThan(1);

        for (const p of projects) {
            expect(p.label.toLowerCase(), `${p.id} is labelled generically`)
                .not.toBe('project');
        }
    });

    it('never leaves the walk without a reason for too long', () => {
        // Rhythm. A visitor walking east should always have something ahead
        // worth reaching; long empty runs are where people turn round.
        const rs = reasons(city);
        const gaps = rs.slice(1).map((r, i) => r.x - rs[i].x);
        const seconds = Math.max(...gaps) / city.walkSpeed;

        expect(seconds, 'a stretch of the roof offers nothing for too long')
            .toBeLessThan(5);
    });
});

describe('clutter is where clutter would be', () => {
    /**
     * How irregularly a family of props is spaced.
     *
     * The coefficient of variation of the gaps between siblings: 0 is a perfect
     * grid, about 1 is genuinely random, above 1 is clumped. Measured before
     * `cluster()` existed, the weeds scored 0.30 and the foreground rails 0.11
     * — they were not scattered, they were wallpaper.
     */
    const irregularity = (prefix) => {
        const xs = city.props
            .filter(p => new RegExp(`^${prefix}_\\d+$`).test(p.id))
            .map(p => p.x)
            .sort((a, b) => a - b);

        if (xs.length < 4) return null;
        const gaps = xs.slice(1).map((x, i) => x - xs[i]);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
        return sd / mean;
    };

    it.each(['puddle', 'weed', 'lip_weed', 'lip_puddle', 'lip_box', 'lip_tarp'])(
        '%s clumps rather than repeating at an interval', (family) => {
            const cv = irregularity(family);
            expect(cv, `${family} is too evenly spaced to read as clutter`)
                .toBeGreaterThan(0.6);
        });

    it('leaves parts of the roof empty', () => {
        // The empty stretches are what make the busy ones read as busy. Spread
        // everything evenly and the roof has one density everywhere, which is
        // the same as having no density at all.
        const clutter = city.props.filter(p => /_\d+$/.test(p.id) && p.plane === 'deck');
        const bins = new Array(Math.ceil(city.width / 200)).fill(0);
        for (const p of clutter) bins[Math.floor(p.x / 200)]++;

        const empty = bins.filter(n => n === 0).length;
        expect(empty, 'clutter covers the whole roof evenly').toBeGreaterThan(4);
    });

    it('puts standing water where water would stand', () => {
        // Puddles cluster at the two drains. Not decoration: it is the only
        // thing that says the roof has a slope.
        const drains = city.props
            .filter(p => p.src && p.src.includes('drain_grate'))
            .map(p => p.x);
        expect(drains.length).toBeGreaterThan(0);

        const puddles = city.props.filter(p => p.surface === 'water');
        const nearDrain = puddles.filter(p =>
            drains.some(d => Math.abs(p.x - d) < 400)).length;

        expect(nearDrain / puddles.length,
            'the puddles have no relationship to the drains')
            .toBeGreaterThan(0.25);
    });
});

describe('nothing is in the way without earning it', () => {
    it('never blocks the route', () => {
        for (const { id, manifest } of scenes) {
            if (!manifest.walkway) continue;

            const walkway = new Walkway(manifest.walkway);
            const collision = new Collision(manifest.props, manifest.collision);

            for (let x = walkway.from; x <= walkway.to; x += 40) {
                let open = 0;
                for (let z = 0; z <= 1; z += 0.02) {
                    if (!walkway.contains(x, z)) continue;
                    const solved = collision.resolve(x, z, x, z);
                    if (Math.abs(solved.x - x) < 0.5 && Math.abs(solved.z - z) < 1e-6) {
                        open += 0.02;
                    }
                }
                expect(open, `${id} is impassable at x${x}`).toBeGreaterThan(0.08);
            }
        }
    });

    it('keeps anything big in the route interactive', () => {
        // A crate you walk around because somebody put it down mid-job is a
        // story. A crate you walk around because nobody checked is an
        // annoyance, and they are the same entry in the manifest.
        const walkway = new Walkway(city.walkway);
        const offenders = [];

        for (const p of city.props) {
            if (!p.solid || p.interact || p.door) continue;
            const bands = walkway.bandsAt(p.x);
            if (!bands.length) continue;

            const z = p.z != null ? p.z : 0.5;
            const d = p.solid === true ? 0.1 : (p.solid.d || 0.1);
            const width = bands.reduce((n, b) => n + (b.far - b.near), 0);
            const overlap = bands.reduce((n, b) => n + Math.max(0,
                Math.min(z + d / 2, b.far) - Math.max(z - d / 2, b.near)), 0);

            if (overlap / width > 0.3) offenders.push(`${p.id} at x${p.x}`);
        }

        expect(offenders).toEqual([]);
    });
});

describe('the character reads against what is around them', () => {
    /**
     * The front lip is drawn IN FRONT of the walkable floor — that occlusion is
     * most of what sells the depth. It is also the one place a prop can cut the
     * character in half, because anything down there passes between them and
     * the camera.
     *
     * The geometry that keeps it safe: lip props sit at a z nearer than the
     * walkway's near edge, so their baseline is lower on screen than the
     * character's feet, so their tops finish below the character's ankles.
     * That holds today by a comfortable margin and would stop holding the first
     * time somebody raised a lip prop's height without thinking about it.
     */
    const deck = city.deck;
    const UNIT = 900 / city.referenceHeight / 2;
    const VIEW_H = 450;

    const groundY = (z) => (deck.frontY + (deck.backY - deck.frontY) * z) * VIEW_H;
    const scaleAt = (z) => deck.frontScale + (deck.backScale - deck.frontScale) * z;

    it('never lets front-lip clutter cover the character', () => {
        const walkway = new Walkway(city.walkway);
        const offenders = [];

        for (const p of city.props) {
            if (p.plane !== city.actorPlane || p.z == null) continue;

            const bands = walkway.bandsAt(p.x);
            if (!bands.length) continue;

            // Only things in FRONT of everywhere the character can stand.
            const nearest = Math.min(...bands.map(b => b.near));
            if (p.z >= nearest) continue;

            // Where the character's feet are at the nearest spot they could
            // stand at this x, and where this prop's top reaches.
            const feet = groundY(nearest);
            const top = groundY(p.z) - p.height * UNIT * scaleAt(p.z);
            const covers = feet - top;

            // A weed brushing the ankles is not a problem, it is the point —
            // something passing in front of the feet is most of what sells the
            // depth of the lip. What breaks a silhouette is something reaching
            // the torso, so the limit is a share of the character rather than
            // zero. Measured at the strictest spot: the nearest z they can
            // stand at, where they are largest and the lip is closest.
            const characterH = city.actor.place.height * UNIT * scaleAt(nearest);

            if (covers > characterH * 0.35) {
                offenders.push(`${p.id} (x${p.x}) covers `
                    + `${(100 * covers / characterH).toFixed(0)}% of the character`);
            }
        }

        expect(offenders.slice(0, 6)).toEqual([]);
    });

    it('leaves the spawn itself uncluttered', () => {
        // Wherever else the roof piles up, the first thing a visitor sees is
        // the character standing still — so their pose has to read before
        // anything else does.
        const spawn = city.actor.place.x;
        const crowding = city.props.filter(p =>
            p.plane === city.actorPlane
            && /_\d+$/.test(p.id)
            && Math.abs(p.x - spawn) < 70
            && p.z != null && Math.abs(p.z - 0.45) < 0.2);

        expect(crowding.map(p => p.id)).toEqual([]);
    });
});
