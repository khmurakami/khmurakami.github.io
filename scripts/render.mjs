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
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const size = args.find(a => /^\d+x\d+$/.test(a)) || '1440x900';
const live = args.includes('--live');
const scale = args.includes('--2x') ? 2 : 1;
const [w, h] = size.split('x').map(Number);

function findBrowser() {
    if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
    const candidates = [];
    const pwDirs = [
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
        join(os.homedir(), '.cache', 'ms-playwright'),
        join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
        '/opt/pw-browsers'
    ].filter(Boolean);
    for (const dir of pwDirs) {
        if (!existsSync(dir)) continue;
        for (const name of readdirSync(dir).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
            candidates.push(
                join(dir, name, 'chrome-win64', 'chrome.exe'),
                join(dir, name, 'chrome-win', 'chrome.exe'),
                join(dir, name, 'chrome-linux', 'chrome'),
                join(dir, name, 'chrome-linux64', 'chrome'),
                join(dir, name, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
            );
        }
    }
    candidates.push(
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/chromium', '/usr/bin/google-chrome'
    );
    return candidates.find(p => existsSync(p));
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
const pageArg = args.find(a => a.startsWith('--page='));
const pageUrl = pageArg
    ? pathToFileURL(join(root, pageArg.slice(7).split('?')[0])).href + (pageArg.includes('?') ? '?' + pageArg.split('?')[1] : '')
    : pathToFileURL(join(root, 'index.html')).href + `?scene=${scene}&style=${style}` + (live ? '' : '&still');

// Headless Chrome will not make a window narrower than about 500px, so a phone
// is rendered as an exact-size frame inside a wider window, then cropped.
const MIN_W = 520;
let url = pageUrl, winW = w;
if (w < MIN_W) {
    const harness = join(outDir, '_frame.html');
    writeFileSync(harness, `<!doctype html><body style="margin:0;background:#000"><iframe src="${pageUrl}" style="border:0;display:block;width:${w}px;height:${h}px"></iframe>`);
    url = pathToFileURL(harness).href;
    winW = MIN_W;
}

const launch = () => spawnSync(browser, [
    '--headless=new',
    // Local files only; the sandbox cannot always reach Playwright's cached Chromium on Windows.
    '--no-sandbox',
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
let res = launch();
if (res.status !== 0 || !existsSync(out)) res = launch();

if (res.status !== 0 || !existsSync(out)) {
    console.error(res.stderr || res.stdout || 'render failed');
    process.exit(1);
}
if (winW !== w) {
    const crop = spawnSync('python', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.crop((0, 0, int(sys.argv[2]), im.size[1])).save(sys.argv[1])', out, String(w * scale)], { encoding: 'utf8' });
    if (crop.status !== 0) console.error('could not crop (needs python with Pillow):', crop.stderr);
}
console.log(out);
