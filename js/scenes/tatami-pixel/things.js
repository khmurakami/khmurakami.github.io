// Things you can touch: declaring them, finding what a finger or mouse is on, taps and swipes.

import { lanternLit } from './bake.js?v=20261124-0955';
import { Pixel, R, Stage, chime, clamp, lerp } from './base.js?v=20261124-0955';
import { crop } from './camera.js?v=20261124-0955';
import { BITS, burst, poke, ripple, since } from './motion.js?v=20261124-0955';
import { RT, bamboo, bambooAt, moonName, nap } from './night.js?v=20261124-0955';
import { bookStack, cat, craneToy, hangingScroll, laptop, onPlane, pig, radio, tray } from './objects.js?v=20261124-0955';
import { A, S, cam } from './state.js?v=20261124-0955';
import { SEASONS, captionButton, changeSeason, glow, gust } from './world.js?v=20261124-0955';

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

const GITHUB = window.Site.github;
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
        act: () => {
            const c = st.melon.sprite();
            st.melon.bites = (st.melon.bites + 1) % 4;
            poke('melon');
            if (st.melon.bites) burst(c.x + c.w * 0.35, c.y + c.h * 0.3, 6, BITS[S.season]);
            if (Stage.Sound.scape && Stage.Sound.scape.sfx) Stage.Sound.scape.sfx(st.melon.bites ? 'bite' : 'plate');
        } });

    const catAt = P ? [-1.15, 4.35] : [-1.6, 4.3];
    const sleep = cat(catAt[0], catAt[1], false), awake = cat(catAt[0], catAt[1], true);
    const catFrames = { sleep: spriteThing(sleep.canvas), awake: spriteThing(awake.canvas),
        stretch: spriteThing(cat(catAt[0], catAt[1], false, 'stretch').canvas), blink: spriteThing(cat(catAt[0], catAt[1], true, 'blink').canvas) };
    S.catHead = { sleep: sleep.head, awake: awake.head };
    S.catAwake = catFrames.awake;
    // Petted, she stretches first (with a yawn), then sits up purring, blinking now and then.
    const catPose = () => {
        const c = st.cat, k = since('cat');
        if (c.until <= S.t) return catFrames.sleep;
        if (k < 0.15) return catFrames.sleep;
        if (k < 0.8 && c.stretch) return catFrames.stretch;
        return (S.t * 1.3) % 3.1 < 0.14 ? catFrames.blink : catFrames.awake;
    };
    add('cat', { order: 2, until: -1, sprite: catPose,
        label: () => (st.cat.until > S.t ? 'cat · purring' : 'cat · pet her'),
        act: () => {
            const asleep = st.cat.until <= S.t;
            st.cat.stretch = asleep;
            if (asleep) poke('cat');
            st.cat.until = S.t + 4 + (asleep ? 0.8 : 0);
            const d = asleep ? 0.8 : 0;
            for (let i = 0; i < 3; i++) S.hearts.push({ t0: S.t + d + i * 0.35, dx: (i - 1) * 4 });
        } });

    const radioC = spriteThing(radio(P ? -0.7 : 2.25, P ? 1.7 : 3.15));
    const scape = Stage.Sound.scape;
    add('radio', { order: 3, sprite: () => radioC,
        label: () => {
            if (!scape) return Stage.Sound.on ? 'radio · turn it off' : 'radio · turn it on';
            const next = ['lo-fi', 'baseball', 'festival', 'off'][scape.station];
            return scape.station ? `radio · ${scape.stationName} · tune to ${next}` : 'radio · turn it on';
        },
        act: () => {
            poke('radio');
            if (scape) { const s = scape.tune(); if (s) for (let i = 0; i < 3; i++) S.notes.push({ t0: S.t + 0.4 + i * 0.18, x: radioC.x + radioC.w * (0.3 + i * 0.22), y: radioC.y, ph: i * 2 }); return s; }
            const b = document.getElementById('sound'); if (b) b.click(); else Stage.Sound.set(!Stage.Sound.on);
        } });

    const pigC = spriteThing(pig(P ? -0.5 : -0.9, 3.05));
    add('pig', { order: 4, sprite: () => pigC, label: 'mosquito coil · puff', act: () => { poke('pig'); S.puffT = S.t + 0.18; } });

    const lap = spriteThing(P ? laptop(lerp(fu.x0, fu.x1, 0.3), 0.1, 2.25) : laptop(lerp(fu.x0, fu.x1, 0.7), 0.1, 2.05));
    add('laptop', { order: 5, sprite: () => lap, label: 'laptop · open the terminal',
        act: () => {
            poke('laptop');
            if (window.Terminal) return setTimeout(() => Terminal.open(), 320);
            Links.open(GITHUB);
        } });

    const bookC = spriteThing(bookStack(P ? -0.98 : -0.25, P ? 2.9 : 3.2));
    add('books', { order: 3.5, sprite: () => bookC, label: 'books · what I have made',
        act: () => { poke('books'); if (window.Shelf) setTimeout(() => Shelf.open(), 180); } });
    const craneAt = P ? [-0.2, 2.35, 0.76] : [-0.58, 3.4, 1];
    const toy = () => spriteThing(craneToy(craneAt[0], craneAt[1], window.Crane ? Crane.won : [], craneAt[2]));
    let craneC = toy();
    onWon = () => { craneC = toy(); };
    add('crane', { order: 3.7, sprite: () => craneC, label: () => `crane game · ¥100 a go${window.Crane && Crane.won.length ? ` · ${Crane.won.length} won` : ''}`,
        act: () => { poke('crane'); if (window.Crane) setTimeout(() => Crane.open(), 180); } });
    const scrollCanvas = hangingScroll(S.season), scrollC = scrollCanvas && crop(scrollCanvas) ? spriteThing(scrollCanvas) : null;
    captionButton(document.getElementById('place'), !scrollC);
    if (scrollC) {
        const next = SEASONS[(SEASONS.indexOf(S.season) + 1) % 4];
        add('scroll', { order: 0.5, sprite: () => scrollC, label: `hanging scroll · ${S.season} · turn to ${next}`, act: () => changeSeason(next) });
    }

    // Things drawn each frame: they answer to a box instead of a sprite.
    add('chime', { order: 6, box: () => S.chimeBox, label: 'wind chime · ring', act: () => { chime.om += (Math.random() < 0.5 ? -1 : 1) * 2.2; S.chimeT = S.t; } });
    add('blind', { order: 0, box: () => S.blindBox, label: () => (S.blindTarget ? 'blind · let it down' : 'blind · roll it up'),
        act: () => { S.blindTarget = S.blindTarget ? 0 : 1; poke('blind'); } });
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
        act: () => { S.lanternOn = !lanternLit(); poke('lantern'); } });
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
    // The rice paddies, wherever they show between the hedges.
    {
        const inField = (x, y) => {
            if (!S.fieldMask) return false;
            if (x < 0 || y < 0 || x >= A.LW || y >= A.LH || !S.fieldMask[y * A.LW + x]) return false;
            // Not where the hedges (a nearer layer) stand in front.
            const a = S.shift(120), b = S.shift(9), gx = x + a.x - b.x, gy = y + a.y - b.y;
            return !(gx >= 0 && gy >= 0 && gx < A.LW && gy < A.LH && S.gardenAlpha[gy * A.LW + gx]);
        };
        const spot = () => {
            const d = S.shift(120), hits = [];
            for (let y = A.M; y < A.M + A.H; y += 2) for (let x = A.M; x < A.M + A.W; x += 2) {
                const lx = x - d.x, ly = y - d.y;
                if (inField(lx, ly) && pick((x + 0.5) * A.scale, (y + 0.5) * A.scale, phoneish() ? FINGER : 0) === st.paddy) hits.push([lx, ly]);
            }
            if (!hits.length) return null;
            const mx = hits.reduce((a, h) => a + h[0], 0) / hits.length, my = hits.reduce((a, h) => a + h[1], 0) / hits.length;
            const [x, y] = hits.reduce((a, h) => ((h[0] - mx) ** 2 + (h[1] - my) ** 2 < (a[0] - mx) ** 2 + (a[1] - my) ** 2 ? h : a));
            return { x, y };
        };
        const what = { spring: 'flooded paddies', summer: 'rice paddies', autumn: 'ripe rice', winter: 'bare paddies' };
        add('paddy', { z: 120, order: -2, area: inField, spot, label: () => `${what[S.season]} · ripple`,
            act: (cx, cy) => ripple(cx, cy) });
    }
    for (const pl of S.plants) T.push({ id: 'plant', z: pl.z, plant: pl, order: -1, label: pl.label + ' · rustle', act: () => { pl.kick = S.t; } });

    S.thingList = T;
    S.drawThings = T.filter(t => t.sprite && !t.own).sort((a, b) => a.order - b.order);
    S.moves = {}; S.bits = []; S.ripples = [];
    S.gusts = []; S.gustBits = []; S.cloudPush = 0; S.fallPush = 0; S.trans = null;
    S.hearts = []; S.notes = []; S.nextNote = 0; S.nextTwinkle = 3; S.twinkle = null; S.puffT = -10;
    S.blindRoll = S.blindRoll || 0; S.blindTarget = S.blindTarget || 0; S.t = S.t || 0;
    S.lanternOn = S.lanternOn ?? null;
    accessibleThings(T);
}

// Big, flat things a stray finger lands on by accident: anything small nearby wins over them.
const WEAK = new Set(['futon', 'blind', 'plant', 'paddy']);
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
    if (t.area && (r || !t.box)) { if (t.area(x, y)) return 0; if (!t.box) return Infinity; }
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
    down = { x: e.clientX, y: e.clientY, type: e.pointerType || 'touch', id: e.pointerId, moved: false, t: null, at: e.timeStamp };
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
function tapOn(t, x, y, type) {
    if (!t) return;
    t.act(x, y);
    S.hover = t;
    showTip(t, x, y - 6, type === 'mouse' ? 0 : Math.max(1400, labelOf(t).length * 60));
}
// A finger acts the moment it lifts, without waiting on the browser's click
// (which phones can delay, drop after a fling, or never send to a canvas).
// A long hold is for the light, not a tap.
addEventListener('pointerup', e => {
    const d = down;
    if (!S || !d || d.type === 'mouse' || e.pointerId !== d.id) return;
    d.done = true;
    if (!e.target || e.target.id !== 'room') return;
    if (d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || e.timeStamp - d.at > 650) { if (S.hover === d.t) S.hover = null; return; }
    tapOn(d.t || pick(e.clientX, e.clientY, FINGER), e.clientX, e.clientY, d.type);
});
addEventListener('click', e => {
    if (!S || !e.target || e.target.id !== 'room') return;
    if (down && down.type !== 'mouse') return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
    tapOn((down && down.t) || pick(e.clientX, e.clientY, tapSlop('mouse')), e.clientX, e.clientY, 'mouse');
});

// A flick sends a gust; the pointer carries the light at night.
const trail = [];
let lastGust = 0, glowHold = 0;
function flickSpeed() {
    if (trail.length < 2) return null;
    const a = trail[0], b = trail[trail.length - 1], dt = (b.t - a.t) / 1000;
    if (dt < 0.012) return null;
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    return { v: Math.hypot(vx, vy) / Math.min(innerWidth, innerHeight), dir: Math.sign(vx) || 1 };
}
addEventListener('pointerdown', e => {
    trail.length = 0; trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    // A finger brings the light only once it rests: a drag is for looking.
    clearTimeout(glowHold);
    if (e.pointerType !== 'mouse' && e.target && e.target.id === 'room') {
        glow.x = e.clientX; glow.y = e.clientY;
        glowHold = setTimeout(() => { if (down && !down.moved) glow.want = 1; }, 220);
    }
});
addEventListener('pointermove', e => {
    trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (trail.length > 2 && trail[0].t < e.timeStamp - 90) trail.shift();
    const onRoom = e.target && e.target.id === 'room';
    if (e.pointerType === 'mouse') {
        glow.want = onRoom ? 1 : 0;
        if (onRoom) { glow.x = e.clientX; glow.y = e.clientY; }
        const f = flickSpeed();
        if (onRoom && f && f.v > 3.2 && e.timeStamp - lastGust > 900) { lastGust = e.timeStamp; gust((f.v - 3.2) / 4 + 0.3, f.dir); }
    } else if (glow.want) { glow.x = e.clientX; glow.y = e.clientY; }
});
addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') return;
    glow.want = 0; clearTimeout(glowHold);
    const f = flickSpeed();
    if (down && down.moved && f && f.v > 2.6 && e.timeStamp - lastGust > 400) { lastGust = e.timeStamp; gust((f.v - 2.6) / 3 + 0.3, f.dir); }
});
addEventListener('pointercancel', () => { glow.want = 0; });
document.addEventListener('pointerleave', () => { glow.want = 0; });
addEventListener('blur', () => { glow.want = 0; });

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


// When the crane game pays out, the toy machine in the room shows it.
let onWon = null;
addEventListener('crane:won', () => onWon && onWon());

export { FINGER, GITHUB, GLYPH, WEAK, accessibleThings, alphaOf, bakeThings, coreOf, down, flickSpeed, glowHold, glyph, labelOf, lastGust, onWon, outlined, phoneish, pick, reachOf, showTip, spriteThing, tapOn, tapSlop, tip, tipTimer, trail, walled };
