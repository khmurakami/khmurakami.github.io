/*
 * soundscape.js — what you hear in the room, by the hour and the season, and the radio.
 *
 * Everything is made live in Web Audio (no recordings), on top of the stage's
 * sound (js/stage.js): its wind, its master volume and its sound button.
 *
 *   summer   cicadas by day, higurashi at dusk, frogs and bell crickets at night
 *   spring   the bush warbler and small birds by day, a few frogs at night
 *   autumn   birds by day, bell crickets and pine crickets from dusk
 *   winter   a harder wind, and a temple bell far off at night
 *
 * The radio has three stations, tuned by tapping it: lo-fi, a baseball game,
 * a summer festival. It plays through a little speaker: band-limited, a touch
 * of grit, off to the side the radio sits on.
 *
 *   Stage.Sound.scape.season / .hour     set by the scene
 *   Stage.Sound.scape.tune()             next station; returns its name ('' when off)
 *   Stage.Sound.scape.thump()            a mochi mallet, for the moon
 */
(function () {
    'use strict';
    const Sound = window.Stage && window.Stage.Sound;
    if (!Sound) return;
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    const STATIONS = ['', 'lo-fi', 'baseball', 'festival'];
    const scape = {
        season: 'summer', hour: 15, station: 0, pan: 0.55,
        next: {}, bus: null, noise: null,
        get stationName() { return STATIONS[this.station]; },
        tune() {
            this.station = (this.station + 1) % STATIONS.length;
            if (this.station && !Sound.on) { const b = document.getElementById('sound'); if (b) b.click(); else Sound.set(true); }
            if (Sound.ac) { radio(); staticBurst(); this.music = { at: Sound.ac.currentTime + 0.4, step: 0 }; }
            return this.stationName;
        },
        thump() { if (Sound.on && Sound.ac) mallet(Sound.ac.currentTime); },
        // Little sounds for touches: a drop in the paddies, a bite, the plate set down.
        sfx(name, far = 10) {
            if (!Sound.on || !Sound.ac) return;
            const t = Sound.ac.currentTime, quiet = Math.min(1, 14 / far);
            if (name === 'plip') {
                tone(t, rand(620, 760), { peak: 0.05 * quiet, attack: 0.002, decay: 0.09, glide: rand(1300, 1600) });
                tone(t + 0.07, rand(900, 1100), { peak: 0.018 * quiet, attack: 0.002, decay: 0.06, glide: 1700 });
            } else if (name === 'bite') {
                hiss(t, { peak: 0.05, decay: 0.05, f: 2600, q: 0.9 });
                hiss(t + 0.06, { peak: 0.035, decay: 0.04, f: 2200, q: 0.9 });
            } else if (name === 'gust') {
                const s = far, pan = arguments[2] < 0 ? -0.35 : 0.35;
                hiss(t, { peak: 0.05 * s, attack: 0.22, hold: 0.12, decay: 1.1, f: 320, q: 0.6, sweep: 1100, pan });
                hiss(t + 0.08, { peak: 0.018 * s, attack: 0.3, decay: 0.9, type: 'highpass', f: 2400, pan: -pan });
            } else if (name === 'plate') {
                tone(t, 1250, { peak: 0.02, decay: 0.25 }); tone(t, 1870, { peak: 0.01, decay: 0.18 });
            } else if (name === 'coin') {
                // A coin into the slot: two bright blips, then it rattles down inside.
                tone(t, 1319, { type: 'square', peak: 0.018, decay: 0.07 });
                tone(t + 0.07, 1976, { type: 'square', peak: 0.018, decay: 0.22 });
                hiss(t + 0.12, { peak: 0.02, decay: 0.05, f: 3200, q: 2 });
                hiss(t + 0.2, { peak: 0.012, decay: 0.04, f: 2800, q: 2 });
            } else if (name === 'crane-step') {
                tone(t, 98, { type: 'square', peak: 0.012, decay: 0.08 });
            } else if (name === 'crane-drop') {
                tone(t, 880, { type: 'square', peak: 0.012, decay: 0.5, glide: 220 });
            } else if (name === 'crane-grab') {
                hiss(t, { peak: 0.04, decay: 0.05, f: 1800, q: 1.2 });
                tone(t + 0.02, 330, { type: 'square', peak: 0.012, decay: 0.12 });
            } else if (name === 'crane-win') {
                [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, { type: 'square', peak: 0.016, decay: i === 5 ? 0.5 : 0.1 }));
            }
        }
    };
    Sound.scape = scape;

    // ── Building blocks ───────────────────────────────────────────────────
    const ac = () => Sound.ac;
    function noiseBuf() {
        if (scape.noise) return scape.noise;
        const a = ac(), len = a.sampleRate * 2, b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return (scape.noise = b);
    }
    /** Where a sound goes: panned, into the master (or the radio). */
    function out(node, pan = 0, to = Sound.master) {
        const a = ac();
        if (a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p).connect(to); }
        else node.connect(to);
    }
    function env(t, peak, attack, decay, hold = 0) {
        const g = ac().createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + attack);
        if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
        return g;
    }
    function tone(t, f, { type = 'sine', peak = 0.05, attack = 0.005, decay = 0.3, hold = 0, pan = 0, to, glide, am, amDepth = 1 } = {}) {
        const a = ac(), o = a.createOscillator(), g = env(t, peak, attack, decay, hold);
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + attack + hold + decay);
        let src = o;
        if (am) {
            const m = a.createGain(), lfo = a.createOscillator(), depth = a.createGain();
            m.gain.value = 1 - amDepth / 2; lfo.frequency.value = am; depth.gain.value = amDepth / 2;
            lfo.connect(depth).connect(m.gain); o.connect(m); src = m;
            lfo.start(t); lfo.stop(t + attack + hold + decay + 0.05);
        }
        src.connect(g); out(g, pan, to);
        o.start(t); o.stop(t + attack + hold + decay + 0.05);
    }
    function hiss(t, { peak = 0.05, attack = 0.002, decay = 0.1, hold = 0, type = 'bandpass', f = 1000, q = 1, pan = 0, to, sweep } = {}) {
        const a = ac(), s = a.createBufferSource(), fl = a.createBiquadFilter(), g = env(t, peak, attack, decay, hold);
        s.buffer = noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
        if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + attack + hold + decay);
        s.connect(fl).connect(g); out(g, pan, to);
        s.start(t, Math.random() * 1.5); s.stop(t + attack + hold + decay + 0.05);
    }

    // ── The world outside ─────────────────────────────────────────────────
    /** Higurashi: the evening cicada, kana-kana-kana, falling away. */
    function higurashi(t) {
        const f0 = rand(4200, 4700), pan = rand(-0.8, 0.8), n = 10 + Math.floor(rand(0, 6));
        for (let i = 0; i < n; i++) tone(t + i * 0.17, f0 * (1 - i * 0.008), { peak: 0.012 * (1 - i / (n + 4)), attack: 0.02, decay: 0.12, am: 38, pan });
    }
    /** Suzumushi, the bell cricket: riiin, riiin. */
    function bellCricket(t) {
        const f = rand(4300, 4700), pan = rand(-0.9, 0.9);
        for (let i = 0; i < 2 + Math.floor(rand(0, 3)); i++) tone(t + i * 0.75, f, { peak: 0.008, attack: 0.03, hold: 0.35, decay: 0.15, am: 30, pan });
    }
    /** Matsumushi, the pine cricket: chin-chiro-rin. */
    function pineCricket(t) {
        const f = rand(3300, 3700), pan = rand(-0.9, 0.9);
        [[0, 1], [0.12, 1.06], [0.22, 1], [0.34, 1.04]].forEach(([d, k]) => tone(t + d, f * k, { peak: 0.007, attack: 0.005, decay: 0.08, pan }));
    }
    /** A paddy frog: two or three quick croaks. */
    function frog(t) {
        const f = rand(380, 700), pan = rand(-1, 1);
        for (let i = 0; i < 2 + Math.floor(rand(0, 2)); i++) tone(t + i * 0.09, f, { type: 'square', peak: 0.006, attack: 0.004, decay: 0.05, am: 80, pan, glide: f * 0.85 });
    }
    /** Uguisu, the bush warbler: a long hoo, then ho-ke-kyo. */
    function uguisu(t) {
        const pan = rand(-0.9, 0.9);
        tone(t, 1250, { peak: 0.018, attack: 0.15, hold: 0.7, decay: 0.15, glide: 1420, pan });
        tone(t + 1.25, 2300, { peak: 0.018, attack: 0.01, decay: 0.12, glide: 2700, pan });
        tone(t + 1.42, 2800, { peak: 0.016, attack: 0.01, decay: 0.08, glide: 2400, pan });
        tone(t + 1.56, 2600, { peak: 0.018, attack: 0.02, hold: 0.25, decay: 0.2, glide: 1900, pan });
    }
    /** A small bird: a couple of quick falling chirps. */
    function chirp(t) {
        const f = rand(3500, 5200), pan = rand(-1, 1);
        for (let i = 0; i < 2 + Math.floor(rand(0, 3)); i++) tone(t + i * rand(0.08, 0.14), f, { peak: 0.008, attack: 0.004, decay: 0.05, glide: f * 0.6, pan });
    }
    /** A temple bell, far off: a low strike with its inharmonic partials, ringing on. */
    function templeBell(t) {
        for (const [m, a] of [[1, 1], [2.03, 0.5], [2.76, 0.35], [4.07, 0.2], [5.42, 0.1]]) tone(t, 92 * m, { peak: 0.04 * a, attack: 0.01, decay: 9 / Math.sqrt(m), pan: -0.3 });
        hiss(t, { peak: 0.02, decay: 0.08, f: 400, q: 2, pan: -0.3 });
    }

    /** What sings at this hour of this season, each with how often (seconds between). */
    function voices(season, h) {
        const day = h >= 6.5 && h < 17.3, dusk = h >= 17.3 && h < 19.5, night = !day && !dusk, dawn = h >= 4.8 && h < 7.5;
        const v = [];
        if (dawn) v.push(['chirp', chirp, 4, 9]);
        if (season === 'summer') {
            if (day) v.push(['cicada', () => Sound.cicada(), 5, 12]);
            if (dusk || (h >= 16 && h < 17.3)) v.push(['higurashi', higurashi, 7, 14]);
            if (night || dusk) v.push(['frog', frog, 0.3, 1.6], ['bell', bellCricket, 3, 7]);
        } else if (season === 'spring') {
            if (day) v.push(['uguisu', uguisu, 18, 40], ['chirp', chirp, 5, 12]);
            if (night) v.push(['frog', frog, 1.2, 4]);
        } else if (season === 'autumn') {
            if (day) v.push(['chirp', chirp, 8, 18]);
            if (night || dusk) v.push(['bell', bellCricket, 2, 5], ['pine', pineCricket, 3, 8]);
        } else if (night) v.push(['temple', templeBell, 35, 70]);
        return v;
    }

    // ── The radio ─────────────────────────────────────────────────────────
    /** The little speaker: thin, a touch of grit, over where the radio sits. */
    function radio() {
        if (scape.bus) return scape.bus;
        const a = ac(), g = a.createGain(), hp = a.createBiquadFilter(), lp = a.createBiquadFilter(), sh = a.createWaveShaper();
        g.gain.value = 0.55; hp.type = 'highpass'; hp.frequency.value = 280; lp.type = 'lowpass'; lp.frequency.value = 3600;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 1.6); }
        sh.curve = curve;
        g.connect(hp).connect(lp).connect(sh);
        out(sh, scape.pan);
        return (scape.bus = g);
    }
    function staticBurst() { hiss(ac().currentTime, { peak: 0.06, attack: 0.01, hold: 0.25, decay: 0.15, f: 1800, q: 0.4, to: radio() }); }

    // Drums, for every station.
    const kick = (t, peak = 0.22) => tone(t, 150, { peak, attack: 0.002, decay: 0.28, glide: 42, to: radio() });
    const snare = (t, peak = 0.08) => { hiss(t, { peak, decay: 0.14, f: 1900, q: 0.8, to: radio() }); tone(t, 190, { peak: peak * 0.6, decay: 0.08, to: radio() }); };
    const hat = (t, peak = 0.025) => hiss(t, { peak, decay: 0.035, type: 'highpass', f: 7000, to: radio() });
    const taiko = (t, peak = 0.3) => { tone(t, 95, { peak, attack: 0.003, decay: 0.5, glide: 60, to: radio() }); hiss(t, { peak: peak * 0.2, decay: 0.05, f: 300, to: radio() }); };
    const kane = t => { for (const m of [1, 1.47, 2.31]) tone(t, 1900 * m, { peak: 0.02, decay: 0.22, to: radio() }); };
    function mallet(t) {
        tone(t, 130, { peak: 0.12, attack: 0.002, decay: 0.16, glide: 70 });
        hiss(t, { peak: 0.04, decay: 0.05, f: 700, q: 1.5 });
    }

    /** An electric piano note: a bell-ish sine with a soft overtone. */
    const ep = (t, m, peak = 0.035, decay = 1.8) => { tone(t, hz(m), { peak, attack: 0.008, decay, to: radio() }); tone(t, hz(m) * 2, { peak: peak * 0.18, type: 'triangle', attack: 0.004, decay: decay * 0.4, to: radio() }); };

    // Lo-fi: ii-V-I-vi in C, 76 bpm, swung hats, a kick that lags behind the beat.
    const CHORDS = [[38, [53, 57, 60, 64]], [43, [53, 57, 59, 64]], [36, [52, 55, 59, 62]], [33, [55, 60, 64, 67]]];
    const PENTA = [72, 74, 76, 79, 81, 84];
    function lofi(t, step) {
        const bar = Math.floor(step / 16) % 4, s = step % 16, [bass, chord] = CHORDS[bar];
        if (s === 0 || s === 10) chord.forEach((m, i) => ep(t + i * 0.025, m, s ? 0.022 : 0.03));
        if (s === 0 || s === 8) tone(t, hz(bass), { peak: 0.09, attack: 0.01, decay: 0.7, to: radio() });
        if (s === 0 || s === 7 || s === 10) kick(t + 0.01);
        if (s === 4 || s === 12) snare(t + 0.015, 0.06);
        if (s % 2 === 0) hat(t + (s % 4 === 2 ? 0.03 : 0), s % 4 ? 0.015 : 0.022);
        if ((s === 3 || s === 6 || s === 13) && Math.random() < 0.5) ep(t, pick(PENTA), 0.02, 1.1);
        if (Math.random() < 0.04) hiss(t, { peak: 0.03, decay: 0.01, type: 'highpass', f: 3000, to: radio() });   // a crackle in the vinyl
    }

    // Baseball: the crowd murmuring, now and then the crack of the bat and a roar, and the cheering band.
    const FANFARE = [67, 67, 72, 0, 67, 72, 76, 0, 74, 72, 74, 76, 79, 0, 0, 0];
    function baseball(t, step) {
        const s = step % 64;
        if (step % 4 === 0) hiss(t, { peak: rand(0.03, 0.05), attack: 0.2, hold: 0.2, decay: 0.4, f: rand(700, 1100), q: 0.7, to: radio() });
        if (Math.random() < 0.006) {
            hiss(t, { peak: 0.18, decay: 0.03, type: 'highpass', f: 2500, to: radio() });
            hiss(t + 0.15, { peak: 0.12, attack: 0.6, hold: 0.8, decay: 2.2, f: 900, q: 0.5, to: radio() });
        }
        if (s < 16 && FANFARE[s]) tone(t, hz(FANFARE[s]), { type: 'square', peak: 0.02, attack: 0.01, hold: 0.08, decay: 0.08, to: radio() });
        if (s < 16 && s % 2 === 0) taiko(t, 0.12);
    }

    // The festival: taiko (don, don, doko don), a small gong, and the shinobue playing in the minyo scale.
    const FUE = [74, 77, 79, 81, 79, 77, 74, 72, 74, 0, 81, 84, 81, 79, 77, 0];
    function festival(t, step) {
        const s = step % 16;
        if ([0, 4, 8, 10, 12].includes(s)) taiko(t, s === 0 ? 0.32 : 0.22);
        if (s === 6 || s === 14) kane(t);
        const m = FUE[Math.floor(step / 2) % 16];
        if (step % 2 === 0 && m) {
            tone(t, hz(m), { peak: 0.03, attack: 0.04, hold: 0.18, decay: 0.12, am: 5.5, amDepth: 0.25, to: radio() });
            hiss(t, { peak: 0.006, attack: 0.04, hold: 0.18, decay: 0.1, f: hz(m) * 2, q: 3, to: radio() });
        }
    }
    const STEP = { 1: 60 / 76 / 4, 2: 0.25, 3: 60 / 112 / 2 };
    const PLAY = { 1: lofi, 2: baseball, 3: festival };

    // ── The chime, tuned ──────────────────────────────────────────────────
    // C D E G A, two octaves up: each strike a step or two from the last, so the breeze plays a tune.
    const CHIME = [2093, 2349, 2637, 3136, 3520, 4186];
    let ci = 2;
    Sound.ring = function (strength) {
        if (!this.on || !this.ac) return;
        ci = Math.max(0, Math.min(CHIME.length - 1, ci + pick([-2, -1, -1, 1, 1, 2])));
        const now = this.ac.currentTime, f = CHIME[ci];
        for (const [m, a] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) tone(now, f * m, { peak: 0.05 * a * Math.min(1, strength), attack: 0.004, decay: 2.8 / Math.sqrt(m), pan: -0.35 });
    };

    // ── Every frame ───────────────────────────────────────────────────────
    const tick = Sound.tick.bind(Sound);
    Sound.tick = function (w) {
        tick(w);
        if (!this.on || !this.ac) return;
        const now = this.ac.currentTime;
        if (scape.season === 'winter') this.windGain.gain.setTargetAtTime(0.04 + w * 0.09, now, 0.6);
        for (const [name, play, lo, hi] of voices(scape.season, scape.hour)) {
            if (scape.next[name] == null) scape.next[name] = now + rand(0.5, hi);
            if (now > scape.next[name]) { play(now + 0.05); scape.next[name] = now + rand(lo, hi); }
        }
        if (scape.station) {
            const m = scape.music || (scape.music = { at: now + 0.1, step: 0 });
            if (m.at < now - 1) m.at = now + 0.05;   // back from a hidden tab: start again, don't catch up
            while (m.at < now + 0.25) { PLAY[scape.station](m.at, m.step); m.step++; m.at += STEP[scape.station]; }
        }
    };
})();
