// Baking: painting the sky, clouds, far hills and garden once for this screen size.

import { LS, Pixel, R, Stack, Stage, TAU, clamp, clock, lerp, rng } from './base.js?v=20261124-1119';
import { crop, makeCamera, sprite } from './camera.js?v=20261124-1119';
import { px } from './frame.js?v=20261124-1119';
import { since } from './motion.js?v=20261124-1119';
import { MARK, RT, wake } from './night.js?v=20261124-1119';
import { bakeRoom } from './objects.js?v=20261124-1119';
import { CAPTION, PAL, dress } from './palette.js?v=20261124-1119';
import { A, S, cam, setA, setCam, setS } from './state.js?v=20261124-1119';
import { alphaOf, bakeThings } from './things.js?v=20261124-1119';
import { seasonPick } from './world.js?v=20261124-1119';

// ── Bake ─────────────────────────────────────────────────────────────

function bake(L) {
    // Whole screen pixels per art pixel; about 480 art pixels across a desk, 200 on a phone.
    const scale = Math.max(2, Math.round(L.W / 480));
    const W = Math.ceil(L.W / scale), H = Math.ceil(L.H / scale), M = Math.max(4, Math.round(Math.min(W, H) * 0.025));
    setA({ L, scale, W, H, M, LW: W + 2 * M, LH: H + 2 * M });
    setCam(makeCamera(W, H, M));
    const p = cam.p;
    setS({ out: Pixel.layer(W, H), season: seasonPick || (window.RoomTime ? RoomTime.season(RoomTime.now()) : 'summer') });
    dress(S.season);
    const place = document.getElementById('place');
    if (place) place.textContent = CAPTION[S.season];
    if (Stage.Sound.scape) { Stage.Sound.ambience = null; Stage.Sound.scape.season = S.season; }
    else Stage.Sound.ambience = S.season === 'summer' ? 'cicadas' : null;
    S.yEave = Math.round(p(0, R.eaveH, R.eaveZ).y);
    S.yBeam = Math.round(p(0, R.beam, R.zT).y);
    S.yEngawa = Math.round(p(0, 0, R.engawaZ).y);
    S.xL = Math.round(p(-R.shoji, 0, R.zT).x);
    S.xR = Math.round(p(R.shoji, 0, R.zT).x);
    S.xMid = (S.xL + S.xR) / 2;
    S.futon = cam.portrait ? { x0: -0.2, x1: 0.8 } : { x0: 0.35, x1: 1.4 };
    const sunY = Math.sin(clock.daylight ? Math.asin(clamp(clock.daylight.sun[1], -1, 1)) : 0.6);
    S.elevation = clamp(Math.asin(clamp(sunY, -1, 1)), 0.15, 0.75);
    S.camera = new LS.CameraPreset('front');
    S.light = LS.PaintedCloud.prototype.keyLight.call({ camera: S.camera }, S.elevation);

    S.sky = bakeSky();
    S.clouds = bakeClouds(rng(808));
    S.far = bakeFar(rng(17));
    S.garden = bakeGarden(rng(23));
    S.gardenAlpha = alphaOf(S.garden);
    S.grade = RT.grade(RT.hour()); S.sunOn = sunUp(S.grade);
    S.room = bakeRoom(rng(31));
    bakeThings();
    wake();
    {
        const r = rng(61), top = S.yEave - A.M, bottom = cam.ye;
        S.stars = Array.from({ length: Math.round(A.LW * (bottom - top) / 260) }, () => ({ x: Math.floor(r() * A.LW), y: Math.floor(lerp(top, bottom, r() ** 1.4)), dim: r() < 0.6, ph: r() * TAU, sp: 0.5 + r() * 2 }));
        const m = RT.moon(RT.now());
        // In the open sky between the wind chime and the lantern.
        S.moon = { x: Math.round(cam.p(cam.portrait ? 0.08 : -0.2, 0, R.eaveZ).x), y: Math.round(lerp(top, bottom, 0.2)), r: Math.max(3, Math.round(A.H * 0.018)), phase: m.phase };
        S.bugs = Array.from({ length: 7 }, (_, i) => { const q = rng(300 + i); return { pr: Array.from({ length: 10 }, () => q()) }; });
    }

    const r = rng(5);
    S.dapple = Array.from({ length: 14 }, () => ({ x: r(), z: r(), s: 0.05 + r() * 0.1, ph: r() * TAU }));
    S.dust = Array.from({ length: 28 }, () => ({ x: r(), y: r(), ph: r() * TAU, sp: 0.2 + r() * 0.5 }));
    S.flies = [0, 1].map(i => ({ hx: 0.3 + i * 0.35, hy: 0.55 + i * 0.1, x: 0, y: 0, tx: 0, ty: 0, next: 0, ph: i * 2 }));
    S.birds = null; S.nextBirds = 8;
}

/** Is the sun on the mats at this light? */
const sunUp = g => g.dark < 0.06 && g.hour > 7.4 && g.hour < 17.9;
/** Follow the clock: grade to the hour, and rebake the room when the sun comes onto or off the mats. */
function relight(now) {
    if (!S) return;
    if (!now && S.t - (S.litAt || -9) < 1) return;
    S.litAt = S.t;
    S.grade = RT.grade(RT.hour());
    if (Stage.Sound.scape) Stage.Sound.scape.hour = S.grade.hour;
    const on = sunUp(S.grade);
    if (on !== S.sunOn) { S.sunOn = on; S.room = bakeRoom(rng(31)); }
}
const lanternLit = () => (S.lanternOn != null ? S.lanternOn : S.grade.dark > 0.4);
// Just lit, the flame catches in a sputter; just put out, it gutters once.
const SPUTTER = [[0.06, 1], [0.12, 0], [0.2, 1], [0.24, 0], [0.4, 1]];
function lanternShows() {
    const on = lanternLit(), k = S.moves ? since('lantern') : 1e9;
    if (k > 0.45) return on;
    const step = SPUTTER.find(([at]) => k < at);
    return step ? (on ? !!step[1] : !step[1]) : on;
}
/** What the grade swaps instead of dimming: starlight, moonlight, the farmhouse window after dark. */
function nightSwap(dark) {
    if (dark < 0.15) return null;
    const m = new Map(), k = clamp((dark - 0.15) / 0.6, 0, 1), mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const sky = [40, 60, 130];
    m.set(MARK.star, mix(sky, [255, 250, 225])); m.set(MARK.dim, mix(sky, [150, 165, 215]));
    m.set(MARK.moon, mix([200, 210, 240], [255, 246, 214])); m.set(MARK.moonDark, mix(sky, [36, 44, 92]));
    m.set(MARK.mare, mix([180, 190, 225], [222, 214, 196])); m.set(MARK.rabbit, mix([150, 160, 200], [150, 146, 150]));
    if (dark > 0.3) { m.set(0xf0c070, [240, 192, 112]); m.set(0xffe6b0, [255, 230, 176]); }
    return m;
}

/** Sky: bands of the ramp from the eave down to the horizon, dithered where they meet. */
function bakeSky() {
    const s = sprite(), top = S.yEave - A.M, bottom = cam.ye;
    s.rect(0, 0, A.LW, A.LH, (x, y) => 1 - clamp((y - top) / (bottom - top), 0, 1));
    // A thin veil of cirrus, a few one-pixel streaks.
    const r = rng(4);
    for (let i = 0; i < 7; i++) {
        const y = Math.round(lerp(top, bottom, 0.1 + r() * 0.35)), x = lerp(S.xL, S.xR, r()), len = 8 + r() * 30;
        s.rect(x, y, x + len, y + 1, 0.8, 1, 1);
        s.rect(x + len * 0.2, y - 1, x + len * 0.7, y, 0.2, 1, 1);
    }
    return s.paint([PAL.sky, PAL.cirrus], { outline: 'none', clean: false });
}

function bakeClouds(r) {
    const list = [];
    const sky = cam.ye - S.yEave, open = S.xR - S.xL;
    const scale = cam.portrait ? 1.5 : 1;
    const add = (shape, cx, baseY, width, haze, v) => {
        const s = sprite();
        s.spheres(shape, { cx, baseY, width, camera: S.camera, light: S.light, crease: 0.04, lift: 0.45, liftHeight: 0.2, wrap: 0.3, form: 0.85 });
        const c = crop(s.paint([haze ? PAL.cloud.toward('#7aa4f2', haze) : PAL.cloud], { outline: 'none' }));
        if (c) list.push({ ...c, x0: c.x, v });
    };
    const cumulus = (seed, o) => Stack.shapes.cumulus(seed, o);
    const tw = open * 0.36 * scale;
    // Far first: they are drawn in list order.
    for (let i = 0; i < 5; i++) {
        const w = open * (0.05 + r() * 0.07);
        add(cumulus(30 + i, { height: 110, towers: 2, billows: 4, subBillows: 1 }),
            S.xL + open * r(), cam.ye - sky * (0.04 + r() * 0.08), w, 0.35, 0.3 + r() * 0.2);
    }
    add(cumulus(12, { width: 360, depth: 200, height: 300, towers: 4, billows: 5, billowSize: 0.6, subBillows: 1, lean: 0.2 }),
        S.xMid - open * 0.3, cam.ye + 1, tw * 0.7, 0.18, 0.12);
    if (S.season === 'summer') add(cumulus(6, { width: 330, depth: 240, height: 600, towers: 5, billows: 6, billowSize: 0.62, subBillows: 1, baseR: 80, lean: 0.2 }),
        S.xMid + open * 0.12, cam.ye + 2, tw * 1.05, 0, 0.2);
    else add(cumulus(8, { width: 420, depth: 200, height: 150, towers: 3, billows: 6, billowSize: 0.55, subBillows: 1 }),
        S.xMid + open * 0.15, cam.ye - sky * 0.08, tw * 0.9, 0.12, 0.15);
    for (let i = 0; i < 3; i++) {
        const w = open * (0.07 + r() * 0.06) * scale;
        add(cumulus(50 + i, { height: 130, towers: 2, billows: 5, subBillows: 1 }),
            S.xL + open * (0.1 + i * 0.36 + r() * 0.08), S.yEave + sky * (0.2 + r() * 0.25), w, 0, 0.6 + r() * 0.6);
    }
    return list;
}

/** One ridge line from noise, filled down to y0, with a lit rim along its crest. */
function ridge(s, y0, height, seed, freq, m) {
    const n = rng(seed), knots = Array.from({ length: 64 }, () => n());
    const at = x => { const t = (x * freq) % 63, i = Math.floor(t), f = t - i; return lerp(knots[i], knots[i + 1], f * f * (3 - 2 * f)); };
    for (let x = 0; x < A.LW; x++) {
        const top = Math.round(y0 - height * (0.3 + at(x) * 0.9));
        for (let y = top; y <= y0; y++) s.set(x, y, (x, y) => (y === top ? 1 : y < top + 2 ? 0.6 : 0.2 + 0.25 * at(x * 3)), m);
    }
}

function bakeFar(r) {
    const out = Pixel.layer(A.LW, A.LH), { p, ye, f } = cam;
    // Mountains, far and pale, then nearer foothills.
    const far = sprite();
    ridge(far, Math.round(ye), f * 0.07, 3, 0.012, 0);
    out.g.drawImage(far.paint([PAL.mtnFar], { outline: 'none', clean: false }), 0, 0);
    const near = sprite();
    ridge(near, Math.round(ye) + 1, f * 0.03, 17, 0.03, 0);
    out.g.drawImage(near.paint([PAL.mtnNear], { outline: 'none', clean: false }), 0, 0);

    // Paddies in bands to the foot of the hills: rows of rice as alternate pixel lines.
    const fields = sprite();
    const zs = [7, 8.5, 10.5, 13, 16.5, 21, 28, 38, 55, 85, 140, 260];
    for (let i = 0; i < zs.length; i++) {
        const yNear = Math.round(p(0, R.ground, zs[i]).y), yFar = i + 1 < zs.length ? Math.round(p(0, R.ground, zs[i + 1]).y) : Math.round(ye) + 2;
        const m = i % 2 ? 1 : 0;
        for (let y = yFar; y < yNear; y++) {
            const k = (y - yFar) / Math.max(1, yNear - yFar);
            for (let x = 0; x < A.LW; x++) fields.set(x, y, 0.35 + 0.4 * k + ((y - yFar) % 3 === 1 ? 0.2 : 0) - x / A.LW * 0.15, m);
        }
        // The raised path between paddies: one bright line.
        for (let x = 0; x < A.LW; x++) fields.set(x, yFar, 0.8, 2, 1);
    }
    const fieldC = fields.paint([PAL.fieldLit, PAL.fieldShade, PAL.bank], { outline: 'none', clean: false });
    out.g.drawImage(fieldC, 0, 0);
    const mask = alphaOf(fieldC);

    // A grove across the fields and a farmhouse.
    const groveY = Math.round(p(0, R.ground, 120).y), W = A.W;
    for (const [cx, wide, tall, seed] of [[S.xMid - W * 0.3, W * 0.52, f * 0.05, 71], [S.xMid + W * 0.34, W * 0.26, f * 0.032, 72]]) {
        const s = sprite(), k = 1000 / wide;
        s.spheres(Stack.shapes.shrub(seed, { width: 1000, depth: 160, height: tall * k, clumps: 90, rMin: f * 0.006 * k, rMax: f * 0.026 * k, buds: 1 }),
            { cx, baseY: groveY, width: wide, camera: S.camera, light: S.light, texture: 0.14, ragged: 0.35, form: 0.75, crease: 0.06, seed });
        out.g.drawImage(s.paint([PAL.leaf.toward('#5f84d4', 0.4)], { outline: 'sel' }), 0, 0);
    }
    const house = farmhouse(24, 130);
    out.g.drawImage(house, 0, 0);
    // Where the paddies show: field pixels the grove and the farmhouse don't cover.
    const fieldPx = fieldC.getContext('2d').getImageData(0, 0, A.LW, A.LH).data, farPx = out.g.getImageData(0, 0, A.LW, A.LH).data;
    for (let i = 0; i < mask.length; i++) if (mask[i] && (fieldPx[i * 4] !== farPx[i * 4] || fieldPx[i * 4 + 1] !== farPx[i * 4 + 1] || fieldPx[i * 4 + 2] !== farPx[i * 4 + 2])) mask[i] = 0;
    S.fieldMask = mask; S.farPix = farPx;
    return out.canvas;
}

function farmhouse(x, z) {
    const { p } = cam, s = sprite(), gy = R.ground;
    const a = p(x - 6, gy, z), b = p(x + 6, gy, z);
    const wallTop = Math.round(p(x, gy + 3, z).y), ridgeY = Math.round(p(x, gy + 7.5, z).y);
    const w = b.x - a.x;
    s.rect(a.x, wallTop, b.x, a.y, 0.5, 0);
    // A lit window, and the dark doorway.
    s.rect(a.x + w * 0.18, wallTop + 1, a.x + w * 0.3, wallTop + 3, 1, 2, 1);
    s.rect(a.x + w * 0.62, wallTop + 1, a.x + w * 0.72, a.y, 0, 0, 1);
    // Hipped roof, lit on its left slope.
    s.poly([{ x: a.x - w * 0.12, y: wallTop + 0.5 }, { x: b.x + w * 0.12, y: wallTop + 0.5 }, { x: b.x - w * 0.22, y: ridgeY }, { x: a.x + w * 0.22, y: ridgeY }], 0.45, 1);
    s.poly([{ x: a.x - w * 0.12, y: wallTop + 0.5 }, { x: a.x + w * 0.22, y: ridgeY }, { x: a.x + w * 0.36, y: ridgeY }, { x: a.x + w * 0.1, y: wallTop + 0.5 }], 0.95, 1);
    return s.paint([PAL.houseWall, PAL.roof, PAL.windowGlow], { outline: 'sel' });
}

function bakeGarden(r) {
    const out = Pixel.layer(A.LW, A.LH), { p, f } = cam, gy = R.ground;
    S.plants = [];
    // The hedge along the back of the garden, parted in the middle.
    for (const [x0, x1] of [[-9, -1.4], [2.6, 10]]) {
        const z = 11, a = p(x0, gy, z), b = p(x1, gy, z), top = p(0, gy + 0.75, z).y;
        const wide = b.x - a.x, k = 1000 / wide, s = sprite();
        s.spheres(Stack.shapes.shrub(81 + Math.round(x0), { width: 1000, depth: 140, height: (a.y - top) * k, clumps: 90,
            rMin: f * 0.008 * k, rMax: f * 0.03 * k, buds: 1 }), { cx: (a.x + b.x) / 2, baseY: Math.round(a.y), width: wide, camera: S.camera, light: S.light, texture: 0.24, ragged: 0.45, form: 0.65, crease: 0.15, seed: 81 + Math.round(x0) });
        out.g.drawImage(s.paint([PAL.leaf.toward('#3f68c0', 0.15)], { outline: 'sel' }), 0, 0);
    }
    // The tree on the left: trunk into the garden layer, the crown apart so it can move.
    {
        const z = 7.5, x = cam.portrait ? -2.6 : -3.9;
        const base = p(x, gy, z), top = p(x, gy + 2.6, z), tw = (0.22 * f) / z;
        const s = sprite();
        s.poly([{ x: base.x - tw, y: base.y }, { x: top.x - tw * 0.35, y: top.y }, { x: top.x + tw * 0.45, y: top.y }, { x: base.x + tw, y: base.y }],
            (px) => 0.25 + 0.6 * clamp((base.x - px) / (tw * 2) + 0.5, 0, 1) * 0.6, 0);
        out.g.drawImage(s.paint([PAL.bark], { outline: 'sel' }), 0, 0);
        const c0 = p(x + 0.5, gy + 3.7, z), crown = sprite();
        crown.spheres(Stack.shapes.crown(90, { width: 380, depth: 300, height: 270, clumps: 40, rMin: 26, rMax: 56 }),
            { cx: c0.x, baseY: Math.round(c0.y + (1.25 * f) / z), width: (3.8 * f) / z, camera: S.camera, light: S.light, lift: 0.4, liftHeight: 0.35, texture: 0.24, ragged: 0.4, form: 0.45, crease: 0.22, seed: 90 });
        const c = crop(crown.paint([PAL.crown], { outline: 'sel' }));
        if (c) S.plants.push({ ...c, z, amp: 0.05, ph: 0.4, label: 'tree' });
    }
    // Hydrangeas in front of the veranda: leaves and flower heads, one sprite each.
    for (const [x, z, w, h, seed] of [[-2.9, 6.6, 1.0, 0.8, 3], [1.7, 6.4, 1.5, 0.95, 2], [-1.25, 6.0, 1.3, 1.0, 1]]) {
        const base = p(x, gy, z), wpx = (w * f) / z, hpx = (h * f) / z, k = 300 / wpx, m = 300 / w;
        const s = sprite();
        s.spheres(Stack.shapes.hydrangea(100 + seed, { width: 300, depth: 220, height: hpx * k, clumps: 34, rMin: 0.12 * m, rMax: 0.22 * m,
            heads: 8 + seed % 3, headR: 0.13 * m, florets: 1 }), { cx: base.x, baseY: Math.round(base.y), width: wpx, camera: S.camera, light: S.light, parts: { flower: 1 }, texture: 0.24, ragged: 0.4, form: 0.45, crease: 0.22, seed });
        const c = crop(s.paint([PAL.leaf, PAL.flower], { outline: 'sel' }));
        if (c) S.plants.push({ ...c, z, amp: 0.06, ph: seed * 1.7, label: 'hydrangea' });
    }
    return out.canvas;
}

export { SPUTTER, bake, bakeClouds, bakeFar, bakeGarden, bakeSky, farmhouse, lanternLit, lanternShows, nightSwap, relight, ridge, sunUp };
