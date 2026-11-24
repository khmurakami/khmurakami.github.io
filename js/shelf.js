/*
 * The bookshelf: what I've made, as books. The stack of books on the tatami
 * opens it; pick a book and it slides off the shelf and opens to a page about
 * that project. The pictures are pixels on a canvas at a whole-number scale,
 * the words are text laid over the pages so they stay sharp.
 *
 *   Shelf.open()  Shelf.close()  Shelf.pick(name)  Shelf.isOpen
 *
 * The books come from my public GitHub repos (through the terminal's cache),
 * with the list below for when GitHub can't be reached.
 */
(function () {
    'use strict';

    const USER = window.Site.user;
    const HOME = window.Site.repo;
    const FALLBACK = [
        { name: HOME, desc: '', lang: 'JavaScript', stars: 0, url: `https://github.com/${USER}/${HOME}`, pushed: '2026-11-22' },
        { name: 'my-claude-skills', desc: '', lang: null, stars: 0, url: `https://github.com/${USER}/my-claude-skills`, pushed: '2026-04-03' },
        { name: 'pystocktwits', desc: 'Unofficial Python Wrapper for Stocktwits', lang: 'Python', stars: 22, url: `https://github.com/${USER}/pystocktwits`, pushed: '2019-03-03' },
        { name: 'pymapillary', desc: 'Unofficial Python Wrapper for Mapillary API V3', lang: 'Python', stars: 3, url: `https://github.com/${USER}/pymapillary`, pushed: '2019-03-03' }
    ];
    const about = r => (r.name === HOME ? 'this room: the one you are sitting in.' : r.desc || 'no notes in this one yet.');

    // Cloth bindings, dark to light: one per book, in shelf order.
    const CLOTH = [['#6a2430', '#c04a4a', '#e8806a'], ['#1c2c66', '#3a64b0', '#6a96dc'], ['#7a5414', '#d8a83a', '#f0d070'],
        ['#1e4a38', '#428466', '#74b08c'], ['#422656', '#82569a', '#b086c4'], ['#5a3014', '#b0683a', '#dc9a64']];
    const LANG = { JavaScript: '#f0d24a', Python: '#4a7ac8', TypeScript: '#3a7ad8', HTML: '#e06a3a', CSS: '#7a5ac8' };
    const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

    // ── Drawing, in art pixels ────────────────────────────────────────────
    const AW = 120, AH = 72, PLANK = 56;
    const fill = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

    function layout(list) {
        let x = 22;
        return list.map((r, i) => {
            const w = 9 + (hash(r.name + 'w') % 4), h = 30 + (hash(r.name) % 10), b = { x, w, h, c: CLOTH[i % CLOTH.length] };
            x += w + 1;
            return b;
        });
    }

    function drawShelf(g, books, hover, lifted) {
        fill(g, 0, 0, AW, AH, '#1c1836');
        for (let x = 3; x < AW; x += 7) fill(g, x, 0, 1, PLANK, '#201b3e');
        // The plank, lit along its top edge, with its shadow on the wall below.
        fill(g, 0, PLANK, AW, 1, '#d09a64'); fill(g, 0, PLANK + 1, AW, 4, '#8a5a3a'); fill(g, 0, PLANK + 5, AW, 1, '#5a3424');
        fill(g, 0, PLANK + 6, AW, 2, '#120e22');
        for (const x of [10, AW - 12]) { fill(g, x, PLANK + 6, 2, 6, '#3a2418'); fill(g, x + 2, PLANK + 8, 1, 3, '#3a2418'); }
        // A daruma holding up the left end.
        const dx = 9, dy = PLANK - 11;
        for (let y = 0; y < 11; y++) { const half = Math.round(5 * Math.sqrt(1 - ((y - 5.5) / 6) ** 2)); fill(g, dx - half, dy + y, half * 2 + 1, 1, y < 5 ? '#d04a4a' : '#b03a40'); }
        fill(g, dx - 3, dy + 2, 7, 4, '#f4e4c8'); fill(g, dx - 2, dy + 3, 1, 1, '#1a1424'); fill(g, dx + 2, dy + 3, 1, 1, '#f4e4c8');
        fill(g, dx - 4, dy + 1, 1, 2, '#f08a7a');
        // The books, standing.
        books.forEach((b, i) => {
            const lift = lifted && lifted.i === i ? lifted.by : hover === i ? 2 : 0, top = PLANK - b.h - lift, [d, m, l] = b.c;
            if (lifted && lifted.i === i && lifted.by > b.h) return;
            if (hover === i && !lifted) { fill(g, b.x - 1, top - 1, b.w + 2, b.h + 1, '#fff2c8'); }
            fill(g, b.x, top, b.w, b.h, m);
            fill(g, b.x, top, 1, b.h, l); fill(g, b.x + b.w - 1, top, 1, b.h, d); fill(g, b.x, top, b.w, 1, d);
            fill(g, b.x + 1, top + 3, b.w - 2, 2, d); fill(g, b.x + 1, top + b.h - 6, b.w - 2, 2, d);
            // A paper label with a few lines of title on it.
            fill(g, b.x + 2, top + 9, b.w - 4, 8, '#efe0bc');
            for (let k = 0; k < 3; k++) fill(g, b.x + 3, top + 10 + k * 2, b.w - 6 - (k === 2 ? 2 : 0), 1, '#6a5466');
            fill(g, b.x + 2, top + 9, 1, 8, '#fff6dc');
        });
        // A small plant at the other end.
        const px0 = books.length ? books[books.length - 1].x + books[books.length - 1].w + 8 : 70;
        fill(g, px0, PLANK - 7, 9, 7, '#b86a4a'); fill(g, px0, PLANK - 7, 9, 1, '#dc8a64'); fill(g, px0 + 7, PLANK - 6, 2, 6, '#8a4a34');
        const leaves = [[4, -9, 1, 2], [2, -12, 2, 1], [5, -14, 1, 5], [6, -12, 3, 1], [1, -10, 2, 1], [3, -17, 2, 1], [6, -17, 2, 1], [8, -9, 2, 1]];
        for (const [x, y, w, h] of leaves) fill(g, px0 + x, PLANK - 7 + y + 7 - 7, w, h, '#5aa064');
        fill(g, px0 + 4, PLANK - 16, 1, 9, '#3a7a4a');
    }

    /** The book, opening: 0 closed, 1 half open, 2 open flat. */
    function drawBook(g, b, step) {
        fill(g, 0, 0, AW, AH, '#1c1836');
        for (let x = 3; x < AW; x += 7) fill(g, x, 0, 1, AH, '#201b3e');
        const [d, m, l] = b.c, paper = '#f4ead4', edge = '#d8ccb0';
        if (step === 0) {
            fill(g, 44, 10, 32, 52, m); fill(g, 44, 10, 3, 52, d); fill(g, 75, 10, 1, 52, d); fill(g, 47, 10, 28, 1, l);
            fill(g, 52, 22, 18, 10, '#efe0bc'); for (let k = 0; k < 3; k++) fill(g, 54, 24 + k * 3, 14 - k * 3, 1, '#6a5466');
            fill(g, 46, 62, 30, 2, '#120e22');
            return;
        }
        if (step === 1) {
            fill(g, 60, 9, 40, 54, paper); fill(g, 60, 9, 2, 54, edge); fill(g, 99, 9, 1, 54, edge);
            fill(g, 40, 8, 20, 56, m); fill(g, 40, 8, 20, 1, l); fill(g, 40, 8, 1, 56, d);
            fill(g, 42, 63, 60, 2, '#120e22');
            return;
        }
        // Open flat: the cover's edge all round, two pages, the gutter, a ribbon.
        fill(g, 5, 6, 110, 61, d); fill(g, 5, 6, 110, 1, m);
        fill(g, 7, 8, 52, 56, paper); fill(g, 61, 8, 52, 56, paper);
        fill(g, 55, 8, 4, 56, '#ecdfc4'); fill(g, 58, 8, 1, 56, edge); fill(g, 59, 8, 2, 56, '#a8987c'); fill(g, 61, 8, 1, 56, edge); fill(g, 62, 8, 3, 56, '#ecdfc4');
        for (let y = 64; y < 67; y++) for (let x = 7; x < 113; x += 2) fill(g, x + (y & 1), y, 1, 1, y === 64 ? edge : '#b8aa8e');
        fill(g, 104, 6, 3, 18, '#c04a4a'); fill(g, 104, 24, 1, 1, '#c04a4a'); fill(g, 106, 24, 1, 1, '#c04a4a'); fill(g, 105, 6, 1, 17, '#e06a64');
        fill(g, 4, 68, 112, 2, '#120e22');
    }

    // ── The window ───────────────────────────────────────────────────────
    let box = null, cv = null, g = null, hits = null, words = null, foot = null, opener = null;
    let list = FALLBACK.slice(), books = layout(list), hover = -1, chosen = -1, busy = false;
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function styles() {
        const s = document.createElement('style');
        s.textContent = `
#shelf { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(6, 8, 30, 0.5); }
#shelf[hidden] { display: none; }
#shelf .win { width: min(560px, 94vw); display: flex; flex-direction: column; background: #1c1836; color: #c8ccf0;
  border: 3px solid #08081a; box-shadow: 0 0 0 3px #6a7098, 8px 8px 0 3px rgba(4, 6, 24, 0.6); animation: shelf-in 0.25s steps(4) both;
  font: 14px/1.45 'DotGothic16', ui-monospace, 'Cascadia Mono', Menlo, monospace; }
#shelf .bar { display: flex; align-items: center; padding: 5px 8px; background: #2a3468; color: #8e96c8; font-size: 12px; letter-spacing: 0.06em; }
#shelf .bar span { flex: 1; text-align: center; }
#shelf .bar button { font: inherit; color: #c8ccf0; background: none; border: 0; cursor: pointer; padding: 0 4px; font-size: 15px; line-height: 1; }
#shelf .stage { position: relative; }
#shelf canvas { display: block; width: 100%; aspect-ratio: ${AW} / ${AH}; image-rendering: pixelated; }
#shelf .hit { position: absolute; background: none; border: 0; padding: 0; cursor: pointer; }
#shelf .hit:focus-visible { outline: 2px dashed #fff2c8; outline-offset: 2px; }
#shelf .foot { min-height: 1.45em; padding: 6px 12px 9px; text-align: center; color: #8e96c8; font-size: 13px; }
#shelf .page { position: absolute; color: #2a2240; overflow: hidden; display: flex; flex-direction: column; gap: 0.35em; font-size: clamp(10px, 2.6vw, 14px); line-height: 1.4; }
#shelf .page h2 { margin: 0; font: inherit; font-size: 1.25em; color: #1a1430; overflow-wrap: anywhere; }
#shelf .page p { margin: 0; }
#shelf .page .meta { color: #6a5a70; }
#shelf .page .dot { display: inline-block; width: 0.6em; height: 0.6em; margin-right: 0.35em; vertical-align: 0.05em; }
#shelf .page a, #shelf .page button { font: inherit; color: #3a54a8; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; text-decoration: underline; text-underline-offset: 0.2em; }
#shelf .page a:focus-visible, #shelf .page button:focus-visible { outline: 1px dashed #3a54a8; }
#shelf .hanko { width: 2.6em; height: 2.6em; display: grid; place-items: center; color: #f4ead4; background: #c04a4a; font-size: 1.2em; box-shadow: inset 0 0 0 2px #e8806a; margin-bottom: 0.3em; }
@keyframes shelf-in { from { transform: scale(0.96); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #shelf .win { animation: none; } }`;
        document.head.appendChild(s);
    }

    function build() {
        styles();
        box = document.createElement('div');
        box.id = 'shelf'; box.hidden = true;
        box.innerHTML = `<div class="win" role="dialog" aria-modal="true" aria-label="Bookshelf: my projects">
  <div class="bar"><span>本棚 · bookshelf</span><button type="button" aria-label="Close the bookshelf">×</button></div>
  <div class="stage"><canvas width="${AW}" height="${AH}"></canvas><div class="hits"></div><div class="words"></div></div>
  <div class="foot" aria-live="polite"></div>
</div>`;
        document.body.appendChild(box);
        cv = box.querySelector('canvas'); g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        hits = box.querySelector('.hits'); words = box.querySelector('.words'); foot = box.querySelector('.foot');
        box.querySelector('.bar button').addEventListener('click', close);
        box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
        box.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); if (chosen >= 0) back(); else close(); }
        });
    }

    const pct = (v, of) => `${(v / of) * 100}%`;
    function showShelf() {
        chosen = -1;
        drawShelf(g, books, hover, null);
        words.textContent = '';
        hits.textContent = '';
        books.forEach((b, i) => {
            const r = list[i], btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'hit';
            btn.setAttribute('aria-label', `${r.name}: open the book`);
            Object.assign(btn.style, { left: pct(b.x - 1, AW), top: pct(PLANK - b.h - 3, AH), width: pct(b.w + 2, AW), height: pct(b.h + 3, AH) });
            const point = () => { hover = i; drawShelf(g, books, hover, null); foot.textContent = `${r.name}${r.stars ? ` · ★${r.stars}` : ''}`; };
            btn.addEventListener('pointerenter', point); btn.addEventListener('focus', point);
            btn.addEventListener('pointerleave', () => { if (hover === i) { hover = -1; drawShelf(g, books, hover, null); foot.textContent = 'pick a book'; } });
            btn.addEventListener('click', () => pick(i));
            hits.appendChild(btn);
        });
        foot.textContent = 'pick a book';
    }

    async function pick(i) {
        if (typeof i === 'string') i = list.findIndex(r => r.name === i);
        if (busy || i < 0 || i >= list.length) return;
        busy = true; chosen = i; hover = -1; hits.textContent = '';
        const b = books[i], r = list[i];
        if (!reduce()) {
            // Off the shelf in three steps, then the cover, half open, open.
            for (const by of [4, 12, 24, b.h + 1]) { drawShelf(g, books, -1, { i, by }); await sleep(70); }
            for (const step of [0, 1]) { drawBook(g, b, step); await sleep(110); }
        }
        drawBook(g, b, 2);
        const when = r.pushed ? new Date(r.pushed).toLocaleDateString('en', { month: 'short', year: 'numeric' }).toLowerCase() : '';
        words.innerHTML = '';
        const left = document.createElement('div'), right = document.createElement('div');
        left.className = right.className = 'page';
        Object.assign(left.style, { left: pct(10, AW), top: pct(10, AH), width: pct(45, AW), height: pct(52, AH) });
        Object.assign(right.style, { left: pct(70, AW), top: pct(12, AH), width: pct(40, AW), height: pct(50, AH) });
        left.innerHTML = '<h2></h2><p class="desc"></p><p class="meta"></p>';
        left.querySelector('h2').textContent = r.name;
        left.querySelector('.desc').textContent = about(r);
        const meta = left.querySelector('.meta');
        if (r.lang) { const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = LANG[r.lang] || '#8a7a90'; meta.append(dot, r.lang); }
        if (r.stars) meta.append(`${r.lang ? '  ' : ''}★${r.stars}`);
        if (when) { meta.append(document.createElement('br'), `last touched ${when}`); }
        right.innerHTML = '<div class="hanko" aria-hidden="true"></div><a target="_blank" rel="noopener noreferrer">read it on github ↗</a><button type="button">← back to the shelf</button>';
        right.querySelector('.hanko').textContent = r.name.replace(/^py/, '').charAt(0).toUpperCase();
        right.querySelector('a').href = Links.safe(r.url) || window.Site.github;
        right.querySelector('button').addEventListener('click', back);
        words.append(left, right);
        foot.textContent = `${i + 1} of ${list.length}`;
        right.querySelector('a').focus();
        busy = false;
    }

    function back() {
        if (busy) return;
        const i = chosen;
        showShelf();
        const btn = hits.children[i];
        if (btn) btn.focus();
    }

    async function load() {
        if (!window.Terminal || !Terminal.repos) return;
        const got = await Terminal.repos();
        if (!got || !got.length || chosen >= 0 || box.hidden) return;
        list = got.slice(0, 8);
        books = layout(list);
        showShelf();
    }

    function open() {
        if (!box) build();
        opener = document.activeElement;
        box.hidden = false;
        showShelf();
        const first = hits.querySelector('button');
        if (first) first.focus({ preventScroll: true });
        load();
    }
    function close() {
        if (!box || box.hidden) return;
        box.hidden = true; busy = false;
        if (opener && opener.focus) opener.focus();
    }

    window.Shelf = { open, close, pick: async name => { if (!box || box.hidden) open(); await pick(name); }, get isOpen() { return !!(box && !box.hidden); }, get book() { return chosen >= 0 ? list[chosen].name : null; } };
})();
