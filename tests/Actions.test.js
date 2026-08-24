/**
 * Every action a manifest names has somewhere to go.
 *
 * The manifest is the contract, but the other half of it — what an action
 * actually does — used to be a seventeen-case `switch` in the game loop. An
 * action the switch had never heard of fell through to `default` and printed a
 * line to the console, so a typo in a manifest was a prop you could walk up to,
 * be prompted by, press E on, and have nothing happen. Nothing failed; it just
 * did not work.
 *
 * This closes the contract at both ends: the registry is data now, and CI walks
 * every scene checking that each declared action resolves.
 */
import { describe, it, expect, vi } from 'vitest';
import { runAction, actions, knownActions } from '../js/config/actions.js';
import { scenes } from '../js/config/scenes.js';

/** Every action id declared anywhere in the world, with where it came from. */
function declaredActions() {
    const found = [];
    for (const { id: scene, manifest } of scenes) {
        for (const prop of manifest.props) {
            if (prop.interact) found.push({ scene, prop: prop.id, action: prop.interact.action });
            if (prop.door) found.push({ scene, prop: prop.id, action: prop.door.action });
        }
    }
    return found.filter(f => f.action);
}

/**
 * A context that records instead of opening anything.
 *
 * `panel.open` still puts the markup into `bodyEl`, because a wired panel goes
 * looking for its own elements there straight afterwards — a spy that only
 * records the call would pass while the real thing threw.
 */
function spyContext() {
    const bodyEl = document.createElement('div');
    return {
        panel: {
            bodyEl,
            open: vi.fn((_title, html) => {
                if (typeof html === 'string') bodyEl.innerHTML = html;
            })
        },
        audio: { toggleMute: vi.fn(() => true) },
        say: vi.fn(),
        enterScene: vi.fn(),
        leaveScene: vi.fn(),
        toggleGaze: vi.fn(),
        startle: vi.fn()
    };
}

describe('the action registry', () => {
    it('resolves every action declared in every scene', () => {
        const unresolved = declaredActions().filter(({ action }) => {
            const ctx = spyContext();
            // A `project:` action also has to name a project that exists, which
            // `projectPanel` reports by opening a "Not found" panel.
            return !runAction(action, ctx);
        });

        expect(unresolved, `unregistered actions: ${JSON.stringify(unresolved)}`)
            .toEqual([]);
    });

    it('every `project:` action names a project that exists', () => {
        const ctx = spyContext();
        const missing = declaredActions()
            .filter(f => f.action.startsWith('project:'))
            .filter(f => {
                ctx.panel.open.mockClear();
                runAction(f.action, ctx);
                const [, html] = ctx.panel.open.mock.calls[0];
                return html.includes('Not found');
            });

        expect(missing, `props pointing at no project: ${JSON.stringify(missing)}`)
            .toEqual([]);
    });

    it('every `scene:` action names a scene that exists', () => {
        const ids = new Set(scenes.map(s => s.id));
        const bad = declaredActions()
            .filter(f => f.action.startsWith('scene:'))
            .filter(f => !ids.has(f.action.slice('scene:'.length)));

        expect(bad, `doors onto nowhere: ${JSON.stringify(bad)}`).toEqual([]);
    });

    it('reports an unregistered action instead of failing quietly', () => {
        expect(runAction('no-such-thing', spyContext())).toBe(false);
    });

    it('ignores a missing or malformed action rather than throwing', () => {
        const ctx = spyContext();
        expect(runAction(undefined, ctx)).toBe(false);
        expect(runAction('', ctx)).toBe(false);
        expect(runAction(null, ctx)).toBe(false);
    });
});

describe('what the handlers do', () => {
    it('going somewhere is checked before opening something', () => {
        // `stairwell` is BOTH a scene id and a panel. The prefix wins, so a
        // door can never be shadowed by a panel that shares its name.
        const ctx = spyContext();
        runAction('scene:stairwell', ctx);
        expect(ctx.enterScene).toHaveBeenCalledWith('stairwell');
        expect(ctx.panel.open).not.toHaveBeenCalled();
    });

    it('the radio toggles the mute and says which way it went', () => {
        const ctx = spyContext();
        runAction('radio', ctx);
        expect(ctx.audio.toggleMute).toHaveBeenCalled();
        expect(ctx.say).toHaveBeenCalledWith(expect.stringMatching(/clicks off/));
    });

    it('the pigeons startle at the zone they were triggered from', () => {
        const ctx = spyContext();
        runAction('pigeons', ctx, { x: 4260 });
        expect(ctx.startle).toHaveBeenCalledWith(4260);
    });

    it('a panel handler opens exactly one panel', () => {
        const ctx = spyContext();
        runAction('about', ctx);
        expect(ctx.panel.open).toHaveBeenCalledTimes(1);
    });

    it('a wired panel is wired after opening', () => {
        const ctx = spyContext();
        runAction('guestbook', ctx);
        expect(ctx.panel.open).toHaveBeenCalled();
        // `wire` runs against the panel body, and the guestbook's send button
        // has to be listening by the time it returns.
        expect(ctx.panel.bodyEl.querySelector('#gb-send')).toBeTruthy();
    });

    it('is a plain object, so a scene can be added without touching the loop', () => {
        expect(knownActions().length).toBe(Object.keys(actions).length);
        expect(typeof actions.about).toBe('function');
    });
});
