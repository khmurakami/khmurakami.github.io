// Drawing the plan: lines drawn in as if by a pen, the sun across the mats,
// rooms standing up as paper walls, the crosshair, the compass.
import { WALL_H } from './house.js?v=20261124-1119';
import { wallsOf } from './geometry.js?v=20261124-1119';

// Line weights. `world` weights are in u (cut walls have real thickness);
// the rest are in pixels, thickening a little as you zoom in.
const STYLE = {
    outer: { world: 0.15, ink: 'ink' }, inner: { world: 0.085, ink: 'ink' },
    door: { px: 1.3, ink: 'ink' }, shoji: { px: 0.9, ink: 'ink' }, edge: { px: 1, ink: 'soft' },
    post: { px: 1, ink: 'ink', fill: true }, board: { px: 0.5, ink: 'faint' },
    mat: { px: 0.8, ink: 'soft' }, 'mat-planned': { px: 0.7, ink: 'faint' }, heri: { px: 1.6, ink: 'ink', alpha: 0.5 },
    hatch: { px: 0.5, ink: 'faint' }, hidden: { px: 0.8, ink: 'soft' },
    thing: { px: 1.1, ink: 'ink' }, 'thing-fine': { px: 0.7, ink: 'ink' }, cat: { px: 1.2, ink: 'ink' },
    garden: { px: 0.9, ink: 'soft' }, 'garden-fine': { px: 0.6, ink: 'faint' },
    dim: { px: 0.7, ink: 'soft' }, arrow: { px: 1.1, ink: 'ink' }
};
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function palette() {
    const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
    return { paper: v('--paper'), ink: v('--ink'), soft: v('--soft'), faint: v('--faint'), accent: v('--accent'), wash: v('--wash') };
}

/** Draw part of a path: the first fraction f of its length. */
function partial(g, cam, p, f, z = 0) {
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    let left = p.len * f;
    g.beginPath();
    let pen = false;
    const to = q => { if (!q) { pen = false; return; } if (pen) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); pen = true; };
    to(cam.project(pts[0][0], pts[0][1], z));
    for (let i = 1; i < pts.length && left > 0; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay), k = Math.min(1, left / L);
        // Long lines are cut into pieces close up, so a line passing beside the camera bends with the view.
        const n = cam.near > 0.05 ? Math.max(1, Math.ceil(L * k / 0.25)) : 1;
        for (let j = 1; j <= n; j++) { const t = (k * j) / n; to(cam.project(ax + (bx - ax) * t, ay + (by - ay) * t, z)); }
        left -= L;
    }
}
const ok = (...qs) => qs.every(Boolean);
/** Fill a floor polygon, if all of it is in front of the camera. */
function floor(g, cam, pts) {
    const q = pts.map(([x, y, z]) => cam.project(x, y, z || 0));
    if (!ok(...q)) return false;
    g.beginPath(); q.forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
    return true;
}

/** The whole plan. `room(id)` says how present a room's own lines are (dimmed when another stands up). */
export function drawPlan(g, cam, art, T, col, room) {
    const z = cam.zoom.v;
    g.lineCap = 'square'; g.lineJoin = 'miter';
    for (const p of art.paths) {
        const f = ease((T - p.t) / p.d);
        if (f <= 0) continue;
        const st = STYLE[p.kind];
        g.globalAlpha = (st.alpha ?? 1) * (p.room ? room(p.room) : room(null));
        g.strokeStyle = g.fillStyle = col[st.ink];
        g.lineWidth = st.world ? Math.min(st.world * cam.ppu * z, cam.near > 0.2 ? 3 : 1e9) : st.px * Math.min(1.8, Math.sqrt(z));
        g.setLineDash(p.dash ? p.dash.map(d => d * Math.min(1.6, Math.sqrt(z))) : []);
        partial(g, cam, p, f);
        if (st.fill && f >= 1 && cam.near < 0.2) { g.closePath(); g.fill(); } else g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
}

export function drawLabels(g, cam, art, T, col, room) {
    g.textBaseline = 'middle';
    // At a small scale a drawing keeps only its main words, as a printed plan would.
    const s = cam.ppu * cam.zoom.v, keep = l => (l.kind === 'room' ? true : l.kind === 'tiny' || l.kind === 'dim' ? s >= 46 : s >= 38);
    const fadeOut = 1 - Math.min(1, cam.near * 3);
    if (fadeOut <= 0) return;
    for (const l of art.labels) {
        if (!keep(l)) continue;
        const f = ease((T - l.t) / 0.35);
        if (f <= 0) continue;
        const text = l.text.slice(0, Math.ceil(l.text.length * f));
        const big = l.kind === 'room';
        g.font = big ? '500 15px Geist, ui-sans-serif, system-ui, sans-serif' : '400 10px "Geist Mono", ui-monospace, monospace';
        if ('letterSpacing' in g) g.letterSpacing = big ? '-0.01em' : '0.08em';
        g.fillStyle = l.kind === 'room-planned' || l.kind === 'tiny' || l.kind === 'dim' ? col.soft : l.kind === 'sub' ? col.soft : col.ink;
        g.globalAlpha = (l.room ? room(l.room) : room(null)) * fadeOut;
        g.textAlign = l.align || 'center';
        const q = cam.project(l.x, l.y);
        if (!q) continue;
        const [x, y0] = q, y = y0 + (l.dy || 0);
        // Words sit on a patch of clean paper, as on a real drawing, so lines never run through them.
        if (l.kind !== 'dim' || !l.turn) {
            const m = g.measureText(text), w = m.width + 8, h = big ? 18 : 13, a = g.textAlign;
            const x0 = a === 'right' ? x - w + 4 : a === 'left' ? x - 4 : x - w / 2;
            const keep = g.fillStyle;
            g.fillStyle = col.paper; g.fillRect(x0, y - h / 2, w, h); g.fillStyle = keep;
        }
        if (l.turn) { g.save(); g.translate(x, y); g.rotate(-Math.PI / 2 + cam.base); g.fillText(text, 0, 0); g.restore(); }
        else g.fillText(text, x, y);
    }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.globalAlpha = 1;
}

/** Where the sun is now, roughly, for wherever the visitor is: azimuth from north, and height. */
export function sunNow(date = new Date()) {
    const h = date.getHours() + date.getMinutes() / 60;
    if (h < 6 || h > 18.5) return null;
    const k = (h - 6) / 12.5;
    return { az: (90 + k * 180) * Math.PI / 180, alt: Math.max(0.12, Math.sin(Math.PI * k)) * 1.05 };
}

/** Sunlight through the shoji along the south, falling across the mats, with the lattice's shadow in it. */
export function drawSun(g, cam, sun, col, fade) {
    fade *= 1 - Math.min(1, cam.near * 2);
    if (!sun || fade <= 0) return;
    const into = [-Math.sin(sun.az), Math.cos(sun.az)];     // the way the light travels across the floor
    if (into[1] >= -0.05) return;                           // the sun is behind the house
    const L = Math.min(4, 2 / Math.tan(sun.alt)), d = [into[0] * L, into[1] * L];
    const poly = [[0, 5], [10, 5], [10 + d[0], 5 + d[1]], [0 + d[0], 5 + d[1]]];
    if (!ok(...poly.map(([x, y]) => cam.project(x, y)), ...[[0, 1], [10, 1]].map(([x, y]) => cam.project(x, y)))) return;
    g.save();
    // Only the rooms take the light; the corridor wall stops it.
    g.beginPath();
    for (const [x, y] of [[0, 1], [10, 1], [10, 5], [0, 5]].map(([x, y]) => cam.project(x, y))) g.lineTo(x, y);
    g.closePath(); g.clip();
    g.beginPath();
    for (const [x, y] of poly.map(([x, y]) => cam.project(x, y))) g.lineTo(x, y);
    g.closePath();
    g.globalAlpha = 0.14 * fade; g.fillStyle = col.wash; g.fill();
    // The shoji's bars, as lines of shadow running with the light.
    g.globalAlpha = 0.22 * fade; g.strokeStyle = col.accent; g.lineWidth = 0.6;
    for (let x = 0.45; x < 10; x += 0.45) {
        const [ax, ay] = cam.project(x, 5), [bx, by] = cam.project(x + d[0], 5 + d[1]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    for (let v = 0.25; v < 1; v += 0.25) {
        const [ax, ay] = cam.project(d[0] * v, 5 + d[1] * v), [bx, by] = cam.project(10 + d[0] * v, 5 + d[1] * v);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    g.restore();
}

/** A compass at the house's north-east corner, with today's sun path and where the sun is now. */
export function drawCompass(g, cam, sun, col, fade) {
    fade *= 1 - Math.min(1, cam.near * 3);
    if (fade <= 0) return;
    const c = [11.25, -0.55], r = 0.42;
    g.save(); g.globalAlpha = fade;
    const pts = n => Array.from({ length: n + 1 }, (_, i) => i / n);
    g.strokeStyle = col.soft; g.lineWidth = 0.8;
    g.beginPath(); for (const k of pts(48)) { const [x, y] = cam.project(c[0] + Math.cos(k * Math.PI * 2) * r, c[1] + Math.sin(k * Math.PI * 2) * r); g.lineTo(x, y); } g.stroke();
    // North: a needle, ink, and the letter.
    const [nx, ny] = cam.project(c[0], c[1] - r * 1.25), [sx, sy] = cam.project(c[0], c[1] + r * 0.6), [lx, ly] = cam.project(c[0] - 0.09, c[1]), [rx, ry] = cam.project(c[0] + 0.09, c[1]);
    g.fillStyle = col.ink; g.beginPath(); g.moveTo(nx, ny); g.lineTo(rx, ry); g.lineTo(sx, sy); g.lineTo(lx, ly); g.closePath(); g.fill();
    const [tx, ty] = cam.project(c[0], c[1] - r * 1.65);
    g.font = '400 10px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', tx, ty);
    // The sun's path from east to west through the south, and the sun.
    g.setLineDash([2, 3]); g.strokeStyle = col.accent; g.beginPath();
    for (const k of pts(24)) { const a = (90 + k * 180) * Math.PI / 180, [x, y] = cam.project(c[0] + Math.sin(a) * r * 1.35, c[1] - Math.cos(a) * r * 1.35); g.lineTo(x, y); }
    g.stroke(); g.setLineDash([]);
    if (sun) { const [x, y] = cam.project(c[0] + Math.sin(sun.az) * r * 1.35, c[1] - Math.cos(sun.az) * r * 1.35); g.fillStyle = col.accent; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
    g.restore();
}

/**
 * A room standing up: its four walls hinge up off the paper, one after another,
 * like a box folded up from its net. `hinge[i]` is 0 (flat, folded out) to 1 (upright);
 * `open` slides the doors in the north wall apart.
 */
export function drawStanding(g, cam, r, hinge, open, lift, col) {
    if (lift <= 0.002) return;
    const H = WALL_H;
    const walls = wallsOf(r).map((w, i) => {
        const th = hinge[i] * Math.PI / 2;
        const top = p => [p[0] + w.n[0] * H * Math.cos(th), p[1] + w.n[1] * H * Math.cos(th), H * Math.sin(th)];
        const at = (u, v) => { const bx = w.a[0] + (w.b[0] - w.a[0]) * u, by = w.a[1] + (w.b[1] - w.a[1]) * u; const t = top([bx, by]); return [bx + (t[0] - bx) * v, by + (t[1] - by) * v, t[2] * v]; };
        const mid = at(0.5, 0.5);
        return { w, at, th, depth: cam.depth(...mid) };
    }).sort((a, b) => a.depth - b.depth);
    g.save();
    g.lineJoin = 'round';
    for (const { w, at } of walls) {
        const P = (u, v) => cam.project(...at(u, v));
        const quad = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
        if (!ok(...quad)) continue;
        g.globalAlpha = Math.min(1, lift * 1.4);
        g.beginPath(); quad.forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
        g.fillStyle = col.paper;
        if (w.door && open > 0.01) {
            // Paper either side of the open door; the gap is left for what's behind it.
            const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), gap = (open * 0.92) / len;
            for (const [u0, u1] of [[0, 0.5 - gap], [0.5 + gap, 1]]) {
                const side = [P(u0, 0), P(u1, 0), P(u1, 1), P(u0, 1)];
                if (!ok(...side)) continue;
                g.beginPath(); side.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill();
            }
            g.beginPath(); quad.forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
        } else g.fill();
        g.strokeStyle = col.ink; g.lineWidth = 1.2; g.stroke();
        const line = (u0, v0, u1, v1, wdt = 0.7, c = col.ink) => { const A = P(u0, v0), B = P(u1, v1); if (!ok(A, B)) return; const [ax, ay] = A, [bx, by] = B; g.strokeStyle = c; g.lineWidth = wdt; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        if (w.type === 'shoji') {
            // A paper screen: a grid of light bars over a low wooden kick-board.
            for (let u = 0.45; u < len; u += 0.45) line(u / len, 0.12, u / len, 1, 0.5, col.soft);
            for (let v = 0.12; v < 1; v += 0.17) line(0, v, 1, v, 0.5, col.soft);
            line(0, 0.12, 1, 0.12, 0.9);
        } else if (w.type === 'fusuma') {
            // Sliding panels, each with a round recessed pull; the middle two slide apart in a door.
            const n = Math.max(2, Math.round(len / 0.95)), pw = 1 / n;
            for (let i = 0; i < n; i++) {
                let u0 = i * pw;
                if (w.door && n >= 3) { const mid = (n - 1) / 2; if (i === Math.floor(mid)) u0 -= open * pw * 0.92; if (i === Math.ceil(mid) && n % 2 === 0) u0 += open * pw * 0.92; }
                line(u0, 0, u0, 1, 0.6, col.soft); line(u0 + pw, 0, u0 + pw, 1, 0.6, col.soft);
                const hp = P(u0 + pw * (i % 2 ? 0.15 : 0.85), 0.45);
                if (!hp) continue;
                g.beginPath(); g.arc(hp[0], hp[1], 2.2 + 5 * (cam.near || 0), 0, Math.PI * 2); g.strokeStyle = col.soft; g.lineWidth = 0.6; g.stroke();
            }
            line(0, 0.92, 1, 0.92, 0.5, col.soft);
        } else {
            line(0, 0.07, 1, 0.07, 0.5, col.soft);
        }
    }
    g.restore();
}

/** The drafting crosshair, snapped to a wall when it's close to one, with where you are in metres. */
export function drawCrosshair(g, cam, ptr, snap, col, info) {
    if (!ptr) return;
    const [x, y] = snap ? snap.at : [ptr.x, ptr.y];
    g.save();
    g.strokeStyle = col.ink; g.globalAlpha = 0.16; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(cam.w, Math.round(y) + 0.5); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, cam.h); g.stroke();
    g.globalAlpha = 1; g.strokeStyle = snap ? col.accent : col.ink; g.lineWidth = 1;
    g.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
    g.font = '400 10px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    if ('letterSpacing' in g) g.letterSpacing = '0.06em';
    const w = Math.max(...info.map(l => g.measureText(l).width)) + 10;
    g.fillStyle = col.paper; g.globalAlpha = 0.92; g.fillRect(x + 7, y + 6, w, info.length * 13 + 6); g.globalAlpha = 1;
    g.fillStyle = snap ? col.accent : col.soft;
    info.forEach((line, i) => g.fillText(line, x + 12, y + 10 + i * 13));
    g.restore();
}

/** A room under the pointer: its outline in full ink, and the faintest wash, so you can see what a click would choose. */
export function drawHot(g, cam, r, k, col) {
    if (!r || k <= 0.01) return;
    g.save();
    if (!floor(g, cam, [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]])) { g.restore(); return; }
    g.globalAlpha = 0.06 * k; g.fillStyle = col.accent; g.fill();
    g.globalAlpha = k; g.strokeStyle = col.ink; g.lineWidth = 2; g.stroke();
    g.restore();
}

/**
 * The way in, drawn as architects draw circulation: a dashed line from the
 * entry along the corridor to a room's door, with footsteps along it.
 * `k` is how far along it is drawn, 0 to 1.
 */
export function drawRoute(g, cam, route, k, col) {
    if (k <= 0) return;
    let total = 0;
    const segs = route.slice(1).map((b, i) => { const a = route[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); total += L; return { a, b, L }; });
    let left = total * k;
    g.save();
    g.strokeStyle = col.accent; g.fillStyle = col.accent; g.lineWidth = 1.4; g.setLineDash([6, 5]);
    g.beginPath();
    let pen = false, walked = 0;
    const to = q => { if (!q) { pen = false; return; } if (pen) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); pen = true; };
    to(cam.project(...route[0]));
    const steps = [];
    for (const { a, b, L } of segs) {
        if (left <= 0) break;
        const t = Math.min(1, left / L), n = Math.max(1, Math.ceil(L * t / 0.2));
        for (let j = 1; j <= n; j++) to(cam.project(a[0] + (b[0] - a[0]) * t * j / n, a[1] + (b[1] - a[1]) * t * j / n));
        // A footstep every 0.42 u, left and right of the line.
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        for (let s = Math.ceil(walked / 0.42) * 0.42 - walked; s <= L * t; s += 0.42) {
            const i = Math.round((walked + s) / 0.42), side = i % 2 ? 1 : -1;
            steps.push([a[0] + ux * s - uy * side * 0.12, a[1] + uy * s + ux * side * 0.12, ux, uy]);
        }
        walked += L; left -= L;
    }
    g.stroke();
    g.setLineDash([]);
    for (const [x, y, ux, uy] of steps) {
        const pts = [[-0.07, -0.035], [0.07, -0.035], [0.07, 0.035], [-0.07, 0.035]].map(([u, v]) => cam.project(x + ux * u - uy * v, y + uy * u + ux * v));
        if (!ok(...pts)) continue;
        g.beginPath(); pts.forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.globalAlpha = 0.7; g.fill(); g.globalAlpha = 1;
    }
    g.restore();
}

/**
 * The doorway, once its door slides: the work in colour, seen through the gap,
 * and warm light from it spilling across the corridor floor. Everything around
 * it stays drawing.
 */
export function drawDoorway(g, cam, door, img, open, col) {
    if (open <= 0.01 || !img || !img.complete || !img.naturalWidth) return;
    const { x, y, half, h } = door, w = half * open;
    // Light on the corridor floor, in front of the door.
    g.save();
    if (floor(g, cam, [[x - w, y], [x + w, y], [x + w * 1.6, y - 0.9], [x - w * 1.6, y - 0.9]])) { g.globalAlpha = 0.16 * open; g.fillStyle = col.wash; g.fill(); }
    g.restore();
    const q = [[x - w, y, 0], [x + w, y, 0], [x + w, y, h], [x - w, y, h]].map(p => cam.project(...p));
    // What's beyond the door is the work as you'll see it once inside, at full size: the gap only reveals it.
    // In the doorway or through it, it's all there is.
    const through = cam.C[1] > y - 0.15 || !ok(...q);
    g.save();
    if (!through) { g.beginPath(); q.forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.clip(); }
    g.drawImage(img, ...cover(img, 0, 0, cam.w, cam.h));
    g.restore();
    if (through) return;
    g.strokeStyle = col.ink; g.lineWidth = 1.2;
    g.beginPath(); q.forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.stroke();
}

/** Where to draw an image so it covers a box, cropping what spills over. */
function cover(img, x, y, w, h) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    return [x + (w - iw) / 2, y + (h - ih) / 2, iw, ih];
}
