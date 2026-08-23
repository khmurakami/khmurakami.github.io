import { describe, it, expect } from 'vitest';
import { Collision } from '../js/engine/Collision.js';
import { city } from '../js/config/city.js';

const shed = [{ id: 'shed', x: 1000, z: 0.5, height: 200, solid: { w: 200, d: 0.2 } }];

describe('solid props', () => {
    it('only blocks props marked solid', () => {
        const c = new Collision([
            { id: 'solid', x: 100, z: 0.5, height: 80, solid: { w: 60, d: 0.1 } },
            { id: 'puddle', x: 300, z: 0.5, height: 20 }
        ], { radius: 10, depthRadius: 0.02 });
        expect(c.blocked(100, 0.5)).toBeTruthy();
        expect(c.blocked(300, 0.5)).toBeNull();
    });

    it('blocks the footprint, not the sprite height', () => {
        // A tall thin mast should not block a wide area just because it is tall.
        const c = new Collision([{ id: 'mast', x: 0, z: 0.5, height: 400, solid: { w: 40, d: 0.1 } }],
            { radius: 5, depthRadius: 0.01 });
        expect(c.blocked(0, 0.5)).toBeTruthy();
        expect(c.blocked(60, 0.5)).toBeNull();
    });

    it('accounts for the character having width', () => {
        const c = new Collision(shed, { radius: 30, depthRadius: 0.05 });
        // Edge of the shed is 900; a 30px-wide character is stopped before it.
        expect(c.blocked(880, 0.5)).toBeTruthy();
        expect(c.blocked(860, 0.5)).toBeNull();
    });

    it('ignores props at a different depth', () => {
        const c = new Collision(shed, { radius: 10, depthRadius: 0.02 });
        expect(c.blocked(1000, 0.5)).toBeTruthy();
        expect(c.blocked(1000, 0.05)).toBeNull();   // walking past in front
    });
});

describe('sliding along obstacles', () => {
    const c = () => new Collision(shed, { radius: 15, depthRadius: 0.04 });

    it('stops movement into a prop', () => {
        const r = c().resolve(860, 0.5, 900, 0.5);
        expect(r.x).toBe(860);
        expect(r.hit).toBe(true);
    });

    it('still carries the free axis when moving diagonally into it', () => {
        // Depth must overlap the shed for x to be blocked at all — the shed
        // occupies z 0.4-0.6, so the character has to actually be in that band.
        const r = c().resolve(860, 0.46, 900, 0.50);
        expect(r.x).toBe(860);          // blocked sideways
        expect(r.z).toBeCloseTo(0.50, 5); // but still slides in depth
    });

    it('lets movement away from a prop through', () => {
        const r = c().resolve(880, 0.5, 840, 0.5);
        expect(r.x).toBe(840);
        expect(r.hit).toBe(false);
    });
});

describe('the world is solid where it should be', () => {
    const solids = city.props.filter(p => p.solid);

    it('makes every structure and piece of furniture solid', () => {
        for (const id of ['stair_hut', 'greenhouse', 'corrugated_shack', 'utility_shed',
                          'radio_mast', 'vending', 'pigeon_coop', 'bench', 'telescope']) {
            expect(city.props.find(p => p.id === id)?.solid, id).toBeTruthy();
        }
    });

    it('leaves things you walk over or under passable', () => {
        for (const p of city.props) {
            if (p.id.startsWith('puddle') || p.id.startsWith('weed') ||
                p.id.startsWith('bulb') || p.plane === 'fore' || p.plane === 'far') {
                expect(p.solid, `${p.id} should not be solid`).toBeFalsy();
            }
        }
    });

    it('never seals the roof shut across its full depth', () => {
        // There must always be a way past: no blocker may span the whole floor.
        const c = new Collision(city.props, city.collision);
        for (const b of c.blockers) {
            const spansAll = b.z0 <= 0 && b.z1 >= 1;
            expect(spansAll, `${b.id} blocks the entire depth`).toBe(false);
        }
    });

    it('leaves a walkable lane past every solid prop', () => {
        const c = new Collision(city.props, city.collision);
        // Sample the roof: at every x there must be some depth that is free.
        for (let x = 300; x < city.width; x += 40) {
            let open = false;
            for (let z = 0.05; z <= 0.95; z += 0.05) {
                if (!c.blocked(x, z)) { open = true; break; }
            }
            expect(open, `roof is sealed at x=${x}`).toBe(true);
        }
    });
});
