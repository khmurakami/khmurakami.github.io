import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Boots the real game module against a stubbed canvas.
 *
 * The unit tests cover each engine on its own, which is exactly why they cannot
 * catch the failure this change is most likely to cause: a scene swap that
 * leaves the loop drawing one place while collision resolves against another.
 * That kind of mistake is invisible to a unit test and obvious the instant the
 * thing runs, so something has to run it.
 *
 * jsdom has no canvas, so the 2D context is a recursive no-op proxy. That is
 * enough — the assertions are about which scene is live and where the character
 * is, not about pixels.
 */

/**
 * A context that answers any call without ever throwing.
 *
 * The handful of methods named explicitly are the ones whose *return value* is
 * used rather than discarded — the engine reads pixels back out of an
 * ImageData and calls addColorStop on a gradient, so those cannot be no-ops.
 */
function stubContext() {
    const real = {
        canvas: { width: 1200, height: 800 },
        createImageData: (w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
        getImageData: (_x, _y, w, h) => ({
            width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
        }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}),
        measureText: () => ({ width: 10 })
    };

    const handler = {
        get: (_t, key) => {
            if (key in real) return real[key];
            if (key === Symbol.toPrimitive) return () => 0;
            return () => new Proxy({}, handler);
        },
        set: () => true
    };
    return new Proxy({}, handler);
}

let frames;

beforeEach(() => {
    vi.resetModules();
    frames = [];
    clock = 0;

    document.body.innerHTML = `
        <div id="boot" aria-busy="true">
            <div class="boot-bar" data-boot-bar></div>
            <p class="boot-status" data-boot-status></p>
        </div>
        <canvas id="game"></canvas>
        <div id="door-prompt"></div>`;
    // Every canvas, not just the visible one: the post-processing pass builds
    // its own offscreen canvas for the grain tile.
    window.HTMLCanvasElement.prototype.getContext = () => stubContext();

    // Every image resolves, so the world loads its slots rather than hanging on
    // events jsdom never fires.
    vi.stubGlobal('Image', class {
        set src(_v) { queueMicrotask(() => this.onload && this.onload()); }
    });

    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }));
    vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });

    window.matchMedia = globalThis.matchMedia;
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.innerWidth = 1200;
    window.innerHeight = 800;
});

/**
 * A monotonic clock for the driven frames.
 *
 * Module-level rather than per-call: the loop derives dt from the gap between
 * timestamps, so a clock that restarts on every run() hands it dt = 0 and
 * nothing in the world ever moves.
 */
let clock = 0;

/** Runs n frames at a fixed step, driving the captured rAF callbacks. */
function run(n, stepMs = 16) {
    let t = clock;
    for (let i = 0; i < n; i++) {
        const cb = frames.pop();
        if (!cb) break;
        frames.length = 0;
        t += stepMs;
        clock = t;
        cb(t);
    }
}

/** Boots the module and waits for its load chain to settle. */
async function boot() {
    await import('../js/world-main.js');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
    return { key: (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k })) };
}

describe('booting the world', () => {
    it('starts on the roof and keeps drawing', async () => {
        await boot();
        expect(frames.length).toBeGreaterThan(0);
        run(5);
        // Still scheduling frames means nothing threw inside the loop — an
        // exception there stops the world silently, with the last frame left
        // on screen looking like a freeze rather than a crash.
        expect(frames.length).toBeGreaterThan(0);
    });

    it('walks, and survives every frame of it', async () => {
        const { key } = await boot();
        key('ArrowRight');
        run(30);
        expect(frames.length).toBeGreaterThan(0);
    });
});

const prompt = () => document.getElementById('door-prompt');

/**
 * The prompt as a player experiences it.
 *
 * Reading textContent alone is not enough: the pill is faded out rather than
 * emptied, so its last message is still sitting in the DOM long after it left
 * the screen.
 */
const promptText = () =>
    prompt().classList.contains('visible') ? prompt().textContent : '';

/**
 * Holds a direction and steps frames until `done()` is true.
 *
 * Walking a fixed number of frames and hoping to land in a doorway is how you
 * get a test that passes on one machine and not the next — the zones are only
 * 150px wide and the character walks straight through them.
 */
function walkUntil(dir, done, maxFrames = 900) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: dir }));
    let n = 0;
    while (n++ < maxFrames && !done()) run(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: dir }));
    run(1);
    return done();
}

describe('the boot screen', () => {
    const bootEl = () => document.getElementById('boot');

    it('is still up when loading finishes, and only lifts once a frame is drawn', async () => {
        await boot();

        // Loading is done here — every image has settled — but nothing has been
        // painted. Lifting now uncovers an unpainted canvas: a black flash that
        // reads as a crash on the finish line.
        expect(bootEl().classList.contains('gone'), 'lifted before the first frame').toBe(false);

        run(1);
        expect(bootEl().classList.contains('gone')).toBe(true);
        expect(bootEl().getAttribute('aria-busy')).toBe('false');
    });

    it('counts every distinct download in every scene, plus the character', async () => {
        const { city } = await import('../js/config/city.js');
        const { workshop } = await import('../js/config/workshop.js');
        const { stairwell } = await import('../js/config/stairwell.js');

        // Deduplicated per scene, because a prop reused across slots — every
        // chimney, every scattered puddle — is one download. Counting slots
        // instead would set a target the loader never reaches, and the bar
        // would stop short of the end on a perfectly good load.
        const distinct = (m) => new Set([
            ...m.backdrops.map(b => b.src),
            ...m.props.map(p => p.src)
        ]).size;
        // Plus the character sheet, plus the cat's poses — neither is a prop
        // slot, so both are fetched by hand and must still be counted or the
        // bar stops short of the end.
        const catPoses = Object.keys(city.critters.cat.poses).length;
        const expected = distinct(city) + distinct(workshop) + distinct(stairwell)
            + 1 + catPoses;

        await boot();
        const [settled, total] = document.querySelector('[data-boot-status]')
            .textContent.split('/').map(n => Number(n.trim()));

        expect(total).toBe(expected);
        expect(settled).toBe(total);
    });

    it('fills its bar rather than leaving it short on missing slots', async () => {
        // Most interior slots have no art yet and settle as errors. The bar
        // must still read as complete.
        await boot();
        run(1);
        const cells = [...document.querySelectorAll('.boot-cell')];
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.every(c => c.classList.contains('lit'))).toBe(true);
    });
});

describe('the door you spawn in front of', () => {
    // The stair hut is the first door in the world and the character starts
    // standing in it. Whatever it does is what a player learns doors do, so it
    // gets its own test rather than riding on the workshop's.
    it('offers the stairs immediately, and goes down them', async () => {
        const scenes = [];
        vi.spyOn(console, 'log').mockImplementation((m) => {
            if (typeof m === 'string' && m.startsWith('[scene]')) scenes.push(m);
        });

        const { key } = await boot();
        run(3);

        expect(promptText(), 'no prompt at the spawn point').toContain('Down the stairs');

        key('e');
        run(80);
        expect(scenes).toContain('[scene] stairwell');

        // And back out, without having to hunt for the door.
        expect(walkUntil('ArrowRight', () => promptText().includes('Back up to the roof')),
            'could not find the way out of the stairwell').toBe(true);
        key('e');
        run(80);
        expect(scenes).toEqual(['[scene] stairwell', '[scene] roof']);
    });

    it('reads the notices off the board rather than a borrowed project body', async () => {
        const { key } = await boot();
        run(3);
        key('e');
        run(80);

        // Downstage of the landing plant first — it stands between the door and
        // the board at arrival depth, and walking round it is what a player does.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        run(50);
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown' }));

        expect(walkUntil('ArrowLeft', () => promptText().includes('Read the notices')),
            'never reached the noticeboard').toBe(true);
        key('e');
        run(4);

        expect(document.body.textContent).toContain('khmurakami');
    });
});

describe('going inside', () => {
    it('walks into the shack, enters the workshop and comes back out', async () => {
        const scenes = [];
        vi.spyOn(console, 'log').mockImplementation((m) => {
            if (typeof m === 'string' && m.startsWith('[scene]')) scenes.push(m);
        });

        const { key } = await boot();
        run(2);

        // ── Out to the shack door ────────────────────────────────────
        expect(walkUntil('ArrowRight', () => promptText().includes('The workshop')),
            'never reached the shack doorway').toBe(true);

        key('e');
        // Past both halves of the fade.
        run(80);

        expect(scenes).toContain('[scene] workshop');

        // The prompt from the roof must not survive the threshold — a live
        // "press E" over a room you have already entered is the tell that the
        // swap did not reset the triggers.
        expect(promptText()).toBe('');
        expect(prompt().getAttribute('aria-hidden')).toBe('true');

        // ── And back out again ───────────────────────────────────────
        // Spawn is just inside the door, so a step east re-enters its zone.
        expect(walkUntil('ArrowRight', () => promptText().includes('Back out to the roof')),
            'could not find the way out of the workshop').toBe(true);

        key('e');
        run(80);

        expect(scenes).toContain('[scene] roof');
        expect(frames.length).toBeGreaterThan(0);
    });

    it('ignores input while the veil is up', async () => {
        const scenes = [];
        vi.spyOn(console, 'log').mockImplementation((m) => {
            if (typeof m === 'string' && m.startsWith('[scene]')) scenes.push(m);
        });

        const { key } = await boot();
        run(2);
        walkUntil('ArrowRight', () => promptText().includes('The workshop'));

        // Mash it. Every extra press during the fade would otherwise push
        // another return entry onto the stack, and leaving once would put you
        // back inside the room you just left.
        key('e'); key('e'); key('e');
        run(80);

        expect(scenes.filter(m => m === '[scene] workshop')).toHaveLength(1);

        walkUntil('ArrowRight', () => promptText().includes('Back out to the roof'));
        key('e');
        run(80);
        expect(scenes).toEqual(['[scene] workshop', '[scene] roof']);
    });
});

describe('panels opened from inside a room', () => {
    /**
     * Enters the workshop and stops in front of a named object.
     *
     * Steps downstage before heading west, because the workbench blocks the
     * lane you arrive on — which is the bench doing its job. A player walks
     * round it; so does this.
     */
    async function atObject(label) {
        const { key } = await boot();
        run(2);
        walkUntil('ArrowRight', () => promptText().includes('The workshop'));
        key('e');
        run(80);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        run(60);
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown' }));

        const found = walkUntil('ArrowLeft', () => promptText().includes(label));
        return { key, found };
    }

    it('opens the terminal from the bench', async () => {
        const { key, found } = await atObject('Use the terminal');
        expect(found, 'never reached the CRT').toBe(true);
        key('e');
        run(4);
        expect(document.querySelector('.panel-root.crt')).toBeTruthy();
    });

    it('serves site-level content from inside a room', async () => {
        // resumeFile and guestbook live on the roof manifest because they
        // belong to the site, not to a place. Reading them off the active
        // manifest gave the workshop terminal an undefined resume path, and
        // threw outright on the guestbook.
        const { key, found } = await atObject('Use the terminal');
        expect(found).toBe(true);
        key('e');
        run(4);

        const input = document.querySelector('.term input, .term-input')
            || document.querySelector('input');
        expect(input, 'terminal has no input').toBeTruthy();

        const type = (cmd) => {
            input.value = cmd;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            run(2);
        };

        type('resume');
        const download = document.querySelector('a[download]');
        expect(download, 'resume panel did not open').toBeTruthy();
        // The actual regression: this read `undefined` from the workshop
        // manifest, so the link pointed at a file called "undefined".
        expect(download.getAttribute('href')).toContain('resume.pdf');

        type('contact');
        // And this one threw, destructuring repo/labels off undefined.
        expect(document.querySelector('#gb-send'), 'guestbook did not open').toBeTruthy();
    });
});
