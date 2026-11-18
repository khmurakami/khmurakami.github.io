/*
 * Painted layers: sprite stacking where the colour lives in the slices.
 *
 * In sprite stacking an object is a pile of flat images, each a little
 * higher than the last; turned together they read as a solid. The look is in
 * the images. Here the images are painted, not drawn by hand:
 *
 *   Volume     the shape: spheres, with a soft union for its surface direction
 *   paints     classes that colour a point of the volume (light, lift, ...),
 *              chained in order: each takes the colour so far and a sample
 *   Slicer     cuts the volume into layers and paints each one once
 *   StackView  draws the painted layers at any turn, every frame
 *
 * Light is baked into the layers in the world's frame, so moving the camera
 * around the pile keeps the lit side where the sun is, for free.
 *
 * Needs js/stack.js (shapes, camera). The maths has no canvas in it and is
 * tested in scripts/test-layers.mjs.
 */
(function (root) {
    'use strict';
    const S = root.Stack;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const norm = v => { const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
    const dist = (x, y, z) => Math.sqrt(x * x + y * y + z * z);      // Math.hypot is several times slower

    // ── Noise ─────────────────────────────────────────────────────────────

    /**
     * Smooth 3D value noise, seeded, summed in octaves (fbm), with its exact
     * gradient. Values lie in [-1, 1]. Fixed in the world, so whatever it
     * roughens belongs to the object and turns with it.
     *
     * `billow` folds each octave, 2|n| - 1: rounded crests with creases
     * between, a cauliflower at every scale, which is how cumulus breaks up.
     * Plain noise pits the surface instead.
     *
     * `lipschitz` bounds how fast it can change per world unit: along x the
     * derivative is fade'(u) times a blend of corner differences, at most
     * 15/8 * 2, so per octave |grad| <= 3.75 * sqrt(3) * frequency (twice
     * that, billowed).
     */
    class Noise {
        constructor({ seed = 1, scale = 20, octaves = 3, gain = 0.5, lacunarity = 2, billow = false } = {}) {
            this.billow = !!billow;
            const r = S.rng(seed * 7919 + 13);
            const p = Array.from({ length: 256 }, (_, i) => i);
            for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
            this.perm = new Uint8Array(512);
            for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
            this.vals = new Float64Array(256);
            for (let i = 0; i < 256; i++) this.vals[i] = r() * 2 - 1;
            this.octaves = [];
            let amp = 1, freq = 1 / scale, sum = 0;
            for (let i = 0; i < octaves; i++) { this.octaves.push({ amp, freq, off: i * 31.7 }); sum += amp; amp *= gain; freq *= lacunarity; }
            for (const o of this.octaves) o.amp /= sum;
            this.lipschitz = this.octaves.reduce((a, o) => a + o.amp * o.freq * 3.75 * Math.sqrt(3), 0) * (this.billow ? 2 : 1);
        }
        _v(i, j, k) { const P = this.perm; return this.vals[P[P[P[i & 255] + (j & 255)] + (k & 255)]]; }
        /** One octave at a point (lattice units): [value, d/dx, d/dy, d/dz]. */
        value(x, y, z) {
            const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
            const fx = x - i, fy = y - j, fz = z - k;
            const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), du = 30 * fx * fx * (fx - 1) * (fx - 1);
            const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), dv = 30 * fy * fy * (fy - 1) * (fy - 1);
            const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10), dw = 30 * fz * fz * (fz - 1) * (fz - 1);
            const a = this._v(i, j, k), b = this._v(i + 1, j, k), c = this._v(i, j + 1, k), d = this._v(i + 1, j + 1, k);
            const e = this._v(i, j, k + 1), f = this._v(i + 1, j, k + 1), g = this._v(i, j + 1, k + 1), h = this._v(i + 1, j + 1, k + 1);
            const k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + h;
            return [
                a + k1 * u + k2 * v + k3 * w + k4 * u * v + k5 * v * w + k6 * w * u + k7 * u * v * w,
                du * (k1 + k4 * v + k6 * w + k7 * v * w),
                dv * (k2 + k5 * w + k4 * u + k7 * w * u),
                dw * (k3 + k6 * u + k5 * v + k7 * u * v)
            ];
        }
        /** The octaves summed, at a world point: [value, gradient x, y, z] (per world unit). */
        fbm(x, y, z) {
            let s = 0, gx = 0, gy = 0, gz = 0;
            for (const o of this.octaves) {
                const q = this.value(x * o.freq + o.off, y * o.freq + o.off, z * o.freq + o.off);
                if (this.billow) { const sg = q[0] < 0 ? -2 : 2; q[0] = 2 * Math.abs(q[0]) - 1; q[1] *= sg; q[2] *= sg; q[3] *= sg; }
                s += o.amp * q[0]; gx += o.amp * o.freq * q[1]; gy += o.amp * o.freq * q[2]; gz += o.amp * o.freq * q[3];
            }
            return [s, gx, gy, gz];
        }
        /** One octave's value alone, with nothing allocated: the light queries call this millions of times. */
        _scalar(x, y, z) {
            const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
            const fx = x - i, fy = y - j, fz = z - k;
            const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
            const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
            const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
            const P = this.perm, V = this.vals, i0 = i & 255, i1 = (i + 1) & 255, j0 = j & 255, j1 = (j + 1) & 255, k0 = k & 255, k1 = (k + 1) & 255;
            const p0 = P[i0], p1 = P[i1], p00 = P[p0 + j0], p01 = P[p0 + j1], p10 = P[p1 + j0], p11 = P[p1 + j1];
            const x00 = V[P[p00 + k0]] + u * (V[P[p10 + k0]] - V[P[p00 + k0]]);
            const x10 = V[P[p01 + k0]] + u * (V[P[p11 + k0]] - V[P[p01 + k0]]);
            const x01 = V[P[p00 + k1]] + u * (V[P[p10 + k1]] - V[P[p00 + k1]]);
            const x11 = V[P[p01 + k1]] + u * (V[P[p11 + k1]] - V[P[p01 + k1]]);
            const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
            return y0 + w * (y1 - y0);
        }
        /** The value alone. */
        at(x, y, z) {
            let s = 0;
            for (const o of this.octaves) {
                const v = this._scalar(x * o.freq + o.off, y * o.freq + o.off, z * o.freq + o.off);
                s += o.amp * (this.billow ? 2 * Math.abs(v) - 1 : v);
            }
            return s;
        }
    }

    // ── Volume ────────────────────────────────────────────────────────────

    /**
     * A shape made of spheres. Inside means inside any sphere (the union), so
     * outlines keep every billow. The surface direction comes from a soft
     * union with blend distance `blend` (world units): 0 lights every sphere
     * on its own, more lets neighbours share one light, as one mass.
     *
     * The soft union is a log-sum-exp minimum of the spheres' distances; its
     * gradient is the weighted average of each sphere's own direction, with
     * weights exp(-(d_i - d_min) / blend).
     *
     * `noise` ({ amount, scale, octaves, seed }) roughens the surface: the
     * signed distance becomes d(p) - amount * fbm(p), pushing the surface out
     * or in by up to `amount`. The outline, the surface direction and every
     * light query below read the same field, so they all agree.
     *
     * The light queries (sunVisibility, occlusion, thickness) walk the
     * signed distance, exact for a union of spheres up to `range`; beyond
     * that they only need to know it is at least `range`.
     */
    class Volume {
        constructor(spheres, { blend = 0, noise = null, range = 24 } = {}) {
            this.spheres = spheres;
            this.blend = blend;
            this.noise = noise && noise.amount ? new Noise(noise) : null;
            this.amount = this.noise ? noise.amount : 0;
            // How fast the signed distance can change per unit: 1, plus the noise's share.
            this.lipschitz = 1 + this.amount * (this.noise ? this.noise.lipschitz : 0);
            this.range = range;
            let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0, big = 0;
            for (const s of spheres) {
                x0 = Math.min(x0, s.x - s.r); x1 = Math.max(x1, s.x + s.r);
                z0 = Math.min(z0, s.z - s.r); z1 = Math.max(z1, s.z + s.r);
                top = Math.max(top, s.y + s.r); big = Math.max(big, s.r);
            }
            const a = this.amount;
            x0 -= a; x1 += a; z0 -= a; z1 += a; top += a;
            this.bounds = { x0, x1, z0, z1, top, radius: Math.max(Math.hypot(x0, z0), Math.hypot(x1, z1), Math.hypot(x0, z1), Math.hypot(x1, z0)) };
            // Grids, so each point only looks at spheres near it. A sphere is
            // filed under every cell within its radius plus a reach.
            this.reach = blend * 5 + a;      // blend weights past blend*5 are under 1%
            this.cell = Math.max(8, big / 2);
            this.grid = this._file(this.reach);
            this._solid = this._file(a);     // for inside and depth: only spheres that can contain the point
            this._far = null;                // for distances up to `range`: built when first needed
            this._ds = new Float64Array(64);  // scratch for normal()
        }
        _file(reach) {
            const grid = new Map();
            for (const s of this.spheres) {
                const e = s.r + reach;
                const [a0, b0, c0] = this._cellOf(s.x - e, s.y - e, s.z - e), [a1, b1, c1] = this._cellOf(s.x + e, s.y + e, s.z + e);
                for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) for (let c = c0; c <= c1; c++) {
                    const k = this._key(a, b, c);
                    let list = grid.get(k);
                    if (!list) grid.set(k, list = []);
                    list.push(s);
                }
            }
            return grid;
        }
        _cellOf(x, y, z) { return [Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell)]; }
        _key(a, b, c) { return (a + 512) * 1048576 + (b + 512) * 1024 + (c + 512); }
        near(x, y, z) { const [a, b, c] = this._cellOf(x, y, z); return this.grid.get(this._key(a, b, c)) || []; }
        _nearSolid(x, y, z) { const [a, b, c] = this._cellOf(x, y, z); return this._solid.get(this._key(a, b, c)) || []; }
        _nearFar(x, y, z) {
            if (!this._far) this._far = this._file(this.range + this.amount);
            const [a, b, c] = this._cellOf(x, y, z);
            return this._far.get(this._key(a, b, c)) || [];
        }

        /** The sphere a point is in, if any (the one it is deepest inside). */
        inside(x, y, z) { return this.depth(x, y, z) > 0 ? this._deepest : null; }

        /**
         * How far inside the volume a point is at least: the depth below the
         * surface of the sphere it is deepest in, plus the noise (0 or less:
         * outside). The true distance to the surface is never less than this.
         */
        depth(x, y, z) {
            let bd = -Infinity, best = null;
            for (const s of this._nearSolid(x, y, z)) {
                const d = s.r - dist(x - s.x, y - s.y, z - s.z);
                if (d > bd) { bd = d; best = s; }
            }
            if (!best) { this._deepest = null; return 0; }
            if (this.noise) bd += this.amount * this.noise.at(x, y, z);
            this._deepest = bd > 0 ? best : null;
            return bd;
        }

        /**
         * Signed distance to the surface (negative inside): exact for the
         * spheres up to `range` and capped there, then roughened by the noise.
         * Step along a ray by distance / lipschitz and you never step through it.
         */
        distance(x, y, z) {
            let d = this.range;
            for (const s of this._nearFar(x, y, z)) {
                const e = dist(x - s.x, y - s.y, z - s.z) - s.r;
                if (e < d) d = e;
            }
            return this.noise ? d - this.amount * this.noise.at(x, y, z) : d;
        }

        /**
         * How far a ray can move from a point without passing through the
         * surface: a lower bound on the distance. The noise moves the surface
         * by at most `amount`, so away from it the spheres' own distance less
         * `amount` is safe, and needs no noise; near it, the distance over
         * its lipschitz bound. Negative only inside.
         */
        _safe(x, y, z) {
            let d = this.range;
            for (const s of this._nearFar(x, y, z)) {
                const e = dist(x - s.x, y - s.y, z - s.z) - s.r;
                if (e < d) d = e;
            }
            if (!this.noise) return d;
            const a = this.amount;
            return d > 2 * a ? d - a : (d - a * this.noise.at(x, y, z)) / this.lipschitz;
        }

        /**
         * Unit surface direction at a point: the gradient of the union's
         * distance, min_i d_i, softened, minus the noise's gradient. The soft
         * minimum's gradient is the average of each sphere's own direction
         * weighted by exp(-(d_i - d_min) / blend); as blend -> 0 it is the
         * deepest sphere's.
         */
        normal(x, y, z) {
            const list = this.near(x, y, z), m = list.length;
            if (!m) return [0, 1, 0];
            // Plain loops, no closures: this runs for every painted texel.
            const ds = this._ds.length >= m ? this._ds : (this._ds = new Float64Array(m * 2));
            let dmin = Infinity, best = list[0];
            for (let i = 0; i < m; i++) {
                const s = list[i], e = dist(x - s.x, y - s.y, z - s.z);
                ds[i] = e;
                if (e - s.r < dmin) { dmin = e - s.r; best = s; }
            }
            let n;
            if (!(this.blend > 0)) n = norm([x - best.x, y - best.y, z - best.z]);
            else {
                let nx = 0, ny = 0, nz = 0;
                for (let i = 0; i < m; i++) {
                    const s = list[i], e = ds[i], w = Math.exp(-(e - s.r - dmin) / this.blend) / (e || 1);
                    nx += w * (x - s.x); ny += w * (y - s.y); nz += w * (z - s.z);
                }
                n = norm([nx, ny, nz]);
            }
            if (!this.noise) return n;
            const g = this.noise.fbm(x, y, z), a = this.amount;
            return norm([n[0] - a * g[1], n[1] - a * g[2], n[2] - a * g[3]]);
        }

        /**
         * How much a point sits where billows meet, at scale k: (d_min -
         * softmin_k) / k = log sum_i exp(-(d_i - d_min) / k). 0 where one
         * sphere alone is near, log(m) at a seam of m equally near ones.
         */
        crease(x, y, z, k) {
            const list = this.near(x, y, z);
            let dmin = Infinity;
            const ds = list.map(s => { const d = dist(x - s.x, y - s.y, z - s.z) - s.r; if (d < dmin) dmin = d; return d; });
            let sum = 0;
            for (const d of ds) sum += Math.exp(-(d - dmin) / k);
            return list.length ? Math.log(sum) : 0;
        }

        /** Outside the box the volume lives in? A straight ray that leaves it never comes back. */
        _gone(x, y, z) {
            const B = this.bounds;
            return y > B.top || y < -1 || x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1;
        }

        /**
         * Cast shadow: how much of the sun reaches a point, 0 (blocked) to 1.
         * From the point, walk out of the volume toward the sun, then go on by
         * sphere tracing: if the ray meets the volume again, something else is
         * in the way. The closest miss on the way sets a soft edge,
         * min(softness * distance / travelled): the penumbra of a sun that is
         * not a point. `bias` skips the surface the ray leaves from.
         */
        sunVisibility(x, y, z, sun, { softness = 8, bias = 2, steps = 96 } = {}) {
            const L = norm(sun), lip = this.lipschitz;
            let t = 0, d = this.distance(x, y, z);
            for (let i = 0; d < 0 && i < 64; i++) {
                t += Math.max(-d / lip, 0.25);
                d = this.distance(x + L[0] * t, y + L[1] * t, z + L[2] * t);
            }
            const t0 = t + bias;
            let res = 1;
            t = t0;
            for (let i = 0; i < steps; i++) {
                const qx = x + L[0] * t, qy = y + L[1] * t, qz = z + L[2] * t;
                if (this._gone(qx, qy, qz)) break;
                // The field controls visibility; its Lipschitz bound controls
                // only travel. Using the smaller safe step as clearance makes
                // rough surfaces falsely dark even when the sun ray is open.
                const h = this.distance(qx, qy, qz);
                if (h < 0.05) return 0;
                res = Math.min(res, softness * h / (t - t0 + bias));
                // h - 2*amount is also safe: the noise at either end can
                // differ by at most 2*amount. It avoids tiny steps far away.
                t += clamp(Math.max(h / lip, h - 2 * this.amount), 0.5, 24);
            }
            const v = clamp(res, 0, 1);
            return v * v * (3 - 2 * v);
        }

        /**
         * Ambient occlusion: how much open sky a point on the surface sees, 0
         * to 1. Step out along the surface direction; wherever the volume is
         * nearer than the distance stepped, something hems the point in:
         * 1 - sum w_i max(0, h_i - d_i) / sum w_i h_i, nearer steps weighted
         * more. Exactly 1 on the open side of a lone sphere.
         */
        occlusion(x, y, z, n, { step = 4, samples = 5, falloff = 0.75 } = {}) {
            const out = Math.max(0, -this.distance(x, y, z));      // from just under the surface, onto it
            const px = x + n[0] * out, py = y + n[1] * out, pz = z + n[2] * out;
            let lost = 0, all = 0, w = 1;
            for (let i = 1; i <= samples; i++) {
                const h = step * i;
                const d = this.distance(px + n[0] * h, py + n[1] * h, pz + n[2] * h);
                lost += w * Math.max(0, h - d); all += w * h; w *= falloff;
            }
            return clamp(1 - lost / all, 0, 1);
        }

        /**
         * How much of the volume lies between a point and a direction (the
         * sun): the length of the ray that is inside, stepping `step` units
         * while inside and skipping empty space by its distance.
         */
        thickness(x, y, z, dir, { step = 2, reach = 160 } = {}) {
            const L = norm(dir), lip = this.lipschitz;
            let t = 0, inside = 0;
            while (t < reach) {
                const qx = x + L[0] * t, qy = y + L[1] * t, qz = z + L[2] * t;
                if (t > 0 && this._gone(qx, qy, qz)) break;
                const d = this._safe(qx, qy, qz);
                if (d < 0) { inside += step; t += step; } else t += Math.max(d, step);
            }
            return inside;
        }
    }

    // ── Paints ────────────────────────────────────────────────────────────
    //
    // A paint colours a sample: apply(colour, sample) -> colour, colours as
    // [r, g, b] 0..255. A sample is { x, y, z, n (unit), t (0 base .. 1 top), volume }.
    // A field modifier may pass null through; the first colour paint must
    // supply a colour before any tinting paint runs.

    /**
     * How directly a sample faces the sun (n . sun), with the volume's cast
     * shadows when `shadow` is given ({ softness, bias, depth }, see
     * Volume.sunVisibility; null: none). Where the sun is blocked, the
     * surface counts as turned `depth` away from it, so bands, seams and
     * lines all follow the shadow's edge as they follow the form's. Worked
     * out once per sample, however many paints ask. Occlusion in band mode
     * supplies lightLoss before the colour paints, shifting both bands and seam.
     */
    function facing(s, sun, shadow) {
        const d = s.n[0] * sun[0] + s.n[1] * sun[1] + s.n[2] * sun[2];
        const loss = s.lightLoss || 0;
        if (!shadow || d <= 0 || !s.volume) return d - loss;
        const key = sun.join() + '|' + shadow.softness + '|' + shadow.bias;
        const memo = s.memo || (s.memo = {});
        const vis = key in memo ? memo[key] : (memo[key] = s.volume.sunVisibility(s.x, s.y, s.z, sun, shadow));
        return vis * d - (1 - vis) * (shadow.depth ?? 0.3) - loss;
    }

    /** Cel light: tones by how directly the surface faces the sun, in bands. */
    class CelLight {
        constructor({ tones = ['#93a9b8', '#d3d9d6', '#fbf3e2'], thresholds = [0.02, 0.48], sun = [-0.62, 0.66, -0.42], shadow = null } = {}) {
            if (tones.length !== thresholds.length + 1) throw new Error('CelLight needs one more tone than thresholds');
            this.tones = tones.map(hex);
            this.thresholds = thresholds;
            this.sun = norm(sun);
            this.shadow = shadow;
        }
        apply(_c, s) {
            const d = facing(s, this.sun, this.shadow);
            let i = 0;
            for (const th of this.thresholds) if (d >= th) i++;
            return this.tones[i].slice();
        }
    }

    /** The base of a cumulus sits in its own shadow: mix toward `color` the lower the point. */
    class Lift {
        constructor({ color = '#7b90a6', amount = 0.45, height = 0.45, hard = false } = {}) {
            this.color = hex(color); this.amount = amount; this.height = height; this.hard = hard;
        }
        apply(c, s) {
            const lift = this.hard ? (s.t < this.height ? 1 : 0) : clamp(1 - s.t / this.height, 0, 1);
            return lerp3(c, this.color, this.amount * lift);
        }
    }

    /** Farther (higher) parts take on the colour of the air. */
    class Haze {
        constructor({ color = '#9cbdd3', amount = 0.25 } = {}) { this.color = hex(color); this.amount = amount; }
        apply(c, s) { return lerp3(c, this.color, this.amount * s.t * s.t); }
    }

    /** Light without bands: tones blend smoothly from facing away (lo) to facing the sun (hi). */
    class SoftLight {
        constructor({ tones = ['#93a9b8', '#d3d9d6', '#fbf3e2'], lo = -0.3, hi = 0.8, sun = [-0.62, 0.66, -0.42], shadow = null } = {}) {
            this.tones = tones.map(hex); this.lo = lo; this.hi = hi; this.sun = norm(sun); this.shadow = shadow;
        }
        apply(_c, s) {
            const d = facing(s, this.sun, this.shadow);
            const t = clamp((d - this.lo) / (this.hi - this.lo), 0, 1) * (this.tones.length - 1);
            const i = Math.min(this.tones.length - 2, Math.floor(t));
            return lerp3(this.tones[i], this.tones[i + 1], t - i);
        }
    }

    /** A band of colour along the edge of the light, where it turns to shadow: a painter's warm (or cool) seam. */
    class Terminator {
        constructor({ color = '#f0a070', at = 0.02, width = 0.08, amount = 0.7, sun = [-0.62, 0.66, -0.42], shadow = null, hard = false } = {}) {
            this.color = hex(color); this.at = at; this.width = width; this.amount = amount; this.sun = norm(sun); this.shadow = shadow;
            this.hard = hard;
        }
        apply(c, s) {
            const d = facing(s, this.sun, this.shadow);
            const t = 1 - Math.abs(d - this.at) / this.width;
            return t > 0 ? lerp3(c, this.color, this.amount * (this.hard ? 1 : Math.min(1, t * 2))) : c;
        }
    }

    /** Shade where billows meet (see Volume.crease): detail inside the big masses, only where the form folds. */
    class Crevice {
        constructor({ color = '#7b90a6', k = 3, from = 0.25, to = 0.9, amount = 0.8 } = {}) {
            this.color = hex(color); this.k = k; this.from = from; this.to = to; this.amount = amount;
        }
        apply(c, s) {
            const v = clamp((s.volume.crease(s.x, s.y, s.z, this.k) - this.from) / (this.to - this.from), 0, 1);
            return v > 0 ? lerp3(c, this.color, this.amount * v) : c;
        }
    }

    /**
     * Lines in the shadow, fixed in the world: planes `spacing` apart cut the
     * volume, so the hatching belongs to the object and turns with it.
     * Only where the surface faces away from the sun past `below`.
     */
    class Hatch {
        constructor({ color = '#1f2f6e', spacing = 6, width = 0.3, angle = 0.6, below = 0.1, sun = [-0.62, 0.66, -0.42], shadow = null } = {}) {
            this.color = hex(color); this.spacing = spacing; this.width = width; this.below = below; this.sun = norm(sun); this.shadow = shadow;
            this.dir = [Math.cos(angle), Math.sin(angle)];
        }
        apply(c, s) {
            const d = facing(s, this.sun, this.shadow);
            if (d >= this.below) return c;
            const u = (s.x * this.dir[0] + s.y * this.dir[1] + s.z * 0.3) / this.spacing;
            // Lines thicken the further into shadow, as an engraver's do.
            const w = this.width * clamp((this.below - d) / 0.6, 0.3, 1.6);
            return u - Math.floor(u) < w ? this.color.slice() : c;
        }
    }

    /**
     * Ambient occlusion (see Volume.occlusion): the less open sky a point
     * sees, the more it takes on `color`. Darkens folds by how deep they
     * are, where Crevice marks every seam alike.
     */
    class Occlusion {
        constructor({ color = '#6f8299', amount = 0.6, power = 1, step = 4, samples = 5, bands = false } = {}) {
            this.color = hex(color); this.amount = amount; this.power = power; this.opts = { step, samples };
            this.bands = bands;
        }
        apply(c, s) {
            // Before CelLight: move its boundaries and the Terminator together,
            // never mix extra shades into an already painted tone.
            if (this.bands) {
                s.lightLoss = this.amount > 0 ? this.amount * Math.pow(1 - s.volume.occlusion(s.x, s.y, s.z, s.n, this.opts), this.power) : 0;
                return c;
            }
            if (!(this.amount > 0)) return c;
            const ao = s.volume.occlusion(s.x, s.y, s.z, s.n, this.opts);
            return lerp3(c, this.color, this.amount * Math.pow(1 - ao, this.power));
        }
    }

    /**
     * Light through thin parts: on the side away from the sun, where little
     * of the volume stands between the surface and the sun (see
     * Volume.thickness), it takes on `color`, falling off as
     * exp(-density * thickness). Baked, so it does not depend on the camera:
     * the painter's silver lining, not the physics of one, which needs the
     * camera to look toward the sun.
     */
    class Glow {
        constructor({ color = '#fff1d6', amount = 0.6, density = 0.03, below = 0.15, sun = [-0.62, 0.66, -0.42] } = {}) {
            this.color = hex(color); this.amount = amount; this.density = density; this.below = below; this.sun = norm(sun);
        }
        apply(c, s) {
            if (!(this.amount > 0)) return c;
            const d = s.n[0] * this.sun[0] + s.n[1] * this.sun[1] + s.n[2] * this.sun[2];
            const w = clamp((this.below - d) / 0.5, 0, 1);
            if (!w) return c;
            const through = Math.exp(-this.density * s.volume.thickness(s.x, s.y, s.z, this.sun));
            return lerp3(c, this.color, this.amount * w * through);
        }
    }

    /** One colour everywhere: for silhouettes (masks) and flat plates. */
    class Flat {
        constructor({ color = '#ffffff' } = {}) { this.color = hex(color); }
        apply() { return this.color.slice(); }
    }

    /** Keep a painted style within its selected inks after light modifiers. */
    class Palette {
        constructor({ tones }) { this.tones = tones.map(hex); }
        apply(c) {
            let best = this.tones[0], distance = Infinity;
            for (const tone of this.tones) {
                const d = tone.reduce((sum, v, i) => sum + (v - c[i]) ** 2, 0);
                if (d < distance) { best = tone; distance = d; }
            }
            return best.slice();
        }
    }

    const paints = { CelLight, SoftLight, Lift, Haze, Terminator, Crevice, Hatch, Occlusion, Glow, Flat, Palette };

    /** Runs a chain of paints on a sample. */
    function paint(chain, sample) {
        let c = null;
        for (const p of chain) c = p.apply(c, sample);
        return c;
    }

    /**
     * A paint chain from data: [{ type: 'CelLight', ...settings }, ...].
     * `shared` settings (e.g. the sun) go to every paint that does not set its own.
     */
    function build(spec, shared = {}) {
        return spec.map(({ type, ...o }) => {
            const P = paints[type];
            if (!P) throw new Error(`no paint "${type}" (have: ${Object.keys(paints).join(', ')})`);
            return new P({ ...shared, ...o });
        });
    }

    // ── Styles: a look, as data ───────────────────────────────────────────
    //
    // A style is a sky, a blend, a sun and a paint chain, and says what it is
    // for. Add one by adding an entry. Any setting can still be overridden
    // from a study page's query.

    const styles = {
        afternoon: {
            intent: 'Baseline: our draft look, a calm painted cumulus on a faded summer afternoon.',
            sky: ['#5f93bf', '#9cbdd3', '#e3e6da'], blend: 6, sun: [-0.62, 0.66, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#93a9b8', '#d3d9d6', '#fbf3e2'], thresholds: [0.02, 0.48] },
                { type: 'Lift', color: '#7b90a6', amount: 0.45 },
                { type: 'Haze', color: '#9cbdd3', amount: 0.2 }
            ]
        },
        poster: {
            intent: 'Does it hold with two tones? Bold, graphic: light and shadow only, big blend.',
            sky: ['#2f6fd0', '#79b2ea'], blend: 14, sun: [-0.62, 0.66, -0.42],
            paints: [{ type: 'CelLight', tones: ['#5d86d6', '#ffffff'], thresholds: [0.1] }]
        },
        golden: {
            intent: 'Can light and colour carry a mood? Low warm sun from the side, violet shade, a glowing seam where they meet.',
            sky: ['#43507e', '#b07a8c', '#f2b77d'], blend: 8, sun: [-0.9, 0.25, -0.2],
            paints: [
                { type: 'CelLight', tones: ['#6b5f95', '#b892b2', '#ffdcae'], thresholds: [-0.05, 0.35] },
                { type: 'Terminator', color: '#ff9a6a', at: -0.05, width: 0.09, amount: 0.75 },
                { type: 'Lift', color: '#4d4878', amount: 0.4 }
            ]
        },
        crevice: {
            intent: 'Does shade where billows meet bring back detail inside the big masses (tone boundaries toward the reference)?',
            sky: ['#5f93bf', '#9cbdd3', '#e3e6da'], blend: 6, sun: [-0.62, 0.66, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#93a9b8', '#d3d9d6', '#fbf3e2'], thresholds: [0.02, 0.48] },
                { type: 'Crevice', color: '#a6b6c2', k: 3, from: 0.3, to: 0.7, amount: 0.9 },
                { type: 'Lift', color: '#7b90a6', amount: 0.45 },
                { type: 'Haze', color: '#9cbdd3', amount: 0.2 }
            ]
        },
        engraved: {
            intent: 'Does a pattern stick to the object as it turns? Ink hatching fixed in the world, on paper.',
            sky: ['#d8cdb4', '#e9e0cc'], blend: 8, sun: [-0.62, 0.66, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#e6dbc3', '#fbf6ea'], thresholds: [0.35] },
                { type: 'Hatch', color: '#2a3470', spacing: 9, width: 0.3, angle: 0.5, below: 0.35 }
            ]
        },
        foundation: {
            physicalLight: true,
            finitePalette: true,
            intent: 'Painted physical light: the atmosphere chooses flat tones; cast shadow and occlusion place hard cel bands, with a shaded base and a thin terminator seam.',
            sky: ['#5f93bf', '#9cbdd3', '#e3e6da'], blend: 6, sun: [-0.62, 0.66, -0.42],
            noise: { amount: 4, scale: 30, octaves: 3, billow: true, seed: 1 },     // chosen from renders/sweeps/noise-billow.png
            shadow: { softness: 8, bias: 2, depth: 0.3 },
            paints: [
                { type: 'Occlusion', bands: true, amount: 0.5 },
                { type: 'CelLight', tones: ['#93a9b8', '#d3d9d6', '#fbf3e2'], thresholds: [0.02, 0.48] },
                { type: 'Lift', color: '#7b90a6', amount: 0.35, height: 0.18, hard: true },
                { type: 'Terminator', color: '#f0b08c', at: 0.02, width: 0.035, amount: 0.35, hard: true }
            ]
        },
        tatami: {
            intent: "The live tatami room's cumulus: round puffs, each with a white lit cap and blue shade beneath, a darker crease where puffs overlap.",
            sky: ['#1542c4', '#2a69ea', '#72a5f7'], blend: 4, sun: [-0.5, 0.75, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#95b0ee', '#dce7fc', '#ffffff'], thresholds: [-0.05, 0.3] },
                { type: 'Crevice', color: '#7d9ae0', k: 3, from: 0.5, to: 0.8, amount: 0.6 },
                { type: 'Lift', color: '#8ea9e6', amount: 0.4, height: 0.18, hard: true }
            ]
        },
        foliage: {
            intent: "The tatami room's garden leaves: deep cobalt clumps, a lit cap on each, the underside sinking into shade.",
            sky: ['#1542c4', '#2a69ea', '#72a5f7'], blend: 4, sun: [-0.5, 0.75, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#183676', '#26509e', '#4272c2'], thresholds: [-0.1, 0.4] },
                { type: 'Lift', color: '#0e2256', amount: 0.5, height: 0.2, hard: true }
            ]
        },
        foliagePixel: {
            intent: 'Garden leaves for the pixel look: four hard steps from deep shade to a bright lit top, so each clump of dabs reads at low resolution.',
            sky: ['#1542c4', '#2a69ea', '#72a5f7'], blend: 4, sun: [-0.5, 0.75, -0.42],
            paints: [
                { type: 'CelLight', tones: ['#0f2860', '#20489a', '#3a6cc4', '#7aaaf0'], thresholds: [-0.25, 0.15, 0.55] },
                { type: 'Lift', color: '#0b1d4c', amount: 0.55, height: 0.15, hard: true }
            ]
        },
        hydrangea: {
            intent: 'Hydrangea heads in the tatami garden: periwinkle florets, pale where the light catches.',
            sky: ['#1542c4', '#2a69ea', '#72a5f7'], blend: 4, sun: [-0.5, 0.75, -0.42],
            paints: [{ type: 'CelLight', tones: ['#6272d6', '#8c9af0', '#cdd4fe'], thresholds: [-0.05, 0.4] }]
        },
        soft: {
            intent: 'Does it work without bands? Smooth light, wide blend, a watercolour wash.',
            sky: ['#7aa7cf', '#bcd3e3', '#efe9dc'], blend: 12, sun: [-0.62, 0.66, -0.42],
            paints: [
                { type: 'SoftLight', tones: ['#8fa3bd', '#c9d3dc', '#fff8ec'], lo: -0.4, hi: 0.7 },
                { type: 'Lift', color: '#8195ad', amount: 0.35 },
                { type: 'Haze', color: '#bcd3e3', amount: 0.3 }
            ]
        }
    };

    /**
     * A style with a page's overrides applied: `blend`, `sun`, `noise.*` and
     * `shadow.*` (shadow: 'off' turns cast shadows off), and
     * `paint.<Type>.<setting>` for any paint in the chain. Returns
     * { blend, sun, noise, shadow, paints }: everything the volume and the
     * chain are built from.
     */
    /** A white cloud's palette: linear sunlight plus overhead sky fill, then display exposure.
     * Fixed gains preserve the cel bands; no elevation-dependent colour ramps.
     * Height is metres above sea level, independent of the sculpted volume's units.
     */
    class PhysicalLight {
        constructor(sun, options = {}) {
            this.sky = new root.Sky({ height: 1000, ...options });
            this.direct = this.sky.transmittance(sun);
            this.fill = this.sky.radiance([0, 1, 0], sun);
        }
        color(direct, fill = 0.7) {
            const rgb = this.sky.tone(this.direct.map((v, i) => direct * v + fill * this.fill[i]));
            return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
        }
        palette() {
            return {
                CelLight: { tones: [this.color(0), this.color(0.07), this.color(0.18)] },
                Occlusion: { color: this.color(0, 0.3) },
                Glow: { color: this.color(0.18) },
                Terminator: { color: this.color(0.10, 0.3) },
                Lift: { color: this.color(0, 0.4) },
                Haze: { color: this.color(0, 1) }
            };
        }
    }

    function resolve(st, o = {}) {
        const off = v => v === 'off' || v === 0 || v === false;
        const merge = (base, over) => (off(over) ? null : base || over ? { ...(base || {}), ...(over || {}) } : null);
        const over = o.paint || {};
        const sun = o.sun ?? st.sun;
        const light = st.physicalLight ? new PhysicalLight(sun, o.atmosphere).palette() : {};
        return {
            blend: o.blend ?? st.blend,
            sun,
            noise: merge(st.noise, o.noise),
            shadow: merge(st.shadow, o.shadow),
            paints: st.paints.map(q => ({ ...q, ...light[q.type], ...(over[q.type] || {}) })).concat(
                st.finitePalette ? [{ type: 'Palette', tones: over.CelLight?.tones || light.CelLight?.tones || st.paints.find(p => p.type === 'CelLight').tones }] : [])
        };
    }

    // ── Slicer ────────────────────────────────────────────────────────────

    /**
     * Cuts a volume into `count` layers from the ground up and paints each,
     * at `res` texels per world unit. A layer is { h, t, x0, z0, res, width,
     * height, data (RGBA, Uint8ClampedArray) }: a painting of that slice seen
     * from above, ready to be stacked.
     */
    class Slicer {
        /**
         * `shell`: only points within this depth of the surface are painted
         * with the chain; deeper ones can never be seen from any angle and get
         * `core`, a plain colour. Defaults to four slice steps, enough for the
         * thin rim of each slice that shows on the sides of the stack.
         */
        constructor({ count = 160, res = 1, shell = null, core = '#7b90a6' } = {}) {
            this.count = count; this.res = res; this.shell = shell; this.core = hex(core);
        }

        cut(volume, chain) {
            const B = volume.bounds, res = this.res;
            const shell = this.shell ?? Math.max(4, 4 * B.top / this.count);
            const x0 = Math.floor(B.x0), z0 = Math.floor(B.z0);
            const width = Math.ceil((B.x1 - x0) * res) + 1, height = Math.ceil((B.z1 - z0) * res) + 1;
            const layers = [];
            for (let i = 0; i < this.count; i++) {
                const h = (i + 0.5) / this.count * B.top, t = h / B.top;
                const data = new Uint8ClampedArray(width * height * 4);
                let any = false;
                for (let v = 0; v < height; v++) {
                    const z = z0 + (v + 0.5) / res;
                    for (let u = 0; u < width; u++) {
                        const x = x0 + (u + 0.5) / res;
                        const dep = volume.depth(x, h, z);
                        if (dep <= 0) continue;
                        const c = dep > shell ? this.core : paint(chain, { x, y: h, z, n: volume.normal(x, h, z), t, volume });
                        const k = (v * width + u) * 4;
                        data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
                        any = true;
                    }
                }
                if (any) layers.push({ h, t, x0, z0, res, width, height, data });
            }
            return layers;
        }
    }

    // ── StackView ─────────────────────────────────────────────────────────

    /**
     * Draws painted layers as a stack, bottom to top, each at its height and
     * the camera's turn. Each layer is repeated enough times to close the gap
     * to the next on screen, so the sides read as solid.
     */
    class StackView {
        constructor(layers) {
            this.layers = layers;
            this.images = null;
        }
        _images() {
            if (!this.images) {
                this.images = this.layers.map(L => {
                    const c = document.createElement('canvas');
                    c.width = L.width; c.height = L.height;
                    c.getContext('2d').putImageData(new ImageData(L.data, L.width, L.height), 0, 0);
                    return c;
                });
            }
            return this.images;
        }
        /** The transform taking layer L's texels to the screen: six numbers for setTransform. */
        static transform(cam, L) {
            const [a, b, c, d, e, f] = cam.matrix(L.h);
            return [a / L.res, b / L.res, c / L.res, d / L.res, a * L.x0 + c * L.z0 + e, b * L.x0 + d * L.z0 + f];
        }
        draw(g, cam) {
            const imgs = this._images();
            const L = this.layers;
            const step = L.length > 1 ? (L[1].h - L[0].h) * Math.cos(cam.phi) * cam.scale : 1;
            const reps = Math.max(1, Math.ceil(step));
            g.save();
            g.imageSmoothingEnabled = true;
            L.forEach((layer, i) => {
                const [a, b, c, d, e, f] = StackView.transform(cam, layer);
                for (let k = 0; k < reps; k++) {
                    g.setTransform(a, b, c, d, e, f - step * k / reps);
                    g.drawImage(imgs[i], 0, 0);
                }
            });
            g.restore();
        }
    }

    /**
     * As a Stack mode, so study pages and sweeps can use it like any other.
     * Layers are painted once per pile and settings, then only stacked.
     */
    if (S && S.modes) {
        S.modes.layers = {
            // style: a name in Layers.styles; other settings override it (see resolve).
            // mask: the silhouette in white, the same volume, for measuring.
            defaults: { style: 'afternoon', slices: 160, res: 1 },
            draw(g, pile, cam, o) {
                const st = styles[o.style];
                if (!st) throw new Error(`no style "${o.style}" (have: ${Object.keys(styles).join(', ')})`);
                const r = resolve(st, o);
                const key = JSON.stringify(['layers', o.style, o.slices, o.res, r, !!o.mask]);
                pile._views ||= new Map();
                let view = pile._views.get(key);
                if (!view) {
                    const chain = o.mask ? [new Flat()] : build(r.paints, { sun: r.sun, shadow: r.shadow });
                    const volume = new Volume(pile.spheres, { blend: r.blend, noise: r.noise });
                    view = new StackView(new Slicer({ count: o.slices, res: o.res }).cut(volume, chain));
                    pile._views.set(key, view);
                }
                // Layers are in world units; draw them in the camera's pixels.
                view.draw(g, cam);
            }
        };
    }

    root.Layers = { Noise, Volume, PhysicalLight, paints, paint, build, resolve, styles, Slicer, StackView };
})(typeof window !== 'undefined' ? window : globalThis);
