import { describe, it, expect, vi } from 'vitest';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { city } from '../js/config/city.js';
import { workshop } from '../js/config/workshop.js';
import { stairwell } from '../js/config/stairwell.js';

const cam = () => new Camera({ worldWidth: city.width, viewportWidth: 1000 });

describe('city manifest', () => {
    it('gives every prop a plane that exists', () => {
        const ids = new Set(city.planes.map(p => p.id));
        for (const p of city.props) expect(ids, p.id).toContain(p.plane);
        for (const b of city.backdrops) expect(ids, b.plane).toContain(b.plane);
    });

    it('places the actor plane in the stack', () => {
        expect(city.planes.map(p => p.id)).toContain(city.actorPlane);
    });

    it('keeps every prop inside the world bounds', () => {
        for (const p of city.props) {
            expect(p.x, p.id).toBeGreaterThanOrEqual(0);
            expect(p.x, p.id).toBeLessThanOrEqual(city.width);
        }
    });

    it('orders planes back to front by parallax', () => {
        const pk = city.planes.map(p => p.parallax);
        expect([...pk].sort((a, b) => a - b)).toEqual(pk);
    });

    it('gives every door on the roof its own action', () => {
        const actions = city.props.filter(p => p.door).map(p => p.door.action);
        expect(new Set(actions).size).toBe(actions.length);
    });

    it('leaves every section reachable, across the scene boundary', () => {
        // Sections used to be one door each on the roof. Projects now lives on
        // the pinboard inside the workshop, so the invariant is no longer "has
        // a door" — it is "can still be got to". Checking only the roof would
        // have gone quiet at exactly the moment a section became unreachable.
        const reachable = new Set([
            ...World.zonesFrom(city).map(z => z.action),
            ...World.zonesFrom(workshop).map(z => z.action),
            ...World.zonesFrom(stairwell).map(z => z.action)
        ]);

        for (const need of ['about', 'resume', 'projects', 'blog', 'contact']) {
            expect([...reachable], need).toContain(need);
        }
    });

    it('points every scene door at a scene that exists', () => {
        // `scene:` actions are strings, so a typo is a door that opens onto
        // nothing and simply does not respond.
        const known = { workshop, stairwell };
        const targets = World.zonesFrom(city)
            .filter(z => z.action.startsWith('scene:'))
            .map(z => z.action.slice('scene:'.length));

        expect(targets.length).toBeGreaterThan(0);
        for (const t of targets) expect(known[t], t).toBeTruthy();
    });
});

describe('World.doorsFrom', () => {
    it('derives triggers from the prop slots, so they cannot drift apart', () => {
        const doors = World.doorsFrom(city);
        const props = city.props.filter(p => p.door);
        expect(doors).toHaveLength(props.length);
        for (const d of doors) {
            const prop = city.props.find(p => p.id === d.id);
            expect(d.x).toBe(prop.x);          // trigger sits on the building
            expect(d.action).toBe(prop.door.action);
        }
    });

    it('spaces doors far enough apart that they cannot overlap', () => {
        const doors = World.doorsFrom(city).sort((a, b) => a.x - b.x);
        for (let i = 1; i < doors.length; i++) {
            const gap = doors[i].x - doors[i - 1].x;
            const halves = doors[i].width / 2 + doors[i - 1].width / 2;
            expect(gap, `${doors[i - 1].id}->${doors[i].id}`).toBeGreaterThan(halves);
        }
    });
});

describe('World rendering with missing art', () => {
    const build = () => {
        const w = new World(city, cam());
        w.camera.snapTo(560);
        return w;
    };

    it('draws a placeholder instead of failing when a slot has no image', () => {
        const w = build();
        const calls = [];
        w.placeholder = (_c, p) => calls.push(p.id);
        w.placeholderBand = () => {};
        w.draw({ save: () => {}, restore: () => {}, fillRect: () => {}, drawImage: () => {} }, 1000, 800);
        // Nothing is loaded, so every on-screen prop should be a placeholder.
        expect(calls.length).toBeGreaterThan(0);
        expect(calls).toContain('stair_hut');
    });

    it('culls props that are far off-screen', () => {
        const w = build();
        const drawn = [];
        w.placeholder = (_c, p) => drawn.push(p.id);
        w.placeholderBand = () => {};
        w.draw({ save: () => {}, restore: () => {}, fillRect: () => {}, drawImage: () => {} }, 1000, 800);
        // The radio mast sits at x=4200 while the camera is at ~60.
        expect(drawn).not.toContain('radio_mast');
    });

    it('applies haze for hazy planes and skips it otherwise', () => {
        const w = build();
        const fills = [];
        const ctx = {
            save: () => {}, restore: () => {}, fillRect: () => {}, drawImage: () => {},
            set fillStyle(v) { fills.push(v); }, get fillStyle() { return ''; }
        };
        w.applyAtmosphere(ctx, { id: 'skyline', parallax: 0.25, haze: 0.42 }, 1000, 800);
        expect(fills.some(f => String(f).startsWith('rgba(58,62,128'))).toBe(true);

        fills.length = 0;
        w.applyAtmosphere(ctx, { id: 'deck', parallax: 1, haze: 0 }, 1000, 800);
        expect(fills).toHaveLength(0);
    });
});

describe('scatter density', () => {
    it('builds a dense world from few unique assets', () => {
        const unique = new Set(city.props.map(p => p.src));
        expect(city.props.length).toBeGreaterThan(80);

        // Stated as a RATIO rather than a cap on the count.
        //
        // The invariant is "density without a generation per object", and a
        // fixed ceiling does not say that — it just fails every time the world
        // grows honestly, and gets bumped, which teaches nobody anything. What
        // matters is that each generated image keeps earning its place more
        // than once.
        const perAsset = city.props.length / unique.size;
        expect(perAsset, `${city.props.length} props from ${unique.size} images`)
            .toBeGreaterThan(2);
    });

    it('gives every scattered instance a unique id', () => {
        const ids = city.props.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('is deterministic — positions do not reshuffle between loads', async () => {
        const again = (await import('../js/config/city.js?fresh')).city;
        expect(again.props.map(p => p.x)).toEqual(city.props.map(p => p.x));
    });

    it('keeps scattered props inside the world', () => {
        for (const p of city.props) {
            expect(p.x, p.id).toBeGreaterThanOrEqual(0);
            expect(p.x, p.id).toBeLessThanOrEqual(city.width);
        }
    });
});

describe('interaction zones', () => {
    it('derives doors and interactables from the props that declare them', () => {
        const zones = World.zonesFrom(city);
        const declared = city.props.filter(p => p.door || p.interact);
        expect(zones).toHaveLength(declared.length);
        expect(zones.filter(z => z.kind === 'door')).toHaveLength(5);
        expect(zones.some(z => z.action === 'stargaze')).toBe(true);
    });

    it('puts the stargaze zone where nothing tall blocks the sky', () => {
        const gaze = World.zonesFrom(city).find(z => z.action === 'stargaze');
        // Foreground props are excluded deliberately: they are anchored to the
        // bottom of the frame and sit on the highest-parallax plane, so tilting
        // up sweeps them down and out of shot rather than into the sky.
        const blockers = city.props.filter(p =>
            p.plane !== 'fore' && p.height > 200 && Math.abs(p.x - gaze.x) < 400);
        expect(blockers.map(p => p.id)).toEqual([]);
    });
});

describe('camera look', () => {
    it('eases toward the target rather than snapping', () => {
        const c = cam();
        c.look(200);
        c.updateLook(0.016);
        expect(c.lookY).toBeGreaterThan(0);
        expect(c.lookY).toBeLessThan(200);
    });

    it('settles exactly on the target', () => {
        const c = cam();
        c.look(200);
        for (let i = 0; i < 300; i++) c.updateLook(0.016);
        expect(c.lookY).toBe(200);
    });

    it('shifts nearer planes further than distant ones when tilted', () => {
        const w = new World(city, cam());
        w.camera.lookY = 100;
        const sky = w.lookOffset(w.plane('sky'));
        const deck = w.lookOffset(w.plane('deck'));
        const fore = w.lookOffset(w.plane('fore'));
        expect(sky).toBeLessThan(deck);
        expect(deck).toBeLessThan(fore);
    });
});

describe('depth within a plane', () => {
    it('draws lower props last so they overlap ones standing further back', () => {
        const w = new World({
            ...city,
            props: [
                { id: 'back',  plane: 'deck', x: 100, y: 0.70, height: 100, src: 'a.png' },
                { id: 'front', plane: 'deck', x: 100, y: 0.85, height: 100, src: 'a.png' },
                { id: 'mid',   plane: 'deck', x: 100, y: 0.78, height: 100, src: 'a.png' }
            ]
        }, cam());
        const order = [];
        w.placeholder = (_c, p) => order.push(p.id);
        w.drawProps({ save: () => {}, restore: () => {} }, w.plane('deck'), 1000, 800);
        expect(order).toEqual(['back', 'mid', 'front']);
    });
});

describe('ambient motion', () => {
    const w = () => new World(city, cam());

    it('is still for props with no anim', () => {
        expect(w().animOffset({ id: 'x' })).toEqual({ dx: 0, dy: 0, rot: 0, dim: 1 });
    });

    it('gives each instance its own phase, so a row never moves in unison', () => {
        const world = w();
        world.time = 1.0;
        const a = world.animOffset({ id: 'planter_0', anim: { type: 'sway' } });
        const b = world.animOffset({ id: 'planter_1', anim: { type: 'sway' } });
        expect(a.dx).not.toBeCloseTo(b.dx, 3);
    });

    it('keeps flicker within a plausible range rather than blinking out', () => {
        const world = w();
        let min = 1, max = 0;
        for (let t = 0; t < 400; t++) {
            world.time = t * 0.02;
            const d = world.animOffset({ id: 'sign', anim: { type: 'flicker' } }).dim;
            min = Math.min(min, d); max = Math.max(max, d);
        }
        expect(min).toBeGreaterThan(0.2);
        expect(max).toBeLessThanOrEqual(1.01);
    });

    it('varies over time', () => {
        const world = w();
        world.time = 0;
        const a = world.animOffset({ id: 'lamp', anim: { type: 'bob' } }).dy;
        world.time = 1.7;
        const b = world.animOffset({ id: 'lamp', anim: { type: 'bob' } }).dy;
        expect(a).not.toBeCloseTo(b, 3);
    });
});

describe('lights', () => {
    it('attaches lights to things that should emit and not to inert clutter', () => {
        const lit = city.props.filter(p => p.light).map(p => p.id);
        expect(lit).toContain('greenhouse');
        expect(lit).toContain('radio_mast');
        expect(city.props.find(p => p.id === 'crates_0')?.light).toBeUndefined();
    });

    it('suppresses the ground pool for lights that are not near the floor', () => {
        expect(city.props.find(p => p.id === 'radio_mast').light.pool).toBe(false);
        expect(city.props.find(p => p.id === 'neon_sign').light.pool).toBe(false);
    });
});

describe('the world reacting to you without a prompt', () => {
    const w = () => {
        const c = new Camera({ worldWidth: city.width, viewportWidth: 1600 });
        return new World(city, c);
    };

    it('bends a plant away from you, both ways', () => {
        // Away from the player, not in a fixed direction, so walking back
        // through it bends it the other way.
        const world = w();
        const weed = city.props.find(p => p.brush);
        expect(weed, 'nothing declares brush').toBeTruthy();

        world.playerX = weed.x - 20;
        const left = world.brushOf(weed);
        world.playerX = weed.x + 20;
        const right = world.brushOf(weed);

        expect(left).toBeGreaterThan(0);
        expect(right).toBeLessThan(0);
        expect(left).toBeCloseTo(-right, 6);
    });

    it('eases the bend to nothing at the edge of reach, rather than snapping', () => {
        const world = w();
        const weed = city.props.find(p => p.brush);
        world.playerX = weed.x - weed.brush.reach;
        expect(world.brushOf(weed)).toBe(0);
        world.playerX = weed.x - weed.brush.reach * 0.98;
        expect(Math.abs(world.brushOf(weed))).toBeLessThan(0.1);
    });

    it('leaves props alone that never asked to be brushed', () => {
        const world = w();
        world.playerX = 1320;
        expect(world.brushOf(city.props.find(p => p.id === 'corrugated_shack'))).toBe(0);
    });

    it('does nothing at all before the player exists', () => {
        const world = w();
        world.playerX = null;
        expect(world.brushOf(city.props.find(p => p.brush))).toBe(0);
    });

    it('warms a sensor lamp as you approach and leaves it dim from afar', () => {
        const world = w();
        const lamp = city.props.find(p => p.motion);
        expect(lamp, 'nothing declares motion').toBeTruthy();

        world.playerX = lamp.x;
        const near = world.motionOf(lamp);
        world.playerX = lamp.x - lamp.motion.reach * 2;
        const far = world.motionOf(lamp);

        expect(near).toBeCloseTo(1, 5);
        expect(far).toBeCloseTo(lamp.motion.min, 5);
        expect(near).toBeGreaterThan(far);
    });

    it('leaves an ordinary lamp at full brightness', () => {
        const world = w();
        world.playerX = 0;
        expect(world.motionOf(city.props.find(p => p.id === 'stair_hut'))).toBe(1);
    });
});
