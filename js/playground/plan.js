// The playground: the plan of a house where each room is a work.
//
// Three places, and you always know which one you're in:
//   the house   the whole plan. Hover a room and it pops up off the paper,
//               like a pop-up book, while everything else stays still.
//   a room      chosen with a click: the camera glides to it, its walls stand,
//               and a panel says what it is, with Step in and Back.
//   inside      Step in: the door slides, the camera goes through the doorway,
//               and the work develops inside the room's outline before it fills
//               the screen. Coming back out plays the same path in reverse.
// The camera only moves when the visitor asks; every move can be undone the same way.
import { HOUSE, U } from './house.js?v=20261124-1101';
import { buildDrawing } from './geometry.js?v=20261124-1101';
import { Camera, Spring } from './camera.js?v=20261124-1101';
import { palette, drawPlan, drawLabels, drawSun, drawCompass, drawStanding, drawCrosshair, drawHot, sunNow } from './draw.js?v=20261124-1101';
import { WORKS } from './works.js?v=20261124-1101';

// How long things take, in one place. Slow enough to follow, never sluggish.
const MOTION = { glide: 1200, foldAfter: 450, foldEach: 160, unfoldEach: 110, backAfter: 520, door: 600, through: 1700, develop: 900, fill: 800, popDwell: 110 };

const canvas = document.getElementById('plan'), g = canvas.getContext('2d');
const panel = document.getElementById('room-panel'), here = document.getElementById('here');
const query = new URLSearchParams(location.search);
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const art = buildDrawing();
const cam = new Camera();
const work = id => WORKS.find(w => w.id === id);
const rooms = HOUSE.rooms.map(r => ({ ...r, n: r.rev.charCodeAt(0) - 64, open: new Spring(0, 40, 12), hinge: [0, 1, 2, 3].map(() => new Spring(0, 70, 10)) }));
const roomById = id => rooms.find(r => r.id === id);
let col = palette(), place = 'house', active = null, hot = null, hotK = new Spring(0, 160, 22), dim = new Spring(0, 50, 14);
let view = { x: 5, y: 3.4, zoom: 1 }, ptr = null, snap = null, raf = 0, last = 0, sun = sunNow();
let drawnBefore = false;
try { drawnBefore = !!localStorage.getItem('plan-drawn'); localStorage.setItem('plan-drawn', '1'); } catch { /* fine */ }
// The house draws itself in on the first visit; after that it's simply there.
let T0 = performance.now() + (drawnBefore ? -99000 : 250);

// ── Fitting the drawing to the screen ───────────────────────────────────
const BOUNDS = { x0: -1.5, x1: 12.0, y0: -1.3, y1: 8.4 };
const tall = () => innerHeight > innerWidth * 1.1;
function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.base = tall() ? -Math.PI / 2 : 0;
    cam.w = W; cam.h = H;
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0, [sw, sh] = tall() ? [bh, bw] : [bw, bh];
    cam.ppu = Math.min((W * (tall() ? 0.92 : 0.74)) / sw, (H * (tall() ? 0.66 : 0.86)) / sh);
    cam.cx = tall() ? 0.5 : 0.4; cam.cy = tall() ? 0.38 : 0.5;
    view = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 - 0.3, zoom: 1 };
    cam.jump(place === 'house' || !active ? housePose() : roomPose(roomById(active)));
    wake();
}

// ── Where the camera stands for each place ──────────────────────────────
const housePose = () => ({ x: view.x, y: view.y, zoom: view.zoom, pitch: 0, yaw: 0 });
function roomPose(r) {
    // The room fills a good part of the screen, tipped up so its walls read, the house still around it.
    const span = tall() ? r.h : r.w, z = Math.min(2, (cam.w * (tall() ? 0.55 : 0.27)) / (span * cam.ppu));
    return { x: r.x + r.w / 2, y: r.y + r.h * 0.4, zoom: z, pitch: calm.matches ? 0 : 0.6, yaw: calm.matches ? 0 : -0.08 };
}
function doorwayPose(r) {
    // Down low on the veranda, at the open side, looking in.
    const p = roomPose(r);
    return { x: r.x + r.w / 2, y: r.y + r.h * 0.8, zoom: p.zoom * 2.6, pitch: 1.18, yaw: 0 };
}

/**
 * How standing walls are drawn. With the camera flat (the house), a room pops up
 * in its own slight angle, like a pop-up book, and the page doesn't move. As the
 * camera tips toward a room, that angle hands over to the camera's own.
 */
function popView() {
    const k = Math.max(0, 1 - cam.pitch.v / 0.6), s = cam.ppu * cam.zoom.v;
    const project = (x, y, z = 0) => { const [sx, sy] = cam.project(x, y, z); return [sx + z * k * s * 0.16, sy - z * k * s * 0.5]; };
    return { project, depth: (x, y) => cam.project(x, y, 0)[1] };
}

// ── Moving between places ───────────────────────────────────────────────
const timers = [];
const later = (fn, ms) => timers.push(setTimeout(() => { fn(); wake(); }, ms));
const clearLater = () => timers.splice(0).forEach(clearTimeout);

/** Which of a room's walls (n, e, s, w) faces the viewer: it stays folded down, so you look in over it. */
function nearWall(r) {
    const mids = [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]];
    return mids.map((m, i) => [cam.project(...m)[1], i]).sort((p, q) => q[0] - p[0])[0][1];
}
function fold(r, up, after = 0) {
    const near = nearWall(r), order = [0, 1, 3, 2];
    r.hinge.forEach((h, i) => later(() => { h.to = up ? (i === near ? 0.04 : 1) : 0; },
        after + (calm.matches ? 0 : (up ? order[i] * MOTION.foldEach : (3 - order[i]) * MOTION.unfoldEach))));
}

// Hovering in the house: the room under the pointer pops up; the one before folds back down.
let popTimer = 0, popped = null;
function pop(id) {
    clearTimeout(popTimer);
    popTimer = setTimeout(() => {
        if (place !== 'house' || id === popped) return;
        if (popped) fold(roomById(popped), false);
        popped = id;
        if (id && !calm.matches) fold(roomById(id), true);
        wake();
    }, id ? MOTION.popDwell : MOTION.popDwell * 2);
}

/** Go to a room: glide there, then its walls stand and the panel says what it is. */
function visit(id) {
    const r = roomById(id);
    if (!r || place === 'inside') return;
    clearLater(); clearTimeout(popTimer);
    for (const o of rooms) if (o.id !== id && o.hinge.some(h => h.to > 0)) fold(o, false);
    popped = null; active = id; place = 'room'; hot = null; hotK.to = 0;
    dim.to = 1;
    cam.glide(roomPose(r), calm.matches ? 1 : MOTION.glide);
    if (!r.hinge.some(h => h.to > 0)) fold(r, true, MOTION.foldAfter);
    later(() => showPanel(r), MOTION.glide * 0.6);
    where();
    wake();
}

/** Back to the house: the camera rises back out, and the room folds down into the paper. */
function leaveRoom() {
    if (place !== 'room') return;
    clearLater();
    const r = roomById(active);
    hidePanel();
    r.open.to = 0;
    cam.glide(housePose(), calm.matches ? 1 : MOTION.glide);
    dim.to = 0;
    fold(r, false, calm.matches ? 0 : MOTION.glide * 0.45);
    place = 'leaving'; where('house');
    later(() => { active = null; place = 'house'; where(); canvas.focus({ preventScroll: true }); }, calm.matches ? 0 : MOTION.glide);
    wake();
}

/** Step in: the door slides, the camera goes through the doorway, the work develops inside the room, then fills the screen. */
function stepIn() {
    const r = active && roomById(active), w = r && r.work && work(r.work);
    if (!w || place !== 'room') return;
    clearLater();
    place = 'inside'; where();
    hidePanel();
    try { sessionStorage.setItem('entering', w.id); } catch { /* fine */ }
    if (calm.matches) { document.body.classList.add('leaving'); setTimeout(() => (location.href = w.href), 300); return; }
    r.open.to = 1;
    const t1 = MOTION.door * 0.4, t2 = t1 + MOTION.through * 0.55, t3 = t2 + MOTION.develop;
    later(() => cam.glide(doorwayPose(r), MOTION.through), t1);
    const veil = makeVeil(w.poster);
    // The work appears inside the room's outline, the way a photograph comes up in the tray...
    later(() => { veil.follow = r; veil.el.classList.add('develop'); }, t2);
    // ...then opens out to fill the screen.
    later(() => { veil.follow = null; veil.el.classList.add('fill'); veil.el.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'; }, t3);
    later(() => (location.href = w.href), t3 + MOTION.fill);
    wake();
}

/** Coming back out of a work (?from=id): start inside, then the picture shrinks back into the room and fades into the drawing. */
function arriveFrom(id) {
    const r = roomById(id), w = r && r.work && work(r.work);
    history.replaceState(null, '', location.pathname);
    T0 = performance.now() - 99000;
    if (!r) { document.documentElement.classList.remove('from-room'); return; }
    active = id; dim.set(1);
    if (!w || calm.matches) { document.documentElement.classList.remove('from-room'); place = 'room'; fold(r, true); cam.jump(roomPose(r)); showPanel(r); where(); return; }
    place = 'inside'; r.open.set(1);
    cam.jump(doorwayPose(r));
    const near = nearWall(r);
    r.hinge.forEach((h, i) => h.set(i === near ? 0.04 : 1));
    const veil = makeVeil(w.poster, true);
    requestAnimationFrame(() => document.documentElement.classList.remove('from-room'));
    later(() => { veil.el.classList.add('shrink'); veil.el.style.clipPath = clipOf(r); }, 150);
    later(() => { veil.follow = r; veil.el.classList.remove('shrink'); veil.el.classList.add('fade'); cam.glide(roomPose(r), MOTION.glide * 1.3); r.open.to = 0; place = 'room'; where(); }, 150 + MOTION.fill);
    later(() => { veil.el.remove(); veils.delete(veil); showPanel(r); }, 150 + MOTION.fill + MOTION.glide * 1.3);
    where();
}

// The picture of a work, clipped to the room's floor as the camera moves.
const veils = new Set();
function makeVeil(src, full = false) {
    const el = document.createElement('div');
    el.className = 'veil' + (full ? ' shown' : '');
    el.style.backgroundImage = `url("${src}")`;
    el.style.clipPath = full ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' : 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)';
    document.body.append(el);
    const v = { el, follow: null };
    veils.add(v);
    return v;
}
function clipOf(r) {
    return `polygon(${[[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(p => cam.project(...p).map(Math.round).join('px ') + 'px').join(', ')})`;
}
addEventListener('pageshow', e => {
    if (!e.persisted) return;
    document.body.classList.remove('leaving');
    veils.forEach(v => v.el.remove()); veils.clear();
    if (active) { place = 'room'; leaveRoom(); }
});

// ── Saying where you are ────────────────────────────────────────────────
function where(override) {
    const r = active && roomById(active), name = r ? (r.work ? work(r.work).title : `Room ${r.rev}, planned`) : '';
    const p = override || place;
    here.textContent = p === 'house' || !r ? 'The house' : p === 'inside' ? `Inside · ${name}` : `The house › ${name}`;
    document.body.dataset.place = p;
}
function showPanel(r) {
    const w = r.work && work(r.work);
    panel.querySelector('.n').textContent = String(r.n).padStart(2, '0');
    panel.querySelector('.t').textContent = w ? w.title : `Room ${r.rev}`;
    panel.querySelector('.l').textContent = w ? w.line : `A ${r.mats}-mat room, planned for revision ${r.rev}. Nothing here yet.`;
    panel.querySelector('.m').textContent = `${r.mats}畳 · ${(r.mats * 1.62).toFixed(1)} m²${w ? ` · ${w.tags.join(' · ')}` : ''}`;
    const img = panel.querySelector('img'), go = panel.querySelector('.in');
    img.hidden = !w; go.hidden = !w;
    if (w) img.src = w.poster;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    (w ? go : panel.querySelector('.back')).focus({ preventScroll: true });
}
function hidePanel() { panel.classList.remove('open'); panel.hidden = true; }
panel.querySelector('.in').addEventListener('click', stepIn);
panel.querySelector('.back').addEventListener('click', leaveRoom);

// ── Pointer ─────────────────────────────────────────────────────────────
const roomAt = ([x, y]) => rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
let drag = null, pinchStart = null;
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: e.timeStamp, moved: false };
});
canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { ptr = { x: e.clientX, y: e.clientY }; hover(); }
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && place === 'house') return pinchMove();
    if (!drag || drag.id !== e.pointerId || place !== 'house') return wake();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; canvas.classList.add('panning');
    const [ax, ay] = cam.unproject(drag.x, drag.y), [bx, by] = cam.unproject(e.clientX, e.clientY), dt = Math.max(1, e.timeStamp - drag.t);
    view.x -= bx - ax; view.y -= by - ay;
    drag.vx = (ax - bx) / dt; drag.vy = (ay - by) / dt;
    drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
    clampView(); cam.jump({ x: view.x, y: view.y });
    wake();
});
canvas.addEventListener('pointerup', e => {
    touches.delete(e.pointerId); pinchStart = null;
    canvas.classList.remove('panning');
    const d = drag; drag = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
        // Let go while moving and the paper glides on, slowing to a stop.
        if (e.timeStamp - d.t < 80) { view.x += d.vx * 220; view.y += d.vy * 220; clampView(); cam.glide({ x: view.x, y: view.y }, 700, t => 1 - Math.pow(1 - t, 3)); }
        return wake();
    }
    const r = roomAt(cam.unproject(e.clientX, e.clientY));
    if (place === 'house') { if (r) visit(r.id); }
    else if (place === 'room') { if (!r) leaveRoom(); else if (r.id !== active) visit(r.id); }
});
canvas.addEventListener('pointercancel', e => { touches.delete(e.pointerId); drag = null; pinchStart = null; });
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { ptr = null; snap = null; hot = null; hotK.to = 0; pop(null); wake(); } });
canvas.addEventListener('dblclick', () => { if (place !== 'house') return; view = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 - 0.3, zoom: 1 }; cam.glide(housePose(), 700); wake(); });

function hover() {
    const at = cam.unproject(ptr.x, ptr.y), r = roomAt(at);
    snap = place === 'house' ? snapTo(ptr) : null;
    const info = [`X ${(at[0] * U).toFixed(2)}  Y ${(at[1] * U).toFixed(2)} M`];
    if (r) info.push(`${r.work ? r.name.toUpperCase() : `ROOM ${r.rev} · PLANNED`} · ${r.mats}畳`);
    if (r && place === 'house') info.push(r.work ? 'CLICK TO VISIT' : 'CLICK TO LOOK');
    ptr.info = info;
    // In the house the room under the pointer pops up; in a room, others are only outlined.
    const next = place === 'house' && r ? r.id : place === 'room' && r && r.id !== active ? r.id : null;
    if (next !== hot) { hot = next; hotK.set(0); }
    hotK.to = hot ? 1 : 0;
    if (place === 'house') pop(r ? r.id : null);
    canvas.style.cursor = r && (place === 'house' || r.id !== active) ? 'pointer' : drag ? 'grabbing' : 'crosshair';
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

// Zooming the paper toward the pointer, in the house only.
function zoomAt(sx, sy, factor) {
    if (place !== 'house') return;
    const before = cam.unproject(sx, sy), z0 = view.zoom;
    view.zoom = Math.max(0.65, Math.min(3, view.zoom * factor));
    const k = z0 / view.zoom;
    view.x = before[0] + (view.x - before[0]) * k; view.y = before[1] + (view.y - before[1]) * k;
    clampView(); cam.glide(housePose(), 220, t => 1 - Math.pow(1 - t, 2)); wake();
}
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
function pinchMove() {
    const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchStart) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinchStart);
    pinchStart = d; drag = null;
}
function clampView() {
    view.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, view.x));
    view.y = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, view.y));
}

// ── Keys ────────────────────────────────────────────────────────────────
canvas.tabIndex = 0;
addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input')) return;
    const onButton = e.target.closest && e.target.closest('a, button');
    const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key] && place !== 'inside' && place !== 'leaving') {
        e.preventDefault();
        let [dx, dy] = dirs[e.key];
        if (cam.base) [dx, dy] = [-dy, dx];   // the plan is turned on a tall screen
        const fromId = place === 'room' ? active : hot;
        const from = roomById(fromId) || { x: 4.5, y: 2.5, w: 1, h: 1 }, c0 = [from.x + from.w / 2, from.y + from.h / 2];
        const next = rooms.filter(r => r.id !== fromId).map(r => ({ r, v: [r.x + r.w / 2 - c0[0], r.y + r.h / 2 - c0[1]] }))
            .filter(o => o.v[0] * dx + o.v[1] * dy > 0.1).sort((a, b) => Math.hypot(...a.v) - Math.hypot(...b.v))[0];
        const id = next ? next.r.id : fromId ? null : rooms.find(r => r.work).id;
        if (!id) return;
        if (place === 'room') visit(id); else { hot = id; hotK.set(0); hotK.to = 1; pop(id); wake(); }
    } else if (e.key === 'Enter' && !onButton) {
        if (place === 'house' && hot) visit(hot); else if (place === 'room') stepIn();
    } else if (e.key === 'Escape') leaveRoom();
    else if (e.key === '+' || e.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
    else if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
});

// ── The loop ────────────────────────────────────────────────────────────
function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (query.has('settle')) settleAll();   // for still pictures: every motion at its end
    let moving = cam.step(now);
    moving = dim.step(dt) || moving;
    moving = hotK.step(dt) || moving;
    for (const r of rooms) { moving = r.open.step(dt) || moving; for (const h of r.hinge) moving = h.step(dt) || moving; }
    // ?at=1.2 holds the drawing at that moment of drawing itself in, for looking at the motion frame by frame.
    const T = query.has('at') ? Number(query.get('at')) : calm.matches ? 99 : (now - T0) / 1000;
    render(T);
    for (const v of veils) if (v.follow) v.el.style.clipPath = clipOf(v.follow);
    raf = moving || T < 3.2 || veils.size ? requestAnimationFrame(frame) : 0;
}

function settleAll() {
    for (const r of rooms) { r.open.set(r.open.to); r.hinge.forEach(h => h.set(h.to)); }
    dim.set(dim.to); hotK.set(hotK.to);
    for (const part of Object.values(cam.parts())) part.set(part.to);
}

function render(T) {
    const { w: W, h: H } = cam;
    g.clearRect(0, 0, W, H);
    // A dot every 91 cm, the mat module, faint, under everything.
    g.fillStyle = col.faint; g.globalAlpha = Math.min(1, T * 3) * 0.55;
    const step = cam.ppu * cam.zoom.v;
    if (step > 9 && cam.pitch.v < 0.05) {
        const [ox, oy] = cam.project(0, 0), x0 = ((ox % step) + step) % step, y0 = ((oy % step) + step) % step;
        for (let y = y0; y < H; y += step) for (let x = x0; x < W; x += step) g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    g.globalAlpha = 1;
    const fade = Math.max(0, Math.min(1, (T - 1.8) / 0.8));
    const presence = id => (id && active && id !== active ? 1 - 0.72 * dim.v : id === null ? 1 - 0.3 * dim.v : 1);
    const lived = rooms.find(r => r.work);
    if (!sun && lived) {
        // At night the room that's lived in glows a little.
        const q = [[lived.x, lived.y], [lived.x + lived.w, lived.y], [lived.x + lived.w, lived.y + lived.h], [lived.x, lived.y + lived.h]].map(p => cam.project(...p));
        g.beginPath(); q.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.globalAlpha = 0.1 * fade; g.fillStyle = col.accent; g.fill(); g.globalAlpha = 1;
    }
    drawSun(g, cam, sun, col, fade * (1 - 0.6 * dim.v));
    drawHot(g, cam, roomById(hot), hotK.v, col);
    drawPlan(g, cam, art, T, col, presence);
    drawLabels(g, cam, art, T, col, presence);
    drawCompass(g, cam, sun, col, fade * (1 - dim.v));
    const pv = popView();
    for (const r of [...rooms].sort((a, b) => pv.depth(a.x + a.w / 2, a.y + a.h / 2) - pv.depth(b.x + b.w / 2, b.y + b.h / 2))) {
        const lift = Math.max(...r.hinge.map(h => h.v));
        drawStanding(g, pv, r, r.hinge.map(h => Math.max(0, h.v)), Math.max(0, r.open.v), Math.min(1, lift * 3), col);
    }
    if (ptr && !drag && place !== 'inside') drawCrosshair(g, cam, ptr, snap, col, ptr.info || []);
}

// How to use it, in the title block's notes: hover with a mouse, tap with a finger.
const how = document.getElementById('how');
if (how && matchMedia('(pointer: coarse)').matches) how.textContent = 'Tap a room · pinch · drag';

// For checks and the console.
window.Playground = { visit, leaveRoom, stepIn, pop, get state() { return { place, active, hot, popped }; } };

// ── Start ───────────────────────────────────────────────────────────────
addEventListener('resize', fit);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { col = palette(); wake(); });
setInterval(() => { sun = sunNow(); wake(); }, 60000);
document.fonts.ready.then(() => { if (!query.has('t') && !drawnBefore) T0 = performance.now() + 120; wake(); });
fit();
where();
if (query.has('t')) T0 = performance.now() - Number(query.get('t')) * 1000;
if (query.has('from')) arriveFrom(query.get('from'));
else if (query.has('focus')) setTimeout(() => visit(query.get('focus')), 50);
else if (query.has('pop')) setTimeout(() => { hot = query.get('pop'); hotK.to = 1; pop(hot); }, 50);
