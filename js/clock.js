/* One time source, in seconds. No timers: the host supplies RAF timestamps. */
(function (root) {
    'use strict';
    class Clock {
        // Studio day: 06:00 through 19:30, compressed into duration seconds.
        // Civil times outside this interval clamp; malformed URLs use defaults.
        static fromQuery(query, options = {}) {
            const clock = new Clock(options), value = query.get('time');
            const civil = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');
            const seconds = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value || '');
            if (civil || seconds) {
                const time = civil
                    ? ((Number(value.slice(0, 2)) + Number(value.slice(3)) / 60 - 6) / (clock.endHour - 6)) * clock.duration
                    : Number(value);
                if (Number.isFinite(time)) { clock.seek(time); clock.paused = true; }
            }
            return clock;
        }
        /** Shared stylised summer sun, y up, passed to the physical Sky model. */
        static daylight(progress, endHour = 19.5) {
            const clamp = t => Math.max(0, Math.min(1, t));
            const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
            const hour = 6 + (endHour - 6) * clamp(progress), p = (hour - 6) / 13;
            const elevation = 0.08 + 1.12 * Math.sin(Math.PI * p) - 0.13 * ease((p - 0.8) / 0.2);
            return { sun: root.Sky.sun(elevation, Math.PI * (1.15 - 0.75 * p)),
                warmth: 1 - ease(elevation / 0.55), hour };
        }
        constructor({ duration = 180, time = 0, paused = false, endHour = 19.5 } = {}) {
            if (!(duration > 0) || !Number.isFinite(duration)) throw new RangeError('duration must be positive');
            this.duration = duration;
            if (!Number.isFinite(endHour) || endHour <= 6 || endHour > 24) throw new RangeError('endHour must be after 6 and at most 24');
            this.endHour = endHour;
            this.paused = paused;
            this.last = null;
            this.seek(time);
        }
        seek(time) {
            if (!Number.isFinite(time)) throw new RangeError('time must be finite');
            this.time = Math.max(0, Math.min(this.duration, time));
            this.last = null;
            return this.time;
        }
        tick(now) {
            if (!Number.isFinite(now)) throw new RangeError('timestamp must be finite');
            if (this.last !== null && !this.paused) {
                // Discard background-tab gaps; returning never jumps across the day.
                this.time = Math.min(this.duration, this.time + Math.max(0, Math.min(0.1, (now - this.last) / 1000)));
            }
            this.last = now;
            return this.time;
        }
        get progress() { return this.time / this.duration; }
        lightAt(progress) { return Clock.daylight(progress, this.endHour); }
        get daylight() { return this.lightAt(this.progress); }
    }
    root.Clock = Clock;
})(typeof window !== 'undefined' ? window : globalThis);
