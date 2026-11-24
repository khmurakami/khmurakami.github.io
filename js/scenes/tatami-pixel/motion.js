// Motion: how things answer a touch, bits that fly off, and rings on the paddies.

import { Pixel, R, Stage, clamp } from './base.js?v=20261124-1048';
import { onPlane } from './objects.js?v=20261124-1048';
import { A, S, cam } from './state.js?v=20261124-1048';

// ── Motion: how things answer a touch ────────────────────────────────
// The animator's kit in whole pixels: a crouch before a jump, a squash on
// landing, a wobble that dies away. Each thing remembers when it was last
// touched, and pose() says how it is bent and lifted that long after.

const poke = id => { S.moves[id] = S.t; };
const since = id => (S.moves[id] == null ? 1e9 : S.t - S.moves[id]);

/** How a sprite is lifted and squashed (sx wider, sy taller, in pixels) k seconds after a touch. */
function pose(id, c, t) {
    const k = since(id), sq = Math.max(1, Math.round(c.w * 0.06)), none = { lift: 0, sx: 0, sy: 0 };
    if (id === 'radio') {
        const hop = Math.max(2, Math.round(c.w * 0.07));
        if (k < 0.08) return { lift: 0, sx: 2, sy: -1 };                                       // crouch
        if (k < 0.4) {                                                                       // up and over
            const u = (k - 0.08) / 0.32, rising = Math.abs(Math.cos(Math.PI * u)) > 0.55;
            return { lift: Math.round(hop * Math.sin(Math.PI * u)), sx: rising ? -1 : 0, sy: rising ? 1 : 0 };
        }
        if (k < 0.48) return { lift: 0, sx: 2, sy: -1 };                                       // land
        if (k < 0.62) return { lift: 1, sx: 0, sy: 0 };                                         // a little rebound
        return none;
    }
    if (id === 'melon') {
        if (k < 0.08) return { lift: 0, sx: 0, sy: -1 };
        if (k < 0.18) return { lift: 1, sx: 0, sy: 0 };
        if (k < 0.26) return { lift: 0, sx: 0, sy: -1 };
        return none;
    }
    if (id === 'pig') {
        if (k < 0.18) return { lift: 0, sx: -1, sy: 1 };                                        // breathe in
        if (k < 0.3) return { lift: 0, sx: 2, sy: -1 };                                         // puff
        if (k < 0.5) return { lift: 0, sx: Math.round(Math.sin(k * 40)), sy: 0 };
        return none;
    }
    if (id === 'cat') {
        const up = S.things.cat.until, asleep = t - up;
        if (k < 0.15) return { lift: 0, sx: 2, sy: -1 };                                        // a shiver before the stretch
        if (k > 0.8 && k < 0.9) return { lift: 0, sx: 2, sy: -1 };                              // sitting up, settles
        if (k >= 0.9 && k < 1.0) return { lift: 0, sx: -1, sy: 1 };
        if (asleep > 0 && asleep < 0.25) return { lift: 0, sx: 2, sy: -1 };                     // curling back down
        return none;
    }
    return none;
}

let bendC = null;
/** Draw a sprite canvas (w x h) widened by sx and heightened by sy, bottom at yb, centred on x + w / 2. */
function bent(o, img, w, h, x, yb, sx, sy) {
    const w2 = w + sx, h2 = h + sy;
    if (!bendC) bendC = Pixel.layer(64, 64);
    if (bendC.canvas.width < w2 || bendC.canvas.height < h) { bendC = Pixel.layer(Math.max(w2, 64), Math.max(h, 64)); }
    const g = bendC.g, m = Math.floor(w / 2);
    g.clearRect(0, 0, bendC.canvas.width, bendC.canvas.height);
    if (sx >= 0) {
        g.drawImage(img, 0, 0, m, h, 0, 0, m, h);
        for (let i = 0; i < sx; i++) g.drawImage(img, m, 0, 1, h, m + i, 0, 1, h);
        g.drawImage(img, m, 0, w - m, h, m + sx, 0, w - m, h);
    } else {
        const n = -sx, a = Math.ceil(n / 2), b = Math.floor(n / 2);
        g.drawImage(img, 0, 0, m - a, h, 0, 0, m - a, h);
        g.drawImage(img, m + b, 0, w - m - b, h, m - a, 0, w - m - b, h);
    }
    const X = Math.round(x + (w - w2) / 2), top = yb - h2, r = Math.floor(h * 0.6), C = bendC.canvas;
    if (sy >= 0) {
        o.drawImage(C, 0, 0, w2, r, X, top, w2, r);
        for (let i = 0; i < sy; i++) o.drawImage(C, 0, r, w2, 1, X, top + r + i, w2, 1);
        o.drawImage(C, 0, r, w2, h - r, X, top + r + sy, w2, h - r);
    } else {
        const n = -sy;
        o.drawImage(C, 0, 0, w2, r, X, top, w2, r);
        o.drawImage(C, 0, r + n, w2, h - r - n, X, top + r, w2, h - r - n);
    }
}

// Bits that fly off things: seeds and crumbs, falling to where they started and fading.
const BITS = {
    summer: ['#ee7f94', '#cf5a74', '#0b0e26', '#ee7f94'],
    spring: ['#ffd0e0', '#e6e0ec', '#7aac5e', '#e890b0'],
    autumn: ['#f0803a', '#d0521e', '#ffb070', '#f0803a'],
    winter: ['#ec8a2a', '#ffb850', '#ffe0a0', '#ec8a2a']
};
function burst(x, y, n, colours) {
    for (let i = 0; i < n; i++)
        S.bits.push({ x, y, y0: y + 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 34, vy: -28 - Math.random() * 26, t0: S.t, c: colours[i % colours.length] });
}
function bits(o, t, dt) {
    S.bits = S.bits.filter(b => t - b.t0 < 1.4);
    for (const b of S.bits) {
        if (b.y < b.y0 || b.vy < 0) { b.vy += 140 * dt; b.x += b.vx * dt; b.y = Math.min(b.y0, b.y + b.vy * dt); if (b.y >= b.y0) b.vx = 0; }
        const fade = t - b.t0 > 1.0;
        if (fade && (Math.round(b.x) + Math.round(b.y)) & 1) continue;
        o.fillStyle = b.c; o.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
    }
}

// ── Rings on the paddies ─────────────────────────────────────────────
// Tap the fields and rings spread across them in perspective: a bright
// crest with a dark trough behind it, thinning to every other pixel as it fades.

const PADDY_LIFE = 3.2;
/** The outline of a pixel ellipse: each row runs out to where the next row in starts. */
function ellipsePx(rx, ry) {
    const out = [], R0 = Math.max(1, Math.round(ry)), half = y => (Math.abs(y) > R0 ? -1 : Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (R0 + 0.5)) ** 2))));
    for (let y = -R0; y <= R0; y++) {
        const a = half(y), b = Math.max(0, half(y < 0 ? y - 1 : y + 1) + 1);
        for (let x = Math.min(a, b); x <= a; x++) { out.push([x, y]); if (x) out.push([-x, y]); }
    }
    return out;
}
function ripple(cx, cy) {
    const d = S.shift(120);
    let x, y;
    if (cx == null) { const sp = S.things.paddy.spot(); if (!sp) return; x = sp.x; y = sp.y; }
    else { x = Math.floor(cx / A.scale) - d.x; y = Math.floor(cy / A.scale) - d.y; }
    const q = onPlane(x, y, R.ground);
    if (!(q.z > 6 && q.z < 400)) return;
    S.ripples.push({ x: q.x, z: q.z, t0: S.t });
    if (S.ripples.length > 6) S.ripples.shift();
    if (Stage.Sound.scape && Stage.Sound.scape.sfx) Stage.Sound.scape.sfx('plip', q.z);
}
function ripples(o, t) {
    if (!S.ripples.length) return;
    S.ripples = S.ripples.filter(r => t - r.t0 < PADDY_LIFE);
    const { p } = cam, F = S.farPix, mask = S.fieldMask, LW = A.LW;
    const shade = (i, k) => `rgb(${Math.round(F[i] * k)},${Math.round(F[i + 1] * k)},${Math.round(F[i + 2] * k)})`;
    const lift = i => `rgb(${Math.round(F[i] + (255 - F[i]) * 0.45)},${Math.round(F[i + 1] + (255 - F[i + 1]) * 0.45)},${Math.round(F[i + 2] + (255 - F[i + 2]) * 0.4)})`;
    for (const r of S.ripples) {
        const age = t - r.t0, c = p(r.x, R.ground, r.z);
        // Three rings, one after another, slowing as they spread; flat ellipses, as a print draws them.
        const big = clamp((cam.f * 1.8) / r.z, 6, A.W * 0.07);
        for (let n = 0; n < 3; n++) {
            const a = age - n * 0.32;
            if (a <= 0) continue;
            const life = a / (PADDY_LIFE - n * 0.32), every = life < 0.45 ? 1 : life < 0.75 ? 2 : 4;
            const rx = big * Math.sqrt(life) * (1 - n * 0.15) + 1, ry = Math.max(1, rx * 0.26);
            const seen = new Set();
            for (const [kx, ky, lit] of [[1, 1, true], [1 - Math.max(1.2, rx * 0.1) / rx, 0.8, false]]) {
                for (const [dx, dy] of ellipsePx(rx * kx, ry * ky)) {
                    const X = Math.round(c.x) + dx, Y = Math.round(c.y) + dy;
                    const key = Y * LW + X;
                    if (seen.has(key) || X < 0 || Y < 0 || X >= LW || Y >= A.LH || !mask[key]) continue;
                    seen.add(key);
                    if (every > 1 && ((X + Y + n) % every)) continue;
                    o.fillStyle = lit ? lift(key * 4) : shade(key * 4, 0.72);
                    o.fillRect(X, Y, 1, 1);
                }
            }
        }
    }
}

export { BITS, PADDY_LIFE, bendC, bent, bits, burst, ellipsePx, poke, pose, ripple, ripples, since };
