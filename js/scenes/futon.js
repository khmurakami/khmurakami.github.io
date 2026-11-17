/*
 * futon.js — lying on the futon, looking out of a big open window.
 *
 * Low and straight on, from the floor of a tatami room. The sliding glass
 * doors are pushed back, and the opening is nearly all sky: a cumulonimbus
 * climbing out of the top of the frame. On the balcony, a towel and a T-shirt
 * dry on the laundry pole and flap in the wind; past the railing, the town and
 * the hills sit low on the horizon. A sheer curtain breathes on the right.
 */
(function () {
    'use strict';
    const P = window.Painter;
    const Stage = window.Stage;
    const { TAU, lerp, clamp } = P;

    const R = {
        half: 2.9, zW: 3.2,          // the back wall
        win: 1.9,                    // half-width of the window
        sill: 0.32, head: 2.1, ceil: 2.4,
        balconyZ: 4.15, railH: 0.6, poleH: 1.95, poleZ: 3.95
    };
    const LINEN = { deep: [80, 104, 178], shadow: [124, 148, 212], body: [170, 190, 236], light: [208, 222, 250], white: [236, 243, 255] };
    const FOLIAGE = { deep: [16, 36, 92], shadow: [26, 56, 124], body: [40, 78, 156], light: [66, 108, 190], white: [100, 142, 214] };

    let L = null, cam = null, S = null;
    const chime = Stage.makeChime();

    function makeCamera(W, H) {
        const portrait = H > W * 1.05;
        const f = portrait ? H * 0.72 : Math.max(W * 0.58, H * 0.9);
        const ye = H * (portrait ? 0.48 : 0.62);
        const cx = W / 2;
        const camH = 0.55;
        const p = (x, y, z) => ({ x: cx + (x * f) / z, y: ye - ((y - camH) * f) / z });
        return { f, ye, cx, camH, portrait, p };
    }

    function quad(g, pts) {
        g.beginPath();
        pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
    }
    function paste(g, c, alpha = 1) { g.globalAlpha = alpha; g.drawImage(c.canvas, c.x, c.y, c.w, c.h); g.globalAlpha = 1; }

    // ── Bake ─────────────────────────────────────────────────────────────

    function bake(L0) {
        L = L0;
        cam = makeCamera(L.W, L.H);
        const { p } = cam;
        S = {};
        S.top = p(0, R.head, R.zW).y;
        S.bottom = p(0, R.sill, R.zW).y;
        S.xL = p(-R.win, 0, R.zW).x;
        S.xR = p(R.win, 0, R.zW).x;

        S.sky = bakeSky();
        S.clouds = bakeClouds(P.rng(2024));
        S.view = bakeView(P.rng(9));
        S.room = bakeRoom(P.rng(41));
        S.over = P.layer(L.W, L.H, L.dpr);
        P.vignette(S.over.g, L.W, L.H, { strength: 0.5 });

        const r = P.rng(3);
        S.dust = Array.from({ length: 44 }, () => ({ x: r(), y: r(), z: 0.4 + r() * 0.6, ph: r() * TAU, sp: 0.2 + r() * 0.5 }));
        S.birds = null; S.nextBirds = 5;
    }

    function bakeSky() {
        const { W, H, dpr } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const sg = g.createLinearGradient(0, S.top, 0, cam.ye);
        sg.addColorStop(0, '#0f37b8');
        sg.addColorStop(0.4, '#215fe6');
        sg.addColorStop(0.82, '#5f96f4');
        sg.addColorStop(1, '#b4cefd');
        g.fillStyle = sg;
        g.fillRect(0, 0, W, H);
        return K.canvas;
    }

    function bakeClouds(r) {
        const { dpr } = L;
        const list = [];
        const sky = cam.ye - S.top;
        const open = S.xR - S.xL;
        const k = cam.portrait ? 1.6 : 1;

        // The main tower, far too tall for the window.
        const tw = open * 0.5 * k;
        const tower = P.cloud(P.towerBillows(r, cam.cx - open * 0.04, cam.ye + 6, tw, sky * 1.35), { dpr, seed: 14, flatBase: cam.ye + 4, detail: 2, haze: 0.18 });
        list.push({ ...tower, v: 0.7, alpha: 1 });
        // A second, further back, to the right.
        const t2 = P.cloud(P.towerBillows(r, cam.cx + open * 0.34, cam.ye + 4, tw * 0.5, sky * 0.7), { dpr, seed: 19, flatBase: cam.ye + 2, detail: 2, haze: 0.35 });
        list.unshift({ ...t2, v: 0.5, alpha: 0.85 });
        // A bank of small cumulus along the horizon.
        for (let i = 0; i < 7; i++) {
            const w = open * (0.05 + r() * 0.07);
            const cx = S.xL + open * (i / 6) + (r() - 0.5) * open * 0.08;
            const cy = cam.ye - sky * (0.02 + r() * 0.06);
            const c = P.cloud(P.puffBillows(r, cx, cy, w), { dpr, seed: 60 + i, flatBase: cy + w * 0.06, detail: 1, haze: 0.45 });
            list.unshift({ ...c, v: 1.2 + r(), alpha: 0.8 });
        }
        // Loose puffs up high, closer and quicker.
        for (let i = 0; i < 3; i++) {
            const w = open * (0.06 + r() * 0.05) * k;
            const cx = S.xL + open * (0.12 + i * 0.38);
            const cy = S.top + sky * (0.12 + r() * 0.2);
            const c = P.cloud(P.puffBillows(r, cx, cy, w), { dpr, seed: 80 + i, flatBase: cy + w * 0.07, detail: 2, haze: 0.1 });
            list.push({ ...c, v: 3 + r() * 3, alpha: 1 });
        }
        list.forEach(c => { c.x0 = c.x; c.y0 = c.y; });
        return list;
    }

    /** Past the balcony: hills and town low on the horizon, then the railing. */
    function bakeView(r) {
        const { W, H, dpr, u, tex } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const { p, ye, f } = cam;
        const n = P.noise2D(5);

        // Far hills.
        g.beginPath();
        g.moveTo(-10, ye + 2);
        for (let x = -10; x <= W + 10; x += 4) g.lineTo(x, ye - f * 0.035 * (0.3 + n(x * 0.004, 2, 4) * 1.1));
        g.lineTo(W + 10, ye + 2);
        g.closePath();
        g.fillStyle = '#7f9fe2';
        g.fill();

        // The town below, roofs packed together, getting darker and nearer.
        g.fillStyle = '#4c72c8';
        g.fillRect(0, ye, W, H - ye);
        for (let row = 0; row < 4; row++) {
            const y = ye + row * f * 0.012;
            const shade = ['#6085d4', '#4f75c8', '#3f63b8', '#3254a6'][row];
            let x = -20 + r() * 30;
            while (x < W + 20) {
                const w = f * (0.02 + r() * 0.025) * (1 + row * 0.35);
                const h = f * (0.008 + r() * 0.008) * (1 + row * 0.3);
                g.fillStyle = shade;
                g.beginPath();
                g.moveTo(x, y + h * 1.4);
                g.lineTo(x + w * 0.2, y);
                g.lineTo(x + w * 0.8, y);
                g.lineTo(x + w, y + h * 1.4);
                g.closePath();
                g.fill();
                g.fillStyle = 'rgba(200,220,255,0.35)';
                g.fillRect(x + w * 0.2, y, w * 0.6, 1);
                x += w * (0.85 + r() * 0.4);
            }
        }
        // Treetops between the houses.
        for (let i = 0; i < 6; i++) {
            const cx = W * r(), cy = ye + f * (0.01 + r() * 0.03);
            const c = P.cloud(P.clumpBillows(r, cx, cy, f * (0.03 + r() * 0.03), f * 0.012, f * 0.006, f * 0.014, 2), { dpr, seed: 120 + i, tones: FOLIAGE, rough: 0.3, blend: 0.12, edgeFreq: 0.1 });
            paste(g, c);
        }
        // Haze over the far side.
        const hz = g.createLinearGradient(0, ye - f * 0.04, 0, ye + f * 0.04);
        hz.addColorStop(0, 'rgba(190,212,255,0)');
        hz.addColorStop(0.5, 'rgba(190,212,255,0.35)');
        hz.addColorStop(1, 'rgba(190,212,255,0)');
        g.fillStyle = hz;
        g.fillRect(0, ye - f * 0.04, W, f * 0.08);

        // Balcony floor.
        const bf0 = p(0, R.sill - 0.02, R.zW).y, bf1 = p(0, R.sill - 0.02, R.balconyZ).y;
        g.fillStyle = '#2e4590';
        g.fillRect(0, bf1, W, H - bf1);
        g.fillStyle = 'rgba(170,200,255,0.4)';
        g.fillRect(0, bf1, W, 1.5);

        // Railing: a top rail, a lower rail, and balusters.
        const top = p(0, R.railH + R.sill, R.balconyZ).y, low = p(0, R.sill + 0.12, R.balconyZ).y;
        const bw = Math.max(1, (0.018 * f) / R.balconyZ);
        g.fillStyle = '#1b2b6a';
        for (let x = -6; x <= 6; x += 0.11) {
            const sx = p(x, 0, R.balconyZ).x;
            g.fillRect(sx - bw / 2, top, bw, bf1 - top);
        }
        g.fillRect(0, top - bw * 1.6, W, bw * 2.6);
        g.fillRect(0, low, W, bw * 1.4);
        g.fillStyle = 'rgba(180,205,255,0.55)';
        g.fillRect(0, top - bw * 1.6, W, 1);

        // The laundry pole and its brackets.
        const pole = p(0, R.poleH, R.poleZ);
        g.fillStyle = '#9cb2e8';
        g.fillRect(0, pole.y - 1.5, W, Math.max(2.5, u * 0.35));
        g.fillStyle = '#1b2b6a';
        for (const x of [-2.3, 2.3]) {
            const a = p(x, R.poleH, R.poleZ), b = p(x, R.head + 0.15, R.zW + 0.1);
            g.fillRect(a.x - 2, b.y, 4, a.y - b.y + 4);
        }

        if (tex) P.grain(g, tex, W, H, { alpha: 0.1, mode: 'soft-light' });
        if (!S.brush) S.brush = P.brushTexture(512, 7);
        P.grain(g, S.brush, W, H, { alpha: 0.6, mode: 'overlay' });
        return K.canvas;
    }

    function bakeRoom(r) {
        const { W, H, dpr, u, tex } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const { p, f, cx, ye } = cam;
        const zN = 0.5;

        // Back wall in shadow, lighter where the window throws light on it.
        g.fillStyle = '#121c4c';
        g.fillRect(0, 0, W, H);
        const glow = P.layer(W, H, dpr);
        glow.g.fillStyle = '#8fb6ff';
        glow.g.fillRect(S.xL, S.top, S.xR - S.xL, S.bottom - S.top);
        P.bloom(g, glow.canvas, {
            radius: u * 26, alpha: 0.3, w: W, h: H,
            clip: c => { c.rect(0, 0, W, H); c.rect(S.xL, S.top, S.xR - S.xL, S.bottom - S.top); }
        });
        if (tex) P.grain(g, tex, W, H, { alpha: 0.3, mode: 'soft-light', scale: 2 });

        // Ceiling and lintel.
        const yC = p(0, R.ceil, R.zW).y;
        const cg = g.createLinearGradient(0, 0, 0, yC);
        cg.addColorStop(0, '#080e2e');
        cg.addColorStop(1, '#17245c');
        g.fillStyle = cg;
        g.fillRect(0, 0, W, yC);
        g.strokeStyle = 'rgba(0,0,15,0.5)';
        g.lineWidth = 1;
        for (let x = -R.half; x <= R.half; x += 0.4) {
            const a = p(x, R.ceil, R.zW), b = p(x, R.ceil, zN);
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
        g.fillStyle = '#0c1438';
        g.fillRect(0, yC, W, Math.max(3, u * 0.7));

        // Floor: tatami at a shallow angle.
        const yF = p(0, 0, R.zW).y;
        g.fillStyle = '#26407c';
        g.fillRect(0, yF, W, H - yF);
        const rows = [[2.3, R.zW], [1.4, 2.3], [0.5, 1.4]];
        rows.forEach(([z0, z1], i) => {
            const off = i % 2 ? 0.9 : 0;
            for (let x = -6 + off; x < 6; x += 1.8) {
                const pts = [p(x, 0, z0), p(x + 1.8, 0, z0), p(x + 1.8, 0, z1), p(x, 0, z1)];
                quad(g, pts);
                const tg = g.createLinearGradient(0, pts[0].y, 0, pts[2].y);
                tg.addColorStop(0, '#1b3068');
                tg.addColorStop(1, '#3d5f9e');
                g.fillStyle = tg;
                g.fill();
                g.save(); quad(g, pts); g.clip();
                let last = Infinity;
                for (let z = z0 + 0.02; z < z1; z += 0.02) {
                    const y = p(0, 0, z).y;
                    if (last - y < 1.8) continue;
                    last = y;
                    g.strokeStyle = Math.round(z * 50) % 2 ? 'rgba(170,200,255,0.06)' : 'rgba(0,0,25,0.1)';
                    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
                }
                g.restore();
                g.fillStyle = '#0b1440';
                quad(g, [p(x, 0, z0), p(x + 1.8, 0, z0), p(x + 1.8, 0, z0 + 0.035), p(x, 0, z0 + 0.035)]); g.fill();
                quad(g, [p(x, 0, z1 - 0.035), p(x + 1.8, 0, z1 - 0.035), p(x + 1.8, 0, z1), p(x, 0, z1)]); g.fill();
                g.strokeStyle = 'rgba(0,0,20,0.5)';
                g.beginPath(); g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[3].x, pts[3].y); g.stroke();
            }
        });
        // Skirting where wall meets floor.
        g.fillStyle = '#0a1236';
        g.fillRect(0, yF - u * 0.6, W, u * 0.6);

        // The window: cut through to the view, then framed.
        g.clearRect(S.xL, S.top, S.xR - S.xL, S.bottom - S.top);
        const fr = Math.max(4, (0.06 * f) / R.zW);
        g.fillStyle = '#1a275f';
        g.fillRect(S.xL - fr, S.top - fr, S.xR - S.xL + fr * 2, fr);
        g.fillRect(S.xL - fr, S.top, fr, S.bottom - S.top);
        g.fillRect(S.xR, S.top, fr, S.bottom - S.top);
        // Sill and tracks.
        g.fillStyle = '#2a3f86';
        g.fillRect(S.xL - fr * 1.5, S.bottom, S.xR - S.xL + fr * 3, (yF - S.bottom) * 0.35);
        g.fillStyle = 'rgba(200,220,255,0.6)';
        g.fillRect(S.xL - fr * 1.5, S.bottom, S.xR - S.xL + fr * 3, 1.5);
        g.fillStyle = '#16225a';
        g.fillRect(S.xL - fr * 1.5, S.bottom + (yF - S.bottom) * 0.35, S.xR - S.xL + fr * 3, (yF - S.bottom) * 0.65);
        // Light along the inner edges.
        g.fillStyle = 'rgba(160,190,255,0.6)';
        g.fillRect(S.xL - 1, S.top, 1.5, S.bottom - S.top);
        g.fillRect(S.xL, S.top - 1, S.xR - S.xL, 1.5);

        // The glass doors, slid back to the right.
        const gx0 = p(R.win - 1.25, 0, R.zW).x;
        g.fillStyle = 'rgba(170,200,255,0.1)';
        g.fillRect(gx0, S.top, S.xR - gx0, S.bottom - S.top);
        g.save();
        g.beginPath(); g.rect(gx0, S.top, S.xR - gx0, S.bottom - S.top); g.clip();
        for (const [o, w0, a] of [[0.1, 0.08, 0.14], [0.34, 0.03, 0.1], [0.62, 0.06, 0.08]]) {
            const x0 = gx0 + (S.xR - gx0) * o, ww = (S.xR - gx0) * w0 * 2;
            const sh = (S.bottom - S.top) * 0.3;
            const rg = g.createLinearGradient(x0, 0, x0 + ww, 0);
            rg.addColorStop(0, 'rgba(235,243,255,0)');
            rg.addColorStop(0.5, `rgba(235,243,255,${a})`);
            rg.addColorStop(1, 'rgba(235,243,255,0)');
            g.fillStyle = rg;
            quad(g, [{ x: x0, y: S.bottom }, { x: x0 + ww, y: S.bottom }, { x: x0 + ww + sh, y: S.top }, { x: x0 + sh, y: S.top }]);
            g.fill();
        }
        g.restore();
        g.fillStyle = '#1a275f';
        g.fillRect(gx0 - fr * 0.4, S.top, fr * 0.8, S.bottom - S.top);
        g.fillRect(gx0 + (S.xR - gx0) * 0.5 - fr * 0.3, S.top, fr * 0.6, S.bottom - S.top);
        g.fillStyle = 'rgba(160,190,255,0.5)';
        g.fillRect(gx0 - fr * 0.4, S.top, 1, S.bottom - S.top);

        // On the left wall: a shelf with a speaker and a plant, a guitar below.
        if (S.xL > W * 0.12) {
            shelf(g, S.xL * 0.5, p(0, 1.45, R.zW).y, S.xL * 0.62, u);
        }
        guitar(g, cam.portrait ? -1.3 : -2.45, 3.0);
        pig(g, cam.portrait ? -0.75 : -1.25, 2.75);
        futon(g, r);

        if (tex) P.grain(g, tex, W, H, { alpha: 0.18, mode: 'soft-light', scale: 1.6 });
        if (!S.brush) S.brush = P.brushTexture(512, 7);
        P.grain(g, S.brush, W, H, { alpha: 0.65, mode: 'overlay' });
        return K.canvas;
    }

    function shelf(g, cx, y, w, u) {
        g.fillStyle = '#0b1338';
        g.fillRect(cx - w / 2, y, w, u * 0.9);
        g.fillStyle = 'rgba(150,180,250,0.3)';
        g.fillRect(cx - w / 2, y, w, 1);
        // A small speaker.
        const sw = w * 0.26, sh = sw * 1.5;
        g.fillStyle = '#1c2a68';
        g.fillRect(cx - w * 0.36, y - sh, sw, sh);
        g.fillStyle = '#0a1234';
        g.beginPath(); g.arc(cx - w * 0.36 + sw / 2, y - sh * 0.36, sw * 0.3, 0, TAU); g.fill();
        g.beginPath(); g.arc(cx - w * 0.36 + sw / 2, y - sh * 0.78, sw * 0.14, 0, TAU); g.fill();
        g.fillStyle = 'rgba(150,180,250,0.35)';
        g.fillRect(cx - w * 0.36 + sw - 1, y - sh, 1, sh);
        // Records leaning.
        for (let i = 0; i < 4; i++) {
            g.fillStyle = ['#22357a', '#2c438f', '#1b2b68', '#34509f'][i];
            g.save(); g.translate(cx + w * 0.02 + i * u * 0.5, y); g.rotate(-0.08 * i);
            g.fillRect(0, -sw * 1.2, u * 0.4, sw * 1.2); g.restore();
        }
        // Plant.
        const px = cx + w * 0.32;
        g.fillStyle = '#2a3f88';
        g.beginPath(); g.moveTo(px - sw * 0.35, y - sw * 0.6); g.lineTo(px + sw * 0.35, y - sw * 0.6); g.lineTo(px + sw * 0.25, y); g.lineTo(px - sw * 0.25, y); g.fill();
        g.strokeStyle = '#2b55a6';
        g.lineWidth = Math.max(2, u * 0.45);
        g.lineCap = 'round';
        for (const a of [-0.9, -0.4, 0.1, 0.6, 1.0]) {
            g.beginPath();
            g.moveTo(px, y - sw * 0.6);
            g.quadraticCurveTo(px + Math.sin(a) * sw * 0.6, y - sw * 1.4, px + Math.sin(a) * sw * 1.1, y - sw * (0.9 + Math.cos(a) * 0.5));
            g.stroke();
        }
    }

    function guitar(g, x, z) {
        const { p } = cam;
        const { u } = L;
        const base = p(x, 0.02, z), top = p(x + 0.2, 1.02, z + 0.06);
        const s = Math.hypot(top.x - base.x, top.y - base.y);
        const ang = Math.atan2(top.x - base.x, base.y - top.y);
        g.save();
        g.translate(base.x, base.y);
        g.rotate(ang);
        g.fillStyle = '#1b2a6a';
        g.beginPath();
        g.ellipse(0, -s * 0.19, s * 0.2, s * 0.19, 0, 0, TAU);
        g.ellipse(0, -s * 0.42, s * 0.155, s * 0.14, 0, 0, TAU);
        g.fill();
        g.fillRect(-s * 0.13, -s * 0.44, s * 0.26, s * 0.2);
        g.strokeStyle = 'rgba(150,180,250,0.55)';
        g.lineWidth = Math.max(1, u * 0.25);
        g.beginPath(); g.ellipse(0, -s * 0.19, s * 0.2, s * 0.19, 0, -1.2, 0.6); g.stroke();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.arc(0, -s * 0.36, s * 0.055, 0, TAU); g.fill();
        g.fillStyle = '#121c4c';
        g.fillRect(-s * 0.025, -s * 0.92, s * 0.05, s * 0.4);
        g.fillRect(-s * 0.04, -s * 1.02, s * 0.08, s * 0.11);
        g.restore();
    }

    function pig(g, x, z) {
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
        g.fillStyle = '#5a75bd';
        g.beginPath(); g.ellipse(-s * 1.05, -s * 0.05, s * 0.3, s * 0.5, 0, 0, TAU); g.fill();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.ellipse(-s * 1.12, -s * 0.05, s * 0.18, s * 0.36, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffb27a';
        g.beginPath(); g.arc(-s * 1.12, s * 0.05, s * 0.05, 0, TAU); g.fill();
        g.fillStyle = 'rgba(220,232,255,0.45)';
        g.beginPath(); g.ellipse(-s * 0.2, -s * 0.45, s * 0.45, s * 0.14, -0.2, 0, TAU); g.fill();
        g.fillStyle = '#0a1234';
        g.beginPath(); g.arc(-s * 0.55, -s * 0.2, s * 0.06, 0, TAU); g.fill();
        g.restore();
    }

    /**
     * The futon, laid across the room at a slight angle: mattress, a pillow at
     * the window end, the blanket shoved off to the other.
     */
    function futon(g, r) {
        const { p, f } = cam;
        const { u, dpr } = L;
        const ang = cam.portrait ? 0.12 : 0.18;
        const cxw = cam.portrait ? 0.15 : 0.35, czw = 1.75;
        const len = 2.0, wid = 1.0, top = 0.08;
        const corner = (a, b, y) => {
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const x = cxw + a * ca - b * sa, z = czw + a * sa + b * ca;
            return p(x, y, z);
        };
        const A = corner(-len / 2, -wid / 2, top), B = corner(len / 2, -wid / 2, top);
        const Cc = corner(len / 2, wid / 2, top), D = corner(-len / 2, wid / 2, top);
        // Front side of the mattress.
        quad(g, [corner(-len / 2, -wid / 2, 0), corner(len / 2, -wid / 2, 0), B, A]);
        g.fillStyle = '#4f68b0';
        g.fill();
        // Top.
        quad(g, [A, B, Cc, D]);
        const mg = g.createLinearGradient(0, A.y, 0, D.y);
        mg.addColorStop(0, '#7088c8');
        mg.addColorStop(1, '#b3c5ee');
        g.fillStyle = mg;
        g.fill();
        g.strokeStyle = 'rgba(60,90,170,0.55)';
        g.lineWidth = Math.max(1, u * 0.2);
        quad(g, [corner(-len / 2 + 0.04, -wid / 2 + 0.04, top), corner(len / 2 - 0.04, -wid / 2 + 0.04, top), corner(len / 2 - 0.04, wid / 2 - 0.04, top), corner(-len / 2 + 0.04, wid / 2 - 0.04, top)]);
        g.stroke();

        // Pillow, at the right-hand end.
        {
            const pa = corner(len / 2 - 0.42, -0.28, top), pb = corner(len / 2 - 0.08, 0.28, top + 0.13);
            const cxp = (pa.x + pb.x) / 2, w = (0.55 * f) / (czw + 0.4), h = (0.08 * f) / czw;
            const yb = pa.y;
            g.fillStyle = 'rgba(0,0,30,0.3)';
            g.beginPath(); g.ellipse(cxp, yb + 2, w * 0.55, h * 0.35, 0, 0, TAU); g.fill();
            g.beginPath();
            g.roundRect(cxp - w / 2, yb - h * 1.5, w, h * 1.5, h * 0.6);
            const pg = g.createLinearGradient(0, yb - h * 1.5, 0, yb);
            pg.addColorStop(0, '#dfe8fc');
            pg.addColorStop(1, '#8aa0da');
            g.fillStyle = pg;
            g.fill();
            g.strokeStyle = 'rgba(90,115,190,0.5)';
            g.lineWidth = 1;
            g.beginPath(); g.moveTo(cxp - w * 0.42, yb - h * 0.75); g.quadraticCurveTo(cxp, yb - h * 0.9, cxp + w * 0.42, yb - h * 0.75); g.stroke();
        }

        // The blanket, pushed down over the left end and rumpled.
        {
            const a0 = -len / 2 - 0.06, a1 = -len / 2 + 0.85;
            const b0 = -wid / 2 - 0.07, b1 = wid / 2 + 0.07;
            const y = top + 0.03;
            const steps = 8;
            const edge = [];
            for (let i = 0; i <= steps; i++) {
                const k = i / steps;
                const q = corner(a1 + Math.sin(k * 7.1 + 0.6) * 0.06, lerp(b0, b1, k), y + 0.02);
                edge.push(q);
            }
            g.beginPath();
            const s0 = corner(a0, b0, y);
            g.moveTo(s0.x, s0.y);
            g.lineTo(edge[0].x, edge[0].y);
            for (let i = 1; i <= steps; i++) {
                const m = { x: (edge[i - 1].x + edge[i].x) / 2, y: (edge[i - 1].y + edge[i].y) / 2 - u * 1.2 };
                g.quadraticCurveTo(m.x, m.y, edge[i].x, edge[i].y);
            }
            const s1 = corner(a0, b1, y);
            g.lineTo(s1.x, s1.y);
            g.closePath();
            const bgr = g.createLinearGradient(edge[steps].x, 0, s0.x, 0);
            bgr.addColorStop(0, '#9dbdf0');
            bgr.addColorStop(1, '#4068b8');
            g.fillStyle = bgr;
            g.fill();
            g.save();
            g.clip();
            g.strokeStyle = 'rgba(230,240,255,0.22)';
            g.lineWidth = Math.max(2, u * 0.7);
            for (let k = 0.12; k < 1; k += 0.22) {
                const pa = corner(a0, lerp(b0, b1, k), y), pb = corner(a1, lerp(b0, b1, k), y);
                g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
            }
            for (let i = 0; i < 6; i++) {
                const k = 0.08 + i * 0.17 + (r() - 0.5) * 0.04;
                const pa = corner(a1 - 0.02, lerp(b0, b1, k), y), pb = corner(a0, lerp(b0, b1, k + (r() - 0.5) * 0.25), y);
                g.strokeStyle = 'rgba(10,25,80,0.35)';
                g.lineWidth = Math.max(1.5, u * 0.5);
                g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + u * 1.5, pb.x, pb.y); g.stroke();
                g.strokeStyle = 'rgba(220,235,255,0.25)';
                g.lineWidth = Math.max(1, u * 0.25);
                g.beginPath(); g.moveTo(pa.x, pa.y - u * 0.6); g.quadraticCurveTo((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + u * 0.9, pb.x, pb.y - u * 0.6); g.stroke();
            }
            g.restore();
            g.strokeStyle = 'rgba(225,236,255,0.7)';
            g.lineWidth = Math.max(1.5, u * 0.35);
            g.beginPath();
            g.moveTo(edge[0].x, edge[0].y);
            for (let i = 1; i <= steps; i++) {
                const m = { x: (edge[i - 1].x + edge[i].x) / 2, y: (edge[i - 1].y + edge[i].y) / 2 - u * 1.2 };
                g.quadraticCurveTo(m.x, m.y, edge[i].x, edge[i].y);
            }
            g.stroke();
        }

        // A manga left open, face down, and a phone.
        {
            const m = corner(0.25, -0.15, top + 0.01);
            const s = (0.14 * f) / czw;
            g.save(); g.translate(m.x, m.y); g.scale(1, 0.4); g.rotate(0.3);
            g.fillStyle = '#e1e9fb';
            g.beginPath(); g.moveTo(-s, -s * 0.7); g.lineTo(0, -s * 0.5); g.lineTo(s, -s * 0.7); g.lineTo(s, s * 0.7); g.lineTo(0, s * 0.9); g.lineTo(-s, s * 0.7); g.closePath(); g.fill();
            g.fillStyle = '#2c4aa0';
            g.fillRect(-s * 0.8, -s * 0.3, s * 0.5, s * 0.4);
            g.strokeStyle = 'rgba(30,50,120,0.6)';
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(0, s * 0.9); g.stroke();
            g.restore();
            const ph = corner(0.6, 0.22, top + 0.01);
            g.save(); g.translate(ph.x, ph.y); g.scale(1, 0.4); g.rotate(-0.4);
            g.fillStyle = '#0d1640';
            g.beginPath(); g.roundRect(-s * 0.3, -s * 0.6, s * 0.6, s * 1.2, s * 0.1); g.fill();
            g.restore();
        }
    }

    // ── Frame ────────────────────────────────────────────────────────────

    function frame(ctx, t) {
        const { W, H, u, still, tex } = L;
        const w = Stage.wind(t);

        ctx.drawImage(S.sky, 0, 0, W, H);
        for (const c of S.clouds) {
            const startX = S.xL - c.w - u * 4;
            const span = (S.xR - S.xL) + c.w + u * 8;
            const x = startX + ((((c.x0 - startX) + c.v * t) % span) + span) % span;
            ctx.globalAlpha = c.alpha;
            ctx.drawImage(c.canvas, x, c.y0, c.w, c.h);
        }
        ctx.globalAlpha = 1;
        drawBirds(ctx, t);
        ctx.drawImage(S.view, 0, 0, W, H);
        drawLaundry(ctx, t, w);
        ctx.drawImage(S.room, 0, 0, W, H);

        drawSun(ctx, t);
        drawChime(ctx, t);
        drawCurtain(ctx, t, w);
        drawSmoke(ctx, t, w);

        ctx.drawImage(S.over.canvas, 0, 0, W, H);
        if (tex) {
            const j = still ? 0 : Math.floor(t * 12) % 4;
            P.grain(ctx, tex, W, H, { alpha: 0.06, mode: 'overlay', ox: j * 37, oy: j * 53, keepAlpha: false });
        }
    }

    /** A towel and a T-shirt on the pole, filling and flapping with each gust. */
    function drawLaundry(ctx, t, w) {
        const { p, f } = cam;
        const { u } = L;
        const s = f / R.poleZ;
        const pole = p(0, R.poleH, R.poleZ);

        // Towel, folded over the pole.
        {
            const x0 = p(cam.portrait ? -0.75 : -1.25, 0, R.poleZ).x, x1 = x0 + 0.62 * s;
            const hgt = 0.55 * s;
            const lift = w * 0.25 * hgt;
            const flap = Math.sin(t * 2.4) * (0.02 + w * 0.06) * hgt;
            ctx.beginPath();
            ctx.moveTo(x0, pole.y);
            ctx.lineTo(x1, pole.y);
            const steps = 6;
            const bx1 = x1 + lift * 0.5 + flap, by1 = pole.y + hgt - lift;
            ctx.quadraticCurveTo(x1 + lift * 0.3, pole.y + hgt * 0.5, bx1, by1);
            for (let i = 1; i <= steps; i++) {
                const k = i / steps;
                const x = lerp(bx1, x0 + lift * 0.5 + flap * 0.6, k);
                const y = by1 + Math.sin(t * 3 + k * 6) * u * 0.5 * (0.3 + w);
                ctx.lineTo(x, y);
            }
            ctx.quadraticCurveTo(x0 + lift * 0.2, pole.y + hgt * 0.5, x0, pole.y);
            ctx.closePath();
            const tg = ctx.createLinearGradient(x0, 0, x1, 0);
            tg.addColorStop(0, '#c9d7f7');
            tg.addColorStop(1, '#9fb4e8');
            ctx.fillStyle = tg;
            ctx.fill();
            ctx.save(); ctx.clip();
            ctx.fillStyle = 'rgba(40,80,190,0.55)';
            ctx.fillRect(x0 - 10, pole.y + hgt * 0.62, x1 - x0 + 40, hgt * 0.07);
            ctx.fillRect(x0 - 10, pole.y + hgt * 0.74, x1 - x0 + 40, hgt * 0.03);
            ctx.fillStyle = 'rgba(20,40,110,0.25)';
            ctx.fillRect(x0 - 10, pole.y, x1 - x0 + 40, hgt * 0.12);
            ctx.restore();
        }

        // T-shirt on a hanger, turning on its hook.
        {
            const hx = p(cam.portrait ? 0.35 : 0.55, 0, R.poleZ).x;
            const sw = 0.5 * s, sh = 0.62 * s;
            const th = (w - 0.45) * 0.35 + Math.sin(t * 1.7) * 0.06 * (0.4 + w);
            ctx.save();
            ctx.translate(hx, pole.y);
            ctx.rotate(th);
            ctx.strokeStyle = '#1b2b6a';
            ctx.lineWidth = Math.max(1, u * 0.18);
            ctx.beginPath(); ctx.arc(0, -u * 0.2, u * 0.6, Math.PI, TAU * 0.95); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, u * 0.3); ctx.lineTo(0, sh * 0.08); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-sw * 0.5, sh * 0.16); ctx.lineTo(0, sh * 0.08); ctx.lineTo(sw * 0.5, sh * 0.16); ctx.stroke();
            const billow = Math.sin(t * 2.1 + 1) * w * sw * 0.08;
            ctx.beginPath();
            ctx.moveTo(-sw * 0.16, sh * 0.12);
            ctx.quadraticCurveTo(0, sh * 0.2, sw * 0.16, sh * 0.12);
            ctx.lineTo(sw * 0.5, sh * 0.17);
            ctx.lineTo(sw * 0.68 + billow, sh * 0.38);
            ctx.lineTo(sw * 0.48 + billow, sh * 0.44);
            ctx.lineTo(sw * 0.42 + billow, sh * 0.36);
            ctx.lineTo(sw * 0.44 + billow * 1.4, sh);
            ctx.lineTo(-sw * 0.44 + billow * 1.4, sh);
            ctx.lineTo(-sw * 0.42 + billow, sh * 0.36);
            ctx.lineTo(-sw * 0.48 + billow, sh * 0.44);
            ctx.lineTo(-sw * 0.68 + billow, sh * 0.38);
            ctx.lineTo(-sw * 0.5, sh * 0.17);
            ctx.closePath();
            const sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
            sg.addColorStop(0, '#2c4596');
            sg.addColorStop(1, '#1d3076');
            ctx.fillStyle = sg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(170,200,255,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawSun(ctx, t) {
        const { p } = cam;
        const { u } = L;
        const k = 0.88 + 0.12 * Math.sin(t * 0.06);
        // The window, laid on the tatami by the sun.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        quad(ctx, [p(-R.win, 0, R.zW), p(R.win, 0, R.zW), p(R.win + 0.5, 0, 2.35), p(-R.win + 0.5, 0, 2.35)]);
        const sg = ctx.createLinearGradient(0, p(0, 0, R.zW).y, 0, p(0, 0, 2.35).y);
        sg.addColorStop(0, `rgba(130,170,250,${0.32 * k})`);
        sg.addColorStop(1, `rgba(130,170,250,${0.1 * k})`);
        ctx.fillStyle = sg;
        ctx.fill();
        // Faint shafts.
        for (const [a, b, i] of [[-1.6, -0.7, 0], [-0.2, 0.5, 1], [0.9, 1.5, 2]]) {
            const pulse = 0.04 + 0.03 * Math.sin(t * 0.25 + i * 1.9);
            P.shaft(ctx, [p(a, 1.6, R.zW), p(b, 1.6, R.zW), p(b + 0.5, 0, 2.4), p(a + 0.5, 0, 2.4)], { alpha: pulse * k });
        }
        ctx.restore();

        // Dust.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const y0 = S.top, y1 = p(0, 0, 2.4).y;
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

    function drawChime(ctx, t) {
        const { u } = L;
        const hookX = lerp(S.xL, S.xR, cam.portrait ? 0.3 : 0.24);
        const scale = cam.f / R.zW;
        const R0 = 0.05 * scale;
        const str = 0.1 * scale;
        const bellTh = chime.th * 0.35, stripTh = chime.th;
        ctx.save();
        ctx.translate(hookX, S.top);
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
        ctx.strokeStyle = 'rgba(40,90,210,0.8)';
        ctx.lineWidth = Math.max(1, R0 * 0.12);
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * R0 * 0.5, by - R0 * 0.05, R0 * 0.24, Math.PI * 1.1, Math.PI * 1.95); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(-R0 * 0.5, by - R0 * 0.6, R0 * 0.14, R0 * 0.28, -0.6, 0, TAU); ctx.fill();
        ctx.translate(0, by);
        ctx.rotate(stripTh - bellTh);
        ctx.strokeStyle = 'rgba(16,28,72,0.9)';
        ctx.lineWidth = Math.max(1, u * 0.1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R0 * 1.9); ctx.stroke();
        const sw = R0 * 0.95, sh = R0 * 4.4;
        ctx.translate(0, R0 * 1.9);
        ctx.transform(1, 0, Math.sin(t * 3.1) * 0.08, 1, 0, 0);
        const pg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        pg.addColorStop(0, '#f2f6ff');
        pg.addColorStop(1, '#b7c9f2');
        ctx.fillStyle = pg;
        ctx.fillRect(-sw / 2, 0, sw, sh);
        ctx.restore();
    }

    /** A sheer curtain on the right, its free edge lifting into the room. */
    function drawCurtain(ctx, t, w) {
        const { p } = cam;
        const { u, W } = L;
        const top = S.top - u * 1.5;
        const bottom = p(0, 0.05, R.zW).y;
        const Hc = bottom - top;
        const x1 = Math.min(W + u * 2, S.xR + u * (cam.portrait ? 4 : 9));    // fixed edge, against the wall
        const x0 = S.xR - (S.xR - S.xL) * (cam.portrait ? 0.2 : 0.18);       // free edge
        const b = Hc * (0.05 + w * 0.15) + Math.sin(t * 1.1) * Hc * 0.012;
        const lift = Hc * w * 0.07;
        const wave = t * 1.6;
        function path(c) {
            c.beginPath();
            c.moveTo(x1, top);
            const gathers = 9;
            for (let i = 1; i <= gathers; i++) {
                const x = lerp(x1, x0, i / gathers);
                c.quadraticCurveTo(x + (x1 - x0) / gathers / 2, top + u * 0.9, x, top);
            }
            c.bezierCurveTo(x0 - b * 0.25, top + Hc * 0.35, x0 - b * 1.05, top + Hc * 0.72, x0 - b * 0.85, bottom - lift);
            const steps = 6;
            for (let i = 1; i <= steps; i++) {
                const s = i / steps;
                const x = lerp(x0 - b * 0.85, x1 - b * 0.12, s);
                const y = lerp(bottom - lift, bottom, s) + Math.sin(wave + s * 5) * u * 0.8 * (0.4 + w);
                const pxm = lerp(x0 - b * 0.85, x1 - b * 0.12, s - 0.5 / steps);
                c.quadraticCurveTo(pxm, y + u * 1.2 * Math.sin(wave + s * 7), x, y);
            }
            c.bezierCurveTo(x1 - b * 0.1, top + Hc * 0.66, x1, top + Hc * 0.3, x1, top);
            c.closePath();
        }
        path(ctx);
        const cg = ctx.createLinearGradient(0, top, 0, bottom);
        cg.addColorStop(0, 'rgba(214,226,255,0.55)');
        cg.addColorStop(1, 'rgba(214,226,255,0.4)');
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.rect(S.xL, S.top, S.xR - S.xL, S.bottom - S.top); ctx.clip();
        path(ctx);
        ctx.fillStyle = 'rgba(240,246,255,0.32)';
        ctx.fill();
        ctx.restore();
        ctx.save();
        path(ctx);
        ctx.clip();
        for (let i = 0; i <= 8; i++) {
            const s = i / 8;
            const xt = lerp(x1, x0, s), xb = lerp(x1 - b * 0.12, x0 - b * 0.85, s);
            const c1 = lerp(x1, x0 - b * 0.25, s), c2 = lerp(x1 - b * 0.1, x0 - b * 1.05, s);
            ctx.beginPath();
            ctx.moveTo(xt, top);
            ctx.bezierCurveTo(c1, top + Hc * 0.35, c2, top + Hc * 0.72, xb, bottom);
            ctx.strokeStyle = i % 2 ? 'rgba(96,128,210,0.3)' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = i % 2 ? u * 0.9 : u * 0.45;
            ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#0d163c';
        ctx.fillRect(x0 - u * 2, top - u * 0.7, x1 - x0 + u * 4, u * 0.8);
    }

    function drawSmoke(ctx, t, w) {
        const o = S.smokeFrom;
        if (!o) return;
        const { u } = L;
        const n = 34, rise = o.s * 0.1;
        ctx.save();
        ctx.lineCap = 'round';
        for (let strand = 0; strand < 2; strand++) {
            let px = o.x, py = o.y;
            for (let i = 1; i < n; i++) {
                const k = i / n;
                const curl = Math.sin(t * 1.2 - i * 0.32 + strand * 2) * i * 0.35 + Math.sin(t * 0.55 - i * 0.18) * i * 0.5;
                const x = o.x - i * o.s * 0.03 + curl * (o.s * 0.04) + w * i * i * 0.0012 * o.s * (strand ? 1.3 : 1);
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
            const y = S.top + (cam.ye - S.top) * (0.15 + r() * 0.4);
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

    Stage.register('futon', {
        caption: 'lazy summer days',
        ambience: 'cicadas',
        bake,
        frame,
        step: (t, dt) => chime.step(t, dt)
    });
})();
