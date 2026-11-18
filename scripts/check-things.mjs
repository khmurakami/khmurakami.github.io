#!/usr/bin/env node
/*
 * Taps every thing in the pixel room in headless Chrome and checks that each
 * one answers: hover shows its label, a click changes its state.
 *
 *   node scripts/check-things.mjs            # desktop, 1440x900
 *   node scripts/check-things.mjs 390x844    # a phone (touch taps)
 *
 * Talks to Chrome over the DevTools protocol with Node's own WebSocket; no packages.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const size = process.argv.find(a => /^\d+x\d+$/.test(a)) || '1440x900';
const [W, H] = size.split('x').map(Number);
const phone = W < 768;

function findBrowser() {
    if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
    const out = [];
    for (const dir of [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(os.homedir(), '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean)) {
        if (!existsSync(dir)) continue;
        for (const n of readdirSync(dir).filter(n => /^chromium-\d+$/.test(n)).sort().reverse())
            out.push(join(dir, n, 'chrome-win64', 'chrome.exe'), join(dir, n, 'chrome-win', 'chrome.exe'), join(dir, n, 'chrome-linux', 'chrome'));
    }
    out.push('C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome');
    return out.find(p => existsSync(p));
}

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(findBrowser(), ['--headless=new', '--no-sandbox', '--allow-file-access-from-files', '--no-first-run',
    `--user-data-dir=${mkdtempSync(join(os.tmpdir(), 'things-'))}`, `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let targets = null;
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJS = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: pathToFileURL(join(root, (process.argv.find(a => a.startsWith('--page=')) || '--page=studio/pixel.html').slice(7))).href });
for (let i = 0; i < 40; i++) { await sleep(250); if ((await evalJS('window.TatamiPixel && TatamiPixel.things().length')) > 0) break; }
await sleep(600);

// The laptop opens a new tab, which takes the focus: tap it last.
const things = (await evalJS('TatamiPixel.things()')).sort((a, b) => (a.id === 'laptop') - (b.id === 'laptop'));
const state = () => evalJS('TatamiPixel.state()');
const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page').length;
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
async function tap(x, y) {
    if (phone) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
        await mouse('mouseMoved', x, y); await sleep(80);
        await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y);
    }
    await sleep(250);
}

const expect = {
    melon: (a, b) => b.bites === (a.bites + 1) % 4,
    cat: (a, b) => b.catAwake && !a.catAwake,
    radio: (a, b) => b.sound !== a.sound,
    pig: (a, b) => b.puffing,
    chime: (a, b) => b.rung && !a.rung,
    blind: (a, b) => b.blind !== a.blind
};
let failed = 0;
console.log(`${size}: ${things.length} things`);
for (const t of things) {
    if (!phone) { await mouse('mouseMoved', t.x, t.y); await sleep(120); }
    const hover = phone ? null : await evalJS('TatamiPixel.state().hover');
    const label = phone ? '' : await evalJS("(document.getElementById('thing-tip') || {}).textContent || ''");
    const before = await state(), tabsBefore = await tabs();
    await tap(t.x, t.y);
    const after = await state();
    const ok = t.id === 'laptop' ? (await tabs()) > tabsBefore : expect[t.id](before, after);
    const hoverOk = phone || hover === t.id;
    if (!ok || !hoverOk) failed++;
    console.log(`${ok && hoverOk ? 'ok  ' : 'FAIL'} ${t.id.padEnd(7)} at ${Math.round(t.x)},${Math.round(t.y)}${phone ? '' : `  hover=${hover} "${label}"`}`);
}
// --shot=path: a screenshot after every tap, the room in its tapped state.
const shot = process.argv.find(a => a.startsWith('--shot='));
if (shot) {
    await send('Page.bringToFront');
    await mouse('mouseMoved', things.find(t => t.id === 'laptop').x, things.find(t => t.id === 'laptop').y);
    await sleep(1200);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(resolve(shot.slice(7)), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
}
ws.close(); chrome.kill();
process.exit(failed ? 1 : 0);
