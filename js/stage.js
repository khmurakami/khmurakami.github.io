/*
 * stage.js — runs a scene.
 *
 * A scene is an object registered with `Stage.register(name, scene)`:
 *
 *   bake(L)            paint the still layers for this screen size.
 *                      L = { W, H, dpr, u, tex } — CSS size, pixel ratio,
 *                      1% of the short side, and a paper grain texture.
 *   frame(ctx, t, dt)  draw one frame at time t (seconds).
 *   ambience           optional: 'cicadas' adds cicadas to the sound.
 *
 * The stage owns the canvas, resizing, the frame loop (about 30fps), the
 * sound (wind, chime, ambience), the caption clock, and `?still`, which freezes
 * a fixed moment for screenshots.
 */
(function () {
    'use strict';
    const P = window.Painter;

    const params = new URLSearchParams(location.search);
    const still = params.has('still');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scenes = {};

    // ── Sound ────────────────────────────────────────────────────────────

    const Sound = {
        ac: null, master: null, windGain: null, on: false, ambience: null, nextCicada: 0,

        start() {
            if (this.ac) return true;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            const ac = this.ac = new AC();
            this.master = ac.createGain();
            this.master.gain.value = 0;
            this.master.connect(ac.destination);
            // Brown noise, low-passed: air moving through an open room.
            const len = ac.sampleRate * 4;
            const buf = ac.createBuffer(1, len, ac.sampleRate);
            const d = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
            const src = ac.createBufferSource();
            src.buffer = buf; src.loop = true;
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 420;
            this.windGain = ac.createGain();
            this.windGain.gain.value = 0;
            src.connect(lp).connect(this.windGain).connect(this.master);
            src.start();
            return true;
        },

        set(on) {
            this.on = on;
            if (on && !this.start()) return;
            if (!this.ac) return;
            if (on) this.ac.resume();
            this.master.gain.setTargetAtTime(on ? 1 : 0, this.ac.currentTime, 0.4);
        },

        tick(w) {
            if (!this.on || !this.ac) return;
            this.windGain.gain.setTargetAtTime(0.02 + w * 0.05, this.ac.currentTime, 0.6);
            if (this.ambience === 'cicadas' && this.ac.currentTime > this.nextCicada) {
                this.cicada();
                this.nextCicada = this.ac.currentTime + 5 + Math.random() * 7;
            }
        },

        /** A glass wind chime: three partials, a bright strike, a long ring. */
        ring(strength) {
            if (!this.on || !this.ac) return;
            const ac = this.ac, now = ac.currentTime;
            const notes = [2093, 2349, 2637, 3136, 3520];
            const f = notes[Math.floor(Math.random() * notes.length)];
            for (const [m, a] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) {
                const o = ac.createOscillator();
                o.type = 'sine';
                o.frequency.value = f * m;
                const g = ac.createGain();
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.05 * a * Math.min(1, strength), now + 0.004);
                g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8 / Math.sqrt(m));
                o.connect(g).connect(this.master);
                o.start(now);
                o.stop(now + 3);
            }
        },

        /**
         * One cicada's song: a buzzing tone pulsed a dozen times a second,
         * swelling, holding and falling away, from somewhere off to one side.
         */
        cicada() {
            const ac = this.ac, now = ac.currentTime;
            const dur = 4 + Math.random() * 4;
            const pitch = 3800 + Math.random() * 1400;
            const src = ac.createOscillator();
            src.type = 'sawtooth';
            src.frequency.value = pitch;
            const bp = ac.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = pitch * 1.05; bp.Q.value = 4;
            const pulse = ac.createGain();
            pulse.gain.value = 0.5;
            const lfo = ac.createOscillator();
            lfo.type = 'square';
            lfo.frequency.value = 9 + Math.random() * 7;
            const lfoAmt = ac.createGain();
            lfoAmt.gain.value = 0.5;
            lfo.connect(lfoAmt).connect(pulse.gain);
            const env = ac.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.012, now + dur * 0.3);
            env.gain.setValueAtTime(0.012, now + dur * 0.7);
            env.gain.linearRampToValueAtTime(0, now + dur);
            let out = env;
            if (ac.createStereoPanner) {
                const pan = ac.createStereoPanner();
                pan.pan.value = Math.random() * 1.6 - 0.8;
                env.connect(pan);
                out = pan;
            }
            src.connect(bp).connect(pulse).connect(env);
            out.connect(this.master);
            src.start(now); lfo.start(now);
            src.stop(now + dur + 0.1); lfo.stop(now + dur + 0.1);
        }
    };

    /** The breeze, 0..1, shared by everything that moves in it. */
    function wind(t) {
        return Math.max(0, Math.min(1, 0.5 + 0.26 * Math.sin(t * 0.23) + 0.16 * Math.sin(t * 0.61 + 1.7) + 0.08 * Math.sin(t * 1.37 + 0.4)));
    }

    /** A wind chime as a damped pendulum pushed by the breeze. Rings on a hard swing. */
    function makeChime() {
        const c = { th: 0, om: 0, last: -10 };
        c.step = (t, dt) => {
            const w = wind(t);
            const target = 0.2 * w + 0.12 * w * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2);
            c.om += (-16 * (c.th - target) - 1.4 * c.om) * dt;
            c.th += c.om * dt;
            if (Math.abs(c.om) > 0.55 && t - c.last > 1.1) {
                c.last = t;
                Sound.ring(Math.abs(c.om));
            }
        };
        return c;
    }

    // ── Running ──────────────────────────────────────────────────────────

    function run(name) {
        const scene = scenes[name] || scenes[Object.keys(scenes)[0]];
        // The scene paints offscreen; the look restyles it onto the page.
        // Without WebGL2 the page canvas falls back to showing the paint as is.
        const display = document.getElementById('room');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let look = null;
        try { look = window.Look ? window.Look.create(display) : null; } catch (e) { console.warn('[look]', e); look = null; }
        const flat = look ? null : display.getContext('2d');
        const styleNames = window.Look ? window.Look.names : [];
        let styleName = styleNames.includes(params.get('style')) ? params.get('style') : 'painted';
        if (look) look.setStyle(window.Look.PRESETS[styleName]);
        let tex = null, L = null;
        Sound.ambience = scene.ambience || null;
        const place = document.getElementById('place');
        if (place) place.textContent = scene.caption || '';

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = window.innerWidth, H = window.innerHeight;
            canvas.width = display.width = Math.round(W * dpr);
            canvas.height = display.height = Math.round(H * dpr);
            if (!tex) tex = P.paper(256, 11);
            L = { W, H, dpr, u: Math.min(W, H) / 100, tex, still };
            scene.bake(L);
        }

        function draw(t, dt) {
            ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            scene.frame(ctx, t, dt);
            if (look) look.render(canvas, t, L.dpr);
            else flat.drawImage(canvas, 0, 0);
        }

        // The style button cycles through the looks.
        const lookBtn = document.getElementById('look');
        if (lookBtn) {
            if (!look) lookBtn.hidden = true;
            const label = () => { lookBtn.textContent = window.Look.PRESETS[styleName].label.toLowerCase(); };
            if (look) label();
            lookBtn.addEventListener('click', () => {
                styleName = styleNames[(styleNames.indexOf(styleName) + 1) % styleNames.length];
                look.setStyle(window.Look.PRESETS[styleName]);
                label();
                if (reduced || still) draw(52, 0);
            });
        }

        resize();
        let timer = 0;
        if (reduced || still) {
            const t = 52;
            for (let i = 0; i < 150; i++) scene.step && scene.step(t - 5 + i / 30, 1 / 30);
            draw(t, 0);
            window.addEventListener('resize', () => {
                clearTimeout(timer);
                timer = setTimeout(() => { resize(); draw(t, 0); }, 150);
            });
            return;
        }

        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(resize, 150);
        });
        const t0 = performance.now();
        let last = 0;
        function loop(now) {
            // About 30fps: plenty for a scene this calm, and kinder to batteries.
            if (now - last >= 32) {
                const dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                const t = (now - t0) / 1000 + 40;
                scene.step && scene.step(t, dt);
                Sound.tick(wind(t));
                draw(t, dt);
            }
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    // ── The page around the canvas ───────────────────────────────────────

    const soundBtn = document.getElementById('sound');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            const on = !Sound.on;
            Sound.set(on);
            soundBtn.textContent = on ? 'sound on' : 'sound off';
            soundBtn.setAttribute('aria-pressed', String(on));
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (!Sound.ac) return;
        if (document.hidden) Sound.ac.suspend(); else if (Sound.on) Sound.ac.resume();
    });

    const timeEl = document.getElementById('time');
    function updateTime() {
        if (!timeEl) return;
        timeEl.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase() + ' · ';
    }
    updateTime();
    setInterval(updateTime, 15000);

    window.Stage = {
        register(name, scene) { scenes[name] = scene; },
        run, wind, makeChime, Sound, still
    };
})();
