#!/usr/bin/env node
/*
 * Taps every thing in the pixel room in headless Chrome and checks that each
 * one answers: hover shows its label, a click changes its state.
 *
 *   node scripts/check-things.mjs            # desktop, 1440x900
 *   node scripts/check-things.mjs 390x844    # a phone (touch taps)
 *   node scripts/check-things.mjs "--query=hour=21&date=2026-07-05"   # pin the room's clock
 *
 * Talks to Chrome over the DevTools protocol with Node's own WebSocket; no packages.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const size = process.argv.find(a => /^\d+x\d+$/.test(a)) || '1440x900';
const [W, H] = size.split('x').map(Number);
const phone = Math.min(W, H) < 768;

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

// The repo, served over HTTP as Pages would.
const extra = [process.argv.includes('--gh') ? '' : 'gh=off', (process.argv.find(a => a.startsWith('--query=')) || '--query=').slice(8)].filter(Boolean).join('&');
const { createServer } = await import('node:http');
const { readFile } = await import('node:fs/promises');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon' };
const site = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try { const body = await readFile(join(root, path)); res.writeHead(200, { 'Content-Type': TYPES[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
}).listen(0);
await new Promise(r => site.once('listening', r));
const SITE = `http://localhost:${site.address().port}`;

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

// --debug: print the page's uncaught errors.
if (process.argv.includes('--debug')) {
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') console.log('page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
    await send('Runtime.enable');
}
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
const pageUrl = `${SITE}/${(process.argv.find(a => a.startsWith('--page=')) || '--page=studio/pixel.html').slice(7)}${extra ? '?' + extra : ''}`;
await send('Page.navigate', { url: pageUrl });
for (let i = 0; i < 40; i++) { await sleep(250); if ((await evalJS('window.TatamiPixel && TatamiPixel.things().length')) > 0) break; }
// The page opens like eyes opening: shut as it loads, then open, before any tapping.
const shutAtLoad = await evalJS('TatamiPixel.state().napping');
// --frames=path: a strip of screenshots of the waking, then stop.
const frames = process.argv.find(a => a.startsWith('--frames='));
if (frames) {
    const { writeFileSync } = await import('node:fs');
    for (let i = 0; i < 8; i++) { writeFileSync(resolve(frames.slice(9).replace('.png', `-${i}.png`)), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); await sleep(140); }
    ws.close(); chrome.kill(); site.close(); process.exit(0);
}
if (process.argv.includes('--waking')) await sleep(200);
let opened = false;
for (let i = 0; i < 25 && !opened; i++) { await sleep(200); opened = !(await evalJS('TatamiPixel.state().napping')); }
let failedWake = !(shutAtLoad && opened);
if (!process.argv.some(a => a.startsWith('--look='))) console.log(`${failedWake ? 'FAIL' : 'ok  '} wake    the eyes open as the page loads`);

// --look=path: just a screenshot of the room as it loads, no taps.
const look = process.argv.find(a => a.startsWith('--look='));
if (look) {
    await sleep(400);
    // --type=cmd1;cmd2: open the laptop's terminal and type these first.
    const typed = process.argv.find(a => a.startsWith('--type='));
    // --nap: lie down first, and take the picture with the eyes closing.
    if (process.argv.includes('--nap')) { await evalJS('TatamiPixel.nap()'); await sleep(700); }
    if (process.argv.includes('--usagi')) { await evalJS('TatamiPixel.usagi()'); await sleep(2600); }
    if (typed) { await evalJS('Terminal.open()'); for (const c of typed.slice(7).split(';')) { await evalJS(`Terminal.run(${JSON.stringify(c)})`); await sleep(900); } }
    // --film=id,frames,ms,size: touch a thing and save a strip of close-ups of what it does.
    const film = process.argv.find(a => a.startsWith('--film='));
    if (film) {
        const [fid, n = 10, ms = 80, size = 120] = film.slice(7).split(',');
        const spot = (await evalJS('TatamiPixel.things()')).find(u => u.id === fid);
        const { writeFileSync } = await import('node:fs');
        const box = { x: Math.max(0, spot.x - size / 2), y: Math.max(0, spot.y - size * 0.6), width: +size, height: +size, scale: 1 };
        await evalJS(`TatamiPixel.touch(${JSON.stringify(fid)})`);
        for (let i = 0; i < +n; i++) {
            writeFileSync(resolve(look.slice(7).replace('.png', `-${i}.png`)), Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: box })).result.data, 'base64'));
            await sleep(+ms);
        }
        ws.close(); chrome.kill(); site.close(); process.exit(0);
    }
    const ev = process.argv.find(a => a.startsWith('--eval='));
    if (ev) console.log(JSON.stringify(await evalJS(ev.slice(7))));
    // --map: tint every spot by what a finger there would tap.
    if (process.argv.includes('--map')) await evalJS(`(() => {
        const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight;
        Object.assign(c.style, { position: 'fixed', inset: 0, zIndex: 9, pointerEvents: 'none' });
        const g = c.getContext('2d'), col = {}, hue = id => col[id] ?? (col[id] = (Object.keys(col).length * 67) % 360);
        for (let y = 0; y < innerHeight; y += 4) for (let x = 0; x < innerWidth; x += 4) {
            const id = TatamiPixel.pickAt(x, y);
            if (id) { g.fillStyle = 'hsla(' + hue(id) + ', 90%, 55%, 0.45)'; g.fillRect(x, y, 4, 4); }
        }
        g.font = 'bold 11px sans-serif'; g.fillStyle = '#fff';
        for (const t of TatamiPixel.things()) g.fillText(t.id, t.x - 12, t.y);
        Object.entries(col).forEach(([id, h], i) => { g.fillStyle = 'hsl(' + h + ', 90%, 55%)'; g.fillRect(8, 8 + i * 14, 10, 10); g.fillStyle = '#fff'; g.fillText(id, 22, 17 + i * 14); });
        document.body.appendChild(c);
    })()`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(resolve(look.slice(7)), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
    ws.close(); chrome.kill(); site.close(); process.exit(0);
}
if (process.argv.includes("--debug")) console.log(await evalJS("(()=>{try{TatamiPixel.things();return 'fine'}catch(e){return e.stack}})()"));
const things = (await evalJS('TatamiPixel.things()')).filter((t, i, all) => all.findIndex(u => u.id === t.id) === i);
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
    radio: (a, b) => b.station !== a.station,
    moon: (a, b) => b.moonTaps > a.moonTaps,
    paddy: (a, b) => b.ripples > a.ripples,
    pig: (a, b) => b.puffing,
    chime: (a, b) => b.rung && !a.rung,
    blind: (a, b) => b.blind !== a.blind,
    bamboo: (a, b) => b.rustle,
    lantern: (a, b) => b.lantern !== a.lantern,
    futon: (a, b) => b.napping,
    laptop: (a, b) => b.terminal
};
// The nap takes a few seconds and moves the clock on: wait it out, and check it did.
const after = { laptop: () => evalJS('Terminal.close()'), futon: async () => { await sleep(4300); const s = await state(); if (s.napping) { failed++; console.log('FAIL nap     never woke'); } } };
let failed = failedWake ? 1 : 0;
// On a phone: a drag looks around, and holding still afterwards (with the phone
// reporting its tilt) keeps that look instead of snapping back.
if (phone) {
    const tilt = (beta, gamma) => evalJS(`dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: ${beta}, gamma: ${gamma} }))`);
    for (let i = 0; i < 5; i++) { await tilt(50, 5); await sleep(30); }
    const before = (await state()).look;
    const x0 = Math.round(W * 0.5), y0 = Math.round(H * 0.3);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 8; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 12, y: y0 }] }); await sleep(16); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const dragged = (await state()).look;
    for (let i = 0; i < 10; i++) { await tilt(50, 5); await sleep(30); }
    const held = (await state()).look;
    const ok = dragged[0] > before[0] + 0.3 && Math.abs(held[0] - dragged[0]) < 0.05;
    console.log(`${ok ? 'ok  ' : 'FAIL'} drag    looks around, and stays there with tilt on (${before[0]} → ${dragged[0]} → ${held[0]})`);
    if (!ok) failed++;
    await evalJS('true'); await sleep(300);
}
// At night, five taps on the moon bring the rabbit (before the nap below turns night to morning).
{
    const moon = things.find(t => t.id === 'moon');
    if (moon) {
        if (!phone) { await mouse('mouseMoved', moon.x, moon.y); await sleep(700); Object.assign(moon, (await evalJS('TatamiPixel.things()')).find(u => u.id === 'moon')); }
        for (let i = 0; i < 5; i++) await tap(moon.x, moon.y);
        const ok = (await state()).usagi;
        console.log(`${ok ? 'ok  ' : 'FAIL'} usagi   five taps on the moon bring the rabbit`);
        if (!ok) failed++;
        await sleep(8000);   // let it go back
    }
}
console.log(`${size}: ${things.length} things`);
for (const t of things) {
    // Looking follows the pointer, and near things shift as it settles: point, let it settle, find the thing again.
    const where = async () => { const u = (await evalJS('TatamiPixel.things()')).find(u => u.id === t.id); if (u) Object.assign(t, u); };
    if (!phone) { await mouse('mouseMoved', t.x, t.y); await sleep(700); await where(); await mouse('mouseMoved', t.x, t.y); await sleep(120); }
    else await where();
    const hover = phone ? null : await evalJS('TatamiPixel.state().hover');
    const label = phone ? '' : await evalJS("(document.getElementById('thing-tip') || {}).textContent || ''");
    const before = await state(), tabsBefore = await tabs();
    await tap(t.x, t.y);
    // The laptop's screen wakes before the terminal opens.
    if (t.id === 'laptop') await sleep(400);
    const after_ = await state();
    const ok = expect[t.id](before, after_);
    if (after[t.id]) await after[t.id]();
    const hoverOk = phone || hover === t.id;
    if (!ok || !hoverOk) failed++;
    if (!ok && process.argv.includes('--why')) console.log('   before', JSON.stringify(before), '/ after', JSON.stringify(after_));
    console.log(`${ok && hoverOk ? 'ok  ' : 'FAIL'} ${t.id.padEnd(7)} at ${Math.round(t.x)},${Math.round(t.y)}${phone ? '' : `  hover=${hover} "${label}"`}`);
}
// Sound: turn it on, play every voice of every season at every hour, and every station, and hear no errors.
if (process.argv.includes('--sound')) {
    let errors = 0;
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') { errors++; console.log('page error:', m.params.exceptionDetails.exception?.description); } });
    await send('Runtime.enable');
    if (!(await evalJS('Stage.Sound.on'))) await evalJS("document.getElementById('sound').click()");
    for (const season of ['spring', 'summer', 'autumn', 'winter']) for (const hour of [5.5, 12, 16.5, 18.5, 23]) {
        await evalJS(`(() => { const s = Stage.Sound.scape; s.season = '${season}'; s.hour = ${hour}; for (const k in s.next) s.next[k] = 0; })()`);
        await sleep(250);
    }
    const heard = [];
    for (let i = 0; i < 4; i++) { heard.push(await evalJS('Stage.Sound.scape.tune()')); await sleep(1200); }
    for (let i = 0; i < 3; i++) { await evalJS('Stage.Sound.ring(1)'); await evalJS('Stage.Sound.scape.thump()'); }
    const ok = !errors && heard.join(',') === ['lo-fi', 'baseball', 'festival', ''].join(',') || (!errors && heard.join(',') === ['baseball', 'festival', '', 'lo-fi'].join(','));
    console.log(`${ok ? 'ok  ' : 'FAIL'} sound   every voice and station plays (${heard.map(h => h || 'off').join(' → ')}, ${errors} errors)`);
    if (!ok) failed++;
}
// The terminal answers: help lists commands, ls the files, cat reads one, a typo says so, and nap naps.
{
    await evalJS('Terminal.open()');
    const said = async cmd => { await evalJS(`Terminal.run(${JSON.stringify(cmd)})`); await sleep(150); return evalJS("document.querySelector('#term .log').textContent"); };
    const checks = [['help', /projects\s+what I have made/], ['ls', /about\.txt\s+links\.txt\s+projects\//], ['cat about.txt', /profile is at/], ['date', /(morning|afternoon|night|dawn|midday|golden hour|sunset|blue hour)/], ['frobnicate', /frobnicate: command not found/]];
    for (const [cmd, want] of checks) {
        const ok = want.test(await said(cmd));
        console.log(`${ok ? 'ok  ' : 'FAIL'} $ ${cmd}`);
        if (!ok) failed++;
    }
    await said('lantern');
    const lit = (await state()).lantern;
    await said('lantern');
    const ok = (await state()).lantern !== lit;
    console.log(`${ok ? 'ok  ' : 'FAIL'} $ lantern toggles it`);
    if (!ok) failed++;
    await evalJS('Terminal.close()');
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
site.close();
process.exit(failed ? 1 : 0);
