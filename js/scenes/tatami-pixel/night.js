// Night: the stars and moon, the lantern, fireflies, Tanabata, the moon rabbit, and napping.

import { relight } from './bake.js?v=20261124-1123';
import { R, Stage, TAU, clamp, lerp, rng } from './base.js?v=20261124-1123';
import { sprite } from './camera.js?v=20261124-1123';
import { frame, px } from './frame.js?v=20261124-1123';
import { since } from './motion.js?v=20261124-1123';
import { PAL } from './palette.js?v=20261124-1123';
import { A, S, cam } from './state.js?v=20261124-1123';
import { down, glyph, showTip } from './things.js?v=20261124-1123';
import { glow, gustAt } from './world.js?v=20261124-1123';

// ── Tanabata ─────────────────────────────────────────────────────────
// In the first week of July a cut bamboo stands in the garden past the
// veranda, hung with paper strips of wishes.

const bambooAt = () => (cam.portrait ? { x: -1.3, z: 5.1 } : { x: -1.75, z: 5.1 });

/** The bamboo: a culm with its nodes, side branches with twigs, sasa leaves drooping off them; and the points along the branches where strips hang. */
function bamboo(x, z) {
    const { p, f } = cam, k = f / z, gy = R.ground, top = 2.7, lean = 0.2, r = rng(707), s = sprite();
    const C = h => { const u = (h - gy) / (top - gy); return p(x + lean * u * u, h, z); };
    const cw = Math.max(3, Math.round(0.05 * k));
    const yTop = Math.round(C(top).y), yBase = Math.round(C(gy).y);
    const nodes = new Set();
    for (let h = gy + 0.3; h < top; h += 0.28 + r() * 0.08) nodes.add(Math.round(C(h).y));
    for (let Y = yTop; Y <= yBase; Y++) {
        const c = C(lerp(top, gy, (Y - yTop) / Math.max(1, yBase - yTop))), X0 = Math.round(c.x - cw / 2);
        for (let i = 0; i < cw; i++)
            s.set(X0 + i, Y, nodes.has(Y) ? 0.1 : nodes.has(Y - 1) ? 0.95 : i === 0 ? 0.8 : i === cw - 1 ? 0.3 : 0.55, 0, 1);
    }
    // A leaf: a lit upper edge, its underside a pixel below, narrowing to the tip.
    const leaf = (ax, ay, a, len, tone = 0.8) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        let nx = -sa, ny = ca;
        if (ny < 0) { nx = -nx; ny = -ny; }
        for (let i = 0; i <= len; i++) {
            const X = ax + ca * i, Y = ay + sa * i, mid = i > len * 0.12 && i < len * 0.72;
            s.set(X, Y, mid ? tone : tone - 0.15, 1, 1);
            if (mid) s.set(X + nx, Y + ny, tone - 0.42, 1, 1);
        }
    };
    const slots = [], hs = [0.6, 0.76, 0.9, 1.04, 1.18, 1.32, 1.46, 1.6, 1.74, 1.88, 2.02], sides = [1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1];
    hs.forEach((h, i) => {
        const side = sides[i], L = (0.42 + r() * 0.22) * (side > 0 ? 1.25 : 0.7) * (1 - (h - 0.6) * 0.2);
        const c = C(h), bp = u => ({ x: c.x + side * L * u * k, y: c.y - (0.18 * Math.sin(Math.PI * u * 0.85) - 0.26 * u * u) * L * k });
        let prev = bp(0);
        for (let j = 1; j <= 12; j++) { const q = bp(j / 12); s.line(prev.x, prev.y, q.x, q.y, 0.42, 0, 1); prev = q; }
        for (const u of [0.3, 0.55, 0.8, 1]) {
            const q = bp(u), tl = (0.05 + r() * 0.05) * k, ta = side > 0 ? -0.35 - r() * 0.5 : Math.PI + 0.35 + r() * 0.5;
            const e = { x: q.x + Math.cos(ta) * tl, y: q.y + Math.sin(ta) * tl };
            s.line(q.x, q.y, e.x, e.y, 0.5, 0, 1);
            const n = 5 + Math.floor(r() * 4);
            for (let m = 0; m < n; m++)
                leaf(e.x, e.y, (side > 0 ? 0.55 : Math.PI - 0.55) + side * (m - n / 2) * 0.3 + (r() - 0.5) * 0.3, Math.round((0.14 + r() * 0.1) * k), [0.62, 0.8, 0.95][Math.floor(r() * 3)]);
            if (u < 1) slots.push({ x: Math.round(q.x), y: Math.round(q.y) + 1 });
        }
    });
    // A strip at most slots, in the five colours, each with its column of writing.
    const colors = ['yellow', 'blue', 'red', 'white', 'purple'], strips = [];
    slots.forEach((q, i) => { if (r() < 0.6) strips.push({ ...q, color: colors[Math.floor(r() * 5)], ink: Math.floor(r() * 1e6), ph: r() * TAU, sl: 2 + Math.floor(r() * 3) }); });
    const canvas = s.paint([PAL.culm, PAL.sasa], { outline: 'sel' });
    return { canvas, strips, strip: { w: Math.max(3, Math.round(0.065 * k)), h: Math.max(8, Math.round(0.22 * k)) } };
}

// Paper for the strips: shade, face, light.
const PAPER = {
    blue: ['#2e5aa8', '#6ea2de', '#b8daf8'], red: ['#a83a52', '#ec7a88', '#ffc2c4'], yellow: ['#b88a30', '#f2cc66', '#fff0b8'],
    white: ['#a8a4bc', '#eee8dc', '#ffffff'], purple: ['#5a46a0', '#a890e0', '#e0d4ff']
};

/** The bamboo and its strips swinging in the wind, each a pixel column of writing on coloured paper. */
function strips(o, t, w) {
    const B = S.bamboo;
    if (!B) return;
    if (S.hover === S.things.bamboo) o.drawImage(B.c.outline, B.c.x - 1, B.c.y - 1);
    o.drawImage(B.c.canvas, B.c.x, B.c.y);
    const { w: sw, h: sh } = B.strip, kick = S.rustleT != null ? 4 * Math.exp(-(t - S.rustleT) * 1.6) : 0;
    for (const q of B.strips) {
        const amp = 0.6 + w * 2.4 + kick, dx = Math.sin(t * 1.5 + q.ph) * amp + Math.sin(t * 7.3 + q.ph) * (amp - 0.6) * 0.25, pal = PAPER[q.color];
        o.fillStyle = '#1a1838';
        for (let j = 0; j < q.sl; j++) o.fillRect(Math.round(q.x + (dx * j) / (q.sl + sh)), q.y + j, 1, 1);
        for (let j = 0; j < sh; j++) {
            const xo = Math.round(q.x - Math.floor(sw / 2) + (dx * (q.sl + j)) / (q.sl + sh)), y = q.y + q.sl + j;
            o.fillStyle = j === 0 ? pal[2] : pal[1]; o.fillRect(xo, y, sw, 1);
            o.fillStyle = pal[2]; o.fillRect(xo, y, 1, 1);
            o.fillStyle = pal[0]; o.fillRect(xo + sw - 1, y, 1, 1);
            if (j >= 2 && j < sh - 2 && ((q.ink >> (j % 20)) & 1 || j % 3 === 0)) { o.fillStyle = '#2a2440'; o.fillRect(xo + Math.floor((sw - 1) / 2), y, 1, 1); }
        }
    }
}

// ── Night ────────────────────────────────────────────────────────────
// The room keeps the visitor's clock (js/roomtime.js). Everything is
// painted at three in the afternoon and graded to the hour; what glows on
// its own (stars, the moon, the lantern, the screen, the farmhouse window,
// fireflies) is drawn over the grade, so it stays bright as the room dims.

const RT = window.RoomTime;
// Marker colours drawn into the sky before the grade: the grade swaps them for starlight, so clouds and eaves still hide them.
const MARK = { star: 0xfe01fe, dim: 0xfe02fe, moon: 0xfe03fe, moonDark: 0xfe04fe, mare: 0xfe05fe, rabbit: 0xfe06fe };
const hex = n => '#' + n.toString(16).padStart(6, '0');

/** Stars in the sky above the far hills, and the moon in its real phase. */
function nightSky(o, t, dark) {
    if (dark < 0.15) return;
    for (const s of S.stars) {
        if (s.y > cam.ye - 8) continue;
        const tw = Math.sin(t * s.sp + s.ph);
        if (dark < 0.5 && s.dim) continue;
        o.fillStyle = hex(s.dim || tw < -0.6 ? MARK.dim : MARK.star);
        o.fillRect(s.x, s.y, 1, 1);
    }
    if (S.usagi) return;
    const m = S.moon, R0 = m.r, ph = m.phase;
    // Lit where the terminator ellipse says so: waxing lights the right side, waning the left.
    for (let y = -R0; y <= R0; y++) for (let x = -R0; x <= R0; x++) {
        if (x * x + y * y > R0 * R0 + R0 * 0.4) continue;
        const half = Math.sqrt(Math.max(0, R0 * R0 - y * y)), term = half * Math.cos(ph * TAU);
        const lit = ph < 0.5 ? x > term : x < -term;
        o.fillStyle = hex(lit ? MARK.moon : MARK.moonDark);
        o.fillRect(m.x + x, m.y + y, 1, 1);
    }
}

/** The paper lantern under the eave: red and white by day, glowing at night. */
function lanternAt() { return cam.p(cam.portrait ? 0.5 : 1.15, R.eaveH, R.eaveZ); }
function lantern(o, t, w, glow) {
    const hook = lanternAt(), k = cam.f / R.eaveZ;
    const rx = Math.max(3, Math.round(0.09 * k)), ry = Math.max(4, Math.round(0.13 * k)), str = Math.max(2, Math.round(0.08 * k));
    const kick = since('lantern'), swing = kick < 3 ? Math.sin(kick * 5.5) * 3 * Math.exp(-kick * 1.4) : 0;
    const sway = Math.round(Math.sin(t * 0.8 + 1) * (0.5 + w * 1.5) + swing + gustAt(R.eaveZ, t) * 3.5), hx = Math.round(hook.x), hy = Math.round(hook.y);
    const cx = hx + sway, cy = hy + str + ry + 1;
    S.lanternBox = { x0: cx - rx - 1, y0: hy, x1: cx + rx + 1, y1: cy + ry + 2 };
    S.lanternAt = { x: cx, y: cy };
    o.fillStyle = '#101c48';
    for (let i = 0; i < str; i++) o.fillRect(hx + Math.round(sway * i / str), hy + i, 1, 1);
    // The paper: ribbed, red bands top and bottom by day; lit from inside at night.
    for (let y = -ry; y <= ry; y++) {
        const half = Math.round(rx * Math.sqrt(1 - (y / (ry + 0.6)) ** 2));
        for (let x = -half; x <= half; x++) {
            const rib = (y + ry) % 3 === 0, edge = x === -half || x === half, band = Math.abs(y) > ry * 0.55;
            let c;
            if (glow > 0.5) c = rib ? '#e88a48' : edge ? '#f0a050' : band ? '#ffb85c' : x < -half * 0.3 ? '#ffd890' : '#fff0c0';
            else c = rib ? '#a83a52' : band ? (edge ? '#8a2e44' : '#d04a5a') : edge ? (x < 0 ? '#e6dcd8' : '#a8a0b8') : x < -half * 0.3 ? '#fff6ec' : '#e0d8e4';
            o.fillStyle = c; o.fillRect(cx + x, cy + y, 1, 1);
        }
    }
    o.fillStyle = '#1a1424';
    o.fillRect(cx - Math.ceil(rx * 0.55), cy - ry - 1, Math.ceil(rx * 0.55) * 2 + 1, 2);
    o.fillRect(cx - Math.ceil(rx * 0.55), cy + ry, Math.ceil(rx * 0.55) * 2 + 1, 2);
    // A short tassel.
    o.fillStyle = glow > 0.5 ? '#c84a4a' : '#a83a52';
    o.fillRect(cx, cy + ry + 2, 1, 3);
}

/** Light a patch of graded pixels from a lamp: warm or cool, falling off with distance. */
function lamp(d, W, H, x, y, r, rgb, k) {
    if (k <= 0.01) return;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r * 0.7)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
        const e = Math.hypot(X - x, (Y - y) * 1.3) / r;
        if (e >= 1) continue;
        // Stepped falloff, as a pixel artist would band it, dithered where the bands meet.
        const f = (1 - e) * (1 - e), band = Math.floor(f * 4 + (((X + Y) & 1) ? 0.25 : -0.25)) / 4;
        if (band <= 0) continue;
        const i = (Y * W + X) * 4, a = band * k;
        d[i] = Math.min(255, d[i] + rgb[0] * a); d[i + 1] = Math.min(255, d[i + 1] + rgb[1] * a); d[i + 2] = Math.min(255, d[i + 2] + rgb[2] * a);
    }
}

/** Fireflies over the garden on summer nights. */
function fireflies(o, t, vis) {
    if (vis <= 0.05) return;
    const { p } = cam, xr = cam.portrait ? [-1.35, 1.1] : [-1.4, 1.6];
    for (const v of S.bugs) {
        const a = v.pr, u = t + a[9] * 100;
        const X = lerp(xr[0], xr[1], 0.5 + 0.3 * Math.sin(u * (0.09 + a[0] * 0.05) + a[1] * TAU) + 0.17 * Math.sin(u * (0.23 + a[2] * 0.1) + a[3] * TAU));
        const H = lerp(-0.3, 1.0, 0.5 + 0.3 * Math.sin(u * (0.13 + a[4] * 0.06) + a[5] * TAU) + 0.15 * Math.sin(u * 0.37 + a[6] * TAU));
        const Z = lerp(5.6, 7.2, 0.5 + 0.45 * Math.sin(u * 0.06 + a[7] * TAU));
        const q = p(X, H, Z), d = S.shift(Z), x = Math.round(q.x + d.x), y = Math.round(q.y + d.y);
        const ph = (t * 0.45 + a[8]) % 1, g = (ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0) * vis;
        if (g < 0.05) continue;
        if (g > 0.6) { o.fillStyle = '#5e9a40'; for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, 2], [0, -2]]) o.fillRect(x + i, y + j, 1, 1); }
        if (g > 0.3) { o.fillStyle = '#b8e060'; for (const [i, j] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) o.fillRect(x + i, y + j, 1, 1); }
        px(o, x, y, g > 0.5 ? '#fbffc4' : '#d8f47c');
    }
}


// ── The rabbit in the moon ───────────────────────────────────────────
// Tap the moon five times and it comes close: a rabbit up there, pounding
// mochi in a mortar, as the old story has it. Drawn in marker colours like
// the moon, so the eave and the clouds still pass in front.

const MOON_NAMES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
const moonName = () => (S.moon ? MOON_NAMES[Math.round(S.moon.phase * 8) % 8] : 'up there');
// The rabbit, sitting up: ears, head with an eye, body, feet.
const BUNNY = ['......X.X...', '......X.X...', '......X.X...', '.....XXXX...', '....XXXXXX..', '....XXXX.X..', '.....XXXXX..',
    '....XXXXXXX.', '...XXXXXXXX.', '...XXXXXXX..', '...XXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXX..XXX..'];
const USU = [[10, 14, 19], [11, 14, 19], [12, 15, 18], [13, 15, 18], [14, 15, 18], [15, 14, 19]];
function rabbitCells(down) {
    const cells = [];
    BUNNY.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'X') cells.push([x, y]); });
    for (const [y, a, b] of USU) for (let x = a; x <= b; x++) cells.push([x, y]);
    // The mallet: a shaft from the paws to its head, raised high or down in the mortar.
    const hand = [10, 7], head = down ? [16, 8] : [14, 0];
    const n = Math.max(Math.abs(head[0] - hand[0]), Math.abs(head[1] - hand[1]));
    for (let i = 0; i <= n; i++) cells.push([Math.round(hand[0] + (head[0] - hand[0]) * i / n), Math.round(hand[1] + (head[1] - hand[1]) * i / n)]);
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) cells.push([head[0] + dx, head[1] + dy]);
    return cells;
}
const RABBIT = [rabbitCells(false), rabbitCells(true)];

function moonRabbit(o, t, dark) {
    const u = S.usagi;
    if (!u) return;
    const k = t - u.t0;
    if (k > 7.6 || dark < 0.15) { S.usagi = null; return; }
    const m = S.moon, top = S.yEave - A.M, bottom = cam.ye;
    const grow = smooth(clamp(k / 1.2, 0, 1)) * (1 - smooth(clamp((k - 6.3) / 1.2, 0, 1)));
    // Up close it fills the sky between the eave and the hills, clear of both.
    const big = Math.min((bottom - S.yEave) * 0.42, A.W * 0.14);
    const R0 = Math.round(lerp(m.r, big, grow));
    const cx = Math.round(m.x), cy = Math.round(lerp(m.y, Math.max(S.yEave + big + 3, lerp(S.yEave, bottom, 0.48)), grow));
    // The full face of the moon, with soft grey seas on it.
    for (let y = -R0; y <= R0; y++) for (let x = -R0; x <= R0; x++) {
        if (x * x + y * y > R0 * R0 + R0 * 0.4) continue;
        const sea = (x + R0 * 0.45) ** 2 + (y + R0 * 0.4) ** 2 < (R0 * 0.2) ** 2 || (x - R0 * 0.55) ** 2 + (y - R0 * 0.45) ** 2 < (R0 * 0.16) ** 2;
        o.fillStyle = hex(sea && grow > 0.5 ? MARK.mare : MARK.moon);
        o.fillRect(cx + x, cy + y, 1, 1);
    }
    if (grow < 0.85) return;
    // The rabbit, two frames: mallet up, mallet down, with a thump on each landing.
    const beat = Math.max(0, Math.floor((k - 1.2) / 0.34)), frame = beat % 2, cell = Math.max(1, Math.floor((R0 * 1.25) / 20));
    if (frame === 1 && u.last !== beat) { u.last = beat; if (Stage.Sound.scape) Stage.Sound.scape.thump(); }
    const ox = cx - Math.round(10 * cell), oy = cy - Math.round(8 * cell);
    o.fillStyle = hex(MARK.rabbit);
    for (const [x, y] of RABBIT[frame]) o.fillRect(ox + x * cell, oy + y * cell, cell, cell);
}

// ── Napping ──────────────────────────────────────────────────────────
// Lie down on the futon: your eyes close, a few hours go by, and you wake
// to the room at a later hour. Sleep through the night and you wake at seven.

function nap() {
    if (S.nap) return;
    S.nap = { t0: S.t, slept: false };
}
// Arriving: the page opens like waking up, eyes shut a moment, then open with a blink.
let woken = false;
function wake() {
    if (woken) return;
    woken = true;
    if (A.L.still || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    S.nap = { t0: null, slept: true, intro: true };
}
function napStep(o, t) {
    const n = S.nap;
    if (!n) return;
    if (n.t0 == null) n.t0 = t - 2.1;
    const k = t - n.t0, W = A.W, H = A.H;
    if (k > 1 && !n.slept) {
        n.slept = true;
        const h = RT.hour(), to = h + 3;
        const next = to >= 22.5 || h < 6 ? (h < 6 ? 7 - h : 24 - h + 7) : 3;
        RT.sleep(next * 3600000);
        relight(true);
        dispatchEvent(new Event('roomtime'));
    }
    // How shut the eyes are: closing, closed (with z's), opening with a blink.
    const shut = k < 1 ? smooth(k) : k < 2.4 ? 1 : k < 3.1 ? 1 - smooth((k - 2.4) / 0.7) : k < 3.35 ? smooth((k - 3.1) / 0.25) * 0.8 : k < 3.8 ? 0.8 * (1 - smooth((k - 3.35) / 0.45)) : 0;
    if (k > 3.8) {
        S.nap = null;
        if (n.intro) return;
        const d = RT.now();
        showTip({ label: `you dozed off · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}` }, innerWidth / 2, innerHeight * 0.42, 2600);
        return;
    }
    o.fillStyle = '#05061a';
    for (let x = 0; x < W; x++) {
        // An eye: the lids meet at the corners first and in the middle last.
        const u = (x - W / 2) / (W / 2), lid = Math.ceil((H / 2) * Math.min(1, shut * (1 + 0.7 * u * u)));
        o.fillRect(x, 0, 1, lid);
        o.fillRect(x, H - lid, 1, lid);
    }
    if (shut > 0.95 && !n.intro) {
        for (let i = 0; i < 3; i++) {
            const kk = ((k - 1 + i * 0.45) % 1.35) / 1.35;
            glyph(o, 'z', W / 2 - 4 + i * 5 + kk * 6, H / 2 - 2 - kk * 10 - i * 3, kk < 0.7 ? '#c8d0f0' : '#6a70a0');
        }
    }
}
const smooth = v => v * v * (3 - 2 * v);

export { BUNNY, MARK, MOON_NAMES, PAPER, RABBIT, RT, USU, bamboo, bambooAt, fireflies, hex, lamp, lantern, lanternAt, moonName, moonRabbit, nap, napStep, nightSky, rabbitCells, smooth, strips, wake, woken };
