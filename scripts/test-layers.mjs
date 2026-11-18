#!/usr/bin/env node
/*
 * Tests for js/layers.js (painted layers): the volume, the paints, the
 * slicer and the stacking transform. No canvas needed.
 *
 *   node --test scripts/test-layers.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ShadowReference } from './shadow-reference.mjs';

const ctx = {};
const sandbox = { globalThis: ctx, Math, Map, Array, Object, Number, Error, Uint8ClampedArray, Float32Array, Int32Array, Uint8Array, Float64Array };
for (const f of ['../js/stack.js', '../js/sky.js', '../js/layers.js']) runInNewContext(readFileSync(new URL(f, import.meta.url), 'utf8'), sandbox);
const { Stack: S, Layers: L } = ctx;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = v => { const m = Math.hypot(...v); return v.map(q => q / m); };

test('foundation paints a finite palette across normals, height, occlusion and shadow', () => {
    const r = L.resolve(L.styles.foundation, { sun: [0, 1, 0] });
    const chain = L.build(r.paints, { sun: r.sun, shadow: r.shadow });
    const colors = new Set();
    for (let i = 0; i <= 120; i++) for (let j = 0; j <= 30; j++) {
        const d = i / 60 - 1;
        const s = { x: 0, y: 0, z: 0, n: [Math.sqrt(1 - d * d), d, 0], t: j / 30,
            volume: { occlusion: () => j / 30, sunVisibility: () => j / 30, thickness: () => j } };
        colors.add(L.paint(chain, s).join(','));
    }
    assert.ok(colors.size <= 12, `${colors.size} colours: foundation must not grade its bands`);
});

test('foundation occlusion selects tones instead of tinting them', () => {
    const r = L.resolve(L.styles.foundation, { sun: [0, 1, 0], shadow: 'off', paint: { Terminator: { amount: 0 } } });
    const chain = L.build(r.paints, { sun: r.sun, shadow: r.shadow });
    const at = ao => L.paint(chain, { x: 0, y: 0, z: 0, n: [Math.sqrt(0.84), 0.4, 0], t: 0.8,
        volume: { occlusion: () => ao, thickness: () => 100 } });
    assert.notDeepEqual([...at(1)], [...at(0)]);
    const tones = r.paints.find(p => p.type === 'CelLight').tones.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(','));
    for (const ao of [0, 0.2, 0.8, 1]) assert.ok(tones.includes(at(ao).join(',')));
});

test('foundation Lift and Terminator have flat interiors and hard edges', () => {
    const r = L.resolve(L.styles.foundation, { sun: [0, 1, 0], shadow: 'off' });
    const chain = L.build(r.paints, { sun: r.sun });
    const lift = chain.find(p => p instanceof L.paints.Lift);
    const seam = chain.find(p => p instanceof L.paints.Terminator);
    const c = [120, 140, 160];
    assert.deepEqual([...lift.apply(c, { t: 0 })], [...lift.apply(c, { t: lift.height - 1e-6 })]);
    assert.deepEqual([...lift.apply(c, { t: lift.height })], c);
    const at = d => [...seam.apply(c, { n: [1, d, 0] })];
    assert.deepEqual(at(seam.at), at(seam.at + seam.width - 1e-6));
    assert.notDeepEqual(at(seam.at), c);
    assert.deepEqual(at(seam.at + seam.width + 1e-6), c);
});

test('rough cloud shadow agrees with a fine-step surface reference', () => {
    const volume = new L.Volume(S.shapes.cumulus(5), {
        blend: 6, noise: { ...L.styles.foundation.noise, scale: 14, amount: 10 }
    });
    const oracle = new ShadowReference(volume, L.styles.foundation.sun);
    const points = oracle.surfaces();
    const m = oracle.measure(points);
    console.log('shadow reference', JSON.stringify({ ...m, rows: undefined }));
    assert.ok(m.count > 50);
    assert.ok(m.blocked > 0, 'retain real self-shadowing');
    const finer = new ShadowReference(volume, L.styles.foundation.sun, 0.05);
    const convergence = m.rows.reduce((s, r) => s + Math.abs(r.reference - finer.visibility(r.p)), 0) / m.count;
    assert.ok(convergence < 0.01, `reference convergence ${convergence}`);
    // The production 96-step budget can miss distant blockers; it must not
    // darken open rays. A longer march isolates clearance from that budget.
    assert.ok(m.mae < 0.07, `visibility MAE ${m.mae}`);
    assert.equal(m.falseDark, 0, 'open surfaces must not acquire false shadows');
    const longError = m.rows.reduce((s, r) => s + Math.abs(
        volume.sunVisibility(...r.p, oracle.sun, { steps: 384 }) - r.reference), 0) / m.count;
    assert.ok(longError < 0.01, `long march MAE ${longError}`);
});

test('foundation palette follows physical light, without mutating styles or overriding explicit paint colours', () => {
    const before = JSON.stringify(L.styles);
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const palettes = [65, 40, 20, 8, 3].map(e => L.resolve(L.styles.foundation, { sun: ctx.Sky.sun(e * Math.PI / 180) }).paints.filter(p => p.type === 'CelLight'));
    for (let i = 1; i < palettes.length; i++) {
        const a = rgb(palettes[i - 1][0].tones[2]), b = rgb(palettes[i][0].tones[2]);
        assert.ok(lum(b) < lum(a));
        assert.ok(b[0] / b[2] > a[0] / a[2]);
    }
    assert.notEqual(palettes[0][0].tones[0], palettes[4][0].tones[0]);
    assert.equal(L.resolve(L.styles.foundation, { paint: { Terminator: { color: '#123456' } } }).paints.find(p => p.type === 'Terminator').color, '#123456');
    assert.equal(JSON.stringify(L.styles), before);
    assert.equal(JSON.stringify(L.resolve(L.styles.afternoon).paints), JSON.stringify(L.styles.afternoon.paints));
});

test('inside is the union of the spheres', () => {
    const v = new L.Volume([{ x: 0, y: 50, z: 0, r: 30 }, { x: 45, y: 50, z: 0, r: 20 }]);
    assert.ok(v.inside(0, 50, 0));
    assert.ok(v.inside(60, 50, 0));
    assert.equal(v.inside(0, 90, 0), null);
    assert.equal(v.inside(-40, 50, 0), null);
});

test('on one sphere the surface direction points out from its centre, at any blend', () => {
    for (const blend of [0, 5, 20]) {
        const v = new L.Volume([{ x: 10, y: 50, z: -5, r: 30 }], { blend });
        const n = v.normal(10 + 20, 50 + 10, -5);
        near(n[0], 2 / Math.sqrt(5), 1e-9); near(n[1], 1 / Math.sqrt(5), 1e-9); near(n[2], 0, 1e-9);
    }
});

test('blend lets two neighbouring spheres share their light', () => {
    // Two spheres side by side; a point near the top of their meeting.
    const sp = [{ x: -25, y: 50, z: 0, r: 30 }, { x: 25, y: 50, z: 0, r: 30 }];
    const p = [-4, 70, 0];
    const hard = new L.Volume(sp).normal(...p);
    const soft = new L.Volume(sp, { blend: 15 }).normal(...p);
    // Unblended, it belongs to the left sphere and leans right-and-up from its centre.
    assert.ok(hard[0] > 0.6);
    // Blended, the two spheres' directions average toward straight up: one mass.
    assert.ok(soft[1] > hard[1] + 0.2, `soft ${soft} hard ${hard}`);
    near(Math.hypot(...soft), 1, 1e-9);
});

test('the grid finds every sphere a point could be inside', () => {
    const r = S.rng(3);
    const sp = Array.from({ length: 60 }, () => ({ x: r() * 300 - 150, y: r() * 200, z: r() * 200 - 100, r: 5 + r() * 60 }));
    const v = new L.Volume(sp, { blend: 6 });
    for (let i = 0; i < 2000; i++) {
        const p = [r() * 360 - 180, r() * 260, r() * 260 - 130];
        const brute = sp.some(s => Math.hypot(p[0] - s.x, p[1] - s.y, p[2] - s.z) < s.r);
        assert.equal(!!v.inside(...p), brute);
    }
});

test('cel light gives the light tone facing the sun and the shadow tone away from it', () => {
    const c = new L.paints.CelLight({ tones: ['#000000', '#808080', '#ffffff'], thresholds: [0, 0.5], sun: [0, 1, 0] });
    assert.deepEqual([...c.apply(null, { n: [0, 1, 0] })], [255, 255, 255]);
    assert.deepEqual([...c.apply(null, { n: [1, 0.3, 0] })], [128, 128, 128]);
    assert.deepEqual([...c.apply(null, { n: [0, -1, 0] })], [0, 0, 0]);
    assert.throws(() => new L.paints.CelLight({ tones: ['#000000'], thresholds: [0, 1] }));
});

test('paints chain in order, each taking the colour so far', () => {
    const chain = [new L.paints.CelLight({ tones: ['#ffffff'], thresholds: [] }), new L.paints.Lift({ color: '#000000', amount: 1, height: 0.5 })];
    assert.deepEqual([...L.paint(chain, { n: [0, 1, 0], t: 0 })], [0, 0, 0]);          // the very base: fully lifted
    assert.deepEqual([...L.paint(chain, { n: [0, 1, 0], t: 0.5 })], [255, 255, 255]);  // above the lift's height: untouched
});

test('a layer of a sphere is a painted disc of the right size', () => {
    const v = new L.Volume([{ x: 0, y: 40, z: 0, r: 40 }]);
    const layers = new L.Slicer({ count: 8, res: 1 }).cut(v, [new L.paints.CelLight()]);
    const mid = layers.reduce((a, b) => (Math.abs(b.h - 40) < Math.abs(a.h - 40) ? b : a));
    let n = 0; for (let k = 3; k < mid.data.length; k += 4) n += mid.data[k] === 255;
    const r = Math.sqrt(40 * 40 - (mid.h - 40) ** 2);
    assert.ok(Math.abs(n - Math.PI * r * r) / (Math.PI * r * r) < 0.05, `${n} texels for r ${r.toFixed(1)}`);
    assert.ok(layers[0].h < 6 && layers.at(-1).t > 0.9);
});

test('the lit side of a sliced sphere faces the sun', () => {
    const sun = [-1, 0.2, 0];
    const v = new L.Volume([{ x: 0, y: 40, z: 0, r: 40 }]);
    const [layer] = new L.Slicer({ count: 1, res: 1 }).cut(v, [new L.paints.CelLight({ tones: ['#000000', '#ffffff'], thresholds: [0], sun })]);
    const at = (x, z) => { const u = Math.floor(x - layer.x0), w = Math.floor(z - layer.z0); return layer.data[(w * layer.width + u) * 4]; };
    assert.equal(at(-30, 0), 255);     // toward the sun (negative x)
    assert.equal(at(30, 0), 0);        // away from it
});

test('a layer is placed where the camera puts its slice', () => {
    const cam = S.camera({ theta: 0.8, phi: 0.35, ox: 300, oy: 400, scale: 1.3 });
    const layer = { h: 25, x0: -60, z0: -40, res: 2 };
    const [a, b, c, d, e, f] = L.StackView.transform(cam, layer);
    // texel (u, v) is the world point (x0 + u/res, z0 + v/res) at height h
    const u = 17, v = 33;
    const p = cam.project(layer.x0 + u / layer.res, layer.h, layer.z0 + v / layer.res);
    near(a * u + c * v + e, p[0], 1e-9);
    near(b * u + d * v + f, p[1], 1e-9);
});

test('the unpainted core is never where it could be seen', () => {
    // A core texel must be covered by the layer above and surrounded by texels
    // of its own layer: never on top, never on the side of the stack.
    const v = new L.Volume(S.shapes.cumulus(4), { blend: 6 });
    const layers = new L.Slicer({ count: 60, res: 0.5, core: '#010203' }).cut(v, [new L.paints.CelLight()]);
    let cores = 0;
    for (let i = 0; i < layers.length - 1; i++) {
        const a = layers[i], b = layers[i + 1], W = a.width;
        const isCore = k => a.data[k * 4] === 1 && a.data[k * 4 + 1] === 2 && a.data[k * 4 + 2] === 3;
        for (let k = 0; k < W * a.height; k++) {
            if (!isCore(k)) continue;
            cores++;
            assert.equal(b.data[k * 4 + 3], 255, `layer ${i}: core uncovered from above`);
            for (const o of [-1, 1, -W, W]) assert.equal(a.data[(k + o) * 4 + 3], 255, `layer ${i}: core on the edge`);
        }
    }
    assert.ok(cores > 1000, `only ${cores} core texels: the shell is doing nothing`);
});

test('crease is zero on one sphere and grows where billows meet', () => {
    const one = new L.Volume([{ x: 0, y: 50, z: 0, r: 30 }], { blend: 4 });
    near(one.crease(0, 70, 0, 3), 0, 1e-12);
    const two = new L.Volume([{ x: -25, y: 50, z: 0, r: 30 }, { x: 25, y: 50, z: 0, r: 30 }], { blend: 4 });
    near(two.crease(0, 50, 0, 3), Math.log(2), 1e-9);       // exactly between them
    assert.ok(two.crease(-40, 50, 0, 3) < 0.01);             // far side of one: not a seam
});

test('soft light blends with no bands', () => {
    const p = new L.paints.SoftLight({ tones: ['#000000', '#ffffff'], lo: 0, hi: 1, sun: [0, 1, 0] });
    near(p.apply(null, { n: [0, 1, 0] })[0], 255);
    near(p.apply(null, { n: [Math.sqrt(0.75), 0.5, 0] })[0], 127.5, 1e-9);
    near(p.apply(null, { n: [0, -1, 0] })[0], 0);
});

test('the terminator only touches the edge of the light', () => {
    const p = new L.paints.Terminator({ color: '#ff0000', at: 0, width: 0.1, amount: 1, sun: [0, 1, 0] });
    const grey = [100, 100, 100];
    assert.deepEqual([...p.apply(grey, { n: [1, 0, 0] })], [255, 0, 0]);       // right on the edge
    assert.deepEqual([...p.apply(grey, { n: [0, 1, 0] })], grey);              // full light: untouched
});

test('hatching is fixed in the world and stays out of the light', () => {
    const p = new L.paints.Hatch({ color: '#000000', spacing: 10, width: 0.3, angle: 0, below: 0, sun: [0, 1, 0] });
    const white = [255, 255, 255], down = [0, -1, 0];
    assert.deepEqual([...p.apply(white, { x: 1, y: 0, z: 0, n: down })], [0, 0, 0]);
    assert.deepEqual([...p.apply(white, { x: 5, y: 0, z: 0, n: down })], white);
    assert.deepEqual([...p.apply(white, { x: 1, y: 0, z: 0, n: [0, 1, 0] })], white);   // lit: no lines
});

test('a chain is built from data, with shared settings', () => {
    const chain = L.build([{ type: 'CelLight', tones: ['#000000', '#ffffff'], thresholds: [0] }, { type: 'Haze' }], { sun: [1, 0, 0] });
    assert.equal(chain.length, 2);
    near(chain[0].sun[0], 1);
    assert.throws(() => L.build([{ type: 'Nope' }]), /no paint "Nope"/);
});

test('every style says what it is for, and builds', () => {
    for (const [name, st] of Object.entries(L.styles)) {
        assert.ok(st.intent && st.intent.length > 20, `${name} needs an intent`);
        assert.ok(Array.isArray(st.sky) && st.sky.length, `${name} needs a sky`);
        const chain = L.build(st.paints, { sun: st.sun });
        const c = L.paint(chain, { x: 0, y: 50, z: 0, n: [0, 1, 0], t: 0.5, volume: new L.Volume([{ x: 0, y: 50, z: 0, r: 30 }], { blend: st.blend }) });
        assert.equal(c.length, 3, name);
        for (const v of c) assert.ok(v >= 0 && v <= 255, `${name}: ${c}`);
    }
});

// ── The foundation: noise, signed distance, and the light queries ──────────

for (const billow of [false, true]) test(`${billow ? 'billowed ' : ''}noise is seeded, in range, and its gradient is exact`, () => {
    const a = new L.Noise({ seed: 3, scale: 15, octaves: 3, billow }), b = new L.Noise({ seed: 3, scale: 15, octaves: 3, billow });
    const r = S.rng(9), h = 1e-4;
    let steepest = 0;
    for (let i = 0; i < 400; i++) {
        const p = [r() * 200 - 100, r() * 200, r() * 200 - 100];
        const [v, gx, gy, gz] = a.fbm(...p);
        assert.equal(v, b.fbm(...p)[0]);
        near(v, a.at(...p), 1e-12);
        assert.ok(v >= -1 && v <= 1);
        near(gx, (a.at(p[0] + h, p[1], p[2]) - a.at(p[0] - h, p[1], p[2])) / (2 * h), 1e-6);
        near(gy, (a.at(p[0], p[1] + h, p[2]) - a.at(p[0], p[1] - h, p[2])) / (2 * h), 1e-6);
        near(gz, (a.at(p[0], p[1], p[2] + h) - a.at(p[0], p[1], p[2] - h)) / (2 * h), 1e-6);
        steepest = Math.max(steepest, Math.hypot(gx, gy, gz));
    }
    assert.ok(steepest <= a.lipschitz, `gradient ${steepest} over the bound ${a.lipschitz}`);
    assert.notEqual(new L.Noise({ seed: 4 }).at(1.3, 2.7, 3.1), new L.Noise({ seed: 3 }).at(1.3, 2.7, 3.1));
});

test('signed distance is exact for the spheres up to the range, and agrees with inside', () => {
    const r = S.rng(5);
    const sp = Array.from({ length: 40 }, () => ({ x: r() * 300 - 150, y: 30 + r() * 120, z: r() * 200 - 100, r: 8 + r() * 40 }));
    for (const noise of [null, { amount: 4, scale: 12, seed: 2 }]) {
        const v = new L.Volume(sp, { blend: 6, noise, range: 30 });
        for (let i = 0; i < 1500; i++) {
            const p = [r() * 360 - 180, r() * 220, r() * 260 - 130];
            const brute = Math.min(30, ...sp.map(s => Math.hypot(p[0] - s.x, p[1] - s.y, p[2] - s.z) - s.r));
            const want = noise ? brute - 4 * v.noise.at(...p) : brute;
            near(v.distance(...p), want, 1e-9);
            if (Math.abs(want) > 1e-6) assert.equal(!!v.inside(...p), want < 0, `at ${p}`);
        }
    }
});

test('noise moves the surface by at most its amount, and the surface direction follows it', () => {
    const v = new L.Volume([{ x: 0, y: 60, z: 0, r: 40 }], { noise: { amount: 5, scale: 10, seed: 1 } });
    const r = S.rng(2), radii = [];
    for (let i = 0; i < 200; i++) {
        // March out from the centre to the surface along a random direction.
        const d = norm3([r() - 0.5, r() - 0.5, r() - 0.5]);
        let t = 0; while (v.inside(d[0] * t, 60 + d[1] * t, d[2] * t)) t += 0.05;
        radii.push(t);
        // The direction at the surface is the gradient of the distance there.
        const p = [d[0] * t, 60 + d[1] * t, d[2] * t], h = 1e-4;
        const g = [0, 1, 2].map(k => { const a = [...p], b = [...p]; a[k] += h; b[k] -= h; return (v.distance(...a) - v.distance(...b)) / (2 * h); });
        const n = v.normal(...p), m = Math.hypot(...g);
        assert.ok(dot(n, g.map(q => q / m)) > 0.9999, `normal ${n} vs gradient ${g}`);
    }
    assert.ok(Math.min(...radii) >= 35 - 0.05 && Math.max(...radii) <= 45 + 0.05);
    assert.ok(Math.max(...radii) - Math.min(...radii) > 3, 'the noise should actually roughen it');
});

test('cast shadow: lit in the open, dark under another billow, soft between', () => {
    const sun = [0, 1, 0];
    const lone = new L.Volume([{ x: 0, y: 40, z: 0, r: 30 }]);
    near(lone.sunVisibility(0, 69.9, 0, sun), 1);                         // the top of a lone sphere
    near(lone.sunVisibility(20, 40 + Math.sqrt(500) - 0.1, 0, sun), 1);
    // A small billow under a big one, straight below it.
    const v = new L.Volume([{ x: 0, y: 20, z: 0, r: 15 }, { x: 0, y: 90, z: 0, r: 40 }]);
    assert.equal(v.sunVisibility(0, 34.9, 0, sun), 0);
    // Move the small one out sideways: its top comes out of the shadow, through a soft edge.
    const at = dx => new L.Volume([{ x: dx, y: 20, z: 0, r: 15 }, { x: 0, y: 90, z: 0, r: 40 }]).sunVisibility(dx, 34.9, 0, sun);
    const edge = [30, 38, 46, 54, 62].map(at);
    for (let i = 1; i < edge.length; i++) assert.ok(edge[i] >= edge[i - 1] - 1e-9, `${edge}`);
    assert.ok(edge[0] < 0.2 && edge.at(-1) === 1 && edge.some(e => e > 0.05 && e < 0.95), `${edge}`);
});

test('occlusion: open sky on a lone sphere, less in the fold between two', () => {
    const lone = new L.Volume([{ x: 0, y: 50, z: 0, r: 30 }]);
    near(lone.occlusion(0, 79.5, 0, [0, 1, 0]), 1, 1e-9);
    const two = new L.Volume([{ x: -24, y: 50, z: 0, r: 30 }, { x: 24, y: 50, z: 0, r: 30 }]);
    // Where the two spheres meet on top, looking straight up out of the fold.
    const yFold = 50 + Math.sqrt(30 * 30 - 24 * 24);
    const fold = two.occlusion(0, yFold - 0.5, 0, [0, 1, 0]);
    const side = two.occlusion(-54 + 0.5, 50, 0, [-1, 0, 0]);
    assert.ok(fold < 0.85, `fold ${fold}`);
    near(side, 1, 1e-9);
});

test('thickness is the length of the ray inside the volume', () => {
    const v = new L.Volume([{ x: 0, y: 50, z: 0, r: 30 }, { x: 100, y: 50, z: 0, r: 20 }]);
    near(v.thickness(0, 50, 0, [0, 1, 0], { step: 0.5 }), 30, 0.6);           // centre to the top
    near(v.thickness(-29, 50, 0, [1, 0, 0], { step: 0.5 }), 59 + 40, 1.2);    // through both
    assert.equal(v.thickness(0, 100, 0, [0, 1, 0]), 0);                        // above it all
});

// ── Paints that read the whole volume ─────────────────────────────────────

// A small billow under a big one, the sun straight above: the small one's top is in the big one's shadow.
const under = () => new L.Volume([{ x: 0, y: 20, z: 0, r: 15 }, { x: 0, y: 90, z: 0, r: 40 }]);
const sample = (v, x, y, z) => ({ x, y, z, n: v.normal(x, y, z), t: 0.3, volume: v });

test('with shadows on, light paints put a shaded billow in the shadow tone', () => {
    const tones = ['#000000', '#808080', '#ffffff'], sun = [0, 1, 0];
    const v = under(), s = sample(v, 0, 34.9, 0);
    assert.deepEqual([...new L.paints.CelLight({ tones, thresholds: [0.02, 0.5], sun }).apply(null, s)], [255, 255, 255]);
    assert.deepEqual([...new L.paints.CelLight({ tones, thresholds: [0.02, 0.5], sun, shadow: { softness: 8 } }).apply(null, s)], [0, 0, 0]);
    // The big billow's own top is in the open: shadows change nothing there.
    const top = sample(v, 0, 129.9, 0);
    assert.deepEqual([...new L.paints.CelLight({ tones, thresholds: [0.02, 0.5], sun, shadow: { softness: 8 } }).apply(null, top)], [255, 255, 255]);
    // SoftLight follows the same shadow.
    near(new L.paints.SoftLight({ tones: ['#000000', '#ffffff'], lo: -0.5, hi: 1, sun, shadow: { softness: 8, depth: 0.5 } }).apply(null, sample(v, 0, 34.9, 0))[0], 0, 1e-9);
});

test('a cast shadow counts as turned away, so the seam is on its edge, not all over it', () => {
    const grey = [100, 100, 100], sun = [0, 1, 0];
    const seam = new L.paints.Terminator({ color: '#ff0000', at: 0.02, width: 0.08, amount: 1, sun, shadow: { softness: 8, depth: 0.3 } });
    assert.deepEqual([...seam.apply(grey, sample(under(), 0, 34.9, 0))], grey);     // deep in the shadow: untouched
});

test('the shadow is worked out once per sample, however many paints ask', () => {
    const v = under();
    let calls = 0;
    const real = v.sunVisibility.bind(v);
    v.sunVisibility = (...a) => { calls++; return real(...a); };
    const shadow = { softness: 8 };
    const chain = L.build([{ type: 'CelLight' }, { type: 'Terminator' }, { type: 'Hatch' }], { sun: [0, 1, 0], shadow });
    L.paint(chain, sample(v, 0, 34.9, 0));
    assert.equal(calls, 1);
});

test('occlusion paint darkens the fold and leaves the open side alone', () => {
    const two = new L.Volume([{ x: -24, y: 50, z: 0, r: 30 }, { x: 24, y: 50, z: 0, r: 30 }]);
    const ao = new L.paints.Occlusion({ color: '#000000', amount: 1 });
    const white = [255, 255, 255];
    assert.ok(ao.apply(white, { x: 0, y: 67.5, z: 0, n: [0, 1, 0], volume: two })[0] < 220);
    assert.deepEqual([...ao.apply(white, { x: -53.5, y: 50, z: 0, n: [-1, 0, 0], volume: two })], white);
    assert.deepEqual([...new L.paints.Occlusion({ amount: 0 }).apply(white, null)], white);   // off costs nothing
});

test('glow lights thin parts on the far side from the sun, not thick ones', () => {
    // A big sphere with a small one stuck on its far side, the sun from -x.
    const v = new L.Volume([{ x: 0, y: 60, z: 0, r: 40 }, { x: 0, y: 112, z: 0, r: 14 }]);
    const glow = new L.paints.Glow({ color: '#ffffff', amount: 1, density: 0.05, sun: [-1, 0, 0] });
    const black = [0, 0, 0];
    const thin = glow.apply(black, { x: 13.5, y: 112, z: 0, n: [1, 0, 0], volume: v })[0];   // far side of the small one
    const thick = glow.apply(black, { x: 39.5, y: 60, z: 0, n: [1, 0, 0], volume: v })[0];   // far side of the big one
    const lit = glow.apply(black, { x: -39.5, y: 60, z: 0, n: [-1, 0, 0], volume: v })[0];   // facing the sun
    assert.ok(thin > 50 && thin > thick * 5, `thin ${thin} thick ${thick}`);
    assert.equal(lit, 0);
});

test('a page can override any part of a style, and switch shadows off', () => {
    const st = L.styles.foundation;
    const same = L.resolve(st, {});
    assert.deepEqual(same.noise, st.noise);
    assert.deepEqual(same.shadow, st.shadow);
    const r = L.resolve(st, { blend: 2, noise: { amount: 0 }, shadow: 'off', paint: { Terminator: { amount: 0 }, Occlusion: { color: '#000000' } } });
    assert.equal(r.blend, 2);
    assert.equal(r.noise.amount, 0);
    assert.equal(r.noise.scale, st.noise.scale);                 // the rest of the noise is kept
    assert.equal(r.shadow, null);
    assert.equal(r.paints.find(p => p.type === 'Terminator').amount, 0);
    assert.equal(r.paints.find(p => p.type === 'Occlusion').color, '#000000');
    assert.equal(r.paints.find(p => p.type === 'Occlusion').amount, 0.5);
    assert.equal(st.paints.find(p => p.type === 'Terminator').amount, 0.35);   // the style itself is untouched
    // A style without shadows gets them from the page.
    assert.equal(L.resolve(L.styles.afternoon, { shadow: { softness: 4 } }).shadow.softness, 4);
    assert.equal(L.resolve(L.styles.afternoon, {}).shadow, null);
});
