import { Camera } from './engine/Camera.js';
import { World } from './engine/World.js';
import { Triggers } from './engine/Triggers.js';
import { Starfield } from './engine/Starfield.js';
import { Effects } from './engine/Effects.js';
import { Wind } from './engine/Wind.js';
import { Ambient } from './engine/Ambient.js';
import { Audio } from './engine/Audio.js';
import { Panel } from './engine/Panel.js';
import { BootScreen } from './engine/BootScreen.js';
import { Terrain } from './engine/Terrain.js';
import { directionFor, clipFor } from './engine/direction.js';
import { intent } from './engine/locomotion.js';
import { Collision } from './engine/Collision.js';
import { Walkway } from './engine/Walkway.js';
import { Steam } from './engine/Steam.js';
import { Critters, CatActor } from './engine/Critters.js';
import { SceneManager } from './engine/SceneManager.js';
import { projectPanel, blogPanel, resumePanel, guestbookPanel, buildTerminal,
         pipelinePanel, palettePanel, manifestPanel, cotPanel,
         aboutPanel, stairwellPanel, coatsPanel } from './content.js';
import { city } from './config/city.js';
import { workshop } from './config/workshop.js';
import { stairwell } from './config/stairwell.js';

const BUILD = 'city-1';
console.log(`[build] ${BUILD} — slot-based 2.5D side-scroller`);

const canvas = document.getElementById('game');
const display = canvas.getContext('2d');
const promptEl = document.getElementById('door-prompt');

/**
 * THE PIXEL PIPELINE.
 *
 * The world is drawn once into a low-resolution offscreen buffer and then
 * blitted to the display at a WHOLE-NUMBER scale. This is the thing that
 * separates pixel art from art that happens to be made of small squares.
 *
 * Before this, every prop was drawn straight to a full-resolution canvas at
 * fractional coordinates with smoothing off. Nearest-neighbour sampling at a
 * fractional destination makes rows and columns of pixels double or vanish as
 * a sprite moves — "pixel swim", the loudest amateur tell there is — and the
 * scale was not integer either: one art pixel covered anywhere from 1.53 to
 * 2.03 display pixels at 900p, varying continuously with depth, so pixels were
 * different sizes within a single frame.
 *
 * The buffer size is chosen so ART pixels land 1:1. The assets were quantised
 * at block 2, so one art pixel is two source pixels; at a scale of 2 that lands
 * almost exactly on one buffer pixel and displays as a clean 2x2 block.
 *
 * Field of view and object sizes are UNCHANGED. Everything about the world
 * stays in world px — only `Camera.toScreen` divides — so the same amount of
 * roof is on screen and nothing needed re-authoring.
 */
const buffer = document.createElement('canvas');
const ctx = buffer.getContext('2d');

/**
 * Render pixels per display pixel.
 *
 * Derived from the window so the art keeps landing near 1:1 on a big monitor
 * instead of getting finer and finer. Set to 1 to render at native resolution
 * exactly as before — this is the one number to change if the chunkiness is
 * ever wrong.
 */
function pixelScaleFor(displayHeight) {
    const ART_BLOCK = 2;   // matches `pixelate.py --block 2`
    return Math.max(1, Math.min(4,
        Math.round(displayHeight / city.referenceHeight * ART_BLOCK)));
}

let renderW = 1, renderH = 1, pixelScale = 1;

/**
 * How much of the world fits on screen, whatever shape the screen is.
 *
 * The camera used to show exactly `window.innerWidth` world pixels, which is
 * fine on a laptop and broken on a phone: a 390px portrait screen saw SIX PER
 * CENT of the roof. A narrow screen is nearly as tall as a laptop, so the
 * character came out full size with almost no world beside them.
 *
 * The world is composed against a design viewport and fitted to the real one
 * instead, so both the sizes and the spacing scale together and the composition
 * survives. On a 16:9 window this produces exactly what it replaced.
 *
 * The floor stops it shrinking so far that the character stops reading — past
 * that point a portrait phone shows less roof rather than a smaller world,
 * which is the better trade.
 */
const DESIGN = { width: 1600, height: World.DESIGN_HEIGHT };
const MIN_VIEW_SCALE = 0.42;
const MAX_VIEW_SCALE = 1.6;

function viewScaleFor(w, h) {
    const fit = Math.min(w / DESIGN.width, h / DESIGN.height);
    return Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, fit));
}

const camera = new Camera({ worldWidth: city.width, viewportWidth: window.innerWidth });

// Lights, shadows and post live in the engine, not painted into the art — a
// baked lamp cannot flicker and a baked shadow cannot move.
const fx = new Effects();
// One wind for the whole world; every swaying prop reads from it. Shared across
// scenes, so a gust that starts outside is still blowing when you step in.
const wind = new Wind(city.wind);

const ambient = new Ambient({ worldWidth: city.width });
const audio = new Audio();

/**
 * Everything that is derived from a manifest, built once per place.
 *
 * A scene is a manifest, so each one needs its own World, Collision, Terrain and
 * Triggers. The camera, wind, effects, audio, panel and the character are the
 * player's, not the place's, and are shared across all of them.
 */
function buildScene(manifest) {
    const w = new World(manifest, camera);
    w.fx = fx;
    w.wind = wind;
    w.terrain = new Terrain(manifest.platforms);
    // The route. Assigned onto the World as well, because World draws the worn
    // path from it — the visible floor and the walkable floor are one object.
    w.walkway = manifest.walkway ? new Walkway(manifest.walkway) : null;
    // Emitters are declared on the props themselves, so a scene with no vents
    // simply has no plumes rather than needing to opt out.
    const steam = new Steam(manifest.props);
    const critters = new Critters(manifest);

    // Plumes go down with the floor's own hook, which runs before the props are
    // drawn — so a vent at the back of the roof is drawn over its own steam and
    // nearer things still overlap it.
    w.hooks[manifest.actorPlane] = (c, vw, vh) => {
        fx.drawRipples(c, w, vh);
        steam.draw(c, w, vh);
        critters.drawPigeons(c, w, vh);
    };

    return {
        manifest,
        world: w,
        terrain: w.terrain,
        walkway: w.walkway,
        steam,
        // Solid props. Without this the world is a painting you walk through.
        collision: new Collision(manifest.props, manifest.collision),
        critters,
        // Doors and other interactables share one trigger manager, so only one
        // prompt can ever be active and they cannot fight over it. Zones are
        // derived from the prop slots, so a door can never drift out of sync
        // with the thing it belongs to.
        doors: new Triggers(World.zonesFrom(manifest))
    };
}

const built = {
    roof: buildScene(city),
    workshop: buildScene(workshop),
    stairwell: buildScene(stairwell)
};

const manager = new SceneManager({
    scenes: [
        { id: 'roof', manifest: city, spawn: { x: city.actor.place.x, z: 0.45 } },
        { id: 'workshop', manifest: workshop, spawn: workshop.spawn, facing: workshop.facing },
        { id: 'stairwell', manifest: stairwell, spawn: stairwell.spawn, facing: stairwell.facing }
    ],
    start: 'roof'
});

/** The active scene's engines. Reassigned at the midpoint of every fade. */
let here = built.roof;
/** The active manifest. Read for every tuning value the loop needs. */
let world = city;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const boot = new BootScreen({
    root: document.getElementById('boot'),
    reducedMotion
});
const panel = new Panel({ reducedMotion });
// Movement stops while a panel is open, so the character cannot wander off
// behind the reader's back.
panel.onClose = () => { held = 0; heldZ = 0; targetX = null; vx = 0; };

const stars = new Starfield({ worldWidth: city.width, ...city.starfield });

/** A clock that does not restart when you walk through a door. */
const scene0 = { time: 0 };

// Ambient life slots into the depth stack rather than being drawn over the
// finished frame, so the plane sits behind the skyline and birds in front of it.
// It hangs off the roof scene alone: there is no sky, no skyline and no flock
// inside a shed, and hooking a scene that has no such planes would draw nothing
// anyway — better that the sky belongs to the place that has one.
built.roof.world.hooks.sky = (ctx, vw, vh) => {
    stars.draw(ctx, camera, vw, vh, performance.now(), starIntensity);
    ambient.drawPlane(ctx, camera, vw, vh, 0.05);
    // The airship goes in FRONT of the aeroplane: it is lower and much nearer,
    // and a blimp passing behind a dot on the horizon would read as wrong.
    ambient.drawBlimp(ctx, camera, vw, vh, 0.05,
        ambient.sprites ? ambient.sprites.blimp : null);
    ambient.drawMeteor(ctx, vw, vh);
};
// Lit windows on all three bands, each at its own parallax, so the city has
// rooms at three distances instead of one lit layer with flats behind it.
built.roof.world.hooks.skyline_far =
    (ctx, vw, vh) => ambient.drawSkyline(ctx, camera, vw, vh, 0.15, 0);
built.roof.world.hooks.skyline = (ctx, vw, vh) => {
    ambient.drawSkyline(ctx, camera, vw, vh, 0.25, 1);
    // The beam belongs to a building on this band, so it pans with it.
    ambient.drawSearchlight(ctx, camera, vw, vh, 0.25,
        ambient.sprites ? ambient.sprites.searchlight : null);
};
built.roof.world.hooks.skyline_near =
    (ctx, vw, vh) => ambient.drawSkyline(ctx, camera, vw, vh, 0.38, 2);
built.roof.world.hooks.deck = (ctx, vw, vh) => {
    fx.drawRipples(ctx, built.roof.world, vh);
    built.roof.steam.draw(ctx, built.roof.world, vh);
    built.roof.critters.drawPigeons(ctx, built.roof.world, vh);
    ambient.drawBirds(ctx, camera, vw, vh, 1.0);
};

const character = World.actorFromEntry(city.actor);

// ── State ────────────────────────────────────────────────────────
let charX = city.actor.place.x;
let targetX = null;           // click-to-walk destination, null when none
let held = 0;                 // -1 / 0 / +1 from the keyboard
let heldZ = 0;                // -1 back / +1 front, depth movement
let running = false;
/** Carried between frames so the character has weight; see locomotion.js. */
let vx = 0;
let charZ = 0.45;             // 0 = front edge of the roof, 1 = back wall
let facing = 'right';         // 'left' | 'right' | 'up' | 'down'
let activeDoor = null;
let gazing = false;
let starIntensity = city.starfield.idleIntensity;
let stepPhase = 0;
/** Seconds the character has been standing still; drives the idle glances. */
let stillFor = 0;
let glanceUntil = 0;
let glanceDir = 'down';
let startledAt = -1e9;

/** Last size actually applied, so a no-op resize does not rebuild the buffer. */
let sizedFor = '';

function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Mobile browsers fire resize constantly as the URL bar slides away and
    // whenever a keyboard opens, and each one used to reallocate both canvases
    // and throw away every baked dither tile. Bailing on an unchanged size
    // makes those free.
    const key = `${w}x${h}`;
    if (key === sizedFor) return;
    sizedFor = key;

    pixelScale = pixelScaleFor(h);

    // The buffer is the display divided by the scale, rounded UP, so blitting
    // it back at exactly `pixelScale` covers the window with no gap and no
    // fractional final scale. A pixel on screen is always an exact square of
    // pixelScale x pixelScale device pixels.
    renderW = Math.ceil(w / pixelScale);
    renderH = Math.ceil(h / pixelScale);
    buffer.width = renderW;
    buffer.height = renderH;

    // The display canvas stays at 1 CSS px per device px. Going through the
    // DPR here would defeat the whole point: the buffer is already the
    // authority on resolution, and multiplying it by 1.5 would put us straight
    // back on fractional pixels.
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Nearest-neighbour on BOTH contexts. Smoothing on the blit would blur the
    // upscale into mush, which is the exact opposite of the intent.
    ctx.imageSmoothingEnabled = false;
    display.imageSmoothingEnabled = false;

    const viewScale = viewScaleFor(w, h);

    // World px visible, which is now a design decision rather than whatever the
    // window happens to be.
    camera.viewportWidth = w / viewScale;

    // One number carries both scales. `toScreen` divides by it, and `unit`
    // divides by it, so a change in either moves positions and sizes together —
    // which is the whole reason the composition survives a phone.
    camera.pixelScale = pixelScale / viewScale;
}

// ── Input ────────────────────────────────────────────────────────
const LEFT = ['ArrowLeft', 'a', 'A'];
const RIGHT = ['ArrowRight', 'd', 'D'];
const UP = ['ArrowUp', 'w', 'W'];      // walk upstage, into the scene
const DOWN = ['ArrowDown', 's', 'S'];  // walk downstage, toward the parapet

const startAudio = () => audio.resume();
window.addEventListener('keydown', startAudio, { once: true });
window.addEventListener('pointerdown', startAudio, { once: true });

window.addEventListener('keydown', (e) => {
    if (panel.isOpen || manager.busy) return;
    if (e.key === 'Shift') running = true;
    if (e.key === 'm' || e.key === 'M') {
        const muted = audio.toggleMute();
        console.log(`[audio] ${muted ? 'muted' : 'unmuted'}`);
    }
    if (LEFT.includes(e.key)) { held = -1; targetX = null; }
    if (RIGHT.includes(e.key)) { held = 1; targetX = null; }
    if (UP.includes(e.key)) { heldZ = 1; e.preventDefault(); }
    if (DOWN.includes(e.key)) { heldZ = -1; e.preventDefault(); }
    if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter') && activeDoor) {
        interact(activeDoor);
    }
    if (e.key === 'Escape' && gazing) setGazing(false);
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') running = false;
    if (LEFT.includes(e.key) && held === -1) held = 0;
    if (RIGHT.includes(e.key) && held === 1) held = 0;
    if (UP.includes(e.key) && heldZ === 1) heldZ = 0;
    if (DOWN.includes(e.key) && heldZ === -1) heldZ = 0;
});

// Click anywhere on the ground to walk there.
canvas.addEventListener('click', (e) => {
    if (panel.isOpen || manager.busy) return;
    if (promptEl.contains(e.target)) return;
    targetX = camera.renderX + e.clientX;
    held = 0;
    heldZ = 0;

    // Clicking also picks a depth, by reading where on the floor you clicked.
    // Clamped to the route like every other way of moving — otherwise a click
    // on the sky is a free teleport into the back wall, which is the one input
    // that could put you somewhere walking never can.
    const d = world.deck;
    if (d) {
        const frac = e.clientY / window.innerHeight;
        const z = Math.max(0, Math.min(1, (d.frontY - frac) / (d.frontY - d.backY)));
        charZ = here.walkway ? here.walkway.clamp(charX, z) : z;
    }
});

function setGazing(on) {
    // Only the roof has anything to look up at.
    if (on && !world.lookUpOffset) return;
    gazing = on;
    camera.look(on ? world.lookUpOffset : 0);
    if (on) {
        promptEl.setAttribute('aria-hidden', 'false');
        promptEl.textContent = touchOnly
            ? 'Tap here to look back down'
            : 'Press Esc to look back down';
        promptEl.classList.add('visible');
    } else {
        promptEl.textContent = '';
        hidePrompt();
    }
}

// ── Moving between places ────────────────────────────────────────
//
// The swap itself is one function, called by the manager at the midpoint of its
// fade. Doing it there rather than at the keypress is the whole reason for the
// veil: the character, the camera and every engine change over while the screen
// is black, so none of it is ever seen happening.
manager.onSwap = (next, spawn) => {
    // The scene being left stops being simulated, so anything mid-flight in it
    // would hang frozen until the tab closes.
    here.steam.clear();
    here.critters.reset();

    here = built[next.id];
    world = next.manifest;

    charX = spawn.x;
    charZ = here.walkway ? here.walkway.clamp(spawn.x, spawn.z) : spawn.z;
    if (spawn.facing) facing = spawn.facing;

    // Nothing about the old place survives the threshold.
    targetX = null;
    held = 0;
    heldZ = 0;
    running = false;
    vx = 0;
    if (gazing) setGazing(false);

    // The camera belongs to the player, so it has to be re-aimed at the new
    // world's bounds by hand. Clearing the look-ahead as well, or the lead you
    // built up walking into a door is still applied on the other side of it.
    camera.worldWidth = world.width;
    camera.ahead = 0;
    camera.aheadTarget = 0;
    camera.snapTo(charX);

    // Forget the doorway we walked into, so standing in the one we arrive in
    // prompts rather than being treated as a zone we never left.
    here.doors.reset();
    activeDoor = null;
    hidePrompt();

    here.world.playerX = charX;
    audio.setIndoors(next.id !== 'roof');
    console.log(`[scene] ${next.id}`);
};

function enterScene(id) {
    manager.enter(id, { x: charX, z: charZ, facing });
}

/**
 * Opens the panel for an action id. Shared by props and the terminal.
 *
 * Site-level settings — where the resume lives, where the guestbook posts — are
 * read from `city` rather than from the active manifest. They belong to the
 * site, not to the room you happen to be standing in, and reading them off
 * `world` meant the terminal on the workshop bench handed `resumePanel` an
 * undefined path and threw outright on the guestbook.
 */
function openAction(action) {
    if (action.startsWith('project:')) {
        const { title, html } = projectPanel(action.slice('project:'.length));
        panel.open(title, html);
        return;
    }

    switch (action) {
        case 'terminal': {
            const term = buildTerminal({ open: openAction, resumeFile: city.resumeFile });
            panel.open('rooftop terminal', term.mount(), { variant: 'crt' });
            term.input.focus();
            return;
        }
        case 'blogstack':
        case 'blog': {
            const { title, html } = blogPanel();
            panel.open(title, html);
            return;
        }
        case 'resume': {
            const { title, html } = resumePanel(city.resumeFile);
            panel.open(title, html);
            return;
        }
        case 'guestbook':
        case 'contact': {
            const g = guestbookPanel(city.guestbook);
            panel.open(g.title, g.html);
            g.wire(panel.bodyEl);
            return;
        }
        case 'about': {
            const { title, html } = aboutPanel();
            panel.open(title, html);
            return;
        }
        case 'projects': {
            const { title, html } = projectPanel('isometric-room');
            panel.open(title, html);
            return;
        }
        case 'vending':
            panel.open('Vending machine', '<p class="lede">Out of order. Of course.</p>');
            return;

        // ── The workshop ─────────────────────────────────────────
        case 'pipeline': {
            const { title, html } = pipelinePanel();
            panel.open(title, html);
            return;
        }
        case 'palette': {
            const p = palettePanel();
            panel.open(p.title, p.html);
            p.wire(panel.bodyEl);
            return;
        }
        case 'manifest': {
            const { title, html } = manifestPanel();
            panel.open(title, html);
            return;
        }
        case 'cot': {
            const { title, html } = cotPanel();
            panel.open(title, html);
            return;
        }

        // ── The landing ──────────────────────────────────────────
        case 'stairwell': {
            const { title, html } = stairwellPanel();
            panel.open(title, html);
            return;
        }
        case 'coats': {
            const { title, html } = coatsPanel();
            panel.open(title, html);
            return;
        }
        case 'radio': {
            // Diegetic mute. The prompt reports the new state, because the only
            // feedback for turning sound off is that nothing happens.
            const muted = audio.toggleMute();
            promptEl.setAttribute('aria-hidden', 'false');
            promptEl.textContent = muted
                ? 'The radio clicks off.'
                : 'The radio warms back up.';
            promptEl.classList.add('visible');
            return;
        }
        case 'pigeons':
            return;   // handled by the ambient flock
        default:
            console.log(`[world] no panel for ${action}`);
    }
}

function interact(zone) {
    // Two verbs go somewhere rather than opening something. They are checked
    // first so a scene can never be shadowed by a panel of the same name.
    if (zone.action.startsWith('scene:')) { enterScene(zone.action.slice(6)); return; }
    if (zone.action === 'leave') { manager.leave(); return; }

    if (zone.action === 'stargaze') { setGazing(!gazing); return; }
    if (zone.action === 'pigeons') { ambient.startle(zone.x); return; }
    openAction(zone.action);
}

// ── Movement ─────────────────────────────────────────────────────
function step(dt) {
    let moving = false;

    // A panel owns the keyboard while it is open, and so does a transition.
    // Without the second case you keep walking behind the veil and arrive
    // somewhere you did not aim for.
    if (panel.isOpen || manager.busy) {
        held = 0;
        heldZ = 0;
        targetX = null;
        vx = 0;
        character.setAnimation('idle');
        heldZ = 0;
        camera.leadBy(0);
        camera.updateAhead(dt);
        camera.updateLook(dt);
        here.world.playerX = charX;
        return;
    }

    // Movement is proposed, then tested against the terrain, so a raised
    // platform is a wall unless you approach it by its ramp.
    // Running only applies to keyboard movement: click-to-walk has no way to
    // express intent about pace.
    const paceScale = (running && held !== 0) ? world.runMultiplier : 1;
    const want = intent({
        held, heldZ, target: targetX, x: charX, z: charZ, dt, vx,
        speed: world.walkSpeed * paceScale,
        depthSpeed: (world.deck ? world.deck.depthSpeed : 0) * paceScale
    });
    targetX = want.target;
    vx = want.vx;
    // `moving` follows the body, not the key: the walk cycle has to keep
    // playing through the coast after you let go.
    moving = want.moving;

    // The route decides how far the world goes, falling back to the manifest
    // width for anything that has not declared one.
    const westEnd = here.walkway ? here.walkway.from : 40;
    const eastEnd = here.walkway ? here.walkway.to : world.width - 40;
    const nextX = Math.min(eastEnd, Math.max(westEnd, want.nextX));

    // The route limits where you can aim; terrain limits what you can climb;
    // collision limits what you can walk through. Clamping the *intent* here
    // rather than the resolved position is what lets the three compose — clamp
    // afterwards and the route fights terrain at every platform edge, dragging
    // you off a ledge terrain has already said you may stand on.
    const nextZ = here.walkway ? here.walkway.clamp(nextX, want.nextZ) : want.nextZ;

    // Each axis is tested on its own, so running into a step or a shed
    // sideways still lets you walk along it rather than sticking you in place.
    const prevX = charX, prevZ = charZ;

    // Terrain first — a raised platform is a wall unless approached by a ramp.
    let stepX = here.terrain.canMove(charX, charZ, nextX, charZ, world.maxStep) ? nextX : charX;
    let stepZ = here.terrain.canMove(stepX, charZ, stepX, nextZ, world.maxStep) ? nextZ : charZ;

    // Then solid props.
    const solved = here.collision.resolve(charX, charZ, stepX, stepZ);
    charX = solved.x;
    charZ = solved.z;

    // Facing comes from what actually moved, not what was requested — walking
    // into a wall should not spin the character round to face it.
    const movedX = charX - prevX;
    const movedZ = charZ - prevZ;

    // Blocked by terrain or a solid: dump the velocity rather than letting the
    // body keep pressing into it and then lurching free when you turn away.
    if (Math.abs(nextX - prevX) > 0.01 && Math.abs(movedX) < 0.005) vx = 0;
    if (Math.abs(movedX) > 0.01 || Math.abs(movedZ) > 0.0001) {
        facing = directionFor(movedX, movedZ);
    } else {
        moving = false;
    }

    // Walking away from the viewpoint ends the stargaze; nothing is more
    // jarring than the camera staying tilted while you leave.
    if (gazing && moving) setGazing(false);

    // ── Idle life ────────────────────────────────────────────────
    //
    // Standing still froze a mannequin. There is no idle-variation artwork and
    // generating a consistent one is a poor bet, so the glance is built from
    // the clips that ALREADY exist: `idle_up` and `idle_down` are single
    // frames of the character facing upstage and downstage, and briefly
    // switching to one reads exactly as looking round.
    if (moving) {
        stillFor = 0;
        glanceUntil = 0;
    } else {
        stillFor += dt;
        if (stillFor > 7 && scene0.time > glanceUntil + 4) {
            glanceUntil = scene0.time + 1.2 + Math.random() * 0.8;
            glanceDir = Math.random() < 0.5 ? 'up' : 'down';
            stillFor = 0;
        }
    }

    const glancing = !moving && scene0.time < glanceUntil;
    const { clip, flip } = glancing
        ? { clip: glanceDir === 'up' ? 'idle_up' : 'idle_down', flip: false }
        : clipFor(facing, moving);
    character.setAnimation(clip);

    // Lean into the wind, using the same travelling gust the props read, so
    // the character leans when the gust reaches them rather than when it
    // reaches the far end of the roof.
    character.lean = wind.atX(charX, 0.55) * 0.045;
    // Frame rate tracks ground speed, so the feet keep up with the roof.
    character.rate = moving ? paceScale : 1;
    character.worldX = charX;
    character.z = charZ;
    // Only the right-facing artwork exists; left is mirrored at draw time.
    character.flipX = flip;

    camera.follow(charX);

    const t = here.doors.update(charX);
    if (t.entered && !gazing) showPrompt(t.entered);
    if (t.exited && !t.entered && !gazing) hidePrompt();
    activeDoor = t.active;

    // Lead the camera along the roof only — depth movement should not pan it.
    camera.aheadMax = paceScale > 1 ? world.runLookAhead : Math.min(130, world.width / 12);
    camera.leadBy(moving && (facing === 'left' || facing === 'right')
        ? (facing === 'right' ? 1 : -1) : 0);
    camera.updateAhead(dt);
    camera.updateLook(dt);
    here.world.playerX = charX;

    // Footsteps, timed off the walk cycle rather than a fixed interval, so they
    // land with the feet. Puddles change the surface.
    if (moving) {
        stepPhase += dt * world.walkSpeed;
        if (stepPhase > 165) {
            stepPhase = 0;
            const puddle = world.props.find(p =>
                p.id.startsWith('puddle') && Math.abs(p.x - charX) < 55);
            audio.footstep(!!puddle);
            // A step into standing water throws a ring. The sound already knew
            // about the puddle; now you can see it too.
            if (puddle) fx.splash(charX, charZ, charX);
        }
    } else {
        stepPhase = 140;   // next step lands promptly on setting off
    }

    // Walking past the coop puts the pigeons up, at most once every few seconds.
    const coop = world.props.find(p => p.id === 'pigeon_coop');
    if (coop && Math.abs(charX - coop.x) < 90 && here.world.time - startledAt > 6) {
        startledAt = here.world.time;
        ambient.startle(coop.x);
    }

    // Stars brighten as the camera tilts up, so the reveal is gradual. Indoors
    // there is no sky, so the field is left exactly where it was — walking back
    // out should not have reset it.
    if (world.starfield) {
        const target = gazing ? world.starfield.gazeIntensity : world.starfield.idleIntensity;
        starIntensity += (target - starIntensity) * Math.min(1, dt * 2.2);
    }
}

/**
 * True where there is no keyboard to press E with.
 *
 * `hover: none` rather than sniffing for touch events: a laptop with a
 * touchscreen has both, and should keep the keyboard hints.
 */
const touchOnly = window.matchMedia('(hover: none)').matches;

/**
 * The prompt is the interact button on touch.
 *
 * E was the ONLY way to open anything, which made every door, panel and
 * terminal unreachable on a phone — half the site, silently. The prompt is
 * already the thing that appears exactly when there is something to interact
 * with, and it is already a DOM element, so making it tappable adds an
 * affordance where the player is already looking rather than inventing a
 * button somewhere else.
 */
promptEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.isOpen || manager.busy) return;
    if (gazing) { setGazing(false); return; }
    if (activeDoor) interact(activeDoor);
});

function showPrompt(door) {
    // Un-hide before writing the text, not after. The pill is a polite live
    // region, and a live region only announces changes made while it is in the
    // accessibility tree — setting the text first and revealing it after means
    // the announcement is swallowed.
    promptEl.setAttribute('aria-hidden', 'false');
    // Says what will actually work on this device.
    promptEl.textContent = touchOnly ? `${door.label} — tap` : `${door.label} — press E`;
    promptEl.classList.add('visible');
}

/**
 * Hides the prompt.
 *
 * The pill is faded out with opacity rather than removed, so that it can
 * animate — which means without `aria-hidden` it stays in the accessibility
 * tree and a screen reader will happily read out an offer to open a door you
 * are nowhere near, or one in a room you have already left.
 */
function hidePrompt() {
    promptEl.classList.remove('visible');
    promptEl.setAttribute('aria-hidden', 'true');
}

// ── Loop ─────────────────────────────────────────────────────────
let last = 0;
let frame = 0;

function loop(ts) {
    const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
    last = ts;

    scene0.time += dt;
    wind.update(dt);
    ambient.update(dt);
    // Steam drifts on the same wind everything else on the roof sways to.
    here.steam.update(dt, wind.value);
    // Pigeons need to know where you are; that is the whole point of them.
    here.critters.update(dt, charX);
    manager.update(dt);
    step(dt);

    // Neon buzz rises as you approach the sign.
    const neon = world.props.find(p => p.id === 'neon_sign');
    const neonNear = neon ? Math.max(0, 1 - Math.abs(charX - neon.x) / 700) : 0;
    audio.update(wind.value, neonNear);

    // Ground colour behind everything, so any slot still showing a placeholder
    // reads against the room it is in rather than against black.
    ctx.fillStyle = world.groundTone || '#141a3a';
    ctx.fillRect(0, 0, renderW, renderH);

    here.world.update(ts);
    here.world.draw(ctx, renderW, renderH);

    // Ripples sit on the floor, under everything standing on it.
    fx.updateRipples(dt);

    // Moths after the world, so they cross in front of the lamps they orbit
    // rather than being hidden behind them.
    here.critters.drawMoths(ctx, here.world, renderH);

    // Post pass over the finished frame.
    frame++;
    // Post goes on INSIDE the buffer, so the grain is made of real pixels the
    // same size as everything else. Applied to the upscaled image it would be
    // fine noise laid over chunky art, which reads as a filter on a photo.
    if (world.post) {
        fx.vignette(ctx, renderW, renderH, world.post.vignette);
        // Moving grain is exactly the kind of thing reduced-motion asks us to drop.
        if (!reducedMotion) {
            fx.grain(ctx, renderW, renderH, world.post.grain, frame);
        }
    }

    // The veil goes on last, over the post pass — a fade that grain and
    // vignette are laid on top of is a fade you can see through.
    if (manager.veil > 0) {
        ctx.fillStyle = `rgba(0,0,0,${manager.veil})`;
        ctx.fillRect(0, 0, renderW, renderH);
    }

    // ── The blit ─────────────────────────────────────────────────────
    // One draw, whole-number scale, nearest neighbour. Everything above this
    // line happened at render resolution.
    display.drawImage(buffer, 0, 0, renderW * pixelScale, renderH * pixelScale);

    // Reveal only once there is something to reveal. Hiding the boot screen
    // when loading finished instead would uncover a canvas that has not been
    // painted yet — a black flash that reads as a crash on the finish line.
    if (frame === 1) boot.done();

    requestAnimationFrame(loop);
}

// ── Boot ─────────────────────────────────────────────────────────
// Touch keyboards and browser chrome resize the viewport constantly; the
// orientation change is the one that actually needs a re-fit.
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

if (touchOnly) {
    document.body.classList.add('touch');
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'tap the roof to walk · tap the label to interact';
}

// A key held when the window loses focus never fires keyup, so clear everything.
window.addEventListener('blur', () => { held = 0; heldZ = 0; running = false; vx = 0; });

/**
 * The cat's three poses, loaded alongside everything else.
 *
 * They are not prop slots — nothing in the world stands at a fixed place
 * holding a cat — so they are fetched by hand and counted into the boot total
 * like any other download.
 */
const catPoses = (city.critters && city.critters.cat) ? city.critters.cat.poses : null;

/**
 * Sky sprites: things that cross the view rather than standing in the world.
 *
 * Not prop slots — nothing in the manifest stands at a fixed place holding an
 * airship — so they are fetched by hand alongside the cat and counted into the
 * boot total the same way.
 */
const SKY_SPRITES = city.skySprites || {};

// Every scene is loaded up front rather than on first entry. There are only a
// handful of them, most of an interior's props are reused roof assets, and the
// alternative is a door that opens onto a room of placeholders which then pop
// into existence one by one while you stand in it.
//
// The cost is that the wait is now long enough to need covering, which is what
// the boot screen is for. Its total is every scene's deduplicated slots plus
// the character sheet — counted from the manifests rather than hardcoded, so
// adding a room moves the bar instead of quietly making it lie.
const assetTotal = Object.values(built)
    .reduce((n, b) => n + b.world.assetSrcs.length, 0)
    + 1
    + (catPoses ? Object.keys(catPoses).length : 0)
    + Object.keys(SKY_SPRITES).length;
boot.begin(assetTotal);

/** Loads the cat's poses, counting each into the boot progress as it settles. */
function loadCatPoses() {
    const entries = Object.entries(catPoses);
    return Promise.all(entries.map(([pose, src]) =>
        World.loadImage(src)
            .then(img => [pose, img])
            .catch(() => [pose, null])
            .finally(() => boot.step())))
        .then(pairs => Object.fromEntries(pairs.filter(([, img]) => img)));
}

/** Loads the sky sprites, counting each into the boot progress as it settles. */
function loadSkySprites() {
    const entries = Object.entries(SKY_SPRITES);
    return Promise.all(entries.map(([name, src]) =>
        World.loadImage(src)
            .then(img => [name, img])
            .catch(() => [name, null])
            .finally(() => boot.step())))
        .then(pairs => Object.fromEntries(pairs.filter(([, img]) => img)));
}

Promise.all(Object.values(built).map(b => b.world.load(() => boot.step())))
    .then(() => character.load().catch(err => {
        console.error('[world] character sheet failed to load:', err);
    }))
    .then(() => {
        boot.step();   // the character sheet, settled either way

        // The character is the player's, not a scene's, so they are added to
        // every scene's actor list once rather than moved across on each swap.
        if (character.loaded) {
            for (const b of Object.values(built)) b.world.addActor(character);
        }

        // The cat belongs to the roof, so it is added only there. As an actor
        // it depth-sorts among the props on the same terms as the character.
        return Promise.all([
            catPoses ? loadCatPoses() : null,
            loadSkySprites()
        ]);
    })
    .then(([images, sky]) => {
        if (images) {
            built.roof.world.addActor(new CatActor(built.roof.critters, images));
        }
        // Without these the airship and the beam simply never appear; nothing
        // else in the world depends on them.
        ambient.sprites = sky;
        camera.snapTo(charX);
        requestAnimationFrame(loop);
    })
    .catch(err => {
        // Nothing above is expected to reject — a missing slot settles as an
        // error and is drawn as a placeholder. If something does, the screen
        // has to say so rather than filling up forever, which is
        // indistinguishable from a slow connection.
        console.error('[world] boot failed:', err);
        boot.fail('could not load the world');
    });
