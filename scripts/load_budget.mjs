/**
 * Models what a visitor waits through before the world appears.
 *
 *   node scripts/load_budget.mjs
 *   node scripts/load_budget.mjs --rtt 150 --mbit 8
 *
 * A static site has no server to blame, so its load time is decided entirely by
 * the SHAPE of what it asks for: how many round trips deep the dependency graph
 * is, how many requests come out of it, and how many bytes those carry. All
 * three are knowable from the repository, and none of them need a browser.
 *
 * The critical path here is three stages, and they are strictly ordered:
 *
 *   1. the HTML
 *   2. the ES module graph — which the browser discovers LEVEL BY LEVEL,
 *      because it cannot know a module's imports until it has fetched and
 *      parsed it. A graph five deep is five round trips before any of the
 *      site's own code runs.
 *   3. the images — which cannot start until the code that names them runs.
 *
 * That third point is the one worth staring at: on a phone, most of the wait to
 * first paint is not spent transferring artwork. It is spent discovering that
 * the artwork exists.
 *
 * Text is counted at its COMPRESSED size, because that is what crosses the
 * wire — GitHub Pages gzips it, and the codebase is heavily commented, so the
 * uncompressed figure overstates the cost by a factor of three. PNGs are
 * counted raw: they are already compressed and gzip wins about 10% on them,
 * which is not worth modelling.
 *
 * The latency numbers are a model, not a measurement. The request counts, the
 * byte counts and the graph depth are exact.
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

import { fileURLToPath } from 'node:url';

import { scenes, START_SCENE } from '../js/config/scenes.js';
import { World } from '../js/engine/World.js';
import { Camera } from '../js/engine/Camera.js';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : Number(args[i + 1]);
};

// A mid-range phone on a decent mobile connection. Deliberately not a laptop on
// office wifi, which is the machine every site is accidentally optimised for.
const RTT = opt('rtt', 120);          // ms, round trip
const MBIT = opt('mbit', 10);         // megabits per second
const BYTES_PER_MS = (MBIT * 1e6 / 8) / 1000;

const ENTRY = 'js/world-main.js';
const HTML = 'index.html';

/** Every module reachable from the entry, with the depth it is discovered at. */
function moduleGraph(entry) {
    const seen = new Map();

    const walk = (file, depth) => {
        const key = normalize(file);
        const hit = seen.get(key);
        if (hit) { hit.depth = Math.min(hit.depth, depth); return; }

        let source;
        try { source = readFileSync(key, 'utf8'); } catch { return; }
        // Over the wire, not on disk.
        seen.set(key, { depth, bytes: gzipSync(readFileSync(key)).length });

        for (const m of source.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
            if (m[1].startsWith('.')) walk(join(dirname(key), m[1]), depth + 1);
        }
        for (const m of source.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
            walk(join(dirname(key), m[1]), depth + 1);
        }
    };

    walk(entry, 0);
    return seen;
}

/** Every image each scene needs, and what it weighs. */
function sceneAssets() {
    const out = [];

    for (const { id, manifest } of scenes) {
        const srcs = new Set();
        for (const p of manifest.props) if (p.src) srcs.add(p.src);
        for (const b of manifest.backdrops || []) if (b.src) srcs.add(b.src);
        if (manifest.actor) srcs.add(manifest.actor.src);
        for (const s of Object.values(manifest.skySprites || {})) srcs.add(s);
        const cat = manifest.critters && manifest.critters.cat;
        for (const s of Object.values((cat && cat.poses) || {})) srcs.add(s);

        const files = new Map();
        for (const src of srcs) {
            const f = src.replace(/^\.\//, '');
            if (existsSync(f)) files.set(f, statSync(f).size);
        }
        out.push({ id, files });
    }

    return out;
}

/** What the HTML already asks for before any script runs. */
function headRequests() {
    const html = readFileSync(HTML, 'utf8');
    const preload = [...html.matchAll(/<link[^>]+rel="(?:module)?preload"[^>]*>/g)];
    return {
        preloads: preload.length,
        modulepreloads: preload.filter(m => m[0].includes('modulepreload')).length,
        imagePreloads: preload.filter(m => m[0].includes('as="image"')).length,
        bytes: gzipSync(readFileSync(HTML)).length
    };
}

const graph = moduleGraph(ENTRY);
const assets = sceneAssets();
const head = headRequests();

const depth = Math.max(...[...graph.values()].map(v => v.depth)) + 1;
const jsBytes = [...graph.values()].reduce((n, v) => n + v.bytes, 0);

const start = assets.find(a => a.id === START_SCENE);
const others = assets.filter(a => a.id !== START_SCENE);

const startBytes = [...start.files.values()].reduce((a, b) => a + b, 0);

// Deduplicated, because an interior mostly reuses roof art and a file already
// downloaded is not downloaded again.
const extra = new Map();
for (const scene of others) {
    for (const [f, n] of scene.files) if (!start.files.has(f)) extra.set(f, n);
}
const extraBytes = [...extra.values()].reduce((a, b) => a + b, 0);

// ── The model ────────────────────────────────────────────────────────
//
// One round trip for the HTML. Then the module graph, which costs a round trip
// per LEVEL unless the head declares the modules up front — a `modulepreload`
// lets the browser fetch the whole graph at once, so the depth stops mattering.
// Then the images, which are all requested together.
const moduleTrips = head.modulepreloads > 0 ? 1 : depth;

const jsMs = moduleTrips * RTT + jsBytes / BYTES_PER_MS;

// Images named in the head are requested at parse time, so their round trip and
// some of their transfer happen WHILE the modules are still being fetched.
// Overlapping is the whole point of a preload hint.
const overlap = head.imagePreloads > 0 ? Math.min(jsMs, RTT) : 0;

// What the loader actually does, read from it rather than assumed — this is
// exactly the kind of thing that gets changed back without anyone noticing the
// load time creeping up.
const loader = readFileSync(join(ROOT_DIR, 'js/world-main.js'), 'utf8');
const streams = loader.includes('streamRemainingScenes');
const waves = loader.includes('assetSrcsByDistance');

// The starting scene's art, split the way the loader splits it: what is on
// screen in the first frame, and what is at least half a screen away.
const startManifest = scenes.find(s => s.id === START_SCENE).manifest;
const probe = new World(startManifest, new Camera({
    worldWidth: startManifest.width, viewportWidth: 1600, pixelScale: 2
}));
const split = waves
    ? probe.assetSrcsByDistance(startManifest.actor.place.x,
        World.firstFrameRadius(startManifest, 1600))
    : { near: probe.assetSrcs, far: [] };

const weigh = (list) => list.reduce((n, src) => {
    const f = src.replace(/^\.\//, '');
    return n + (existsSync(f) ? statSync(f).size : 0);
}, 0);

const nearBytes = weigh(split.near);
const farBytes = weigh(split.far);

const timeline = [
    ['HTML', RTT + head.bytes / BYTES_PER_MS],
    [`JS (${graph.size} modules, ${moduleTrips} round trip${moduleTrips > 1 ? 's' : ''})`, jsMs],
    [waves
        ? `art in the first frame (${split.near.length} files)`
        : `art for "${START_SCENE}" (${start.files.size} files)`,
        RTT - overlap + nearBytes / BYTES_PER_MS]
];

if (!streams) {
    timeline.push([`art for the other scenes (${extra.size} files)`,
        extraBytes / BYTES_PER_MS]);
}

console.log(`\nmodelled on a ${MBIT} Mbit connection at ${RTT}ms round trip\n`);

const hdr = `${'stage'.padEnd(42)}${'ms'.padStart(8)}${'cumulative'.padStart(12)}`;
console.log(hdr);
console.log('-'.repeat(hdr.length));

let running = 0;
for (const [label, ms] of timeline) {
    running += ms;
    console.log(`${label.padEnd(42)}${ms.toFixed(0).padStart(8)}${running.toFixed(0).padStart(12)}`);
}

console.log();
console.log(`module graph depth        ${depth} level${depth > 1 ? 's' : ''}`
    + (head.modulepreloads > 0
        ? `  (flattened to 1 by ${head.modulepreloads} modulepreload hints)`
        : '  <- every level is a round trip before any code runs'));
const blockingFiles = 1 + graph.size + split.near.length + (streams ? 0 : extra.size);
const blockingBytes = head.bytes + jsBytes + nearBytes + (streams ? 0 : extraBytes);
console.log(`requests before reveal    ${blockingFiles}`);
console.log(`bytes before reveal       ${(blockingBytes / 1024).toFixed(0)} KB`);
console.log();
if (streams) {
    const deferred = farBytes + extraBytes;
    const total = nearBytes + deferred;
    console.log(`after the reveal, in the background:`);
    if (farBytes) {
        console.log(`  ${split.far.length} files, ${(farBytes / 1024).toFixed(0)} KB`
            + ` of roof more than half a screen away`);
    }
    console.log(`  ${extra.size} files, ${(extraBytes / 1024).toFixed(0)} KB of interiors`);
    console.log(`  = ${(100 * deferred / total).toFixed(0)}% of the artwork, off the critical path`);
} else {
    console.log(`of which, art for rooms nobody has walked into yet:`);
    console.log(`  ${extra.size} files, ${(extraBytes / 1024).toFixed(0)} KB`
        + `  (${(100 * extraBytes / (startBytes + extraBytes)).toFixed(0)}% of the artwork)`
        + `  <- blocking the reveal`);
}
console.log();
console.log(`head hints                ${head.modulepreloads} modulepreload, `
    + `${head.imagePreloads} image preload`);
console.log(`text is counted gzipped, images raw — which is how they are served.`);
console.log();
