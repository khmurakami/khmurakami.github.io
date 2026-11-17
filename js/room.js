/*
 * room.js — the summer room. The whole site.
 *
 * An upstairs room in a seaside town on a summer afternoon. The sliding window
 * is open: sea, a cumulonimbus building over it, a utility pole, a vine screen
 * of morning glories outside. A wind chime turns in the breeze and the curtain
 * breathes in and out.
 *
 * Painted with `Painter` (js/painter.js). Still parts (sky, town, room) are
 * painted once per screen size into cached layers; each frame only adds what
 * moves on top of them.
 */
(function () {
    'use strict';
    const P = window.Painter;
    const { TAU, lerp, clamp } = P;

    const canvas = document.getElementById('room');
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // `?still` freezes the scene at a fixed moment, for screenshots.
    const params = new URLSearchParams(location.search);
    const still = params.has('still');

    const C = {
        skyTop: '#1641c4', skyMid: '#2a68ea', skyLow: '#6fa3f7', haze: '#b8d2ff',
        sea: '#2a5fd0', seaDeep: '#173a9c', seaLine: '#cfe0ff',
        islandFar: '#7d9ee0', island: '#5a80d0',
        roof: '#1c3373', roofLit: '#4467b8', house: '#25418c', tree: '#183670', treeLit: '#2f58a8',
        pole: '#14234f', wire: 'rgba(14,24,62,0.9)',
        wallIn: '#2c4290', wallOut: '#0f1840', beam: '#18234f', beamLit: '#33489a',
        frame: '#1a2760', frameLit: '#5a7ad0', casing: '#131d4a',
        sill: '#3a58aa', sillFront: '#1a285e', wainscot: '#18245a',
        floor: '#111b46', floorLine: 'rgba(130,160,240,0.09)',
        leaf: '#15306e', leafRim: '#4d75cc', flower: '#dfe8ff',
        curtain: '214,226,255', fold: '96,128,210'
    };

    let L = null;         // layout, recomputed on resize
    let S = null;         // baked layers and scene objects
    let tex = null;       // paper grain, made once

    // ── Layout ───────────────────────────────────────────────────────────

    function layout(W, H, dpr) {
        const portrait = H > W * 1.05;
        const u = Math.min(W, H) / 100;
        const win = portrait
            ? { x: W * 0.07, y: H * 0.1, w: W * 0.86, h: H * 0.52 }
            : { x: W * 0.17, y: H * 0.085, w: W * 0.66, h: H * 0.63 };
        const f = Math.max(7, u * 1.5);
        const sillY = win.y + win.h;
        const sillH = Math.max(7, u * 1.7);
        const floorY = portrait ? H * 0.8 : H * 0.885;
        const horizon = win.y + win.h * 0.66;
        const townTop = win.y + win.h * 0.85;
        return { W, H, dpr, u, portrait, win, f, sillY, sillH, floorY, horizon, townTop };
    }

    // ── Baking: the still layers ─────────────────────────────────────────

    function bake() {
        const { W, H, dpr, win, horizon } = L;
        const r = P.rng(1218);
        S = {};

        S.sky = bakeSky();
        S.clouds = bakeClouds(r);
        S.town = bakeTown(P.rng(77));
        S.leaves = makeVines(P.rng(5));
        S.room = bakeRoom();
        S.over = bakeOverlay();

        // Glints on the sea, between the horizon and the rooftops.
        S.glints = [];
        const seaH = L.townTop - horizon;
        const count = Math.round((win.w * seaH) / 700);
        for (let i = 0; i < count; i++) {
            const t = Math.pow(r(), 1.6);
            S.glints.push({
                x: win.x + r() * win.w, y: horizon + 2 + t * seaH,
                len: (2 + r() * 10) * (0.5 + t), ph: r() * TAU, sp: 0.6 + r() * 1.8
            });
        }

        // Dust in the sunbeam.
        S.dust = [];
        for (let i = 0; i < 46; i++) {
            S.dust.push({ x: r(), y: r(), z: 0.4 + r() * 0.6, ph: r() * TAU, sp: 0.2 + r() * 0.5 });
        }

        S.birds = null;
        S.nextBirds = 6;
    }

    function bakeSky() {
        const { W, H, dpr, win, horizon, u } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;

        const sg = g.createLinearGradient(0, win.y, 0, horizon);
        sg.addColorStop(0, C.skyTop);
        sg.addColorStop(0.5, C.skyMid);
        sg.addColorStop(0.88, C.skyLow);
        sg.addColorStop(1, C.haze);
        g.fillStyle = sg;
        g.fillRect(0, 0, W, horizon + 1);

        // A faint high veil of cirrus, brushed sideways.
        const n = P.noise2D(31);
        g.save();
        g.globalAlpha = 0.18;
        g.fillStyle = '#dfe9ff';
        for (let i = 0; i < 5; i++) {
            const y = win.y + win.h * (0.06 + i * 0.05);
            const x0 = win.x + win.w * (0.45 + n(i, 3) * 0.4);
            g.beginPath();
            g.ellipse(x0, y, win.w * (0.12 + n(i, 5) * 0.12), u * 0.35, -0.04, 0, TAU);
            g.fill();
        }
        g.restore();

        // Sea.
        const seaG = g.createLinearGradient(0, horizon, 0, L.townTop);
        seaG.addColorStop(0, C.sea);
        seaG.addColorStop(1, C.seaDeep);
        g.fillStyle = seaG;
        g.fillRect(0, horizon, W, H - horizon);
        // A band of brighter water where the sun lays its path.
        const pathX = win.x + win.w * 0.3;
        const pg = g.createRadialGradient(pathX, horizon + (L.townTop - horizon) * 0.35, 0, pathX, horizon + (L.townTop - horizon) * 0.35, win.w * 0.35);
        pg.addColorStop(0, 'rgba(170,205,255,0.35)');
        pg.addColorStop(1, 'rgba(170,205,255,0)');
        g.fillStyle = pg;
        g.fillRect(win.x, horizon, win.w, L.townTop - horizon);

        // Far headland and a nearer island, hazed by distance.
        hills(g, n, win.x - u * 4, win.x + win.w * 0.42, horizon, win.h * 0.05, C.islandFar, 11);
        hills(g, n, win.x + win.w * 0.78, win.x + win.w + u * 4, horizon, win.h * 0.028, C.islandFar, 23);
        hills(g, n, win.x - u * 4, win.x + win.w * 0.2, horizon + u * 0.4, win.h * 0.032, C.island, 41);

        // The horizon line itself, catching light.
        g.fillStyle = 'rgba(214,230,255,0.55)';
        g.fillRect(0, horizon - 0.5, W, Math.max(1, u * 0.12));

        if (tex) P.grain(g, tex, W, H, { alpha: 0.1, mode: 'soft-light' });
        return K.canvas;
    }

    function hills(g, n, x0, x1, base, height, color, seed) {
        g.beginPath();
        g.moveTo(x0, base + 1);
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = lerp(x0, x1, t);
            const envelope = Math.sin(t * Math.PI);
            g.lineTo(x, base - envelope * height * (0.55 + n(t * 3 + seed, seed, 3) * 0.9));
        }
        g.lineTo(x1, base + 1);
        g.closePath();
        g.fillStyle = color;
        g.fill();
        // Sunlit ridge.
        g.save();
        g.clip();
        g.fillStyle = 'rgba(200,220,255,0.18)';
        g.fillRect(x0, base - height * 1.6, (x1 - x0) * 0.5, height * 1.6);
        g.restore();
    }

    function bakeClouds(r) {
        const { dpr, win, horizon } = L;
        const list = [];
        const span = horizon - win.y;
        const W0 = win.w;
        const portraitScale = L.portrait ? 1.35 : 1;

        // The cumulonimbus: the reason to look out the window.
        const towerW = W0 * 0.42 * portraitScale;
        const tower = P.cloud(
            P.towerBillows(r, win.x + W0 * 0.58, horizon + span * 0.04, towerW, span * 0.98),
            { dpr, seed: 3, flatBase: horizon + 1, texture: tex }
        );
        list.push({ ...tower, x0: tower.x, y0: tower.y, v: 0.9, alpha: 1 });

        // A lower, further tower to the left.
        const farW = W0 * 0.24 * portraitScale;
        const far = P.cloud(
            P.towerBillows(r, win.x + W0 * 0.14, horizon + span * 0.02, farW, span * 0.5),
            { dpr, seed: 9, flatBase: horizon + 1, texture: tex }
        );
        list.unshift({ ...far, x0: far.x, y0: far.y, v: 0.6, alpha: 0.78 });

        // Fair-weather cumulus along the horizon, small with distance.
        for (let i = 0; i < 5; i++) {
            const w = W0 * (0.06 + r() * 0.08);
            const cx = win.x + W0 * (0.05 + r() * 0.9);
            const cy = horizon - span * (0.03 + r() * 0.06);
            const c = P.cloud(P.puffBillows(r, cx, cy, w), { dpr, seed: 20 + i, flatBase: cy + w * 0.07, texture: tex });
            list.unshift({ ...c, x0: c.x, y0: c.y, v: 1.4 + r(), alpha: 0.82 });
        }

        // A few nearer puffs drifting higher up.
        for (let i = 0; i < 3; i++) {
            const w = W0 * (0.09 + r() * 0.07) * portraitScale;
            const cx = win.x + W0 * (0.1 + i * 0.36 + r() * 0.1);
            const cy = win.y + span * (0.18 + r() * 0.22);
            const c = P.cloud(P.puffBillows(r, cx, cy, w), { dpr, seed: 40 + i, flatBase: cy + w * 0.08, texture: tex });
            list.push({ ...c, x0: c.x, y0: c.y, v: 3 + r() * 3, alpha: 1 });
        }
        return list;
    }

    function bakeTown(r) {
        const { W, H, dpr, win, u, townTop } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const bottom = win.y + win.h + u * 2;

        // Trees behind the houses.
        for (let i = 0; i < 9; i++) {
            const x = win.x + r() * win.w;
            const y = townTop + u * (0.5 + r() * 2);
            const rad = u * (2 + r() * 2.5);
            for (let k = 0; k < 4; k++) {
                const bx = x + (r() - 0.5) * rad, by = y + (r() - 0.5) * rad * 0.6, br = rad * (0.6 + r() * 0.4);
                g.fillStyle = C.tree;
                g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
                g.fillStyle = C.treeLit;
                g.beginPath(); g.arc(bx - br * 0.25, by - br * 0.3, br * 0.6, 0, TAU); g.fill();
            }
        }

        // Tiled roofs, back to front.
        const roofs = [];
        let x = win.x - u * 6;
        while (x < win.x + win.w + u * 6) {
            const half = u * (5 + r() * 6);
            roofs.push({ cx: x + half, ridge: townTop + u * (0.5 + r() * 3), half, h: u * (2.6 + r() * 1.6) });
            x += half * (1.3 + r() * 0.6);
        }
        roofs.sort((a, b) => a.ridge - b.ridge);
        for (const rf of roofs) {
            const eave = rf.ridge + rf.h;
            // House wall under the eave.
            g.fillStyle = C.house;
            g.fillRect(rf.cx - rf.half * 0.86, eave - 1, rf.half * 1.72, bottom - eave + 2);
            g.fillStyle = 'rgba(160,190,255,0.12)';
            g.fillRect(rf.cx - rf.half * 0.86, eave - 1, rf.half * 0.5, bottom - eave + 2);
            // Small lit window.
            if (r() > 0.4) {
                g.fillStyle = 'rgba(190,215,255,0.35)';
                g.fillRect(rf.cx + rf.half * (r() * 0.5 - 0.3), eave + u * 0.8, u * 1.6, u * 1.1);
            }
            // Roof.
            g.beginPath();
            g.moveTo(rf.cx - rf.half * 0.5, rf.ridge);
            g.lineTo(rf.cx + rf.half * 0.5, rf.ridge);
            g.lineTo(rf.cx + rf.half * 1.02, eave);
            g.lineTo(rf.cx - rf.half * 1.02, eave);
            g.closePath();
            g.fillStyle = C.roof;
            g.fill();
            g.save();
            g.clip();
            // Tile courses.
            g.strokeStyle = 'rgba(150,180,255,0.14)';
            g.lineWidth = Math.max(1, u * 0.12);
            for (let k = 1; k < 5; k++) {
                const yy = lerp(rf.ridge, eave, k / 5);
                g.beginPath(); g.moveTo(rf.cx - rf.half * 1.1, yy); g.lineTo(rf.cx + rf.half * 1.1, yy); g.stroke();
            }
            // Sun on the left slope.
            g.fillStyle = 'rgba(120,160,240,0.22)';
            g.fillRect(rf.cx - rf.half * 1.1, rf.ridge, rf.half * 0.7, rf.h);
            g.restore();
            // Ridge cap.
            g.fillStyle = C.roofLit;
            g.fillRect(rf.cx - rf.half * 0.52, rf.ridge - u * 0.3, rf.half * 1.04, u * 0.45);
        }

        // Utility pole and its wires.
        const px = win.x + win.w * 0.72;
        const pw = Math.max(4, u * 0.85);
        const arm1 = win.y + win.h * 0.1, arm2 = win.y + win.h * 0.19;
        g.fillStyle = C.pole;
        g.fillRect(px - pw / 2, win.y - u * 4, pw, bottom - win.y + u * 4);
        g.fillStyle = 'rgba(120,150,230,0.25)';
        g.fillRect(px - pw / 2, win.y - u * 4, pw * 0.3, bottom - win.y + u * 4);
        for (const [ay, aw] of [[arm1, u * 9], [arm2, u * 7]]) {
            g.fillStyle = C.pole;
            g.fillRect(px - aw / 2, ay, aw, Math.max(3, u * 0.55));
            for (let k = 0; k < 3; k++) {
                const ix = px - aw / 2 + aw * (0.1 + k * 0.4);
                g.fillStyle = '#9fb6ec';
                g.fillRect(ix - u * 0.25, ay - u * 0.8, u * 0.5, u * 0.8);
            }
        }
        // Transformer drum.
        g.fillStyle = '#1d3170';
        g.beginPath();
        g.roundRect(px + pw * 0.6, arm2 + u * 1.5, u * 2.6, u * 3.6, u * 0.6);
        g.fill();
        g.fillStyle = 'rgba(150,180,250,0.3)';
        g.fillRect(px + pw * 0.6, arm2 + u * 1.5, u * 0.7, u * 3.6);

        g.strokeStyle = C.wire;
        g.lineWidth = Math.max(1, u * 0.16);
        const wires = [
            [arm1, u * 9, -1, win.h * 0.06], [arm1, u * 9, -1, win.h * 0.08], [arm1, u * 9, 1, win.h * 0.03],
            [arm2, u * 7, -1, win.h * 0.1], [arm2, u * 7, 1, win.h * 0.05]
        ];
        wires.forEach(([ay, aw, dir, sag], k) => {
            const sx = px + dir * aw * (0.1 + (k % 2) * 0.3);
            const ex = dir < 0 ? win.x - u * 10 : win.x + win.w + u * 10;
            const ey = ay + sag * 0.6 + (k - 2) * u * 0.8;
            g.beginPath();
            g.moveTo(sx, ay - u * 0.6);
            g.quadraticCurveTo((sx + ex) / 2, Math.max(ay, ey) + sag, ex, ey);
            g.stroke();
        });

        if (tex) P.grain(g, tex, W, H, { alpha: 0.14, mode: 'soft-light' });
        return K.canvas;
    }

    function makeVines(r) {
        const { win, u, sillY } = L;
        const strings = L.portrait ? [0.82, 0.9, 0.97] : [0.85, 0.915, 0.975];
        const leaves = [];
        const lines = [];
        strings.forEach((sx, k) => {
            const x = win.x + win.w * sx;
            const top = win.y + win.h * (0.12 + r() * 0.2);
            lines.push({ x, top });
            const count = Math.round((sillY - top) / (u * 3.2));
            for (let i = 0; i < count; i++) {
                const t = i / count;
                const y = sillY - t * (sillY - top) - r() * u;
                const side = i % 2 ? 1 : -1;
                leaves.push({
                    x: x + side * u * (0.4 + r() * 0.6), y,
                    s: u * (1.8 + r() * 1.4) * (1 - t * 0.35),
                    a: side * (0.6 + r() * 0.6) - Math.PI / 2,
                    ph: r() * TAU, flower: r() > 0.86
                });
            }
        });
        return { leaves, lines };
    }

    function bakeRoom() {
        const { W, H, dpr, win, f, u, sillY, sillH, floorY } = L;
        const K = P.layer(W, H, dpr);
        const g = K.g;
        const cx = win.x + win.w / 2, cy = win.y + win.h / 2;

        // Wall, lit by the window and falling away into shadow.
        const wg = g.createRadialGradient(cx, cy, Math.min(win.w, win.h) * 0.35, cx, cy, Math.hypot(W, H) * 0.62);
        wg.addColorStop(0, C.wallIn);
        wg.addColorStop(1, C.wallOut);
        g.fillStyle = wg;
        g.fillRect(0, 0, W, H);
        // Plaster: soft mottling.
        if (tex) P.grain(g, tex, W, H, { alpha: 0.32, mode: 'soft-light', scale: 2.2 });

        // Window glow on the plaster around the opening.
        const glow = P.layer(W, H, dpr);
        glow.g.fillStyle = '#9cc0ff';
        glow.g.fillRect(win.x, win.y, win.w, win.h);
        P.bloom(g, glow.canvas, {
            radius: u * 22, alpha: 0.32, w: W, h: H,
            clip: (c) => { c.rect(0, 0, W, H); c.rect(win.x, win.y, win.w, win.h); }
        });

        // Wainscot below the sill.
        const wsTop = sillY + sillH;
        g.fillStyle = C.wainscot;
        g.fillRect(0, wsTop, W, floorY - wsTop);
        const plank = Math.max(18, u * 5.5);
        for (let x = (W / 2) % plank; x < W; x += plank) {
            g.fillStyle = 'rgba(0,0,12,0.28)';
            g.fillRect(x, wsTop, Math.max(1, u * 0.15), floorY - wsTop);
            g.fillStyle = 'rgba(140,170,250,0.06)';
            g.fillRect(x + Math.max(1, u * 0.15), wsTop, Math.max(1, u * 0.2), floorY - wsTop);
        }
        const wsShade = g.createLinearGradient(0, wsTop, 0, floorY);
        wsShade.addColorStop(0, 'rgba(0,0,15,0.45)');
        wsShade.addColorStop(0.25, 'rgba(0,0,15,0)');
        g.fillStyle = wsShade;
        g.fillRect(0, wsTop, W, floorY - wsTop);

        // Beam (nageshi) running above the window.
        const beamY = win.y - f - u * 4.2, beamH = u * 2.2;
        g.fillStyle = C.beam;
        g.fillRect(0, beamY, W, beamH);
        g.fillStyle = C.beamLit;
        g.fillRect(0, beamY, W, Math.max(1, beamH * 0.18));
        g.fillStyle = 'rgba(0,0,12,0.3)';
        g.fillRect(0, beamY + beamH, W, u * 0.8);

        // Casing and frame.
        g.fillStyle = C.casing;
        g.fillRect(win.x - f * 1.9, win.y - f * 1.9, win.w + f * 3.8, win.h + f * 1.9);
        g.clearRect(win.x, win.y, win.w, win.h);
        g.fillStyle = C.frame;
        g.fillRect(win.x - f, win.y - f, win.w + f * 2, f);
        g.fillRect(win.x - f, win.y, f, win.h);
        g.fillRect(win.x + win.w, win.y, f, win.h);
        // Edges catching the sky.
        g.fillStyle = C.frameLit;
        g.fillRect(win.x - 1, win.y - 1.5, win.w + 2, 1.5);
        g.fillRect(win.x - 1.5, win.y, 1.5, win.h);
        g.fillRect(win.x + win.w, win.y, 1.5, win.h);

        // The second sliding pane, pushed over the right half.
        const paneX = win.x + win.w * 0.53;
        const stile = f * 0.8;
        g.fillStyle = 'rgba(170,200,255,0.09)';
        g.fillRect(paneX, win.y, win.x + win.w - paneX, win.h);
        g.save();
        g.beginPath(); g.rect(paneX, win.y, win.x + win.w - paneX, win.h); g.clip();
        // Reflections sliding down the glass.
        for (const [o, wdt, a] of [[0.12, 0.09, 0.13], [0.3, 0.035, 0.1], [0.62, 0.07, 0.07]]) {
            const x0 = paneX + (win.x + win.w - paneX) * o;
            const rg = g.createLinearGradient(x0, 0, x0 + win.w * wdt, 0);
            rg.addColorStop(0, 'rgba(235,243,255,0)');
            rg.addColorStop(0.5, `rgba(235,243,255,${a})`);
            rg.addColorStop(1, 'rgba(235,243,255,0)');
            g.fillStyle = rg;
            g.beginPath();
            g.moveTo(x0, win.y + win.h);
            g.lineTo(x0 + win.w * wdt, win.y + win.h);
            g.lineTo(x0 + win.w * wdt + win.h * 0.35, win.y);
            g.lineTo(x0 + win.h * 0.35, win.y);
            g.closePath();
            g.fill();
        }
        g.restore();
        g.fillStyle = C.frame;
        g.fillRect(paneX - stile / 2, win.y, stile, win.h);
        g.fillStyle = C.frameLit;
        g.fillRect(paneX - stile / 2, win.y, Math.max(1, stile * 0.2), win.h);
        g.fillStyle = C.frame;
        g.fillRect(paneX, win.y, win.x + win.w - paneX, f * 0.5);

        // Sill.
        const sx0 = win.x - f * 2.2, sx1 = win.x + win.w + f * 2.2;
        g.fillStyle = C.sill;
        g.fillRect(sx0, sillY, sx1 - sx0, sillH * 0.42);
        g.fillStyle = C.sillFront;
        g.fillRect(sx0, sillY + sillH * 0.42, sx1 - sx0, sillH * 0.58);
        g.fillStyle = 'rgba(220,232,255,0.5)';
        g.fillRect(sx0, sillY, sx1 - sx0, Math.max(1, u * 0.12));
        const ss = g.createLinearGradient(0, sillY + sillH, 0, sillY + sillH + u * 3);
        ss.addColorStop(0, 'rgba(0,0,15,0.45)');
        ss.addColorStop(1, 'rgba(0,0,15,0)');
        g.fillStyle = ss;
        g.fillRect(sx0, sillY + sillH, sx1 - sx0, u * 3);

        // On the sill: a glass of water and a few books.
        glassOfWater(g, win.x + win.w * 0.36, sillY, u);
        books(g, win.x + win.w * 0.62, sillY, u);

        // Floor, polished boards.
        g.fillStyle = C.floor;
        g.fillRect(0, floorY, W, H - floorY);
        g.fillStyle = '#0c1438';
        g.fillRect(0, floorY, W, Math.max(3, u * 1.1));
        g.strokeStyle = C.floorLine;
        g.lineWidth = 1;
        for (let k = 1; k < 9; k++) {
            const y = floorY + (H - floorY) * Math.pow(k / 9, 1.5);
            g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        }
        // The window, reflected softly in the floor.
        const fr = g.createLinearGradient(0, floorY, 0, H);
        fr.addColorStop(0, 'rgba(120,160,255,0.16)');
        fr.addColorStop(1, 'rgba(120,160,255,0)');
        g.fillStyle = fr;
        g.fillRect(win.x + win.w * 0.1, floorY, win.w * 0.8, H - floorY);

        // The right wall: a clock and a shelf, where there is room for them.
        const rightSpace = W - (win.x + win.w + f * 2);
        if (!L.portrait && rightSpace > u * 16) {
            const ccx = win.x + win.w + f * 2 + rightSpace * 0.5;
            S.clock = { x: ccx, y: win.y + win.h * 0.24, r: Math.min(u * 4.2, rightSpace * 0.26) };
            clockFace(g, S.clock, u);
            shelf(g, ccx, win.y + win.h * 0.66, Math.min(rightSpace * 0.7, u * 26), u);
        } else {
            S.clock = null;
        }

        return K.canvas;
    }

    function glassOfWater(g, x, base, u) {
        const w = u * 2.6, h = u * 3.9;
        // Light thrown through the glass onto the sill.
        const caustic = g.createRadialGradient(x + w * 1.1, base - u * 0.1, 0, x + w * 1.1, base, w * 1.3);
        caustic.addColorStop(0, 'rgba(225,238,255,0.5)');
        caustic.addColorStop(1, 'rgba(225,238,255,0)');
        g.fillStyle = caustic;
        g.fillRect(x - w, base - u * 1.2, w * 3.5, u * 1.4);

        g.save();
        g.beginPath();
        g.moveTo(x - w / 2, base - h);
        g.lineTo(x + w / 2, base - h);
        g.lineTo(x + w * 0.43, base);
        g.lineTo(x - w * 0.43, base);
        g.closePath();
        g.fillStyle = 'rgba(170,200,255,0.25)';
        g.fill();
        g.clip();
        g.fillStyle = 'rgba(110,150,240,0.4)';
        g.fillRect(x - w, base - h * 0.62, w * 2, h);
        g.fillStyle = 'rgba(230,240,255,0.55)';
        g.fillRect(x - w, base - h * 0.62, w * 2, Math.max(1, u * 0.18));
        // Ice.
        g.fillStyle = 'rgba(225,236,255,0.45)';
        g.save(); g.translate(x - w * 0.12, base - h * 0.5); g.rotate(0.3); g.fillRect(-u * 0.55, -u * 0.55, u * 1.1, u * 1.1); g.restore();
        g.save(); g.translate(x + w * 0.16, base - h * 0.4); g.rotate(-0.2); g.fillRect(-u * 0.45, -u * 0.45, u * 0.9, u * 0.9); g.restore();
        // Highlight streak.
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(x - w * 0.36, base - h * 0.92, Math.max(1, u * 0.28), h * 0.75);
        g.restore();
        g.strokeStyle = 'rgba(220,234,255,0.7)';
        g.lineWidth = Math.max(1, u * 0.12);
        g.beginPath(); g.moveTo(x - w / 2, base - h); g.lineTo(x + w / 2, base - h); g.stroke();
    }

    function books(g, x, base, u) {
        const stack = [[u * 9, u * 1.2, '#25397f'], [u * 8, u * 1.0, '#304a96'], [u * 8.6, u * 1.3, '#1d2f6c']];
        let y = base;
        stack.forEach(([w, h, col], i) => {
            const ox = (i % 2 ? 1 : -1) * u * 0.5;
            y -= h;
            g.fillStyle = col;
            g.fillRect(x + ox, y, w, h);
            g.fillStyle = 'rgba(220,232,255,0.55)';
            g.fillRect(x + ox + w - u * 0.5, y + h * 0.2, u * 0.4, h * 0.6);
            g.fillStyle = 'rgba(160,190,255,0.35)';
            g.fillRect(x + ox, y, w, Math.max(1, u * 0.12));
        });
    }

    function strawHat(g, x, y, u) {
        g.fillStyle = '#0d163c';
        g.fillRect(x - u * 0.3, y - u * 3.4, u * 0.6, u * 1.4);   // peg
        g.save();
        g.translate(x, y);
        g.rotate(-0.12);
        g.fillStyle = '#41579c';
        g.beginPath(); g.ellipse(0, u * 1.2, u * 6, u * 1.4, 0, 0, TAU); g.fill();
        g.fillStyle = '#4c63ab';
        g.beginPath(); g.ellipse(0, 0, u * 3.2, u * 2.6, 0, Math.PI, 0); g.lineTo(u * 3.2, u * 1.1); g.lineTo(-u * 3.2, u * 1.1); g.fill();
        g.fillStyle = '#1b2a66';
        g.fillRect(-u * 3.2, u * 0.1, u * 6.4, u * 0.9);
        g.beginPath(); g.moveTo(u * 2.6, u * 0.6); g.quadraticCurveTo(u * 4, u * 3, u * 3.2, u * 5.2); g.lineTo(u * 2.7, u * 5); g.quadraticCurveTo(u * 3.3, u * 3, u * 2.2, u * 0.9); g.fill();
        g.fillStyle = 'rgba(200,220,255,0.18)';
        g.beginPath(); g.ellipse(-u * 1.2, -u * 1.3, u * 1.2, u * 0.8, -0.4, 0, TAU); g.fill();
        g.restore();
    }

    function clockFace(g, c, u) {
        g.fillStyle = '#0d163c';
        g.beginPath(); g.arc(c.x, c.y, c.r * 1.12, 0, TAU); g.fill();
        g.fillStyle = '#8ea6e4';
        g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.fill();
        g.fillStyle = 'rgba(230,240,255,0.25)';
        g.beginPath(); g.arc(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.5, 0, TAU); g.fill();
        g.fillStyle = '#1a2760';
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            const len = i % 3 === 0 ? c.r * 0.2 : c.r * 0.1;
            g.save(); g.translate(c.x, c.y); g.rotate(a);
            g.fillRect(-Math.max(1, u * 0.12), -c.r * 0.9, Math.max(2, u * 0.24), len);
            g.restore();
        }
    }

    function shelf(g, cx, y, w, u) {
        g.fillStyle = '#0e173f';
        g.fillRect(cx - w / 2, y, w, u * 0.9);
        g.fillStyle = 'rgba(140,170,250,0.25)';
        g.fillRect(cx - w / 2, y, w, Math.max(1, u * 0.15));
        const r = P.rng(9);
        let x = cx - w / 2 + u;
        const cols = ['#22357a', '#2c438f', '#1b2b68', '#34509f', '#263c84'];
        while (x < cx + w * 0.18) {
            const bw = u * (0.9 + r() * 0.8), bh = u * (3.2 + r() * 1.8);
            g.fillStyle = cols[Math.floor(r() * cols.length)];
            g.fillRect(x, y - bh, bw, bh);
            g.fillStyle = 'rgba(180,205,255,0.2)';
            g.fillRect(x, y - bh * 0.7, bw, Math.max(1, u * 0.15));
            x += bw + u * 0.1;
        }
        // A small round cactus in a pot.
        const px = cx + w * 0.32;
        g.fillStyle = '#2a3f88';
        g.beginPath(); g.moveTo(px - u * 1.4, y - u * 2); g.lineTo(px + u * 1.4, y - u * 2); g.lineTo(px + u, y); g.lineTo(px - u, y); g.fill();
        g.fillStyle = '#183374';
        g.beginPath(); g.arc(px, y - u * 3.1, u * 1.4, 0, TAU); g.fill();
        g.fillStyle = 'rgba(150,185,255,0.3)';
        g.beginPath(); g.arc(px - u * 0.4, y - u * 3.5, u * 0.6, 0, TAU); g.fill();
    }

    function cushion(g, cx, cy, w, u) {
        const h = w * 0.22;
        g.fillStyle = 'rgba(0,0,15,0.35)';
        g.beginPath(); g.ellipse(cx, cy + h * 0.55, w * 0.55, h * 0.35, 0, 0, TAU); g.fill();
        g.fillStyle = '#2a3d86';
        g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.45); g.fill();
        g.fillStyle = 'rgba(150,180,255,0.22)';
        g.beginPath(); g.roundRect(cx - w / 2 + u * 0.4, cy - h / 2 + u * 0.2, w - u * 0.8, h * 0.28, h * 0.2); g.fill();
        // Paper fan (uchiwa).
        const fx = cx + w * 0.12, fy = cy - h * 0.5;
        g.save();
        g.translate(fx, fy);
        g.rotate(-0.5);
        g.fillStyle = '#b9cbf6';
        g.beginPath(); g.ellipse(0, -u * 2.2, u * 2.3, u * 2, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(60,90,180,0.45)';
        g.lineWidth = Math.max(1, u * 0.1);
        for (let k = -3; k <= 3; k++) {
            g.beginPath(); g.moveTo(0, -u * 0.3); g.lineTo(k * u * 0.65, -u * 4); g.stroke();
        }
        g.fillStyle = '#3c5bb0';
        g.beginPath(); g.arc(u * 0.6, -u * 2.6, u * 0.7, 0, TAU); g.fill();  // a painted circle on the fan
        g.fillStyle = '#1b2a66';
        g.fillRect(-u * 0.25, -u * 0.4, u * 0.5, u * 2.6);
        g.restore();
    }

    function bakeOverlay() {
        const { W, H, dpr } = L;
        const K = P.layer(W, H, dpr);
        P.vignette(K.g, W, H, { strength: 0.42 });
        return K.canvas;
    }

    // ── Motion ───────────────────────────────────────────────────────────

    function wind(t) {
        return clamp(0.5 + 0.26 * Math.sin(t * 0.23) + 0.16 * Math.sin(t * 0.61 + 1.7) + 0.08 * Math.sin(t * 1.37 + 0.4), 0, 1);
    }

    // The chime is a damped pendulum pushed by the wind.
    const chime = { th: 0, om: 0, last: -10 };

    function stepChime(t, dt) {
        const w = wind(t);
        const target = 0.2 * w + 0.12 * w * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2);
        const acc = -16 * (chime.th - target) - 1.4 * chime.om;
        chime.om += acc * dt;
        chime.th += chime.om * dt;
        if (Math.abs(chime.om) > 0.55 && t - chime.last > 1.1) {
            chime.last = t;
            Sound.ring(Math.abs(chime.om));
        }
    }

    // ── Frame ────────────────────────────────────────────────────────────

    function frame(t) {
        const { W, H, dpr, win, u, horizon, sillY, sillH, floorY } = L;
        const w = wind(t);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.drawImage(S.sky, 0, 0, W, H);

        // Clouds drift right and wrap behind the wall.
        for (const c of S.clouds) {
            const startX = win.x - c.w - u * 4;
            const span = win.w + c.w + u * 8;
            const x = startX + ((((c.x0 - startX) + c.v * t) % span) + span) % span;
            ctx.globalAlpha = c.alpha;
            ctx.drawImage(c.canvas, x, c.y0, c.w, c.h);
        }
        ctx.globalAlpha = 1;

        // Sun on the water.
        for (const s of S.glints) {
            const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 6);
            if (a < 0.02) continue;
            ctx.fillStyle = `rgba(235,244,255,${a * 0.85})`;
            ctx.fillRect(s.x, s.y, s.len, Math.max(1, u * 0.16));
        }

        drawBirds(t);

        ctx.drawImage(S.town, 0, 0, W, H);
        drawVines(t, w);
        ctx.drawImage(S.room, 0, 0, W, H);

        drawLight(t);
        drawCat(t);
        drawChime(t);
        drawCurtain(t, w);
        drawClockHands();

        ctx.drawImage(S.over, 0, 0, W, H);
        if (tex) {
            const j = still ? 0 : Math.floor(t * 12) % 4;
            P.grain(ctx, tex, W, H, { alpha: 0.07, mode: 'overlay', ox: j * 37, oy: j * 53 });
        }
    }

    function drawBirds(t) {
        const { win, u } = L;
        if (!S.birds && t > S.nextBirds) {
            const r = Math.random;
            const n = 2 + Math.floor(r() * 3);
            const y = win.y + win.h * (0.18 + r() * 0.25);
            S.birds = { t0: t, v: u * (5 + r() * 3), list: Array.from({ length: n }, (_, i) => ({ dx: -i * u * (2 + r() * 2), dy: (r() - 0.5) * u * 3, ph: r() * TAU })), y };
        }
        if (!S.birds) return;
        const b = S.birds;
        const x0 = win.x - u * 4 + (t - b.t0) * b.v;
        if (x0 > win.x + win.w + u * 20) { S.birds = null; S.nextBirds = t + 14 + Math.random() * 16; return; }
        ctx.strokeStyle = 'rgba(20,38,100,0.85)';
        ctx.lineWidth = Math.max(1, u * 0.22);
        ctx.lineCap = 'round';
        for (const bd of b.list) {
            const x = x0 + bd.dx, y = b.y + bd.dy + Math.sin(t * 0.8 + bd.ph) * u * 0.4;
            const flap = Math.sin(t * 9 + bd.ph) * u * 0.55;
            const s = u * 0.9;
            ctx.beginPath();
            ctx.moveTo(x - s, y - flap);
            ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y);
            ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - flap);
            ctx.stroke();
        }
    }

    /** A morning-glory leaf: heart-shaped, notched at the stem, tip outward. */
    function leafPath(c, s) {
        c.beginPath();
        c.moveTo(0, -s * 0.12);
        c.bezierCurveTo(-s * 0.35, s * 0.08, -s * 0.85, -s * 0.1, -s * 0.72, -s * 0.62);
        c.bezierCurveTo(-s * 0.6, -s * 1.0, -s * 0.2, -s * 1.15, 0, -s * 1.45);
        c.bezierCurveTo(s * 0.2, -s * 1.15, s * 0.6, -s * 1.0, s * 0.72, -s * 0.62);
        c.bezierCurveTo(s * 0.85, -s * 0.1, s * 0.35, s * 0.08, 0, -s * 0.12);
        c.closePath();
    }

    function drawVines(t, w) {
        const { u, sillY } = L;
        ctx.strokeStyle = 'rgba(20,36,90,0.7)';
        ctx.lineWidth = Math.max(1, u * 0.12);
        for (const l of S.leaves.lines) {
            ctx.beginPath(); ctx.moveTo(l.x, l.top); ctx.lineTo(l.x + Math.sin(t * 0.9) * u * 0.2, sillY); ctx.stroke();
        }
        for (const lf of S.leaves.leaves) {
            const sway = Math.sin(t * 1.6 + lf.ph) * (0.08 + w * 0.22);
            ctx.save();
            ctx.translate(lf.x, lf.y);
            ctx.rotate(lf.a + sway);
            leafPath(ctx, lf.s);
            // Backlit by the sky: dark body, light bleeding through the edge.
            const lg = ctx.createLinearGradient(-lf.s, -lf.s * 1.4, lf.s * 0.6, 0);
            lg.addColorStop(0, '#2c55a8');
            lg.addColorStop(1, C.leaf);
            ctx.fillStyle = lg;
            ctx.fill();
            ctx.strokeStyle = C.leafRim;
            ctx.lineWidth = Math.max(1, u * 0.12);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(120,160,240,0.45)';
            ctx.beginPath(); ctx.moveTo(0, -lf.s * 0.1); ctx.lineTo(0, -lf.s * 1.25); ctx.stroke();
            ctx.restore();
            if (lf.flower) {
                const fx = lf.x + Math.cos(lf.a) * lf.s * 0.9, fy = lf.y + Math.sin(lf.a) * lf.s * 0.9;
                ctx.fillStyle = C.flower;
                ctx.beginPath(); ctx.arc(fx, fy, lf.s * 0.42, 0, TAU); ctx.fill();
                ctx.fillStyle = '#7f9ce6';
                ctx.beginPath(); ctx.arc(fx, fy, lf.s * 0.14, 0, TAU); ctx.fill();
            }
        }
    }

    function drawLight(t) {
        const { win, H, floorY, u, W } = L;
        const k = 0.85 + 0.15 * Math.sin(t * 0.07);
        // The patch of sun on the floor.
        const top = floorY + (H - floorY) * 0.12;
        const quad = [
            { x: win.x + win.w * 0.18, y: top }, { x: win.x + win.w * 0.86, y: top },
            { x: win.x + win.w * 1.05, y: H + u * 4 }, { x: win.x + win.w * 0.3, y: H + u * 4 }
        ];
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(120,160,240,${0.16 * k})`;
        ctx.beginPath();
        quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Shafts from the window down to it.
        const rays = [
            [0.08, 0.3, 0.2, 0.42], [0.36, 0.5, 0.48, 0.64], [0.62, 0.8, 0.74, 0.96]
        ];
        rays.forEach(([a, b, c, d], i) => {
            const pulse = 0.05 + 0.035 * Math.sin(t * 0.25 + i * 1.9);
            P.shaft(ctx, [
                { x: win.x + win.w * a, y: win.y + win.h * 0.55 }, { x: win.x + win.w * b, y: win.y + win.h * 0.55 },
                { x: win.x + win.w * (d + 0.15), y: H }, { x: win.x + win.w * (c + 0.15), y: H }
            ], { alpha: pulse * k });
        });

        // Dust turning in the beam.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const d of S.dust) {
            const x = win.x + win.w * (0.15 + d.x * 0.9) + Math.sin(t * d.sp + d.ph) * u * 2;
            const y = win.y + win.h * 0.6 + ((d.y * (H - win.y - win.h * 0.6) - t * u * 0.6 * d.sp) % (H - win.y - win.h * 0.6) + (H - win.y - win.h * 0.6)) % (H - win.y - win.h * 0.6);
            const a = (0.35 + 0.35 * Math.sin(t * 1.3 + d.ph * 3)) * d.z;
            ctx.fillStyle = `rgba(220,235,255,${a})`;
            ctx.beginPath(); ctx.arc(x, y, u * 0.16 * d.z + 0.4, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    /** A cat asleep in the patch of sun, curled nose to tail, breathing. */
    function drawCat(t) {
        const { win, H, floorY, u } = L;
        const s = u * (L.portrait ? 1.5 : 1.15);
        const x = win.x + win.w * (L.portrait ? 0.66 : 0.6);
        const y = floorY + (H - floorY) * (L.portrait ? 0.45 : 0.5);
        const breath = 1 + 0.025 * Math.sin(t * 1.3);
        const ear = Math.max(0, Math.sin(t * 0.21) - 0.97) * 30;   // a rare twitch

        ctx.save();
        ctx.translate(x, y);
        // Contact shadow.
        ctx.fillStyle = 'rgba(0,0,18,0.4)';
        ctx.beginPath(); ctx.ellipse(0, s * 2.6, s * 6.2, s * 1.1, 0, 0, TAU); ctx.fill();

        ctx.scale(1, breath);
        ctx.beginPath();
        // Body: a loaf, higher at the back.
        ctx.ellipse(0, 0, s * 5.4, s * 2.9, 0, 0, TAU);
        // Head tucked in at the front, ears up.
        ctx.moveTo(s * 5.6, s * 0.9);
        ctx.arc(s * 3.8, s * 0.9, s * 1.9, 0, TAU);
        ctx.moveTo(s * 2.4, -s * 0.4);
        ctx.lineTo(s * 2.7, -s * 2.3 - ear);
        ctx.lineTo(s * 3.6, -s * 0.7);
        ctx.moveTo(s * 4.1, -s * 0.8);
        ctx.lineTo(s * 4.9, -s * 2.4);
        ctx.lineTo(s * 5.4, -s * 0.2);
        ctx.fillStyle = '#121b48';
        ctx.fill();
        // Tail wrapped round the front.
        ctx.strokeStyle = '#121b48';
        ctx.lineCap = 'round';
        ctx.lineWidth = s * 1.1;
        ctx.beginPath();
        ctx.moveTo(-s * 4.8, s * 0.8);
        ctx.quadraticCurveTo(-s * 3.5, s * 3.1, s * 1.2, s * 2.5);
        ctx.quadraticCurveTo(s * 2.8, s * 2.2, s * 2.9, s * 1.6);
        ctx.stroke();
        // Sun along the back and the top of the head.
        ctx.strokeStyle = 'rgba(150,185,255,0.55)';
        ctx.lineWidth = Math.max(1, s * 0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, s * 5.2, s * 2.7, 0, Math.PI * 1.08, Math.PI * 1.72); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 3.8, s * 0.9, s * 1.75, Math.PI * 1.25, Math.PI * 1.7); ctx.stroke();
        ctx.restore();
    }

    function drawChime(t) {
        const { win, u } = L;
        const fx = win.x + win.w * 0.38;
        const hookY = win.y;
        const R = clamp(u * 2.1, 11, 22);
        const str = win.h * 0.12;
        const bellTh = chime.th * 0.35;
        const stripTh = chime.th;

        ctx.save();
        ctx.translate(fx, hookY);
        ctx.rotate(bellTh);
        ctx.strokeStyle = 'rgba(16,28,72,0.9)';
        ctx.lineWidth = Math.max(1, u * 0.12);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, str); ctx.stroke();

        // Glass bell.
        const by = str + R;
        ctx.beginPath();
        ctx.arc(0, by, R, Math.PI, 0);
        ctx.lineTo(R * 1.04, by + R * 0.12);
        ctx.lineTo(-R * 1.04, by + R * 0.12);
        ctx.closePath();
        const bg = ctx.createLinearGradient(-R, by - R, R, by);
        bg.addColorStop(0, 'rgba(240,247,255,0.85)');
        bg.addColorStop(1, 'rgba(170,200,255,0.45)');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1, u * 0.1);
        ctx.stroke();
        // Painted waves on the glass.
        ctx.strokeStyle = 'rgba(40,90,210,0.8)';
        ctx.lineWidth = Math.max(1, R * 0.12);
        for (let k = -1; k <= 1; k++) {
            ctx.beginPath(); ctx.arc(k * R * 0.5, by - R * 0.05, R * 0.24, Math.PI * 1.1, Math.PI * 1.95); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(-R * 0.45, by - R * 0.55, R * 0.16, R * 0.3, -0.6, 0, TAU); ctx.fill();

        // Clapper and the paper strip, swinging further than the bell.
        ctx.translate(0, by);
        ctx.rotate(stripTh - bellTh);
        ctx.strokeStyle = 'rgba(16,28,72,0.9)';
        ctx.lineWidth = Math.max(1, u * 0.1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 1.9); ctx.stroke();
        ctx.fillStyle = '#c9d8ff';
        ctx.fillRect(-R * 0.18, R * 0.1, R * 0.36, R * 0.36);
        const sw = R * 0.95, sh = R * 4.4;
        ctx.save();
        ctx.translate(0, R * 1.9);
        ctx.transform(1, 0, Math.sin(t * 3.1) * 0.08, 1, 0, 0);
        const pg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        pg.addColorStop(0, '#f2f6ff');
        pg.addColorStop(1, '#b7c9f2');
        ctx.fillStyle = pg;
        ctx.fillRect(-sw / 2, 0, sw, sh);
        ctx.fillStyle = 'rgba(40,80,190,0.55)';
        ctx.fillRect(-sw * 0.06, sh * 0.18, sw * 0.12, sh * 0.5);
        ctx.restore();
        ctx.restore();
    }

    function drawCurtain(t, w) {
        const { win, u, f, sillY, sillH, W } = L;
        const top = win.y - f - u * 1.4;
        const bottom = sillY + sillH + u * 5;
        const Hc = bottom - top;
        const x0 = Math.max(-u * 2, win.x - u * (L.portrait ? 4 : 8));
        const x1 = win.x + win.w * (L.portrait ? 0.22 : 0.2);
        const b = Hc * (0.05 + w * 0.15) + Math.sin(t * 1.1) * Hc * 0.012;
        const lift = Hc * w * 0.07;
        const wave = t * 1.6;

        function path(c) {
            c.beginPath();
            c.moveTo(x0, top);
            // Gathered top edge.
            const gathers = 9;
            for (let i = 1; i <= gathers; i++) {
                const x = lerp(x0, x1, i / gathers);
                c.quadraticCurveTo(x - (x1 - x0) / gathers / 2, top + u * 0.9, x, top);
            }
            // The free edge, filling with air.
            c.bezierCurveTo(x1 + b * 0.25, top + Hc * 0.35, x1 + b * 1.05, top + Hc * 0.72, x1 + b * 0.85, bottom - lift);
            // Hem, rippling back.
            const steps = 6;
            for (let i = 1; i <= steps; i++) {
                const s = i / steps;
                const x = lerp(x1 + b * 0.85, x0 + b * 0.12, s);
                const y = lerp(bottom - lift, bottom, s) + Math.sin(wave + s * 5) * u * 0.8 * (0.4 + w);
                const pxm = lerp(x1 + b * 0.85, x0 + b * 0.12, s - 0.5 / steps);
                c.quadraticCurveTo(pxm, y + u * 1.2 * Math.sin(wave + s * 7), x, y);
            }
            c.bezierCurveTo(x0 + b * 0.1, top + Hc * 0.66, x0, top + Hc * 0.3, x0, top);
            c.closePath();
        }

        // Sheer cloth: faint where it hangs against the wall...
        path(ctx);
        const cg = ctx.createLinearGradient(0, top, 0, bottom);
        cg.addColorStop(0, `rgba(${C.curtain},0.58)`);
        cg.addColorStop(1, `rgba(${C.curtain},0.42)`);
        ctx.fillStyle = cg;
        ctx.fill();
        // ...and glowing where the sky shines through it.
        ctx.save();
        ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
        path(ctx);
        ctx.fillStyle = 'rgba(240,246,255,0.35)';
        ctx.fill();
        ctx.restore();

        // Folds following the billow.
        ctx.save();
        path(ctx);
        ctx.clip();
        const folds = 8;
        for (let i = 0; i <= folds; i++) {
            const s = i / folds;
            const xt = lerp(x0, x1, s);
            const xb = lerp(x0 + b * 0.12, x1 + b * 0.85, s);
            const cx1 = lerp(x0, x1 + b * 0.25, s), cx2 = lerp(x0 + b * 0.1, x1 + b * 1.05, s);
            ctx.beginPath();
            ctx.moveTo(xt, top);
            ctx.bezierCurveTo(cx1, top + Hc * 0.35, cx2, top + Hc * 0.72, xb, bottom);
            ctx.strokeStyle = i % 2 ? `rgba(${C.fold},0.32)` : 'rgba(255,255,255,0.22)';
            ctx.lineWidth = i % 2 ? u * 0.9 : u * 0.45;
            ctx.stroke();
        }
        ctx.restore();

        // Rail.
        ctx.fillStyle = '#0d163c';
        ctx.fillRect(x0 - u, top - u * 0.7, x1 - x0 + u * 3, u * 0.8);
    }

    function drawClockHands() {
        const c = S.clock;
        if (!c) return;
        const now = new Date();
        const m = now.getMinutes() + now.getSeconds() / 60;
        const h = (now.getHours() % 12) + m / 60;
        ctx.strokeStyle = '#111b48';
        ctx.lineCap = 'round';
        ctx.lineWidth = c.r * 0.1;
        ctx.beginPath(); ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.sin(h / 12 * TAU) * c.r * 0.5, c.y - Math.cos(h / 12 * TAU) * c.r * 0.5); ctx.stroke();
        ctx.lineWidth = c.r * 0.07;
        ctx.beginPath(); ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.sin(m / 60 * TAU) * c.r * 0.78, c.y - Math.cos(m / 60 * TAU) * c.r * 0.78); ctx.stroke();
        ctx.fillStyle = '#111b48';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.08, 0, TAU); ctx.fill();
    }

    // ── Sound: a glass chime and the wind, synthesised ───────────────────

    const Sound = {
        ac: null, master: null, windGain: null, on: false,
        start() {
            if (this.ac) return true;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            const ac = this.ac = new AC();
            this.master = ac.createGain();
            this.master.gain.value = 0;
            this.master.connect(ac.destination);
            // Brown noise, low-passed: wind through the window.
            const len = ac.sampleRate * 4;
            const buf = ac.createBuffer(1, len, ac.sampleRate);
            const d = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
            const src = ac.createBufferSource();
            src.buffer = buf; src.loop = true;
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 420;
            this.windGain = ac.createGain();
            this.windGain.gain.value = 0;
            src.connect(lp).connect(this.windGain).connect(this.master);
            src.start();
            return true;
        },
        set(on) {
            this.on = on;
            if (on && !this.start()) return;
            if (!this.ac) return;
            if (on) this.ac.resume();
            this.master.gain.setTargetAtTime(on ? 1 : 0, this.ac.currentTime, 0.4);
        },
        wind(w) {
            if (this.on && this.windGain) this.windGain.gain.setTargetAtTime(0.025 + w * 0.06, this.ac.currentTime, 0.6);
        },
        ring(strength) {
            if (!this.on || !this.ac) return;
            const ac = this.ac, now = ac.currentTime;
            const notes = [2093, 2349, 2637, 3136, 3520];
            const f = notes[Math.floor(Math.random() * notes.length)];
            for (const [m, a] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) {
                const o = ac.createOscillator();
                o.type = 'sine';
                o.frequency.value = f * m;
                const g = ac.createGain();
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.05 * a * Math.min(1, strength), now + 0.004);
                g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8 / Math.sqrt(m));
                o.connect(g).connect(this.master);
                o.start(now);
                o.stop(now + 3);
            }
        }
    };

    const soundBtn = document.getElementById('sound');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            const on = !Sound.on;
            Sound.set(on);
            soundBtn.textContent = on ? 'sound on' : 'sound off';
            soundBtn.setAttribute('aria-pressed', String(on));
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (!Sound.ac) return;
        if (document.hidden) Sound.ac.suspend(); else if (Sound.on) Sound.ac.resume();
    });

    // ── The caption's clock ──────────────────────────────────────────────

    const timeEl = document.getElementById('time');
    function updateTime() {
        if (!timeEl) return;
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase() + ' · ';
    }
    updateTime();
    setInterval(updateTime, 15000);

    // ── Run ──────────────────────────────────────────────────────────────

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        L = layout(W, H, dpr);
        if (!tex) tex = P.paper(256, 11);
        bake();
    }

    let t0 = performance.now();
    let lastFrame = 0;
    let resizeTimer = 0;

    function loop(now) {
        // ~30fps is plenty for a scene this calm, and kinder to batteries.
        if (now - lastFrame >= 32) {
            const dt = Math.min(0.05, (now - lastFrame) / 1000);
            lastFrame = now;
            const t = (now - t0) / 1000 + 40;
            stepChime(t, dt);
            Sound.wind(wind(t));
            frame(t);
        }
        requestAnimationFrame(loop);
    }

    resize();
    if (reduced || still) {
        const t = 52;
        for (let i = 0; i < 120; i++) stepChime(t - 4 + i / 30, 1 / 30);
        frame(t);
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { resize(); frame(t); }, 150);
        });
    } else {
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 150);
        });
        requestAnimationFrame(loop);
    }
})();
