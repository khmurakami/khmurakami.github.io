import { describe, it, expect } from 'vitest';
import { workshop } from '../js/config/workshop.js';
import { stairwell } from '../js/config/stairwell.js';
import { city } from '../js/config/city.js';
import { World } from '../js/engine/World.js';
import { Collision } from '../js/engine/Collision.js';

/**
 * Invariants every interior has to hold, run against all of them.
 *
 * An interior is declared with the same contract as the roof, so it breaks in
 * the same ways — and, being a small sealed box, in two more: you can wall
 * yourself in, or spawn inside the furniture. Neither is visible until somebody
 * walks through the door and cannot get back out.
 *
 * Parameterised rather than copied, so a third room inherits the whole set by
 * being added to this list instead of by someone remembering to.
 */
const INTERIORS = [
    {
        name: 'workshop',
        manifest: workshop,
        /** A depth with no solids across the room's whole width. */
        lane: 0.25,
        actions: ['leave', 'terminal', 'projects', 'pipeline', 'palette',
                  'manifest', 'radio', 'cot']
    },
    {
        name: 'stairwell',
        manifest: stairwell,
        lane: 0.30,
        actions: ['leave', 'about', 'guestbook', 'stairwell', 'coats']
    }
];

describe.each(INTERIORS)('$name', ({ name, manifest, lane, actions }) => {
    const zones = () => World.zonesFrom(manifest);

    it('keeps the horizon on the line where the floor art ends', () => {
        // Props on the back plane stand on this line. The roof has a test for
        // exactly this; a room drifts the same way.
        const floor = manifest.backdrops.find(b => b.plane === 'deck');
        expect(manifest.horizonY).toBeCloseTo(1 - floor.heightFrac, 5);
    });

    it('gives every prop a unique id and a plane that exists', () => {
        const ids = manifest.props.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);

        const planes = new Set(manifest.planes.map(p => p.id));
        for (const p of manifest.props) expect(planes.has(p.plane), p.id).toBe(true);
    });

    it('is narrower than a viewport, so the room is seen whole', () => {
        // Not scrolling is what makes a room read as a room. Past a typical
        // window it silently becomes another corridor.
        expect(manifest.width).toBeLessThan(1600);
    });

    it('has exactly one way out', () => {
        const out = zones().filter(z => z.action === 'leave');
        expect(out).toHaveLength(1);
        expect(out[0].kind).toBe('door');
    });

    it('is reachable from the roof by a door that names it', () => {
        const ways = World.zonesFrom(city).filter(z => z.action === `scene:${name}`);
        expect(ways).toHaveLength(1);
    });

    it('spawns you inside the room, not through a wall', () => {
        expect(manifest.spawn.x).toBeGreaterThan(40);
        expect(manifest.spawn.x).toBeLessThan(manifest.width - 40);
        expect(manifest.spawn.z).toBeGreaterThanOrEqual(0);
        expect(manifest.spawn.z).toBeLessThanOrEqual(1);
    });

    it('does not spawn you inside the furniture', () => {
        // Spawning inside a solid leaves the resolver pushing you out on the
        // first frame, which reads as the room shoving you.
        const c = new Collision(manifest.props, manifest.collision);
        const { x, z } = manifest.spawn;
        const solved = c.resolve(x, z, x, z);
        expect(solved.x).toBeCloseTo(x, 5);
        expect(solved.z).toBeCloseTo(z, 5);
    });

    it('leaves a walkway that reaches the whole room', () => {
        // The failure a sealed room has that an open roof does not: solids
        // arranged into a wall you cannot get past.
        const c = new Collision(manifest.props, manifest.collision);
        let x = manifest.spawn.x;
        for (let i = 0; i < 500; i++) x = c.resolve(x, lane, x - 5, lane).x;

        expect(x, 'walked west along the front').toBeLessThan(120);
    });

    it('lets you off the doormat: the arrival tile reaches the walkway', () => {
        // A clear lane is no use if the spawn point cannot get to it.
        const c = new Collision(manifest.props, manifest.collision);
        const x = manifest.spawn.x;
        let z = manifest.spawn.z;
        for (let i = 0; i < 200; i++) z = c.resolve(x, z, x, z - 0.01).z;

        expect(z, 'walked downstage from the spawn').toBeLessThanOrEqual(lane);
    });

    it('wires every interaction to something the game can open', () => {
        // Actions are strings, so a typo is silent — the prompt appears, E does
        // nothing, and it looks like a broken object rather than a broken id.
        const known = new Set(actions);
        for (const zone of zones()) {
            expect(known.has(zone.action), zone.action).toBe(true);
        }
    });

    it('uses every action it declares, so the list cannot rot', () => {
        const used = new Set(zones().map(z => z.action));
        for (const a of actions) expect(used.has(a), `${a} is declared but unused`).toBe(true);
    });

    it('labels every zone, because an unlabelled prompt reads as a bug', () => {
        for (const zone of zones()) expect(zone.label, zone.id).toBeTruthy();
    });

    describe('human scale', () => {
        const d = manifest.deck;
        const depthScale = (z) => d.frontScale + (d.backScale - d.frontScale) * z;
        const CHARACTER = city.actor.place.height * depthScale(manifest.spawn.z);
        const cm = (p) => (p.height * depthScale(p.z ?? 0.5) / CHARACTER) * 175;

        it('keeps the doorway taller than the person walking through it', () => {
            const door = manifest.props.find(p => p.door);
            expect(cm(door)).toBeGreaterThan(180);
        });

        it('keeps the furniture below head height', () => {
            const tall = new Set([...manifest.props.filter(p => p.door).map(p => p.id)]);
            for (const p of manifest.props) {
                if (tall.has(p.id) || p.plane !== 'deck') continue;
                expect(cm(p), p.id).toBeLessThan(150);
            }
        });
    });
});

describe('what each room is for', () => {
    it('puts the tools in the workshop and the about on the landing', () => {
        // The rooms are not interchangeable sets of props. If these ever swap,
        // both rooms have lost the premise that decides what belongs in them.
        const w = World.zonesFrom(workshop).map(z => z.action);
        const s = World.zonesFrom(stairwell).map(z => z.action);

        expect(w).toContain('pipeline');
        expect(w).toContain('palette');
        expect(s).toContain('about');
        expect(s).not.toContain('pipeline');
    });

    it('reuses the roof CRT rather than forking a second terminal asset', () => {
        const crt = workshop.props.find(p => p.id === 'crt');
        // Asserted without the extension: what matters is that the workshop
        // points at the ROOF's asset rather than a second copy of it. The file
        // format is the art pipeline's business and has already changed once,
        // from PNG to WebP.
        expect(crt.src).toMatch(/^\.\/assets\/city\/pixel\/crt_terminal\.\w+$/);

        // And it really is the same file the roof uses, not a lookalike.
        const roofCrt = city.props.find(p => p.id === 'crt_terminal');
        expect(crt.src).toBe(roofCrt.src);
    });

    it('lights the landing cold and the workshop warm', () => {
        // The two interiors have one thing to say against each other: one is
        // worked in, the other is only passed through. Equal warmth loses it.
        const warmth = (m) => m.hazeColor[0] - m.hazeColor[2];
        expect(warmth(workshop)).toBeGreaterThan(0);
        expect(warmth(stairwell)).toBeLessThan(0);
    });
});
