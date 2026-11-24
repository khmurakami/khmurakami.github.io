import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { findBrowser } from './find-browser.mjs';

// Shared timed headless runner. No desktop automation or package dependencies.
export async function studioBrowser(code) {
    const browser = findBrowser();
    if (!browser) throw new Error('Set CHROME to a Chromium executable');
    const dir = resolve('renders/bake'); mkdirSync(dir, { recursive: true });
    const harness = join(dir, `_browser-${process.pid}.html`);
    writeFileSync(harness, `<!doctype html><pre id="result"></pre><script>
    async function openStudio(query) {
        const frame = document.createElement('iframe'); frame.width=640; frame.height=480;
        frame.style.border='0'; frame.src='../../studio/stack.html?'+query;
        document.body.append(frame);
        await new Promise((resolve,reject) => {
            const started=Date.now(); const timer=setInterval(()=>{
                const doc=frame.contentDocument;
                if(doc?.documentElement.dataset.error){clearInterval(timer);reject(new Error(doc.documentElement.dataset.error));}
                else if(frame.contentWindow.stackStudio){clearInterval(timer);resolve();}
                else if(Date.now()-started>120000){clearInterval(timer);reject(new Error('Studio readiness timeout'));}
            },20);
        });
        return frame;
    }
    (async()=>{try{const value=await(async()=>{${code}})();await fetch('/result', {method:'POST', body:JSON.stringify({value})});}
    catch(e){await fetch('/result', {method:'POST', body:JSON.stringify({error:e.stack})});}})();</script>`);
    const started = performance.now();
    let child, timer, finish, fail;
    const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const root = resolve('.');
    const server = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/result') {
            let body = '';
            for await (const chunk of req) body += chunk;
            res.end('ok');
            try { finish(JSON.parse(body)); } catch (error) { fail(error); }
            return;
        }
        const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!path.startsWith(root + '/' ) && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
        try {
            const data = await readFile(path);
            const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : 'image/png';
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(data);
        } catch { res.writeHead(404).end(); }
    });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        child = spawn(browser, ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-gpu',
            '--force-device-scale-factor=1', `http://127.0.0.1:${server.address().port}/renders/bake/_browser-${process.pid}.html`], { windowsHide: true });
        let stderr = '';
        child.stdout.resume(); child.stderr.on('data', d => stderr += d);
        child.on('error', fail);
        child.on('close', code => fail(new Error(`Browser exited before completion (${code}): ${stderr.slice(-2000)}`)));
        timer = setTimeout(() => fail(new Error('Browser timeout after 180 seconds')), 180000);
        const result = await completed;
        if (result.error) throw new Error(result.error);
        return result.value;
    } finally {
        clearTimeout(timer);
        if (child && child.exitCode === null) {
            const closed = new Promise(resolve => child.once('close', resolve));
            child.kill(); await closed;
        }
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        console.error(`headless studio elapsed: ${(performance.now() - started).toFixed(0)} ms`);
        rmSync(harness, { force: true });
    }
}
