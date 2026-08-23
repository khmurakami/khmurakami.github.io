/**
 * Prints the asset spec for the world, derived from the manifest.
 *
 * The manifest is the contract: it already states every slot's plane, size and
 * purpose. This turns that into a checklist of images still to make, with the
 * pixel dimensions each one should be generated at, so art is produced to fit
 * the world rather than the world being bent to fit whatever art arrived.
 *
 * Usage:  node scripts/asset_spec.mjs [--all]
 */
import { existsSync, statSync } from 'node:fs';
import { city } from '../js/config/city.js';
import { workshop } from '../js/config/workshop.js';
import { stairwell } from '../js/config/stairwell.js';

/**
 * Every scene, not just the roof.
 *
 * An interior is declared with the same contract, so it has the same unfilled
 * slots — and a spec that only reads the roof reports "all slots filled" while
 * a whole room stands in dashed boxes.
 */
const SCENES = [
    { id: 'roof', manifest: city },
    { id: 'workshop', manifest: workshop },
    { id: 'stairwell', manifest: stairwell }
];

const showAll = process.argv.includes('--all');

// Generate at 2x the reference size so downscaling stays crisp on high-DPI.
const SUPERSAMPLE = 2;

const rel = (src) => src.replace(/^\.\//, '');
const present = (src) => existsSync(rel(src)) && statSync(rel(src)).size > 0;

const rows = [];

for (const { id: sceneId, manifest } of SCENES) {
    const planeOf = (id) => manifest.planes.find(p => p.id === id);

    for (const b of manifest.backdrops || []) {
        rows.push({
            scene: sceneId,
            kind: 'backdrop',
            id: `${b.plane}_backdrop`,
            src: b.src,
            plane: b.plane,
            note: b.repeat ? 'must tile seamlessly left-right' : 'single, no tiling',
            size: b.heightFrac
                ? `height ${Math.round(manifest.referenceHeight * b.heightFrac * SUPERSAMPLE)}px`
                : `height ${manifest.referenceHeight * SUPERSAMPLE}px`
        });
    }

    for (const p of manifest.props) {
        rows.push({
            scene: sceneId,
            kind: p.door ? 'DOOR prop' : 'prop',
            id: p.id,
            src: p.src,
            plane: p.plane,
            note: [
                p.door ? `entrance -> ${p.door.action}` : null,
                p.repeat ? 'must tile seamlessly left-right' : null,
                planeOf(p.plane)?.darken ? 'foreground: near-silhouette' : null
            ].filter(Boolean).join(', ') || '-',
            size: `height ${Math.round(p.height * SUPERSAMPLE)}px, transparent background`
        });
    }
}

const missing = rows.filter(r => !present(r.src));
const shown = showAll ? rows : missing;

const seen = new Set();
const unique = shown.filter(r => (seen.has(r.src) ? false : seen.add(r.src)));

console.log();
for (const { id, manifest } of SCENES) {
    const unmade = manifest.props.filter(p => !present(p.src)).length;
    console.log(`${id.padEnd(10)} ${String(manifest.width).padStart(4)}px wide, `
        + `${manifest.planes.length} planes, ${manifest.props.length} prop slots `
        + `(${manifest.props.filter(p => p.door).length} doors)`
        + (unmade ? `  — ${unmade} unmade` : ''));
}
console.log(`Assets: ${rows.length - missing.length}/${rows.length} present, `
    + `${unique.length} still to make\n`);

if (!unique.length) {
    console.log('  All slots filled.\n');
} else {
    const w = Math.max(...unique.map(r => r.id.length), 4);
    for (const r of unique) {
        console.log(`  [${r.kind}] ${r.id.padEnd(w)}  ${r.scene}/${r.plane.padEnd(8)} ${r.size}`);
        console.log(`  ${' '.repeat(r.kind.length + 3)}${' '.repeat(w)}  ${r.src}`);
        if (r.note !== '-') console.log(`  ${' '.repeat(r.kind.length + 3)}${' '.repeat(w)}  ${r.note}`);
        console.log();
    }
}
