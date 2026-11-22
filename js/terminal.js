/*
 * terminal.js — the laptop on the futon, opened: a small shell you can type in.
 *
 * Who I am and what I've made come from my public GitHub profile and repos
 * (read live, cached for the visit); the rest of it talks to the room: nap,
 * the lantern, the cat. ?gh=off skips GitHub (the checks use it).
 *
 *   Terminal.open(), Terminal.close(), Terminal.run('ls'), Terminal.isOpen
 */
(function () {
    'use strict';
    const USER = 'khmurakami';
    const q = new URLSearchParams(location.search);
    const offline = q.get('gh') === 'off';
    const room = () => window.TatamiPixel || {};
    const RT = () => window.RoomTime;

    // ── GitHub, read once a visit ─────────────────────────────────────────
    const cache = {
        get(k) { try { const v = JSON.parse(sessionStorage.getItem(k)); return v && Date.now() - v.at < 30 * 60000 ? v.data : null; } catch { return null; } },
        set(k, data) { try { sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), data })); } catch { } }
    };
    async function gh(path, key) {
        const hit = cache.get(key);
        if (hit) return hit;
        if (offline) return null;
        try {
            const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json' } });
            if (!res.ok) return null;
            const data = await res.json();
            cache.set(key, data);
            return data;
        } catch { return null; }
    }
    const profile = () => gh(`/users/${USER}`, 'term-profile');
    const repos = async () => {
        const list = await gh(`/users/${USER}/repos?sort=pushed&per_page=50`, 'term-repos');
        return (list || []).filter(r => !r.fork).map(r => ({ name: r.name, desc: r.description || '', stars: r.stargazers_count, url: r.html_url, lang: r.language, pushed: r.pushed_at }));
    };

    // ── The window ────────────────────────────────────────────────────────
    let box = null, out = null, input = null, opener = null;
    const history = [];
    let hi = 0;
    function styles() {
        const s = document.createElement('style');
        s.textContent = `
#term { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(6, 8, 30, 0.5); }
#term[hidden] { display: none; }
#term .win { width: min(600px, 94vw); height: min(400px, 72vh); display: flex; flex-direction: column; background: #161c3e; color: #c8ccf0;
  border: 3px solid #08081a; box-shadow: 0 0 0 3px #6a7098, 8px 8px 0 3px rgba(4, 6, 24, 0.6); animation: term-in 0.25s steps(4) both;
  font: 15px/1.5 'DotGothic16', ui-monospace, 'Cascadia Mono', Menlo, monospace; }
#term .bar { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: #2a3468; color: #8e96c8; font-size: 12px; letter-spacing: 0.06em; }
#term .bar i { width: 9px; height: 9px; display: block; }
#term .bar span { flex: 1; text-align: center; }
#term .bar button { font: inherit; color: #c8ccf0; background: none; border: 0; cursor: pointer; padding: 0 4px; font-size: 15px; line-height: 1; }
#term .bar button:focus-visible { outline: 1px dashed #c8ccf0; }
#term .log { flex: 1; overflow-y: auto; padding: 10px 12px 4px; white-space: pre-wrap; word-break: break-word; scrollbar-width: thin; scrollbar-color: #3e4270 transparent; }
#term .line { display: flex; gap: 0.6ch; padding: 0 12px 10px; }
#term .ps { color: #a8f0a0; white-space: nowrap; }
#term input { flex: 1; min-width: 0; font: inherit; color: #ffffff; background: none; border: 0; outline: none; caret-color: #ffd27a; padding: 0; }
#term .k { color: #ff7aa8; } #term .y { color: #ffd27a; } #term .c { color: #7ad8ff; } #term .g { color: #a8f0a0; } #term .d { color: #6a7098; }
#term a { color: #7ad8ff; }
@keyframes term-in { from { transform: scale(0.96); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #term .win { animation: none; } }`;
        document.head.appendChild(s);
    }
    function build() {
        styles();
        box = document.createElement('div');
        box.id = 'term'; box.hidden = true;
        box.innerHTML = `<div class="win" role="dialog" aria-modal="true" aria-label="Terminal on the laptop">
  <div class="bar"><i style="background:#ff6a7a"></i><i style="background:#ffd27a"></i><i style="background:#a8f0a0"></i><span>${USER}@summer: ~</span><button type="button" aria-label="Close terminal">×</button></div>
  <div class="log" role="log" aria-live="polite"></div>
  <label class="line"><span class="ps">${USER}@summer:~$</span><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>
</div>`;
        document.body.appendChild(box);
        out = box.querySelector('.log'); input = box.querySelector('input');
        box.querySelector('.bar button').addEventListener('click', close);
        box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
        box.querySelector('.win').addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; run(v); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                hi = Math.max(0, Math.min(history.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
                input.value = history[hi] || '';
            } else if (e.key === 'Tab') { e.preventDefault(); complete(); }
            else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
        });
        greet();
    }

    /** Print a line: a string, or [text, class] pieces, links as { href, text }. */
    function say(...parts) {
        const div = document.createElement('div');
        for (const p of parts) {
            if (typeof p === 'string') div.append(p);
            else if (p.href) { const a = document.createElement('a'); a.href = p.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = p.text || p.href; div.append(a); }
            else { const s = document.createElement('span'); s.className = p[1]; s.textContent = p[0]; div.append(s); }
        }
        out.append(div);
        out.scrollTop = out.scrollHeight;
        return div;
    }
    const blank = () => say(' ');

    function greet() {
        const now = RT() ? RT().now() : new Date();
        const air = { spring: 'petals on the veranda', summer: 'the cicadas are loud', autumn: 'the crickets are out', winter: 'the kettle is on' }[RT() ? RT().season(now) : 'summer'];
        say(['summer-os', 'g'], ` · ${now.toDateString().toLowerCase()} · ${air}`);
        say('type ', ['help', 'y'], ' to look around. ', ['esc', 'y'], ' closes the lid.');
        blank();
    }

    // ── Commands ──────────────────────────────────────────────────────────
    const FILES = ['about.txt', 'links.txt', 'projects/', 'now.txt'];
    const moonName = p => ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'][Math.round(p * 8) % 8];
    const partOfDay = h => h < 5 ? 'the middle of the night' : h < 7 ? 'dawn' : h < 11 ? 'morning' : h < 14 ? 'midday' : h < 16.5 ? 'afternoon' : h < 18.2 ? 'golden hour' : h < 19.2 ? 'sunset' : h < 20.2 ? 'blue hour' : 'night';
    const open = url => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };

    const COMMANDS = {
        help: { about: 'this list', run() {
            for (const [name, c] of Object.entries(COMMANDS)) if (!c.hidden) say(['  ' + name.padEnd(10), 'y'], c.about);
            say(['  ↑ ↓', 'd'], ' history  ', ['tab', 'd'], ' completes  ', ['esc', 'd'], ' closes');
        } },
        ls: { about: 'what is here', run(args) {
            if ((args[0] || '').startsWith('proj')) return COMMANDS.projects.run([]);
            say(...FILES.flatMap(f => [[f, f.endsWith('/') ? 'c' : ''], '   ']), ...(args.includes('-a') ? [['.dreams', 'd']] : []));
        } },
        cat: { about: 'read a file', async run(args) {
            const f = (args[0] || '').replace(/^\.\//, '');
            if (!f) return say('cat: which file? try ', ['cat about.txt', 'y']);
            if (f === 'about.txt') {
                const p = await profile();
                if (!p) return say(['github is out of reach right now. the profile is at ', 'd'], { href: `https://github.com/${USER}` });
                say([p.name || p.login, 'k'], p.location ? ['  · ' + p.location, 'd'] : '');
                if (p.bio) say(p.bio);
                say(['repos ', 'd'], String(p.public_repos), ['  followers ', 'd'], String(p.followers), ['  on github since ', 'd'], String(new Date(p.created_at).getFullYear()));
                return;
            }
            if (f === 'links.txt') {
                const p = await profile();
                say(['github   ', 'y'], { href: `https://github.com/${USER}` });
                if (p && p.blog) say(['web      ', 'y'], { href: /^https?:/.test(p.blog) ? p.blog : 'https://' + p.blog, text: p.blog });
                if (p && p.twitter_username) say(['x        ', 'y'], { href: `https://x.com/${p.twitter_username}`, text: '@' + p.twitter_username });
                return;
            }
            if (f === 'now.txt') return COMMANDS.date.run([]);
            if (f === '.dreams') return say('a whole summer with nowhere to be.');
            if (f === 'projects' || f === 'projects/') return say('cat: projects: is a directory. try ', ['ls projects', 'y']);
            say(`cat: ${f}: no such file`);
        } },
        projects: { about: 'what I have made', async run() {
            const list = await repos();
            if (!list.length) return say('the repos are on github: ', { href: `https://github.com/${USER}?tab=repositories` });
            for (const r of list.slice(0, 12)) say(['  ' + r.name, 'c'], r.stars ? ['  ★' + r.stars, 'y'] : '', r.desc ? ['  ' + r.desc, ''] : ['', ''], r.lang ? ['  · ' + r.lang.toLowerCase(), 'd'] : '');
            say(['  open <name>', 'y'], ' to visit one');
        } },
        open: { about: 'open a project, or github', async run(args) {
            const name = (args[0] || 'github').replace(/\/$/, '');
            if (name === 'github') { say('opening github…'); return open(`https://github.com/${USER}`); }
            const r = (await repos()).find(x => x.name.toLowerCase() === name.toLowerCase());
            if (!r) return say(`open: no project called ${name}. try `, ['projects', 'y']);
            say(`opening ${r.name}…`); open(r.url);
        } },
        date: { about: 'the time, the light, the moon', run() {
            const rt = RT(); if (!rt) return say(new Date().toString());
            const d = rt.now(), h = rt.hour(d), m = rt.moon(d);
            say(d.toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase());
            say([partOfDay(h), 'y'], ['  · ', 'd'], rt.season(d), ['  · ', 'd'], moonName(m.phase), rt.offset ? ['  · you napped ' + Math.round(rt.offset / 3600000) + 'h', 'd'] : '');
        } },
        nap: { about: 'lie down on the futon', run() { say('the lid closes. the cicadas fade…'); setTimeout(() => { close(); room().nap && room().nap(); }, 500); } },
        lantern: { about: 'light the lantern, or put it out', run() { const on = room().lantern && room().lantern(); say(on ? 'the lantern glows.' : 'the lantern goes dark.'); } },
        books: { about: 'what I have made, as books', run() { close(); if (window.Shelf) Shelf.open(); } },
        season: { about: 'turn the season (spring, summer, autumn, winter)', run(args) {
            const s = room().season ? room().season((args[0] || '').toLowerCase() || undefined) : false;
            say(s ? `the scroll turns. ${s}.` : 'the season stays as it is.');
        } },
        radio: { about: 'tune the radio', run() { const s = room().tune ? room().tune() : ''; say(s ? `the radio crackles into ${s}.` : 'the radio clicks off.'); } },
        usagi: { hidden: true, run() { say(room().usagi && room().usagi() ? 'look up.' : 'the moon is not up yet.'); } },
        neko: { about: 'the cat', run() { room().pet && room().pet(); say('=^･ω･^=  purr'); } },
        whoami: { about: 'you', run() { say('a visitor, sitting on the tatami with the door open.'); } },
        clear: { about: 'wipe the screen', run() { out.textContent = ''; } },
        exit: { about: 'close the lid', run() { close(); } },
        sudo: { hidden: true, run() { say('nice try. the cat has root.'); } },
        rm: { hidden: true, run() { say('rm: the summer is read-only.'); } },
        vim: { hidden: true, run() { say('you are now trapped in a summer afternoon. ', ['exit', 'y'], ' to leave.'); } },
        cd: { hidden: true, run(args) { say(args[0] ? `cd: ${args[0]}: you are already where you need to be` : ''); } },
        pwd: { hidden: true, run() { say('/home/summer/tatami'); } },
        echo: { hidden: true, run(args) { say(args.join(' ')); } }
    };
    COMMANDS.quit = { hidden: true, run: COMMANDS.exit.run };
    COMMANDS.cat.hidden = false;

    async function run(line) {
        if (!box) build();
        const text = line.trim();
        say(['$ ', 'g'], text);
        if (!text) return;
        history.push(text); hi = history.length;
        const [name, ...args] = text.split(/\s+/);
        const c = COMMANDS[name.toLowerCase()];
        if (!c) { say(`${name}: command not found. try `, ['help', 'y']); blank(); return; }
        await c.run(args);
        if (name !== 'clear' && box && !box.hidden) blank();
    }
    function complete() {
        const v = input.value, parts = v.split(/\s+/);
        const pool = parts.length > 1 ? FILES : Object.keys(COMMANDS).filter(k => !COMMANDS[k].hidden);
        const last = parts[parts.length - 1], hits = pool.filter(p => p.startsWith(last));
        if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' ') + (hits[0].endsWith('/') ? '' : ' '); }
        else if (hits.length > 1) say(['$ ', 'g'], v), say(hits.join('   '));
    }

    function openTerm() {
        if (!box) build();
        opener = document.activeElement;
        box.hidden = false;
        input.focus();
    }
    function close() {
        if (!box || box.hidden) return;
        box.hidden = true;
        if (opener && opener.focus) opener.focus();
    }
    window.Terminal = { open: openTerm, close, run, repos, get isOpen() { return !!(box && !box.hidden); } };
})();
