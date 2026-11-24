/*
 * tatami-pixel: the tatami room as pixel art, drawn one object at a time.
 *
 * The same room as tatami-world (the same camera, the same metres), but
 * drawn at a pixel artist's resolution, about 480 art pixels across, and
 * shown at a whole-number scale with no smoothing. Nothing is filtered after
 * the fact: every object is its own js/pixel.js Sprite, with its own ramp,
 * its own light (upper left, from the window), dither only where its ramp
 * steps, a selective outline and no stray pixels. Clouds and plants are
 * js/stack.js volumes drawn clump by clump at that resolution.
 *
 * Moving parts move by whole pixels: clouds drift, plants bend, the chime
 * and blind swing, smoke rises, and you can look around (mouse or
 * tilt), near things shifting more than far ones.
 */

import { bake, lanternLit } from './bake.js?v=20261124-1048';
import { R, Stage, chime, clamp } from './base.js?v=20261124-1048';
import { frame } from './frame.js?v=20261124-1048';
import { RT, nap } from './night.js?v=20261124-1048';
import { A, S } from './state.js?v=20261124-1048';
import { FINGER, phoneish, pick } from './things.js?v=20261124-1048';
import { aim, stepView, view } from './view.js?v=20261124-1048';
import { changeSeason, glow, gust, gustAt } from './world.js?v=20261124-1048';
import './palette.js?v=20261124-1048';
import './camera.js?v=20261124-1048';
import './objects.js?v=20261124-1048';
import './draw.js?v=20261124-1048';
import './motion.js?v=20261124-1048';

// For checks (scripts and the console): where each thing is on screen, and what state it is in.
window.TatamiPixel = {
    // What the terminal can do in the room.
    nap: () => S && nap(),
    lantern: () => { if (!S) return false; S.lanternOn = !lanternLit(); return S.lanternOn; },
    pet: () => S && S.things.cat.act(),
    touch: id => S && S.things[id] && (S.things[id].act(), true),
    gust: (s = 0.8, dir = 1) => gust(s, dir),
    look: (x = 0, y = 0) => { view.ox = x; view.oy = y; view.gx = view.gy = 0; aim(); view.x = view.tx; view.y = view.ty; return true; },
    season: name => changeSeason(name),
    books: () => window.Shelf && Shelf.open(),
    crane: () => window.Crane && Crane.open(),
    pickAt: (x, y, slop = FINGER) => { const t = pick(x, y, slop); return t ? t.id : null; },
    tune: () => (Stage.Sound.scape ? Stage.Sound.scape.tune() : ''),
    usagi: () => { if (!S || S.grade.dark < 0.15) return false; S.usagi = { t0: S.t }; return true; },
    things: () => (S && S.thingList ? S.thingList.filter(t => !t.plant).flatMap(t => {
        const d = S.shift(t.z);
        if (t.points) return t.points().map(q => ({ id: q.id, key: q.key, x: (q.x + d.x + 0.5) * A.scale, y: (q.y + d.y + 0.5) * A.scale }));
        const sp = t.spot && (!t.box || phoneish()) && t.spot();
        if (sp) return { id: t.id, x: (sp.x + d.x + 0.5) * A.scale, y: (sp.y + d.y + 0.5) * A.scale };
        if (t.area && !t.box) return [];
        if (t.box) { const b = t.box(); return b && { id: t.id, x: ((b.x0 + b.x1) / 2 + d.x + 0.5) * A.scale, y: ((b.y0 + b.y1) / 2 + d.y + 0.5) * A.scale }; }
        const c = t.sprite();
        let best = null;
        const solid = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!c.alpha[(y + j) * c.w + x + i]) return false; return true; };
        for (let y = 1; y < c.h - 1; y++) for (let x = 1; x < c.w - 1; x++) if (solid(x, y)) {
            const e = (x - c.w / 2) ** 2 + (y - c.h / 2) ** 2;
            if (!best || e < best.e) best = { e, x, y };
        }
        if (!best) return [];
        return { id: t.id, x: (c.x + best.x + d.x + 0.5) * A.scale, y: (c.y + best.y + d.y + 0.5) * A.scale };
    }).filter(Boolean) : []),
    state: () => S && S.things && ({ bites: S.things.melon.bites, catAwake: S.things.cat.until > S.t, blind: S.blindTarget,
        puffing: S.t - S.puffT < 3, sound: Stage.Sound.on, rung: S.t - (S.chimeT ?? -10) < 2, hover: S.hover && S.hover.id,
        rustle: S.rustleT != null && S.t - S.rustleT < 1.5, ripples: S.ripples.length, gusts: S.gusts.length, turning: !!S.trans, glow: +glow.k.toFixed(2), shelf: !!(window.Shelf && Shelf.isOpen), crane: !!(window.Crane && Crane.isOpen), moving: Object.keys(S.moves).filter(id => S.t - S.moves[id] < 0.6), lantern: lanternLit(), napping: !!S.nap, terminal: !!(window.Terminal && Terminal.isOpen), station: Stage.Sound.scape ? Stage.Sound.scape.station : null, moonTaps: S.moonTaps || 0, usagi: !!S.usagi, look: [+view.tx.toFixed(2), +view.ty.toFixed(2)], hour: +RT.hour().toFixed(2), season: S.season, sun: S.sunOn, dark: +S.grade.dark.toFixed(2) })
};

Stage.register('tatami-pixel', {
    caption: 'lazy summer days',
    ambience: 'cicadas',
    raw: true,
    bake,
    frame,
    step: (t, dt) => {
        chime.step(t, dt); stepView(dt);
        glow.k += (glow.want - glow.k) * Math.min(1, dt * (glow.want ? 6 : 2.5));
        if (!S) return;
        if (S.gusts && S.gusts.length) {
            chime.om += gustAt(R.eaveZ, t) * 9 * dt;
            S.cloudPush += gustAt(400, t) * dt * 26;
            S.fallPush += gustAt(6.5, t) * dt * 70;
            S.gusts = S.gusts.filter(G => t - G.t0 < 6);
        }
        // The blind runs on a spring: it overshoots a little and bounces before it settles.
        const h = Math.min(dt, 0.05);
        S.blindV = (S.blindV || 0) + ((S.blindTarget || 0) - (S.blindRoll || 0)) * 26 * h - (S.blindV || 0) * 6.5 * h;
        S.blindRoll = clamp((S.blindRoll || 0) + S.blindV * h, -0.08, 1.08);
    }
});
