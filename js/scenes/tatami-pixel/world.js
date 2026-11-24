// The wind you make, the light you carry, and turning the season.

import { bake } from './bake.js?v=20261124-0955';
import { Pixel, R, Stage, TAU, clamp, lerp, rng } from './base.js?v=20261124-0955';
import { px } from './frame.js?v=20261124-0955';
import { cat } from './objects.js?v=20261124-0955';
import { A, S, cam } from './state.js?v=20261124-0955';

// ── The wind you make ────────────────────────────────────────────────
// A flick (or a quick sweep of the mouse) sends a gust into the picture. It
// reaches the room first, then the garden, the paddies, the hills, the
// clouds: each layer answers a moment after the one in front of it.

function gust(s, dir) {
    if (!S || !S.gusts) return false;
    s = clamp(s, 0.2, 1); dir = dir < 0 ? -1 : 1;
    S.gusts.push({ t0: S.t, s, dir });
    if (S.gusts.length > 3) S.gusts.shift();
    // Leaves (petals, snow) carried in on it.
    const n = Math.round(5 + 12 * s), r = Math.random;
    for (let i = 0; i < n; i++) S.gustBits.push({ t0: S.t + r() * 0.5, y: lerp(S.yEave + 6, S.yEngawa - 4, r()), v: 70 + r() * 90 * s, dir, ph: r() * TAU, c: r() });
    if (S.gustBits.length > 60) S.gustBits.splice(0, S.gustBits.length - 60);
    if (Stage.Sound.scape && Stage.Sound.scape.sfx) Stage.Sound.scape.sfx('gust', s, dir);
    return true;
}
const delayOf = z => clamp(Math.log(z / R.zT) * 0.42, 0, 1.9);
/** The gusts at depth z, signed: + blows to the right. */
function gustAt(z, t) {
    if (!S || !S.gusts) return 0;
    let g = 0;
    for (const G of S.gusts) {
        const u = t - G.t0 - delayOf(z);
        if (u <= 0 || u > 4) continue;
        g += G.s * G.dir * (u < 0.18 ? u / 0.18 : Math.exp(-(u - 0.18) * 2.4));
    }
    return g;
}
const GUST_BITS = { spring: ['#ffd0e0', '#f4a0c0', '#ffe8f0'], summer: ['#5aa064', '#7ac07a', '#3a7a4a'], autumn: ['#e0603a', '#f0a040', '#c03a3a', '#e8c050'], winter: ['#ffffff', '#e4ecff'] };
function gustLeaves(o, t) {
    if (!S.gustBits.length) return;
    const span = S.xR - S.xL + 40, C = GUST_BITS[S.season];
    S.gustBits = S.gustBits.filter(b => t - b.t0 < span / b.v + 0.2);
    for (const b of S.gustBits) {
        const k = t - b.t0;
        if (k < 0) continue;
        const x = b.dir > 0 ? S.xL - 20 + k * b.v : S.xR + 20 - k * b.v, y = b.y + Math.sin(k * 5 + b.ph) * 4 + k * 6;
        const c = C[Math.floor(b.c * C.length)], flip = Math.sin(k * 9 + b.ph) > 0;
        px(o, x, y, c);
        if (S.season !== 'winter') px(o, x + (flip ? 1 : 0), y + (flip ? 0 : 1), c);
    }
}
/** A gust running over the rice: a bright band of bent stalks moving away across the paddies. */
function riceWave(o, t) {
    const F = S.farPix, mask = S.fieldMask, LW = A.LW;
    if (!F) return;
    for (const G of S.gusts) {
        const u = t - G.t0 - delayOf(7);
        if (u <= 0 || u > 1.7) continue;
        const zf = 7 * Math.pow(40, u / 1.7), yA = Math.round(cam.p(0, R.ground, zf * 1.5).y), yB = Math.round(cam.p(0, R.ground, zf).y);
        const fade = G.s * (1 - u / 1.7), every = fade > 0.5 ? 1 : fade > 0.25 ? 2 : 3;
        for (let Y = Math.max(0, yA); Y <= Math.min(A.LH - 1, yB); Y++) for (let X = 0; X < LW; X++) {
            const i = Y * LW + X;
            if (!mask[i] || (X + Y * 2 + Math.floor(t * 20)) % 3 === 0 || (X + Y) % every) continue;
            const q = i * 4;
            o.fillStyle = `rgb(${Math.round(F[q] + (255 - F[q]) * 0.42)},${Math.round(F[q + 1] + (255 - F[q + 1]) * 0.44)},${Math.round(F[q + 2] + (255 - F[q + 2]) * 0.3)})`;
            o.fillRect(X, Y, 1, 1);
        }
    }
}

// ── A light you carry ────────────────────────────────────────────────
// After dark, the pointer (or a finger, while it is down) carries a small
// warm light: the room brightens round it in bands, and the cat's eyes catch it.

const glow = { x: 0, y: 0, k: 0, want: 0 };
const nightOf = dark => clamp((dark - 0.2) / 0.4, 0, 1);
function glowSpark(o, t) {
    const a = nightOf(S.grade.dark) * glow.k;
    if (a < 0.3) return;
    const x = Math.round(glow.x / A.scale), y = Math.round(glow.y / A.scale), on = Math.sin(t * 9) > -0.6;
    o.fillStyle = '#ffd890';
    if (on) { o.fillRect(x - 1, y, 1, 1); o.fillRect(x + 1, y, 1, 1); o.fillRect(x, y - 1, 1, 1); o.fillRect(x, y + 1, 1, 1); }
    o.fillStyle = '#fff8e0'; o.fillRect(x, y, 1, 1);
}
/** The cat's eyes in the light: a glint, and a sleeping cat looks up if the light stays near. */
function catEyes(o, t, dt) {
    const cat = S.things.cat, a = nightOf(S.grade.dark) * glow.k, d = S.shift(R.zT), gx = glow.x / A.scale, gy = glow.y / A.scale;
    const head = S.catHead.awake, near = a > 0.4 && Math.hypot(gx - (head.x + d.x), gy - (head.y + 6 + d.y)) < A.H * 0.16;
    S.catNear = near ? (S.catNear || 0) + dt : 0;
    if (S.catNear > 1 && cat.until <= t) { cat.until = t + 3; cat.stretch = false; }
    if (!near || cat.until <= t || cat.sprite() !== S.catAwake) return;
    o.fillStyle = '#e4ff8a';
    for (const e of head.eyes) o.fillRect(e.x + d.x, e.y + d.y, 1, 1);
}

// ── Turning the season ───────────────────────────────────────────────
// The hanging scroll (or the season under the name, or `season` in the
// terminal) turns the year. The old picture comes apart in the wind, pixel
// by pixel, petals and leaves of itself, and the new one is underneath.

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
let seasonPick = null;
function changeSeason(next) {
    if (!S || S.trans || S.nap) return false;
    next = next || SEASONS[(SEASONS.indexOf(S.season) + 1) % 4];
    if (!SEASONS.includes(next) || next === S.season) return false;
    const from = S.out.g.getImageData(0, 0, A.W, A.H), leaving = S.season;
    const keep = { lanternOn: S.lanternOn, blindTarget: S.blindTarget, blindRoll: S.blindRoll, t: S.t, sunOn: S.sunOn };
    seasonPick = next;
    bake(A.L);
    Object.assign(S, keep);
    const still = A.L.still || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) S.trans = unmake(from, leaving, next === 'spring' || next === 'autumn' ? 1 : -1);
    if (Stage.Sound.scape && Stage.Sound.scape.sfx) Stage.Sound.scape.sfx('gust', 1, 1);
    window.dispatchEvent(new CustomEvent('season', { detail: next }));
    return next;
}
function unmake(img, leaving, dir) {
    const { W, H } = A, order = new Float32Array(W * H), r = rng(Math.floor(Math.random() * 1e6));
    const clump = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h & 0xffff) / 0xffff; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const across = dir > 0 ? x / W : 1 - x / W;
        order[y * W + x] = across * 1.15 + (1 - y / H) * 0.2 + clump(x >> 2, y >> 2) * 0.45 + r() * 0.06;
    }
    const layer = Pixel.layer(W, H);
    return { img, order, layer, t0: null, last: -1, dir, leaving, flakes: [], r, end: 1.95 };
}
function remake(o, t) {
    const T = S.trans;
    if (!T) return;
    if (T.t0 == null) T.t0 = t;
    const e = t - T.t0, d = T.img.data, { W, H } = A, dt = Math.min(0.05, Math.max(0, t - (T.lt ?? t)));
    T.lt = t;
    if (T.last < T.end) {
        for (let i = 0, n = W * H; i < n; i++) {
            if (T.order[i] > e || d[i * 4 + 3] === 0) continue;
            if (T.flakes.length < 2400 && T.r() < 0.03)
                T.flakes.push({ x: i % W, y: (i / W) | 0, c: `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`, t0: t, vx: T.dir * (30 + T.r() * 60), vy: -12 + T.r() * 18, ph: T.r() * TAU });
            d[i * 4 + 3] = 0;
        }
        T.last = e;
        T.layer.g.putImageData(T.img, 0, 0);
    }
    if (e < T.end + 0.1) o.drawImage(T.layer.canvas, 0, 0);
    T.flakes = T.flakes.filter(f => t - f.t0 < 1.5);
    for (const f of T.flakes) {
        f.vy += 22 * dt; f.x += f.vx * dt + Math.sin(t * 6 + f.ph) * 0.3; f.y += f.vy * dt;
        const x = Math.round(f.x), y = Math.round(f.y), late = t - f.t0 > 1.1;
        if (late && (x + y) & 1) continue;
        o.fillStyle = f.c; o.fillRect(x, y, 1, 1);
        if (T.leaving === 'winter') continue;
        const flip = Math.sin(t * 8 + f.ph) > 0;
        o.fillRect(x + (flip ? 1 : 0), y + (flip ? 0 : 1), 1, 1);
    }
    if (e > T.end && !T.flakes.length) S.trans = null;
}

/** The season under the name, in the corner card, turns the season too. */
// Only where the scroll can't be seen (a phone held upright), so it never covers a thing in the room.
let captioned = false;
function captionButton(el, live) {
    if (!el) return;
    if (!captioned) {
        captioned = true;
        const go = e => { if (el.getAttribute('role') !== 'button') return; e.preventDefault(); changeSeason(); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
    Object.assign(el.style, live ? { pointerEvents: 'auto', cursor: 'pointer', borderBottom: '1px dotted rgba(225, 235, 255, 0.45)' } : { pointerEvents: '', cursor: '', borderBottom: '' });
    if (live) { el.setAttribute('role', 'button'); el.tabIndex = 0; el.title = 'turn the season'; }
    else { el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('title'); }
}

export { GUST_BITS, SEASONS, captionButton, captioned, catEyes, changeSeason, delayOf, glow, glowSpark, gust, gustAt, gustLeaves, nightOf, remake, riceWave, seasonPick, unmake };
