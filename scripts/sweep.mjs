#!/usr/bin/env node
/*
 * Sweeps a study page across settings: renders every combination and lays
 * them out as one captioned grid, or plays them as an animation. Works with
 * any page that reads its settings from the query string.
 *
 *   node scripts/sweep.mjs studio/cloud.html --vary=engine:kirie,showa --vary=seed:3,14
 *   node scripts/sweep.mjs studio/stack.html --vary=mode:painted,mist --set=seed=5
 *   node scripts/sweep.mjs studio/stack.html --vary=theta:0..6.283/24 --anim=gif   # a turntable
 *
 *   --vary=KEY:A,B,C      one setting and its values (repeatable). KEY:FROM..TO/N
 *                         gives N evenly spaced values, TO excluded (for turns).
 *   --set=K=V&K2=V2       fixed settings for every cell
 *   --size=WxH            each cell's render size (default 600x450)
 *   --cols=N              grid columns (default: number of values of the last --vary)
 *   --anim=gif|webp       an animation instead of a grid, one frame per cell
 *   --fps=N               animation speed (default 12)
 *   --name=NAME           output name (default: the page name plus the swept keys)
 *   --jobs=N              renders at once (default 3)
 *
 * Writes renders/sweeps/NAME/ (one PNG per cell) and renders/sweeps/NAME.png
 * (or .gif/.webp). Prints the output path.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d = null) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const page = args.find(a => !a.startsWith('--'));
if (!page) { console.error('usage: node scripts/sweep.mjs PAGE --vary=KEY:A,B [--vary=…] [--set=…] [--anim=gif]'); process.exit(1); }

/** "theta:0..6.283/4" -> ['theta', ['0', '1.571', '3.142', '4.712']]; "mode:a,b" -> ['mode', ['a', 'b']] */
export function parseVary(spec) {
    const i = spec.indexOf(':');
    if (i < 1) throw new Error(`--vary needs KEY:VALUES, got "${spec}"`);
    const key = spec.slice(0, i), vals = spec.slice(i + 1);
    const range = vals.match(/^(-?[\d.]+)\.\.(-?[\d.]+)\/(\d+)$/);
    if (range) {
        const [a, b, n] = [Number(range[1]), Number(range[2]), Number(range[3])];
        return [key, Array.from({ length: n }, (_, k) => String(+(a + (b - a) * k / n).toFixed(4)))];
    }
    return [key, vals.split(',')];
}

const varies = args.filter(a => a.startsWith('--vary=')).map(a => parseVary(a.slice(7)));
if (!varies.length) { console.error('nothing to sweep: add --vary=KEY:A,B'); process.exit(1); }
const fixed = opt('set', '');
const size = opt('size', '600x450');
const anim = opt('anim');
const jobs = Number(opt('jobs', 3));
const name = opt('name', [basename(page, '.html'), ...varies.map(v => v[0])].join('-'));
const python = process.env.PYTHON || 'python';
const outDir = join(root, 'renders', 'sweeps', name);
mkdirSync(outDir, { recursive: true });

// Every combination; the last --vary changes fastest, so it runs along a row.
let cells = [[]];
for (const [key, vals] of varies) cells = cells.flatMap(c => vals.map(v => [...c, [key, v]]));

function render(cell, i) {
    const query = [fixed, ...cell.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)].filter(Boolean).join('&');
    const out = join(outDir, `${String(i).padStart(3, '0')}.png`);
    return new Promise(done => {
        const p = spawn(process.execPath, [join(root, 'scripts', 'render.mjs'), size, `--page=${page}?${query}`, `--out=${out}`], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('close', code => {
            if (code !== 0) console.error(`cell ${i} (${query}) failed: ${err.trim()}`);
            done(code === 0 ? { out, caption: cell.map(([k, v]) => `${k}=${v}`).join('  ') } : null);
        });
    });
}

const results = new Array(cells.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, cells.length) }, async () => {
    while (next < cells.length) { const i = next++; results[i] = await render(cells[i], i); }
}));
const ok = results.filter(Boolean);
if (!ok.length) { console.error('no cell rendered'); process.exit(1); }

let res;
if (anim) {
    const out = join(root, 'renders', 'sweeps', `${name}.${anim}`);
    res = spawnSync(python, ['-m', 'studio.analysis', 'animate', out, ...ok.map(r => r.out), '--fps', opt('fps', '12')], { cwd: root, encoding: 'utf8' });
} else {
    const out = join(root, 'renders', 'sweeps', `${name}.png`);
    const cols = Number(opt('cols', varies[varies.length - 1][1].length));
    const title = `${page}${fixed ? '?' + fixed : ''}`;
    res = spawnSync(python, ['-m', 'studio.analysis', 'grid', out, ...ok.flatMap(r => ['--item', `${r.out}|${r.caption}`]),
        '--cols', String(cols), '--title', title, '--tile', String(Math.min(600, Number(size.split('x')[0])))], { cwd: root, encoding: 'utf8' });
}
if (res.status !== 0) { console.error(res.stderr); process.exit(1); }
process.stdout.write(res.stdout);
process.exit(ok.length === cells.length ? 0 : 1);
