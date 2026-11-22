// The room's clock (js/roomtime.js): the light by the hour, the moon, the seasons, tanabata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const RT = createRequire(import.meta.url)('../js/roomtime.js');

test('three in the afternoon is the room as painted; night is dark and blue', () => {
    const g = RT.grade(15);
    assert.deepEqual([g.gain, g.lift, g.sat, g.dark], [[1, 1, 1], [0, 0, 0], 1, 0]);
    const px = new Uint8ClampedArray([10, 20, 30, 255]);
    RT.apply(px, g);
    assert.deepEqual([...px], [10, 20, 30, 255]);
    const n = RT.grade(23);
    assert.equal(n.dark, 1);
    assert.ok(n.gain[2] > n.gain[0], 'night keeps more blue than red');
    const white = new Uint8ClampedArray([255, 255, 255, 255]);
    RT.apply(white, n);
    assert.ok(white[0] < 120 && white[2] > white[0]);
});

test('the light changes smoothly through the day, warm at golden hour, and wraps past midnight', () => {
    for (let h = 0; h < 24; h += 0.25) {
        const a = RT.grade(h), b = RT.grade(h + 0.25);
        for (let c = 0; c < 3; c++) assert.ok(Math.abs(a.gain[c] - b.gain[c]) < 0.2, `jump at ${h}`);
    }
    const gold = RT.grade(17.6);
    assert.ok(gold.gain[0] > gold.gain[2] + 0.3);
    assert.deepEqual(RT.grade(24.5), RT.grade(0.5));
});

test('apply swaps marked colours instead of grading them', () => {
    const px = new Uint8ClampedArray([0xfe, 0x01, 0xfe, 255, 0xfe, 0x01, 0xfe, 255]);
    RT.apply(px, RT.grade(23), new Map([[0xfe01fe, [250, 240, 200]]]));
    assert.deepEqual([...px.slice(0, 3)], [250, 240, 200]);
});

test('the moon: new, full, and in between', () => {
    assert.ok(RT.moon(new Date(Date.UTC(2000, 0, 6, 18, 14))).lit < 0.01);
    const full = RT.moon(new Date(Date.UTC(2025, 0, 13, 22, 27)));
    assert.ok(Math.abs(full.phase - 0.5) < 0.02 && full.lit > 0.99);
    const quarter = RT.moon(new Date(Date.UTC(2025, 0, 6, 23, 56)));
    assert.ok(Math.abs(quarter.lit - 0.5) < 0.05);
});

test('seasons by month, and tanabata in the first week of July', () => {
    const at = (m, d = 15) => new Date(2026, m, d, 12);
    assert.deepEqual([0, 2, 5, 8, 11].map(m => RT.season(at(m))), ['winter', 'spring', 'summer', 'autumn', 'winter']);
    assert.equal(RT.tanabata(at(6, 1)), true);
    assert.equal(RT.tanabata(at(6, 7)), true);
    assert.equal(RT.tanabata(at(6, 8)), false);
    assert.equal(RT.tanabata(at(7, 3)), false);
});

test('a nap moves the clock on', () => {
    const before = RT.now().getTime();
    RT.sleep(3 * 3600000);
    assert.ok(Math.abs(RT.now().getTime() - before - 3 * 3600000) < 2000);
    assert.equal(RT.offset, 3 * 3600000);
});
