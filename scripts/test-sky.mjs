#!/usr/bin/env node
/*
 * Tests for js/sky.js: does the physical sky do what real skies do?
 *
 *   node --test scripts/test-sky.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

runInThisContext(readFileSync(new URL('../js/sky.js', import.meta.url), 'utf8'));
const { Sky } = globalThis;
const sky = new Sky();
const up = [0, 1, 0];
const at = (el, az) => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('sunlight reaching a cloud warms and dims as the sun descends', () => {
    const cloud = new Sky({ height: 1000 });
    const colors = [65, 40, 20, 8, 3].map(e => cloud.transmittance(Sky.sun(e * Math.PI / 180)));
    for (let i = 1; i < colors.length; i++) {
        assert.ok(lum(colors[i]) < lum(colors[i - 1]));
        assert.ok(colors[i][0] / colors[i][2] > colors[i - 1][0] / colors[i - 1][2]);
    }
    assert.deepEqual(cloud.transmittance([0, -1, 0]), [0, 0, 0]);
    assert.ok(lum(new Sky({ height: 1000, haze: 3 }).transmittance(Sky.sun(0.2))) < lum(cloud.transmittance(Sky.sun(0.2))));
});

test('a high sun gives a blue sky overhead', () => {
    const [r, g, b] = sky.color(up, Sky.sun(1.0));
    assert.ok(b > g && g > r, `zenith ${[r, g, b]}`);
});

test('the sky is paler toward the horizon than overhead', () => {
    const sun = Sky.sun(0.8, 0);
    const zen = sky.color(up, sun), hor = sky.color(at(0.03, Math.PI / 2), sun);
    const sat = c => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
    assert.ok(sat(hor) < sat(zen), `horizon ${hor} zenith ${zen}`);
    assert.ok(lum(hor) > lum(zen));
});

test('at sunset the horizon under the sun turns warm, and the zenith darkens', () => {
    const sunset = Sky.sun(0.02, 0);
    const [r, , b] = sky.color(at(0.03, 0), sunset);
    assert.ok(r > b, `toward the setting sun ${[r, b]}`);
    assert.ok(lum(sky.color(up, sunset)) < lum(sky.color(up, Sky.sun(1.0))));
});

test('the sky is brighter near the sun', () => {
    const sun = Sky.sun(0.5, 0);
    assert.ok(lum(sky.color(at(0.55, 0.05), sun)) > lum(sky.color(at(0.55, Math.PI), sun)));
});

test('more haze means a whiter sky', () => {
    const sun = Sky.sun(0.8), view = at(0.3, 2);
    const sat = c => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
    assert.ok(sat(new Sky({ haze: 4 }).color(view, sun)) < sat(new Sky({ haze: 0.2 }).color(view, sun)));
});

test('a gradient runs from the top of the frame to the horizon', () => {
    const g = sky.gradient(Sky.sun(0.7), { stops: 4 });
    assert.equal(g.length, 4);
    for (const c of g) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.notEqual(g[0], g[3]);
});
