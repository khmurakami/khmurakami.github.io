// Shared pieces of the room: the engine globals, maths helpers, the room in metres, the clock.

'use strict';
const Stage = window.Stage;
const { Clock, Stack, Pixel } = window;
const { Ramp, Sprite } = Pixel;
const LS = window.LivingSky;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = Stack.rng;

// The room, in metres (as tatami-world).
const R = {
    half: 2.7, zT: 3.6, beam: 2.2, ceil: 2.5, shoji: 1.95,
    engawaZ: 4.7, eaveZ: 5.0, eaveH: 2.18, ground: -0.45
};


const query = new URLSearchParams(location.search);
const clock = query.has('time') ? Clock.fromQuery(query) : new Clock({ paused: true, time: ((15 - 6) / 13.5) * 180 });
const chime = Stage.makeChime();

export { Clock, LS, Pixel, R, Ramp, Sprite, Stack, Stage, TAU, chime, clamp, clock, lerp, query, rng };
