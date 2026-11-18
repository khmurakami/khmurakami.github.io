/* Studio-only civil time and seasonal inks. No assets; weather is opt-in. */
(function (root) {
    'use strict';
    const clamp = v => Math.max(0, Math.min(1, v));
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    class LocalClock extends root.Clock {
        static fromQuery(query, options = {}) {
            const value = query.get('time');
            if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) {
                return query.has('time') ? root.Clock.fromQuery(query, options) : new LocalClock(options);
            }
            const clock = new LocalClock({ ...options, paused: true });
            clock.seek((Number(value.slice(0, 2)) + Number(value.slice(3)) / 60) / 24 * clock.duration);
            return clock;
        }
        constructor({ now = () => new Date(), paused = false } = {}) {
            super({ endHour: 22, paused }); this.now = now; this.local = true; this.sync();
        }
        sync() {
            const d = this.now();
            this.hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
            this.time = this.hour / 24 * this.duration;
        }
        seek(t) { this.local = false; return super.seek(t); }
        tick(t) { if (this.local) { if (!this.paused) this.sync(); return this.time; } return super.tick(t); }
        lightAt(progress) {
            const hour = clamp(progress) * 24;
            // A continuous stylised summer orbit, including the unseen night arc.
            const elevation = 0.14 + 1.12 * Math.cos((hour - 12.5) * Math.PI / 12);
            return { hour, sun: root.Sky.sun(elevation, Math.PI * (1.15 - (hour - 6) / 12)),
                warmth: 1 - root.LivingSky.ease(elevation / 0.55) };
        }
    }
    class Season {
        constructor(date = new Date(), override) {
            // Japanese summer calendar, retained as a summer painting in other months.
            const day = date.getMonth() * 31 + date.getDate();
            const phase = override || (day < 6 * 31 + 15 ? 'rainy' : day < 7 * 31 + 20 ? 'high' : 'late');
            this.phase = ['rainy', 'high', 'late'].includes(phase) ? phase : 'high';
            this.name = { rainy: 'Rainy season', high: 'High summer', late: 'Late summer' }[this.phase];
            this.color = { rainy: [143, 157, 164], high: [57, 137, 204], late: [218, 204, 170] }[this.phase];
            this.amount = { rainy: 0.4, high: 0.04, late: 0.22 }[this.phase];
        }
        apply(color) { return mix(color, this.color, this.amount); }
    }
    class RealWeather {
        constructor(enabled = false) { this.enabled = enabled; this.status = enabled ? 'ready' : 'off'; this.observation = null; }
        static parse(data) {
            const c = data.current;
            if (!c || !Number.isFinite(c.cloud_cover) || c.cloud_cover < 0 || c.cloud_cover > 100 ||
                !Number.isFinite(c.precipitation) || c.precipitation < 0) throw new Error('Invalid weather');
            return { overcast: c.cloud_cover / 100, rain: clamp(c.precipitation / 2) };
        }
        async load() {
            if (!this.enabled) return false;
            this.status = 'loading';
            try {
                const position = await new Promise((resolve, reject) => root.navigator.geolocation.getCurrentPosition(resolve, reject,
                    { timeout: 10000, maximumAge: 900000, enableHighAccuracy: false }));
                const { latitude, longitude } = position.coords;
                const url = new URL('https://api.open-meteo.com/v1/forecast');
                url.search = new URLSearchParams({ latitude: latitude.toFixed(2), longitude: longitude.toFixed(2), current: 'cloud_cover,precipitation' });
                const response = await root.fetch(url, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error('Weather unavailable');
                this.observation = RealWeather.parse(await response.json()); this.status = 'live'; return true;
            } catch { this.status = 'unavailable'; return false; }
        }
    }
    class SeasonalWeather extends root.LivingSky.Weather {
        constructor(season, real) { super(); this.season = season; this.real = real; this.blend = 0; }
        get active() { return Boolean(this.real.observation) && this.blend < 1; }
        step(dt, reduced) {
            if (!this.active) return;
            if (reduced) { this.blend = 1; return; }
            this.blend += (1 - this.blend) * (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) / 3));
            if (1 - this.blend < 0.0001) this.blend = 1;
        }
        sample(hour, seconds, reduced) {
            const s = super.sample(hour, seconds, reduced);
            if (hour < 6) { s.night = 1 - root.LivingSky.ease((hour - 5) / 1); s.bursts = []; s.glow = 0; }
            const observation = this.real.observation;
            if (observation) {
                for (const key of ['overcast', 'rain']) s[key] += (observation[key] - s[key]) * this.blend;
                s.rainbow *= 1 - this.blend;
            }
            return s;
        }
        sky(colors, state) { return super.sky(colors.map(c => this.season.apply(c)), state); }
    }
    root.SummerWorld = { LocalClock, Season, RealWeather, SeasonalWeather };
})(typeof window !== 'undefined' ? window : globalThis);
