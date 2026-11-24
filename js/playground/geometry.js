// Turns the house into a drawing: paths with line weights, labels, and when
// each one is drawn in. Times are seconds from the moment the page appears,
// in the order an architect would draw: walls, then partitions, then mats,
// then what's in the rooms, then the words.
import { HOUSE, U, matsOf } from './house.js?v=20261124-1123';

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const circle = (cx, cy, r, n = 28, wobble = 0, seed = 1) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = 1 + wobble * Math.sin(a * 3 + seed) * Math.cos(a * 5 + seed * 2);
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
});
const fmt = m => `${m.toFixed(2)} m`;

export function buildDrawing() {
    const paths = [], labels = [];
    const path = (pts, kind, t, d, more = {}) => paths.push({ pts, kind, t, d, closed: false, ...more });
    const loop = (pts, kind, t, d, more = {}) => paths.push({ pts, kind, t, d, closed: true, ...more });
    const { w: W, h: H } = HOUSE;

    // Outer walls: north, east and west, cut through, the heaviest line.
    path([[0, 1], [0, 0], [W, 0], [W, 5]], 'outer', 0.05, 0.7);
    path([[0, 5], [0, 1.0]], 'outer', 0.35, 0.25);
    // The corridor's west end is the way in.
    path([[0, 0], [0, 0.12]], 'outer', 0.05, 0.1);

    // Partitions between rooms, and between the rooms and the corridor, with the
    // sliding doors (fusuma) drawn on their tracks.
    const rooms = HOUSE.rooms;
    rooms.forEach((r, i) => {
        const t = 0.5 + i * 0.08;
        const door0 = r.x + r.w / 2 - 0.75, door1 = r.x + r.w / 2 + 0.75;
        if (r.y === 1) {
            path([[r.x, r.y], [door0, r.y]], 'inner', t, 0.25, { room: r.id });
            path([[door1, r.y], [r.x + r.w, r.y]], 'inner', t + 0.1, 0.2, { room: r.id });
            // Two door panels, overlapping on their tracks.
            path([[door0, r.y - 0.04], [r.x + r.w / 2 + 0.05, r.y - 0.04]], 'door', t + 0.25, 0.2, { room: r.id, door: true });
            path([[r.x + r.w / 2 - 0.05, r.y + 0.04], [door1, r.y + 0.04]], 'door', t + 0.3, 0.2, { room: r.id, door: true });
        } else {
            // A room behind the cupboard is reached from its neighbour, through a door in its west wall.
            path([[r.x, r.y], [r.x + r.w, r.y]], 'inner', t, 0.3, { room: r.id });
        }
        if (r.x > 0) path([[r.x, r.y], [r.x, r.y + r.h]], 'inner', t + 0.05, 0.3, { room: r.id });
    });
    const c = HOUSE.closet;
    path([[c.x, c.y], [c.x, c.y + c.h]], 'inner', 0.75, 0.15);
    path([[c.x, c.y], [c.x + c.w, c.y]], 'inner', 0.7, 0.25);
    path([[c.x + 0.1, c.y + 0.5], [c.x + c.w - 0.1, c.y + 0.5]], 'hidden', 1.4, 0.3, { dash: [4, 4] });

    // The shoji along the south: a light double line, then the veranda's edge.
    path([[0, 5], [W, 5]], 'shoji', 0.8, 0.45);
    path([[0, 5.06], [W, 5.06]], 'shoji', 0.85, 0.45);
    path([[0, 6], [W, 6]], 'edge', 0.95, 0.4);
    for (let x = 0; x <= W; x += 2.5) loop(rect(x - 0.07, 5.93, 0.14, 0.14), 'post', 1.05 + x * 0.01, 0.1);
    // Floorboards: the veranda's run along it, the corridor's too.
    for (let y = 5.25; y < 6; y += 0.25) path([[0.05, y], [W - 0.05, y]], 'board', 1.15 + (y - 5) * 0.2, 0.5);
    for (let y = 0.25; y < 1; y += 0.25) path([[0.2, y], [W - 0.05, y]], 'board', 1.2 + y * 0.2, 0.5);

    // Mats, room by room, one after another as if they were being laid.
    rooms.forEach((r, i) => {
        matsOf(r).forEach(([x, y, w, h], j) => {
            loop(rect(x + 0.02, y + 0.02, w - 0.04, h - 0.04), r.work ? 'mat' : 'mat-planned', 0.95 + i * 0.12 + j * 0.05, 0.25, { room: r.id, dash: r.work ? null : [3, 4] });
            // The cloth border (heri) on a mat's long sides.
            if (r.work) {
                const long = w > h ? [[[x + 0.06, y + 0.06], [x + w - 0.06, y + 0.06]], [[x + 0.06, y + h - 0.06], [x + w - 0.06, y + h - 0.06]]]
                    : [[[x + 0.06, y + 0.06], [x + 0.06, y + h - 0.06]], [[x + w - 0.06, y + 0.06], [x + w - 0.06, y + h - 0.06]]];
                long.forEach(seg => path(seg, 'heri', 1.0 + i * 0.12 + j * 0.05, 0.2, { room: r.id }));
            }
        });
        // A planned room is hatched, like ground still to be built on.
        if (!r.work) for (let k = -r.h; k < r.w; k += 0.5) {
            const a = [r.x + Math.max(0, k), r.y + Math.max(0, -k)], len = Math.min(r.w - a[0] + r.x, r.h - a[1] + r.y);
            path([a, [a[0] + len, a[1] + len]], 'hatch', 1.3 + i * 0.1 + (k + r.h) * 0.01, 0.2, { room: r.id });
        }
    });

    // What's in the Tatami Room, as plan symbols.
    const lived = rooms.find(r => r.work && r.things);
    (lived ? lived.things : []).forEach((o, i) => {
        const t = 1.55 + i * 0.07, m = { room: lived.id };
        if (o.kind === 'futon') {
            loop(rect(o.x, o.y, o.w, o.h), 'thing', t, 0.3, m);
            path([[o.x, o.y + 0.45], [o.x + o.w, o.y + 0.45]], 'thing-fine', t + 0.2, 0.15, m);           // the pillow
            path([[o.x + 0.15, o.y + o.h * 0.62], [o.x + o.w - 0.1, o.y + o.h * 0.55]], 'thing-fine', t + 0.25, 0.15, m); // the fold
        } else if (o.kind === 'laptop') {
            loop(rect(o.x, o.y, o.w, o.h), 'thing', t, 0.15, m);
            path([[o.x, o.y + 0.12], [o.x + o.w, o.y + 0.12]], 'thing-fine', t + 0.1, 0.1, m);
        } else if (o.kind === 'tray') {
            loop(circle(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 24).map(([x, y]) => [x, o.y + o.h / 2 + (y - o.y - o.h / 2) * (o.h / o.w)]), 'thing', t, 0.2, m);
            loop(circle(o.x + o.w * 0.35, o.y + o.h * 0.45, 0.09, 12), 'thing-fine', t + 0.15, 0.1, m);
        } else if (o.kind === 'radio') {
            loop(rect(o.x, o.y, o.w, o.h), 'thing', t, 0.15, m);
            loop(circle(o.x + o.w * 0.3, o.y + o.h / 2, 0.08, 12), 'thing-fine', t + 0.1, 0.1, m);
        } else if (o.kind === 'books') {
            for (let k = 0; k < 3; k++) loop(rect(o.x + (k % 2) * 0.04, o.y + k * 0.18, o.w, 0.16), 'thing', t + k * 0.04, 0.1, m);
        } else if (o.kind === 'crane') {
            loop(rect(o.x, o.y, o.w, o.h), 'thing', t, 0.15, m);
            path([[o.x + o.w / 2, o.y], [o.x + o.w / 2, o.y + o.h * 0.55]], 'thing-fine', t + 0.1, 0.1, m);
        } else if (o.kind === 'cat') {
            // Curled up asleep, seen from above: a spiral, and the tail's tip.
            const pts = Array.from({ length: 40 }, (_, k) => { const a = k * 0.32, rr = o.r * (1 - k / 52); return [o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr * 0.8]; });
            path(pts, 'cat', t, 0.5, { ...m, cat: true });
        }
    });

    // The garden: stepping stones, a stone lantern, trees.
    HOUSE.garden.forEach((g, i) => {
        const t = 1.35 + i * 0.06;
        if (g.kind === 'stone') loop(circle(g.x, g.y, g.r, 16, 0.18, i), 'garden', t, 0.2);
        if (g.kind === 'lantern') { loop(rect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2), 'garden', t, 0.15); path([[g.x - g.r, g.y - g.r], [g.x + g.r, g.y + g.r]], 'garden-fine', t + 0.1, 0.1); path([[g.x + g.r, g.y - g.r], [g.x - g.r, g.y + g.r]], 'garden-fine', t + 0.15, 0.1); }
        if (g.kind === 'tree') { loop(circle(g.x, g.y, g.r, 44, 0.12, i), 'garden', t, 0.5); loop(circle(g.x, g.y, g.r * 0.55, 30, 0.2, i + 3), 'garden-fine', t + 0.2, 0.3); }
    });

    // Dimensions: the whole house, north side and west side.
    path([[0, -0.75], [W, -0.75]], 'dim', 1.25, 0.5);
    path([[0, -0.9], [0, -0.6]], 'dim', 1.25, 0.05); path([[W, -0.9], [W, -0.6]], 'dim', 1.7, 0.05);
    path([[-0.75, 0], [-0.75, H]], 'dim', 1.3, 0.45);
    path([[-0.9, 0], [-0.6, 0]], 'dim', 1.3, 0.05); path([[-0.9, H], [-0.6, H]], 'dim', 1.7, 0.05);
    labels.push({ x: W / 2, y: -0.92, text: fmt(W * U), kind: 'dim', t: 1.6 });
    labels.push({ x: -0.92, y: H / 2, text: fmt(H * U), kind: 'dim', t: 1.65, turn: true });

    // The way in.
    path([[-1.1, 0.5], [-0.25, 0.5]], 'arrow', 1.4, 0.3);
    path([[-0.45, 0.35], [-0.25, 0.5], [-0.45, 0.65]], 'arrow', 1.65, 0.15);
    labels.push({ x: -1.15, y: 0.5, text: 'ENTRY', kind: 'tiny', t: 1.75, align: 'right' });
    labels.push({ x: W / 2, y: 0.5, text: 'CORRIDOR', kind: 'tiny', t: 1.8 });
    labels.push({ x: W / 2, y: 5.5, text: 'ENGAWA · VERANDA', kind: 'tiny', t: 1.85 });
    labels.push({ x: c.x + c.w / 2, y: c.y + c.h / 2, text: 'OSHIIRE', kind: 'tiny', t: 1.85 });

    // Room names, with their size in mats and metres.
    rooms.forEach((r, i) => {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, t = 1.7 + i * 0.1;
        // Name over size, stacked on the screen (not along the drawing), so they hold together when the plan turns.
        const at = r.work ? { x: r.x + r.w * 0.45, y: r.y + r.h * 0.3 } : { x: cx, y: cy };
        labels.push({ ...at, dy: -9, text: r.work ? r.name : 'Planned', kind: r.work ? 'room' : 'room-planned', t, room: r.id });
        labels.push({ ...at, dy: 9, text: `${r.mats}畳 · ${(r.mats * 1.62).toFixed(1)} m²${r.work ? '' : ` · rev ${r.rev}`}`, kind: 'sub', t: t + 0.08, room: r.id });
    });

    return { paths: paths.map(p => ({ ...p, len: lengthOf(p) })), labels };
}

function lengthOf(p) {
    let L = 0;
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
}

/** The four sides of a room, as walls that can stand up: base line, outward normal, and what they're made of. */
export function wallsOf(r) {
    const outer = s => (s === 'w' && r.x === 0) || (s === 'e' && r.x + r.w === HOUSE.w);
    return [
        { side: 'n', a: [r.x, r.y], b: [r.x + r.w, r.y], n: [0, -1], type: 'fusuma', door: true },
        { side: 'e', a: [r.x + r.w, r.y], b: [r.x + r.w, r.y + r.h], n: [1, 0], type: outer('e') ? 'wall' : 'fusuma' },
        { side: 's', a: [r.x + r.w, r.y + r.h], b: [r.x, r.y + r.h], n: [0, 1], type: 'shoji' },
        { side: 'w', a: [r.x, r.y + r.h], b: [r.x, r.y], n: [-1, 0], type: outer('w') ? 'wall' : 'fusuma' }
    ];
}
