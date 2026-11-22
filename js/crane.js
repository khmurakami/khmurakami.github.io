/*
 * The crane game: a little claw machine on the tatami, ¥100 a go. Put in a
 * coin, hold ① to send the claw right, hold ② to send it back, and let go:
 * it drops, closes, and (maybe) carries a plush to the chute. The claw is weak,
 * as they are; it gets a little kinder after a run of misses, as they do.
 * What you win sits on the ledge under the machine, and beside it in the room.
 *
 *   Crane.open()  Crane.close()  Crane.coin(100 | 500)  Crane.auto(x, d)  Crane.won
 *
 * Everything is pixels on one canvas at a whole-number scale; the buttons are
 * real buttons laid over the drawn ones.
 */
(function () {
    'use strict';

    // ── The prizes, as pixel maps ─────────────────────────────────────────
    const K = '#1a1424';
    const PRIZES = {
        neko: { name: 'cat plush', weight: 0, map: ['o.......o', 'oo.....oo', 'ooododooo', 'okoooooko', 'ooowpwooo', 'doowwwood', '.doooood.', '..ddddd..', '.dd...dd.'],
            col: { o: '#e8944a', d: '#b0602a', k: K, w: '#f4e4c8', p: '#f08a9a' } },
        daruma: { name: 'daruma', weight: 0.12, map: ['..rrrrr..', '.rrrrrrr.', 'rrwwwwwrr', 'rwkwwwwwr', 'rwwkkkwwr', 'rrwwwwwrr', 'rrryyyrrr', 'RrrryrrrR', '.RRRRRRR.', '..RRRRR..'],
            col: { r: '#d84a4a', R: '#a03038', w: '#f4e4c8', k: K, y: '#f0c04a' } },
        usagi: { name: 'moon rabbit', weight: 0, map: ['..w...w..', '..wp.wp..', '..wp.wp..', '.wwwwwww.', 'wwkwwwkww', 'wwwwpwwww', 'gwwwwwwwg', '.gwwwwwg.', '..gg.gg..'],
            col: { w: '#f4f0f8', g: '#b8b4d0', p: '#f4a8c0', k: K } },
        onigiri: { name: 'onigiri', weight: -0.06, map: ['....w....', '...www...', '..wwwww..', '.wkwwwkw.', '.wpwwwpw.', 'wwwwwwwww', 'wwnnnnnww', 'wnnnnnnnw', '.nnnnnnn.'],
            col: { w: '#f8f4ec', n: '#1e3a34', k: K, p: '#f4a8c0' } },
        kingyo: { name: 'goldfish', weight: -0.03, map: ['..rrr....', '.rrrrr.rr', 'rkrorrrr.', 'rrrorrrrr', '.rrrrr.rr', '..rrr...r'],
            col: { r: '#e85a3a', o: '#f0a04a', k: K } },
        panda: { name: 'panda', weight: 0.06, map: ['k.......k', 'kkwwwwwkk', '.wwwwwww.', 'wkkwwwkkw', 'wkwwwwwkw', 'wwwwkwwww', '.wwwwwww.', 'kkwwwwwkk', 'kkwwwwwkk', '.kk...kk.'],
            col: { w: '#f4f0f8', k: '#1e1a2e' } }
    };
    const KINDS = Object.keys(PRIZES);

    /** A prize drawn once, with a dark outline round it so it reads on any floor. */
    const art = {};
    function prizeArt(kind) {
        if (art[kind]) return art[kind];
        const { map, col } = PRIZES[kind], w = Math.max(...map.map(r => r.length)) + 2, h = map.length + 2;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'), on = (x, y) => y >= 0 && y < map.length && x >= 0 && map[y][x] && map[y][x] !== '.';
        for (let y = -1; y <= map.length; y++) for (let x = -1; x <= w - 2; x++) {
            if (on(x, y)) { g.fillStyle = col[map[y][x]]; g.fillRect(x + 1, y + 1, 1, 1); }
            else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) { g.fillStyle = '#120e22'; g.fillRect(x + 1, y + 1, 1, 1); }
        }
        return (art[kind] = c);
    }

    // A 3x5 pixel font for the sign and the credit counter.
    const FONT = {
        C: '111100100100111', R: '110101110101101', A: '010101111101101', N: '110101101101101', E: '111100110100111',
        G: '111100101101111', T: '111010010010010', '!': '010010010000010', '¥': '101101010111010', ' ': '000000000000000',
        0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
        5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111'
    };
    function text(g, s, x, y, c, k = 1) {
        g.fillStyle = c;
        for (const ch of String(s)) {
            const f = FONT[ch] || FONT[' '];
            for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(x + (i % 3) * k, y + Math.floor(i / 3) * k, k, k);
            x += 4 * k;
        }
    }
    const textW = (s, k = 1) => String(s).length * 4 * k - k;

    // ── The machine, in art pixels ────────────────────────────────────────
    const AW = 120, AH = 146;
    const FRONT = 88, DEEP = 16, X0 = 14, X1 = 106;        // the case floor: front edge y, how far up the back is, left and right
    const RAIL = 21, HOME = { x: 23, d: 0.18 };             // the claw's rail, and where it waits: over the chute
    const CHUTE = { x1: 34, d1: 0.42 };                     // the chute's hole: from the left wall to x1, from the front to d1
    const floorY = d => FRONT - DEEP * d;
    const fill = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    function line(g, x0, y0, x1, y1, c) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let e = dx + dy;
        g.fillStyle = c;
        for (;;) {
            g.fillRect(x0, y0, 1, 1);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * e;
            if (e2 >= dy) { e += dy; x0 += sx; }
            if (e2 <= dx) { e += dx; y0 += sy; }
        }
    }
    const PINK = ['#7a2a4a', '#b8486a', '#e8789a', '#ffb0c8'];

    // ── State ─────────────────────────────────────────────────────────────
    const rand = (a, b) => a + Math.random() * (b - a);
    const claw = { x: HOME.x, d: HOME.d, len: 4, open: 0, held: null };
    let state = 'idle', credits = 0, misses = 0, last = null, slipped = false, gotOne = false, lights = 0, flash = 0, hatch = null, coinAnim = -1, speed = 1;
    let prizes = [];
    let save = { spent: 0, won: [] };
    try { save = Object.assign(save, JSON.parse(localStorage.getItem('crane') || '{}')); } catch (e) { /* no storage: it just won't remember */ }
    const keep = () => { try { localStorage.setItem('crane', JSON.stringify(save)); } catch (e) { /* fine */ } };

    function stock(n, from = 0) {
        for (let i = 0; i < n; i++) {
            const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
            prizes.push({ kind, x: rand(CHUTE.x1 + 10, X1 - 6), d: rand(0.05, 0.95), h: from ? from + i * 6 : 0, vh: 0 });
        }
    }
    stock(10);

    const sfx = (name, a) => { const s = window.Stage && Stage.Sound && Stage.Sound.scape; if (s && s.sfx) s.sfx(name, a); };

    // ── Drawing ───────────────────────────────────────────────────────────
    function drawClaw(g) {
        const x = Math.round(claw.x), hy = RAIL + 3 + Math.round(claw.len), o = claw.open;
        // The carriage on its rail, a shade darker the further back it is.
        fill(g, x - 4, RAIL, 9, 3, claw.d > 0.5 ? '#6a6a98' : '#8a8ab8'); fill(g, x - 4, RAIL + 2, 9, 1, '#3a3a68');
        fill(g, x, RAIL + 3, 1, hy - RAIL - 3, '#c8c8e0');
        fill(g, x - 2, hy, 5, 3, '#e8c060'); fill(g, x - 2, hy + 2, 5, 1, '#a07830'); fill(g, x - 2, hy, 5, 1, '#f8e0a0');
        for (const s of [-1, 1]) {
            const ex = x + s * (3 + Math.round(o * 3)), tx = x + s * (2 + Math.round(o * 2));
            line(g, x + s * 2, hy + 3, ex, hy + 6, '#c89a40');
            line(g, ex, hy + 6, tx, hy + 9, '#c89a40');
            fill(g, tx - s, hy + 9, 1, 1, '#e8c060');
        }
        fill(g, x, hy + 3, 1, 4, '#a07830');
    }
    const tipY = () => RAIL + 3 + claw.len + 9;

    function drawPrize(g, p) {
        const a = prizeArt(p.kind);
        g.drawImage(a, Math.round(p.x - a.width / 2), Math.round(floorY(p.d) - p.h - a.height + 1));
    }

    function draw(g, t) {
        fill(g, 0, 0, AW, AH, '#1c1836');
        for (let x = 3; x < AW; x += 7) fill(g, x, 0, 1, AH, '#201b3e');
        // The sign on top, its bulbs chasing round.
        fill(g, 8, 2, 104, 16, PINK[1]); fill(g, 9, 3, 102, 14, PINK[2]); fill(g, 9, 3, 102, 1, PINK[3]);
        for (let i = 0; i < 26; i++) {
            const on = (i + Math.floor(lights)) % 3 === 0 || flash > 0 && Math.floor(t * 8) % 2;
            fill(g, 11 + i * 4, 4, 1, 1, on ? '#fff2a0' : '#b8687a'); fill(g, 11 + i * 4, 15, 1, 1, on ? '#b8687a' : '#fff2a0');
        }
        const word = flash > 0 ? 'GET!' : 'CRANE';
        if (!(flash > 0 && Math.floor(t * 6) % 2)) text(g, word, Math.round(60 - textW(word, 2) / 2), 5, '#3a1430', 2);
        // The cabinet round the glass.
        fill(g, 8, 18, 104, 74, PINK[1]); fill(g, 8, 18, 4, 74, PINK[2]); fill(g, 108, 18, 4, 74, PINK[0]);
        // Inside: the back wall, the floor going back, the rail.
        fill(g, 12, 19, 96, 71, '#241f48');
        for (let x = 16; x < 108; x += 8) fill(g, x, 19, 1, floorY(1) - 19, '#2a2452');
        for (let y = floorY(1); y <= FRONT + 1; y++) fill(g, 12, y, 96, 1, (y & 1) ? '#3a3272' : '#342c66');
        fill(g, 12, RAIL - 1, 96, 1, '#4a4a78'); fill(g, 12, RAIL, 96, 1, '#2e2c58');
        // The chute: a hole in the front corner behind a clear guard.
        const cy = floorY(CHUTE.d1);
        fill(g, 12, cy, CHUTE.x1 - 12, FRONT + 2 - cy, '#0a0818');
        for (let x = 12; x <= CHUTE.x1; x += 2) fill(g, x, cy - 9, 1, 1, '#8ab8e0');
        fill(g, CHUTE.x1, cy - 9, 1, FRONT + 2 - cy + 9, '#6a98c8'); fill(g, 12, cy - 9, CHUTE.x1 - 11, 1, '#a8d0f0');
        // The claw's shadow on the floor, so you can see how far back it is.
        if (state !== 'idle') { g.globalAlpha = 0.5; fill(g, Math.round(claw.x) - 3, Math.round(floorY(claw.d)) - 1, 7, 2, '#120e22'); g.globalAlpha = 1; }
        // The prizes, back ones first; the one in the claw over everything.
        for (const p of prizes.filter(p => p !== claw.held).sort((a, b) => b.d - a.d)) drawPrize(g, p);
        drawClaw(g);
        if (claw.held) { const a = prizeArt(claw.held.kind); g.drawImage(a, Math.round(claw.x - a.width / 2), Math.round(tipY() - 6)); }
        // The glass: two streaks of light across it.
        g.globalAlpha = 0.12; line(g, 70, 20, 50, 89, '#ffffff'); line(g, 74, 20, 54, 89, '#ffffff'); line(g, 96, 20, 86, 60, '#ffffff'); g.globalAlpha = 1;
        fill(g, 12, 89, 96, 2, PINK[0]);
        // The panel: the hatch, the two buttons, the coin slot and its counter.
        fill(g, 8, 91, 104, 34, PINK[2]); fill(g, 8, 91, 104, 1, PINK[3]); fill(g, 108, 91, 4, 34, PINK[1]); fill(g, 8, 124, 104, 2, PINK[0]);
        fill(g, 14, 96, 24, 22, '#120e22'); fill(g, 15, 97, 22, 20, '#1e1838');
        if (hatch) { const a = prizeArt(hatch.kind); g.drawImage(a, Math.round(26 - a.width / 2), 116 - a.height); }
        fill(g, 14, 96, 24, hatch ? 2 : 6, '#c8b0c0'); fill(g, 14, hatch ? 97 : 101, 24, 1, '#8a7088');
        button(g, 56, 108, 1, '#3a64b0', '#6a96dc', '#a8c8f4');
        button(g, 79, 108, 2, '#b0841a', '#f0c04a', '#fff0a0');
        text(g, '¥100', 89, 95, '#5a1a34');
        fill(g, 92, 101, 14, 14, '#c8c8e0'); fill(g, 93, 102, 12, 12, '#9a9ac0'); fill(g, 98, 104, 2, 8, '#120e22');
        if (coinAnim >= 0) { const y = 98 + coinAnim * 3; fill(g, 96, y, 6, 2, '#e8e8f4'); fill(g, 96, y + 2, 6, 1, '#a8a8c0'); }
        fill(g, 89, 117, 20, 7, '#120e22'); text(g, credits, 107 - textW(credits), 118, credits ? '#ff6a5a' : '#5a2a2a');
        // The cabinet's feet, and the ledge where what you've won sits.
        fill(g, 12, 126, 6, 3, '#3a2418'); fill(g, 102, 126, 6, 3, '#3a2418');
        fill(g, 0, 141, AW, 1, '#d09a64'); fill(g, 0, 142, AW, 3, '#8a5a3a'); fill(g, 0, 145, AW, 1, '#5a3424');
        let x = 6;
        for (const kind of save.won.slice(-9)) { const a = prizeArt(kind); g.drawImage(a, x, 142 - a.height); x += a.width + 1; }
    }

    function button(g, cx, cy, n, dark, mid, lit) {
        const live = (n === 1 && (state === 'ready' || state === 'm1')) || (n === 2 && (state === 'wait2' || state === 'm2'));
        const down = (n === 1 && state === 'm1') || (n === 2 && state === 'm2');
        const blink = live && !down && Math.floor(lights * 2) % 2;
        for (let y = -7; y <= 7; y++) { const w = Math.round(Math.sqrt(49.5 - y * y)); fill(g, cx - w, cy + y + 1, w * 2 + 1, 1, '#5a1a34'); }
        const top = down ? 1 : 0;
        for (let y = -6; y <= 6; y++) {
            const w = Math.round(Math.sqrt(42.5 - y * y));
            fill(g, cx - w, cy + y + top, w * 2 + 1, 1, live ? (y < -2 && !down ? lit : y > 3 ? dark : mid) : y > 3 ? '#3a3050' : '#5a5070');
        }
        if (blink) fill(g, cx - 3, cy - 5 + top, 3, 1, '#ffffff');
        // ① an arrow right, ② an arrow up (back into the machine).
        const c = live ? '#1a1424' : '#2e2840';
        if (n === 1) { fill(g, cx - 3, cy + top, 6, 1, c); fill(g, cx + 1, cy - 2 + top, 1, 5, c); fill(g, cx + 2, cy - 1 + top, 1, 3, c); }
        else { fill(g, cx, cy - 2 + top, 1, 6, c); fill(g, cx - 2, cy + top, 5, 1, c); fill(g, cx - 1, cy - 1 + top, 3, 1, c); }
    }

    // ── The machine running ───────────────────────────────────────────────
    let wait = 0, stepT = 0, settle = null;
    const say = s => { if (foot) foot.textContent = s; };
    const tally = () => { if (sums) sums.textContent = `spent ¥${save.spent.toLocaleString('en')} · won ${save.won.length}`; };
    const prompt = () => say(credits ? 'hold ① to move right' : '¥100 a go');

    function press(n) {
        if (n === 1 && state === 'ready' && credits > 0) { credits--; hatch = null; slipped = gotOne = false; state = 'm1'; say('…'); }
        else if (n === 2 && state === 'wait2') { state = 'm2'; say('…'); }
    }
    function release(n) {
        if (n === 1 && state === 'm1') { state = 'wait2'; say('now hold ② to move back'); }
        else if (n === 2 && state === 'm2') { state = 'open'; wait = 0.35; sfx('crane-drop'); }
    }
    function coin(n = 100) {
        const plays = n >= 500 ? 6 : 1;
        if (credits + plays > 12) { say('that is plenty for now'); return false; }
        credits += plays; save.spent += n; keep(); tally();
        coinAnim = 0; sfx('coin');
        if (state === 'idle') state = 'ready';
        if (state === 'ready') prompt();
        return true;
    }

    /** What's under the claw, nearest first: a prize is caught by how close the claw came to its middle. */
    function under() {
        return prizes.filter(p => p !== claw.held && p.h === 0 && Math.abs(p.x - claw.x) <= 7 && Math.abs(p.d - claw.d) <= 0.16)
            .map(p => ({ p, off: Math.hypot(p.x - claw.x, (p.d - claw.d) * 40) })).sort((a, b) => a.off - b.off);
    }
    function grip(c) {
        // Weak, as they are; a little kinder after a run of misses, as they are.
        return Math.max(0.08, 0.7 - c.off * 0.08 - PRIZES[c.p.kind].weight + Math.max(0, misses - 5) * 0.07);
    }
    /** Let go of a prize from the claw, from right where it was hanging. */
    function drop(p) {
        p.d = claw.d; p.vh = 0;
        p.h = floorY(p.d) - (tipY() - 6 + prizeArt(p.kind).height - 1);
        slipped = true;
        p.x = claw.x + (claw.x > CHUTE.x1 + 2 ? rand(-3, 3) : 0);
        p.x = Math.min(X1 - 4, Math.max(14, p.x));
        p.d = Math.min(0.97, Math.max(0.02, p.d));
        claw.held = null;
    }
    function done() {
        const result = gotOne ? 'won' : slipped ? 'slipped' : 'missed';
        last = result;
        if (result === 'won') misses = 0; else misses++;
        state = credits ? 'ready' : 'idle';
        if (result === 'won') { say(`GET! ${PRIZES[hatch.kind].name}`); }
        else say(result === 'slipped' ? 'so close…' : 'nothing. again?');
        if (settle) { settle(result); settle = null; }
        if (prizes.length < 6) { stock(4, 50); }
    }

    function step(dt) {
        dt *= speed;
        lights += dt * (state === 'idle' ? 2 : 6);
        flash = Math.max(0, flash - dt);
        if (coinAnim >= 0) { coinAnim += dt * 14; if (coinAnim > 4) coinAnim = -1; }
        const moving = state === 'm1' || state === 'm2' || state === 'back';
        stepT -= dt; if (moving && stepT <= 0) { stepT = 0.14; sfx('crane-step'); }
        // Prizes falling: back onto the floor, or down the chute.
        for (const p of prizes.slice()) {
            if (p === claw.held || p.h <= 0 && !p.chute) continue;
            p.vh += 260 * dt; p.h -= p.vh * dt;
            if (p.x < CHUTE.x1 && p.d < CHUTE.d1 && !p.chute) p.chute = true;
            if (p.chute && p.h < -14) {
                prizes.splice(prizes.indexOf(p), 1);
                hatch = p; save.won.push(p.kind); keep(); tally(); flash = 2.2; sfx('crane-win');
                window.dispatchEvent(new CustomEvent('crane:won', { detail: { kind: p.kind, won: save.won.slice() } }));
                gotOne = true;
                if (state === 'wait-fall') done();
            } else if (!p.chute && p.h <= 0) { p.h = 0; p.vh = 0; if (state === 'wait-fall') done(); }
        }
        switch (state) {
            case 'm1': claw.x = Math.min(X1 - 4, claw.x + 24 * dt); if (claw.x >= X1 - 4) release(1); break;
            case 'm2': claw.d = Math.min(1, claw.d + 0.42 * dt); if (claw.d >= 1) release(2); break;
            case 'open': claw.open = Math.min(1, claw.open + dt * 3); if ((wait -= dt) <= 0) state = 'down'; break;
            case 'down': {
                const c = under()[0], floor = c ? floorY(c.p.d) - prizeArt(c.p.kind).height + 4 : floorY(claw.d) - 1;
                claw.len += 34 * dt;
                if (tipY() >= floor) { claw.len = floor - RAIL - 12; state = 'close'; wait = 0.45; sfx('crane-grab'); }
                break;
            }
            case 'close':
                claw.open = Math.max(0, claw.open - dt * 2.5);
                if ((wait -= dt) <= 0) {
                    const c = under()[0];
                    if (c && Math.random() < Math.min(0.95, grip(c) + 0.1)) { claw.held = c.p; claw.grip = grip(c); }
                    state = 'up';
                }
                break;
            case 'up':
                claw.len = Math.max(4, claw.len - 28 * dt);
                if (claw.len <= 4) {
                    // The jolt at the top, where most of them fall.
                    if (claw.held && Math.random() > claw.grip + 0.05) drop(claw.held);
                    state = 'back';
                }
                break;
            case 'back': {
                const dx = HOME.x - claw.x, dd = HOME.d - claw.d;
                claw.x += Math.sign(dx) * Math.min(Math.abs(dx), 26 * dt);
                claw.d += Math.sign(dd) * Math.min(Math.abs(dd), 0.45 * dt);
                if (claw.held && Math.random() < 0.36 * (1 - claw.grip) * dt) drop(claw.held);
                if (Math.abs(dx) < 0.5 && Math.abs(dd) < 0.01) { state = 'let'; wait = 0.5; }
                break;
            }
            case 'let':
                claw.open = Math.min(1, claw.open + dt * 3);
                if ((wait -= dt) <= 0.25 && claw.held) { drop(claw.held); slipped = false; }
                if (wait <= 0) {
                    claw.open = 0;
                    if (prizes.some(p => p.chute || p.h > 0)) state = 'wait-fall';
                    else done();
                }
                break;
        }
    }

    // ── The window ───────────────────────────────────────────────────────
    let box = null, cv = null, g = null, foot = null, sums = null, opener = null, raf = 0, then = 0;
    const pct = (v, of) => `${(v / of) * 100}%`;

    function styles() {
        const s = document.createElement('style');
        s.textContent = `
#crane { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(6, 8, 30, 0.5); }
#crane[hidden] { display: none; }
#crane .win { width: min(440px, 94vw, calc((100dvh - 110px) * ${AW / AH})); display: flex; flex-direction: column; background: #1c1836; color: #c8ccf0;
  border: 3px solid #08081a; box-shadow: 0 0 0 3px #6a7098, 8px 8px 0 3px rgba(4, 6, 24, 0.6); animation: crane-in 0.25s steps(4) both;
  font: 14px/1.45 'DotGothic16', ui-monospace, 'Cascadia Mono', Menlo, monospace; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#crane .bar { display: flex; align-items: center; padding: 5px 8px; background: #2a3468; color: #8e96c8; font-size: 12px; letter-spacing: 0.06em; }
#crane .bar span { flex: 1; text-align: center; }
#crane .bar button { font: inherit; color: #c8ccf0; background: none; border: 0; cursor: pointer; padding: 0 4px; font-size: 15px; line-height: 1; }
#crane .stage { position: relative; }
#crane canvas { display: block; width: 100%; aspect-ratio: ${AW} / ${AH}; image-rendering: pixelated; }
#crane .hit { position: absolute; background: none; border: 0; padding: 0; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; border-radius: 50%; }
#crane .hit.coin { border-radius: 0; }
#crane .hit:focus-visible { outline: 2px dashed #fff2c8; outline-offset: 2px; }
#crane .foot { padding: 6px 12px 9px; text-align: center; color: #c8ccf0; font-size: 13px; display: flex; flex-direction: column; gap: 2px; align-items: center; }
#crane .foot .sums { color: #8e96c8; font-size: 12px; }
#crane .foot button { font: inherit; font-size: 12px; color: #fff2c8; background: #5a2a4a; border: 2px solid #08081a; box-shadow: 0 0 0 1px #b8486a; padding: 2px 8px; cursor: pointer; margin-top: 3px; }
@keyframes crane-in { from { transform: scale(0.96); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #crane .win { animation: none; } }`;
        document.head.appendChild(s);
    }

    function hit(cls, label, x, y, w, h) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `hit ${cls}`; b.setAttribute('aria-label', label);
        Object.assign(b.style, { left: pct(x, AW), top: pct(y, AH), width: pct(w, AW), height: pct(h, AH) });
        return b;
    }
    /** A button you hold: down presses, lifting (or losing the finger) lets go. */
    function holdable(b, n) {
        b.addEventListener('pointerdown', e => { e.preventDefault(); if (b.setPointerCapture) try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } press(n); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => release(n));
        b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(n); } });
        b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(n); } });
        b.addEventListener('contextmenu', e => e.preventDefault());
    }

    function build() {
        styles();
        box = document.createElement('div');
        box.id = 'crane'; box.hidden = true;
        box.innerHTML = `<div class="win" role="dialog" aria-modal="true" aria-label="Crane game">
  <div class="bar"><span>クレーン · crane game</span><button type="button" aria-label="Close the crane game">×</button></div>
  <div class="stage"><canvas width="${AW}" height="${AH}"></canvas></div>
  <div class="foot"><span class="say" aria-live="polite"></span><span class="sums"></span><button type="button" class="five">¥500 · six goes</button></div>
</div>`;
        document.body.appendChild(box);
        cv = box.querySelector('canvas'); g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        foot = box.querySelector('.say'); sums = box.querySelector('.sums');
        const stage = box.querySelector('.stage');
        const b1 = hit('one', '① move right: hold', 46, 98, 20, 20), b2 = hit('two', '② move back: hold', 69, 98, 20, 20), slot = hit('coin', 'put in ¥100', 87, 93, 22, 24);
        holdable(b1, 1); holdable(b2, 2);
        slot.addEventListener('click', () => coin(100));
        stage.append(b1, b2, slot);
        box.querySelector('.five').addEventListener('click', () => coin(500));
        box.querySelector('.bar button').addEventListener('click', close);
        box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
        const keys = { ArrowRight: 1, ArrowUp: 2 };
        box.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (keys[e.key]) { e.preventDefault(); if (!e.repeat) press(keys[e.key]); }
        });
        box.addEventListener('keyup', e => { if (keys[e.key]) { e.preventDefault(); release(keys[e.key]); } });
    }

    function loop(now) {
        const dt = Math.min(0.05, (now - then) / 1000 || 0);
        then = now;
        step(dt);
        draw(g, now / 1000);
        raf = requestAnimationFrame(loop);
    }

    function open() {
        if (!box) build();
        opener = document.activeElement;
        box.hidden = false;
        tally();
        if (state === 'idle' || state === 'ready') prompt();
        then = performance.now();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
        box.querySelector(credits ? '.hit.one' : '.hit.coin').focus({ preventScroll: true });
    }
    function close() {
        if (!box || box.hidden) return;
        release(1); release(2);
        box.hidden = true;
        cancelAnimationFrame(raf);
        if (opener && opener.focus) opener.focus();
    }

    /** For checks: play one go, aiming at (x, d), and say how it went. */
    function auto(x = 60, d = 0.5, fast = 4) {
        if (!box || box.hidden) open();
        if (!credits) coin(100);
        speed = fast;
        return new Promise(resolve => {
            settle = r => { speed = 1; resolve(r); };
            press(1);
            const aim = () => {
                if (state === 'm1' && claw.x >= x) release(1);
                if (state === 'wait2') press(2);
                if (state === 'm2' && claw.d >= d) release(2);
                if (state === 'm1' || state === 'wait2' || state === 'm2') setTimeout(aim, 10);
            };
            aim();
        });
    }

    window.Crane = {
        open, close, coin, auto,
        get isOpen() { return !!(box && !box.hidden); },
        get state() { return state; },
        get credits() { return credits; },
        get won() { return save.won.slice(); },
        get prizes() { return prizes.map(p => ({ kind: p.kind, x: +p.x.toFixed(1), d: +p.d.toFixed(2), h: +p.h.toFixed(1) })); },
        PRIZES, prizeArt
    };
})();
