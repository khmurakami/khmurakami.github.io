// The room and the things in it, each painted as its own pixel sprite.

import { Pixel, R, clamp, lerp } from './base.js?v=20261124-1101';
import { sprite } from './camera.js?v=20261124-1101';
import { px } from './frame.js?v=20261124-1101';
import { PAL } from './palette.js?v=20261124-1101';
import { A, S, cam } from './state.js?v=20261124-1101';

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
function cat(x, z, awake, how = '') {
    if (how === 'stretch') return catStretch(x, z);
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
        if (awake && how !== 'blink') { s.set(eX, ey, 1, 1, 1); s.set(eX, ey + 1, 0, 1, 1); }
        else { s.set(eX - 1, ey, 0.05, 0, 1); s.set(eX, ey, 0.05, 0, 1); }
    }
    s.set(hx, hy + hr * 0.45, 0.5, 4, 1);                                                             // nose
    const canvas = s.paint([PAL.tabby, PAL.catEye, PAL.creamSun, PAL.shadow, PAL.flesh], { outline: 'sel' });
    const eyes = [-1, 1].map(side => ({ x: Math.round(hx + side * hr * 0.42), y: Math.round(hy + hr * 0.05) }));
    return { canvas, head: { x: Math.round(hx), y: Math.round(hy - hr * 1.5), eyes } };
}

/** The cat mid-stretch: front paws out along the boards, chest down, rump and tail up, yawning. */
function catStretch(x, z) {
    const { p, f } = cam, s = sprite(), c = p(x, 0, z), k = f / z;
    const lit = (dx, dy) => 0.55 + 0.4 * clamp(-dx * 0.45 - dy * 0.85, -1, 1);
    const stripe = X => (Math.floor((X - c.x) / Math.max(2, 0.045 * k)) & 1 ? -0.16 : 0);
    s.ellipse(c.x - 0.02 * k, c.y, 0.3 * k, Math.max(1.5, 0.03 * k), 0, 3);                       // shadow
    // The rump, high at the back; the chest, low at the front.
    const rx = c.x + 0.1 * k, ry = c.y - 0.12 * k;
    s.ellipse(rx, ry, 0.13 * k, 0.1 * k, (dx, dy, X) => lit(dx, dy) + stripe(X), 0);
    s.ellipse(c.x - 0.06 * k, c.y - 0.075 * k, 0.15 * k, 0.065 * k, (dx, dy, X) => lit(dx, dy) + stripe(X), 0);
    // Hind legs straight down, front legs out along the floor.
    for (const lx of [0.15, 0.06]) s.rect(c.x + lx * k - 1, ry, c.x + lx * k + 1, c.y, 0.4, 0, 1);
    for (const [dy, v] of [[-0.022, 0.75], [0.0, 0.45]]) {
        const y = Math.round(c.y + dy * k) - 1;
        s.line(c.x - 0.34 * k, y, c.x - 0.12 * k, y, v, 0, 1);
        s.set(c.x - 0.36 * k, y, 0.9, 2, 1); s.set(c.x - 0.36 * k + 1, y, 0.9, 2, 1);
    }
    // The tail, up and curling over at the tip.
    for (let i = 0; i <= 12; i++) {
        const u = i / 12, tx = rx + 0.1 * k + Math.sin(u * 1.2) * 0.07 * k, ty = ry - 0.04 * k - u * 0.2 * k + u * u * u * 0.05 * k;
        s.set(tx, ty, 0.5 + (i & 2 ? -0.18 : 0), 0, 1); s.set(tx + 1, ty, 0.62 + (i & 2 ? -0.18 : 0), 0, 1);
    }
    // The head low between the paws, ears laid back, eyes shut, mouth open in a yawn.
    const hr = Math.max(3, 0.075 * k), hx = c.x - 0.26 * k, hy = c.y - 0.075 * k;
    s.ellipse(hx, hy, hr * 1.1, hr * 0.95, (dx, dy) => lit(dx, dy), 0);
    for (const side of [-1, 1]) {
        const ex = hx + side * hr * 0.6;
        s.poly([{ x: ex - hr * 0.45, y: hy - hr * 0.5 }, { x: ex + side * hr * 0.55, y: hy - hr * 1.15 }, { x: ex + hr * 0.4, y: hy - hr * 0.45 }], side < 0 ? 0.85 : 0.55, 0);
        const ey = Math.round(hy - hr * 0.05), eX = Math.round(hx + side * hr * 0.42);
        s.set(eX - 1, ey, 0.05, 0, 1); s.set(eX, ey, 0.05, 0, 1);
    }
    s.ellipse(hx, hy + hr * 0.5, Math.max(1, hr * 0.28), Math.max(1, hr * 0.32), 0.6, 4, 1);          // the yawn
    const canvas = s.paint([PAL.tabby, PAL.catEye, PAL.creamSun, PAL.shadow, PAL.flesh], { outline: 'sel' });
    return { canvas, head: { x: Math.round(hx), y: Math.round(hy - hr * 1.3) } };
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


/** The hanging scroll on the side wall: a little painting of the season, in perspective on the wall. */
function hangingScroll(season) {
    const { f, cx, ye, camX, camH } = cam, s = sprite(), X = R.half - 0.012, zA = 3.46, zB = 3.12, yT = 1.92, yB = 0.82;
    const xs = z => cx + ((X - camX) * f) / z, ys = (y, z) => ye - ((y - camH) * f) / z;
    const x0 = Math.floor(xs(zA)) - 3, x1 = Math.ceil(xs(zB)) + 3, y0 = Math.floor(ys(yT + 0.3, zB)), y1 = Math.ceil(ys(yB - 0.06, zB));
    if (x1 < 0 || x0 > A.LW) return null;
    const M = { wood: 0, mount: 1, gold: 2, silk: 3, ink: 4, pink: 5, red: 6, orange: 7, green: 8, moon: 9, blue: 10, snow: 11 };
    const pw = Math.max(4, (xs(zB) - xs(zA)) * 0.7), ph = Math.max(8, (ys(yB, zB) - ys(yT, zB)) * 0.61), asp = ph / pw;
    const dot = (pu, pv, cu, cv, r) => Math.hypot(pu - cu, (pv - cv) * asp) < r;
    const motif = (pu, pv) => {
        if (pu > 0.72 && pu < 0.86 && pv > 0.86 && pv < 0.95) return [0.6, M.red];                        // the seal
        if (season === 'spring') {
            for (const [u, v] of [[0.25, 0.33], [0.42, 0.42], [0.6, 0.5], [0.78, 0.6], [0.36, 0.25], [0.55, 0.62]]) if (dot(pu, pv, u, v, 0.1)) return [dot(pu, pv, u, v, 0.04) ? 0.95 : 0.55, M.pink];
            const t = clamp(((pu - 0.05) * 0.8 + (pv - 0.22) * 0.4 * asp) / (0.64 + 0.16 * asp), 0, 1);
            if (Math.hypot(pu - lerp(0.05, 0.85, t), (pv - lerp(0.22, 0.66, t)) * asp) < 0.05) return [0.4, M.ink];
        } else if (season === 'summer') {
            for (const [u, v, r] of [[0.45, 0.38, 0.2], [0.62, 0.66, 0.15]]) {
                if (Math.hypot((pu - u) / r, (pv - v) * asp / (r * 0.55)) < 1) return [pu < u ? 0.75 : 0.5, M.orange];
                if (pu > u + r * 0.8 && pu < u + r * 1.5 && Math.abs((pv - v) * asp) < (pu - u - r * 0.8) * 0.9) return [0.4, M.red];
            }
            if ((Math.abs(pv - 0.2) < 0.012 && pu > 0.2 && pu < 0.5) || (Math.abs(pv - 0.85) < 0.012 && pu > 0.1 && pu < 0.45)) return [0.5, M.blue];
        } else if (season === 'autumn') {
            if (dot(pu, pv, 0.62, 0.26, 0.24)) return [0.8, M.moon];
            for (const [u, v] of [[0.28, 0.56], [0.5, 0.74], [0.72, 0.62]]) if (dot(pu, pv, u, v, 0.08)) return [0.55, M.red];
            if (Math.abs(pu - 0.2 - (pv - 0.4) * 0.3) < 0.03 && pv > 0.4) return [0.35, M.ink];
        } else {
            if (dot(pu, pv, 0.5, 0.44, 0.06)) return [0.9, M.gold];
            if (dot(pu, pv, 0.5, 0.44, 0.17)) return [0.55, M.red];
            for (const [u, v] of [[0.3, 0.6], [0.7, 0.64], [0.5, 0.72]]) if (dot(pu, pv, u, v, 0.14)) return (pv - v) * asp < -0.06 ? [0.9, M.snow] : [0.45, M.green];
        }
        return null;
    };
    s.shape(x0, y0, x1, y1, (Xs, Ys) => {
        const z = ((X - camX) * f) / Math.max(0.01, Xs - cx), y = camH - ((Ys - ye) * z) / f;
        const u = (zA - z) / (zA - zB), v = (yT - y) / (yT - yB);
        // The cord to its hook, and the roller with its two knobs.
        if (v < 0 && v > -0.16 && u > -0.05 && u < 1.05) {
            const reach = (v + 0.16) / 0.16 * 0.5;
            if (Math.abs(Math.abs(u - 0.5) - reach) < 0.06) return [0.3, M.wood];
            if (v < -0.14 && Math.abs(u - 0.5) < 0.08) return [0.6, M.gold];
            return null;
        }
        if (v >= 0.965 && v <= 1.03 && u > -0.14 && u < 1.14) return u < 0 || u > 1 ? [0.85, M.gold] : [v < 0.99 ? 0.6 : 0.3, M.wood];
        if (u < 0 || u > 1 || v < 0 || v > 1) return null;
        if (v < 0.03) return [0.45, M.wood];
        const inU = u > 0.15 && u < 0.85;
        if (inU && v > 0.17 && v < 0.78) return motif((u - 0.15) / 0.7, (v - 0.17) / 0.61) || [0.7 - v * 0.15, M.silk];
        if (inU && ((v > 0.14 && v <= 0.17) || (v >= 0.78 && v < 0.81))) return [0.55, M.gold];
        if (v < 0.3 && (Math.abs(u - 0.34) < 0.04 || Math.abs(u - 0.66) < 0.04)) return [0.7, M.mount];
        return [((Xs + Ys) & 3) ? 0.42 : 0.55, M.mount];
    });
    return s.paint([PAL.scrollWood, PAL.mount, PAL.gold, PAL.silk, PAL.ink, PAL.pinkB, PAL.redB, PAL.orangeB, PAL.greenB, PAL.moonB, PAL.blueB, PAL.snowB], { outline: 'sel' });
}

/** A stack of four books lying on the mats: what I've made. Spines and page edges toward the room. */
function bookStack(x, z) {
    const { p, f } = cam, s = sprite(), c = p(x, 0, z), k = f / z;
    s.ellipse(c.x + 0.02 * k, c.y, 0.2 * k, Math.max(1.5, 0.03 * k), 0, 5);
    let y = 0;
    [[0.05, 0.3, 0, 0], [0.038, 0.27, 0.018, -0.01], [0.052, 0.29, -0.02, 0.015], [0.04, 0.24, 0.01, 0]].forEach(([h, w, ox, oz], i) => {
        const x0 = x - w / 2 + ox, x1 = x + w / 2 + ox, z0 = z - 0.1 + oz, z1 = z + 0.1 + oz, y0 = y, y1 = y + h;
        s.poly([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], 0.75, i);
        if (x0 > cam.camX) s.poly([p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)], 0.2, i);
        const a = p(x0, y0, z0), b = p(x1, y1, z0);
        if (i % 2 === 0) {
            s.rect(a.x, b.y, b.x, a.y, 0.45, i);
            s.rect(lerp(a.x, b.x, 0.3), b.y + 1, lerp(a.x, b.x, 0.55), a.y - 1, 0.9, 4, 1);
        } else {
            s.rect(a.x, b.y, b.x, a.y, 0.6, 4);
            s.line(a.x, b.y, b.x, b.y, 0.5, i, 1); s.line(a.x, a.y, b.x, a.y, 0.35, i, 1);
        }
        y = y1;
    });
    return s.paint([PAL.book0, PAL.book1, PAL.book2, PAL.book3, PAL.pages, PAL.shadow], { outline: 'sel' });
}

/** A little tabletop crane game: pink, a glass box of plushies, a sign of bulbs; what you've won sits beside it. */
function craneToy(x, z, won = [], sc = 1) {
    const { p, f } = cam, s = sprite(), k = f / z, hw = 0.11 * sc, dz = 0.08 * sc, Y = v => v * sc;
    const M = { pink: 0, glass: 1, gold: 2, bulb: 3, orange: 4, red: 5, snow: 6, shadow: 7 };
    const c = p(x, 0, z);
    s.ellipse(c.x + 0.02 * k, c.y, 0.16 * sc * k, Math.max(1.5, 0.03 * k), 0, M.shadow);
    const face = (y0, y1, v, m) => { const a = p(x - hw, y0, z - dz), b = p(x + hw, y1, z - dz); s.rect(a.x, b.y, b.x, a.y, v, m); return { a, b }; };
    if (x - hw > cam.camX) s.poly([p(x - hw, 0, z - dz), p(x - hw, Y(0.34), z - dz), p(x - hw, Y(0.34), z + dz), p(x - hw, 0, z + dz)], 0.25, M.pink);
    else if (x + hw < cam.camX) s.poly([p(x + hw, 0, z - dz), p(x + hw, Y(0.34), z - dz), p(x + hw, Y(0.34), z + dz), p(x + hw, 0, z + dz)], 0.25, M.pink);
    s.poly([p(x - hw, Y(0.34), z - dz), p(x + hw, Y(0.34), z - dz), p(x + hw, Y(0.34), z + dz), p(x - hw, Y(0.34), z + dz)], 0.95, M.pink);
    const body = face(0, Y(0.13), 0.55, M.pink), glass = face(Y(0.13), Y(0.29), 0.3, M.glass), sign = face(Y(0.29), Y(0.34), 0.8, M.pink);
    // Inside the glass: a heap of plushies, and the claw hanging over them.
    const gw = glass.b.x - glass.a.x, gy = glass.a.y - 1;
    [[0.2, M.orange], [0.38, M.snow], [0.55, M.red], [0.72, M.snow], [0.3, M.red, 1], [0.62, M.orange, 1]].forEach(([u, m, up]) => {
        const px = glass.a.x + gw * u, r = Math.max(1, 0.022 * sc * k);
        s.ellipse(px, gy - r - (up ? r * 1.4 : 0), r, r, 0.7, m, 1);
    });
    const cx = glass.a.x + gw * 0.6;
    s.line(cx, glass.b.y + 1, cx, glass.b.y + (gy - glass.b.y) * 0.4, 0.9, M.gold, 1);
    s.set(cx - 1, glass.b.y + (gy - glass.b.y) * 0.4 + 1, 0.8, M.gold, 1); s.set(cx + 1, glass.b.y + (gy - glass.b.y) * 0.4 + 1, 0.8, M.gold, 1);
    s.line(glass.a.x + gw * 0.15, glass.b.y + 1, glass.a.x + gw * 0.02, glass.b.y + (gy - glass.b.y) * 0.6, 1, M.glass, 1);
    // The sign's bulbs, and the two buttons and the coin slot on the front.
    for (let X = Math.round(sign.a.x) + 1; X < sign.b.x; X += 2) s.set(X, Math.round((sign.a.y + sign.b.y) / 2), 0.9, M.bulb, 1);
    const by = body.b.y + (body.a.y - body.b.y) * 0.35, bw = body.b.x - body.a.x;
    s.set(body.a.x + bw * 0.3, by, 0.8, M.glass, 1); s.set(body.a.x + bw * 0.45, by, 0.9, M.bulb, 1);
    s.line(body.a.x + bw * 0.78, by - 1, body.a.x + bw * 0.78, by + 1, 0.1, M.pink, 1);
    // What you've won, lined up on its roof.
    const KIND = { neko: M.orange, daruma: M.red, usagi: M.snow, onigiri: M.snow, kingyo: M.red, panda: M.snow };
    const top = won.slice(-3);
    top.forEach((kind, i) => {
        const q = p(x + hw * ((i + 0.5) / top.length * 1.6 - 0.8), Y(0.34), z), r = Math.max(1, 0.03 * sc * k);
        s.ellipse(q.x, q.y - r, r, r, (dx, dy) => 0.6 - dy * 0.3 - dx * 0.2, KIND[kind] ?? M.snow);
    });
    return s.paint([PAL.cranePink, PAL.craneGlass, PAL.gold, PAL.moonB, PAL.orangeB, PAL.redB, PAL.snowB, PAL.shadow], { outline: 'sel' });
}

export { SUN, bakeRoom, bookStack, cat, catStretch, craneToy, eave, engawa, futon, hangingScroll, laptop, lintel, onPlane, pig, posts, radio, shoji, snack, sunAt, tatami, tray, uchiwa };
