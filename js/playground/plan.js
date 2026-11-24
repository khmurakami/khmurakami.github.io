// The playground: the house drawn as a plan that draws itself in, rooms that
// stand up when you come near, and a way into each work.
//
// Pointer: hover a room to stand it up, click to go in, drag to move the
// paper, scroll to zoom (keep zooming into a room to fall into it),
// double-click to see the whole house. Touch: tap to stand up, tap again to
// go in, drag, pinch. Keys: arrows move between rooms, Enter goes in, Esc
// steps back, + − zoom, 0 shows the whole house.
import { HOUSE, U } from './house.js?v=20261124-1048';
import { buildDrawing } from './geometry.js?v=20261124-1048';
import { Camera, Spring } from './camera.js?v=20261124-1048';
import { palette, drawPlan, drawLabels, drawSun, drawCompass, drawStanding, drawCrosshair, sunNow } from './draw.js?v=20261124-1048';
import { WORKS } from './works.js?v=20261124-1048';

const canvas = document.getElementById('plan'), g = canvas.getContext('2d');
const card = document.getElementById('room-card');
const query = new URLSearchParams(location.search);
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const art = buildDrawing();
const cam = new Camera();
const work = id => WORKS.find(w => w.id === id);
const rooms = HOUSE.rooms.map(r => ({ ...r, n: r.rev.charCodeAt(0) - 64, lift: new Spring(0, 140, 18), open: new Spring(0, 90, 16), hinge: [0, 1, 2, 3].map(() => new Spring(0, 160, 13)) }));
let col = palette();
let T0 = performance.now() + 250, active = null, dim = new Spring(0, 90, 18), entering = false;
let view = { x: 5, y: 3.4, zoom: 1 }, ptr = null, snap = null, raf = 0, last = 0, hoverTimer = 0;
let sun = sunNow();

// ── Fitting the drawing to the screen ───────────────────────────────────
const BOUNDS = { x0: -1.5, x1: 12.0, y0: -1.3, y1: 8.4 };
function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tall = H > W * 1.1;
    cam.base = tall ? -Math.PI / 2 : 0;
    cam.w = W; cam.h = H;
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0, [sw, sh] = tall ? [bh, bw] : [bw, bh];
    // Leave room for the title block: beside the house on a wide screen, under it on a tall one.
    cam.ppu = Math.min((W * (tall ? 0.92 : 0.78)) / sw, (H * (tall ? 0.7 : 0.86)) / sh);
    cam.cx = tall ? 0.5 : 0.42; cam.cy = tall ? 0.4 : 0.5;
    view = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 - 0.3, zoom: 1 };
    aim(true);
    wake();
}

/** Point the camera: at the view the visitor chose, or leaning in to the room that stands up. */
function aim(now = false) {
    const r = active && rooms.find(x => x.id === active);
    const lean = r && !calm.matches;
    const tx = lean ? view.x + (r.x + r.w / 2 - view.x) * 0.45 : view.x;
    const ty = lean ? view.y + (r.y + r.h / 2 - view.y) * 0.45 : view.y;
    const set = (s, v) => (now ? s.set(v) : (s.to = v));
    set(cam.x, tx); set(cam.y, ty);
    set(cam.zoom, view.zoom * (lean ? 1.16 : 1));
    set(cam.pitch, lean ? 0.62 : 0);
    set(cam.yaw, lean ? -0.1 : 0);
}

// ── Rooms standing up ───────────────────────────────────────────────────
const timers = [];
function choose(id) {
    if (id === active || entering) return;
    timers.splice(0).forEach(clearTimeout);
    const prev = active && rooms.find(r => r.id === active);
    if (prev) { prev.lift.to = 0; prev.open.to = 0; prev.hinge.forEach((h, i) => timers.push(setTimeout(() => { h.to = 0; wake(); }, (3 - i) * 40))); }
    active = id;
    const r = id && rooms.find(x => x.id === id);
    dim.to = r ? 1 : 0;
    if (r) {
        r.lift.to = 1;
        // The walls fold up one after another: back first, so the room opens toward you.
        // The wall nearest you stays folded down, so you look into the room over it.
        const near = nearestWall(r);
        r.hinge.forEach((h, i) => timers.push(setTimeout(() => { h.to = i === near ? 0.04 : 1; wake(); }, calm.matches ? 0 : 60 + [0, 1, 3, 2][i] * 75)));
        if (r.work) timers.push(setTimeout(() => { r.open.to = 1; wake(); }, calm.matches ? 0 : 420));
    }
    showCard(r);
    aim();
    wake();
}

function showCard(r) {
    if (!r) { card.hidden = true; return; }
    const w = r.work && work(r.work);
    card.hidden = false;
    card.querySelector('.n').textContent = String(r.n).padStart(2, '0');
    card.querySelector('.t').textContent = w ? w.title : 'In the works';
    card.querySelector('.l').textContent = w ? w.line : `A ${r.mats}-mat room, planned for revision ${r.rev}.`;
    const go = card.querySelector('.go');
    go.hidden = !w;
    if (w) go.href = w.href;
}
function placeCard() {
    const r = active && rooms.find(x => x.id === active);
    if (!r || card.hidden) return;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    // On a tall screen the card waits at the top, out of the room's way.
    if (cam.base !== 0) { card.style.transform = `translate(${Math.round((cam.w - cw) / 2)}px, 16px)`; return; }
    // Beside the room, level with the top of its far wall, kept on screen.
    const right = r.x + r.w < 9;
    const [x, y] = cam.project(right ? r.x + r.w : r.x, r.y + r.h * 0.35, 2.6 * r.lift.v);
    const left = Math.max(12, Math.min(cam.w - cw - 12, right ? x + 18 : x - cw - 18)), top = Math.max(12, Math.min(cam.h - ch - 12, y - ch / 2));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

/** Which of a room's walls (n, e, s, w) faces the viewer once the camera has tipped. */
function nearestWall(r) {
    const mids = [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]];
    const a = cam.base - 0.1, depth = ([x, y]) => (x - r.x) * Math.sin(a) + (y - r.y) * Math.cos(a);
    return mids.map((m, i) => [depth(m), i]).sort((p, q) => q[0] - p[0])[0][1];
}

// ── Going in ────────────────────────────────────────────────────────────
function enter(r) {
    const w = r && r.work && work(r.work);
    if (!w || entering) return;
    entering = true; card.hidden = true;
    if (calm.matches) { document.body.classList.add('leaving'); setTimeout(() => (location.href = w.href), 250); return; }
    choose(r.id);
    r.open.to = 1;
    // Down to sitting height in the doorway, looking out through the open side.
    cam.x.to = r.x + r.w / 2; cam.y.to = r.y + r.h * 0.62; cam.zoom.to = view.zoom * 3.4; cam.pitch.to = 1.05; cam.yaw.to = 0;
    setTimeout(() => {
        const [x0, y0] = cam.project(r.x, r.y, 0), [x1, y1] = cam.project(r.x + r.w, r.y + r.h, 0);
        const veil = document.createElement('div');
        veil.className = 'veil';
        veil.style.backgroundImage = `url("${w.poster}")`;
        Object.assign(veil.style, { left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
        document.body.append(veil);
        requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('open')));
        const go = () => (location.href = w.href);
        veil.addEventListener('transitionend', go, { once: true });
        setTimeout(go, 1100);
    }, 520);
    wake();
}
addEventListener('pageshow', e => {
    if (!e.persisted) return;
    entering = false; document.body.classList.remove('leaving');
    document.querySelectorAll('.veil').forEach(v => v.remove());
    choose(null); aim(); wake();
});

// ── Pointer ─────────────────────────────────────────────────────────────
const roomAt = ([x, y]) => rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
let drag = null;
const pinch = new Map();
canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pinch.set(e.pointerId, [e.clientX, e.clientY]);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: e.timeStamp, moved: false, type: e.pointerType };
});
canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { ptr = { x: e.clientX, y: e.clientY }; hover(); }
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.size === 2) return pinchMove();
    if (!drag || drag.id !== e.pointerId) return wake();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    canvas.classList.add('panning');
    const [ax, ay] = cam.unproject(drag.x, drag.y), [bx, by] = cam.unproject(e.clientX, e.clientY), dt = Math.max(1, e.timeStamp - drag.t);
    view.x -= bx - ax; view.y -= by - ay;
    drag.vx = (ax - bx) / dt; drag.vy = (ay - by) / dt;
    drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
    clampView(); aim(); cam.x.set(cam.x.to); cam.y.set(cam.y.to);
    wake();
});
canvas.addEventListener('pointerup', e => {
    pinch.delete(e.pointerId); pinchStart = null;
    canvas.classList.remove('panning');
    const d = drag; drag = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
        // Let go while moving and the paper glides on a little.
        if (e.timeStamp - d.t < 80) { view.x += d.vx * 160; view.y += d.vy * 160; clampView(); aim(); }
        return wake();
    }
    const r = roomAt(cam.unproject(e.clientX, e.clientY));
    if (!r) return choose(null);
    if (d.type !== 'mouse' && active !== r.id) return choose(r.id);   // touch: first tap stands it up
    if (r.work) enter(r); else choose(r.id);
});
canvas.addEventListener('pointercancel', e => { pinch.delete(e.pointerId); drag = null; pinchStart = null; });
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { ptr = null; snap = null; clearTimeout(hoverTimer); if (!entering) choose(null); wake(); } });
canvas.addEventListener('dblclick', () => { view = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 - 0.3, zoom: 1 }; aim(); wake(); });

function hover() {
    const at = cam.unproject(ptr.x, ptr.y), r = roomAt(at);
    snap = snapTo(ptr);
    const info = [`X ${(at[0] * U).toFixed(2)}  Y ${(at[1] * U).toFixed(2)} M`];
    if (r) info.push(`${r.work ? r.name.toUpperCase() : 'PLANNED'} · ${r.mats}畳`);
    if (snap) info.push('WALL');
    ptr.info = info;
    canvas.style.cursor = r && r.work ? 'pointer' : drag ? 'grabbing' : 'crosshair';
    // A short pause before a room stands up, so sweeping across the plan doesn't set off every room.
    clearTimeout(hoverTimer);
    const id = r ? r.id : null;
    if (id !== active) hoverTimer = setTimeout(() => choose(id), id ? 140 : 260);
}

/** The nearest wall line to the pointer, if it's within a few pixels. */
function snapTo(p) {
    let best = null;
    for (const path of art.paths) {
        if (path.kind !== 'outer' && path.kind !== 'inner') continue;
        for (let i = 1; i < path.pts.length; i++) {
            const a = cam.project(...path.pts[i - 1]), b = cam.project(...path.pts[i]);
            const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
            const k = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L2));
            const q = [a[0] + dx * k, a[1] + dy * k], d = Math.hypot(p.x - q[0], p.y - q[1]);
            if (d < 7 && (!best || d < best.d)) best = { d, at: q };
        }
    }
    return best;
}

// Zooming toward the pointer; zoom far enough into a work and you fall into it.
function zoomAt(sx, sy, factor) {
    const before = cam.unproject(sx, sy), z0 = view.zoom;
    view.zoom = Math.max(0.65, Math.min(3.6, view.zoom * factor));
    const k = z0 / view.zoom;
    view.x = before[0] + (view.x - before[0]) * k; view.y = before[1] + (view.y - before[1]) * k;
    clampView(); aim(); wake();
    if (view.zoom >= 3.5) { const r = roomAt(before); if (r && r.work) enter(r); }
}
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
let pinchStart = null;
function pinchMove() {
    const [a, b] = [...pinch.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (pinchStart) zoomAt(mx, my, d / pinchStart);
    pinchStart = d; drag = null;
}
function clampView() {
    view.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, view.x));
    view.y = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, view.y));
}

// ── Keys ────────────────────────────────────────────────────────────────
addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('a, button, input')) return;
    const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key]) {
        e.preventDefault();
        let [dx, dy] = dirs[e.key];
        if (cam.base) [dx, dy] = [-dy, dx];   // the plan is turned on a tall screen
        const from = rooms.find(r => r.id === active) || { x: 4.5, y: 2.5, w: 1, h: 1 };
        const c0 = [from.x + from.w / 2, from.y + from.h / 2];
        const next = rooms.filter(r => r.id !== active).map(r => ({ r, v: [r.x + r.w / 2 - c0[0], r.y + r.h / 2 - c0[1]] }))
            .filter(o => o.v[0] * dx + o.v[1] * dy > 0.1).sort((a, b) => Math.hypot(...a.v) - Math.hypot(...b.v))[0];
        if (next) choose(next.r.id); else if (!active) choose(rooms.find(r => r.work).id);
    } else if (e.key === 'Enter' && active) enter(rooms.find(r => r.id === active));
    else if (e.key === 'Escape') choose(null);
    else if (e.key === '+' || e.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
    else if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
    else if (e.key === '0') { fit(); }
});

// ── The loop ────────────────────────────────────────────────────────────
function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let moving = cam.step(dt) | dim.step(dt);
    for (const r of rooms) { moving |= r.lift.step(dt) | r.open.step(dt); for (const h of r.hinge) moving |= h.step(dt); }
    // ?at=1.2 holds the drawing at that moment of drawing itself in, for looking at the motion frame by frame.
    const T = query.has('at') ? Number(query.get('at')) : calm.matches ? 99 : (now - T0) / 1000;
    render(T);
    placeCard();
    raf = moving || T < 3.2 || entering ? requestAnimationFrame(frame) : 0;
}

function render(T) {
    const { w: W, h: H } = cam;
    g.clearRect(0, 0, W, H);
    // A dot every 91 cm: the mat module, faint, under everything.
    g.fillStyle = col.faint; g.globalAlpha = Math.min(1, T * 3) * 0.55;
    const step = cam.ppu * cam.zoom.v;
    if (step > 9 && cam.pitch.v < 0.05) {
        const [ox, oy] = cam.project(0, 0), x0 = ((ox % step) + step) % step, y0 = ((oy % step) + step) % step;
        for (let y = y0; y < H; y += step) for (let x = x0; x < W; x += step) g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    g.globalAlpha = 1;
    const fade = Math.max(0, Math.min(1, (T - 1.8) / 0.8));
    const presence = id => (id && active && id !== active ? 1 - 0.7 * dim.v : id === null ? 1 - 0.25 * dim.v : 1);
    const lived = rooms.find(r => r.work);
    if (!sun && lived) {
        // At night the room that's lived in glows a little.
        const q = [[lived.x, lived.y], [lived.x + lived.w, lived.y], [lived.x + lived.w, lived.y + lived.h], [lived.x, lived.y + lived.h]].map(p => cam.project(...p));
        g.beginPath(); q.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.globalAlpha = 0.1 * fade; g.fillStyle = col.accent; g.fill(); g.globalAlpha = 1;
    }
    drawSun(g, cam, sun, col, fade * (1 - 0.6 * dim.v));
    drawPlan(g, cam, art, T, col, presence);
    drawLabels(g, cam, art, T, col, presence);
    drawCompass(g, cam, sun, col, fade);
    for (const r of [...rooms].sort((a, b) => cam.depth(a.x + a.w / 2, a.y + a.h / 2) - cam.depth(b.x + b.w / 2, b.y + b.h / 2)))
        drawStanding(g, cam, r, r.hinge.map(h => Math.max(0, h.v)), Math.max(0, r.open.v), r.lift.v, col);
    if (ptr && !drag && !entering) drawCrosshair(g, cam, ptr, snap, col, ptr.info || []);
}

// How to use it, in the title block's notes: hover with a mouse, tap with a finger.
const how = document.getElementById('how');
if (how && matchMedia('(pointer: coarse)').matches) how.textContent = 'Tap a room · pinch · drag';

// For checks and the console: what's standing, and a way to stand a room up.
window.Playground = { choose, enter: id => enter(rooms.find(r => r.id === id)), get state() { return { active, entering, zoom: +view.zoom.toFixed(2) }; } };

// ── Start ───────────────────────────────────────────────────────────────
addEventListener('resize', fit);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { col = palette(); wake(); });
setInterval(() => { sun = sunNow(); wake(); }, 60000);
document.fonts.ready.then(() => { if (!query.has('t')) T0 = performance.now() + 120; wake(); });
fit();
if (query.has('t')) T0 = performance.now() - Number(query.get('t')) * 1000;
if (query.has('focus')) setTimeout(() => choose(query.get('focus')), 50);
