import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import '../js/stack.js';
import '../js/layers.js';
import '../js/sky.js';
import '../js/clock.js';
import '../js/scene.js';
import '../js/breeze.js';
import '../js/presence.js';
import '../js/environment.js';
const { Clock, LivingSky: L } = globalThis;

// The flat tones a daytime cloud is painted in, read from the paint chain.
const [SHADOW, MID] = L.cloudPaints([0, 1, 0], 0)[0].tones;

test('a pinhole gap inside a cloud does not make an enclosed shadow pocket count as silhouette', () => {
    const w = 80, h = 60, n = w * h;
    const image = { width: w, height: h, data: new Uint8ClampedArray(n * 4) };
    const normals = new Float32Array(n * 3), covered = new Uint8Array(n).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hole = (x - 25) ** 2 + (y - 20) ** 2;
        const d = y > 48 || hole < 30 ? -0.6 : 0;
        normals.set([Math.sqrt(1 - d * d), d, 0], (y * w + x) * 3);
    }
    covered[20 * w + 25] = 0; // a gap in the gbuffer, enclosed by cloud
    L.paintCloud({ image, normals, covered, heights: new Float32Array(n).fill(1) }, L.cloudPaints([0,1,0], 0), 0, [0,0,0]);
    assert.equal(image.data[(20*w+26)*4], MID[0], 'the enclosed pocket is repainted as the flat midtone');
    assert.equal(image.data[55*w*4], SHADOW[0], 'the shadow along the real silhouette survives');
});

test('a shadow pocket joined to the base shadow by a thin neck is still painted out', () => {
    const w = 80, h = 60, n = w * h;
    const image = { width: w, height: h, data: new Uint8ClampedArray(n * 4) };
    const normals = new Float32Array(n * 3), covered = new Uint8Array(n).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pocket = (x - 25) ** 2 + (y - 20) ** 2 < 36, neck = x >= 25 && x <= 26 && y >= 20 && y <= 49;
        const d = y > 48 || pocket || neck ? -0.6 : 0;
        normals.set([Math.sqrt(1 - d * d), d, 0], (y * w + x) * 3);
    }
    L.paintCloud({ image, normals, covered, heights: new Float32Array(n).fill(1) }, L.cloudPaints([0,1,0], 0), 0, [0,0,0]);
    assert.equal(image.data[(20*w+25)*4], MID[0], 'the pocket is the flat midtone');
    assert.equal(image.data[(35*w+25)*4], MID[0], 'and so is its neck');
    assert.equal(image.data[55*w*4], SHADOW[0], 'the base shadow survives');
    assert.equal(image.data[(55*w+40)*4], SHADOW[0], 'across its whole width');
});

test('a small shadow notch on the silhouette is painted out next to the big base shadow', () => {
    const w = 80, h = 60, n = w * h;
    const image = { width: w, height: h, data: new Uint8ClampedArray(n * 4) };
    const normals = new Float32Array(n * 3), covered = new Uint8Array(n).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const notch = (x - 79) ** 2 + (y - 15) ** 2 < 196;
        const d = y > 40 || notch ? -0.6 : 0;
        normals.set([Math.sqrt(1 - d * d), d, 0], (y * w + x) * 3);
    }
    L.paintCloud({ image, normals, covered, heights: new Float32Array(n).fill(1) }, L.cloudPaints([0,1,0], 0), 0, [0,0,0]);
    assert.equal(image.data[(15*w+78)*4], MID[0], 'the notch is the flat midtone');
    assert.equal(image.data[50*w*4], SHADOW[0], 'the base shadow survives');
});

test('a gap reaching the sky through a thin slit is sealed and painted, not see-through', () => {
    const w = 80, h = 60, n = w * h;
    const image = { width: w, height: h, data: new Uint8ClampedArray(n * 4) };
    const normals = new Float32Array(n * 3), covered = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const body = (x - 40) ** 2 / 900 + (y - 30) ** 2 / 400 < 1;
        const gap = (x - 50) ** 2 + (y - 30) ** 2 < 25, slit = y >= 29 && y <= 30 && x >= 50;
        covered[y * w + x] = body && !gap && !slit ? 1 : 0;
        normals.set([0, 1, 0], (y * w + x) * 3);
    }
    L.paintCloud({ image, normals, covered, heights: new Float32Array(n).fill(1) }, L.cloudPaints([0,1,0], 0), 0, [0,0,0]);
    assert.equal(image.data[(30*w+50)*4+3], 255, 'the gap is painted');
    assert.equal(image.data[(30*w+50)*4], MID[0], 'as the flat midtone');
    assert.equal(image.data[3], 0, 'the real sky stays clear');
});

test('cloud painting removes isolated shadow islands and their orange seams', () => {
    const w = 80, h = 60, n = w * h;
    const image = { width: w, height: h, data: new Uint8ClampedArray(n * 4) };
    const normals = new Float32Array(n * 3), covered = new Uint8Array(n).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hole = (x - 25) ** 2 + (y - 20) ** 2;
        const d = y > 48 || hole < 16 ? -0.6 : hole < 30 ? -0.2 : 0;
        normals.set([Math.sqrt(1 - d * d), d, 0], (y * w + x) * 3);
    }
    L.paintCloud({ image, normals, covered, heights: new Float32Array(n).fill(1) }, L.cloudPaints([0,1,0], 0), 0, [0,0,0]);
    const mask = Array.from({ length: n }, (_, k) => image.data[k * 4] < 200);
    let islands = 0;
    for (let k = 0; k < n; k++) if (mask[k]) {
        const queue = [k]; mask[k] = false; let edge = false;
        for (const p of queue) {
            const x = p % w, y = Math.floor(p / w);
            edge ||= x === 0 || x === w - 1 || y === 0 || y === h - 1;
            for (const q of [x ? p-1 : -1, x<w-1 ? p+1 : -1, p-w, p+w])
                if (q >= 0 && q < n && mask[q]) { mask[q] = false; queue.push(q); }
        }
        if (!edge) islands++;
    }
    assert.equal(islands, 0, 'isolated dark islands');
    assert.deepEqual([...image.data.slice((20*w+25)*4, (20*w+25)*4+3)], MID);
    assert.equal(image.data[(20*w+30)*4], MID[0], 'removed seam uses the flat midtone');
    assert.equal(image.data[55*w*4], SHADOW[0], 'large connected shadow survives');
});

test('hanabi bursts are restricted to the evening window', () => {
    for (const hour of [0, 2.5, 12, 19.49, 23, 23.99])
        assert.equal(new L.Weather().sample(hour, 3).bursts.length, 0, String(hour));
    assert.ok(new L.Weather().sample(20, 3).bursts.length > 0);
});

test('sky uses softly joined wide color bands', () => {
    const scene = new L.Scene(new Clock({ time: 90 }), { count: 0 });
    scene.landscape.draw = () => {}; scene.weather.drawSky = scene.weather.drawGround = () => {};
    const stops = [], fills = [];
    const gradient = { addColorStop: (position, color) => stops.push([position, color]) };
    const g = { createLinearGradient: () => gradient, fillRect(...rect) { fills.push([this.fillStyle, rect]); },
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {} };
    scene.draw(g, 800, 600);
    assert.equal(fills.length, 1);
    assert.equal(fills[0][0], gradient);
    assert.ok(stops.length >= 3 && stops.length <= 9);
    assert.equal(stops[0][0], 0); assert.equal(stops.at(-1)[0], 1);
});

test('world previews preserve all civil hours and night sun stays below the horizon', () => {
    for (const time of ['00:00', '03:30', '05:00', '12:45', '23:59']) {
        const c = SummerWorld.LocalClock.fromQuery(new URLSearchParams({ time }));
        const hour = Number(time.slice(0, 2)) + Number(time.slice(3)) / 60;
        assert.ok(Math.abs(c.daylight.hour - hour) < 1e-9);
        assert.equal(c.paused, true);
        if (hour < 5 || hour > 22) assert.ok(c.daylight.sun[1] < 0);
    }
    const a = new SummerWorld.LocalClock({ now: () => new Date(2026, 6, 1, 23, 59, 59) });
    const b = new SummerWorld.LocalClock({ now: () => new Date(2026, 6, 2) });
    assert.ok(Math.hypot(...a.daylight.sun.map((v, i) => v - b.daylight.sun[i])) < 0.001);
    assert.equal(SummerWorld.LocalClock.fromQuery(new URLSearchParams('time=90')).time, 90);
});

test('weather fades to observations, stays active until settled and supports reduced motion', async () => {
    await import('../js/environment.js');
    const real = new SummerWorld.RealWeather(true);
    const weather = new SummerWorld.SeasonalWeather(new SummerWorld.Season(), real);
    assert.equal(weather.active, false);
    real.observation = { overcast: 0.8, rain: 0.6 };
    assert.equal(weather.active, true);
    weather.step(-1, false); assert.equal(weather.blend, 0);
    weather.step(0.1, false);
    assert.ok(weather.blend > 0 && weather.blend < 0.04);
    for (let i = 0; i < 400; i++) weather.step(0.1, false);
    assert.equal(weather.active, false);
    assert.equal(weather.sample(12, 0).rain, 0.6);
    const reduced = new SummerWorld.SeasonalWeather(new SummerWorld.Season(), real);
    reduced.step(0, true);
    assert.equal(reduced.sample(12, 0, true).overcast, 0.8);
    assert.equal(reduced.active, false);
});

test('local clock preserves midnight, follows civil time and freezes when paused', async () => {
    await import('../js/environment.js');
    let date = new Date(2026, 6, 8, 0, 25);
    const c = new SummerWorld.LocalClock({ now: () => date });
    assert.equal(c.daylight.hour, 25 / 60);
    date = new Date(2026, 6, 8, 12, 30); c.tick(1);
    assert.equal(c.daylight.hour, 12.5);
    c.paused = true; date = new Date(2026, 6, 8, 13); c.tick(2);
    assert.equal(c.daylight.hour, 12.5);
    c.seek(90); assert.equal(c.daylight.hour, 12);
});

test('civil sun and sky cover midnight without dawn clamping or a midnight jump', () => {
    const c = new SummerWorld.LocalClock({ now: () => new Date(2026, 6, 25, 2) });
    assert.ok(c.daylight.sun[1] < 0);
    assert.equal(c.progress, 2 / 24);
    const scene = new L.Scene(c, { count: 0 });
    const night = scene.skyColors();
    c.seek(c.duration / 2);
    assert.notDeepEqual(scene.skyColors(), night);
    const a = c.lightAt(1 - 1e-6), b = c.lightAt(1e-6);
    assert.ok(Math.hypot(...a.sun.map((v, i) => v - b.sun[i])) < 0.001);
    for (const hour of ['00:00', '02:30', '23:59']) {
        const fixed = SummerWorld.LocalClock.fromQuery(new URLSearchParams({ time: hour }));
        assert.equal(fixed.paused, true);
        assert.equal(fixed.local, false);
        assert.ok(Math.abs(fixed.daylight.hour - (Number(hour.slice(0, 2)) + Number(hour.slice(3)) / 60)) < 1e-10);
    }
});

test('season palettes are distinct and retain flat color regions', async () => {
    await import('../js/environment.js');
    const rainy = new SummerWorld.Season(new Date(2026, 5, 15));
    const high = new SummerWorld.Season(new Date(2026, 6, 25));
    const late = new SummerWorld.Season(new Date(2026, 8, 1));
    assert.equal(rainy.name, 'Rainy season');
    assert.equal(high.name, 'High summer'); assert.equal(late.name, 'Late summer');
    const c = [80, 150, 220];
    assert.notDeepEqual(rainy.apply(c), high.apply(c));
    assert.notDeepEqual(late.apply(c), high.apply(c));
    assert.deepEqual(rainy.apply(c), rainy.apply(c));
});

test('real weather is inert by default and rejects malformed observations', async () => {
    await import('../js/environment.js');
    const w = new SummerWorld.RealWeather();
    assert.equal(await w.load(), false);
    assert.equal(w.status, 'off');
    assert.throws(() => SummerWorld.RealWeather.parse({ current: { cloud_cover: null, precipitation: 0 } }));
    assert.throws(() => SummerWorld.RealWeather.parse({ current: { cloud_cover: 101, precipitation: 0 } }));
});

test('phone looking calibrates at the current pose and wraps angles gently', () => {
    const p = new Presence.Parallax();
    p.tilt(null, null);
    p.tilt(179, 12);
    assert.equal(p.targetX, 0); assert.equal(p.targetY, 0);
    p.tilt(-179, 27);
    assert.equal(p.targetX, 0.5);
    assert.ok(Math.abs(p.targetY - 2 / 30) < 1e-12);
    p.setReduced(true); p.tilt(40, -30);
    p.setReduced(false); p.tilt(40, -30);
    assert.equal(p.targetX, p.x, 'resuming calibrates without a jump');
    assert.equal(p.targetY, p.y);
});

test('chorus schedules actual gain, stereo and dusk pitch on an explicit audio timeline', async () => {
    const param = () => ({ value: 0, events: [], setTargetAtTime(...args) { this.events.push(args); } });
    const node = () => ({ gain: param(), frequency: param(), pan: param(), connect(n) { return n; }, start() {} });
    const chorus = new Presence.Chorus(() => ({ currentTime: 0, destination: {},
        createGain: node, createOscillator: node, createStereoPanner: node, async resume() {} }));
    chorus.update(18.5, 0.4);
    await chorus.enable(true);
    chorus.update(18.5, 0.4, 2);
    for (const voice of chorus.voices) {
        const expected = Presence.Chorus.sample(18.5, 2, voice.source, 0.4);
        assert.deepEqual(voice.gain.gain.events.at(-1), [expected[voice.kind] * 0.3, 2, 0.09]);
        assert.deepEqual(voice.pan.pan.events.at(-1), [expected.pan, 2, 0.3]);
        if (voice.kind === 'dusk') assert.equal(voice.oscillator.frequency.events.at(-1)[1], 2);
    }
    await chorus.enable(false); await chorus.enable(true);
    assert.equal(chorus.listener, 0.4, 'mute preserves listener position');
});

test('card keeps the paused scene awake until its easing settles', () => {
    const card = new Presence.Card();
    assert.equal(card.active, false);
    card.step(0.1, 1, 0);
    assert.equal(card.active, true);
    for (let i = 0; i < 100; i++) card.step(0.1, 1, 0);
    assert.equal(card.active, false);
    assert.ok(Math.abs(card.angle - 1.5) < 0.0001);
    card.step(0.1, -1, 0);
    card.setReduced(true);
    assert.equal(card.active, false);
});

test('hanging card eases its angle and freezes without snapping', () => {
    const card = new Presence.Card();
    card.step(0.1, 1, 2);
    assert.ok(card.angle > 0 && card.angle < 2);
    const angle = card.angle;
    card.setReduced(true);
    card.step(1, -1, 40);
    assert.equal(card.angle, angle);
    card.setReduced(false);
    card.step(0.01, -1, 40);
    assert.ok(Math.abs(card.angle - angle) < 0.1);
});

test('chorus remembers hidden state across sound opt-in and fades mute', async () => {
    const targets = [];
    const param = () => ({ value: 0, setTargetAtTime(value, time, ease) { targets.push({ value, time, ease }); } });
    const node = () => ({ gain: param(), frequency: param(), pan: param(), connect(n) { return n; }, start() {} });
    let created = 0;
    const chorus = new Presence.Chorus(() => {
        created++;
        return { currentTime: 1, destination: {}, createGain: node, createOscillator: node, createStereoPanner: node, async resume() {} };
    });
    chorus.silence(true);
    await chorus.enable(true);
    assert.equal(created, 1);
    assert.equal(targets[0].value, 0, 'hidden opt-in stays silent');
    chorus.silence(false);
    assert.equal(targets.at(-1).value, 0.12);
    await chorus.enable(false);
    assert.equal(targets.at(-1).value, 0);
    assert.ok(targets.every(t => t.ease > 0));
});

test('presence eases bounded parallax and freezes with reduced motion', () => {
    const p = new Presence.Parallax();
    p.point(4, -4); p.step(0.1);
    assert.ok(p.x > 0 && p.x < 1 && p.y < 0 && p.y > -1);
    const before = p.x; p.setReduced(true); p.point(-1, 1); p.step(1);
    assert.equal(p.x, before);
    assert.equal(p.active, false);
    p.setReduced(false); p.tilt(null, null); assert.ok(Number.isFinite(p.targetX));
});

test('cicada envelopes crossfade at dusk, wave, pan and attenuate by distance', () => {
    const sample = Presence.Chorus.sample;
    const near = { x: -0.8, distance: 1, phase: 0 };
    const day = sample(12, 1, near), dusk = sample(18.5, 1, near);
    assert.ok(day.day > 0 && day.dusk === 0 && dusk.dusk > dusk.day);
    assert.ok(day.pan < 0 && sample(12, 1, {...near, x: 0.8}).pan > 0);
    assert.ok(sample(12, 1, {...near, distance: 4}).day < day.day);
    assert.notEqual(sample(12, 7, near).day, day.day);
    assert.equal(sample(22, 1, near).day + sample(22, 1, near).dusk, 0);
    let created = 0; const chorus = new Presence.Chorus(() => { created++; });
    chorus.update(12); assert.equal(created, 0); assert.equal(chorus.enabled, false);
});

test('world clock can reach night without changing the stack day', () => {
    const c = Clock.fromQuery(new URLSearchParams('time=21:00'), { endHour: 22 });
    assert.equal(c.daylight.hour, 21);
    assert.equal(new Clock().endHour, 19.5);
});

test('shower clears to wet light and rainbow before dusk and hanabi', () => {
    const weather = new L.Weather();
    assert.equal(weather.sample(12, 0).rain, 0);
    assert.ok(weather.sample(15, 0).rain > 0.9);
    const clear = weather.sample(16.5, 0);
    assert.equal(clear.rain, 0); assert.ok(clear.wet > 0.5 && clear.rainbow > 0.5);
    assert.ok(weather.sample(19, 0).fireflies > 0.5);
    assert.equal(weather.sample(12, 3).bursts.length, 0);
    assert.ok(weather.sample(21, 3).bursts.length > 0);
    assert.deepEqual(weather.sample(21, 3), weather.sample(21, 3));
    assert.deepEqual(weather.sample(21, 3, true), weather.sample(21, 30, true));
    for (let hour = 6; hour < 22; hour += 0.01) {
        const a = weather.sample(hour, 0), b = weather.sample(hour + 0.01, 0);
        for (const key of ['rain','overcast','wet','rainbow','night','fireflies']) {
            assert.ok(a[key] >= 0 && a[key] <= 1);
            assert.ok(Math.abs(a[key] - b[key]) < 0.04, key);
        }
    }
});

test('hanabi light reaches cloud undersides, with no flash in reduced motion', () => {
    const weather = new L.Weather(), state = weather.sample(21, 3);
    const paint = new L.WeatherLight(state, 0.5);
    const base = paint.apply([100,100,100], {t:0.1});
    const top = paint.apply([100,100,100], {t:0.9});
    assert.ok(base[0] > top[0]);
    assert.equal(weather.sample(21, 3, true).glow, 0);
});

test('world cloud modifiers keep hard painted edges', () => {
    const chain = L.cloudPaints([0, 1, 0], 0);
    assert.equal(chain[1].hard, true);
    assert.equal(chain[2].hard, true);
});

test('pond taps are bounded, eased, expire and respect reduced motion', () => {
    const land = new L.Landscape();
    assert.equal(land.tap(0.1, 0.2), false);
    assert.equal(land.tap(0.65, 0.79), true);
    assert.equal(land.rings()[0].alpha, 0);
    land.step(0.1, false);
    assert.ok(land.rings()[0].alpha > 0);
    const radius = land.rings()[0].radius;
    land.step(0.1, false);
    assert.ok(land.rings()[0].radius > radius);
    for (let i = 0; i < 100; i++) land.step(0.1, false);
    assert.equal(land.active, false);
    for (let i = 0; i < 50; i++) land.tap(0.65, 0.79);
    assert.ok(land.ripples.length <= 12);
    land.step(0.1, true);
    assert.equal(land.active, false);
    assert.equal(land.tap(0.65, 0.79, true), false);
});

test('every civil minute from 07:00 to 19:30 gives duration-independent Sky sunlight', () => {
    let previous;
    for (let minutes = 7 * 60; minutes <= 19 * 60 + 30; minutes++) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        const clocks = [60, 180, 900].map(duration => Clock.fromQuery(new URLSearchParams({ time }), { duration }));
        const state = clocks[0].daylight;
        assert.ok(Math.abs(state.hour * 60 - minutes) < 1e-9, time);
        assert.ok(state.sun.every(Number.isFinite), time);
        assert.ok(Math.abs(Math.hypot(...state.sun) - 1) < 1e-12, time);
        const elevation = Math.asin(state.sun[1]), azimuth = Math.atan2(state.sun[2], state.sun[0]);
        Sky.sun(elevation, azimuth).forEach((v, i) => assert.ok(Math.abs(v - state.sun[i]) < 1e-12));
        for (const clock of clocks) {
            clock.tick(0); clock.tick(60000);
            assert.ok(Math.abs(clock.daylight.hour * 60 - minutes) < 1e-9, time);
            clock.daylight.sun.forEach((v, i) => assert.ok(Math.abs(v - state.sun[i]) < 1e-12));
        }
        if (previous) assert.ok(Math.hypot(...state.sun.map((v, i) => v - previous[i])) < 0.01, time);
        previous = state.sun;
    }
    const sky = new Sky();
    const noon = Clock.fromQuery(new URLSearchParams('time=12:00')).daylight.sun;
    const dusk = Clock.fromQuery(new URLSearchParams('time=19:30')).daylight.sun;
    assert.ok(sky.transmittance(noon).every(v => v > 0));
    assert.deepEqual(sky.transmittance(dusk), [0, 0, 0]);
    assert.notDeepEqual(sky.gradient(noon), sky.gradient(dusk));
});

test('clock parses civil time, retains elapsed seconds and rejects malformed URLs', () => {
    for (const [text, hour] of [['07:00', 7], ['12:00', 12], ['19:00', 19], ['19:30', 19.5]]) {
        const c = Clock.fromQuery(new URLSearchParams({ time: text }));
        assert.ok(Math.abs(c.daylight.hour - hour) < 1e-12);
        assert.equal(c.paused, true);
        assert.ok(Math.abs(Math.hypot(...c.daylight.sun) - 1) < 1e-12);
    }
    assert.equal(Clock.fromQuery(new URLSearchParams('time=90')).time, 90);
    for (const value of ['', '7:00', '24:00', '12:60', 'noon', 'Infinity', '12:00:00', '12:00\n', '90\n', '12:00\r', '12:00\u2028']) {
        const c = Clock.fromQuery(new URLSearchParams({ time: value }));
        assert.equal(c.time, 0); assert.equal(c.paused, false);
    }
    assert.equal(Clock.fromQuery(new URLSearchParams('time=00:00')).daylight.hour, 6);
    assert.equal(Clock.fromQuery(new URLSearchParams('time=23:59')).daylight.hour, 19.5);
    assert.equal(Clock.fromQuery(new URLSearchParams(), { paused: true }).paused, true);
    const c = Clock.fromQuery(new URLSearchParams('time=12:45'), { duration: 60 });
    assert.equal(c.time, 30);
    assert.ok(Clock.daylight(1).sun[1] < Clock.daylight(13 / 13.5).sun[1]);
});

test('world civil-time URLs initialize a paused scene and matching time controls', () => {
    const html = readFileSync(new URL('../studio/world.html', import.meta.url), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const time of ['00:00', '02:30', '03:30', '07:00', '12:45', '19:29', '19:30', '21:00', '22:00', '23:00', '23:59']) for (const reduced of [false, true]) {
        const elements = new Map();
        const element = id => {
            if (!elements.has(id)) elements.set(id, { style: {}, setAttribute() {}, append() {}, addEventListener() {}, getContext: () => ({}) });
            return elements.get(id);
        };
        let drawn;
        const window = {};
        runInNewContext(script, {
            URLSearchParams, location: { search: `?time=${time}` }, Clock, SummerWorld,
            LivingSky: { ...L, Scene: class extends L.Scene {
                draw() { drawn = this.snapshot(); return drawn; }
            } },
            Presence: globalThis.Presence, Breeze: globalThis.Breeze, window, document: { getElementById: element, createElement: () => element(Symbol()),
                querySelector: element, addEventListener() {}, documentElement: { dataset: {} } },
            matchMedia: () => ({ matches: reduced, addEventListener() {} }),
            devicePixelRatio: 1, innerWidth: 600, innerHeight: 450, addEventListener() {},
            requestAnimationFrame() { assert.fail('explicit time must stay paused'); }
        });
        const expected = SummerWorld.LocalClock.fromQuery(new URLSearchParams({ time }));
        assert.equal(window.world.clock.paused, true);
        assert.deepEqual(drawn.sun, expected.daylight.sun);
        assert.equal(element('hour').value, time);
        assert.equal(element('season').textContent.includes('Hanabi'), time >= '19:30' && time < '23:00', time);
        assert.equal(window.world.chorus.enabled, false);
        assert.equal(window.world.chorus.audio, undefined);
        assert.equal(element('play').textContent, 'Let the day pass');
        assert.equal(window.world.breeze.reduced, reduced);
        window.world.clock.tick(0); window.world.clock.tick(1000);
        assert.equal(window.world.clock.time, expected.time);
    }
});

test('breeze eases in, settles, and preserves displacement without reversing', () => {
    const b = new Breeze.Motion(); b.tap();
    assert.equal(b.wind, 0);
    b.step(0.1); assert.ok(b.wind > 0 && b.wind < 1);
    const early = b.drift;
    for (let i = 0; i < 200; i++) b.step(0.1);
    assert.ok(b.drift > early); assert.ok(b.wind < 0.001);
    b.hover(2); b.step(0.1); assert.ok(b.billow(2) > 0);
    for (let i = 0; i < 100; i++) b.step(0.1);
    assert.ok(b.billow(2) < 0.001);
});

test('holding a drag still dissipates momentum before release', () => {
    const b = new Breeze.Motion();
    b.begin(0, 0); b.move(100, 0, 0.1);
    for (let i = 0; i < 20; i++) b.step(0.1);
    b.end();
    const target = b.targetTurn;
    b.step(0.1);
    assert.ok(b.targetTurn - target < 0.001);
});

test('reduced motion scroll seeks directly without a residual animation', () => {
    const b = new Breeze.Motion(true), c = new Clock({ time: 90 });
    b.scroll(100, c);
    assert.equal(c.time, 93.5);
    assert.equal(c.paused, true);
    assert.equal(b.active, false);
});

test('drag has eased inertia, scroll clamps, reduced motion suppresses ambient gestures', () => {
    const b = new Breeze.Motion();
    b.begin(0, 0); b.move(100, 0, 0.1); b.step(0.1);
    assert.ok(b.turn > 0 && b.turn < b.targetTurn);
    assert.equal(b.end(), false);
    const before = b.turn; b.step(0.1); assert.ok(b.turn > before);
    const clock = new Clock({ time: 90, paused: true });
    b.scroll(100000, clock); for (let i = 0; i < 200; i++) b.step(0.1, clock);
    assert.ok(Math.abs(clock.time - 180) < 0.001);
    b.setReduced(true); const drift = b.drift, turn = b.turn;
    b.tap(); b.hover(2); b.step(0.1, clock);
    assert.equal(b.wind, 0); assert.equal(b.billow(2), 0);
    assert.equal(b.drift, drift); assert.equal(b.turn, turn);
    b.begin(1, 1); assert.equal(b.end(), true);
});

test('stack time URL shares the sun between Sky and every lit rendering mode', () => {
    const html = readFileSync(new URL('../studio/stack.html', import.meta.url), 'utf8');
    assert.ok(html.includes('src="../js/clock.js"'));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const time of ['07:00', '12:00', '19:30']) for (const mode of ['layers', 'painted', 'cel', 'mist']) {
        let rendered, skySun;
        const g = { setTransform() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
        runInNewContext(script, {
            URLSearchParams, location: { search: `?time=${time}&mode=${mode}&still&elevation=90&sun=0,1,0` },
            Stack: { ...Stack, draw(g, pile, cam, mode, opts) { rendered = { cam, opts }; } },
            Clock, Layers, LivingSky: L, window: { Layers },
            Sky: class extends Sky { gradient(sun, opts) { skySun = sun; return super.gradient(sun, opts); } },
            document: { getElementById: () => ({ getContext: () => g }) }, devicePixelRatio: 1, innerWidth: 600, innerHeight: 450
        });
        const expected = Clock.fromQuery(new URLSearchParams({ time })).daylight.sun;
        assert.deepEqual(skySun, expected);
        assert.deepEqual(rendered.opts.sun, expected);
        assert.equal(rendered.opts.time, undefined);
        if (mode !== 'layers') rendered.cam.toWorld(rendered.opts.light).forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-12));
    }
});

test('stack studio consumes camera URLs and preserves explicit zero-angle overrides', () => {
    const html = readFileSync(new URL('../studio/stack.html', import.meta.url), 'utf8');
    assert.ok(html.includes('src="../js/scene.js"'));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const name of Object.keys(L.CameraPreset.presets)) {
        for (const override of ['', '&theta=0&phi=0.2']) {
            let rendered;
            const g = { setTransform() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
            const canvas = { getContext: () => g };
            runInNewContext(script, {
                URLSearchParams, location: { search: `?camera=${name}&still${override}` },
                Stack: { ...Stack, draw(g, pile, cam, mode, opts) { rendered = { cam, opts }; } },
                Clock, Layers, Sky, LivingSky: L, window: { Layers },
                document: { getElementById: () => canvas }, devicePixelRatio: 1, innerWidth: 600, innerHeight: 450
            });
            const preset = new L.CameraPreset(name, { sun: Layers.styles.afternoon.sun });
            assert.equal(rendered.cam.theta, override ? 0 : preset.theta);
            assert.equal(rendered.cam.phi, override ? 0.2 : preset.phi);
            assert.equal(rendered.opts.camera, undefined);
            if (name === 'backlit') {
                const worldLight = rendered.cam.toWorld(rendered.opts.light);
                Layers.styles.afternoon.sun.forEach((v, i) => assert.ok(Math.abs(worldLight[i] - v) < 1e-12));
            }
        }
    }
});

test('camera sky azimuth and viewer light agree with world-space sunlight', () => {
    for (const name of Object.keys(L.CameraPreset.presets)) {
        const sun = Sky.sun(0.3, 2), preset = new L.CameraPreset(name, { sun });
        for (const theta of [preset.theta, 0, -1.2]) {
            const cam = Stack.camera({ theta });
            const light = preset.viewerLight(sun, theta);
            cam.toWorld(light).forEach((v, i) => assert.ok(Math.abs(v - sun[i]) < 1e-12));
            const azimuth = Math.atan2(sun[2], sun[0]) + preset.skyAzimuth(sun, theta);
            const forward = cam.toWorld([0, 0, 1]);
            assert.ok(Math.abs(Math.cos(azimuth) - forward[0]) < 1e-12);
            assert.ok(Math.abs(Math.sin(azimuth) - forward[2]) < 1e-12);
        }
    }
});

test('camera presets are distinct, validated, and fit every bounding corner', () => {
    assert.deepEqual(Object.keys(L.CameraPreset.presets), ['front', 'three-quarter', 'low', 'aerial', 'backlit']);
    assert.throws(() => new L.CameraPreset('unknown'), /camera/i);
    assert.throws(() => new L.CameraPreset('toString'), /camera/i);
    const B = Stack.bounds(Stack.shapes.cumulus(5));
    const angles = new Set();
    for (const name of Object.keys(L.CameraPreset.presets)) {
        const preset = new L.CameraPreset(name);
        angles.add(`${preset.theta},${preset.phi}`);
        for (const [w, h] of [[280, 200], [390, 844], [1200, 600]]) {
            const cam = preset.frame(B, w, h);
            for (const x of [B.x0, B.x1]) for (const y of [0, B.top]) for (const z of [B.z0, B.z1]) {
                const p = cam.project(x, y, z);
                assert.ok(p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h, name);
            }
            const [a,b,c,d] = cam.matrix(0);
            assert.ok(Math.abs(a*d-b*c) > 1e-6, name);
        }
    }
    assert.equal(angles.size, 5);
    assert.ok(new L.CameraPreset('low').phi < new L.CameraPreset('front').phi);
    assert.ok(new L.CameraPreset('aerial').phi > 1);
    const sun = Sky.sun(0.3, 2);
    const back = new L.CameraPreset('backlit', { sun });
    assert.ok(Math.sin(back.theta)*sun[0] + Math.cos(back.theta)*sun[2] > 0.95);
});

test('scene switches cameras, clears geometry caches, and draws the prepared image', () => {
    const scene = new L.Scene(new Clock({ time: 40 }), { count: 1, camera: 'front' });
    const image = { data: new Uint8ClampedArray(4) };
    let drawn = false;
    scene.prepare = () => ({ canvas: {}, image, normals: [0,1,0], heights: [1], covered: [1],
        g: { putImageData(value) { assert.equal(value, image); drawn = true; } } });
    const g = { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
        save() {}, restore() {}, scale() {}, translate() {}, ellipse() {}, clip() {}, stroke() {}, quadraticCurveTo() {} };
    scene.draw(g, 600, 450);
    assert.ok(drawn);
    assert.ok(scene.clouds[0].cache);
    scene.setCamera('aerial');
    assert.equal(scene.camera.name, 'aerial');
    assert.equal(scene.clouds[0].cache, undefined);
    assert.throws(() => scene.setCamera('invalid'));
    assert.equal(scene.camera.name, 'aerial');
    scene.draw(g, 600, 450);
});

test('one clock advances, pauses, seeks, clamps and ignores background gaps', () => {
    const c = new Clock(); c.tick(0); c.tick(50); assert.equal(c.time, 0.05);
    c.paused = true; c.tick(100); assert.equal(c.time, 0.05);
    c.paused = false; c.tick(10000); assert.ok(Math.abs(c.time - 0.15) < 1e-9);
    c.seek(179.95); c.tick(0); c.tick(100); assert.equal(c.time, 180);
    c.seek(-1); assert.equal(c.time, 0);
    assert.throws(() => c.seek(NaN)); assert.throws(() => new Clock({ duration: 0 }));
});
test('clouds form, grow, then dissolve with zero opacity at recycling', () => {
    assert.equal(L.lifecycle(0).opacity, 0); assert.equal(L.lifecycle(1).opacity, 0);
    assert.ok(L.lifecycle(0.1).growth < L.lifecycle(0.5).growth);
    assert.equal(L.lifecycle(0.5).opacity, 1);
    assert.ok(L.lifecycle(0.9).opacity < L.lifecycle(0.7).opacity);
    const c = { offset: 0, life: 80, x: 0.4, y: 0.5, travel: 0.4 };
    assert.ok(L.cloudState(c, 30).x > L.cloudState(c, 20).x);
    assert.ok(L.cloudState(c, 80 - 1e-4).opacity < 1e-8);
    assert.ok(L.cloudState(c, 80 + 1e-4).opacity < 1e-8);
});
test('depth haze monotonically removes contrast toward the sky', () => {
    assert.equal(L.haze(0), 0);
    assert.ok(L.haze(0.9) > L.haze(0.2)); assert.ok(L.haze(0.9) < 1);
});
test('morning through dusk share a continuous sun and exact day endpoints', () => {
    assert.equal(L.daylight(0).hour, 6); assert.equal(L.daylight(1).hour, 19.5);
    assert.ok(L.daylight(0.5).sun[1] > L.daylight(0).sun[1]);
    assert.ok(L.daylight(1).sun[1] < 0);
    assert.ok(L.daylight(1).warmth > L.daylight(0.5).warmth);
    for (let i = 1; i <= 1000; i++) {
        const a = L.daylight((i - 1) / 1000).sun, b = L.daylight(i / 1000).sun;
        assert.ok(Math.hypot(...a.map((v, k) => v - b[k])) < 0.01);
    }
});
test('seeking is deterministic and every cloud reads the shared clock', () => {
    const clock = new Clock(), scene = new L.Scene(clock);
    clock.seek(40); const a = scene.snapshot();
    clock.seek(90); assert.notDeepEqual(scene.snapshot(), a);
    clock.seek(40); assert.deepEqual(scene.snapshot(), a);
    for (let t = 0; t <= 180; t += 2) {
        clock.seek(t);
        const s = scene.snapshot();
        assert.ok(s.clouds.filter(c => c.opacity > 0.2).length >= 3);
        assert.ok(s.clouds.every((c, i) => i === 0 || c.depth <= s.clouds[i - 1].depth));
    }
});

test('a cloud stays a drawing: flat band tones, not a smooth ramp of shades', () => {
    // A sphere's worth of normals facing every way, as a cloud's surface does.
    const n = 4000, normals = new Float32Array(n * 3), heights = new Float32Array(n).fill(1), covered = new Uint8Array(n).fill(1);
    for (let i = 0; i < n; i++) {
        const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z), a = i * 2.39996;
        normals.set([r * Math.cos(a), z, r * Math.sin(a)], i * 3);
    }
    for (const [hour, p] of [['noon', 0.5], ['dusk', 0.97]]) {
        const { sun, warmth } = L.daylight(p);
        const image = { data: new Uint8ClampedArray(n * 4) };
        L.paintCloud({ image, normals, heights, covered }, L.cloudPaints(sun, warmth), 0, [0, 0, 0]);
        const counts = new Map();
        for (let i = 0; i < n; i++) { const k = image.data.slice(i * 4, i * 4 + 3).join(); counts.set(k, (counts.get(k) || 0) + 1); }
        const top3 = [...counts.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
        // Three tones cover nearly all of it; only the thin terminator seam blends.
        assert.ok(top3 / n > 0.85, `${hour}: three tones cover ${(top3 / n).toFixed(2)}, ${counts.size} colours`);
    }
});

test('far clouds pale but keep their shape', () => {
    assert.ok(L.haze(5) < 0.65, 'haze never washes a cloud fully into the sky');
});

test('scene breeze moves clouds without moving the sun; billow and view affect framing', () => {
    const motion = new Breeze.Motion(), scene = new L.Scene(new Clock({ time: 70 }), { motion });
    const a = scene.snapshot(); motion.tap(); motion.hover(a.clouds[0].seed);
    for (let i = 0; i < 10; i++) motion.step(0.1);
    const b = scene.snapshot();
    assert.deepEqual(a.sun, b.sun);
    assert.ok(b.clouds[0].x > a.clouds[0].x);
    assert.ok(b.clouds[0].growth > a.clouds[0].growth);
    motion.turn = 0.2;
    assert.notEqual(scene.snapshot().clouds[0].x, b.clouds[0].x);
});

test('furin stays uncreated until opt-in and mute prevents strikes', async () => {
    let created = 0, strikes = 0;
    const param = { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const node = () => ({ gain: { ...param }, frequency: { ...param }, connect(n) { return n; }, disconnect() {}, start() { strikes++; }, stop() {} });
    const furin = new Breeze.Furin(() => { created++; return { currentTime: 1, destination: {}, createGain: node, createOscillator: node, async resume() {} }; });
    assert.equal(furin.ring(), false); assert.equal(created, 0);
    await furin.enable(true); assert.equal(furin.ring(), true); assert.equal(strikes, 4);
    await furin.enable(false); assert.equal(furin.ring(), false);
});
