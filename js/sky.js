/*
 * Sky colour from physics: sunlight scattered once by the air (Rayleigh: the
 * blue, strongest at short wavelengths) and by haze (Mie: the white glare
 * around the sun), dimmed by ozone, integrated along the line of sight through a spherical
 * atmosphere. The single-scattering model of Nishita et al. (1993), as
 * commonly simplified.
 *
 * So a sky is not picked by hand: give it the sun's height, and it gives the
 * colour of any direction, or a gradient for a page.
 *
 *   const sky = new Sky({ haze: 1, exposure: 20 });
 *   sky.color(viewDir, sunDir)          -> [r, g, b] 0..255
 *   sky.gradient(sunDir, { stops: 5 })  -> ['#..', ...] zenith to horizon
 *
 * Directions have y up. Tested in scripts/test-sky.mjs.
 */
(function (root) {
    'use strict';
    const R_EARTH = 6360e3, R_ATMOS = 6420e3;
    const BETA_R = [5.8e-6, 13.5e-6, 33.1e-6], H_R = 7994;      // per metre at sea level; scale height
    const BETA_M = 21e-6, H_M = 1200;
    // Ozone absorbs (it does not scatter), most in orange-red: it keeps the
    // horizon from going yellow and the twilight zenith blue. A layer peaking
    // at 25 km, 15 km either side (as in Bruneton's and Hillaire's models).
    const BETA_O = [0.65e-6, 1.881e-6, 0.085e-6];
    const ozone = h => Math.max(0, 1 - Math.abs(h - 25e3) / 15e3);
    const norm = v => { const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };

    /** Where a ray from `o` along `d` leaves a sphere of radius r about the centre: the far distance, or -1. */
    function exit(o, d, r) {
        const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
        const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
        const disc = b * b - c;
        return disc < 0 ? -1 : -b + Math.sqrt(disc);
    }

    /** Hits the ground on its way: the near distance to the earth, or -1. */
    function ground(o, d) {
        const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
        const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R_EARTH * R_EARTH;
        const disc = b * b - c;
        if (disc < 0) return -1;
        const t = -b - Math.sqrt(disc);
        return t > 0 ? t : -1;
    }

    class Sky {
        /**
         * `haze` scales the Mie (aerosol) density: 0 clear mountain air, 1
         * ordinary, more a hazy summer day. `exposure` sets how bright the
         * result is before it is squeezed into 0..255 (1 - e^-x).
         */
        constructor({ haze = 1, exposure = 20, height = 2, samples = 24, sunSamples = 12, g = 0.76 } = {}) {
            this.haze = haze; this.exposure = exposure; this.height = height;
            this.samples = samples; this.sunSamples = sunSamples; this.g = g;
        }

        /** Direct sunlight surviving the air to this height, in linear RGB. */
        transmittance(sun, origin = [0, R_EARTH + this.height, 0]) {
            const s = norm(sun);
            if (ground(origin, s) > 0) return [0, 0, 0];
            const ts = exit(origin, s, R_ATMOS), m = this.sunSamples;
            let sR = 0, sM = 0, sO = 0;
            for (let j = 0; j < m; j++) {
                const w = (j + 0.5) / m, t = ts * w * w, ds = ts * 2 * w / m;
                const h = Math.hypot(origin[0] + s[0] * t, origin[1] + s[1] * t, origin[2] + s[2] * t) - R_EARTH;
                sR += Math.exp(-h / H_R) * ds;
                sM += Math.exp(-h / H_M) * ds;
                sO += ozone(h) * ds;
            }
            return BETA_R.map((b, c) => Math.exp(-b * sR - BETA_M * this.haze * 1.1 * sM - BETA_O[c] * sO));
        }

        /** Light arriving from direction `view`, in linear units (not yet exposed). */
        radiance(view, sun) {
            const v = norm(view), s = norm(sun);
            const o = [0, R_EARTH + this.height, 0];
            let tMax = exit(o, v, R_ATMOS);
            const tg = ground(o, v);
            if (tg > 0) tMax = tg;                 // below the horizon: only the air in front of the ground
            // Samples crowd near the eye, t = tMax u^2: the air is densest there,
            // and a level ray runs ~900 km, so even steps miss where the light comes from.
            const n = this.samples, bm = BETA_M * this.haze;
            const mu = v[0] * s[0] + v[1] * s[1] + v[2] * s[2];
            const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
            const g = this.g;
            const phaseM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
            let odR = 0, odM = 0, odO = 0;
            const sumR = [0, 0, 0], sumM = [0, 0, 0];
            for (let i = 0; i < n; i++) {
                const u = (i + 0.5) / n, t = tMax * u * u, dt = tMax * 2 * u / n;
                const p = [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t];
                const h = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - R_EARTH;
                const hr = Math.exp(-h / H_R) * dt, hm = Math.exp(-h / H_M) * dt;
                odR += hr; odM += hm; odO += ozone(h) * dt;
                // Is the sun visible from here? If the earth is in the way, no light scatters at this point.
                if (ground(p, s) > 0) continue;
                const sunlight = this.transmittance(s, p);
                for (let c = 0; c < 3; c++) {
                    const tau = BETA_R[c] * odR + bm * 1.1 * odM + BETA_O[c] * odO;
                    const att = Math.exp(-tau) * sunlight[c];
                    sumR[c] += att * hr; sumM[c] += att * hm;
                }
            }
            return [0, 1, 2].map(c => sumR[c] * BETA_R[c] * phaseR + sumM[c] * bm * phaseM);
        }

        /** The colour seen in direction `view`, 0..255 sRGB. */
        color(view, sun) {
            return this.tone(this.radiance(view, sun));
        }

        /** Apply the same exposure and sRGB conversion to sky or cloud light. */
        tone(radiance) {
            return radiance.map(L => {
                const x = 1 - Math.exp(-this.exposure * L);
                const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
                return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
            });
        }

        /**
         * A page's sky: `stops` colours from `top` (elevation, radians; the
         * top of the frame) down to the horizon, looking `azimuth` radians
         * round from the sun (0: into it, PI: away from it).
         */
        gradient(sun, { stops = 5, top = 1.0, azimuth = Math.PI / 2 } = {}) {
            const s = norm(sun), sa = Math.atan2(s[2], s[0]) + azimuth;
            const hex = c => '#' + c.map(q => q.toString(16).padStart(2, '0')).join('');
            return Array.from({ length: stops }, (_, i) => {
                const el = top * (1 - i / (stops - 1)) + 0.01 * (i / (stops - 1));
                return hex(this.color([Math.cos(el) * Math.cos(sa), Math.sin(el), Math.cos(el) * Math.sin(sa)], s));
            });
        }
    }

    /** A sun `elevation` radians above the horizon, from `azimuth` radians round the y axis. */
    Sky.sun = (elevation, azimuth = Math.PI * 1.15) => [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];

    root.Sky = Sky;
})(typeof window !== 'undefined' ? window : globalThis);
