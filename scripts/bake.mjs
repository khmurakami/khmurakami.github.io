#!/usr/bin/env node
// node scripts/bake.mjs --set="style=afternoon&seed=5&slices=160&res=1" --out=renders/bake/cloud
// Then studio/stack.html?baked=../renders/bake/cloud.json (serve repository over HTTP).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { studioBrowser } from './studio-browser.mjs';
const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const query = new URLSearchParams(arg('set', ''));
query.set('mode', 'layers'); query.set('still', ''); query.delete('baked');
const out = resolve(arg('out', 'renders/bake/cloud')).replace(/\.json$/, '');
const started = performance.now();
try {
    const result = await studioBrowser(`
        const frame=await openStudio(${JSON.stringify(query.toString())});
        const w=frame.contentWindow, s=w.stackStudio;
        return w.BakedAtlas.pack(s.view.layers, {query:s.query, bounds:s.pile.bounds});
    `);
    result.manifest.image = basename(out) + '.png';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out + '.png', Buffer.from(result.png.split(',')[1], 'base64'));
    writeFileSync(out + '.json', JSON.stringify(result.manifest, null, 2) + '\n');
    console.log(out + '.json');
} finally { console.error(`bake elapsed: ${(performance.now() - started).toFixed(0)} ms`); }
