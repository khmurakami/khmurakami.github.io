#!/usr/bin/env node
/*
 * Stamps one version onto every script address, so phones fetch the new code
 * right after a deploy instead of using what they cached. Run it before
 * pushing script changes.
 *
 *   npm run stamp              # version = now, e.g. 20261124-1015
 *   npm run stamp -- 42        # a version of your choosing
 *
 * It rewrites `?v=…` in the HTML pages' scripts and stylesheets, and in the
 * module imports of the room and the playground.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date(), pad = n => String(n).padStart(2, '0');
const version = process.argv[2] || `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
if (!/^[\w.-]+$/.test(version)) throw new Error(`not a version: ${version}`);

const inDir = d => readdirSync(join(root, d)).filter(f => f.endsWith('.js')).map(f => join(d, f));
const files = ['index.html', join('room', 'index.html'), join('studio', 'pixel.html'), ...inDir(join('js', 'scenes', 'tatami-pixel')), ...inDir(join('js', 'playground'))];
let changed = 0;
for (const f of files) {
    const path = join(root, f), before = readFileSync(path, 'utf8');
    const after = before
        .replace(/(<script\b[^>]*\bsrc="[^"?]+\.js)(?:\?v=[\w.-]*)?"/g, `$1?v=${version}"`)
        .replace(/(<link\b[^>]*\bhref="[^"?:]+\.css)(?:\?v=[\w.-]*)?"/g, `$1?v=${version}"`)
        .replace(/(from\s+'\.\/[\w-]+\.js)(?:\?v=[\w.-]*)?'/g, `$1?v=${version}'`)
        .replace(/(import\s+'\.\/[\w-]+\.js)(?:\?v=[\w.-]*)?'/g, `$1?v=${version}'`);
    if (after !== before) { writeFileSync(path, after); changed++; }
}
console.log(`stamped ${version} on ${changed} files`);
