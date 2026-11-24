// One frame of the room, back to front, and the little moving parts drawn in it.

import { lanternShows, nightSwap, relight } from './bake.js?v=20261124-1123';
import { R, Stage, TAU, chime, clamp, lerp } from './base.js?v=20261124-1123';
import { drawThings, screen } from './draw.js?v=20261124-1123';
import { ripples, since } from './motion.js?v=20261124-1123';
import { RT, fireflies, lamp, lantern, moonRabbit, napStep, nightSky, strips } from './night.js?v=20261124-1123';
import { falling } from './palette.js?v=20261124-1123';
import { A, S, cam } from './state.js?v=20261124-1123';
import { view } from './view.js?v=20261124-1123';
import { catEyes, glow, glowSpark, gustAt, gustLeaves, nightOf, remake, riceWave } from './world.js?v=20261124-1123';

// ── Frame ────────────────────────────────────────────────────────────

function frame(ctx, t) {
    const { L, W, H, M, scale } = A, o = S.out.g, w = Stage.wind(t);
    o.clearRect(0, 0, W, H);
    const breathe = L.still ? 0 : 1;
    const hx = clamp(view.x + breathe * 0.25 * Math.sin(t * 0.11), -1, 1);
    const hy = clamp(view.y + breathe * 0.15 * Math.sin(t * 0.17 + 1), -1, 1);
    // Whole-pixel shift for something at depth z: the room (at the threshold) moves most.
    const shift = z => ({ x: Math.round(-hx * M * R.zT / z) - M, y: Math.round(-hy * M * 0.6 * R.zT / z) - M });
    const at = (z, draw) => { const d = shift(z); o.save(); o.translate(d.x, d.y); draw(); o.restore(); };
    S.shift = shift; S.t = t;

    relight();
    const g = S.grade, dark = g.dark;
    at(1e4, () => { o.drawImage(S.sky, 0, 0); nightSky(o, t, dark); });
    at(400, () => {
        const span = S.xR - S.xL;
        for (const c of S.clouds) {
            const x = S.xL - c.w + ((((c.x0 - (S.xL - c.w)) + c.v * t + S.cloudPush) % (span + c.w * 2)) + span + c.w * 2) % (span + c.w * 2);
            o.drawImage(c.canvas, Math.round(x), c.y);
        }
        birds(o, t);
        moonRabbit(o, t, dark);
    });
    at(120, () => { o.drawImage(S.far, 0, 0); ripples(o, t); riceWave(o, t); });
    at(9, () => o.drawImage(S.garden, 0, 0));
    for (const pl of S.plants) at(pl.z, () => plant(o, pl, t, w));
    at(6.5, () => { if (S.season === 'summer') flies(o, t); falling(o, t, w); gustLeaves(o, t); });
    if (S.bamboo) at(S.bamboo.z, () => strips(o, t, w));
    at(R.zT, () => {
        o.drawImage(S.room, 0, 0);
        if (S.sunOn) dapple(o, t, w);
        blind(o, t, w);
        drawThings(o, t);
        if (S.sunOn) dust(o, t);
        chimeAt(o, t);
        lantern(o, t, w, 0);
        smoke(o, t, w + gustAt(R.zT, t) * 4);
    });

    // The hour's light over everything; then what glows on its own.
    const lit = lanternShows();
    if (dark > 0 || g.sat !== 1 || g.gain.some(v => v !== 1)) {
        const img = o.getImageData(0, 0, W, H), d = img.data;
        RT.apply(d, g, nightSwap(dark));
        const dr = shift(R.zT);
        if (lit) lamp(d, W, H, S.lanternAt.x + dr.x, S.lanternAt.y + dr.y + 6, H * 0.3, [255, 168, 84], 0.42);
        if (S.screen) lamp(d, W, H, (S.screen.x0 + S.screen.x1) / 2 + dr.x, (S.screen.y0 + S.screen.y1) / 2 + dr.y, H * 0.17, [110, 140, 255], dark * 0.3);
        const carried = nightOf(dark) * glow.k;
        if (carried > 0.02) lamp(d, W, H, glow.x / scale, glow.y / scale + 2, H * 0.2, [255, 200, 130], 0.4 * carried);
        o.putImageData(img, 0, 0);
    }
    at(R.zT, () => {
        if (dark > 0.1) screen(o, t, S.hover === S.things.laptop);
        if (lit) lantern(o, t, w, 1);
    });
    if (S.season === 'summer') fireflies(o, t, clamp((dark - 0.5) * 2, 0, 1));
    const dt = Math.min(0.05, Math.max(0, t - (S.lastT ?? t)));
    S.lastT = t;
    catEyes(o, t, dt);
    glowSpark(o, t);
    remake(o, t);
    napStep(o, t);

    // Up to the screen at a whole-number scale, no smoothing.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.out.canvas, 0, 0, W * scale, H * scale);
}

/** A plant bending from its base, row by row in whole pixels. */
function plant(o, pl, t, w) {
    const kick = pl.kick != null && t - pl.kick < 2 ? 0.1 * Math.exp(-(t - pl.kick) * 2.2) * Math.sin((t - pl.kick) * 15) : 0;
    const bend = pl.amp * (w * 0.6 + 0.4 * Math.sin(t * 1.3 + pl.ph) * (0.3 + w)) + kick - pl.amp * 3 * gustAt(pl.z, t);
    let y = 0;
    while (y < pl.h) {
        const dx = Math.round(-bend * (pl.h - y));
        let y1 = y + 1;
        while (y1 < pl.h && Math.round(-bend * (pl.h - y1)) === dx) y1++;
        o.drawImage(pl.canvas, 0, y, pl.w, y1 - y, pl.x + dx, pl.y + y, pl.w, y1 - y);
        y = y1;
    }
}

const px = (o, x, y, c) => { o.fillStyle = c; o.fillRect(Math.round(x), Math.round(y), 1, 1); };

/** Leaf shadows on the veranda: small dithered ovals that drift with the wind. */
function dapple(o, t, w) {
    const { p } = cam;
    o.fillStyle = '#8a6470';
    for (const d of S.dapple) {
        const x = lerp(-3.5, 0.5, d.x) + Math.sin(t * 0.9 + d.ph) * 0.05 * (0.5 + w), z = lerp(4.15, 4.62, d.z);
        const c = p(x, 0, z), rx = Math.max(2, (d.s * cam.f) / z), ry = Math.max(1, rx * 0.22);
        for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++) for (let xx = -Math.ceil(rx); xx <= Math.ceil(rx); xx++) {
            const X = Math.round(c.x) + xx, Y = Math.round(c.y) + yy;
            if ((xx / rx) ** 2 + (yy / ry) ** 2 > 1 || ((X + Y) & 1)) continue;
            o.fillRect(X, Y, 1, 1);
        }
    }
}

/** Dust turning in the light: single pixels that brighten and fade. */
function dust(o, t) {
    const y0 = S.yEave, y1 = cam.p(0, 0, 2.9).y, span = y1 - y0;
    for (const d of S.dust) {
        const a = Math.sin(t * 1.3 + d.ph * 3);
        if (a < 0.2) continue;
        const x = lerp(S.xL, S.xR, d.x) + Math.sin(t * d.sp + d.ph) * 3;
        const y = y0 + (((d.y * span - t * 1.5 * d.sp) % span) + span) % span;
        px(o, x, y, a > 0.7 ? '#fff2cc' : '#c8b0b8');
    }
}

/** A bamboo blind hanging from the eave, half let down: slats every other pixel. */
function blind(o, t, w) {
    const { p } = cam;
    const x0 = cam.portrait ? 0.9 : 1.75, x1 = cam.portrait ? 1.7 : 2.55;
    const a = p(x0, R.eaveH, R.eaveZ), b = p(x1, lerp(1.35, R.eaveH - 0.12, S.blindRoll), R.eaveZ);
    const kick = since('blind'), sway = Math.sin(t * 0.9) * (1 + w * 3) * 0.8 + (kick < 2.5 ? Math.sin(kick * 7) * 3 * Math.exp(-kick * 1.8) : 0) + gustAt(R.eaveZ, t) * 6;
    const ax = Math.round(a.x), bx = Math.round(b.x), ay = Math.round(a.y), by = Math.round(b.y);
    S.blindBox = { x0: ax, y0: ay, x1: bx, y1: by };
    for (let y = ay + 2; y < by; y++) {
        const k = (y - ay) / (by - ay), dx = Math.round(sway * k * k);
        o.fillStyle = (y - ay) % 2 ? '#a07858' : '#d0a874';
        o.fillRect(ax + dx, y, bx - ax, 1);
    }
    o.fillStyle = '#3a2440';
    o.fillRect(ax - 1, ay, bx - ax + 2, 2);
    o.fillStyle = '#6a4a4a';
    o.fillRect(ax + Math.round(sway), by, bx - ax, 1);
    // Rolled up, the slack sits as a fat roll under the eave.
    if (S.blindRoll > 0.05 && S.blindRoll <= 1.08) { o.fillStyle = '#7a5640'; o.fillRect(ax + Math.round(sway), by - 1, bx - ax, 3); o.fillStyle = '#e0b880'; o.fillRect(ax + Math.round(sway), by - 1, bx - ax, 1); }
    o.fillStyle = '#4a2c3a';
    for (const k of [0.2, 0.8]) { const x = Math.round(lerp(ax, bx, k)); for (let y = ay; y < by; y++) o.fillRect(x + Math.round(sway * ((y - ay) / (by - ay)) ** 2), y, 1, 1); }
}

/** The wind chime: a glass bell with a goldfish, and its paper strip, swinging in pixels. */
function chimeAt(o, t) {
    const { p, f } = cam;
    const hook = p(cam.portrait ? -0.35 : -0.75, R.eaveH, R.eaveZ), k = f / R.eaveZ;
    const R0 = Math.max(2, Math.round(0.05 * k)), str = Math.max(3, Math.round(0.12 * k));
    const th = chime.th, swing = v => Math.round(Math.sin(th * 0.35) * v);
    const hx = Math.round(hook.x), hy = Math.round(hook.y);
    o.fillStyle = '#101c48';
    for (let i = 0; i < str; i++) o.fillRect(hx + swing(i), hy + i, 1, 1);
    // Bell: a dome of glass, lit on its left.
    const bx = hx + swing(str + R0), by = hy + str + R0;
    for (let y = -R0; y <= 0; y++) for (let x = -R0; x <= R0; x++) {
        if (x * x + y * y > R0 * R0 + R0 * 0.6) continue;
        const edge = x * x + y * y > (R0 - 1) * (R0 - 1);
        px(o, bx + x, by + y, edge ? (x < 0 ? '#ffffff' : '#9cb4ee') : (x < -R0 / 3 && y < -R0 / 3 ? '#ffffff' : '#d6e4fb'));
    }
    px(o, bx, by - Math.round(R0 * 0.35), '#e8687c');
    px(o, bx - 1, by - Math.round(R0 * 0.35), '#e8687c');
    // The strip, swinging further than the bell.
    const sh = Math.max(5, R0 * 4), sw = Math.max(2, R0);
    S.chimeBox = { x0: hx - R0 - 3, y0: hy, x1: hx + R0 + 3, y1: by + sh };
    for (let i = 0; i < sh; i++) {
        const dx = Math.round(Math.sin(th) * (i + R0 * 2) * 0.6 + Math.sin(t * 3.1) * i * 0.06);
        o.fillStyle = i < 2 ? '#101c48' : '#eef4ff';
        o.fillRect(bx + dx - (i < 2 ? 0 : Math.floor(sw / 2)), by + 1 + i, i < 2 ? 1 : sw, 1);
        if (i > sh * 0.3 && i < sh * 0.7) px(o, bx + dx, by + 1 + i, '#3a62c8');
    }
}

/** Smoke from the coil: a thin pixel trail that curls and thins as it rises. */
function smoke(o, t, w) {
    const s0 = S.smokeFrom;
    if (!s0) return;
    const puff = clamp(1 - (t - S.puffT) / 3, 0, 1), strands = 2 + Math.round(puff * 3), len = Math.round(40 + puff * 24);
    for (let strand = 0; strand < strands; strand++) {
        for (let i = 1; i < len; i++) {
            const k = i / len;
            if (k > 0.5 && ((i + Math.floor(t * 8)) % Math.max(2, Math.round(k * 5))) !== 0) continue;
            const curl = Math.sin(t * 1.2 - i * 0.3 + strand * 2) * i * 0.08 + Math.sin(t * 0.55 - i * 0.18) * i * 0.1;
            px(o, s0.x - i * 0.12 + curl * (1 + strand * 0.4) + (strand > 1 ? (strand - 1.5) * i * 0.12 : 0) + w * i * i * 0.004 * (strand ? 1.3 : 1), s0.y - i, strand ? '#8ea6de' : '#c6d6f6');
        }
    }
}

function birds(o, t) {
    if (!S.birds && t > S.nextBirds) {
        const r = Math.random;
        S.birds = { t0: t, v: 6 + r() * 4, y: S.yEave + (cam.ye - S.yEave) * (0.2 + r() * 0.4),
            list: Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ dx: -i * (4 + r() * 4), dy: Math.round((r() - 0.5) * 6), ph: r() * TAU })) };
    }
    if (!S.birds) return;
    const b = S.birds, x0 = S.xL - 6 + (t - b.t0) * b.v;
    if (x0 > S.xR + 30) { S.birds = null; S.nextBirds = t + 16 + Math.random() * 18; return; }
    for (const bd of b.list) {
        const x = Math.round(x0 + bd.dx), y = Math.round(b.y + bd.dy), up = Math.sin(t * 9 + bd.ph) > 0;
        const c = '#132a78';
        px(o, x, y, c);
        px(o, x - 1, y - (up ? 1 : 0), c); px(o, x + 1, y - (up ? 1 : 0), c);
        px(o, x - 2, y - (up ? 2 : 0), c); px(o, x + 2, y - (up ? 2 : 0), c);
    }
}

function flies(o, t) {
    const y0 = cam.ye, y1 = S.yEngawa;
    for (const d of S.flies) {
        if (t > d.next) {
            d.tx = lerp(S.xL, S.xR, clamp(d.hx + (Math.random() - 0.5) * 0.4, 0.05, 0.95));
            d.ty = lerp(y0 + (y1 - y0) * 0.2, y1 - 4, clamp(d.hy + (Math.random() - 0.5) * 0.5, 0, 1));
            if (!d.x) { d.x = d.tx; d.y = d.ty; }
            d.next = t + 1.5 + Math.random() * 3.5;
        }
        d.x += (d.tx - d.x) * 0.12; d.y += (d.ty - d.y) * 0.12;
        const x = Math.round(d.x), y = Math.round(d.y);
        px(o, x, y, '#13205a'); px(o, x, y + 1, '#13205a');
        if (Math.sin(t * 40 + d.ph) > 0) { px(o, x - 1, y, '#c6d6f6'); px(o, x + 1, y, '#c6d6f6'); }
    }
}

export { birds, blind, chimeAt, dapple, dust, flies, frame, plant, px, smoke };
