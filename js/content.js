/**
 * Content for the world's panels.
 *
 * Keeps the markup for each interaction in one place, away from the game loop.
 * Everything reads from the existing config — projects from projects.js, posts
 * from the blog service — so there is one source of truth per kind of content.
 */
import { projects } from './config/projects.js';
import { BlogService } from './engine/BlogService.js';
import { Terminal } from './engine/Terminal.js';
import { city } from './config/city.js';
import { site } from './config/site.js';

const esc = (s) => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Projects ─────────────────────────────────────────────────────────

export function projectPanel(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return { title: 'Project', html: '<p>Not found.</p>' };

    const tags = p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('');
    const links = p.links.map(l =>
        `<a class="btn" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`
    ).join('');

    return {
        title: p.title,
        html: `
            <p class="meta">${esc(p.year)}</p>
            <div class="chips">${tags}</div>
            <p class="lede">${esc(p.summary)}</p>
            <p>${esc(p.body)}</p>
            <div class="actions">${links}</div>`
    };
}

// ── Blog ─────────────────────────────────────────────────────────────

export function blogPanel() {
    const posts = BlogService.getAllPosts();
    if (!posts.length) return { title: 'Posts', html: '<p>No posts yet.</p>' };

    // Newest first — the stack reads like a pile of papers, most recent on top.
    const items = posts.map(post => `
        <a class="stack-item" href="blog.html?id=${encodeURIComponent(post.id)}">
            <span class="stack-date">${esc(post.date)}</span>
            <span class="stack-title">${esc(post.title)}</span>
            <span class="stack-sum">${esc(post.summary)}</span>
        </a>`).join('');

    return {
        title: 'The stack',
        html: `<div class="stack">${items}</div>
               <p class="meta">Every post also lives at
               <a href="blog.html">blog.html</a> as plain HTML.</p>`
    };
}

// ── Resume ───────────────────────────────────────────────────────────

export function resumePanel(file) {
    // A button that 404s is worse than no button. When there is no file the
    // panel says so and offers the thing that does exist, rather than handing
    // the visitor a download that silently fails and reads as a broken site.
    const offer = file
        ? `<a class="btn primary" href="${esc(file)}" download>Download PDF</a>`
        : '';

    const note = file
        ? ''
        : `<p class="meta">There is no PDF up here yet. The code is the better
           record of the work anyway — most of it is a few doors along this roof.</p>`;

    return {
        title: 'Resume',
        html: `
            <p class="lede">${file ? 'Take a copy.' : 'A clipboard with nothing clipped to it.'}</p>
            <div class="actions">
                ${offer}
                <a class="btn" href="${esc(site.githubProfile)}" target="_blank" rel="noopener">GitHub ↗</a>
            </div>
            ${note}`
    };
}

// ── Guestbook ────────────────────────────────────────────────────────

/**
 * Posts to GitHub Issues rather than a backend: real persistence, public,
 * moderatable, and nothing to host or keep running.
 */
export function guestbookPanel({ repo = site.repoPath, labels = site.guestbook.labels } = {}) {
    return {
        title: 'Leave a note',
        html: `
            <p class="lede">Signs the rooftop guestbook. Opens a GitHub issue — you can
            see what you are posting before it goes anywhere.</p>
            <label class="field">
                <span>Your name</span>
                <input id="gb-name" maxlength="60" placeholder="anonymous">
            </label>
            <label class="field">
                <span>Note</span>
                <textarea id="gb-note" rows="5" maxlength="600"
                          placeholder="say hello…"></textarea>
            </label>
            <div class="actions">
                <button class="btn primary" id="gb-send">Sign it</button>
            </div>
            <p class="meta" id="gb-msg"></p>`,
        wire(bodyEl) {
            const send = bodyEl.querySelector('#gb-send');
            const msg = bodyEl.querySelector('#gb-msg');
            send.addEventListener('click', () => {
                const name = (bodyEl.querySelector('#gb-name').value || 'anonymous').trim();
                const note = bodyEl.querySelector('#gb-note').value.trim();
                if (!note) { msg.textContent = 'Write something first.'; return; }

                const url = `https://github.com/${repo}/issues/new`
                    + `?title=${encodeURIComponent(`Guestbook: ${name}`)}`
                    + `&labels=${encodeURIComponent(labels)}`
                    + `&body=${encodeURIComponent(note)}`;
                window.open(url, '_blank', 'noopener');
                msg.textContent = 'Opened GitHub — press Submit there to post it.';
            });
        }
    };
}

// ── Terminal ─────────────────────────────────────────────────────────

export function buildTerminal({ open, resumeFile = site.resumeFile }) {
    const files = {
        'about.txt':
            'khmurakami — developer & creative.\n'
            + 'Builds small engines, generative art pipelines and cozy interactive things.\n'
            + 'This rooftop is one of them.',
        'projects.txt': () => projects.map(p => `${p.year}  ${p.title}\n      ${p.summary}`).join('\n'),
        'posts.txt': () => BlogService.getAllPosts()
            .map(p => `${p.date}  ${p.title}`).join('\n') || '(no posts yet)',
        'contact.txt': `${site.githubProfile.replace(/^https?:\/\//, '')}\nOr sign the guestbook by the mailbox.`,
        ...(site.resumeFile
            ? { 'resume.pdf': `binary file — run 'resume' to download it.` }
            : {})
    };

    const actions = {
        projects: (_args, term) => {
            projects.forEach(p => term.print(`${p.id.padEnd(20)} ${p.title}`));
            term.print("run 'open <id>' to read one", 'dim');
        },
        blog: (_args, term) => {
            const posts = BlogService.getAllPosts();
            if (!posts.length) { term.print('(no posts yet)'); return; }
            posts.forEach(p => term.print(`${p.date}  ${p.title}`));
            term.print("run 'open blog' for the reading list", 'dim');
        },
        resume: () => { open('resume'); },
        contact: () => { open('guestbook'); },
        open: (args, term) => {
            const what = args[0];
            if (!what) { term.print('open: what?', 'err'); return; }
            if (what === 'blog') { open('blogstack'); return; }
            if (what === 'guestbook' || what === 'contact') { open('guestbook'); return; }
            if (what === 'resume') { open('resume'); return; }
            if (projects.some(p => p.id === what)) { open(`project:${what}`); return; }
            term.print(`open: unknown target '${what}'`, 'err');
        },
        sudo: (_a, term) => term.print('nice try.', 'dim'),
        exit: (_a, term) => term.print('press esc to step back from the terminal', 'dim')
    };

    return new Terminal({
        files,
        actions,
        motd: "rooftop terminal — type 'help'"
    });
}

// ── The workshop ─────────────────────────────────────────────────────
//
// These four panels are the payload of the interior. Each one shows a real
// mechanism behind the world you are standing in, read off the same source the
// engine reads — so none of them can drift into being a story about the site
// rather than the site itself.

/** The pegboard: the actual scripts, in the order they run. */
export function pipelinePanel() {
    const steps = [
        ['cutout.py', 'Keys the background out of a raw sheet.',
         'Tolerance 40 with erode 1. Anything looser leaks through anti-aliased edges and eats light artwork.'],
        ['split_sheet.py', 'Cuts the sheet into one file per prop.',
         'Which is why the prompt has to demand wide empty gaps — props that touch defeat the splitter.'],
        ['pixelate.py', 'Makes it actually pixel art.',
         'Asking a generator for pixel art gets you the look, not the grid: those sheets measure ~80,000 unique colours. This snaps them to a real block size and to the palette.'],
        ['stylecheck.py', 'Measures drift against the master.',
         'How the neon sign got caught at luminance 162 against a master of 29, and graded back down.'],
        ['tile.py', 'Checks and fixes seams on tiling layers.', 'Sky, skyline, floor.']
    ];

    const rows = steps.map(([name, what, why]) => `
        <li class="tool">
            <code>${esc(name)}</code>
            <span class="tool-what">${esc(what)}</span>
            <span class="tool-why">${esc(why)}</span>
        </li>`).join('');

    return {
        title: 'The tools',
        html: `
            <p class="lede">Every asset out on that roof came through these, in this order.</p>
            <ol class="tools">${rows}</ol>
            <p class="meta">The verbatim prompts, the reference image each one was given, and
            what went wrong in each raw output are all kept in
            <code>assets/city/prompts.json</code>.</p>`
    };
}

/**
 * The shelf: the real palette, fetched rather than transcribed.
 *
 * Loaded at open time from the same file the pipeline snaps to, so the jars on
 * the shelf cannot quietly stop matching the paint on the walls.
 */
export function palettePanel(src = './assets/city/palette.json') {
    return {
        // Titled from the file rather than written out. It said "Sixty-four
        // jars" and the shelf grew a dark neutral ramp — the derived palette
        // had no near-grey below luminance 90, which is why every piece of
        // paper in the world was too bright to darken.
        title: 'The paint shelf',
        html: `
            <p class="lede">All <span id="pal-count">…</span> of them. Every colour in this
            world came off this shelf, and nothing is allowed a colour that is not on it.</p>
            <div class="swatches" id="pal-swatches"><p class="meta">Opening the tin…</p></div>
            <p class="meta">Built from eight sources sampled <em>equally</em>. Concatenating raw
            pixels instead weights by area — one full-frame skyline drowned out every prop and
            returned zero warm slots in sixty-four, which is how a wooden crate came out purple.
            The bright accents at the end are placed by hand: a median cut of a scene that is
            91% shadow has no room for the few colours the eye actually goes to.</p>`,
        async wire(bodyEl) {
            const host = bodyEl.querySelector('#pal-swatches');
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error(res.status);
                const { colors } = await res.json();
                const count = bodyEl.querySelector('#pal-count');
                if (count) count.textContent = String(colors.length);
                host.innerHTML = colors.map(([r, g, b]) =>
                    `<i class="swatch" style="background:rgb(${r},${g},${b})"
                        title="${r}, ${g}, ${b}"></i>`).join('');
            } catch {
                host.innerHTML = `<p class="meta">The palette file did not load —
                    it lives at <code>${esc(src)}</code>.</p>`;
            }
        }
    };
}

/**
 * The plans: the manifest, counted live.
 *
 * The numbers are derived from `city` rather than written down, so the drawings
 * on the bench describe the roof as it is now and not as it was when this panel
 * was written.
 */
export function manifestPanel() {
    const props = city.props.length;
    const solid = city.props.filter(p => p.solid).length;
    const doors = city.props.filter(p => p.door).length;
    const bits = city.props.filter(p => p.interact).length;

    return {
        title: 'The plans',
        html: `
            <p class="lede">The roof was drawn before it was built. This is the drawing.</p>
            <dl class="spec">
                <dt>${city.width.toLocaleString()} px</dt><dd>end to end</dd>
                <dt>${city.planes.length}</dt><dd>depth planes</dd>
                <dt>${props}</dt><dd>prop slots, ${solid} of them solid</dd>
                <dt>${doors} / ${bits}</dt><dd>doors and things to poke at</dd>
                <dt>${city.platforms.length}</dt><dd>raised sections</dd>
            </dl>
            <p>Each slot says where a thing stands, how big it is and what it does — and the
            engine draws a labelled dashed box for any slot whose picture is missing. So the
            layout, the collision, the camera and every door were walkable long before there
            was any art, and the art was then made to fit the slots.</p>
            <p class="meta">Doing it the other way round — laying out whatever images happened
            to come back — is how you end up with a roof that is a pile of assets instead of
            a place.</p>`
    };
}

/**
 * The greenhouse, which is the only warm thing on the roof.
 *
 * It used to open the blog — a panel the newsstand four hundred pixels away
 * already opened. This is what a greenhouse is actually for, and it earns its
 * place in the walk by being about the roof rather than about the work.
 */
export function gardenPanel() {
    return {
        title: 'The greenhouse',
        html: `
            <p class="lede">Warm, and the only thing up here that is.</p>
            <p>Tomatoes that will not ripen, three kinds of mint that have got
            into each other, and a lemon tree somebody was told would never
            survive a winter on a roof. It has survived four.</p>
            <p>The weeds outside are the same plants without the glass. That is
            most of what a greenhouse is: a decision about which things get
            looked after.</p>
            <p class="meta">The watering can is by the planters. The hose reaches
            about as far as the second one, which is why the fourth one looks
            like that.</p>`
    };
}

/** The cot. One object, doing all of the room's characterisation. */
export function cotPanel() {
    return {
        title: 'The cot',
        html: `
            <p class="lede">Made up, slept in, not made up again.</p>
            <p>Somebody has been finishing things in here at hours that make walking back
            down the stairwell feel like a longer trip than it is.</p>`
    };
}

// ── The landing ──────────────────────────────────────────────────────

/**
 * The noticeboard: who lives here.
 *
 * Replaces the old `about` case, which reused the rooftop-world *project* body
 * as biography — it read as a project write-up because that is what it was.
 */
export function aboutPanel() {
    return {
        title: 'Notices',
        html: `
            <p class="lede">khmurakami — developer, and whatever you call someone who
            builds a website by drawing a roof first.</p>
            <p>Small engines, generative art pipelines, and cozy interactive things.
            This rooftop is one of them: a portfolio with no nav bar, where the world
            is the navigation and every building opens something.</p>
            <p>It is built out of a manifest, a sprite pipeline and about sixty hand-placed
            props. The workshop across the roof has the tools that made it, if you want
            to see how the sausage is assembled.</p>
            <div class="actions">
                <a class="btn" href="${esc(site.githubProfile)}" target="_blank" rel="noopener">GitHub ↗</a>
                <a class="btn" href="blog.html">Read the blog</a>
            </div>`
    };
}

/**
 * The stairs down.
 *
 * They go nowhere, and the panel says so. A stairwell that silently swallows
 * the interact key reads as broken; one that tells you the street is not built
 * yet reads as a world with edges, which is what it is.
 */
export function stairwellPanel() {
    return {
        title: 'Down to the street',
        html: `
            <p class="lede">Six flights, then a door onto the street.</p>
            <p>The city down there is a backdrop — it is painted on the horizon and it
            does not have insides. So the stairs stop here, honestly, rather than
            fading to black on a landing that was never built.</p>
            <p class="meta">Everything that <em>is</em> built is back up on the roof.</p>`
    };
}

/** The hooks by the door. */
export function coatsPanel() {
    return {
        title: 'The hooks',
        html: `
            <p class="lede">A coat, a bag, and one glove.</p>
            <p>The coat is still cold. Whoever it belongs to went up rather than in.</p>`
    };
}
