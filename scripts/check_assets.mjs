/**
 * Every image a manifest references must exist AND be tracked by git.
 *
 * `npm run assets` already reports slots with no file, which covers art that
 * was never made. This covers the other case: a file that exists on the working
 * machine and is not in the repository, because it sits under a gitignored path
 * or was simply never added. That one is invisible locally — the site works
 * perfectly — and 404s for everybody else the moment it deploys.
 *
 * Usage:  node scripts/check_assets.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { manifests as MANIFESTS } from '../js/config/scenes.js';
import { site } from '../js/config/site.js';

/** Every image path any manifest asks for, with who asked. */
function referenced() {
    const out = new Map();
    const add = (src, who) => {
        if (!src) return;
        const p = src.replace(/^\.\//, '');
        if (!out.has(p)) out.set(p, new Set());
        out.get(p).add(who);
    };

    for (const [name, m] of Object.entries(MANIFESTS)) {
        for (const b of m.backdrops || []) add(b.src, `${name} backdrop`);
        for (const p of m.props) add(p.src, `${name}:${p.id}`);
        if (m.actor) add(m.actor.src, `${name} actor`);
        for (const s of Object.values(m.skySprites || {})) add(s, `${name} skySprite`);
        const cat = m.critters && m.critters.cat;
        for (const s of Object.values((cat && cat.poses) || {})) add(s, `${name} cat`);
    }

    // Not an image, and that is exactly why it went missing: the resume is
    // offered as a download from the clipboard and from the terminal, and the
    // file was never added. CI stayed green while a live button 404'd.
    //
    // `null` is a legitimate answer — it means no resume is published, and the
    // panels say so instead of offering the download. A PATH, though, is a
    // promise, and this is what holds it.
    if (site.resumeFile) add(site.resumeFile, 'site resume');

    return out;
}

const tracked = new Set(
    execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
);

const missing = [];
const untracked = [];

for (const [path, who] of referenced()) {
    const from = [...who].slice(0, 3).join(', ');
    if (!existsSync(path)) missing.push(`${path}  (${from})`);
    else if (!tracked.has(path)) untracked.push(`${path}  (${from})`);
}

if (missing.length) {
    console.error(`\n${missing.length} referenced file(s) do not exist:`);
    for (const m of missing) console.error(`  ${m}`);
}
if (untracked.length) {
    console.error(`\n${untracked.length} referenced file(s) exist but are NOT in git.`);
    console.error('They work on this machine and 404 for everyone else:');
    for (const u of untracked) console.error(`  ${u}`);
}

if (missing.length || untracked.length) process.exit(1);
console.log(`assets ok: ${referenced().size} referenced files, all present and tracked`);
