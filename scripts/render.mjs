#!/usr/bin/env node
/*
 * Renders the scene to a PNG with headless Chromium, so a painting can be
 * looked at without opening a browser.
 *
 *   node scripts/render.mjs                  # 1440x900 -> renders/room-1440x900.png
 *   node scripts/render.mjs 390x844          # a phone
 *   node scripts/render.mjs 1440x900 --live  # let it animate for a few seconds first
 *
 * Uses Playwright's cached Chromium if there is one, else Chrome or Edge.
 * Set CHROME=<path> to choose a browser yourself.
 */
import { spawn, spawnSync } from 'node:child_process';
import { serve } from './serve.mjs';
import { existsSync, mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { findBrowser } from './find-browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const size = args.find(a => /^\d+x\d+$/.test(a)) || '1440x900';
const live = args.includes('--live');
const scale = args.includes('--2x') ? 2 : 1;
const [w, h] = size.split('x').map(Number);

/** Run a program to the end, like spawnSync, without blocking. */
function run(cmd, argv, { timeout = 60000 } = {}) {
    return new Promise(done => {
        const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        const timer = setTimeout(() => child.kill(), timeout);
        child.on('close', status => { clearTimeout(timer); done({ status, stdout, stderr }); });
        child.on('error', e => { clearTimeout(timer); done({ status: 1, stdout, stderr: String(e) }); });
    });
}

const browser = findBrowser();
if (!browser) {
    console.error('No Chromium found. Set CHROME=<path to chrome>.');
    process.exit(1);
}

const outDir = join(root, 'renders');
mkdirSync(outDir, { recursive: true });
const scene = (args.find(a => a.startsWith("--scene=")) || "--scene=tatami").slice(8);
const style = (args.find(a => a.startsWith("--style=")) || "--style=painted").slice(8);
const outArg = args.find(a => a.startsWith("--out="));
const out = outArg ? resolve(outArg.slice(6)) : join(outDir, `${scene}${style !== 'painted' ? '-' + style : ''}-${size}${scale > 1 ? "@2x" : ""}.png`);
// Served over local HTTP: the room's scripts are ES modules, which don't load from file://.
const site = await serve();
const pageArg = args.find(a => a.startsWith('--page='));
const pageUrl = pageArg
    ? `${site.url}/${pageArg.slice(7).replace(/^\//, '')}`
    : `${site.url}/index.html?scene=${scene}&style=${style}` + (live ? '' : '&still');

// Headless Chrome will not make a window narrower than about 500px, so a phone
// is rendered as an exact-size frame inside a wider window, then cropped.
const MIN_W = 520;
let url = pageUrl, winW = w;
if (w < MIN_W) {
    // One harness per render: renders run in parallel (scripts/sweep.mjs).
    const harness = join(outDir, `_frame-${process.pid}.html`);
    writeFileSync(harness, `<!doctype html><body style="margin:0;background:#000"><iframe src="${pageUrl}" style="border:0;display:block;width:${w}px;height:${h}px"></iframe>`);
    url = `${site.url}/renders/_frame-${process.pid}.html`;
    winW = MIN_W;
}

// Async, so this process stays free to answer the browser's requests to the local server.
const launch = () => run(browser, [
    '--headless=new',
    // Local files only; the sandbox cannot always reach Playwright's cached Chromium on Windows.
    '--no-sandbox',
    '--allow-file-access-from-files', // studio atlas JSON + PNG generated locally
    // WebGL through SwiftShader, so the art style renders without a GPU.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    `--force-device-scale-factor=${scale}`,
    `--window-size=${winW},${h}`,
    `--virtual-time-budget=${live ? 6000 : 2500}`,
    `--screenshot=${out}`,
    url
], { encoding: 'utf8', timeout: 60000 });

// Headless Chrome occasionally exits without a screenshot on Windows; one
// retry clears it, and a real failure fails twice.
if (existsSync(out)) unlinkSync(out);
let res = await launch();
if (res.status !== 0 || !existsSync(out)) res = await launch();
await site.close();

if (res.status !== 0 || !existsSync(out)) {
    console.error(res.stderr || res.stdout || 'render failed');
    process.exit(1);
}
if (url !== pageUrl) try { unlinkSync(join(outDir, `_frame-${process.pid}.html`)); } catch { }
if (winW !== w) {
    const crop = spawnSync('python', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.crop((0, 0, int(sys.argv[2]), im.size[1])).save(sys.argv[1])', out, String(w * scale)], { encoding: 'utf8' });
    if (crop.status !== 0) console.error('could not crop (needs python with Pillow):', crop.stderr);
}
console.log(out);
