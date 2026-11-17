#!/usr/bin/env node
/*
 * Runs a study: renders its page, then scores the render against each of its
 * targets. Studies live in studio/studies.json; see studio/README.md.
 *
 *   node scripts/study.mjs cloud
 *   node scripts/study.mjs styles                       # every variant, plus a contact sheet
 *   node scripts/study.mjs styles --only=kirie,ink      # some of them
 *   node scripts/study.mjs cloud --query=engine=lit&seed=3
 *   node scripts/study.mjs cloud --label=try-ao         # keeps this run's files apart
 *   node scripts/study.mjs --list
 *
 * A study may define "variants": named queries for the same page. Each is
 * rendered and scored on its own, then all are laid out together in
 * renders/studies/<study>[-label]-contact.png.
 *
 * Writes renders/studies/<study>[-variant][-label].png, a report sheet per
 * target (…-<target>.png) and the scores (…-<target>.json). Scoring is
 * advisory; --strict makes the exit code fail when anything is out of
 * tolerance.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const studies = JSON.parse(readFileSync(join(root, 'studio', 'studies.json'), 'utf8'));

if (args.includes('--list') || !args[0] || args[0].startsWith('--')) {
    for (const [name, s] of Object.entries(studies)) console.log(`  ${name.padEnd(12)} ${s.about || ''}`);
    process.exit(args.includes('--list') ? 0 : 1);
}

const name = args[0];
const study = studies[name];
if (!study) { console.error(`no study "${name}". Try --list.`); process.exit(1); }

const size = opt('size') ?? study.size ?? '1200x900';
const label = opt('label');
const sky = opt('sky') ?? study.sky ?? 'border';
const python = process.env.PYTHON || 'python';
const dir = join(root, 'renders', 'studies');
mkdirSync(dir, { recursive: true });

// Variants: named queries. A study without them is one run with its own query.
let variants = study.variants ? Object.entries(study.variants) : [[null, study.query ?? '']];
if (opt('only')) variants = variants.filter(([v]) => opt('only').split(',').includes(v));
if (opt('query')) variants = [[null, opt('query')]];

let failed = false;
const contact = [];
for (const [variant, query] of variants) {
    const base = join(dir, [name, variant, label].filter(Boolean).join('-'));
    const page = `--page=${study.page}${query ? '?' + query : ''}`;
    const render = spawnSync(process.execPath, [join(root, 'scripts', 'render.mjs'), size, page, `--out=${base}.png`], { encoding: 'utf8' });
    if (render.status !== 0) { console.error(render.stderr || render.stdout); failed = true; continue; }
    console.log(`\n${variant || name}: rendered ${base}.png  (${study.page}${query ? '?' + query : ''})`);

    // A study page that can render its own silhouette (?mask=1) is measured
    // against it, rather than against a guess at where its sky ends.
    let maskArgs = [];
    if (study.mask) {
        const mpage = `--page=${study.page}?${[query, 'mask=1'].filter(Boolean).join('&')}`;
        const m = spawnSync(process.execPath, [join(root, 'scripts', 'render.mjs'), size, mpage, `--out=${base}-mask.png`], { encoding: 'utf8' });
        if (m.status === 0) maskArgs = ['--mask', `${base}-mask.png`];
        else console.error(`could not render the mask: ${m.stderr}`);
    }

    for (const target of study.targets || []) {
        const res = spawnSync(python, ['-m', 'studio.analysis', 'check', `${base}.png`, '--target', target, '--sky', sky, ...maskArgs,
            '--sheet', `${base}-${target}.png`, '--json', `${base}-${target}.json`, ...(args.includes('--strict') ? ['--strict'] : [])],
            { cwd: root, encoding: 'utf8' });
        process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
        if (res.status !== 0) failed = true;
        contact.push(`${base}.png|${variant || name}|${base}-${target}.json`);
    }
}

if (variants.length > 1 && contact.length) {
    const out = join(dir, [name, label, 'contact'].filter(Boolean).join('-') + '.png');
    const res = spawnSync(python, ['-m', 'studio.analysis', 'contact', out, ...contact.flatMap(c => ['--item', c]),
        '--title', `${name}: ${study.about || ''}`.slice(0, 120)], { cwd: root, encoding: 'utf8' });
    if (res.status !== 0) { console.error(res.stderr); failed = true; } else console.log(`\ncontact sheet: ${out}`);
}
process.exit(failed ? 1 : 0);
