#!/usr/bin/env node
/*
 * Tests for js/stack.js: the geometry and lighting, which need no canvas.
 *
 *   node --test scripts/test-stack.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ctx = {};
runInNewContext(readFileSync(new URL('../js/stack.js', import.meta.url), 'utf8'), { globalThis: ctx, Math, Map, Array, Object, Number, Error });
const S = ctx.Stack;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('a sphere cut at a height is a circle of the right radius', () => {
    const s = { x: 3, y: 50, z: -2, r: 20 };
    const [c] = S.cut([s], 62);
    near(c.r, Math.sqrt(20 * 20 - 12 * 12));
    assert.equal(c.x, 3); assert.equal(c.z, -2);
    assert.equal(S.cut([s], 71).length, 0);       // above the top
    assert.equal(S.cut([s], 29).length, 0);       // below the bottom
});

test('slices run from the ground to the top, so the base is flat', () => {
    const sl = S.slices([{ x: 0, y: 10, z: 0, r: 30 }], 40);   // the sphere dips below the ground
    assert.ok(sl[0].h < 1.1);
    assert.ok(sl[0].circles[0].r > 25);            // the first cut is wide: a flat bottom, not a point
    assert.ok(sl.at(-1).t > 0.97);
});

test('the lit part of every cut matches the sphere it came from', () => {
    // Sample points on the edge of each cut; a point is lit exactly when the
    // sphere's normal there faces the light past the threshold.
    const r = S.rng(7);
    let checked = 0;
    for (let trial = 0; trial < 300; trial++) {
        const s = { x: r() * 40 - 20, y: 40 + r() * 20, z: r() * 40 - 20, r: 10 + r() * 30 };
        let L = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
        const m = Math.hypot(...L); L = L.map(v => v / m);
        const th = r() * 1.6 - 0.8;
        const h = s.y + (r() * 2 - 1) * s.r * 0.95;
        const [c] = S.cut([s], h);
        const part = S.litPart(c, h, L, th);
        for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2 + 0.01;
            const p = [c.x + Math.cos(a) * c.r, h, c.z + Math.sin(a) * c.r];
            const n = [(p[0] - s.x) / s.r, (p[1] - s.y) / s.r, (p[2] - s.z) / s.r];
            const dot = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
            if (Math.abs(dot - th) < 1e-3) continue;           // on the terminator itself
            let inside;
            if (part === null) inside = false;
            else if (part === 'all') inside = true;
            else {
                const mid = (part.from + part.to) / 2, half = (part.to - part.from) / 2;
                const d = Math.atan2(Math.sin(a - mid), Math.cos(a - mid));
                inside = Math.abs(d) <= half;
            }
            assert.equal(inside, dot >= th, `trial ${trial}, angle ${a.toFixed(2)}`);
            checked++;
        }
    }
    assert.ok(checked > 5000);
});

test('light straight from above lights the top half and nothing below', () => {
    const s = { x: 0, y: 50, z: 0, r: 20 };
    const up = [0, 1, 0];
    assert.equal(S.litPart(S.cut([s], 60)[0], 60, up, 0), 'all');
    assert.equal(S.litPart(S.cut([s], 40)[0], 40, up, 0), null);
});

test('the camera matrix and project agree', () => {
    const cam = S.camera({ theta: 0.7, phi: 0.4, ox: 300, oy: 400, scale: 1.5 });
    const [a, b, c, d, e, f] = cam.matrix(35);
    const [x, z] = [12, -30];
    const p = cam.project(x, 35, z);
    near(a * x + c * z + e, p[0]);
    near(b * x + d * z + f, p[1]);
});

test('a direction to the viewer\'s right stays to the right whichever way the pile is turned', () => {
    for (const theta of [0, 0.9, 2.5, 4]) {
        const cam = S.camera({ theta, phi: 0.3 });
        const w = cam.toWorld([1, 0, 0]);
        const [sx, sy] = cam.project(w[0] * 10, 0, w[2] * 10);
        near(sx, 10); near(sy, 0);
    }
});

test('a cumulus is the same for the same seed, different for another', () => {
    const a = S.shapes.cumulus(5), b = S.shapes.cumulus(5), c = S.shapes.cumulus(6);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    const B = S.bounds(a);
    assert.ok(B.top > 200 && B.top < 400, `top ${B.top}`);
});

test('a cumulus is a broad mound: wider than tall, with no thin neck under a wider head', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const sp = S.shapes.cumulus(seed);
        const B = S.bounds(sp);
        assert.ok(B.x1 - B.x0 > B.top * 1.15, `seed ${seed}: ${(B.x1 - B.x0).toFixed(0)} wide, ${B.top.toFixed(0)} tall`);
        // Width of the cloud at each height; above the base, no level may be
        // much narrower than a level above it (a stalk under a head).
        const widths = S.slices(sp, 40).map(sl => {
            let a = Infinity, b = -Infinity;
            for (const c of sl.circles) { a = Math.min(a, c.x - c.r); b = Math.max(b, c.x + c.r); }
            return b - a;
        });
        for (let i = 4; i < widths.length; i++) {
            const above = Math.max(...widths.slice(i + 1));
            assert.ok(widths[i] >= above * 0.8, `seed ${seed}: neck at level ${i} (${widths[i].toFixed(0)} under ${above.toFixed(0)})`);
        }
    }
});

// One sphere seen from a little above, filling most of a 200 x 200 frame.
function onSphere() {
    const p = S.pile(S.shapes.sphere(1, { r: 100 }));
    const cam = S.camera({ theta: 0.4, phi: 0.3, ox: 100, oy: 185, scale: 0.8 });
    return { p, cam, gb: S.gbuffer(p, cam, 200, 200, { slices: 200 }) };
}

test('the buffer covers the sphere and nothing else', () => {
    const { p, cam, gb } = onSphere();
    const centre = cam.project(0, 100, 0).map(Math.floor);
    assert.equal(gb.sphere[centre[1] * gb.w + centre[0]], 0);
    assert.equal(gb.sphere[0], -1);                                     // a corner is sky
    // Coverage is close to the area of the sphere's outline on screen.
    let n = 0; for (const v of gb.sphere) n += v >= 0;
    const r = 100 * 0.8;
    assert.ok(n > Math.PI * r * r * 0.9 && n < Math.PI * r * r * 1.25, `covered ${n}`);
});

test('recovered surface points lie on the sphere, and face the viewer', () => {
    const { cam, gb } = onSphere();
    const N = S.normals(gb);
    const toViewer = cam.toWorld([0, Math.sin(cam.phi), -Math.cos(cam.phi)]);
    let checked = 0, facing = 0;
    for (let k = 0; k < gb.w * gb.h; k++) {
        if (gb.sphere[k] < 0) continue;
        const n = [N[k * 3], N[k * 3 + 1], N[k * 3 + 2]];
        near(Math.hypot(...n), 1, 1e-4);
        if (n[0] * toViewer[0] + n[1] * toViewer[1] + n[2] * toViewer[2] > -0.05) facing++;
        checked++;
    }
    // Everything we see of a sphere faces us (bar the edge of the flat base).
    assert.ok(facing / checked > 0.97, `${facing}/${checked}`);
});

test('the centre of the sphere\'s outline faces straight at the viewer', () => {
    const { cam, gb } = onSphere();
    const N = S.normals(gb);
    const [cx, cy] = cam.project(0, 100, 0).map(Math.floor);
    // The front of the sphere is drawn a little below its centre's projection; look for the
    // pixel whose normal best faces us near there.
    const toViewer = cam.toWorld([0, Math.sin(cam.phi), -Math.cos(cam.phi)]);
    let best = -1;
    for (let y = cy - 15; y <= cy + 15; y++) for (let x = cx - 15; x <= cx + 15; x++) {
        const k = y * gb.w + x;
        best = Math.max(best, N[k * 3] * toViewer[0] + N[k * 3 + 1] * toViewer[1] + N[k * 3 + 2] * toViewer[2]);
    }
    assert.ok(best > 0.98, `best ${best}`);
});

test('blurring a field keeps its average and ignores empty pixels', () => {
    const w = 40, h = 30, covered = new Uint8Array(w * h), F = new Float32Array(w * h * 3);
    for (let k = 0; k < w * h; k++) {
        if ((k % w) < 25) { covered[k] = 1; F[k * 3] = (k % w) < 12 ? 1 : 0; F[k * 3 + 1] = 0.5; }
    }
    const B = S.blurField(F, covered, w, h, 3);
    for (let k = 0; k < w * h; k++) {
        if (!covered[k]) { assert.equal(B[k * 3], 0); continue; }
        near(B[k * 3 + 1], 0.5, 1e-5);                       // a constant stays constant, even at the edge
    }
    // The step is softened: just right of it, no longer 0.
    assert.ok(B[(15 * w + 13) * 3] > 0.1 && B[(15 * w + 13) * 3] < 0.6);
});

test('every mode has defaults and a draw function', () => {
    for (const [name, m] of Object.entries(S.modes)) {
        assert.equal(typeof m.draw, 'function', name);
        assert.equal(typeof m.defaults.slices, 'number', name);
    }
});
