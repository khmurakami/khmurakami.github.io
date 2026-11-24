#!/usr/bin/env node
/*
 * Serves the site from the repository root, uncached, for looking at the room
 * locally (on this machine, or a phone on the same network with --host).
 * The room's scripts are ES modules, which browsers won't load from file://,
 * so open it through this. No packages.
 *
 *   node scripts/serve.mjs [port] [--host]     # default 4173
 *
 * Other scripts start it in-process: `const { url, close } = await serve();`
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

/** Start serving; resolves to { url, port, close }. Port 0 picks a free one. */
export function serve({ port = 0, host = '127.0.0.1' } = {}) {
    const server = createServer(async (req, res) => {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(join(root, path));
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(body);
        } catch {
            res.writeHead(404); res.end();
        }
    });
    return new Promise(done => server.listen(port, host, () => {
        const p = server.address().port;
        done({ url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${p}`, port: p, close: () => new Promise(r => server.close(r)) });
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const host = args.includes('--host') ? '0.0.0.0' : '127.0.0.1';
    const { port } = await serve({ port: Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 4173), host });
    console.log(`serving ${root} at http://${host === '0.0.0.0' ? '<this machine>' : '127.0.0.1'}:${port}`);
}
