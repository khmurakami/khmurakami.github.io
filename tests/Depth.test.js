import { describe, it, expect } from 'vitest';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { city } from '../js/config/city.js';

const cam = () => new Camera({ worldWidth: city.width, viewportWidth: 1000 });
const world = () => new World(city, cam());

describe('deck depth', () => {
    it('places the back of the roof higher up the screen than the front', () => {
        const w = world();
        expect(w.groundYFor(1, 1000)).toBeLessThan(w.groundYFor(0, 1000));
    });

    it('shrinks things as they move away from the camera', () => {
        const w = world();
        expect(w.depthScale(1)).toBeLessThan(w.depthScale(0));
    });

    it('interpolates smoothly and monotonically across the floor', () => {
        const w = world();
        let prevY = Infinity, prevS = Infinity;
        for (let z = 0; z <= 1.0001; z += 0.1) {
            const y = w.groundYFor(z, 1000);
            const s = w.depthScale(z);
            expect(y).toBeLessThan(prevY);
            expect(s).toBeLessThan(prevS);
            prevY = y; prevS = s;
        }
    });

    it('derives a depth from y for props that do not declare one', () => {
        const w = world();
        const d = city.deck;
        expect(w.depthOf({ y: d.frontY })).toBeCloseTo(0, 3);
        expect(w.depthOf({ y: d.backY })).toBeCloseTo(1, 3);
        expect(w.depthOf({ z: 0.7, y: d.frontY })).toBe(0.7);   // explicit wins
    });

    it('clamps derived depth for props outside the floor band', () => {
        const w = world();
        expect(w.depthOf({ y: 0.99 })).toBe(0);
        expect(w.depthOf({ y: 0.10 })).toBe(1);
    });
});

describe('depth sorting', () => {
    const scene = (props) => {
        const w = new World({ ...city, props }, cam());
        w.camera.snapTo(1000);
        return w;
    };

    it('draws far props before near ones so near ones overlap', () => {
        const w = scene([
            { id: 'near', plane: 'deck', z: 0.1, x: 1000, height: 100, src: 'a.png' },
            { id: 'far',  plane: 'deck', z: 0.9, x: 1000, height: 100, src: 'a.png' },
            { id: 'mid',  plane: 'deck', z: 0.5, x: 1000, height: 100, src: 'a.png' }
        ]);
        const order = [];
        w.placeholder = (_c, p) => order.push(p.id);
        w.drawProps({ save: () => {}, restore: () => {} }, w.plane('deck'), 1000, 800);
        expect(order).toEqual(['far', 'mid', 'near']);
    });

    it('interleaves the character among props by depth', () => {
        const w = scene([
            { id: 'behind', plane: 'deck', z: 0.9, x: 1000, height: 100, src: 'a.png' },
            { id: 'infront', plane: 'deck', z: 0.1, x: 1000, height: 100, src: 'a.png' }
        ]);

        const order = [];
        w.placeholder = (_c, p) => order.push(p.id);
        w.drawActor = (_c, a) => order.push(a.id);

        w.addActor({ id: 'player', loaded: true, visible: true, z: 0.5, isSprite: true });
        w.drawProps({ save: () => {}, restore: () => {} }, w.plane('deck'), 1000, 800);

        // The player must land between them: behind the near prop, in front of
        // the far one. That is the whole point of walking upstage.
        expect(order).toEqual(['behind', 'player', 'infront']);
    });

    it('defaults an actor with no depth to mid-floor rather than dropping it', () => {
        const w = scene([]);
        const a = { id: 'p', loaded: true, visible: true };
        w.addActor(a);
        expect(a.z).toBe(0.5);
        expect(a.isSprite).toBe(true);
    });
});

describe('deck layout', () => {
    it('spreads clutter through the depth of the roof, not along one line', () => {
        const zs = city.props
            .filter(p => p.plane === 'deck' && p.z != null)
            .map(p => p.z);
        expect(Math.min(...zs)).toBeLessThan(0.2);
        expect(Math.max(...zs)).toBeGreaterThan(0.8);
        expect(new Set(zs).size).toBeGreaterThan(20);
    });

    it('puts the enterable structures against the back wall', () => {
        for (const p of city.props.filter(p => p.door)) {
            expect(p.z, p.id).toBeGreaterThan(0.8);
        }
    });

    it('keeps the viewpoint furniture at the front edge, by the parapet', () => {
        const front = ['telescope', 'bench', 'railing'];
        for (const id of front) {
            expect(city.props.find(p => p.id === id).z, id).toBeLessThan(0.35);
        }
    });
});
