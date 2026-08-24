/**
 * Nothing grows without bound while the world is played.
 *
 * This is a page somebody might leave open. A rooftop that quietly accumulates
 * a listener per panel, a DOM node per transition or a particle per splash is
 * fine for the first minute and unusable after an hour — and it is invisible
 * until then, which is exactly the kind of fault the rest of this suite exists
 * to catch.
 *
 * Everything here works the same way: take a measurement, do a lot of the thing,
 * take it again. No reading of code, no reasoning about who owns what.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';
import { Terrain } from '../js/engine/Terrain.js';
import { Effects } from '../js/engine/Effects.js';
import { Steam } from '../js/engine/Steam.js';
import { Critters } from '../js/engine/Critters.js';
import { Ambient } from '../js/engine/Ambient.js';
import { Panel } from '../js/engine/Panel.js';
import { SceneManager } from '../js/engine/SceneManager.js';
import { city } from '../js/config/city.js';
import { scenes, START_SCENE } from '../js/config/scenes.js';
import { runAction } from '../js/config/actions.js';

/** Counts listeners added to document and window, without removing behaviour. */
function watchListeners() {
    const counts = { added: 0, removed: 0 };
    const targets = [document, window];
    const originals = targets.map(t => [t.addEventListener, t.removeEventListener]);

    targets.forEach((t) => {
        const add = t.addEventListener.bind(t);
        const remove = t.removeEventListener.bind(t);
        t.addEventListener = (...a) => { counts.added++; return add(...a); };
        t.removeEventListener = (...a) => { counts.removed++; return remove(...a); };
    });

    return {
        counts,
        get live() { return counts.added - counts.removed; },
        restore() {
            targets.forEach((t, i) => {
                t.addEventListener = originals[i][0];
                t.removeEventListener = originals[i][1];
            });
        }
    };
}

function stubContext() {
    const noop = () => {};
    const real = {
        canvas: { width: 800, height: 450 },
        createImageData: (w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
        getImageData: (_x, _y, w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createPattern: () => ({}),
        measureText: () => ({ width: 10 })
    };
    const handler = {
        get: (_t, k) => (k in real ? real[k] : (k === Symbol.toPrimitive
            ? () => 0 : () => new Proxy({}, handler))),
        set: () => true
    };
    return new Proxy({}, handler);
}

describe('opening panels over and over', () => {
    let listeners;

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="panel-root" hidden>
                <h2 class="panel-title"></h2>
                <div class="panel-body"></div>
                <button data-close>x</button>
            </div>`;
        window.HTMLCanvasElement.prototype.getContext = () => stubContext();
        listeners = watchListeners();
    });

    afterEach(() => listeners.restore());

    it('adds no page-level listener per open', () => {
        const panel = new Panel({ reducedMotion: true });
        const ctx = {
            panel,
            audio: { toggleMute: () => true },
            say: () => {},
            enterScene: () => {},
            leaveScene: () => {},
            toggleGaze: () => {},
            startle: () => {}
        };

        // One panel with a builder that wires listeners, one with a terminal,
        // one plain — opened many times over, as a visitor would.
        runAction('about', ctx);
        const baseline = listeners.live;

        for (let i = 0; i < 40; i++) {
            runAction('about', ctx);
            runAction('guestbook', ctx);
            runAction('terminal', ctx);
            panel.close();
        }

        expect(listeners.live).toBe(baseline);
    });

    it('leaves no DOM behind when the body is replaced', () => {
        const panel = new Panel({ reducedMotion: true });
        const count = () => document.querySelectorAll('*').length;

        panel.open('a', '<p>one</p>');
        const baseline = count();

        for (let i = 0; i < 50; i++) {
            panel.open('b', `<div><span>${i}</span><button>go</button></div>`);
            panel.open('a', '<p>one</p>');
        }

        expect(count()).toBe(baseline);
    });
});

describe('running the world for a long time', () => {
    const build = () => {
        const camera = new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(city, camera);
        world.terrain = new Terrain(city.platforms);
        world.fx = new Effects();
        world.wind = { value: 0.3, atX: () => 0.3, update: () => {} };
        return { world, camera };
    };

    beforeEach(() => {
        window.HTMLCanvasElement.prototype.getContext = () => stubContext();
    });

    it('keeps the baked-tile cache bounded', () => {
        const { world, camera } = build();
        const ctx = stubContext();

        for (let f = 0; f < 600; f++) {
            camera.snapTo((f * 37) % city.width);
            world.update(f * 16.7);
            world.draw(ctx, 800, 450);
        }

        expect(world.fx.tiles.size).toBeLessThanOrEqual(Effects.TILE_CACHE_LIMIT);
    });

    it('does not accumulate steam', () => {
        const steam = new Steam(city.props);
        for (let f = 0; f < 200; f++) steam.update(1 / 60, 0.4);
        const settled = steam.puffs.length;

        for (let f = 0; f < 2000; f++) steam.update(1 / 60, 0.4);

        // Plumes are continuous, so the count settles rather than falling to
        // zero. What matters is that ten times the frames is not ten times the
        // puffs.
        expect(steam.puffs.length).toBeLessThan(settled * 2 + 20);
    });

    it('does not accumulate birds, however often they are startled', () => {
        const ambient = new Ambient({ worldWidth: city.width });

        for (let i = 0; i < 300; i++) {
            ambient.startle(1000 + i);
            ambient.update(1 / 60);
        }
        // Let them all age out.
        for (let f = 0; f < 2000; f++) ambient.update(1 / 60);

        expect(ambient.birds.length).toBe(0);
    });

    it('does not accumulate splash ripples', () => {
        const fx = new Effects();
        for (let i = 0; i < 5000; i++) fx.splash(i, 0.5, i);

        // A fixed pool, deliberately: splashes are spawned by walking and a
        // growing array would be a leak you could stroll into.
        expect(fx.ripples.length).toBeLessThanOrEqual(16);
    });

    it('does not accumulate critters across scene resets', () => {
        const critters = new Critters(city);
        const before = critters.moths.length;

        for (let i = 0; i < 100; i++) {
            for (let f = 0; f < 30; f++) critters.update(1 / 60, 1000);
            critters.reset();
        }

        expect(critters.moths.length).toBe(before);
    });
});

describe('walking in and out of rooms', () => {
    it('does not grow the scene stack when entering and leaving in pairs', () => {
        const manager = new SceneManager({ scenes, start: START_SCENE });
        manager.onSwap = () => {};

        const run = (seconds) => {
            for (let i = 0; i < seconds * 60; i++) manager.update(1 / 60);
        };

        for (let i = 0; i < 50; i++) {
            manager.enter('workshop', { x: 100, z: 0.5, facing: 'right' });
            run(1);
            manager.leave();
            run(1);
        }

        expect(manager.stack.length).toBe(0);
        expect(manager.activeId).toBe(START_SCENE);
    });

    it('does not add the character to a scene twice', () => {
        // The character is the player's, not a scene's, and the interiors pick
        // them up as they finish streaming — so there are two places that could
        // add them and one scene that could receive them twice.
        const camera = new Camera({
            worldWidth: city.width, viewportWidth: 1600, pixelScale: 2
        });
        const world = new World(city, camera);
        const actor = { id: 'character', isSprite: true, loaded: true, visible: true, z: 0.5 };

        world.addActor(actor);
        world.addActor(actor);

        expect(world.actors.filter(a => a.id === 'character')).toHaveLength(1);
    });
});
