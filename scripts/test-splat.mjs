import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
for (const f of ['stack', 'layers', 'splat']) runInThisContext(readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'));
const { Stack: S, Layers: L, Splat: G } = globalThis;
const near = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
test('parallel stroke uses a finite tangent; invalid stroke fails early', () => {
    const volume = new L.Volume(S.shapes.sphere(1));
    volume.normal = () => [0, 0, 1];
    const chain = [new L.paints.CelLight()];
    const cloud = new G.Cloud(volume, chain, { dabs: 10, stroke: [0, 0, 1] });
    for (const d of cloud.dabs) {
        assert.ok(d.sigma.every(Number.isFinite));
        near(Math.hypot(...d.tangent), 1);
        near(d.tangent[2], 0);
    }
    for (const stroke of [[0, 0, 0], [1, NaN, 0], [1, 2]])
        assert.throws(() => new G.Cloud(volume, chain, { dabs: 1, stroke }), RangeError);
});

test('size changes footprint but keeps surface seeds and paint fixed', () => {
    const volume = new L.Volume(S.shapes.sphere(1));
    const chain = [new L.paints.CelLight()];
    const a = new G.Cloud(volume, chain, { dabs: 30, size: 1 });
    const b = new G.Cloud(volume, chain, { dabs: 30, size: 2 });
    a.dabs.forEach((d, i) => {
        assert.deepEqual(d.p, b.dabs[i].p);
        assert.deepEqual(d.color, b.dabs[i].color);
        d.sigma.forEach((v, k) => near(v * 4, b.dabs[i].sigma[k]));
    });
});
test('EWA covariance matches brute-force projected symmetric samples at varied cameras', () => {
    const axes = [[3, 1, 2], [-1, 4, 0.5], [0.2, -0.1, 0.3]];
    const sigma = G.covariance(axes);
    for (const theta of [0, 0.7, 2.9]) for (const phi of [0, 0.32, 1.4]) {
        const cam = S.camera({ theta, phi, scale: 2.3, ox: 70, oy: 91 });
        const centre = [15, 22, -7], origin = cam.project(...centre), brute = [0, 0, 0];
        for (const axis of axes) for (const sign of [-1, 1]) {
            const p = cam.project(...centre.map((v, i) => v + sign * Math.sqrt(3) * axis[i]));
            const x = p[0] - origin[0], y = p[1] - origin[1];
            brute[0] += x*x/6; brute[1] += x*y/6; brute[2] += y*y/6;
        }
        G.projectCovariance(sigma, cam).forEach((v, i) => near(v, brute[i]));
    }
});
test('back-to-front sorting includes camera tilt, rotation and stable ties', () => {
    const dabs = [[0, 0, 10], [0, 0, -10], [0, 10, 0], [0, 0, 10]].map((p, id) => ({ p, id }));
    assert.deepEqual(G.sort(dabs, S.camera()).map(d => d.id), [0, 3, 2, 1]);
    assert.deepEqual(G.sort(dabs, S.camera({ theta: Math.PI, phi: 0 })).map(d => d.id), [1, 2, 0, 3]);
    assert.deepEqual(dabs.map(d => d.id), [0, 1, 2, 3]);
});
test('surface seeds are deterministic, tangent, painted once and fixed across views', () => {
    const volume = new L.Volume(S.shapes.cumulus(5), { blend: 6, noise: { amount: 2, seed: 3 } });
    const chain = [new L.paints.CelLight()];
    const a = new G.Cloud(volume, chain, { dabs: 300, seed: 42 });
    const b = new G.Cloud(volume, chain, { dabs: 300, seed: 42 });
    assert.deepEqual(a.dabs, b.dabs);
    assert.notDeepEqual(a.dabs, new G.Cloud(volume, chain, { dabs: 300, seed: 43 }).dabs);
    assert.equal(a.dabs.length, 300);
    for (const d of a.dabs) {
        near(volume.distance(...d.p), 0, 0.002);
        near(d.n.reduce((s, v, i) => s + v * d.tangent[i], 0), 0);
        assert.ok(chain[0].tones.some(t => t.every((v, i) => v === d.color[i])));
    }
    const saved = JSON.stringify(a.dabs);
    G.sort(a.dabs, S.camera({ theta: 2 }));
    assert.equal(JSON.stringify(a.dabs), saved);
});
