// Drawing the things each frame, with what they give off: notes, hearts, the laptop screen.

import { Stage, TAU, rng } from './base.js?v=20261124-1048';
import { bent, bits, pose, since } from './motion.js?v=20261124-1048';
import { wake } from './night.js?v=20261124-1048';
import { S } from './state.js?v=20261124-1048';
import { glyph } from './things.js?v=20261124-1048';

/** The things and what they give off: notes, hearts, z's, the laptop's screen, and now and then a sparkle. */
function drawThings(o, t) {
    for (const th of S.drawThings) {
        const c = th.sprite(), m = pose(th.id, c, t);
        if (!m.lift && !m.sx && !m.sy) {
            if (S.hover === th) o.drawImage(c.outline, c.x - 1, c.y - 1);
            o.drawImage(c.canvas, c.x, c.y);
        } else {
            // Bent from the middle, standing on its own bottom, lifted; a shadow stays on the floor.
            const yb = c.y + c.h - m.lift;
            if (m.lift > 0) { const sw = Math.max(2, Math.round(c.w * (0.7 - m.lift * 0.05))); o.fillStyle = '#20183a'; o.fillRect(Math.round(c.x + (c.w - sw) / 2), c.y + c.h - 1, sw, 1); }
            if (S.hover === th) bent(o, c.outline, c.w + 2, c.h + 2, c.x - 1, yb + 1, m.sx, m.sy);
            bent(o, c.canvas, c.w, c.h, c.x, yb, m.sx, m.sy);
        }
        if (th.id === 'laptop') screen(o, t, S.hover === th);
    }
    bits(o, t, Math.min(0.05, t - (S.bitsT ?? t))); S.bitsT = t;
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
    const wake = S.moves ? since('laptop') : 1e9;
    if (wake < 0.32) {
        const open = Math.max(1, Math.round(h * Math.min(1, wake / 0.2)));
        o.fillStyle = wake < 0.2 ? '#eef4ff' : '#9cb4ee';
        o.fillRect(s.x0, Math.round(s.y0 + (h - open) / 2), w, open);
        return;
    }
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

export { CODE, CODE_LEN, CODE_TOTAL, drawThings, screen };
