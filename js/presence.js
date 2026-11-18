/* Studio presence: bounded looking and entirely synthesized summer insects. */
(function (root) {
    'use strict';
    const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
    const ease = v => { v = clamp(v); return v * v * (3 - 2 * v); };
    class Parallax {
        constructor(reduced = false) { this.x = this.y = this.targetX = this.targetY = 0; this.reduced = reduced; }
        setReduced(value) { this.reduced = value; this.pose = null; if (value) { this.targetX = this.x; this.targetY = this.y; } }
        point(x, y) {
            if (this.reduced || !Number.isFinite(x) || !Number.isFinite(y)) return;
            this.targetX = clamp(x, -1, 1); this.targetY = clamp(y, -1, 1);
        }
        tilt(beta, gamma) {
            if (this.reduced || !Number.isFinite(beta) || !Number.isFinite(gamma)) return;
            // The visitor's first valid holding angle is neutral, including after
            // reduced motion. Short angular differences avoid a jump at +/-180.
            if (!this.pose) this.pose = { beta, gamma, x: this.x, y: this.y };
            const delta = (a, b) => ((a - b + 540) % 360) - 180;
            this.point(this.pose.x + delta(gamma, this.pose.gamma) / 30,
                this.pose.y + delta(beta, this.pose.beta) / 30);
        }
        step(dt) {
            if (this.reduced) return;
            const a = 1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) * 3);
            this.x += (this.targetX - this.x) * a; this.y += (this.targetY - this.y) * a;
        }
        get active() { return !this.reduced && Math.hypot(this.targetX - this.x, this.targetY - this.y) > 0.0001; }
    }
    class Card {
        constructor(reduced = false) { this.angle = this.target = 0; this.reduced = reduced; }
        setReduced(value) { this.reduced = value; }
        step(dt, look, time) {
            if (this.reduced) return;
            this.target = look * 1.5 + Math.sin(time * 0.7) * 0.55;
            this.angle += (this.target - this.angle) * (1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) * 3));
        }
        get active() { return !this.reduced && Math.abs(this.target - this.angle) > 0.0001; }
    }
    class Chorus {
        constructor(factory = () => new (root.AudioContext || root.webkitAudioContext)()) {
            this.factory = factory; this.enabled = false; this.hidden = false; this.voices = []; this.hour = 12; this.listener = 0;
        }
        static sample(hour, time, source, listener = 0) {
            const dusk = ease((hour - 16.8) / 1.5) * (1 - ease((hour - 19) / 1.5));
            const day = ease((hour - 6) / 2) * (1 - ease((hour - 16.5) / 2));
            const distance = Math.hypot(Math.max(0.2, source.distance), source.x - listener);
            const wave = (0.5 + 0.5 * Math.sin(time * 0.48 + source.phase)) ** 2;
            const call = (0.5 + 0.5 * Math.sin(time * 4.2 + source.phase)) ** 6;
            return { day: day * (0.12 + 0.88 * wave) / (1 + distance * distance),
                dusk: dusk * call / (1 + distance * distance), pan: clamp((source.x - listener) / distance, -1, 1) };
        }
        async enable(value) {
            if (value && !this.audio) {
                const a = this.audio = this.factory();
                this.master = a.createGain(); this.master.gain.value = 0; this.master.connect(a.destination);
                for (const [i, x] of [-0.85, 0.75, -0.4, 0.95].entries()) {
                    const source = { x, distance: 1 + i * 0.7, phase: i * 1.8 };
                    for (const kind of ['day', 'dusk']) {
                        const oscillator = a.createOscillator(), gain = a.createGain(), pan = a.createStereoPanner();
                        const trill = a.createOscillator(), modulation = a.createGain();
                        oscillator.type = kind === 'day' ? 'sawtooth' : 'sine';
                        oscillator.frequency.value = kind === 'day' ? 3400 + i * 173 : 2200 + i * 127;
                        trill.frequency.value = kind === 'day' ? 47 + i * 3 : 6;
                        modulation.gain.value = kind === 'day' ? 110 : 280;
                        trill.connect(modulation).connect(oscillator.frequency);
                        gain.gain.value = 0; oscillator.connect(gain).connect(pan).connect(this.master);
                        oscillator.start(); trill.start();
                        this.voices.push({ source, kind, oscillator, gain, pan });
                    }
                }
            }
            if (value) await this.audio.resume();
            this.enabled = value;
            this.silence(this.hidden);
            this.update(this.hour);
        }
        silence(hidden) {
            this.hidden = hidden;
            if (this.audio) this.master.gain.setTargetAtTime(this.enabled && !hidden ? 0.12 : 0, this.audio.currentTime, 0.35);
        }
        // Explicit audio time also lets offline verification render this exact graph.
        update(hour, listener = this.listener, time = this.audio?.currentTime) {
            this.hour = hour; this.listener = listener;
            if (!this.audio || !this.enabled) return;
            const now = time;
            for (const voice of this.voices) {
                const s = Chorus.sample(hour, now, voice.source, listener);
                voice.gain.gain.setTargetAtTime(s[voice.kind] * 0.3, now, 0.09);
                voice.pan.pan.setTargetAtTime(s.pan, now, 0.3);
                if (voice.kind === 'dusk') voice.oscillator.frequency.setTargetAtTime(2300 + 350 * Math.sin(now * 4.2 + voice.source.phase), now, 0.08);
            }
        }
    }
    root.Presence = { Parallax, Card, Chorus };
})(typeof window !== 'undefined' ? window : globalThis);
