/**
 * Regenerates `js/config/posts.js` from the front matter of every `posts/*.md`.
 *
 * The index used to be maintained by hand next to the files it described, with
 * a comment asking for the two to be kept in step. They drifted the moment
 * anything published, because the in-browser editor rewrote the Markdown and
 * left the index alone.
 *
 * Usage:
 *   node scripts/build_posts.mjs           write the file
 *   node scripts/build_posts.mjs --check   exit 1 if the committed file differs
 *
 * `--check` is what CI runs. A push IS a deploy here, so a stale index is a
 * live site showing the wrong titles, and this is the cheapest place to catch
 * it.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostDocument } from '../js/engine/PostDocument.js';
import { entryFor, renderIndex } from '../js/engine/PostIndex.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const POSTS_DIR = join(ROOT, 'posts');
const INDEX_FILE = join(ROOT, 'js', 'config', 'posts.js');

const check = process.argv.includes('--check');

const files = readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).sort();

const entries = [];
const problems = [];

for (const file of files) {
    const id = basename(file, '.md');
    const { data } = PostDocument.parse(readFileSync(join(POSTS_DIR, file), 'utf8'));

    // A post with no front matter still renders, but it lands in the index
    // under a made-up category with no date and sorts to the bottom, which
    // looks like a bug rather than like a missing field.
    for (const key of ['title', 'date', 'category', 'summary']) {
        if (!data[key]) problems.push(`posts/${file}: front matter has no \`${key}\``);
    }

    entries.push(entryFor(id, data));
}

if (problems.length) {
    console.error(`\n${problems.length} post(s) with incomplete front matter:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}

const rendered = renderIndex(entries);

// Compared with line endings normalised. Git checks this file out with CRLF on
// a Windows working copy and LF on CI, and `--check` failing because of the
// platform rather than because of the content would train everyone to ignore
// it.
const same = (a, b) => a != null && a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

const current = (() => {
    try { return readFileSync(INDEX_FILE, 'utf8'); } catch { return null; }
})();

if (check) {
    if (same(current, rendered)) {
        console.log(`posts index ok: ${entries.length} post(s), index matches the Markdown`);
        process.exit(0);
    }
    console.error('\njs/config/posts.js does not match the front matter of posts/*.md.');
    console.error('Run `npm run posts` and commit the result.\n');
    process.exit(1);
}

if (same(current, rendered)) {
    console.log(`posts index unchanged: ${entries.length} post(s)`);
} else {
    writeFileSync(INDEX_FILE, rendered);
    console.log(`posts index written: ${entries.length} post(s)`);
}
