/* Studio gestures, independent of the sun clock. No assets or autonomous timers. */
(function (root) {
    'use strict';
    const approach = (a, b, dt, rate) => b + (a - b) * Math.exp(-dt * rate);
    class Motion {
        constructor(reduced = false) {
            this.reduced = reduced; this.wind = 0; this.gust = 0; this.drift = 0;
            this.turn = 0; this.targetTurn = 0; this.velocity = 0;
            this.puffs = new Map(); this.drag = null; this.timeTarget = null;
        }
        setReduced(value) {
            this.reduced = value;
            if (value) { this.wind = this.gust = this.velocity = 0; this.puffs.clear(); this.targetTurn = this.turn; }
        }
        tap() { if (!this.reduced) this.gust = Math.min(2, this.gust + 1); }
        hover(id) { if (!this.reduced && id !== null && !this.puffs.has(id)) this.puffs.set(id, { age: 0 }); }
        billow(id) { const p = this.puffs.get(id); return p ? 0.13 * Math.sin(Math.PI * Math.min(1, p.age / 2.5)) ** 2 : 0; }
        begin(x, y) { this.drag = { x, y, startX: x, startY: y, moved: false }; this.velocity = 0; }
        move(x, y, dt) {
            if (!this.drag) return;
            const d = this.drag;
            d.moved ||= Math.hypot(x - d.startX, y - d.startY) > 6;
            if (d.moved) {
                const delta = (x - d.x) * 0.002;
                this.targetTurn += delta;
                this.velocity = Math.max(-0.8, Math.min(0.8, delta / Math.max(0.016, dt)));
                if (this.reduced) { this.turn = this.targetTurn; this.velocity = 0; }
            }
            d.x = x; d.y = y;
        }
        end(cancel = false) { const tap = !!this.drag && !this.drag.moved && !cancel; this.drag = null; if (cancel) this.velocity = 0; return tap; }
        scroll(delta, clock) {
            clock.paused = true;
            this.timeTarget = Math.max(0, Math.min(clock.duration, (this.timeTarget ?? clock.time) + delta * 0.035));
            if (this.reduced) { clock.seek(this.timeTarget); this.timeTarget = null; }
        }
        step(dt, clock) {
            dt = Math.max(0, Math.min(0.1, dt));
            if (!this.reduced) {
                this.gust *= Math.exp(-dt * 1.15);
                this.wind = approach(this.wind, this.gust, dt, 3);
                this.drift += this.wind * dt * 0.06;
                if (!this.drag) this.targetTurn += this.velocity * dt;
                // Momentum expires even while the pointer is held stationary.
                this.velocity *= Math.exp(-dt * 4);
                this.turn = approach(this.turn, this.targetTurn, dt, 9);
                for (const [id, p] of this.puffs) { p.age += dt; if (p.age >= 2.5) this.puffs.delete(id); }
            }
            if (clock && this.timeTarget !== null) {
                clock.seek(approach(clock.time, this.timeTarget, dt, 7));
                if (Math.abs(clock.time - this.timeTarget) < 0.001) { clock.seek(this.timeTarget); this.timeTarget = null; }
            }
        }
        get active() { return this.wind > 0.0001 || this.gust > 0.0001 || this.puffs.size > 0 || Math.abs(this.velocity) > 0.0001 || Math.abs(this.turn - this.targetTurn) > 0.0001 || this.timeTarget !== null; }
    }
    class Furin {
        constructor(factory = () => new root.AudioContext()) { this.factory = factory; this.enabled = false; }
        async enable(value) {
            if (value && !this.audio) {
                this.audio = this.factory(); this.master = this.audio.createGain();
                this.master.gain.value = 0; this.master.connect(this.audio.destination);
            }
            this.enabled = value;
            if (!this.audio) return;
            if (value) await this.audio.resume();
            this.master.gain.setTargetAtTime(this.enabled ? 0.22 : 0, this.audio.currentTime, 0.15);
        }
        ring() {
            if (!this.enabled || !this.audio) return false;
            const a = this.audio, now = a.currentTime;
            if (now - (this.last ?? -Infinity) < 0.35) return false;
            this.last = now;
            // Inharmonic glass modes, soft attack and a long, quiet decay.
            [1480, 2319, 3182, 4260].forEach((frequency, i) => {
                const o = a.createOscillator(), g = a.createGain(); o.frequency.value = frequency;
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.22 / (i + 1), now + 0.012);
                g.gain.exponentialRampToValueAtTime(0.00001, now + 3.5 - i * 0.4);
                o.connect(g).connect(this.master); o.start(now); o.stop(now + 4);
                o.onended = () => { o.disconnect(); g.disconnect(); };
            });
            return true;
        }
    }
    root.Breeze = { Motion, Furin };
})(typeof window !== 'undefined' ? window : globalThis);
