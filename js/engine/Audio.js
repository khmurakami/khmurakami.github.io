/**
 * Procedural ambience.
 *
 * Everything here is synthesised rather than loaded: a city hum, wind that
 * tracks the wind system, footsteps that change with the surface, and a neon
 * buzz that fades with distance. No audio files to ship, nothing to download,
 * and the wind bed can follow the actual gust value instead of looping a
 * recording that drifts out of sync with what is on screen.
 *
 * Browsers block audio until a gesture, so nothing starts until `resume()` is
 * called from a real click or keypress.
 */
export class Audio {
    constructor() {
        this.ctx = null;
        this.started = false;
        this.muted = false;
        /** True while the listener is inside a building; muffles the city bed. */
        this.indoors = false;
        this.nodes = {};
    }

    /** Call from a user gesture. Safe to call repeatedly. */
    async resume() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            this.ctx = new AC();
            this.build();
        }
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.started = true;
        return true;
    }

    /**
     * A buffer of pink-ish noise, reused by every noise voice.
     *
     * It says "reused" and it now is. It was not: `footstep()` called this on
     * every step, so walking synthesised a fresh 0.2s buffer roughly three
     * times a second — about 100KB/s allocated and 8,820 iterations of the
     * Voss loop each time, for noise indistinguishable from the last lot.
     * Keyed explicitly rather than by duration, because the hum and the wind
     * both want four seconds and must NOT share one: two looping voices playing
     * identical noise sum into comb filtering instead of into air.
     */
    noiseBuffer(seconds = 2, key = seconds) {
        const ctx = this.ctx;
        if (!this._noise) this._noise = new Map();

        const cached = this._noise.get(key);
        if (cached) return cached;

        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);

        // Voss-style pink noise: cheaper than true pink, and warmer than white,
        // which matters because white noise reads as static rather than air.
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + w * 0.0990460;
            b1 = 0.96300 * b1 + w * 0.2965164;
            b2 = 0.57000 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
        }

        this._noise.set(key, buf);
        return buf;
    }

    build() {
        const ctx = this.ctx;

        this.master = ctx.createGain();
        this.master.gain.value = 0.0;
        this.master.connect(ctx.destination);

        // ── City hum: low, steady, always there ──
        const hum = ctx.createBufferSource();
        hum.buffer = this.noiseBuffer(4, 'hum');
        hum.loop = true;

        const humFilter = ctx.createBiquadFilter();
        humFilter.type = 'lowpass';
        humFilter.frequency.value = 240;
        humFilter.Q.value = 0.4;

        const humGain = ctx.createGain();
        humGain.gain.value = 0.55;

        hum.connect(humFilter).connect(humGain).connect(this.master);
        hum.start();
        this.nodes.humGain = humGain;

        // ── Wind: bandpassed noise whose gain and colour follow the gust ──
        const wind = ctx.createBufferSource();
        wind.buffer = this.noiseBuffer(4, 'wind');
        wind.loop = true;

        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 520;
        windFilter.Q.value = 0.7;

        const windGain = ctx.createGain();
        windGain.gain.value = 0.0;

        wind.connect(windFilter).connect(windGain).connect(this.master);
        wind.start();
        this.nodes.windGain = windGain;
        this.nodes.windFilter = windFilter;

        // ── Neon buzz: a mains-frequency tone, gated by proximity ──
        const buzz = ctx.createOscillator();
        buzz.type = 'sawtooth';
        buzz.frequency.value = 120;

        const buzzFilter = ctx.createBiquadFilter();
        buzzFilter.type = 'bandpass';
        buzzFilter.frequency.value = 900;
        buzzFilter.Q.value = 6;

        const buzzGain = ctx.createGain();
        buzzGain.gain.value = 0;

        buzz.connect(buzzFilter).connect(buzzGain).connect(this.master);
        buzz.start();
        this.nodes.buzzGain = buzzGain;

        // Fade the whole bed in, so enabling sound is not a jolt.
        this.master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 2.5);
    }

    /**
     * @param {number} windValue  - current signed wind, from the Wind system
     * @param {number} neonNear   - 0..1 proximity to a buzzing source
     */
    update(windValue, neonNear = 0) {
        if (!this.started || this.muted || !this.ctx) return;
        const t = this.ctx.currentTime;
        const w = Math.abs(windValue);

        // Gusts are both louder and brighter — the filter opens as it blows.
        this.nodes.windGain.gain.setTargetAtTime(Math.min(0.5, w * 0.42), t, 0.35);
        this.nodes.windFilter.frequency.setTargetAtTime(420 + w * 900, t, 0.5);
        this.nodes.buzzGain.gain.setTargetAtTime(neonNear * 0.05, t, 0.2);
    }

    /**
     * A footstep. `wet` swaps the surface for a puddle: shorter, brighter, with
     * a little splash on top.
     */
    footstep(wet = false) {
        if (!this.started || this.muted || !this.ctx) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;

        // One shared two-second bed, played from a random offset.
        //
        // Caching the old 0.2s buffer alone would have made every footstep the
        // identical click; re-synthesising it made them vary but cost ~100KB/s
        // while walking. Reading a different slice of one long buffer gives the
        // variation for nothing.
        const bed = this.noiseBuffer(2, 'step');
        const src = ctx.createBufferSource();
        src.buffer = bed;

        const filter = ctx.createBiquadFilter();
        filter.type = wet ? 'highpass' : 'lowpass';
        filter.frequency.value = wet ? 900 : 1400;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(wet ? 0.16 : 0.11, t);
        gain.gain.exponentialRampToValueAtTime(0.0005, t + (wet ? 0.16 : 0.10));

        src.connect(filter).connect(gain).connect(this.master);
        src.start(t, Math.random() * (bed.duration - 0.3));
        src.stop(t + 0.25);

        // Web Audio keeps a node alive while it is connected, even after it has
        // stopped. Left alone these accumulate for the length of the session —
        // one small graph per footstep, thousands over a long walk.
        src.onended = () => {
            src.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }

    /**
     * Puts a wall between the listener and the city.
     *
     * Stepping inside should be audible as well as visible — the hum and the
     * wind are the roof, and carrying them into a shed at full level is what
     * makes an interior feel like a painted backdrop rather than a place with
     * its own air. Ramped, not switched, so the door reads as closing.
     */
    setIndoors(on) {
        this.indoors = on;
        this.applyLevel();
    }

    /** The level the bed should be running at, given mute and walls. */
    get level() {
        if (this.muted) return 0;
        return this.indoors ? 0.09 : 0.28;
    }

    applyLevel() {
        if (!this.master || !this.ctx) return;
        this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.25);
    }

    toggleMute() {
        this.muted = !this.muted;
        this.applyLevel();
        return this.muted;
    }
}
