#!/usr/bin/env node
/*
 * Serves the site from the repository root, uncached, for looking at the room
 * locally (on this machine, or a phone on the same network with --host). No packages.
 *
 *   node scripts/serve.mjs [port] [--host]     # default 4173; --host for a phone on the same network
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), host = args.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const port = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 4173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404); res.end();
    }
}).listen(port, host, () => console.log(`serving ${root} at http://${host === '0.0.0.0' ? '<this machine>' : host}:${port}`));
