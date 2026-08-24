/**
 * What every `action` in a manifest actually does.
 *
 * The manifest is the contract: a prop declares `interact: { action: 'radio' }`
 * and the engine is not supposed to know what a radio is. That held everywhere
 * except here — the main loop carried a seventeen-case `switch` naming every
 * panel in the site, so adding a prop meant editing the game loop, and an
 * action the switch had never heard of failed at runtime with a `console.log`.
 *
 * This is the other half of the contract. A manifest names an action; this file
 * says what it does; the loop knows neither. Adding something to the world is
 * one manifest entry and one line here.
 *
 * A handler is called with a context of the things that belong to the PLAYER
 * rather than to any room — the panel, the audio, the scene manager — so a
 * handler never reaches for a global and can be tested by passing a fake.
 *
 * Ids ending in `:` are prefixes: `project:rooftop-world` runs the `project:`
 * handler with `rooftop-world`.
 */
import {
    projectPanel, blogPanel, resumePanel, guestbookPanel, buildTerminal,
    pipelinePanel, palettePanel, manifestPanel, cotPanel,
    aboutPanel, stairwellPanel, coatsPanel, gardenPanel
} from '../content.js';
import { site } from './site.js';

/** Opens a panel from a `{ title, html }` builder. The commonest shape. */
const panelFrom = (build) => (ctx) => {
    const { title, html } = build();
    ctx.panel.open(title, html);
};

/** Opens a panel that also needs wiring up once its markup is in the DOM. */
const wiredPanelFrom = (build) => (ctx) => {
    const p = build();
    ctx.panel.open(p.title, p.html);
    p.wire(ctx.panel.bodyEl);
};

export const actions = {
    // ── Going places ─────────────────────────────────────────────
    //
    // Checked before anything else by `runAction`, so a scene can never be
    // shadowed by a panel that happens to share its name.
    'scene:': (ctx, id) => ctx.enterScene(id),
    leave: (ctx) => ctx.leaveScene(),

    // ── The roof ─────────────────────────────────────────────────
    'project:': (ctx, id) => {
        const { title, html } = projectPanel(id);
        ctx.panel.open(title, html);
    },

    terminal: (ctx) => {
        const term = buildTerminal({ open: (a) => runAction(a, ctx), resumeFile: site.resumeFile });
        ctx.panel.open('rooftop terminal', term.mount(), { variant: 'crt' });
        term.input.focus();
    },

    // One name per thing.
    //
    // There were two more here — `blog` beside `blogstack`, and `contact`
    // beside `guestbook` — because two props opened each panel under two names.
    // Now that each panel is reached from exactly one object, the aliases had
    // no callers at all: the terminal maps its own `blog` and `contact` words
    // onto these before asking.
    blogstack: panelFrom(blogPanel),
    resume: panelFrom(() => resumePanel(site.resumeFile)),
    guestbook: wiredPanelFrom(() => guestbookPanel(site.guestbook)),
    about: panelFrom(aboutPanel),
    projects: panelFrom(() => projectPanel('isometric-room')),
    vending: (ctx) => ctx.panel.open('Vending machine',
        '<p class="lede">Out of order. Of course.</p>'),

    garden: panelFrom(gardenPanel),

    stargaze: (ctx) => ctx.toggleGaze(),
    // The flock is the whole interaction; there is nothing to open.
    pigeons: (ctx, _arg, zone) => ctx.startle(zone ? zone.x : 0),

    // ── The workshop ─────────────────────────────────────────────
    pipeline: panelFrom(pipelinePanel),
    palette: wiredPanelFrom(palettePanel),
    manifest: panelFrom(manifestPanel),
    cot: panelFrom(cotPanel),

    // ── The landing ──────────────────────────────────────────────
    stairwell: panelFrom(stairwellPanel),
    coats: panelFrom(coatsPanel),

    radio: (ctx) => {
        // Diegetic mute. The prompt reports the new state, because the only
        // feedback for turning sound off is that nothing happens.
        const muted = ctx.audio.toggleMute();
        ctx.say(muted ? 'The radio clicks off.' : 'The radio warms back up.');
    }
};

/** Every prefix handler, longest first so `a:b:` would beat `a:`. */
const PREFIXES = Object.keys(actions)
    .filter(k => k.endsWith(':'))
    .sort((a, b) => b.length - a.length);

/**
 * Runs one action id.
 *
 * @param {string} action  From a manifest's `interact.action` or a door.
 * @param {Object} ctx     `{ panel, audio, say, enterScene, leaveScene, toggleGaze, startle }`
 * @param {Object} [zone]  The trigger zone it came from, where there is one.
 * @returns {boolean} False if nothing is registered for it.
 */
export function runAction(action, ctx, zone) {
    if (typeof action !== 'string' || !action) return false;

    for (const prefix of PREFIXES) {
        if (action.startsWith(prefix)) {
            actions[prefix](ctx, action.slice(prefix.length), zone);
            return true;
        }
    }

    const handler = actions[action];
    if (!handler) return false;
    handler(ctx, null, zone);
    return true;
}

/** Every action id the world can name. Used by the tests to check the manifests. */
export function knownActions() {
    return Object.keys(actions);
}
