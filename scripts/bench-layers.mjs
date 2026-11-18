#!/usr/bin/env node
/*
 * How long painting the layers takes, per style and with each part of the
 * foundation switched on alone, so a slow paint shows up before a render
 * times out.
 *
 *   node scripts/bench-layers.mjs [--slices=160] [--res=1] [--seed=5] [--only=NAME,...]
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
for (const f of ['../js/stack.js', '../js/sky.js', '../js/layers.js']) runInThisContext(readFileSync(new URL(f, import.meta.url), 'utf8'));
const { Stack: S, Layers: L } = globalThis;

const slices = Number(arg('slices', 160)), res = Number(arg('res', 1)), seed = Number(arg('seed', 5));
const quiet = { noise: { amount: 0 }, shadow: 'off', paint: { Occlusion: { amount: 0 }, Glow: { amount: 0 } } };
const only = (k, v) => ({ ...quiet, [k]: v, paint: { ...quiet.paint, ...(k === 'paint' ? v : {}) } });
const cases = {
    afternoon: ['afternoon', {}],
    'foundation, all off': ['foundation', quiet],
    '+ noise': ['foundation', { ...quiet, noise: {} }],
    '+ cast shadow': ['foundation', { ...quiet, shadow: {} }],
    '+ occlusion': ['foundation', only('paint', { Occlusion: { amount: 0.5 } })],
    '+ glow': ['foundation', only('paint', { Glow: { amount: 0.5 } })],
    'foundation, all on': ['foundation', {}]
};
const pick = arg('only', null)?.split(',');

const spheres = S.shapes.cumulus(seed);
console.log(`${spheres.length} spheres, ${slices} slices at ${res} texels per unit`);
for (const [name, [style, o]] of Object.entries(cases)) {
    if (pick && !pick.some(p => name.includes(p))) continue;
    const r = L.resolve(L.styles[style], o);
    const t = performance.now();
    const volume = new L.Volume(spheres, { blend: r.blend, noise: r.noise });
    const layers = new L.Slicer({ count: slices, res }).cut(volume, L.build(r.paints, { sun: r.sun, shadow: r.shadow }));
    const ms = performance.now() - t;
    console.log(`${name.padEnd(22)} ${(ms / 1000).toFixed(2).padStart(6)} s   ${layers.length} layers`);
}
