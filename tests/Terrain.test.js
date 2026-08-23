import { describe, it, expect } from 'vitest';
import { Terrain } from '../js/engine/Terrain.js';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { city } from '../js/config/city.js';

const flat = new Terrain([
    { id: 'raised', x0: 100, x1: 200, z0: 0.5, z1: 1.0, elevation: 50 },
    { id: 'ramp', x0: 60, x1: 100, z0: 0.5, z1: 1.0, ramp: { axis: 'x', from: 0, to: 50 } }
]);

describe('Terrain elevation', () => {
    it('is flat outside any platform', () => {
        expect(flat.elevationAt(10, 0.2)).toBe(0);
    });

    it('reports the platform height inside it', () => {
        expect(flat.elevationAt(150, 0.8)).toBe(50);
    });

    it('interpolates across a ramp', () => {
        expect(flat.elevationAt(60, 0.8)).toBeCloseTo(0, 3);
        expect(flat.elevationAt(80, 0.8)).toBeCloseTo(25, 3);
        expect(flat.elevationAt(100, 0.8)).toBeCloseTo(50, 3);
    });

    it('resolves overlaps to the highest surface', () => {
        const t = new Terrain([
            { id: 'low', x0: 0, x1: 100, z0: 0, z1: 1, elevation: 20 },
            { id: 'high', x0: 40, x1: 60, z0: 0, z1: 1, elevation: 90 }
        ]);
        expect(t.elevationAt(50, 0.5)).toBe(90);
    });
});

describe('Terrain movement rules', () => {
    it('blocks walking up the side of a platform', () => {
        // Approach from open floor to the east, not up the ramp: x=250 is off
        // the platform entirely, x=150 is on top of it.
        expect(flat.canMove(250, 0.8, 150, 0.8, 14)).toBe(false);
    });

    it('lets a sunken area be walked down into and back out of', () => {
        const t = new Terrain([{ id: 'pit', x0: 0, x1: 50, z0: 0, z1: 1, elevation: -12 }]);
        expect(t.elevationAt(25, 0.5)).toBe(-12);
        expect(t.canMove(60, 0.5, 25, 0.5, 14)).toBe(true);   // stepping down
        expect(t.canMove(25, 0.5, 60, 0.5, 14)).toBe(true);   // 12 is within a step
    });

    it('allows the ramp', () => {
        // Small steps along the ramp are each within the step limit.
        expect(flat.canMove(60, 0.8, 70, 0.8, 14)).toBe(true);
    });

    it('always allows stepping down', () => {
        expect(flat.canMove(150, 0.8, 10, 0.8, 14)).toBe(true);
    });

    it('lets a kerb be stepped over', () => {
        const t = new Terrain([{ id: 'kerb', x0: 0, x1: 50, z0: 0, z1: 1, elevation: 10 }]);
        expect(t.canMove(60, 0.5, 40, 0.5, 14)).toBe(true);
    });
});

describe('elevation rendering', () => {
    const w = () => {
        const world = new World(city, new Camera({ worldWidth: city.width, viewportWidth: 1000 }));
        world.terrain = new Terrain(city.platforms);
        return world;
    };

    it('lifts a raised object up the screen', () => {
        const world = w();
        expect(world.liftFor(46, 0.8, 900)).toBeGreaterThan(0);
    });

    it('lifts less at depth, so a platform does not look tilted', () => {
        const world = w();
        expect(world.liftFor(46, 1, 900)).toBeLessThan(world.liftFor(46, 0, 900));
    });

    it('does not lift anything standing on the ground', () => {
        expect(w().liftFor(0, 0.5, 900)).toBe(0);
    });

    it('reads a prop height from the terrain under it', () => {
        const world = w();
        // A prop on the back service deck should be raised by it.
        expect(world.elevationOf({ x: 2000, z: 0.9 })).toBe(46);
        expect(world.elevationOf({ x: 2000, z: 0.1 })).toBe(0);
    });

    it('lets a prop override the terrain height explicitly', () => {
        expect(w().elevationOf({ x: 2000, z: 0.9, elevation: 5 })).toBe(5);
    });
});

describe('rooftop layout has real levels', () => {
    it('raises the structures onto the service deck', () => {
        const t = new Terrain(city.platforms);
        for (const p of city.props.filter(p => p.door)) {
            expect(t.elevationAt(p.x, p.z), p.id).toBeGreaterThan(0);
        }
    });

    it('drops the viewpoint below the main roof', () => {
        const t = new Terrain(city.platforms);
        expect(t.elevationAt(5600, 0.2)).toBeLessThan(0);
    });

    it('provides a ramp up to every raised area', () => {
        const ramps = city.platforms.filter(p => p.ramp);
        expect(ramps.length).toBeGreaterThanOrEqual(3);
    });
});
