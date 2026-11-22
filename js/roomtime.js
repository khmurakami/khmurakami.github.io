/*
 * roomtime.js — what time it is in the room, and what that does to the light.
 *
 * The room keeps the visitor's own clock (plus however long they have napped
 * on the futon). ?hour=19.5 and ?date=2026-07-07 pin it, for renders and checks.
 *
 *   RoomTime.now()            the room's Date
 *   RoomTime.hour(d)          0..24, with minutes
 *   RoomTime.grade(hour)      { gain, lift, sat, dark }: how the light colours the room
 *   RoomTime.apply(px, g, swap)  grade RGBA pixels in place (swap: packed RGB -> RGB, left ungraded)
 *   RoomTime.moon(d)          { phase 0..1 (0 new, 0.5 full), lit 0..1 }
 *   RoomTime.season(d)        'spring' | 'summer' | 'autumn' | 'winter'
 *   RoomTime.tanabata(d)      true from July 1st to 7th
 */
(function (root, make) {
    if (typeof module === 'object' && module.exports) module.exports = make();
    else root.RoomTime = make();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;

    // ── The clock ─────────────────────────────────────────────────────────
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const pinHour = q.has('hour') && Number.isFinite(+q.get('hour')) ? clamp(+q.get('hour'), 0, 23.99) : null;
    const pinDate = q.has('date') && /^\d{4}-\d{2}-\d{2}$/.test(q.get('date')) ? q.get('date') : null;
    let offset = 0;   // ms slept on the futon

    function now() {
        const d = new Date(Date.now() + offset);
        if (pinDate) { const [y, m, day] = pinDate.split('-').map(Number); d.setFullYear(y, m - 1, day); }
        if (pinHour != null) {
            const h = pinHour + offset / 3600000, days = Math.floor(h / 24), hh = ((h % 24) + 24) % 24;
            d.setDate(d.getDate() + (pinDate ? days : 0));
            d.setHours(Math.floor(hh), Math.floor((hh % 1) * 60), 0, 0);
        }
        return d;
    }
    const hour = (d = now()) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const sleep = ms => { offset += ms; };

    // ── The light ─────────────────────────────────────────────────────────
    // The room was painted at three in the afternoon: that hour is the
    // identity. Every other hour is a gain and a lift on its colours, and a
    // saturation; between key hours they blend. dark: 0 by day, 1 at night,
    // for what glows on its own (stars, lamps, screens).
    const KEYS = [
        [0.0, { gain: [0.26, 0.3, 0.5], lift: [0.0, 0.01, 0.04], sat: 0.7, dark: 1 }],
        [4.3, { gain: [0.26, 0.3, 0.5], lift: [0.0, 0.01, 0.04], sat: 0.7, dark: 1 }],
        [5.4, { gain: [0.5, 0.48, 0.68], lift: [0.04, 0.03, 0.07], sat: 0.75, dark: 0.75 }],
        [6.3, { gain: [0.9, 0.74, 0.8], lift: [0.07, 0.04, 0.06], sat: 0.85, dark: 0.3 }],
        [7.5, { gain: [0.97, 0.95, 1.0], lift: [0.04, 0.035, 0.04], sat: 0.88, dark: 0 }],
        [10, { gain: [1.0, 1.0, 1.02], lift: [0.015, 0.015, 0.02], sat: 0.95, dark: 0 }],
        [13, { gain: [1.03, 1.03, 1.04], lift: [0.01, 0.01, 0.01], sat: 0.98, dark: 0 }],
        [15, { gain: [1, 1, 1], lift: [0, 0, 0], sat: 1, dark: 0 }],
        [16.6, { gain: [1.08, 0.96, 0.84], lift: [0.03, 0.01, 0.0], sat: 1.05, dark: 0 }],
        [17.6, { gain: [1.12, 0.84, 0.66], lift: [0.05, 0.015, 0.0], sat: 1.08, dark: 0.05 }],
        [18.4, { gain: [0.9, 0.6, 0.62], lift: [0.06, 0.02, 0.06], sat: 0.95, dark: 0.3 }],
        [19.1, { gain: [0.55, 0.46, 0.7], lift: [0.03, 0.02, 0.07], sat: 0.85, dark: 0.65 }],
        [20.0, { gain: [0.34, 0.36, 0.58], lift: [0.01, 0.015, 0.05], sat: 0.75, dark: 0.92 }],
        [21.0, { gain: [0.26, 0.3, 0.5], lift: [0.0, 0.01, 0.04], sat: 0.7, dark: 1 }],
        [24.0, { gain: [0.26, 0.3, 0.5], lift: [0.0, 0.01, 0.04], sat: 0.7, dark: 1 }]
    ];
    function grade(h) {
        h = ((h % 24) + 24) % 24;
        let i = 0;
        while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
        const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], t = h1 > h0 ? clamp((h - h0) / (h1 - h0)) : 0, s = t * t * (3 - 2 * t);
        const mix = (x, y) => x.map((v, k) => lerp(v, y[k], s));
        return { gain: mix(a.gain, b.gain), lift: mix(a.lift, b.lift), sat: lerp(a.sat, b.sat, s), dark: lerp(a.dark, b.dark, s), hour: h };
    }
    const identity = g => g.sat === 1 && g.gain.every(v => v === 1) && g.lift.every(v => v === 0);

    /** Grade RGBA pixels in place: a table per channel, then saturation about the luma. */
    function apply(px, g, swap = null) {
        if (identity(g) && !swap) return;
        const T = [0, 1, 2].map(c => { const t = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) t[v] = Math.round((v / 255 * g.gain[c] + g.lift[c]) * 255); return t; });
        const [tr, tg, tb] = T, s = g.sat;
        for (let k = 0; k < px.length; k += 4) {
            if (swap) { const to = swap.get((px[k] << 16) | (px[k + 1] << 8) | px[k + 2]); if (to) { px[k] = to[0]; px[k + 1] = to[1]; px[k + 2] = to[2]; continue; } }
            const r = tr[px[k]], gg = tg[px[k + 1]], b = tb[px[k + 2]];
            if (s === 1) { px[k] = r; px[k + 1] = gg; px[k + 2] = b; continue; }
            const y = (r * 77 + gg * 150 + b * 29) >> 8;
            px[k] = y + (r - y) * s; px[k + 1] = y + (gg - y) * s; px[k + 2] = y + (b - y) * s;
        }
    }

    // ── The sky's calendar ────────────────────────────────────────────────
    const SYNODIC = 29.530588853, NEW = Date.UTC(2000, 0, 6, 18, 14);
    function moon(d = now()) {
        const phase = ((((d.getTime() - NEW) / 86400000) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
        return { phase, lit: (1 - Math.cos(phase * 2 * Math.PI)) / 2 };
    }
    function season(d = now()) {
        const m = d.getMonth();
        return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
    }
    const tanabata = (d = now()) => d.getMonth() === 6 && d.getDate() <= 7;

    return { now, hour, sleep, grade, apply, moon, season, tanabata, get offset() { return offset; }, pinned: pinHour != null };
});
