/*
 * pixel.js — pixel art drawn one object at a time.
 *
 * A pixel artist does not shrink a painting: every object is drawn at the
 * art's resolution with its own small palette ramp, its own light, dither
 * only where one step of its ramp meets the next, a selective outline (dark
 * on the side away from the light, none on the lit side), and no stray
 * single pixels. This file is those rules as code:
 *
 *   Ramp     a few colours, dark to light; a value 0..1 picks one, and
 *            values near the midpoint between two steps are dithered with
 *            a 2x2 ordered pattern (25 / 50 / 75 %).
 *   Sprite   one object: a value per pixel (its light) and a material slot
 *            per pixel (which ramp), filled with crisp shapes (no
 *            antialiasing), or from 3D spheres (see spheres()).
 *            paint() turns it into pixels: ramp, outline, clean-up.
 *
 * Nothing here is scene-specific. js/scenes/tatami-pixel/ draws the room.
 */
(function (root) {
    'use strict';
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    // 2x2 ordered dither thresholds, by (y & 1) * 2 + (x & 1).
    const BAYER = [0.125, 0.625, 0.875, 0.375];
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    /** A fixed pseudo-random 0..1 per integer cell. */
    const hash = (x, y, seed = 0) => { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

    class Ramp {
        /** `colors` dark to light. `band` is how much of each step is dithered (0: none, 1: all). */
        constructor(colors, { band = 0.4 } = {}) {
            this.colors = colors.map(c => (typeof c === 'string' ? hex(c) : c));
            this.band = band;
            this.dithered = false;
        }
        get n() { return this.colors.length; }
        /** The step for value v at pixel (x, y); sets this.dithered when the pattern chose it. */
        index(v, x, y, band = this.band) {
            const n = this.colors.length - 1;
            const t = clamp01(v) * n;
            const i = Math.min(n - 1, Math.floor(t)), f = t - i;
            this.dithered = false;
            if (n === 0) return 0;
            const lo = 0.5 - band / 2;
            if (band > 0 && f > lo && f < lo + band) {
                this.dithered = true;
                return (f - lo) / band > BAYER[((y & 1) << 1) | (x & 1)] ? i + 1 : i;
            }
            return f >= 0.5 ? i + 1 : i;
        }
        /** A new ramp mixed `k` of the way toward colour c (for distance haze). */
        toward(c, k) {
            const t = typeof c === 'string' ? hex(c) : c;
            const r = new Ramp(this.colors.map(a => a.map((v, i) => Math.round(v + (t[i] - v) * k))), { band: this.band });
            return r;
        }
    }

    class Sprite {
        constructor(w, h) {
            this.w = w; this.h = h;
            this.v = new Float32Array(w * h).fill(NaN);
            this.m = new Uint8Array(w * h);
            this.lock = new Uint8Array(w * h); // pixels set exactly: never outlined or cleaned
        }
        has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && !Number.isNaN(this.v[y * this.w + x]); }
        set(x, y, v, m = 0, lock = 0) {
            x = Math.floor(x); y = Math.floor(y);
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
            const k = y * this.w + x;
            // A value function may answer [v, m, lock] to pick the material per pixel.
            const got = typeof v === 'function' ? v(x, y) : v;
            if (Array.isArray(got)) { this.v[k] = got[0]; this.m[k] = got[1]; this.lock[k] = got[2] || 0; }
            else { this.v[k] = got; this.m[k] = m; this.lock[k] = lock; }
        }
        erase(x, y) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.v[y * this.w + x] = NaN; }

        // ── Shapes, sampled at pixel centres: crisp, no antialiasing ─────
        rect(x0, y0, x1, y1, v, m = 0, lock = 0) {
            const a = Math.round(Math.min(x0, x1)), b = Math.round(Math.max(x0, x1));
            const c = Math.round(Math.min(y0, y1)), d = Math.round(Math.max(y0, y1));
            for (let y = c; y < d; y++) for (let x = a; x < b; x++) this.set(x, y, v, m, lock);
        }
        /** A polygon, even-odd, filled where pixel centres fall inside. */
        poly(pts, v, m = 0, lock = 0) {
            let y0 = Infinity, y1 = -Infinity;
            for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
                const cy = y + 0.5, xs = [];
                for (let i = 0; i < pts.length; i++) {
                    const a = pts[i], b = pts[(i + 1) % pts.length];
                    if ((a.y <= cy) !== (b.y <= cy)) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
                }
                xs.sort((p, q) => p - q);
                for (let i = 0; i + 1 < xs.length; i += 2)
                    for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, v, m, lock);
            }
        }
        /** A one-pixel line, Bresenham: no doubled pixels at the steps. */
        line(x0, y0, x1, y1, v, m = 0, lock = 0) {
            x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
            const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            let e = dx + dy;
            for (;;) {
                this.set(x0, y0, v, m, lock);
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * e;
                if (e2 >= dy) { e += dy; x0 += sx; }
                if (e2 <= dx) { e += dx; y0 += sy; }
            }
        }
/** A line drawn only over pixels for which keep(x, y) holds. */
        lineOver(x0, y0, x1, y1, keep, v, m = 0, lock = 1) {
            const saved = this.set;
            this.set = (x, y, vv, mm, ll) => { x = Math.floor(x); y = Math.floor(y); if (keep(x, y)) saved.call(this, x, y, typeof vv === 'function' ? vv(x, y) : vv, mm, ll); };
            this.line(x0, y0, x1, y1, v, m, lock);
            this.set = saved;
        }
        /** Every pixel in the box where inside(x, y) is a value (not NaN): free-form shapes in any frame. */
        shape(x0, y0, x1, y1, inside, m = 0, lock = 0) {
            for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
                const v = inside(x + 0.5, y + 0.5);
                if (v === null || v === undefined || Number.isNaN(v)) continue;
                if (Array.isArray(v)) this.set(x, y, v[0], v[1], v[2] || 0); else this.set(x, y, v, m, lock);
            }
        }
        ellipse(cx, cy, rx, ry, v, m = 0, lock = 0) {
            for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
                for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                    if (dx * dx + dy * dy <= 1) this.set(x, y, typeof v === 'function' ? v(dx, dy, x, y) : v, m, lock);
                }
        }

        /**
         * 3D spheres (a Stack shape) seen through `camera` (a LivingSky
         * CameraPreset), `width` pixels across, centred on cx with the base on
         * baseY. Each pixel takes its own sphere's exact normal, so every
         * clump has its own lit cap; `light` is a world direction. Where a
         * nearer clump overlaps a farther one, the far side of the seam is
         * darkened (`crease`), the way an artist separates clumps. `parts`
         * maps a sphere's part to a material slot.
         */
        spheres(shape, { cx, baseY, width, camera, light, parts = {}, crease = 0.3, lift = 0.25, liftHeight = 0.25, wrap = 0.35,
            form = 0, texture = 0, cell = 2, ragged = 0, seed = 1 }) {
            const S = root.Stack, LS = root.LivingSky;
            const pile = S.pile(shape), b = pile.bounds;
            const aspect = (b.top + (b.z1 - b.z0) * 0.35) / (b.x1 - b.x0) * 1.3 + 0.1;
            const bw = Math.max(4, Math.round(width * 1.15)), bh = Math.max(4, Math.round(bw * aspect));
            const imp = LS.PaintedCloud.impostors(pile.spheres, camera.frame(b, bw, bh, { fit: 0.98 }), bw, bh, b.top);
            let x0 = bw, x1 = -1, y1 = -1;
            for (let k = 0; k < bw * bh; k++) if (imp.covered[k]) { const x = k % bw, y = (k - x) / bw; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
            if (x1 < 0) return this;
            // Re-run at the size that makes the silhouette exactly `width` wide.
            const k = width / (x1 + 1 - x0);
            const W = Math.max(4, Math.round(bw * k)), H = Math.max(4, Math.round(bh * k));
            const im = LS.PaintedCloud.impostors(pile.spheres, camera.frame(b, W, H, { fit: 0.98 }), W, H, b.top);
            let a0 = W, a1 = -1, c1 = -1;
            for (let q = 0; q < W * H; q++) if (im.covered[q]) { const x = q % W, y = (q - x) / W; a0 = Math.min(a0, x); a1 = Math.max(a1, x); c1 = Math.max(c1, y); }
            const ox = Math.round(cx - (a0 + a1 + 1) / 2), oy = Math.round(baseY - (c1 + 1));
            const L = light, N = im.normals.slice();
            // `form`: bend each clump's normal toward the big masses' normal, so
            // the heap is lit as a few large forms with the clumps as detail.
            if (form > 0) {
                // The big masses' normal: the clumps' normals averaged over a
                // wide neighbourhood (a tenth of the width), inside the silhouette.
                const B = S.blurField(im.normals, im.covered, W, H, Math.max(2, width * 0.1));
                for (let q = 0; q < W * H; q++) {
                    if (!im.covered[q]) continue;
                    const n0 = N[q * 3] * (1 - form) + B[q * 3] * form, n1 = N[q * 3 + 1] * (1 - form) + B[q * 3 + 1] * form, n2 = N[q * 3 + 2] * (1 - form) + B[q * 3 + 2] * form;
                    const m = Math.hypot(n0, n1, n2) || 1;
                    N[q * 3] = n0 / m; N[q * 3 + 1] = n1 / m; N[q * 3 + 2] = n2 / m;
                }
            }
            const edge = q => { const x = q % W; return (x && !im.covered[q - 1]) || (x < W - 1 && !im.covered[q + 1]) || q < W || !im.covered[q - W] || q + W >= W * H || !im.covered[q + W]; };
            for (let q = 0; q < W * H; q++) {
                if (!im.covered[q]) continue;
                const x = q % W, y = (q - x) / W;
                const d = N[q * 3] * L[0] + N[q * 3 + 1] * L[1] + N[q * 3 + 2] * L[2];
                let v = clamp01((d + wrap) / (1 + wrap));
                if (im.heights[q] < liftHeight) v *= 1 - lift * (1 - im.heights[q] / liftHeight);
                // A crease on the far clump, just outside a nearer one's rim.
                for (const n of [x ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q - W, q + W]) {
                    if (n < 0 || n >= W * H || !im.covered[n] || im.sphere[n] === im.sphere[q]) continue;
                    if (im.depth[n] - im.depth[q] > 2 / k) { v -= crease; break; }
                }
                const part = shape[im.sphere[q]].part;
                // Leaves: clustered speckle inside, bites out of the silhouette.
                if (texture) v += (hash((ox + x) >> (cell >> 1), (oy + y) >> (cell >> 1), seed) - 0.5) * texture;
                if (ragged && edge(q) && hash(ox + x, oy + y, seed + 7) < ragged) continue;
                this.set(ox + x, oy + y, v, parts[part] || 0);
            }
            return this;
        }

        /**
         * The object as pixels, on a canvas the sprite's size.
         * ramps: one per material slot. outline: 'sel' (darkest step on the
         * side away from `light`, a screen direction), 'all', or 'none'.
         * clean: replace lone pixels that the dither did not put there.
         */
        paint(ramps, { outline = 'sel', light = [-1, -1], clean = true, rim = false } = {}) {
            const { w, h, v, m, lock } = this;
            const idx = new Int16Array(w * h).fill(-1), dith = new Uint8Array(w * h);
            for (let k = 0; k < w * h; k++) {
                if (Number.isNaN(v[k])) continue;
                const x = k % w, y = (k - x) / w, r = ramps[m[k]];
                idx[k] = r.index(v[k], x, y);
                dith[k] = r.dithered ? 1 : 0;
            }
            if (clean) {
                const src = idx.slice();
                for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                    const k = y * w + x;
                    if (src[k] < 0 || dith[k] || lock[k]) continue;
                    const a = src[k - 1], b = src[k + 1], c = src[k - w], d = src[k + w];
                    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
                    if (m[k - 1] !== m[k] || m[k + 1] !== m[k] || m[k - w] !== m[k] || m[k + w] !== m[k]) continue;
                    if (a !== src[k] && b !== src[k] && c !== src[k] && d !== src[k]) {
                        // The most common neighbour takes the pixel.
                        const counts = new Map();
                        for (const n of [a, b, c, d]) counts.set(n, (counts.get(n) || 0) + 1);
                        idx[k] = [...counts].sort((p, q) => q[1] - p[1])[0][0];
                        dith[k] = dith[k - 1] && dith[k + 1] ? 1 : 0;
                    }
                }
            }
            if (outline !== 'none') {
                const src = idx.slice(), lx = Math.sign(light[0]), ly = Math.sign(light[1]);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const k = y * w + x;
                    if (src[k] < 0 || lock[k]) continue;
                    let away = false, toward = false;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const X = x + dx, Y = y + dy;
                        if (X >= 0 && Y >= 0 && X < w && Y < h && src[Y * w + X] >= 0) continue;
                        // An edge facing the light (its outside lies toward it) is lit.
                        if ((dx && dx === lx) || (dy && dy === ly)) toward = true; else away = true;
                    }
                    if (outline === 'all' && (away || toward)) idx[k] = 0;
                    else if (away && outline === 'sel') idx[k] = 0;
                    else if (toward && rim) idx[k] = Math.min(ramps[m[k]].n - 1, src[k] + 1);
                }
            }
            const canvas = root.document.createElement('canvas'); canvas.width = w; canvas.height = h;
            const g = canvas.getContext('2d'), img = g.createImageData(w, h), d = img.data;
            for (let k = 0; k < w * h; k++) {
                if (idx[k] < 0) continue;
                const c = ramps[m[k]].colors[idx[k]];
                d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255;
            }
            g.putImageData(img, 0, 0);
            return canvas;
        }
    }

    /** A canvas the art's size, drawn without smoothing. */
    function layer(w, h) {
        const canvas = root.document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
        return { canvas, g };
    }

    root.Pixel = { Ramp, Sprite, layer, hex, hash, BAYER };
})(typeof window !== 'undefined' ? window : globalThis);
