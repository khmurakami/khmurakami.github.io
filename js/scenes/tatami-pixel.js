/*
 * tatami-pixel.js — the tatami room as pixel art, drawn one object at a time.
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
 * and blind swing, smoke rises, and you can look around (drag, mouse or
 * tilt), near things shifting more than far ones.
 */
(function () {
    'use strict';
    const Stage = window.Stage;
    const { Clock, Stack, Pixel } = window;
    const { Ramp, Sprite } = Pixel;
    const LS = window.LivingSky;
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rng = Stack.rng;

    // The room, in metres (as tatami-world).
    const R = {
        half: 2.7, zT: 3.6, beam: 2.2, ceil: 2.5, shoji: 1.95,
        engawaZ: 4.7, eaveZ: 5.0, eaveH: 2.18, ground: -0.45
    };

    // ── Palettes: one ramp per material, dark to light ────────────────────
    // Cobalt summer light: shadows lean indigo, lights lean cyan-white.
    const ramp = (c, band = 0.4) => new Ramp(c, { band: band * 0.45 });
    const PAL = {
        sky: ramp(['#1838a8', '#1f4bc4', '#285ed8', '#3673e6', '#4f8cef', '#7caaf3', '#b4d0f6'], 0.6),
        cloud: ramp(['#6a76c6', '#97a6e4', '#c6d2f4', '#eef1fb', '#fffcf4'], 0.2),
        cirrus: ramp(['#86acf2', '#c4d8f8'], 0.5),
        mtnFar: ramp(['#7590d8', '#8aa4e2', '#a8bdee'], 0.5),
        mtnNear: ramp(['#4e72b8', '#5c82c0', '#7698cc'], 0.5),
        fieldLit: ramp(['#3f7a8e', '#4b8d92', '#64a498'], 0.5),
        fieldShade: ramp(['#2e5f86', '#376c8c', '#457c92'], 0.5),
        bank: ramp(['#9cbcd8', '#cfe0dc'], 0.5),
        leaf: ramp(['#0a1838', '#10294c', '#173f5c', '#22596a', '#3a7a74', '#68a080'], 0.3),
        flower: ramp(['#3a3a9c', '#5660c4', '#7d8ae6', '#a9b6f8', '#e0e4ff'], 0.3),
        bark: ramp(['#0e0c2c', '#1c1840', '#2e2852', '#4a3e66'], 0.3),
        houseWall: ramp(['#283a6e', '#34487e', '#4a5e92'], 0.3),
        roof: ramp(['#14205a', '#1c2c70', '#2c4290', '#5068b0'], 0.3),
        windowGlow: ramp(['#f0c070', '#ffe6b0'], 0),
        wall: ramp(['#0a0a26', '#0f0f32', '#151642', '#1c1e52', '#252a62', '#323a7a'], 0.5),
        board: ramp(['#08081e', '#100f34', '#1a1a4c', '#262862'], 0.4),
        wood: ramp(['#0c0a24', '#17133a', '#251d50', '#3e3068', '#8a6a7a'], 0.3),
        paper: ramp(['#8a90cc', '#a8acdc', '#c8c8e8', '#e6e0ee', '#fff6ec'], 0.5),
        lattice: ramp(['#14123e', '#1e1c54'], 0),
        tatami: ramp(['#0e1a38', '#142646', '#1c3252', '#26425e', '#33546a', '#466a76', '#5e8282'], 0.5),
        tatamiSun: ramp(['#7a7068', '#a08c74', '#c2a87e', '#dec494', '#f2e0b8'], 0.5),
        heri: ramp(['#08081e', '#0e0e30', '#18184a'], 0.3),
        engawa: ramp(['#16224e', '#1c2a5c', '#24366a', '#2e4278'], 0.5),
        engawaSun: ramp(['#7a5a64', '#a8786a', '#cc9a72', '#e8bc84', '#f8dca4'], 0.5),
        soffit: ramp(['#0a0c30', '#121640', '#1c2050', '#2c2c5c', '#4a3e62', '#6e566a'], 0.3),
        cream: ramp(['#4a4c88', '#6c70a8', '#9498c6', '#bcbedc', '#dedcec', '#f6f2f2'], 0.3),
        creamSun: ramp(['#94849a', '#c4b0b0', '#eadcca', '#fff4e4', '#ffffff'], 0.3),
        towel: ramp(['#1a2a6e', '#24408e', '#3458aa', '#5a7ec4', '#90aedc', '#c8d8f0', '#eef2fa'], 0.3),
        towelSun: ramp(['#34488e', '#5068aa', '#7c8ec2', '#aeb4d2', '#e2dcd4', '#fff8ec'], 0.3),
        mattress: ramp(['#3a4688', '#525ea2', '#7280bc', '#96a2d2', '#bcc4e6', '#e2e4f4'], 0.45),
        pillow: ramp(['#6a6aa8', '#9090c4', '#bab8dc', '#ddd8ec', '#f8f0ee'], 0.4),
        blanket: ramp(['#1b3884', '#284ea2', '#3a66ba', '#5684d0', '#7ea8e6', '#acc8f6'], 0.45),
        stripe: ramp(['#c8b4c8', '#ecdcdc', '#fff4ec'], 0.3),
        fan: ramp(['#a8a8d8', '#d4d0ec', '#f8f2f2'], 0.3),
        fanInk: ramp(['#d0405c', '#ee6a7a'], 0),
        alu: ramp(['#22244a', '#3e4270', '#6a7098', '#9ca2c0', '#ccd0e2', '#f2f2f8'], 0.3),
        bezel: ramp(['#08081a', '#14142c', '#24244a'], 0),
        tabby: ramp(['#3a1e2e', '#6a3434', '#a4583a', '#d48444', '#f0ae62', '#ffd896'], 0.3),
        catEye: ramp(['#0a0a1a', '#f2c84a'], 0),
        steel: ramp(['#6a6ea8', '#d8d8ee'], 0),
        radio: ramp(['#141240', '#22225a', '#343a78', '#4c5a98', '#7a8cc0'], 0.3),
        dial: ramp(['#d8a860', '#ffe0a0'], 0),
        pig: ramp(['#1c1e4c', '#2c3264', '#3e4a7c', '#567094', '#7c98a8', '#b4ccc0'], 0.35),
        ember: ramp(['#d8583c', '#ff9a64', '#ffd9a8'], 0),
        tray: ramp(['#1a0e2a', '#2e1434', '#4a1c3c', '#7a2e44', '#b45a5a'], 0.3),
        rind: ramp(['#0e3040', '#185048', '#2a6c50'], 0.3),
        pith: ramp(['#c8d8c8', '#f0f4e8'], 0),
        flesh: ramp(['#a13a58', '#cf5a74', '#ee7f94', '#ffadb8'], 0.35),
        seed: ramp(['#0b0e26'], 0),
        glass: ramp(['#3a7eb0', '#66b4d8', '#a0dcf0', '#e8faff'], 0.3),
        cap: ramp(['#c8404c', '#ee6a6a'], 0),
        shadow: ramp(['#06061e'], 0),
        culm: ramp(['#10283a', '#1c4440', '#2e6448', '#4e8a50', '#86b462', '#c2dc84'], 0.3),
        sasa: ramp(['#0c2238', '#14384a', '#1e5250', '#2e6e54', '#4a8e5a', '#80b46a'], 0.3)
    };


    // ── Seasons ──────────────────────────────────────────────────────────
    // The room is painted in summer. The rest of the year swaps a few ramps
    // (the tree, the shrubs, the paddies, the far hills) and what is on the
    // tray, takes down the thunderhead, and lets something fall past the door.
    PAL.crown = PAL.leaf;
    const SUMMER = { ...PAL };
    const SEASON = {
        spring: {
            crown: ramp(['#3a1e44', '#6a3a66', '#a8608a', '#d890b0', '#f4bcd0', '#ffe4ee'], 0.3),
            leaf: ramp(['#0c2236', '#143c48', '#1e5a52', '#2e7656', '#4e945e', '#7ab47a'], 0.3),
            fieldLit: ramp(['#6a8ec8', '#88a8d8', '#a8c4e6'], 0.5), fieldShade: ramp(['#5476b4', '#6a8cc4', '#86a4d4'], 0.5),
            bank: ramp(['#4e8a50', '#86b462'], 0.5)
        },
        autumn: {
            crown: ramp(['#2a0e2a', '#5a1a34', '#9a2e3a', '#d0503a', '#f08a44', '#ffc46a'], 0.3),
            leaf: ramp(['#141a34', '#2e2a3c', '#5a3a3e', '#8a5a40', '#b88a4a', '#e0b866'], 0.3),
            fieldLit: ramp(['#9a7a3a', '#c09a48', '#dcbc64'], 0.5), fieldShade: ramp(['#7a6034', '#9a7a3e', '#b8964e'], 0.5),
            bank: ramp(['#c8b07a', '#eadcae'], 0.5)
        },
        winter: {
            crown: ramp(['#0a1838', '#10294c', '#173f5c', '#2e5468', '#d8e4f4', '#ffffff'], 0.3),
            leaf: ramp(['#0a1838', '#10294c', '#173f5c', '#2e5468', '#cfdcf0', '#f6f9ff'], 0.3),
            fieldLit: ramp(['#c8d4ec', '#dde6f6', '#f0f4fc'], 0.5), fieldShade: ramp(['#aab8d8', '#c0cce6', '#d4ddf0'], 0.5),
            bank: ramp(['#ffffff', '#ffffff'], 0.5),
            mtnFar: ramp(['#a8b8e0', '#c0ceec', '#dfe7f8'], 0.5), mtnNear: ramp(['#6a86c0', '#8aa2d0', '#c4d2ec'], 0.5)
        }
    };
    const CAPTION = { spring: 'soft spring days', summer: 'lazy summer days', autumn: 'slow autumn days', winter: 'quiet winter days' };
    PAL.kaki = ramp(['#4a1414', '#94301e', '#d0521e', '#f0803a', '#ffb070'], 0.3);
    PAL.mikan = ramp(['#6a2a1a', '#c0581e', '#ec8a2a', '#ffb850', '#ffe0a0'], 0.3);
    PAL.calyx = ramp(['#183020', '#2e5a34', '#4e8a50'], 0);
    PAL.dango = ramp(['#a85a7a', '#e890b0', '#ffd0e0'], 0.3);
    PAL.mochi = ramp(['#a8a0b8', '#e6e0ec', '#ffffff'], 0.3);
    PAL.yomogi = ramp(['#3a6a3a', '#7aac5e', '#bce09a'], 0.3);
    PAL.stick = ramp(['#7a5a3a', '#c8a070'], 0);
    PAL.cup = ramp(['#1e2c40', '#3a5a64', '#6a8e86', '#a0c0a4', '#d4e8cc'], 0.3);
    PAL.tea = ramp(['#4a6a2a', '#8aa848'], 0);
    SUMMER.kaki = PAL.kaki;

    /** Set the ramps for the season, before anything is baked. */
    function dress(season) {
        Object.assign(PAL, SUMMER, SEASON[season] || {});
        // Out of summer the hydrangeas have no heads: their flowers are leaves.
        if (season !== 'summer') PAL.flower = PAL.leaf;
    }

    /** What falls past the door: petals, maple leaves or snow. */
    function falling(o, t, w) {
        const kind = S.season;
        if (kind === 'summer') return;
        const n = kind === 'winter' ? 70 : 26, span = S.xR - S.xL + 40, top = S.yEave - 10, h = S.yEngawa - top + 10;
        const C = { spring: ['#ffd0e0', '#f4a0c0', '#ffe8f0'], autumn: ['#e0603a', '#f0a040', '#c03a3a', '#e8c050'], winter: ['#ffffff', '#e4ecff', '#c8d4f4'] }[kind];
        for (let i = 0; i < n; i++) {
            const a = (i * 0.61803) % 1, b = (i * 0.7548) % 1, sp = kind === 'winter' ? 6 + b * 6 : 9 + b * 8;
            const y = top + (((t * sp + a * h * 3) % h) + h) % h;
            const drift = kind === 'winter' ? 3 : 10;
            const x = S.xL - 20 + ((a * span + t * (2 + w * 12) + Math.sin(t * 0.9 + i) * drift) % span + span) % span;
            const c = C[i % C.length];
            if (kind === 'winter') { px(o, x, y, c); if (i % 5 === 0) px(o, x + 1, y, c); continue; }
            // Petals and leaves tumble: two pixels, turning.
            const flip = Math.sin(t * (3 + b * 3) + i) > 0;
            px(o, x, y, c);
            px(o, x + (flip ? 1 : 0), y + (flip ? 0 : 1), c);
            if (kind === 'autumn' && i % 3 === 0) px(o, x - 1, y, c);
        }
    }

    let A = null, cam = null, S = null;
    const query = new URLSearchParams(location.search);
    const clock = query.has('time') ? Clock.fromQuery(query) : new Clock({ paused: true, time: ((15 - 6) / 13.5) * 180 });
    const chime = Stage.makeChime();

    // Where your head is, -1..1 (mouse, drag or tilt); see frame().
    // On a phone the look is a drag offset (o) plus the tilt (g), so letting go
    // of a drag keeps where you were looking instead of snapping back to the tilt.
    const view = { x: 0, y: 0, tx: 0, ty: 0, drag: null, tilt: false, ox: 0, oy: 0, gx: 0, gy: 0, base: null };
    if (query.has('look')) {
        const [x, y] = query.get('look').split(',').map(Number);
        view.x = view.tx = view.ox = x || 0; view.y = view.ty = view.oy = y || 0;
    }
    const aim = () => { view.tx = clamp(view.ox + view.gx, -1, 1); view.ty = clamp(view.oy + view.gy, -1, 1); };
    addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' && e.target && e.target.id === 'room') view.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    });
    addEventListener('pointermove', e => {
        if (view.drag && e.pointerId === view.drag.id) {
            const k = 2.5 / Math.min(innerWidth, innerHeight);
            view.ox = clamp(view.drag.ox - (e.clientX - view.drag.x) * k, -1 - view.gx, 1 - view.gx);
            view.oy = clamp(view.drag.oy - (e.clientY - view.drag.y) * k, -1 - view.gy, 1 - view.gy);
            aim();
        } else if (e.pointerType === 'mouse' && !view.tilt) {
            view.tx = (e.clientX / innerWidth) * 2 - 1;
            view.ty = (e.clientY / innerHeight) * 2 - 1;
        }
    });
    for (const type of ['pointerup', 'pointercancel']) addEventListener(type, e => { if (view.drag && e.pointerId === view.drag.id) view.drag = null; });
    // Tilt counts from however the phone is being held, which it slowly settles back to,
    // and turns with the screen when the phone is on its side.
    addEventListener('deviceorientation', e => {
        if (e.gamma == null || e.beta == null) return;
        const turn = (window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
        const sx = turn === 90 ? e.beta : turn === -90 || turn === 270 ? -e.beta : e.gamma;
        const sy = turn === 90 ? -e.gamma : turn === -90 || turn === 270 ? e.gamma : e.beta;
        if (!view.base || view.base.turn !== turn) view.base = { x: sx, y: sy, turn };
        view.base.x += (sx - view.base.x) * 0.003; view.base.y += (sy - view.base.y) * 0.003;
        view.tilt = true;
        view.gx = clamp((sx - view.base.x) / 20, -1, 1);
        view.gy = clamp((sy - view.base.y) / 20, -1, 1);
        aim();
    });

    // ── Camera, in art pixels ─────────────────────────────────────────────
    // As tatami-world's, on the art's own size, shifted by the margin M that
    // every layer carries so looking around never shows an edge.
    // The shot: sitting low on the mats at the foot of the futon, a little
    // left of the room's middle, with the lens shifted so the vanishing point
    // falls on a third and the futon runs out of the frame in the foreground.
    const SHOT = {
        wide: { f: 0.62, eye: 0.58, camX: -0.2, camH: 0.62, vx: 0.33 },
        tall: { f: 1.0, eye: 0.46, camX: -0.5, camH: 0.62, vx: 0.4 }
    };
    function makeCamera(W, H, M) {
        const portrait = H > W * 1.05, s = portrait ? SHOT.tall : SHOT.wide;
        const f = portrait ? H * 0.75 * s.f : Math.max(W * s.f, H * 1.1);
        const ye = H * s.eye + M, cx = W * s.vx + M, { camX, camH } = s;
        const p = (x, y, z) => ({ x: cx + ((x - camX) * f) / z, y: ye - ((y - camH) * f) / z });
        return { f, ye, cx, camX, camH, portrait, p };
    }

    /** A painted sprite cropped to its pixels: { canvas, x, y, w, h } in layer pixels. */
    function crop(canvas) {
        const { width: w, height: h } = canvas;
        const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        let x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let k = 0; k < w * h; k++) if (d[k * 4 + 3]) { const x = k % w, y = (k - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (x1 < 0) return null;
        const c = Pixel.layer(x1 - x0 + 1, y1 - y0 + 1);
        c.g.drawImage(canvas, -x0, -y0);
        return { canvas: c.canvas, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    const sprite = () => new Sprite(A.LW, A.LH);

    // ── Bake ─────────────────────────────────────────────────────────────

    function bake(L) {
        // Whole screen pixels per art pixel; about 480 art pixels across a desk, 200 on a phone.
        const scale = Math.max(2, Math.round(L.W / 480));
        const W = Math.ceil(L.W / scale), H = Math.ceil(L.H / scale), M = Math.max(4, Math.round(Math.min(W, H) * 0.025));
        A = { L, scale, W, H, M, LW: W + 2 * M, LH: H + 2 * M };
        cam = makeCamera(W, H, M);
        const p = cam.p;
        S = { out: Pixel.layer(W, H), season: window.RoomTime ? RoomTime.season(RoomTime.now()) : 'summer' };
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
        out.g.drawImage(fields.paint([PAL.fieldLit, PAL.fieldShade, PAL.bank], { outline: 'none', clean: false }), 0, 0);

        // A grove across the fields and a farmhouse.
        const groveY = Math.round(p(0, R.ground, 120).y), W = A.W;
        for (const [cx, wide, tall, seed] of [[S.xMid - W * 0.3, W * 0.52, f * 0.05, 71], [S.xMid + W * 0.34, W * 0.26, f * 0.032, 72]]) {
            const s = sprite(), k = 1000 / wide;
            s.spheres(Stack.shapes.shrub(seed, { width: 1000, depth: 160, height: tall * k, clumps: 90, rMin: f * 0.006 * k, rMax: f * 0.026 * k, buds: 1 }),
                { cx, baseY: groveY, width: wide, camera: S.camera, light: S.light, texture: 0.14, ragged: 0.35, form: 0.75, crease: 0.06, seed });
            out.g.drawImage(s.paint([PAL.leaf.toward('#5f84d4', 0.4)], { outline: 'sel' }), 0, 0);
        }
        out.g.drawImage(farmhouse(24, 130), 0, 0);
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

    // ── The room ─────────────────────────────────────────────────────────

    function bakeRoom(r) {
        const out = Pixel.layer(A.LW, A.LH), g = out.g, { p } = cam, zN = 0.45;
        const put = (c, x = 0, y = 0) => g.drawImage(c, x, y);

        // Walls and ceiling: the back of everything, darkest away from the window.
        {
            const s = sprite(), yCeil = p(0, R.ceil, R.zT).y;
            s.rect(0, 0, A.LW, A.LH, 0.3, 0);
            s.rect(0, 0, A.LW, yCeil, (x, y) => 0.1 + 0.5 * clamp(y / yCeil, 0, 1), 1);
            for (let x = -R.half; x <= R.half + 0.01; x += 0.36) {
                const a = p(x, R.ceil, R.zT), b = p(x, R.ceil, zN);
                s.line(a.x, a.y, b.x, b.y, 0, 1, 1);
            }
            for (const side of [-1, 1]) {
                const x = side * R.half;
                s.poly([p(x, 0, R.zT), p(x, R.ceil, R.zT), p(x, R.ceil, zN), p(x, 0, zN)], (px) => {
                    const a = p(x, 1.2, R.zT).x, b = p(x, 1.2, 1.2).x;
                    return 0.55 - 0.45 * clamp((px - a) / (b - a), 0, 1);
                }, 0);
                const l0 = p(x, R.beam, R.zT), l1 = p(x, R.beam, zN);
                s.line(l0.x, l0.y, l1.x, l1.y, 0, 0, 1);
                s.line(l0.x, l0.y + 1, l1.x, l1.y + 1, 0, 0, 1);
            }
            put(s.paint([PAL.wall, PAL.board], { outline: 'none', clean: false }));
        }
        put(tatami());
        put(engawa());
        put(eave());

        // Cut the window to the outside.
        g.clearRect(S.xL - 1, S.yEave, S.xR - S.xL + 2, S.yEngawa - S.yEave);

        put(lintel());
        put(shoji(-R.half + 0.06, -R.shoji));
        put(shoji(R.shoji, R.half - 0.06));
        put(posts());
        put(futon(r));
        return out.canvas;
    }

    /** The floor plan of the mats, as tatami-world. */
    function tatami() {
        const { p } = cam, s = sprite(), zMin = 0.45;
        const mats = [], across = [[-2.7, -0.9], [-0.9, 0.9], [0.9, 2.7]];
        for (const [x0, x1] of across) mats.push({ x0, x1, z0: 2.7, z1: R.zT, along: 'x' });
        for (let x = -2.7; x < 2.69; x += 0.9) mats.push({ x0: x, x1: x + 0.9, z0: 0.9, z1: 2.7, along: 'z' });
        for (const [x0, x1] of across) mats.push({ x0, x1, z0: -0.9, z1: 0.9, along: 'x' });
        // Sunlight from the opening lies across the mats by the threshold.
        const sunPatch = SUN.map(c => p(c.x, 0, c.z));
        const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
        const yT = p(0, 0, R.zT).y, yN = A.LH;
        for (const m of mats) {
            const z0 = Math.max(zMin, m.z0);
            if (z0 >= m.z1) continue;
            const pts = [p(m.x0, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, m.z1), p(m.x0, 0, m.z1)];
            s.poly(pts, (x, y) => {
                const depth = clamp((yN - y) / (yN - yT), 0, 1);
                // The weave: every other pixel line across the mat's length, faintly.
                const weave = m.along === 'z' ? ((x & 1) ? 0.04 : 0) : ((y & 1) ? 0.04 : 0);
                // Sunlight is its own warm ramp, brightest at the threshold, so it reads as light, not paint.
                if (S.sunOn && inside(sunPatch, x + 0.5 + (((x + y) & 1) ? 1.2 : -1.2), y + 0.5 + ((x & 1) ? 0.6 : -0.6))) return [0.3 + 0.6 * clamp((y - sunPatch[2].y) / (yT - sunPatch[2].y), 0, 1) + weave * 2, 2];
                return 0.08 + 0.5 * depth + weave;
            }, 0);
            // Cloth borders on the long sides.
            const hw = 0.035;
            const edges = m.along === 'z'
                ? [[p(m.x0, 0, z0), p(m.x0 + hw, 0, z0), p(m.x0 + hw, 0, m.z1), p(m.x0, 0, m.z1)], [p(m.x1 - hw, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, m.z1), p(m.x1 - hw, 0, m.z1)]]
                : [[p(m.x0, 0, z0), p(m.x1, 0, z0), p(m.x1, 0, z0 + hw), p(m.x0, 0, z0 + hw)], [p(m.x0, 0, m.z1 - hw), p(m.x1, 0, m.z1 - hw), p(m.x1, 0, m.z1), p(m.x0, 0, m.z1)]];
            for (const e of edges) s.poly(e, (x, y) => 0.3 + 0.4 * clamp((yN - y) / (yN - yT), 0, 1), 1, 1);
            // Seams between mats: a dark pixel line.
            s.line(pts[0].x, pts[0].y, pts[3].x, pts[3].y, 0, 1, 1);
        }
        return s.paint([PAL.tatami, PAL.heri, PAL.tatamiSun], { outline: 'none', clean: false });
    }

    function engawa() {
        const { p } = cam, s = sprite(), eL = -R.half - 2, eR = R.half + 2, zSun = 4.12;
        const yT = p(0, 0, R.zT).y, yS = p(0, 0, zSun).y, yE = S.yEngawa;
        s.poly([p(eL, 0, R.zT), p(eR, 0, R.zT), p(eR, 0, R.engawaZ), p(eL, 0, R.engawaZ)], (x, y) =>
            y > yS ? 0.2 + 0.5 * (yT - y) / (yT - yS) : S.sunOn ? [0.3 + 0.65 * clamp((yS - y) / (yS - yE), 0, 1), 1] : 0.7 + 0.25 * clamp((yS - y) / (yS - yE), 0, 1), 0);
        // Boards: a dark line at each joint.
        for (let z = R.zT + 0.13; z < R.engawaZ; z += 0.13) {
            const y = Math.round(p(0, 0, z).y);
            s.rect(0, y, A.LW, y + 1, (x, yy) => (yy > yS || !S.sunOn ? [0, 0, 1] : [0.12, 1, 1]), 0, 1);
        }
        // The worn front edge catches the light.
        s.rect(0, yE, A.LW, yE + 1, 1, S.sunOn ? 1 : 0, 1);
        return s.paint([PAL.engawa, PAL.engawaSun], { outline: 'none', clean: false });
    }

    function eave() {
        const { p } = cam, s = sprite();
        const bounce = y => 0.08 + 0.42 * clamp((y - S.yBeam) / Math.max(1, S.yEave - S.yBeam), 0, 1) ** 1.6;
        s.rect(0, S.yBeam, A.LW, S.yEave + 1, (x, y) => bounce(y), 0);
        // Rafters: a lit underside and a dark flank each, so they read as beams, not hairlines.
        for (let x = -6; x <= 6; x += 0.5) {
            const a = p(x, 2.32, R.zT), b = p(x, R.eaveH + 0.02, R.eaveZ);
            s.lineOver(a.x, a.y, b.x, b.y, () => true, (X, Y) => bounce(Y) + 0.22, 0);
            s.lineOver(a.x + 1, a.y, b.x + 1, b.y, () => true, (X, Y) => bounce(Y) - 0.06, 0);
        }
        const fasciaTop = Math.round(p(0, R.eaveH + 0.07, R.eaveZ).y);
        s.rect(0, fasciaTop, A.LW, S.yEave, 0.55, 0, 1);
        s.rect(0, S.yEave - 1, A.LW, S.yEave, 1, 0, 1);
        // A veranda post holding the eave up, lit down its left side.
        const x = cam.portrait ? 1.9 : 2.45, z = R.eaveZ - 0.05;
        const a = p(x - 0.06, 0, z), b = p(x + 0.06, R.eaveH, z);
        s.rect(a.x, b.y, b.x, a.y, 0.25, 1);
        s.rect(a.x, b.y, a.x + 1, a.y, 0.85, 1, 1);
        return s.paint([PAL.soffit, PAL.wood], { outline: 'none', clean: false });
    }

    function lintel() {
        const { p } = cam, s = sprite();
        const beamA = p(-R.half, R.beam + 0.07, R.zT), beamB = p(R.half, R.beam, R.zT);
        const trTop = Math.round(p(0, R.ceil - 0.05, R.zT).y);
        // Transom: paper lit from outside, behind a row of wooden bars.
        s.rect(beamA.x, trTop, beamB.x, beamA.y, 0.72, 0);
        const bars = Math.round((beamB.x - beamA.x) / 14);
        for (let i = 0; i <= bars; i++) { const x = Math.round(lerp(beamA.x, beamB.x, i / bars)); s.rect(x, trTop, x + 2, beamA.y, 0.3, 0, 1); }
        const mid = Math.round((trTop + beamA.y) / 2);
        s.rect(beamA.x, mid, beamB.x, mid + 1, 0.3, 0, 1);
        s.rect(beamA.x, trTop - 3, beamB.x, trTop, 0.3, 0, 1);
        // The lintel itself, with a lit lower edge.
        s.rect(beamA.x, beamA.y, beamB.x, beamB.y, 0.3, 0, 1);
        s.rect(beamA.x, beamB.y - 1, beamB.x, beamB.y, 0.8, 0, 1);
        // The threshold rail.
        const sillA = p(-R.half, 0.035, R.zT), sillB = p(R.half, 0, R.zT);
        s.rect(sillA.x, sillA.y, sillB.x, sillB.y + 1, 0.4, 0, 1);
        s.rect(sillA.x, sillA.y, sillB.x, sillA.y + 1, 0.9, 0, 1);
        return s.paint([PAL.wood, PAL.paper], { outline: 'none', clean: false });
    }

    function shoji(x0, x1) {
        const { p } = cam, s = sprite(), z = R.zT - 0.05;
        const a = p(x0, 0.03, z), b = p(x1, R.beam, z);
        const L = Math.round(a.x), Rr = Math.round(b.x), T = Math.round(b.y), B = Math.round(a.y), w = Rr - L, h = B - T;
        // Paper, glowing from outside, brightest at the top.
        s.rect(L, T, Rr, B, (x, y) => 0.95 - 0.55 * (y - T) / h, 1);
        // Lattice: a pixel-wide bar grid.
        for (let i = 1; i < 4; i++) { const x = Math.round(L + (w * i) / 4); s.rect(x, T, x + 1, B, 0.2, 0, 1); }
        for (let j = 1; j < 7; j++) { const y = Math.round(T + (h * 0.82 * j) / 7); s.rect(L, y, Rr, y + 1, 0.2, 0, 1); }
        // Frame and the kick panel.
        s.rect(L, T, L + 2, B, 0.3, 0, 1); s.rect(Rr - 2, T, Rr, B, 0.3, 0, 1); s.rect(L, T, Rr, T + 2, 0.3, 0, 1);
        const kick = Math.round(T + h * 0.82);
        s.rect(L, kick, Rr, B, 0.15, 0, 1);
        s.rect(L, kick, Rr, kick + 1, 0.6, 0, 1);
        return s.paint([PAL.wood, PAL.paper], { outline: 'none', clean: false });
    }

    function posts() {
        const { p } = cam, s = sprite();
        for (const side of [-1, 1]) {
            const x0 = side < 0 ? -R.half : R.half - 0.13, x1 = x0 + 0.13;
            const a = p(x0, 0, R.zT), b = p(x1, R.ceil, R.zT);
            s.rect(a.x, b.y, b.x, a.y, 0.3, 0);
            const lit = side < 0 ? Math.round(b.x) - 1 : Math.round(a.x);
            s.rect(lit, b.y, lit + 1, a.y, 0.75, 0, 1);
        }
        return s.paint([PAL.wood], { outline: 'none', clean: false });
    }

    // Where the afternoon sun lies on the floor, in room metres: in through the
    // opening, falling to the right as it reaches into the room.
    const SUN = [{ x: -1.9, z: 3.6 }, { x: 1.9, z: 3.6 }, { x: 2.95, z: 2.25 }, { x: -0.85, z: 2.25 }];
    function sunAt(x, z) {
        if (!S.sunOn) return false;
        let c = false;
        for (let i = 0, j = SUN.length - 1; i < SUN.length; j = i++) {
            const a = SUN[i], b = SUN[j];
            if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
        }
        return c;
    }
    /** The room point at height h under screen pixel (X, Y). */
    function onPlane(X, Y, h) {
        const z = ((cam.camH - h) * cam.f) / Math.max(0.01, Y - cam.ye);
        return { x: cam.camX + ((X - cam.cx) * z) / cam.f, z };
    }

    /** The futon: a cream mattress, a gingham towel blanket thrown over its near half, a soft pillow; sun across the far end. */
    function futon(r) {
        const { p, f } = cam, s = sprite();
        const { x0, x1 } = S.futon, z0 = 0.3, z1 = 2.95, top = 0.1;
        const C = { cream: 0, creamSun: 1, towel: 2, towelSun: 3, shadow: 4, mat: 5 };
        const corners = [p(x0 - 0.2, 0, z0), p(x1 + 0.3, 0, z0), p(x1 + 0.3, 0.3, z1), p(x0 - 0.2, 0.3, z1)];
        const box = [Math.min(...corners.map(c => c.x)), Math.min(...corners.map(c => c.y)), Math.max(...corners.map(c => c.x)), Math.min(A.LH, Math.max(...corners.map(c => c.y)))];
        const area = fn => s.shape(box[0], box[1], box[2], box[3], fn);
        const soft = (x, y) => (((x + y) & 1) ? 0.02 : -0.02);      // a dithered edge to the light

        // Its shadow, thrown right across the sunlit mats.
        area((X, Y) => {
            const q = onPlane(X, Y, 0), d = q.x - x1, zz = q.z + d * 1.2;
            return d > 0 && d < 0.12 && zz > z0 && zz < z1 && sunAt(q.x, q.z) ? [0.45, C.mat] : null;
        });
        // The mattress side, toward the window: in the sun where the sun reaches.
        if (x0 > cam.camX) area((X, Y) => {
            const z = ((x0 - cam.camX) * f) / Math.max(0.01, X - cam.cx), y = cam.camH - ((Y - cam.ye) * z) / f;
            if (z < z0 || z > z1 || y < 0 || y > top) return null;
            return sunAt(x0 - 0.01, z + soft(X, Y)) ? [0.45 + y * 2, C.creamSun] : [0.18 + y * 1.5, C.cream];
        });
        // The top, with piping just inside its edge and the corners rounded off.
        area((X, Y) => {
            const q = onPlane(X, Y, top);
            if (q.x < x0 || q.x > x1 || q.z < z0 || q.z > z1) return null;
            const ex = Math.min(q.x - x0, x1 - q.x), ez = z1 - q.z;
            if (ex < 0.03 && ez < 0.03) return null;
            const pipe = Math.abs(Math.min(ex, ez) - 0.04) < 0.008 ? -0.12 : 0;
            const sun = sunAt(q.x + soft(X, Y), q.z);
            return sun ? [0.6 + 0.3 * clamp((q.z - 2.25) / 0.7, 0, 1) + pipe, C.creamSun] : [0.45 + 0.25 * clamp(q.z / 1.7, 0, 1) + pipe, C.cream];
        });

        // The pillow: stacked slices of a rounded block, the top slice lit, a blue band round its middle.
        const pcx = lerp(x0, x1, 0.5), pcz = 2.66, phw = (x1 - x0) * 0.3, phd = 0.16, ph = 0.1;
        const n = Math.max(4, Math.ceil((ph * f) / pcz) + 2);
        for (let k = 0; k <= n; k++) {
            const t = k / n, h = top + ph * t, shrink = Math.sqrt(1 - 0.55 * t * t * t * t);
            area((X, Y) => {
                const q = onPlane(X, Y, h), u = (q.x - pcx) / (phw * shrink), v = (q.z - pcz) / (phd * shrink);
                const e = u ** 4 + v ** 4;
                if (e > 1) return null;
                const band = Math.abs(Math.abs(q.x - pcx) - phw * 0.45) < phw * 0.07;
                const lit = k === n ? 0.68 - 0.18 * u - 0.12 * v + 0.12 * (1 - e) : 0.28 + 0.3 * t - 0.12 * u;
                const sun = sunAt(q.x + soft(X, Y), q.z);
                return band ? [lit - 0.08, sun ? C.towelSun : C.towel] : [lit, sun ? C.creamSun : C.cream];
            });
        }

        // The towel blanket: gingham, rumpled into soft folds, its far edge rolled.
        const zf = 1.85, cell = 0.1, edgeZ = x => zf + 0.07 * Math.sin(x * 8.3 + 1) + 0.04 * Math.sin(x * 21);
        const gingham = (x, z) => { const a = Math.floor(x / cell) & 1, b = Math.floor(z / cell) & 1; return a && b ? 0 : a || b ? 0.5 : 1; };
        const fold = (x, z) => 0.1 * Math.sin(x * 11 + z * 2.6) + 0.06 * Math.sin(z * 6.5 - x * 3);
        const towelAt = (x, z, X, Y, light) => {
            const v = 0.1 + 0.55 * gingham(x, z) + fold(x, z) + light;
            return sunAt(x + soft(X, Y), z) ? [v + 0.15, C.towelSun] : [v, C.towel];
        };
        // It hangs down over the mattress side to the floor.
        const xs = x0 - 0.04;
        if (xs > cam.camX) area((X, Y) => {
            const z = ((xs - cam.camX) * f) / Math.max(0.01, X - cam.cx), y = cam.camH - ((Y - cam.ye) * z) / f;
            if (z < z0 || z > edgeZ(xs) || y < 0 || y > top + 0.03) return null;
            return towelAt(xs, z + y, X, Y, -0.14 + y);
        });
        area((X, Y) => {
            const q = onPlane(X, Y, top + 0.03);
            if (q.x < xs || q.x > x1 + 0.04 || q.z < z0) return null;
            const ez = edgeZ(q.x) - q.z;
            if (ez < 0) return null;
            if (ez < 0.045) return sunAt(q.x, q.z) ? [0.95, C.towelSun] : [0.85 - ez * 4, C.towel];   // the rolled edge, lit along its top
            return towelAt(q.x, q.z, X, Y, 0.04 * clamp(q.z / zf, 0, 1));
        });

        const futonCanvas = s.paint([PAL.cream, PAL.creamSun, PAL.towel, PAL.towelSun, PAL.shadow, PAL.tatami], { outline: 'sel' });
        const out = Pixel.layer(A.LW, A.LH);
        out.g.drawImage(futonCanvas, 0, 0);
        out.g.drawImage(uchiwa(lerp(x0, x1, 0.22), top + 0.04, 1.05), 0, 0);
        return out.canvas;
    }

    /** A round paper fan lying flat: an ellipse with ribs, a blue disc and a handle. */
    function uchiwa(x, y, z) {
        const { p, f } = cam, s = sprite(), c = p(x, y, z), r = (0.13 * f) / z;
        const rot = -0.6, cs = Math.cos(rot), sn = Math.sin(rot);
        const at = (u, v) => ({ x: c.x + (u * cs - v * sn), y: c.y + (u * sn + v * cs) * 0.45 });
        const h0 = at(0, r * 0.7), h1 = at(0, r * 1.8);
        s.line(h0.x, h0.y, h1.x, h1.y, 0, 0, 1);
        s.line(h0.x + 1, h0.y, h1.x + 1, h1.y, 0, 0, 1);
        s.ellipse(c.x, c.y, r, r * 0.45, (dx, dy) => 0.6 + 0.35 * (-dx - dy) * 0.5, 1);
        for (let k = -3; k <= 3; k++) { const a = at(0, r * 0.6), b = at(Math.sin(k * 0.35) * r * 0.9, -Math.cos(k * 0.35) * r * 0.9); s.line(a.x, a.y, b.x, b.y, 0.2, 1, 1); }
        const d = at(r * 0.25, -r * 0.2);
        s.ellipse(d.x, d.y, r * 0.32, r * 0.16, 1, 2, 1);
        return s.paint([PAL.wood, PAL.fan, PAL.fanInk], { outline: 'sel' });
    }

    /** An open laptop: aluminium deck with keys and a trackpad, the lid leaning back, its screen left for the frame to fill. */
    function laptop(x, y0, z) {
        const { p } = cam, s = sprite();
        const w = 0.34, d = 0.23, h = 0.018, lidH = 0.22, lean = 0.07;
        const xl = x - w / 2, xr = x + w / 2, zf = z - d / 2, zb = z + d / 2, top = y0 + h;
        // Its shadow on whatever it sits on, thrown right and back by the sun.
        s.poly([p(xl + 0.02, y0, zf + 0.02), p(xr + 0.05, y0, zf + 0.02), p(xr + 0.05, y0, zb + 0.03), p(xl + 0.02, y0, zb + 0.03)], 0, 3);
        // Deck: front lip in shade, then the top with its keys and trackpad.
        s.poly([p(xl, y0, zf), p(xr, y0, zf), p(xr, top, zf), p(xl, top, zf)], 0.22, 0);
        const L0 = p(xl, top, z).x, L1 = p(xr, top, z).x;
        const corners = [p(xl, top, zf), p(xr, top, zf), p(xr, top, zb), p(xl, top, zb)];
        const box = [Math.min(...corners.map(c => c.x)), Math.min(...corners.map(c => c.y)), Math.max(...corners.map(c => c.x)), Math.max(...corners.map(c => c.y))];
        s.shape(box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1, (X, Y) => {
            const q = onPlane(X, Y, top);
            if (q.x < xl || q.x > xr || q.z < zf || q.z > zb) return null;
            const lit = 0.66 - 0.18 * clamp((X - L0) / (L1 - L0), 0, 1);
            if (q.x > xl + 0.025 && q.x < xr - 0.025 && q.z > zb - 0.125 && q.z < zb - 0.015) {
                const row = (q.z - (zb - 0.125)) / 0.022, col = (q.x - xl - 0.025 - Math.floor(row) * 0.007) / 0.021;
                return (row % 1) < 0.3 || (col % 1) < 0.25 ? lit - 0.12 : [0.05, 1];       // dark keys, deck between
            }
            if (Math.abs(q.x - x) < 0.055 && q.z > zf + 0.012 && q.z < zf + 0.075) return lit - 0.08;   // trackpad
            return lit;
        });
        // Lid: hinged at the back, leaning away; a thin bezel round the screen, its top edge catching the light.
        const lid = [p(xl, top, zb), p(xr, top, zb), p(xr, top + lidH, zb + lean), p(xl, top + lidH, zb + lean)];
        s.poly(lid, 0.4, 1);
        s.line(lid[3].x, lid[3].y, lid[2].x, lid[2].y, 0.9, 0, 1);
        s.line(lid[0].x, lid[0].y - 1, lid[3].x, lid[3].y, 0.75, 0, 1);
        const sc = [p(xl + 0.016, top + 0.018, zb + lean * 0.08), p(xr - 0.016, top + lidH - 0.014, zb + lean * 0.94)];
        S.screen = { x0: Math.round(sc[0].x) + 1, y0: Math.round(sc[1].y) + 1, x1: Math.round(sc[1].x) - 1, y1: Math.round(sc[0].y) - 1 };
        return s.paint([PAL.alu, PAL.bezel, PAL.alu, PAL.shadow], { outline: 'sel' });
    }

    /** A tabby asleep in the sun on the veranda boards, or awake with her head up. */
    function cat(x, z, awake) {
        const { p, f } = cam, s = sprite(), c = p(x, 0, z), k = f / z;
        const lit = (dx, dy) => 0.55 + 0.4 * clamp(-dx * 0.45 - dy * 0.85, -1, 1);
        const stripe = X => (Math.floor((X - c.x) / Math.max(2, 0.045 * k)) & 1 ? -0.16 : 0);
        s.ellipse(c.x + 0.03 * k, c.y, 0.25 * k, Math.max(1.5, 0.03 * k), 0, 3);                       // shadow on the boards
        const bx = c.x + 0.02 * k, by = c.y - 0.085 * k;
        s.ellipse(bx, by, 0.21 * k, 0.09 * k, (dx, dy, X) => lit(dx, dy) + (dy < 0.4 ? stripe(X) : 0), 0);
        // The tail, wrapped round the front of the loaf.
        for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * Math.PI * 0.9, tx = bx + Math.cos(a) * 0.2 * k, ty = by + Math.sin(a) * 0.075 * k + 0.012 * k;
            s.set(tx, ty, 0.42 + (i & 2 ? -0.18 : 0), 0, 1); s.set(tx, ty - 1, 0.58 + (i & 2 ? -0.18 : 0), 0, 1);
        }
        const hx = c.x - 0.19 * k, hy = awake ? c.y - 0.2 * k : c.y - 0.1 * k, hr = Math.max(3, 0.075 * k);
        s.ellipse(hx, hy, hr * 1.1, hr, (dx, dy) => lit(dx, dy), 0);
        if (awake) s.ellipse(hx + hr * 0.2, hy + hr * 1.1, hr * 0.6, hr * 0.7, 0.9, 2);                 // white bib
        for (const side of [-1, 1]) {
            const ex = hx + side * hr * 0.55;
            s.poly([{ x: ex - hr * 0.42, y: hy - hr * 0.55 }, { x: ex + side * hr * 0.08, y: hy - hr * 1.45 }, { x: ex + hr * 0.42, y: hy - hr * 0.55 }], side < 0 ? 0.85 : 0.55, 0);
            s.set(ex + side * hr * 0.05, hy - hr * 0.8, 0.5, 4, 1);
            const ey = Math.round(hy + hr * 0.05), eX = Math.round(hx + side * hr * 0.42);
            if (awake) { s.set(eX, ey, 1, 1, 1); s.set(eX, ey + 1, 0, 1, 1); }
            else { s.set(eX - 1, ey, 0.05, 0, 1); s.set(eX, ey, 0.05, 0, 1); }
        }
        s.set(hx, hy + hr * 0.45, 0.5, 4, 1);                                                             // nose
        const canvas = s.paint([PAL.tabby, PAL.catEye, PAL.creamSun, PAL.shadow, PAL.flesh], { outline: 'sel' });
        return { canvas, head: { x: Math.round(hx), y: Math.round(hy - hr * 1.5) } };
    }

    function radio(x, z) {
        const { p } = cam, s = sprite();
        const a = p(x - 0.17, 0, z), b = p(x + 0.17, 0.2, z);
        s.poly([p(x - 0.17, 0.2, z), p(x + 0.17, 0.2, z), p(x + 0.17, 0.2, z + 0.1), p(x - 0.17, 0.2, z + 0.1)], 0.85, 0);
        s.rect(a.x, b.y, b.x, a.y, 0.45, 0);
        const w = b.x - a.x, h = a.y - b.y;
        // Speaker grille: a disc of alternating pixels.
        const sc = { x: a.x + w * 0.3, y: b.y + h * 0.55 }, sr = h * 0.32;
        s.ellipse(sc.x, sc.y, sr, sr, (dx, dy, X, Y) => ((X + Y) & 1 ? 0.05 : 0.6), 0, 1);
        s.rect(a.x + w * 0.58, b.y + h * 0.28, a.x + w * 0.9, b.y + h * 0.5, 0.7, 1, 1);
        s.ellipse(a.x + w * 0.74, b.y + h * 0.74, Math.max(1, h * 0.1), Math.max(1, h * 0.1), 0, 0, 1);
        s.line(b.x - w * 0.1, b.y - 1, b.x + w * 0.5, b.y - h * 1.9, 0.9, 1, 1);
        return s.paint([PAL.radio, PAL.dial], { outline: 'sel', rim: true });
    }

    /** The mosquito coil in its glazed pig, snout toward the room, an ember in its mouth. */
    function pig(x, z) {
        const { p, f } = cam, s = sprite(), c = p(x, 0.09, z), r = (0.13 * f) / z;
        const X = c.x, Y = c.y;
        S.smokeFrom = { x: Math.round(X - r * 1.2), y: Math.round(Y - r * 0.15), s: r };
        // Its shadow on the mat, flat and wide.
        s.ellipse(X + r * 0.1, Y + r * 0.92, r * 1.2, Math.max(1.5, r * 0.16), 0, 1);
        // Four stubby legs, the far pair in shade.
        for (const [lx, v] of [[-0.55, 0.45], [-0.05, 0.25], [0.35, 0.45], [0.75, 0.25]])
            s.rect(X + lx * r - r * 0.12, Y + r * 0.45, X + lx * r + r * 0.12, Y + r * 0.88, v, 0);
        // The body: a fat barrel, glaze lit from the window at the upper left.
        s.ellipse(X, Y, r * 1.0, r * 0.72, (dx, dy) => 0.48 + 0.42 * clamp(-dx * 0.55 - dy * 0.85, -1, 1), 0);
        // Ear, pricked forward.
        s.poly([{ x: X - r * 0.5, y: Y - r * 0.5 }, { x: X - r * 0.32, y: Y - r * 1.0 }, { x: X - r * 0.12, y: Y - r * 0.6 }], 0.8, 0);
        // Snout: a short tube toward the room, its rim lit, its mouth dark, the ember inside.
        s.ellipse(X - r * 1.0, Y - r * 0.08, r * 0.26, r * 0.42, (dx) => 0.75 - dx * 0.2, 0);
        s.ellipse(X - r * 1.06, Y - r * 0.08, r * 0.14, r * 0.28, 0.02, 0, 1);
        s.set(X - r * 1.06, Y + r * 0.06, 1, 2, 1);
        s.set(X - r * 1.06, Y + r * 0.06 - 1, 0.4, 2, 1);
        // Eye, and a glint of glaze along the back.
        s.set(X - r * 0.55, Y - r * 0.25, 0, 0, 1);
        s.line(X - r * 0.15, Y - r * 0.66, X + r * 0.45, Y - r * 0.6, 1, 0, 1);
        return s.paint([PAL.pig, PAL.shadow, PAL.ember], { outline: 'sel' });
    }

    function tray(x, z, bites = 0) {
        const { p, f } = cam, s = sprite(), c = p(x, 0, z), r = (0.2 * f) / z;
        s.ellipse(c.x + r * 0.2, c.y + r * 0.08, r * 1.5, Math.max(1.5, r * 0.26), 0, 7);              // shadow
        s.ellipse(c.x, c.y - r * 0.02, r * 1.4, r * 0.26, (dx, dy) => 0.35 - dy * 0.3, 0);
        s.ellipse(c.x, c.y - r * 0.06, r * 1.25, r * 0.17, 0.75, 0);
        if (S.season !== 'summer') return snack(s, c, r, bites);
        // A wedge of watermelon, standing on its rind: rind, pith, flesh, seeds.
        const wx = c.x - r * 0.5, wy = c.y - r * 0.08;
        const half = (rr, v, m, lock) => s.ellipse(wx, wy, rr, rr, (dx, dy) => (dy <= 0 ? (typeof v === 'function' ? v(dx, dy) : v) : NaN), m, lock);
        half(r * 0.62, 0.5, 1);
        half(r * 0.56, 0.6, 2, 1);
        half(r * 0.5, (dx, dy) => 0.45 + 0.5 * (-dx * 0.5 - dy * 0.4), 3, 1);
        for (let k = 0; k < s.v.length; k++) if (Number.isNaN(s.v[k])) s.m[k] = 0;
        for (const [dx, dy] of [[-0.25, -0.18], [0.05, -0.28], [0.28, -0.15], [-0.05, -0.12], [0.15, -0.36]]) s.set(wx + dx * r, wy + dy * r, 0, 4, 1);
        // Bites out of the top, left to right: round scoops through flesh, pith and rind.
        for (let b = 0; b < bites; b++) {
            const a = -0.9 + b * 0.75, cx = wx + Math.sin(a) * r * 0.62, cy = wy - Math.cos(a) * r * 0.62, br = r * 0.24;
            for (let yy = Math.floor(cy - br); yy <= cy + br; yy++) for (let xx = Math.floor(cx - br); xx <= cx + br; xx++)
                if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 < br * br) s.erase(xx, yy);
        }
        // Ramune: the glass bottle with its marble, a highlight down its side.
        const bx = c.x + r * 0.65, by = c.y - r * 0.06, bh = r * 1.25, bw = r * 0.3;
        s.poly([{ x: bx - bw / 2, y: by }, { x: bx - bw / 2, y: by - bh * 0.6 }, { x: bx - bw * 0.2, y: by - bh * 0.75 }, { x: bx - bw * 0.15, y: by - bh },
            { x: bx + bw * 0.15, y: by - bh }, { x: bx + bw * 0.2, y: by - bh * 0.75 }, { x: bx + bw / 2, y: by - bh * 0.6 }, { x: bx + bw / 2, y: by }],
            (X) => 0.35 + 0.3 * clamp((bx - X) / bw + 0.5, 0, 1), 5);
        s.line(bx - bw * 0.25, by - bh * 0.15, bx - bw * 0.25, by - bh * 0.5, 1, 5, 1);
        s.set(bx, by - bh * 0.78, 0.95, 5, 1);
        s.rect(bx - bw * 0.2, by - bh - 1, bx + bw * 0.2, by - bh, 1, 6, 1);
        const canvas = s.paint([PAL.tray, PAL.rind, PAL.pith, PAL.flesh, PAL.seed, PAL.glass, PAL.cap, PAL.shadow], { outline: 'sel' });
        return canvas;
    }

    /** Out of summer, the tray holds three of something (one fewer each bite) and a cup of tea. */
    function snack(s, c, r, bites) {
        const lit = (dx, dy) => 0.5 + 0.45 * clamp(-dx * 0.55 - dy * 0.75, -1, 1);
        const kind = S.season, left = 3 - bites;
        if (kind === 'spring') {
            // Dango: pink, white and green on a skewer, eaten from the end.
            const y = c.y - r * 0.2, x0 = c.x - r * 0.95, x1 = c.x + r * 0.15;
            s.line(x0 - r * 0.15, y + r * 0.04, x1 + r * 0.2, y - r * 0.04, 0.6, 9, 1);
            const balls = [10, 11, 12];
            for (let i = 0; i < left; i++) s.ellipse(lerp(x0, x1, i / 2) + r * 0.05, y - r * 0.02, r * 0.21, r * 0.2, lit, balls[i]);
        } else {
            // Persimmons in autumn, mikan in winter, a calyx or a leaf on each.
            const m = kind === 'autumn' ? 8 : 13, rr = kind === 'autumn' ? r * 0.27 : r * 0.24;
            const spots = [[-0.75, -0.05], [-0.2, -0.08], [-0.48, -0.42]];
            for (let i = 0; i < left; i++) {
                const [dx, dy] = spots[i], fx = c.x + dx * r, fy = c.y + dy * r - rr * 0.8;
                // A persimmon sits squat under a square calyx; a mikan is rounder, with a leaf.
                s.ellipse(fx, fy, rr * (kind === 'autumn' ? 1.15 : 1), rr * (kind === 'autumn' ? 0.86 : 1), lit, m);
                if (kind === 'autumn') s.rect(fx - rr * 0.45, fy - rr * 0.86 - 0.5, fx + rr * 0.45, fy - rr * 0.86 + 1, 0.3, 14, 1);
                else { s.set(fx, fy - rr, 0.3, 14, 1); s.set(fx + 1, fy - rr - 1, 1, 14, 1); s.set(fx + 2, fy - rr - 1, 0.6, 14, 1); }
            }
        }
        // A cup of green tea.
        const bx = c.x + r * 0.62, by = c.y - r * 0.06, bh = r * 0.62, bw = r * 0.5;
        s.rect(bx - bw / 2, by - bh, bx + bw / 2, by, (X) => 0.3 + 0.55 * clamp((bx - X) / bw + 0.5, 0, 1), 15);
        s.ellipse(bx, by - bh, bw / 2, Math.max(1, bw * 0.16), 0.6, 16, 1);
        s.line(bx - bw / 2, by - bh, bx + bw / 2, by - bh, 0.9, 15, 1);
        return s.paint([PAL.tray, PAL.rind, PAL.pith, PAL.flesh, PAL.seed, PAL.glass, PAL.cap, PAL.shadow, PAL.kaki, PAL.stick, PAL.dango, PAL.mochi, PAL.yomogi, PAL.mikan, PAL.calyx, PAL.cup, PAL.tea], { outline: 'sel' });
    }

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
        const sway = Math.round(Math.sin(t * 0.8 + 1) * (0.5 + w * 1.5)), hx = Math.round(hook.x), hy = Math.round(hook.y);
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

    // ── Things you can touch ─────────────────────────────────────────────
    // Each is its own sprite at the room's depth, with its own outline for when
    // the pointer is over it, and something it does when tapped.

    function alphaOf(canvas) {
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, a = new Uint8Array(canvas.width * canvas.height);
        for (let k = 0; k < a.length; k++) a[k] = d[k * 4 + 3] > 0 ? 1 : 0;
        return a;
    }

    /** A cropped sprite with its alpha (for hit tests) and a one-pixel light outline. */
    function outlined(c) {
        const alpha = alphaOf(c.canvas);
        const ol = Pixel.layer(c.w + 2, c.h + 2), g = ol.g;
        g.fillStyle = '#fff2c8';
        const on = (x, y) => x >= 0 && y >= 0 && x < c.w && y < c.h && alpha[y * c.w + x];
        for (let y = -1; y <= c.h; y++) for (let x = -1; x <= c.w; x++)
            if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1);
        return { ...c, alpha, outline: ol.canvas };
    }
    const spriteThing = canvas => outlined(crop(canvas));
    const labelOf = t => (typeof t.label === 'function' ? t.label() : t.label);

    const GITHUB = 'https://github.com/khmurakami';
    function bakeThings() {
        const P = cam.portrait, fu = S.futon, st = S.things = {}, T = [];
        const add = (id, o) => { const t = { id, z: R.zT, ...o }; st[id] = t; T.push(t); return t; };

        const melon = [0, 1, 2, 3].map(b => spriteThing(tray(P ? -0.05 : 0.55, 4.3, b)));
        add('melon', { order: 1, bites: 0, sprite: () => melon[st.melon.bites],
            label: () => {
                const name = { spring: 'dango', summer: 'watermelon', autumn: 'persimmons', winter: 'mikan' }[S.season];
                if (S.season === 'summer') return st.melon.bites < 3 ? 'watermelon · take a bite' : 'watermelon · another slice';
                return st.melon.bites < 3 ? `${name} · have one` : `${name} · another plate`;
            },
            act: () => { st.melon.bites = (st.melon.bites + 1) % 4; } });

        const catAt = P ? [-1.15, 4.35] : [-1.6, 4.3];
        const sleep = cat(catAt[0], catAt[1], false), awake = cat(catAt[0], catAt[1], true);
        const catFrames = { sleep: spriteThing(sleep.canvas), awake: spriteThing(awake.canvas) };
        S.catHead = { sleep: sleep.head, awake: awake.head };
        add('cat', { order: 2, until: -1, sprite: () => (st.cat.until > S.t ? catFrames.awake : catFrames.sleep),
            label: () => (st.cat.until > S.t ? 'cat · purring' : 'cat · pet her'),
            act: () => { st.cat.until = S.t + 4; for (let i = 0; i < 3; i++) S.hearts.push({ t0: S.t + i * 0.35, dx: (i - 1) * 4 }); } });

        const radioC = spriteThing(radio(P ? -0.7 : 2.25, P ? 1.7 : 3.15));
        const scape = Stage.Sound.scape;
        add('radio', { order: 3, sprite: () => radioC,
            label: () => {
                if (!scape) return Stage.Sound.on ? 'radio · turn it off' : 'radio · turn it on';
                const next = ['lo-fi', 'baseball', 'festival', 'off'][scape.station];
                return scape.station ? `radio · ${scape.stationName} · tune to ${next}` : 'radio · turn it on';
            },
            act: () => {
                if (scape) return scape.tune();
                const b = document.getElementById('sound'); if (b) b.click(); else Stage.Sound.set(!Stage.Sound.on);
            } });

        const pigC = spriteThing(pig(P ? -0.5 : -0.9, 3.05));
        add('pig', { order: 4, sprite: () => pigC, label: 'mosquito coil · puff', act: () => { S.puffT = S.t; } });

        const lap = spriteThing(P ? laptop(lerp(fu.x0, fu.x1, 0.3), 0.1, 2.25) : laptop(lerp(fu.x0, fu.x1, 0.7), 0.1, 2.05));
        add('laptop', { order: 5, sprite: () => lap, label: 'laptop · open the terminal',
            act: () => {
                if (window.Terminal) return Terminal.open();
                const a = document.createElement('a'); a.href = GITHUB; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
            } });

        // Things drawn each frame: they answer to a box instead of a sprite.
        add('chime', { order: 6, box: () => S.chimeBox, label: 'wind chime · ring', act: () => { chime.om += (Math.random() < 0.5 ? -1 : 1) * 2.2; S.chimeT = S.t; } });
        add('blind', { order: 0, box: () => S.blindBox, label: () => (S.blindTarget ? 'blind · let it down' : 'blind · roll it up'),
            act: () => { S.blindTarget = S.blindTarget ? 0 : 1; } });
        // In the first week of July, the tanabata bamboo.
        S.bamboo = null;
        if (RT.tanabata(RT.now())) {
            const B = bambooAt(), bam = bamboo(B.x, B.z);
            S.bamboo = { c: spriteThing(bam.canvas), strips: bam.strips, strip: bam.strip, z: B.z };
            add('bamboo', { z: B.z, order: 0, own: true, reach: 3, sprite: () => S.bamboo.c, label: 'tanabata bamboo · rustle', act: () => { S.rustleT = S.t; } });
        }
        add('moon', { z: 1e4, order: 0, box: () => (S.grade.dark > 0.15 && S.moon && !S.usagi ? { x0: S.moon.x - S.moon.r - 1, y0: S.moon.y - S.moon.r - 1, x1: S.moon.x + S.moon.r + 1, y1: S.moon.y + S.moon.r + 1 } : null),
            label: () => (S.moonTaps >= 2 ? 'the moon · something moves up there…' : `the moon · ${moonName()}`),
            act: () => {
                S.moonTaps = S.t - (S.moonAt ?? -9) < 4 ? (S.moonTaps || 0) + 1 : 1;
                S.moonAt = S.t;
                if (S.moonTaps >= 5) { S.moonTaps = 0; S.usagi = { t0: S.t }; }
            } });
        add('lantern', { order: 7, box: () => S.lanternBox, label: () => (lanternLit() ? 'lantern · put it out' : 'lantern · light it'),
            act: () => { S.lanternOn = !lanternLit(); } });
        // The far end of the futon, by the pillow: lie down.
        {
            const { x0, x1 } = fu, c = [cam.p(x0, 0.1, 2.25), cam.p(x1, 0.1, 2.25), cam.p(x1, 0.1, 2.95), cam.p(x0, 0.1, 2.95)];
            const nb = { x0: Math.round(Math.min(...c.map(q => q.x))), y0: Math.round(Math.min(...c.map(q => q.y))), x1: Math.round(Math.max(...c.map(q => q.x))), y1: Math.round(Math.max(...c.map(q => q.y))) };
            // A finger can lie down anywhere on its top; a mouse at the pillow end, where its outline shows.
            const onTop = (x, y) => { const q = onPlane(x, y, 0.1); return q.x >= x0 && q.x <= x1 && q.z >= 0.3 && q.z <= 2.95; };
            // Where a check's finger goes: the middle of the futon as a finger can reach it on screen.
            const spot = () => {
                const d = S.shift(R.zT), hits = [];
                for (let y = A.M; y < A.M + A.H; y += 2) for (let x = A.M; x < A.M + A.W; x += 2)
                    if (onTop(x, y) && pick((x + d.x + 0.5) * A.scale, (y + d.y + 0.5) * A.scale, FINGER) === st.futon) hits.push([x, y]);
                if (!hits.length) return null;
                const mx = hits.reduce((a, h) => a + h[0], 0) / hits.length, my = hits.reduce((a, h) => a + h[1], 0) / hits.length;
                const [x, y] = hits.reduce((a, h) => ((h[0] - mx) ** 2 + (h[1] - my) ** 2 < (a[0] - mx) ** 2 + (a[1] - my) ** 2 ? h : a));
                return { x, y };
            };
            add('futon', { order: -0.5, box: () => nb, area: onTop, spot, label: 'futon · take a nap', act: nap });
        }
        for (const pl of S.plants) T.push({ id: 'plant', z: pl.z, plant: pl, order: -1, label: pl.label + ' · rustle', act: () => { pl.kick = S.t; } });

        S.thingList = T;
        S.drawThings = T.filter(t => t.sprite && !t.own).sort((a, b) => a.order - b.order);
        S.hearts = []; S.notes = []; S.nextNote = 0; S.nextTwinkle = 3; S.twinkle = null; S.puffT = -10;
        S.blindRoll = S.blindRoll || 0; S.blindTarget = S.blindTarget || 0; S.t = S.t || 0;
        S.lanternOn = S.lanternOn ?? null;
        accessibleThings(T);
    }

    // Big, flat things a stray finger lands on by accident: anything small nearby wins over them.
    const WEAK = new Set(['futon', 'blind', 'plant']);
    /** A sprite's body: the pixels with most of their neighbours filled in too. */
    function coreOf(c, a) {
        if (c.core) return c.core;
        const core = new Uint8Array(c.w * c.h);
        for (let y = 1; y < c.h - 1; y++) for (let x = 1; x < c.w - 1; x++) {
            let n = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) n += a[(y + j) * c.w + x + i];
            core[y * c.w + x] = n >= 7 ? 1 : 0;
        }
        return (c.core = core);
    }

    /** How far (art pixels) a point is from a thing's solid pixels, looking no further than r. */
    function reachOf(t, x, y, r) {
        if (r && t.area && t.area(x, y)) return 0;
        if (t.box) {
            const b = t.box();
            if (!b) return Infinity;
            const pad = r ? 0 : 2, dx = Math.max(b.x0 - pad - x, 0, x - b.x1 - pad), dy = Math.max(b.y0 - pad - y, 0, y - b.y1 - pad);
            const dist = Math.hypot(dx, dy);
            return dist <= r ? dist : Infinity;
        }
        const c = t.plant || t.sprite(), a = t.plant ? t.alpha || (t.alpha = alphaOf(c.canvas)) : c.alpha;
        const lx = x - c.x, ly = y - c.y;
        if (!r) {
            // A mouse: on the sprite, with a pixel of grace (or the thing's own reach); plants exactly.
            if (lx < 0 || ly < 0 || lx >= c.w || ly >= c.h) return Infinity;
            const n = t.plant ? 0 : t.reach || 1;
            for (let Y = Math.max(0, ly - n); Y <= Math.min(c.h - 1, ly + n); Y++) for (let X = Math.max(0, lx - n); X <= Math.min(c.w - 1, lx + n); X++)
                if (a[Y * c.w + X]) return 0;
            return Infinity;
        }
        // A finger: on any pixel of it, or near its body. Thin lines (the radio's
        // aerial, a cord) count only when touched, so they don't steal taps.
        if (lx < -r || ly < -r || lx >= c.w + r || ly >= c.h + r) return Infinity;
        if (lx >= 0 && ly >= 0 && lx < c.w && ly < c.h && a[ly * c.w + lx]) return 0;
        const body = coreOf(c, a);
        let best = Infinity;
        for (let Y = Math.max(0, ly - r); Y <= Math.min(c.h - 1, ly + r); Y++) for (let X = Math.max(0, lx - r); X <= Math.min(c.w - 1, lx + r); X++)
            if (body[Y * c.w + X]) best = Math.min(best, Math.hypot(X - lx, Y - ly));
        return best <= r ? best : Infinity;
    }

    /**
     * The thing under a screen point, or null. A mouse is exact (nearest first);
     * a finger (slop, in CSS pixels) takes whatever is closest within reach.
     */
    function pick(cx, cy, slop = 0) {
        if (!S || !S.shift || !S.thingList) return null;
        const ax = Math.floor(cx / A.scale), ay = Math.floor(cy / A.scale), r = Math.round(slop / A.scale);
        const near = [...S.thingList].sort((a, b) => a.z - b.z || b.order - a.order);
        let best = null, bestScore = Infinity;
        for (const t of near) {
            const d = S.shift(t.z), x = ax - d.x, y = ay - d.y;
            if (t.z > R.zT + 1e-6 && walled(ax, ay)) continue;
            if (t.hit) { const sub = t.hit(x, y); if (sub) return sub; continue; }
            const dist = reachOf(t, x, y, r);
            if (dist === Infinity) continue;
            if (!r) return t;
            const score = dist + (WEAK.has(t.id) ? r * 0.5 : 0);
            if (score < bestScore) { best = t; bestScore = score; }
        }
        return best;
    }
    /** Whether the room itself (walls, eave, floor) covers this screen art pixel. */
    function walled(ax, ay) {
        const d = S.shift(R.zT), x = ax - d.x, y = ay - d.y;
        if (!S.roomAlpha || S.roomAlpha.from !== S.room) S.roomAlpha = { from: S.room, a: alphaOf(S.room) };
        return x >= 0 && y >= 0 && x < A.LW && y < A.LH && S.roomAlpha.a[y * A.LW + x] === 1;
    }
    // Whether taps here come from a finger (for where checks should tap).
    const phoneish = () => matchMedia('(pointer: coarse)').matches;
    // About a fingertip's half-width.
    const FINGER = 22;

    // The label for what is under the pointer (or the tap), as a small pill.
    let tip = null, tipTimer = 0;
    function showTip(t, cx, cy, hold) {
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'thing-tip';
            tip.setAttribute('aria-hidden', 'true');
            Object.assign(tip.style, { position: 'fixed', pointerEvents: 'none', zIndex: 5, padding: '3px 10px', borderRadius: '999px', fontSize: '12px',
                letterSpacing: '0.05em', color: '#fff8ea', background: 'rgba(16, 22, 60, 0.78)', border: '1px solid rgba(255, 242, 200, 0.35)',
                transform: 'translate(-50%, -100%)', whiteSpace: 'normal', textAlign: 'center', maxWidth: 'min(320px, 84vw)', width: 'max-content',
                lineHeight: '1.35', transition: 'opacity 0.15s', opacity: 0 });
            document.body.appendChild(tip);
        }
        clearTimeout(tipTimer);
        if (!t) { tip.style.opacity = 0; return; }
        tip.textContent = labelOf(t);
        tip.style.left = cx + 'px'; tip.style.top = cy - 4 + 'px'; tip.style.opacity = 1;
        const half = tip.offsetWidth / 2;
        tip.style.left = clamp(cx, half + 8, innerWidth - half - 8) + 'px';
        if (cy - tip.offsetHeight - 4 < 8) tip.style.top = cy + tip.offsetHeight + 18 + 'px';
        if (hold) tipTimer = setTimeout(() => { tip.style.opacity = 0; if (S) S.hover = null; }, hold);
    }

    /** One real button per thing, out of sight, so a keyboard or a screen reader can use them too. */
    function accessibleThings(T) {
        let box = document.getElementById('things');
        if (!box) {
            box = document.createElement('nav');
            box.id = 'things'; box.setAttribute('aria-label', 'Things in the room');
            Object.assign(box.style, { position: 'fixed', left: '-9999px', top: 0 });
            document.body.appendChild(box);
        }
        box.textContent = '';
        const seen = new Set();
        for (const t of T) {
            if (t.hit) continue;
            const name = labelOf(t);
            if (seen.has(name)) continue;
            seen.add(name);
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = name;
            b.addEventListener('click', () => { t.act(); b.textContent = labelOf(t); });
            b.addEventListener('focus', () => { S.hover = t; });
            b.addEventListener('blur', () => { if (S.hover === t) S.hover = null; });
            box.appendChild(b);
        }
    }

    // A press on a phone lights up what the finger is on before it lifts; moving
    // off into a drag lets it go. The tap acts on what was lit.
    let down = null;
    const tapSlop = type => (type === 'mouse' ? 0 : FINGER);
    addEventListener('pointerdown', e => {
        down = { x: e.clientX, y: e.clientY, type: e.pointerType || 'touch', id: e.pointerId, moved: false, t: null };
        if (!S || down.type === 'mouse' || !e.target || e.target.id !== 'room') return;
        down.t = pick(e.clientX, e.clientY, FINGER);
        S.hover = down.t;
    });
    addEventListener('pointermove', e => {
        if (!S) return;
        if (e.pointerType !== 'mouse') {
            if (down && e.pointerId === down.id && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) {
                down.moved = true;
                if (S.hover === down.t) S.hover = null;
            }
            return;
        }
        const onRoom = e.target && e.target.id === 'room', t = onRoom ? pick(e.clientX, e.clientY) : null;
        S.hover = t;
        if (onRoom) e.target.style.cursor = t ? 'pointer' : '';
        showTip(t, e.clientX, e.clientY - 6);
    });
    addEventListener('pointercancel', () => { if (down && S && S.hover === down.t) S.hover = null; down = null; });
    addEventListener('click', e => {
        if (!S || !e.target || e.target.id !== 'room') return;
        const type = (down && down.type) || e.pointerType || 'mouse';
        if (down && (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10)) return;
        const t = (down && down.t) || pick(e.clientX, e.clientY, tapSlop(type));
        if (!t) return;
        t.act();
        S.hover = t;
        showTip(t, e.clientX, e.clientY - 6, type === 'mouse' ? 0 : Math.max(1400, labelOf(t).length * 60));
    });

    // Little pixel glyphs: a note, a heart, a z.
    const GLYPH = {
        note: ['..XX', '..X.', '..X.', 'XXX.', 'XX..'],
        heart: ['.X.X.', 'XXXXX', '.XXX.', '..X..'],
        z: ['XXX', '.X.', 'XXX']
    };
    function glyph(o, g, x, y, c) {
        o.fillStyle = c;
        GLYPH[g].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') o.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1); });
    }

    /** The things and what they give off: notes, hearts, z's, the laptop's screen, and now and then a sparkle. */
    function drawThings(o, t) {
        for (const th of S.drawThings) {
            const c = th.sprite();
            if (S.hover === th) o.drawImage(c.outline, c.x - 1, c.y - 1);
            o.drawImage(c.canvas, c.x, c.y);
            if (th.id === 'laptop') screen(o, t, S.hover === th);
        }
        if (S.hover && S.hover.box) { const b = S.hover.box(); if (b) { o.fillStyle = '#fff2c8'; o.fillRect(b.x0 - 1, b.y0 - 2, b.x1 - b.x0 + 2, 1); } }
        // Notes rise from the radio while the sound is on.
        const rc = S.things.radio.sprite();
        if (Stage.Sound.on && (!Stage.Sound.scape || Stage.Sound.scape.station) && t > S.nextNote) { S.notes.push({ t0: t, x: rc.x + rc.w * (0.4 + Math.random() * 0.4), y: rc.y, ph: Math.random() * TAU }); S.nextNote = t + 0.9; }
        S.notes = S.notes.filter(n => t - n.t0 < 2.4 && t >= n.t0);
        for (const n of S.notes) { const k = (t - n.t0) / 2.4; glyph(o, 'note', n.x + Math.sin(t * 2 + n.ph) * 2, n.y - 6 - k * 16, k < 0.7 ? '#ffe2a6' : '#c8a8b8'); }
        // The cat: z's while she sleeps, hearts when she is petted.
        if (S.things.cat.until > t) {
            S.hearts = S.hearts.filter(h => t - h.t0 < 1.6);
            for (const h of S.hearts) if (t >= h.t0) { const k = (t - h.t0) / 1.6; glyph(o, 'heart', S.catHead.awake.x - 2 + h.dx, S.catHead.awake.y - 4 - k * 10, k < 0.6 ? '#ff8aa4' : '#d86a8a'); }
        } else {
            const k = (t % 2.6) / 2.6;
            glyph(o, 'z', S.catHead.sleep.x + 3 + k * 4, S.catHead.sleep.y - 2 - k * 8, k < 0.6 ? '#fff2d0' : '#c8b0a8');
        }
        // A sparkle on one thing at a time, so a phone (which has no hover) still shows what can be touched.
        if (t > S.nextTwinkle) { const list = S.drawThings; S.twinkle = { th: list[Math.floor(Math.random() * list.length)], t0: t }; S.nextTwinkle = t + 2.5 + Math.random() * 2; }
        if (S.twinkle && t - S.twinkle.t0 < 0.9 && S.twinkle.th !== S.hover) {
            const c = S.twinkle.th.sprite(), k = (t - S.twinkle.t0) / 0.9, r = k < 0.33 || k > 0.66 ? 1 : 2;
            const x = c.x + c.w - 1, y = c.y + 1;
            o.fillStyle = '#ffe9a8';
            for (let i = 1; i <= r; i++) { o.fillRect(x + i, y, 1, 1); o.fillRect(x - i, y, 1, 1); o.fillRect(x, y + i, 1, 1); o.fillRect(x, y - i, 1, 1); }
            o.fillStyle = '#fffdf2'; o.fillRect(x, y, 1, 1);
        }
    }

    // The laptop screen: an editor with code typing itself, scrolling as it fills.
    const CODE = (() => {
        const r = rng(2024), cols = ['#ff7aa8', '#ffd27a', '#7ad8ff', '#a8f0a0', '#c8ccf0', '#c8ccf0'];
        return Array.from({ length: 48 }, () => {
            const indent = Math.floor(r() * 4) * 2, segs = [];
            let n = r() < 0.15 ? 0 : 1 + Math.floor(r() * 4);
            while (n--) segs.push({ len: 2 + Math.floor(r() * 7), c: cols[Math.floor(r() * cols.length)] });
            return { indent, segs };
        });
    })();
    const CODE_LEN = CODE.map(l => l.indent + l.segs.reduce((a, g) => a + g.len + 1, 0) + 2);
    const CODE_TOTAL = CODE_LEN.reduce((a, b) => a + b, 0);
    function screen(o, t, lit) {
        const s = S.screen;
        if (!s) return;
        const w = s.x1 - s.x0, h = s.y1 - s.y0;
        if (w < 4 || h < 4) return;
        o.fillStyle = lit ? '#202a58' : '#161c3e'; o.fillRect(s.x0, s.y0, w, h);
        o.fillStyle = '#2a3468'; o.fillRect(s.x0, s.y0, w, 1);
        o.fillStyle = '#ff6a7a'; o.fillRect(s.x0 + 1, s.y0, 1, 1);
        o.fillStyle = '#ffd27a'; o.fillRect(s.x0 + 3, s.y0, 1, 1);
        const rows = Math.max(1, Math.floor((h - 2) / 2));
        let left = Math.floor(t * 9) % CODE_TOTAL, line = 0;
        while (left >= CODE_LEN[line]) { left -= CODE_LEN[line]; line++; }
        const first = Math.max(0, line - rows + 1);
        for (let i = first; i <= line; i++) {
            const y = s.y0 + 2 + (i - first) * 2;
            let x = s.x0 + 2 + CODE[i].indent, budget = i < line ? Infinity : left;
            for (const g of CODE[i].segs) {
                const n = Math.min(g.len, budget, s.x1 - 1 - x);
                if (n <= 0) break;
                o.fillStyle = g.c; o.fillRect(x, y, n, 1);
                x += g.len + 1; budget -= g.len + 1;
            }
            if (i === line && Math.sin(t * 6) > 0) { o.fillStyle = '#ffffff'; o.fillRect(Math.min(x, s.x1 - 2), y - 1, 1, 2); }
        }
    }

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
                const x = S.xL - c.w + ((((c.x0 - (S.xL - c.w)) + c.v * t) % (span + c.w * 2)) + span + c.w * 2) % (span + c.w * 2);
                o.drawImage(c.canvas, Math.round(x), c.y);
            }
            birds(o, t);
            moonRabbit(o, t, dark);
        });
        at(120, () => o.drawImage(S.far, 0, 0));
        at(9, () => o.drawImage(S.garden, 0, 0));
        for (const pl of S.plants) at(pl.z, () => plant(o, pl, t, w));
        at(6.5, () => { if (S.season === 'summer') flies(o, t); falling(o, t, w); });
        if (S.bamboo) at(S.bamboo.z, () => strips(o, t, w));
        at(R.zT, () => {
            o.drawImage(S.room, 0, 0);
            if (S.sunOn) dapple(o, t, w);
            blind(o, t, w);
            drawThings(o, t);
            if (S.sunOn) dust(o, t);
            chimeAt(o, t);
            lantern(o, t, w, 0);
            smoke(o, t, w);
        });

        // The hour's light over everything; then what glows on its own.
        const lit = lanternLit();
        if (dark > 0 || g.sat !== 1 || g.gain.some(v => v !== 1)) {
            const img = o.getImageData(0, 0, W, H), d = img.data;
            RT.apply(d, g, nightSwap(dark));
            const dr = shift(R.zT);
            if (lit) lamp(d, W, H, S.lanternAt.x + dr.x, S.lanternAt.y + dr.y + 6, H * 0.3, [255, 168, 84], 0.42);
            if (S.screen) lamp(d, W, H, (S.screen.x0 + S.screen.x1) / 2 + dr.x, (S.screen.y0 + S.screen.y1) / 2 + dr.y, H * 0.17, [110, 140, 255], dark * 0.3);
            o.putImageData(img, 0, 0);
        }
        at(R.zT, () => {
            if (dark > 0.1) screen(o, t, S.hover === S.things.laptop);
            if (lit) lantern(o, t, w, 1);
        });
        if (S.season === 'summer') fireflies(o, t, clamp((dark - 0.5) * 2, 0, 1));
        napStep(o, t);

        // Up to the screen at a whole-number scale, no smoothing.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(S.out.canvas, 0, 0, W * scale, H * scale);
    }

    /** A plant bending from its base, row by row in whole pixels. */
    function plant(o, pl, t, w) {
        const kick = pl.kick != null && t - pl.kick < 2 ? 0.1 * Math.exp(-(t - pl.kick) * 2.2) * Math.sin((t - pl.kick) * 15) : 0;
        const bend = pl.amp * (w * 0.6 + 0.4 * Math.sin(t * 1.3 + pl.ph) * (0.3 + w)) + kick;
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
        const sway = Math.sin(t * 0.9) * (1 + w * 3) * 0.8;
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
        if (S.blindRoll > 0.05) { o.fillStyle = '#7a5640'; o.fillRect(ax + Math.round(sway), by - 1, bx - ax, 3); o.fillStyle = '#e0b880'; o.fillRect(ax + Math.round(sway), by - 1, bx - ax, 1); }
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

    function stepView(dt) {
        const k = 1 - Math.exp(-dt * 3);
        view.x += (view.tx - view.x) * k;
        view.y += (view.ty - view.y) * k;
    }

    // For checks (scripts and the console): where each thing is on screen, and what state it is in.
    window.TatamiPixel = {
        // What the terminal can do in the room.
        nap: () => S && nap(),
        lantern: () => { if (!S) return false; S.lanternOn = !lanternLit(); return S.lanternOn; },
        pet: () => S && S.things.cat.act(),
        pickAt: (x, y, slop = FINGER) => { const t = pick(x, y, slop); return t ? t.id : null; },
        tune: () => (Stage.Sound.scape ? Stage.Sound.scape.tune() : ''),
        usagi: () => { if (!S || S.grade.dark < 0.15) return false; S.usagi = { t0: S.t }; return true; },
        things: () => (S && S.thingList ? S.thingList.filter(t => !t.plant).flatMap(t => {
            const d = S.shift(t.z);
            if (t.points) return t.points().map(q => ({ id: q.id, key: q.key, x: (q.x + d.x + 0.5) * A.scale, y: (q.y + d.y + 0.5) * A.scale }));
            const sp = t.spot && phoneish() && t.spot();
            if (sp) return { id: t.id, x: (sp.x + d.x + 0.5) * A.scale, y: (sp.y + d.y + 0.5) * A.scale };
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
            rustle: S.rustleT != null && S.t - S.rustleT < 1.5, lantern: lanternLit(), napping: !!S.nap, terminal: !!(window.Terminal && Terminal.isOpen), station: Stage.Sound.scape ? Stage.Sound.scape.station : null, moonTaps: S.moonTaps || 0, usagi: !!S.usagi, look: [+view.tx.toFixed(2), +view.ty.toFixed(2)], hour: +RT.hour().toFixed(2), season: S.season, sun: S.sunOn, dark: +S.grade.dark.toFixed(2) })
    };

    Stage.register('tatami-pixel', {
        caption: 'lazy summer days',
        ambience: 'cicadas',
        raw: true,
        bake,
        frame,
        step: (t, dt) => { chime.step(t, dt); stepView(dt); if (S) S.blindRoll += ((S.blindTarget || 0) - (S.blindRoll || 0)) * Math.min(1, dt * 2.5); }
    });
})();
