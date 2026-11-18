/*
 * tatami.js — a summer afternoon in a tatami room.
 *
 * You are lying on the futon, looking out. The shoji are slid open onto the
 * veranda (engawa); past it, a garden of hydrangeas and a tree, then rice
 * fields, mountains, and a cumulonimbus building over them. A wind chime and a
 * bamboo blind hang from the eaves. A mosquito coil smokes in its pig. There
 * is watermelon on the veranda, a guitar by the post, and a radio.
 *
 * Everything is placed in metres and projected through one camera, so the
 * floor, the room and the view all share a vanishing point.
 *
 * tatami-world: the same room, with the view out of it on the new framework.
 * The sky is js/sky.js's physical model at the clock's hour (?time=HH:MM,
 * afternoon by default); the clouds are js/stack.js volumes painted in flat
 * bands by LivingSky.PaintedCloud (js/scene.js). Keep it a drawing.
 */
(function () {
    'use strict';
    const P = window.Painter;
    const Stage = window.Stage;
    const { Clock, Sky, Stack } = window;
    const { TAU, lerp, clamp } = P;

    // The room, in metres. x is across, y is up from the tatami, z is away from you.
    const R = {
        half: 2.7,        // room half-width
        zT: 3.6,          // the threshold, where the shoji run
        beam: 2.2,        // underside of the lintel
        ceil: 2.5,
        shoji: 1.95,      // the shoji are slid back to here on each side
        engawaZ: 4.7,     // outer edge of the veranda
        eaveZ: 5.0, eaveH: 2.18,
        ground: -0.45     // the garden sits below the veranda
    };

    const C = {
        skyTop: '#1542c4', skyMid: '#2a69ea', skyLow: '#72a5f7', haze: '#bcd5ff',
        mtnFar: '#8aa8e6', mtnNear: '#6488d4',
        wall: '#17245a', wallDeep: '#0b1236',
        ceiling: '#0d1640', ceilingLit: '#1f306c',
        wood: '#141f50', woodLit: '#4561b2',
        engawaShade: '#22377a', engawaSun: '#7193dc',
        tatamiNear: '#1f3569', tatamiFar: '#4d73b2', heri: '#0c1640'
    };

    const LINEN = { deep: [86, 110, 184], shadow: [132, 156, 218], body: [180, 198, 240], light: [216, 228, 251], white: [240, 245, 255] };
    const BLANKET = { deep: [34, 78, 150], shadow: [62, 116, 192], body: [104, 158, 222], light: [156, 198, 242], white: [204, 228, 253] };

    let L = null, cam = null, S = null;
    const query = new URLSearchParams(location.search);
    const clock = query.has('time') ? Clock.fromQuery(query) : new Clock({ paused: true, time: ((15 - 6) / 13.5) * 180 });
    const SKY = new Sky({ haze: 0.1, exposure: 11 });
    const LS = window.LivingSky;
    // In the pixel look, plants are Gaussian splats: leaf-shaped dabs (js/splat.js).
    const PIXEL = (query.get('style') || window.STAGE_STYLE) === 'pixel' && !!window.Splat;
    const chime = Stage.makeChime();

    /**
     * Where your head is, -1..1 each way: the mouse on a desk, a drag or the
     * phone's tilt on a phone. Near things shift more than far ones, so the
     * room has depth; frame() turns it into a shift per layer.
     */
    const view = { x: 0, y: 0, tx: 0, ty: 0, drag: null, tilt: false };
    addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') view.drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    });
    addEventListener('pointermove', e => {
        if (view.drag) {
            const k = 2.5 / Math.min(innerWidth, innerHeight);
            view.tx = clamp(view.drag.tx - (e.clientX - view.drag.x) * k, -1, 1);
            view.ty = clamp(view.drag.ty - (e.clientY - view.drag.y) * k, -1, 1);
        } else if (e.pointerType === 'mouse' && !view.tilt) {
            view.tx = (e.clientX / innerWidth) * 2 - 1;
            view.ty = (e.clientY / innerHeight) * 2 - 1;
        }
    });
    for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => { view.drag = null; });
    addEventListener('deviceorientation', e => {
        if (e.gamma == null || view.drag) return;
        view.tilt = true;
        view.tx = clamp(e.gamma / 25, -1, 1);
        view.ty = clamp((e.beta - 50) / 25, -1, 1);
    });
    // ?look=x,y holds the head still at a place, for renders.
    if (query.has('look')) {
        const [x, y] = query.get('look').split(',').map(Number);
        view.x = view.tx = x || 0; view.y = view.ty = y || 0;
    }
    function stepView(dt) {
        const k = 1 - Math.exp(-dt * 3);
        view.x += (view.tx - view.x) * k;
        view.y += (view.ty - view.y) * k;
    }

    // ── Camera ───────────────────────────────────────────────────────────

    function makeCamera(W, H) {
        const portrait = H > W * 1.05;
        const f = portrait ? H * 0.75 : Math.max(W * 0.55, H * 0.88);
        const ye = H * (portrait ? 0.4 : 0.5);
        const cx = W / 2;
        const camH = 0.9;
        const p = (x, y, z) => ({ x: cx + (x * f) / z, y: ye - ((y - camH) * f) / z });
        return { f, ye, cx, camH, portrait, p };
    }

    function quad(g, pts) {
        g.beginPath();
        pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
    }

    function paste(g, c) { g.drawImage(c.canvas, c.x, c.y, c.w, c.h); }

    /** Pastes a painted form flattened toward its base: cloth lying down rather than heaped. */
    function squash(g, c, k) {
        const base = c.y + c.h;
        g.drawImage(c.canvas, c.x, base - c.h * k, c.w, c.h * k);
    }

    /**
     * Any Stack shape painted puff by puff in a Layers style, lit like the
     * clouds: `width` px wide, centred on cx, its base on baseY. Paste it.
     */
    function form(shape, cx, baseY, width, { style = 'foliage', parts = {}, fog = 0, sky = [255, 255, 255], max = 1600 } = {}) {
        const b = Stack.bounds(shape);
        const aspect = (b.top + (b.z1 - b.z0) * 0.35) / (b.x1 - b.x0) * 1.2 + 0.08;
        const bw = Math.round(clamp(width * L.dpr * 1.1, 48, max));
        if (PIXEL) return splatForm(shape, cx, baseY, width, bw, Math.max(24, Math.round(bw * aspect)), { style, parts, fog, sky });
        const f = new LS.PaintedCloud(shape, { w: bw, h: Math.max(24, Math.round(bw * aspect)), puffs: true, fit: 0.9 });
        f.paintPuffs(style, f.keyLight(S.elevation), { fog, sky, parts });
        return { canvas: f.canvas, ...f.place(cx, baseY, width) };
    }

    /**
     * The same form as Gaussian splats: each part (leaves, flowers) seeded
     * with dabs over its surface, all framed by one camera so they line up.
     * Dabs are sized on screen (about `dab` CSS px), whatever the form's size.
     */
    function splatForm(shape, cx, baseY, width, w, h, { style, parts, fog, sky, dab = 9 }) {
        const camera = new LS.CameraPreset('front');
        const frame = camera.frame(Stack.bounds(shape), w, h, { fit: 0.9 });
        const sun = LS.PaintedCloud.prototype.keyLight.call({ camera }, S.elevation);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        const groups = new Map();
        for (const q of shape) { const k = parts[q.part] ? q.part : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
        // Leaves first, flowers over them.
        for (const [part, spheres] of [...groups].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0))) {
            const area = spheres.reduce((a, q) => a + q.r * q.r, 0);
            // A dab is drawn about 7 of splat.js's widths across (a 3-sigma ellipse, 3:1).
            const wd = (dab * L.dpr) / (frame.scale * 7);
            const dabs = Math.round(clamp((4 * Math.PI * area * 0.0324) / (wd * wd), 150, 24000));
            Stack.draw(g, Stack.pile(spheres), frame, 'splat', { style: parts[part] || (style === 'foliage' ? 'foliagePixel' : style), sun, dabs, seed: spheres.length });
        }
        if (fog > 0) {
            g.globalCompositeOperation = 'source-atop'; g.globalAlpha = fog;
            g.fillStyle = `rgb(${sky.map(Math.round).join(',')})`; g.fillRect(0, 0, w, h);
            g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        }
        const a = g.getImageData(0, 0, w, h).data;
        let x0 = w, x1 = -1, y1 = -1;
        for (let k = 0; k < w * h; k++) if (a[k * 4 + 3] > 128) { const x = k % w, y = (k - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        const s = width / (x1 + 1 - x0);
        return { canvas, x: cx - ((x0 + x1 + 1) / 2) * s, y: baseY - (y1 + 1) * s, w: w * s, h: h * s };
    }

    // ── Bake ─────────────────────────────────────────────────────────────

    function bake(L0) {
        L = L0;
        cam = makeCamera(L.W, L.H);
        const { W, H } = L;
        const p = cam.p;
        S = {};
        S.yEave = p(0, R.eaveH, R.eaveZ).y;
        S.yBeam = p(0, R.beam, R.zT).y;
        S.yEngawa = p(0, 0, R.engawaZ).y;
        S.yThreshold = p(0, 0, R.zT).y;
        S.xL = p(-R.shoji, 0, R.zT).x;
        S.xR = p(R.shoji, 0, R.zT).x;
        S.futon = cam.portrait ? { x0: -0.35, x1: 0.65 } : { x0: 0.35, x1: 1.4 };

        // The clock sets how high the light is; the painter keeps it upper left.
        S.elevation = Math.max(0.15, Math.min(0.75, Math.asin(Math.max(-1, Math.min(1, clock.daylight.sun[1])))));
        S.sky = bakeSky();
        S.clouds = bakeClouds(P.rng(808));
        S.far = bakeFar(P.rng(17));
        S.garden = bakeGarden(P.rng(23));
        S.room = bakeRoom(P.rng(31));
        S.over = P.layer(W, H, L.dpr);
        P.vignette(S.over.g, W, H, { strength: 0.45 });

        // Leaf shadows on the veranda.
        const r = P.rng(5);
        S.dapple = Array.from({ length: 16 }, () => ({ x: r(), z: r(), s: 0.06 + r() * 0.12, ph: r() * TAU }));
        S.dust = Array.from({ length: 40 }, () => ({ x: r(), y: r(), z: 0.4 + r() * 0.6, ph: r() * TAU, sp: 0.2 + r() * 0.5 }));
        S.flies = [0, 1].map(i => ({ hx: 0.3 + i * 0.35, hy: 0.55 + i * 0.1, x: 0, y: 0, tx: 0, ty: 0, next: 0, ph: i * 2 }));
        S.birds = null; S.nextBirds = 8;
    }

    /** The physical sky at the clock's hour, chroma pushed the way a painter pushes a summer sky. */
    function bakeSky() {
        const { W, H, dpr, u } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const light = clock.daylight;
        // The physics sets the hour's light; the painter's palette (the room's
        // cobalt, from the tatami style) pulls the hue the way the room is lit.
        const paint = window.Layers.styles.tatami.sky.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
        const tint = i => { const t = i * (paint.length - 1), j = Math.min(paint.length - 2, Math.floor(t));
            return paint[j].map((v, k) => v + (paint[j + 1][k] - v) * (t - j)); };
        const stops = SKY.gradient(light.sun, { stops: 7, top: 1.0, azimuth: Math.PI * 0.6 })
            .map((c, i, all) => {
                const physical = LS.saturate([1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)), 2.2);
                return physical.map((v, k) => v + (tint(i / (all.length - 1))[k] - v) * 0.55);
            });
        const sg = g.createLinearGradient(0, S.yEave, 0, cam.ye);
        stops.forEach((c, i) => sg.addColorStop(i / (stops.length - 1), `rgb(${c.map(Math.round).join(',')})`));
        g.fillStyle = sg;
        g.fillRect(0, 0, W, H);
        S.skyAt = y => stops[Math.round(clamp((y - S.yEave) / (cam.ye - S.yEave), 0, 1) * (stops.length - 1))];
        // A high veil of cirrus.
        g.save();
        g.globalAlpha = 0.16;
        g.fillStyle = '#e4edff';
        const r = P.rng(4);
        for (let i = 0; i < 6; i++) {
            g.beginPath();
            g.ellipse(S.xL + r() * (S.xR - S.xL), S.yEave + (cam.ye - S.yEave) * (0.08 + r() * 0.3), W * (0.04 + r() * 0.08), u * 0.3, -0.03, 0, TAU);
            g.fill();
        }
        g.restore();
        return K.canvas;
    }

    /**
     * Stack clouds, placed where the old painted ones were. Each is rendered
     * once at a buffer size matched to its size on screen, then painted under
     * the clock's sun; `fog` melts the far ones into the sky behind them.
     */
    function bakeClouds(r) {
        const { dpr } = L;
        const list = [];
        const sky = cam.ye - S.yEave;
        const open = S.xR - S.xL;
        const scale = cam.portrait ? 1.5 : 1;
        const light = clock.daylight;
        const add = (shape, cx, baseY, width, aspect, fog, v, front) => {
            const bw = Math.round(clamp(width * dpr * 1.15, 120, 720));
            const cloud = new LS.PaintedCloud(shape, { w: bw, h: Math.round(bw * aspect), puffs: true, slices: 260, fit: 0.86 });
            const at = cloud.place(cx, baseY, width);
            cloud.paintPuffs('tatami', cloud.keyLight(S.elevation), { fog, sky: S.skyAt(at.y + at.h * 0.5) });
            const c = { canvas: cloud.canvas, ...at, x0: at.x, y0: at.y, v, alpha: 1 };
            front ? list.push(c) : list.unshift(c);
        };
        const cumulus = (seed, o) => Stack.shapes.cumulus(seed, o);

        // The tower, its crown cut off by the eave: too big for the frame.
        const tw = open * 0.36 * scale;
        add(cumulus(6, { width: 330, depth: 240, height: 600, towers: 5, billows: 6, billowSize: 0.62, subBillows: 1, baseR: 80, lean: 0.2 }),
            cam.cx + open * 0.12, cam.ye + 4, tw * 1.05, 1.5, 0.02, 0.8, true);
        // A second, further back.
        add(cumulus(12, { width: 360, depth: 200, height: 300, towers: 4, billows: 5, billowSize: 0.6, subBillows: 1, lean: 0.2 }),
            cam.cx - open * 0.3, cam.ye + 2, tw * 0.7, 0.95, 0.3, 0.5, false);
        // A bank of small cumulus along the horizon.
        for (let i = 0; i < 5; i++) {
            const w = open * (0.05 + r() * 0.07);
            const cx = S.xL + open * r();
            const cy = cam.ye - sky * (0.04 + r() * 0.08);
            add(cumulus(30 + i, { height: 110, towers: 2, billows: 4, subBillows: 1 }), cx, cy + w * 0.06, w, 0.75, 0.42, 1.3 + r(), false);
        }
        // Loose puffs up high, closer and quicker.
        for (let i = 0; i < 3; i++) {
            const w = open * (0.07 + r() * 0.06) * scale;
            const cx = S.xL + open * (0.1 + i * 0.36 + r() * 0.08);
            const cy = S.yEave + sky * (0.2 + r() * 0.25);
            add(cumulus(50 + i, { height: 130, towers: 2, billows: 5, subBillows: 1 }), cx, cy + w * 0.07, w, 0.8, 0.08, 3 + r() * 3, true);
        }
        return list;
    }

    function ridge(g, n, y0, height, color, seed, freq) {
        const { W } = L;
        g.beginPath();
        g.moveTo(-10, y0 + 2);
        for (let x = -10; x <= W + 10; x += 4) {
            const v = n(x * freq + seed, seed, 4);
            g.lineTo(x, y0 - height * (0.25 + v * 1.1));
        }
        g.lineTo(W + 10, y0 + 2);
        g.closePath();
        g.fillStyle = color;
        g.fill();
    }

    function bakeFar(r) {
        const { W, H, dpr, u, tex } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const { p, ye, f } = cam;
        const n = P.noise2D(91);

        // Mountains: far and pale, then nearer foothills.
        ridge(g, n, ye, f * 0.07, C.mtnFar, 3, 0.004);
        g.save();
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(210,225,255,0.18)';
        g.fillRect(0, ye - f * 0.1, W * 0.5, f * 0.1);
        g.restore();
        ridge(g, n, ye + 1, f * 0.03, C.mtnNear, 17, 0.009);

        // Fields: paddies in bands, receding to the foot of the hills.
        const ground = R.ground;
        const zs = [7, 8.5, 10.5, 13, 16.5, 21, 28, 38, 55, 85, 140, 260];
        for (let i = 0; i < zs.length; i++) {
            const yNear = p(0, ground, zs[i]).y;
            const yFar = i + 1 < zs.length ? p(0, ground, zs[i + 1]).y : ye + 2;
            const lit = i % 2 === 0;
            const fg = g.createLinearGradient(0, 0, W, 0);
            fg.addColorStop(0, lit ? '#4d80d4' : '#3b6bc2');
            fg.addColorStop(1, lit ? '#3f70c6' : '#3260b2');
            g.fillStyle = fg;
            g.fillRect(0, yFar, W, yNear - yFar + 1);
            // Rows of rice.
            g.strokeStyle = lit ? 'rgba(160,195,255,0.18)' : 'rgba(10,30,90,0.18)';
            g.lineWidth = 1;
            const rows = Math.max(1, Math.floor((yNear - yFar) / 3));
            for (let k = 1; k < rows; k++) {
                const yy = lerp(yFar, yNear, k / rows);
                g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
            }
            // The raised path between paddies.
            g.fillStyle = 'rgba(180,205,255,0.35)';
            g.fillRect(0, yFar, W, Math.max(1, (yNear - yFar) * 0.06));
        }

        // A grove on the far side of the fields, and a farmhouse.
        const groveY = p(0, ground, 120).y;
        const far = { fog: 0.18, sky: [96, 138, 214] };
        for (const [cx, wide, tall, seed] of [[cam.cx - W * 0.3, W * 0.52, f * 0.05, 71], [cam.cx + W * 0.34, W * 0.26, f * 0.032, 72]]) {
            const k = 1000 / wide;
            paste(g, form(Stack.shapes.shrub(seed, { width: 1000, depth: 160, height: tall * k, clumps: 90,
                rMin: f * 0.008 * k, rMax: f * 0.018 * k }), cx, groveY, wide, far));
        }
        farmhouse(g, 24, 130);

        if (tex) P.grain(g, tex, W, H, { alpha: 0.08, mode: 'soft-light' });
        return K.canvas;
    }

    function farmhouse(g, x, z) {
        const { p } = cam;
        const gy = R.ground;
        const a = p(x - 6, gy, z), b = p(x + 6, gy, z);
        const wallTop = p(x, gy + 3, z).y;
        const ridgeY = p(x, gy + 7.5, z).y;
        g.fillStyle = '#2b4a98';
        g.fillRect(a.x, wallTop, b.x - a.x, a.y - wallTop);
        g.fillStyle = 'rgba(190,210,255,0.25)';
        g.fillRect(a.x + (b.x - a.x) * 0.2, wallTop + (a.y - wallTop) * 0.3, (b.x - a.x) * 0.15, (a.y - wallTop) * 0.4);
        // Hipped roof.
        g.beginPath();
        g.moveTo(a.x - (b.x - a.x) * 0.12, wallTop);
        g.lineTo(b.x + (b.x - a.x) * 0.12, wallTop);
        g.lineTo(b.x - (b.x - a.x) * 0.22, ridgeY);
        g.lineTo(a.x + (b.x - a.x) * 0.22, ridgeY);
        g.closePath();
        g.fillStyle = '#1d3474';
        g.fill();
        g.fillStyle = 'rgba(150,180,250,0.3)';
        g.beginPath();
        g.moveTo(a.x - (b.x - a.x) * 0.12, wallTop);
        g.lineTo(a.x + (b.x - a.x) * 0.22, ridgeY);
        g.lineTo(a.x + (b.x - a.x) * 0.35, ridgeY);
        g.lineTo(a.x + (b.x - a.x) * 0.1, wallTop);
        g.closePath();
        g.fill();
    }

    function bakeGarden(r) {
        const { W, H, dpr, u, tex } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const { p, f } = cam;
        const gy = R.ground;

        // A low hedge along the back of the garden, parted in the middle.
        for (const [x0, x1] of [[-9, -1.4], [2.6, 10]]) {
            const z = 11;
            const a = p(x0, gy, z), b = p(x1, gy, z);
            const top = p(0, gy + 0.75, z).y;
            const wide = b.x - a.x, k = 1000 / wide;
            paste(g, form(Stack.shapes.shrub(81 + Math.round(x0), { width: 1000, depth: 140, height: (a.y - top) * k, clumps: 110,
                rMin: f * 0.01 * k, rMax: f * 0.022 * k }), (a.x + b.x) / 2, a.y, wide));
        }

        // The tree's crown and the hydrangeas are kept apart so the wind can move them.
        S.plants = [];

        // The tree on the left, reaching up past the eaves.
        {
            const z = 7.5, x = cam.portrait ? -2.6 : -3.9;
            const base = p(x, gy, z), top = p(x, gy + 2.6, z);
            const tw = (0.22 * f) / z;
            g.fillStyle = '#121d4c';
            g.beginPath();
            g.moveTo(base.x - tw, base.y);
            g.quadraticCurveTo(base.x - tw * 0.4, (base.y + top.y) / 2, top.x - tw * 0.3, top.y);
            g.lineTo(top.x + tw * 0.5, top.y);
            g.quadraticCurveTo(base.x + tw * 0.6, (base.y + top.y) / 2, base.x + tw, base.y);
            g.fill();
            g.fillStyle = 'rgba(120,150,230,0.25)';
            g.fillRect(base.x - tw * 0.6, top.y, tw * 0.3, base.y - top.y);
            const c0 = p(x + 0.5, gy + 3.7, z);
            S.plants.push({ ...form(Stack.shapes.crown(90, { width: 380, depth: 300, height: 270, clumps: 50, rMin: 22, rMax: 50 }),
                c0.x, c0.y + (1.25 * f) / z, (3.8 * f) / z), z, amp: 0.025, ph: 0.4 });
        }

        // Hydrangeas in front of the veranda.
        for (const [x, z, w, h, seed] of [[-1.25, 6.0, 1.3, 1.0, 1], [1.7, 6.4, 1.5, 0.95, 2], [-2.9, 6.6, 1.0, 0.8, 3]]) {
            const base = p(x, gy, z);
            const wpx = (w * f) / z, hpx = (h * f) / z;
            const k = 300 / wpx, m = 300 / w;
            S.plants.push({ ...form(Stack.shapes.hydrangea(100 + seed, { width: 300, depth: 220, height: hpx * k, clumps: 50,
                rMin: 0.09 * m, rMax: 0.18 * m, heads: 5 + seed % 3, headR: 0.13 * m }), base.x, base.y, wpx, { parts: { flower: 'hydrangea' } }),
                z, amp: 0.035, ph: seed * 1.7 });
        }
        S.plants.sort((a, b) => b.z - a.z);

        if (tex) P.grain(g, tex, W, H, { alpha: 0.1, mode: 'soft-light' });
        return K.canvas;
    }

    // ── The room ─────────────────────────────────────────────────────────

    function bakeRoom(r) {
        const { W, H, dpr, u, tex } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const { p, f, cx, ye } = cam;
        const zN = 0.45;

        // Everything starts as wall in shadow.
        g.fillStyle = C.wall;
        g.fillRect(0, 0, W, H);

        // Ceiling boards running away from you, lighter toward the opening.
        const yCeil = p(0, R.ceil, R.zT).y;
        const cg = g.createLinearGradient(0, 0, 0, yCeil);
        cg.addColorStop(0, C.wallDeep);
        cg.addColorStop(1, C.ceilingLit);
        g.fillStyle = cg;
        g.fillRect(0, 0, W, yCeil);
        g.strokeStyle = 'rgba(0,0,20,0.45)';
        g.lineWidth = 1;
        for (let x = -R.half; x <= R.half + 0.01; x += 0.36) {
            const a = p(x, R.ceil, R.zT), b = p(x, R.ceil, zN);
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }

        // Side walls.
        for (const side of [-1, 1]) {
            const x = side * R.half;
            quad(g, [p(x, 0, R.zT), p(x, R.ceil, R.zT), p(x, R.ceil, zN), p(x, 0, zN)]);
            const a = p(x, 1.2, R.zT), b = p(x, 1.2, 1.2);
            const wg = g.createLinearGradient(a.x, 0, b.x, 0);
            wg.addColorStop(0, '#1f2f6a');
            wg.addColorStop(1, C.wallDeep);
            g.fillStyle = wg;
            g.fill();
            // The lintel line carried round the walls.
            g.strokeStyle = '#0a1134';
            g.lineWidth = Math.max(2, u * 0.5);
            const l0 = p(x, R.beam, R.zT), l1 = p(x, R.beam, zN);
            g.beginPath(); g.moveTo(l0.x, l0.y); g.lineTo(l1.x, l1.y); g.stroke();
        }

        // Tatami.
        tatami(g, r);

        // Veranda boards beyond the threshold.
        const eL = -R.half - 2, eR = R.half + 2;
        quad(g, [p(eL, 0, R.zT), p(eR, 0, R.zT), p(eR, 0, R.engawaZ), p(eL, 0, R.engawaZ)]);
        g.fillStyle = C.engawaShade;
        g.fill();
        const zSun = 4.12;
        quad(g, [p(eL, 0, zSun), p(eR, 0, zSun), p(eR, 0, R.engawaZ), p(eL, 0, R.engawaZ)]);
        const sg = g.createLinearGradient(0, p(0, 0, zSun).y, 0, S.yEngawa);
        sg.addColorStop(0, '#5f82d2');
        sg.addColorStop(1, C.engawaSun);
        g.fillStyle = sg;
        g.fill();
        g.strokeStyle = 'rgba(0,0,30,0.3)';
        g.lineWidth = 1;
        for (let z = R.zT + 0.13; z < R.engawaZ; z += 0.13) {
            const a = p(eL, 0, z), b = p(eR, 0, z);
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
        g.fillStyle = 'rgba(225,236,255,0.6)';
        g.fillRect(0, S.yEngawa - 1, W, Math.max(1.5, u * 0.2));

        // Watermelon and a bottle of ramune, on a tray in the sun.
        tray(g, cam.portrait ? 0.7 : 1.15, 4.3);

        // Eave soffit and its rafters, between the lintel and the eave's edge.
        g.fillStyle = '#0f1946';
        g.fillRect(0, S.yBeam, W, S.yEave - S.yBeam + 1);
        g.strokeStyle = 'rgba(120,150,230,0.25)';
        g.lineWidth = Math.max(1, u * 0.25);
        for (let x = -6; x <= 6; x += 0.45) {
            const a = p(x, 2.32, R.zT), b = p(x, R.eaveH + 0.02, R.eaveZ);
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
        const fasciaTop = p(0, R.eaveH + 0.07, R.eaveZ).y;
        g.fillStyle = '#16225a';
        g.fillRect(0, fasciaTop, W, S.yEave - fasciaTop);
        g.fillStyle = 'rgba(150,180,250,0.45)';
        g.fillRect(0, S.yEave - 1, W, 1);

        // A veranda post holding the eave up.
        {
            const x = cam.portrait ? 1.9 : 2.45, z = R.eaveZ - 0.05;
            const a = p(x - 0.06, 0, z), b = p(x + 0.06, R.eaveH, z);
            g.fillStyle = '#121d4e';
            g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
            g.fillStyle = 'rgba(140,170,245,0.5)';
            g.fillRect(a.x, b.y, Math.max(1, (b.x - a.x) * 0.25), a.y - b.y);
        }

        // Cut the window to the outside: everything between the shoji, the
        // eave and the veranda's edge is sky and garden.
        g.clearRect(S.xL - 2, S.yEave, S.xR - S.xL + 4, S.yEngawa - S.yEave);

        // Lintel (kamoi), the transom above it, and the threshold rail.
        const beamA = p(-R.half, R.beam + 0.07, R.zT), beamB = p(R.half, R.beam, R.zT);
        g.fillStyle = C.wood;
        g.fillRect(beamA.x, beamA.y, beamB.x - beamA.x, beamB.y - beamA.y);
        g.fillStyle = C.woodLit;
        g.fillRect(beamA.x, beamB.y - 1.5, beamB.x - beamA.x, 1.5);
        const trTop = p(0, R.ceil - 0.05, R.zT).y;
        g.fillStyle = '#5a7bcc';
        g.fillRect(beamA.x, trTop, beamB.x - beamA.x, beamA.y - trTop);
        g.fillStyle = C.wood;
        const bars = 60;
        for (let i = 0; i <= bars; i++) {
            const x = lerp(beamA.x, beamB.x, i / bars);
            g.fillRect(x - 1, trTop, Math.max(2, u * 0.35), beamA.y - trTop);
        }
        g.fillRect(beamA.x, (trTop + beamA.y) / 2 - 1, beamB.x - beamA.x, 2);
        g.fillRect(beamA.x, trTop - u * 0.6, beamB.x - beamA.x, u * 0.6);

        const sillA = p(-R.half, 0.035, R.zT), sillB = p(R.half, 0, R.zT);
        g.fillStyle = '#1a2763';
        g.fillRect(sillA.x, sillA.y, sillB.x - sillA.x, sillB.y - sillA.y + 1);
        g.fillStyle = 'rgba(180,205,255,0.5)';
        g.fillRect(sillA.x, sillA.y, sillB.x - sillA.x, 1);

        // Shoji, slid back to either side, glowing.
        shoji(g, -R.half + 0.06, -R.shoji);
        shoji(g, R.shoji, R.half - 0.06);

        // Corner posts.
        for (const side of [-1, 1]) {
            const x0 = side < 0 ? -R.half : R.half - 0.13, x1 = x0 + 0.13;
            const a = p(x0, 0, R.zT), b = p(x1, R.ceil, R.zT);
            g.fillStyle = C.wood;
            g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
            g.fillStyle = 'rgba(120,150,235,0.4)';
            const lit = side < 0 ? b.x - 2 : a.x;
            g.fillRect(lit, b.y, 2, a.y - b.y);
        }

        // Things on the floor.
        guitar(g);
        radio(g, cam.portrait ? 1.45 : 2.05, 3.15);
        futon(g, r);
        mosquitoPig(g, cam.portrait ? -0.5 : -0.9, 3.05);

        if (tex) P.grain(g, tex, W, H, { alpha: 0.22, mode: 'soft-light', scale: 1.6 });
        return K.canvas;
    }

    function tatami(g, r) {
        const { p, f } = cam;
        const { u } = L;
        const zMin = 0.45;
        const mats = [];
        const across = [[-2.7, -0.9], [-0.9, 0.9], [0.9, 2.7]];
        for (const [x0, x1] of across) mats.push({ x0, x1, z0: 2.7, z1: R.zT, along: 'x' });
        for (let x = -2.7; x < 2.69; x += 0.9) mats.push({ x0: x, x1: x + 0.9, z0: 0.9, z1: 2.7, along: 'z' });
        for (const [x0, x1] of across) mats.push({ x0, x1, z0: -0.9, z1: 0.9, along: 'x' });

        for (const m of mats) {
            const z0 = Math.max(zMin, m.z0);
            if (z0 >= m.z1) continue;
            const pts = [p(m.x0, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, m.z1), p(m.x0, 0, m.z1)];
            const t = clamp((m.z1 - 1) / (R.zT - 1), 0, 1);
            quad(g, pts);
            const tg = g.createLinearGradient(0, pts[0].y, 0, pts[2].y);
            tg.addColorStop(0, C.tatamiNear);
            tg.addColorStop(1, lerpColor(C.tatamiNear, C.tatamiFar, 0.4 + t * 0.6));
            g.fillStyle = tg;
            g.fill();

            // The weave, along the mat's length.
            g.save();
            quad(g, pts);
            g.clip();
            g.lineWidth = 1;
            if (m.along === 'z') {
                for (let x = m.x0 + 0.02; x < m.x1; x += 0.022) {
                    const a = p(x, 0, z0), b = p(x, 0, m.z1);
                    g.strokeStyle = (Math.round(x / 0.022) % 2) ? 'rgba(170,200,255,0.07)' : 'rgba(0,0,25,0.1)';
                    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
                }
            } else {
                let lastY = Infinity;
                for (let z = z0 + 0.02; z < m.z1; z += 0.022) {
                    const y = p(0, 0, z).y;
                    if (lastY - y < 1.6) continue;
                    lastY = y;
                    g.strokeStyle = (Math.round(z / 0.022) % 2) ? 'rgba(170,200,255,0.07)' : 'rgba(0,0,25,0.1)';
                    g.beginPath(); g.moveTo(p(m.x0, 0, z).x, y); g.lineTo(p(m.x1, 0, z).x, y); g.stroke();
                }
            }
            g.restore();

            // Cloth borders on the long sides.
            const hw = 0.035;
            g.fillStyle = C.heri;
            if (m.along === 'z') {
                quad(g, [p(m.x0, 0, z0), p(m.x0 + hw, 0, z0), p(m.x0 + hw, 0, m.z1), p(m.x0, 0, m.z1)]); g.fill();
                quad(g, [p(m.x1 - hw, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, m.z1), p(m.x1 - hw, 0, m.z1)]); g.fill();
            } else {
                quad(g, [p(m.x0, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, z0 + hw), p(m.x0, 0, z0 + hw)]); g.fill();
                quad(g, [p(m.x0, 0, m.z1 - hw), p(m.x1, 0, m.z1 - hw), p(m.x1, 0, m.z1), p(m.x0, 0, m.z1)]); g.fill();
            }
        }
    }

    function lerpColor(a, b, t) {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ch = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
        const A = ch(pa), B = ch(pb);
        return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
    }

    function shoji(g, x0, x1) {
        const { p } = cam;
        const { u } = L;
        const z = R.zT - 0.05;
        const a = p(x0, 0.03, z), b = p(x1, R.beam, z);
        const w = b.x - a.x, h = a.y - b.y;
        // Paper, lit from outside.
        const pg = g.createLinearGradient(0, b.y, 0, a.y);
        pg.addColorStop(0, 'rgba(226,236,255,0.95)');
        pg.addColorStop(1, 'rgba(176,196,244,0.92)');
        g.fillStyle = pg;
        g.fillRect(a.x, b.y, w, h);
        // Lattice.
        g.fillStyle = '#1b2864';
        const bar = Math.max(1, u * 0.18);
        for (let i = 1; i < 4; i++) g.fillRect(a.x + (w * i) / 4 - bar / 2, b.y, bar, h);
        for (let j = 1; j < 7; j++) g.fillRect(a.x, b.y + (h * 0.82 * j) / 7 - bar / 2, w, bar);
        // Frame and kick panel.
        const fr = Math.max(2, u * 0.55);
        g.fillRect(a.x, b.y, fr, h);
        g.fillRect(b.x - fr, b.y, fr, h);
        g.fillRect(a.x, b.y, w, fr);
        g.fillStyle = '#16225a';
        g.fillRect(a.x, b.y + h * 0.82, w, h * 0.18);
        g.fillStyle = 'rgba(150,180,250,0.35)';
        g.fillRect(a.x, b.y + h * 0.82, w, 1);
    }

    function futon(g, r) {
        const { p, f } = cam;
        const { dpr, u } = L;
        const { x0, x1 } = S.futon;
        const z0 = 0.5, z1 = 2.95, top = 0.08;

        // Its side, where you can see one.
        if (x1 < 0) { quad(g, [p(x1, 0, z0), p(x1, top, z0), p(x1, top, z1), p(x1, 0, z1)]); g.fillStyle = '#5d76bd'; g.fill(); }
        if (x0 > 0) { quad(g, [p(x0, 0, z0), p(x0, top, z0), p(x0, top, z1), p(x0, 0, z1)]); g.fillStyle = '#5d76bd'; g.fill(); }
        // Mattress, catching the light toward the far end.
        const pts = [p(x0, top, z0), p(x1, top, z0), p(x1, top, z1), p(x0, top, z1)];
        quad(g, pts);
        const mg = g.createLinearGradient(0, pts[0].y, 0, pts[2].y);
        mg.addColorStop(0, '#5f78bd');
        mg.addColorStop(1, '#a5b9e8');
        g.fillStyle = mg;
        g.fill();
        // Piping along the edges.
        g.strokeStyle = 'rgba(60,90,170,0.6)';
        g.lineWidth = Math.max(1, u * 0.2);
        quad(g, [p(x0 + 0.04, top, z0), p(x1 - 0.04, top, z0), p(x1 - 0.04, top, z1 - 0.04), p(x0 + 0.04, top, z1 - 0.04)]);
        g.stroke();

        // Pillow at the far end: a firm, slightly bulging block.
        {
            const pz0 = 2.5, pz1 = 2.85, ph = 0.13;
            const px0 = lerp(x0, x1, 0.18), px1 = lerp(x0, x1, 0.82);
            const fa = p(px0, top, pz0), fb = p(px1, top + ph, pz0);
            const tb = p(px1, top + ph, pz1);
            const w = fb.x - fa.x, hFront = fa.y - fb.y, depth = fb.y - tb.y;
            g.fillStyle = 'rgba(0,0,30,0.3)';
            g.beginPath(); g.ellipse(fa.x + w / 2, fa.y + 2, w * 0.56, hFront * 0.35, 0, 0, TAU); g.fill();
            // Top.
            g.beginPath();
            g.roundRect(fa.x + w * 0.02, tb.y, w * 0.96, depth + hFront * 0.4, Math.min(depth, w) * 0.35);
            g.fillStyle = '#dbe5fb';
            g.fill();
            // Front, bulging.
            g.beginPath();
            g.moveTo(fa.x, fb.y);
            g.quadraticCurveTo(fa.x + w / 2, fb.y - hFront * 0.18, fa.x + w, fb.y);
            g.quadraticCurveTo(fa.x + w * 1.03, (fb.y + fa.y) / 2, fa.x + w, fa.y);
            g.quadraticCurveTo(fa.x + w / 2, fa.y + hFront * 0.15, fa.x, fa.y);
            g.quadraticCurveTo(fa.x - w * 0.03, (fb.y + fa.y) / 2, fa.x, fb.y);
            const pg = g.createLinearGradient(0, fb.y, 0, fa.y);
            pg.addColorStop(0, '#c4d3f6');
            pg.addColorStop(1, '#7f97d4');
            g.fillStyle = pg;
            g.fill();
            g.strokeStyle = 'rgba(90,115,190,0.6)';
            g.lineWidth = 1;
            g.beginPath(); g.moveTo(fa.x + w * 0.04, fb.y + 1); g.quadraticCurveTo(fa.x + w / 2, fb.y - hFront * 0.14, fa.x + w * 0.96, fb.y + 1); g.stroke();
        }

        // The summer blanket, kicked down to the foot and rumpled.
        {
            const zf = 1.95;
            const near0 = p(x0 - 0.05, top + 0.02, 0.5), near1 = p(x1 + 0.05, top + 0.02, 0.5);
            const far1 = p(x1 + 0.04, top + 0.03, zf), far0 = p(x0 - 0.04, top + 0.03, zf);
            g.beginPath();
            g.moveTo(near0.x, near0.y);
            g.lineTo(near1.x, near1.y);
            g.lineTo(far1.x, far1.y);
            // Far edge: a soft, uneven roll.
            const steps = 7;
            for (let i = 1; i <= steps; i++) {
                const k = i / steps;
                const x = lerp(far1.x, far0.x, k);
                const y = lerp(far1.y, far0.y, k) + Math.sin(k * 9.3 + 1) * u * 0.9;
                const mx = lerp(far1.x, far0.x, k - 0.5 / steps);
                g.quadraticCurveTo(mx, y - u * 1.6, x, y);
            }
            g.closePath();
            const bg = g.createLinearGradient(0, far0.y, 0, near0.y);
            bg.addColorStop(0, '#8fb4ec');
            bg.addColorStop(1, '#3d64b4');
            g.fillStyle = bg;
            g.fill();
            g.save();
            g.clip();
            // Stripes woven into the towel.
            g.strokeStyle = 'rgba(230,240,255,0.22)';
            g.lineWidth = Math.max(2, u * 0.7);
            for (let k = 0.12; k < 1; k += 0.22) {
                const pa = p(lerp(x0, x1, k), top, zf), pb = p(lerp(x0, x1, k), top, 0.5);
                g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
            }
            // Folds running down from the roll.
            for (let i = 0; i < 6; i++) {
                const k = 0.1 + i * 0.16 + (r() - 0.5) * 0.05;
                const pa = p(lerp(x0, x1, k), top, zf - 0.02), pb = p(lerp(x0, x1, k + (r() - 0.5) * 0.2), top, 1.1);
                g.strokeStyle = 'rgba(10,25,80,0.35)';
                g.lineWidth = Math.max(1.5, u * 0.5);
                g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo((pa.x + pb.x) / 2 + u * 2, (pa.y + pb.y) / 2, pb.x, pb.y); g.stroke();
                g.strokeStyle = 'rgba(220,235,255,0.25)';
                g.lineWidth = Math.max(1, u * 0.25);
                g.beginPath(); g.moveTo(pa.x + u * 0.6, pa.y); g.quadraticCurveTo((pa.x + pb.x) / 2 + u * 2.6, (pa.y + pb.y) / 2, pb.x + u * 0.6, pb.y); g.stroke();
            }
            g.restore();
            // The rolled edge catching light.
            g.strokeStyle = 'rgba(225,236,255,0.7)';
            g.lineWidth = Math.max(1.5, u * 0.35);
            g.beginPath();
            g.moveTo(far1.x, far1.y);
            for (let i = 1; i <= steps; i++) {
                const k = i / steps;
                const x = lerp(far1.x, far0.x, k);
                const y = lerp(far1.y, far0.y, k) + Math.sin(k * 9.3 + 1) * u * 0.9;
                const mx = lerp(far1.x, far0.x, k - 0.5 / steps);
                g.quadraticCurveTo(mx, y - u * 1.6, x, y);
            }
            g.stroke();
        }

        // A paper fan left by the pillow.
        uchiwa(g, x0 + 0.28, top + 0.01, 2.25);
    }

    function uchiwa(g, x, y, z) {
        const { p, f } = cam;
        const c = p(x, y, z);
        const s = (0.13 * f) / z;
        g.save();
        g.translate(c.x, c.y);
        g.scale(1, 0.45);
        g.rotate(-0.6);
        g.fillStyle = '#16225a';
        g.fillRect(-s * 0.08, s * 0.7, s * 0.16, s * 1.1);
        g.fillStyle = '#d4e0fb';
        g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(70,100,190,0.5)';
        g.lineWidth = 1;
        for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(0, s * 0.7); g.lineTo(Math.sin(k * 0.3) * s, -Math.cos(k * 0.3) * s); g.stroke(); }
        g.fillStyle = '#3657b4';
        g.beginPath(); g.arc(s * 0.25, -s * 0.2, s * 0.32, 0, TAU); g.fill();
        g.restore();
    }

    function guitar(g) {
        const { p, f } = cam;
        const { u } = L;
        const base = p(cam.portrait ? -1.55 : -2.2, 0.02, 3.3);
        const top = p(cam.portrait ? -1.4 : -2.02, 1.02, 3.38);
        const len = Math.hypot(top.x - base.x, top.y - base.y);
        const ang = Math.atan2(top.x - base.x, base.y - top.y);
        const s = len;
        g.save();
        g.translate(base.x, base.y);
        g.rotate(ang);
        // Body: lower and upper bouts.
        g.fillStyle = '#1d2d6e';
        g.beginPath();
        g.ellipse(0, -s * 0.19, s * 0.2, s * 0.19, 0, 0, TAU);
        g.ellipse(0, -s * 0.42, s * 0.155, s * 0.14, 0, 0, TAU);
        g.fill();
        g.fillRect(-s * 0.13, -s * 0.44, s * 0.26, s * 0.2);
        // Light from the window along its edge.
        g.strokeStyle = 'rgba(150,180,250,0.55)';
        g.lineWidth = Math.max(1, u * 0.25);
        g.beginPath(); g.ellipse(0, -s * 0.19, s * 0.2, s * 0.19, 0, -1.2, 0.6); g.stroke();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.arc(0, -s * 0.36, s * 0.055, 0, TAU); g.fill();
        g.fillRect(-s * 0.06, -s * 0.13, s * 0.12, s * 0.025);
        // Neck and head.
        g.fillStyle = '#121c4c';
        g.fillRect(-s * 0.025, -s * 0.92, s * 0.05, s * 0.4);
        g.fillRect(-s * 0.04, -s * 1.02, s * 0.08, s * 0.11);
        g.strokeStyle = 'rgba(200,215,255,0.35)';
        g.lineWidth = 0.6;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * s * 0.008, -s * 0.13); g.lineTo(k * s * 0.008, -s * 0.92); g.stroke(); }
        g.restore();
    }

    function radio(g, x, z) {
        const { p, f } = cam;
        const { u } = L;
        const a = p(x - 0.17, 0, z), b = p(x + 0.17, 0.2, z);
        const back = p(x - 0.17, 0.2, z + 0.1);
        // Top.
        quad(g, [p(x - 0.17, 0.2, z), p(x + 0.17, 0.2, z), p(x + 0.17, 0.2, z + 0.1), p(x - 0.17, 0.2, z + 0.1)]);
        g.fillStyle = '#3b55a6';
        g.fill();
        g.fillStyle = '#22357c';
        g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
        const w = b.x - a.x, h = a.y - b.y;
        g.fillStyle = '#121c4c';
        g.beginPath(); g.arc(a.x + w * 0.3, b.y + h * 0.55, h * 0.32, 0, TAU); g.fill();
        g.fillStyle = 'rgba(160,190,250,0.4)';
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
            if (i * i + j * j > 5) continue;
            g.fillRect(a.x + w * 0.3 + i * h * 0.11, b.y + h * 0.55 + j * h * 0.11, 1, 1);
        }
        g.fillStyle = '#9fb8f0';
        g.fillRect(a.x + w * 0.58, b.y + h * 0.3, w * 0.32, h * 0.18);
        g.fillStyle = '#121c4c';
        g.beginPath(); g.arc(a.x + w * 0.74, b.y + h * 0.72, h * 0.1, 0, TAU); g.fill();
        // Aerial.
        g.strokeStyle = '#8ea6e4';
        g.lineWidth = Math.max(1, u * 0.12);
        g.beginPath(); g.moveTo(b.x - w * 0.1, b.y); g.lineTo(b.x + w * 0.5, b.y - h * 1.9); g.stroke();
    }

    /** The mosquito coil in its pig, snout toward the room. */
    function mosquitoPig(g, x, z) {
        const { p, f } = cam;
        const c = p(x, 0.09, z);
        const s = (0.13 * f) / z;
        S.smokeFrom = { x: c.x - s * 1.25, y: c.y - s * 0.05, s };
        g.save();
        g.translate(c.x, c.y);
        g.fillStyle = 'rgba(0,0,20,0.35)';
        g.beginPath(); g.ellipse(0, s * 0.9, s * 1.3, s * 0.25, 0, 0, TAU); g.fill();
        g.fillStyle = '#4862aa';
        for (const lx of [-0.6, -0.15, 0.3, 0.7]) g.fillRect(lx * s - s * 0.1, s * 0.5, s * 0.22, s * 0.38);
        g.beginPath(); g.ellipse(0, 0, s * 1.05, s * 0.78, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-s * 0.55, -s * 0.55); g.lineTo(-s * 0.4, -s * 1.0); g.lineTo(-s * 0.15, -s * 0.66); g.fill();
        // Snout: the open mouth the coil burns inside.
        g.fillStyle = '#5a75bd';
        g.beginPath(); g.ellipse(-s * 1.05, -s * 0.05, s * 0.3, s * 0.5, 0, 0, TAU); g.fill();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.ellipse(-s * 1.12, -s * 0.05, s * 0.18, s * 0.36, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffb27a';
        g.beginPath(); g.arc(-s * 1.12, s * 0.05, s * 0.05, 0, TAU); g.fill();   // the ember
        // Glaze.
        g.fillStyle = 'rgba(220,232,255,0.45)';
        g.beginPath(); g.ellipse(-s * 0.2, -s * 0.45, s * 0.45, s * 0.14, -0.2, 0, TAU); g.fill();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.arc(-s * 0.55, -s * 0.2, s * 0.06, 0, TAU); g.fill();
        g.restore();
    }

    function tray(g, x, z) {
        const { p, f } = cam;
        const { u } = L;
        const c = p(x, 0, z);
        const s = (0.2 * f) / z;
        g.fillStyle = 'rgba(0,0,30,0.3)';
        g.beginPath(); g.ellipse(c.x + s * 0.2, c.y + s * 0.05, s * 1.5, s * 0.28, 0, 0, TAU); g.fill();
        g.fillStyle = '#2a3e86';
        g.beginPath(); g.ellipse(c.x, c.y - s * 0.02, s * 1.4, s * 0.26, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(190,210,255,0.4)';
        g.beginPath(); g.ellipse(c.x, c.y - s * 0.06, s * 1.3, s * 0.2, 0, Math.PI, TAU); g.fill();

        // A wedge of watermelon, standing on its rind.
        const wx = c.x - s * 0.5, wy = c.y - s * 0.08;
        g.fillStyle = '#1d4e78';
        g.beginPath(); g.arc(wx, wy - s * 0.02, s * 0.62, Math.PI, TAU); g.closePath(); g.fill();
        g.fillStyle = '#e9f0ff';
        g.beginPath(); g.arc(wx, wy - s * 0.04, s * 0.56, Math.PI, TAU); g.closePath(); g.fill();
        g.fillStyle = '#e46f86';
        g.beginPath(); g.arc(wx, wy - s * 0.05, s * 0.52, Math.PI, TAU); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,220,230,0.35)';
        g.beginPath(); g.arc(wx - s * 0.1, wy - s * 0.05, s * 0.36, Math.PI * 1.05, Math.PI * 1.5); g.lineTo(wx - s * 0.1, wy - s * 0.05); g.fill();
        g.fillStyle = '#10142e';
        for (const [dx, dy] of [[-0.25, -0.18], [0.05, -0.28], [0.28, -0.15], [-0.05, -0.12], [0.15, -0.38]]) {
            g.beginPath(); g.ellipse(wx + dx * s, wy + dy * s, s * 0.025, s * 0.04, 0.3, 0, TAU); g.fill();
        }

        // Ramune: the glass bottle with the marble in its neck.
        const bx = c.x + s * 0.65, by = c.y - s * 0.06, bh = s * 1.25, bw = s * 0.3;
        g.save();
        g.beginPath();
        g.moveTo(bx - bw / 2, by);
        g.lineTo(bx - bw / 2, by - bh * 0.55);
        g.quadraticCurveTo(bx - bw / 2, by - bh * 0.68, bx - bw * 0.22, by - bh * 0.72);
        g.lineTo(bx - bw * 0.28, by - bh * 0.82);
        g.lineTo(bx - bw * 0.16, by - bh * 0.92);
        g.lineTo(bx - bw * 0.16, by - bh);
        g.lineTo(bx + bw * 0.16, by - bh);
        g.lineTo(bx + bw * 0.16, by - bh * 0.92);
        g.lineTo(bx + bw * 0.28, by - bh * 0.82);
        g.lineTo(bx + bw * 0.22, by - bh * 0.72);
        g.quadraticCurveTo(bx + bw / 2, by - bh * 0.68, bx + bw / 2, by - bh * 0.55);
        g.lineTo(bx + bw / 2, by);
        g.closePath();
        g.fillStyle = 'rgba(140,210,240,0.55)';
        g.fill();
        g.strokeStyle = 'rgba(230,245,255,0.8)';
        g.lineWidth = Math.max(1, u * 0.1);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(bx - bw * 0.32, by - bh * 0.5, Math.max(1, bw * 0.12), bh * 0.42);
        g.fillStyle = 'rgba(220,245,255,0.9)';
        g.beginPath(); g.arc(bx, by - bh * 0.78, bw * 0.17, 0, TAU); g.fill();
        g.fillStyle = '#2f5fc0';
        g.fillRect(bx - bw * 0.18, by - bh * 1.04, bw * 0.36, bh * 0.06);
        g.restore();
    }

    // ── Frame ────────────────────────────────────────────────────────────

    function frame(ctx, t) {
        const { W, H, u, still, tex } = L;
        const w = Stage.wind(t);

        // The head: where you are looking from, plus the slow sway of breathing.
        const breathe = still ? 0 : 1;
        const hx = clamp(view.x + breathe * 0.22 * Math.sin(t * 0.11), -1.2, 1.2);
        const hy = clamp(view.y + breathe * 0.14 * Math.sin(t * 0.17 + 1), -1.2, 1.2);
        // The room (at the threshold) moves most; everything else by its distance.
        const reach = Math.min(W, H) * 0.04;
        const shift = z => ({ dx: -hx * reach * R.zT / z, dy: -hy * reach * 0.6 * R.zT / z });
        const at = (z, draw) => { const d = shift(z); ctx.save(); ctx.translate(d.dx, d.dy); draw(); ctx.restore(); };

        ctx.drawImage(S.sky, 0, 0, W, H);
        at(400, () => {
            for (const c of S.clouds) {
                const startX = S.xL - c.w - u * 4;
                const span = (S.xR - S.xL) + c.w + u * 8;
                const x = startX + ((((c.x0 - startX) + c.v * t) % span) + span) % span;
                ctx.globalAlpha = c.alpha;
                ctx.drawImage(c.canvas, x, c.y0, c.w, c.h);
            }
            ctx.globalAlpha = 1;
            drawBirds(ctx, t);
        });
        at(120, () => { ctx.drawImage(S.far, 0, 0, W, H); drawHeat(ctx, t); });
        at(9, () => ctx.drawImage(S.garden, 0, 0, W, H));
        for (const p of S.plants) at(p.z, () => drawPlant(ctx, p, t, w));
        at(6.5, () => drawFlies(ctx, t));

        // The room is nearest, and fills the screen: as it shifts it also grows
        // a little about the vanishing point, so its edges never come into view.
        const d = shift(R.zT);
        const grow = 1 + Math.max(Math.abs(d.dx) / cam.cx, d.dy / cam.ye, -d.dy / (H - cam.ye)) + 0.002;
        ctx.save();
        ctx.translate(cam.cx + d.dx, cam.ye + d.dy);
        ctx.scale(grow, grow);
        ctx.translate(-cam.cx, -cam.ye);
        ctx.drawImage(S.room, 0, 0, W, H);
        drawSun(ctx, t, w);
        drawBlind(ctx, t, w);
        drawChime(ctx, t);
        drawSmoke(ctx, t, w);
        ctx.restore();

        ctx.drawImage(S.over.canvas, 0, 0, W, H);
        if (tex) {
            const j = still ? 0 : Math.floor(t * 12) % 4;
            P.grain(ctx, tex, W, H, { alpha: 0.06, mode: 'overlay', ox: j * 37, oy: j * 53 });
        }
    }

    /** A plant bending from its base in the wind: tops move, roots stay. */
    function drawPlant(ctx, p, t, w) {
        const bend = p.amp * (w * 0.6 + 0.4 * Math.sin(t * 1.3 + p.ph) * (0.3 + w));
        const base = p.y + p.h;
        ctx.save();
        ctx.translate(p.x + p.w / 2, base);
        ctx.transform(1, 0, -bend, 1, 0, 0);
        ctx.drawImage(p.canvas, -p.w / 2, -p.h, p.w, p.h);
        ctx.restore();
    }

    /** Shimmer over the hot fields: thin bright lines that come and go. */
    function drawHeat(ctx, t) {
        const { ye } = cam;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 6; i++) {
            const y = ye + 3 + i * 3;
            const a = 0.05 + 0.05 * Math.sin(t * 1.7 + i * 1.3);
            ctx.fillStyle = `rgba(200,220,255,${a})`;
            ctx.fillRect(S.xL, y + Math.sin(t * 2 + i) * 0.8, S.xR - S.xL, 1);
        }
        ctx.restore();
    }

    function drawSun(ctx, t, w) {
        const { p } = cam;
        const { u, H } = L;
        const k = 0.88 + 0.12 * Math.sin(t * 0.06);

        // Sunlight lying across the tatami by the threshold.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        quad(ctx, [p(-1.9, 0, R.zT), p(1.9, 0, R.zT), p(2.6, 0, 2.85), p(-1.2, 0, 2.85)]);
        const sg = ctx.createLinearGradient(0, p(0, 0, R.zT).y, 0, p(0, 0, 2.85).y);
        sg.addColorStop(0, `rgba(130,170,250,${0.26 * k})`);
        sg.addColorStop(1, `rgba(130,170,250,${0.06 * k})`);
        ctx.fillStyle = sg;
        ctx.fill();
        ctx.restore();

        // Leaf shadows moving on the veranda.
        ctx.save();
        quad(ctx, [p(-5, 0, 4.12), p(5, 0, 4.12), p(5, 0, R.engawaZ), p(-5, 0, R.engawaZ)]);
        ctx.clip();
        ctx.fillStyle = 'rgba(10,22,70,0.2)';
        for (const d of S.dapple) {
            const x = lerp(-3.5, 0.5, d.x) + Math.sin(t * 0.9 + d.ph) * 0.05 * (0.5 + w);
            const z = lerp(4.15, 4.68, d.z);
            const c = p(x, 0, z);
            const r = (d.s * cam.f) / z;
            ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.8, r * 0.16, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();

        // Dust turning in the light.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const y0 = S.yEave, y1 = p(0, 0, 2.9).y;
        for (const d of S.dust) {
            const x = lerp(S.xL, S.xR, d.x) + Math.sin(t * d.sp + d.ph) * u * 2;
            const span = y1 - y0;
            const y = y0 + (((d.y * span - t * u * 0.5 * d.sp) % span) + span) % span;
            const a = (0.3 + 0.3 * Math.sin(t * 1.3 + d.ph * 3)) * d.z;
            ctx.fillStyle = `rgba(220,235,255,${a})`;
            ctx.beginPath(); ctx.arc(x, y, u * 0.14 * d.z + 0.4, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    /** A bamboo blind hanging from the eave, half let down, moving a little. */
    function drawBlind(ctx, t, w) {
        const { p, f } = cam;
        const { u } = L;
        const x0 = cam.portrait ? 0.9 : 1.75, x1 = cam.portrait ? 1.7 : 2.55;
        const a = p(x0, R.eaveH, R.eaveZ), b = p(x1, 1.35, R.eaveZ);
        const sway = Math.sin(t * 0.9) * (1 + w * 3) * u * 0.25;
        const slat = Math.max(2, (0.012 * f) / R.eaveZ);
        ctx.save();
        for (let y = a.y; y < b.y; y += slat * 1.9) {
            const k = (y - a.y) / (b.y - a.y);
            const dx = sway * k * k;
            ctx.fillStyle = 'rgba(150,170,220,0.78)';
            ctx.fillRect(a.x + dx, y, b.x - a.x, slat);
            ctx.fillStyle = 'rgba(230,238,255,0.35)';
            ctx.fillRect(a.x + dx, y, b.x - a.x, Math.max(0.6, slat * 0.3));
        }
        // Bottom rail, ties, and the rolled top.
        ctx.fillStyle = '#26387c';
        ctx.fillRect(a.x + sway, b.y - slat, b.x - a.x, slat * 1.6);
        ctx.fillStyle = '#1a2763';
        ctx.fillRect(a.x - u * 0.3, a.y, b.x - a.x + u * 0.6, slat * 2.2);
        ctx.strokeStyle = 'rgba(16,26,70,0.85)';
        ctx.lineWidth = Math.max(1, u * 0.12);
        for (const k of [0.2, 0.8]) {
            const x = lerp(a.x, b.x, k);
            ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x + sway, b.y); ctx.stroke();
        }
        ctx.restore();
    }

    function drawChime(ctx, t) {
        const { p, f } = cam;
        const { u } = L;
        const hook = p(cam.portrait ? -0.35 : -0.75, R.eaveH, R.eaveZ);
        const scale = f / R.eaveZ;
        const R0 = 0.05 * scale;
        const str = 0.12 * scale;
        const bellTh = chime.th * 0.35, stripTh = chime.th;

        ctx.save();
        ctx.translate(hook.x, hook.y);
        ctx.rotate(bellTh);
        ctx.strokeStyle = 'rgba(16,28,72,0.9)';
        ctx.lineWidth = Math.max(1, u * 0.1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, str); ctx.stroke();
        const by = str + R0;
        ctx.beginPath();
        ctx.arc(0, by, R0, Math.PI, 0);
        ctx.lineTo(R0 * 1.04, by + R0 * 0.12);
        ctx.lineTo(-R0 * 1.04, by + R0 * 0.12);
        ctx.closePath();
        const bg = ctx.createLinearGradient(-R0, by - R0, R0, by);
        bg.addColorStop(0, 'rgba(240,247,255,0.9)');
        bg.addColorStop(1, 'rgba(170,200,255,0.5)');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        // A goldfish painted on the glass: the one warm thing outside.
        ctx.fillStyle = '#e8687c';
        ctx.beginPath(); ctx.ellipse(R0 * 0.1, by - R0 * 0.25, R0 * 0.28, R0 * 0.14, -0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-R0 * 0.15, by - R0 * 0.2); ctx.lineTo(-R0 * 0.42, by - R0 * 0.38); ctx.lineTo(-R0 * 0.38, by - R0 * 0.02); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(-R0 * 0.5, by - R0 * 0.6, R0 * 0.14, R0 * 0.28, -0.6, 0, TAU); ctx.fill();

        ctx.translate(0, by);
        ctx.rotate(stripTh - bellTh);
        ctx.strokeStyle = 'rgba(16,28,72,0.9)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R0 * 1.9); ctx.stroke();
        const sw = R0 * 0.95, sh = R0 * 4.4;
        ctx.translate(0, R0 * 1.9);
        ctx.transform(1, 0, Math.sin(t * 3.1) * 0.08, 1, 0, 0);
        const pg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        pg.addColorStop(0, '#f2f6ff');
        pg.addColorStop(1, '#b7c9f2');
        ctx.fillStyle = pg;
        ctx.fillRect(-sw / 2, 0, sw, sh);
        ctx.fillStyle = 'rgba(40,80,190,0.55)';
        ctx.fillRect(-sw * 0.06, sh * 0.18, sw * 0.12, sh * 0.5);
        ctx.restore();
    }

    /** Smoke from the coil: a thin ribbon that leans with the breeze and unravels. */
    function drawSmoke(ctx, t, w) {
        const o = S.smokeFrom;
        if (!o) return;
        const { u } = L;
        const n = 34;
        const rise = o.s * 0.1;
        ctx.save();
        ctx.lineCap = 'round';
        for (let strand = 0; strand < 2; strand++) {
            let px = o.x, py = o.y;
            for (let i = 1; i < n; i++) {
                const k = i / n;
                const curl = Math.sin(t * 1.2 - i * 0.32 + strand * 2) * i * 0.35 + Math.sin(t * 0.55 - i * 0.18) * i * 0.5;
                const x = o.x - i * o.s * 0.03 + curl * (o.s * 0.04) + w * i * i * 0.012 * o.s * 0.1 * (strand ? 1.3 : 1);
                const y = o.y - i * rise;
                ctx.strokeStyle = `rgba(215,228,255,${(1 - k) * (strand ? 0.18 : 0.32)})`;
                ctx.lineWidth = Math.max(0.8, u * 0.1 + k * u * 0.9);
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
                px = x; py = y;
            }
        }
        ctx.restore();
    }

    function drawBirds(ctx, t) {
        const { u } = L;
        if (!S.birds && t > S.nextBirds) {
            const r = Math.random;
            const y = S.yEave + (cam.ye - S.yEave) * (0.2 + r() * 0.4);
            S.birds = { t0: t, v: u * (4 + r() * 3), y, list: Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ dx: -i * u * (2 + r() * 2), dy: (r() - 0.5) * u * 3, ph: r() * TAU })) };
        }
        if (!S.birds) return;
        const b = S.birds;
        const x0 = S.xL - u * 4 + (t - b.t0) * b.v;
        if (x0 > S.xR + u * 20) { S.birds = null; S.nextBirds = t + 16 + Math.random() * 18; return; }
        ctx.strokeStyle = 'rgba(20,38,100,0.85)';
        ctx.lineWidth = Math.max(1, u * 0.2);
        ctx.lineCap = 'round';
        for (const bd of b.list) {
            const x = x0 + bd.dx, y = b.y + bd.dy + Math.sin(t * 0.8 + bd.ph) * u * 0.4;
            const flap = Math.sin(t * 9 + bd.ph) * u * 0.5;
            const s = u * 0.8;
            ctx.beginPath();
            ctx.moveTo(x - s, y - flap);
            ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y);
            ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - flap);
            ctx.stroke();
        }
    }

    /** Dragonflies over the garden: hover, dart, hover. */
    function drawFlies(ctx, t) {
        const { u } = L;
        const y0 = cam.ye, y1 = S.yEngawa;
        for (const d of S.flies) {
            if (t > d.next) {
                d.tx = lerp(S.xL, S.xR, clamp(d.hx + (Math.random() - 0.5) * 0.4, 0.05, 0.95));
                d.ty = lerp(y0 + (y1 - y0) * 0.2, y1 - u * 2, clamp(d.hy + (Math.random() - 0.5) * 0.5, 0, 1));
                if (!d.x) { d.x = d.tx; d.y = d.ty; }
                d.next = t + 1.5 + Math.random() * 3.5;
            }
            d.x += (d.tx - d.x) * 0.12;
            d.y += (d.ty - d.y) * 0.12;
            const x = d.x + Math.sin(t * 7 + d.ph) * u * 0.15, y = d.y + Math.sin(t * 5.3 + d.ph) * u * 0.15;
            const s = u * 0.55;
            ctx.fillStyle = 'rgba(225,236,255,0.45)';
            const flick = 0.75 + 0.25 * Math.sin(t * 60 + d.ph);
            for (const [ox, oy, rot] of [[-0.2, -0.05, -0.3], [0.2, -0.05, 0.3], [-0.2, 0.1, -0.15], [0.2, 0.1, 0.15]]) {
                ctx.beginPath();
                ctx.ellipse(x + ox * s * 2.2, y + oy * s, s * 0.8 * flick, s * 0.18, rot, 0, TAU);
                ctx.fill();
            }
            ctx.strokeStyle = '#13205a';
            ctx.lineWidth = Math.max(1, u * 0.18);
            ctx.beginPath(); ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x, y + s * 1.3); ctx.stroke();
        }
    }

    Stage.register('tatami-world', {
        caption: 'lazy summer days',
        ambience: 'cicadas',
        bake,
        frame,
        step: (t, dt) => { chime.step(t, dt); stepView(dt); }
    });
})();
