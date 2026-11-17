/*
 * painter.js — a small kit for painting anime-style backgrounds on a canvas.
 *
 * Every scene on the site is built from these pieces. It paints at the
 * screen's full resolution, never pixel art, and leans on the tricks
 * background painters use:
 *
 *   - clouds built from billows, each shaded in tones (shadow, body, light,
 *     highlight) with slightly ragged, brushed edges rather than perfect
 *     circles
 *   - paper and brush grain, so flat fills read as paint, not vector
 *   - bloom: bright sky spilling light over whatever frames it
 *   - soft light shafts and drifting dust
 *
 * Plain script, no build step. It defines one global, `Painter`.
 */
(function () {
    'use strict';

    const TAU = Math.PI * 2;

    // ── Randomness ───────────────────────────────────────────────────────

    /** Seeded PRNG (mulberry32). Same seed, same painting. */
    function rng(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** 2D value noise with fractal octaves. Returns fbm(x, y) in roughly 0..1. */
    function noise2D(seed) {
        const r = rng(seed);
        const SIZE = 256;
        const perm = new Uint8Array(SIZE * 2);
        const vals = new Float32Array(SIZE);
        for (let i = 0; i < SIZE; i++) { perm[i] = i; vals[i] = r(); }
        for (let i = SIZE - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
        }
        for (let i = 0; i < SIZE; i++) perm[i + SIZE] = perm[i];

        const smooth = t => t * t * (3 - 2 * t);
        function v(x, y) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const X = xi & 255, Y = yi & 255;
            const a = vals[perm[X + perm[Y]]];
            const b = vals[perm[X + 1 + perm[Y]]];
            const c = vals[perm[X + perm[Y + 1]]];
            const d = vals[perm[X + 1 + perm[Y + 1]]];
            const u = smooth(xf), w = smooth(yf);
            return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
        }
        return function fbm(x, y, octaves = 4) {
            let sum = 0, amp = 0.5, freq = 1, norm = 0;
            for (let o = 0; o < octaves; o++) {
                sum += v(x * freq, y * freq) * amp;
                norm += amp; amp *= 0.5; freq *= 2.03;
            }
            return sum / norm;
        };
    }

    // ── Canvases ─────────────────────────────────────────────────────────

    /** An offscreen canvas in CSS pixels, backed at `dpr`. */
    function layer(w, h, dpr = 1) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * dpr));
        c.height = Math.max(1, Math.ceil(h * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { canvas: c, g, w, h, dpr };
    }

    /**
     * A blurred copy of a canvas, made by stepping it down in size and back
     * up. Works in every browser, unlike `ctx.filter`, and is cheap enough to
     * run on resize.
     */
    function blur(src, radius) {
        const steps = Math.max(1, Math.round(Math.log2(Math.max(2, radius))));
        let cur = src;
        let w = src.width, h = src.height;
        for (let i = 0; i < steps; i++) {
            w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(cur, 0, 0, w, h);
            cur = c;
        }
        const out = document.createElement('canvas');
        out.width = src.width; out.height = src.height;
        const g = out.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(cur, 0, 0, src.width, src.height);
        return out;
    }

    // ── Texture ──────────────────────────────────────────────────────────

    /**
     * A tileable paper/brush grain: soft blotches plus fine tooth, as a
     * grey-on-transparent canvas meant for `overlay` or `soft-light`.
     */
    function paper(size = 256, seed = 7) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const img = g.createImageData(size, size);
        const n = noise2D(seed);
        const r = rng(seed + 1);
        const f = 6 / size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Tileable by blending four samples across the seam.
                const fx = x / size, fy = y / size;
                const s =
                    n(x * f, y * f, 4) * (1 - fx) * (1 - fy) +
                    n((x - size) * f, y * f, 4) * fx * (1 - fy) +
                    n(x * f, (y - size) * f, 4) * (1 - fx) * fy +
                    n((x - size) * f, (y - size) * f, 4) * fx * fy;
                const tooth = (r() - 0.5) * 0.22;
                const v = Math.max(0, Math.min(1, 0.5 + (s - 0.5) * 1.6 + tooth));
                const i = (y * size + x) * 4;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
                img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }

    /** Lays a tiled texture over everything already painted in `g`. */
    function grain(g, tex, w, h, { alpha = 0.12, mode = 'soft-light', scale = 1, ox = 0, oy = 0, keepAlpha = true } = {}) {
        const pat = g.createPattern(tex, 'repeat');
        if (!pat) return;
        // Blend modes paint into transparent pixels too, which would lay a
        // grey veil over everything behind a layer with holes in it. Keep a
        // copy of the layer's coverage and cut the grain back to it.
        let copy = null;
        if (keepAlpha && g.canvas) {
            copy = document.createElement('canvas');
            copy.width = g.canvas.width; copy.height = g.canvas.height;
            copy.getContext('2d').drawImage(g.canvas, 0, 0);
        }
        g.save();
        g.globalAlpha = alpha;
        g.globalCompositeOperation = mode;
        g.translate(ox, oy);
        g.scale(scale, scale);
        g.fillStyle = pat;
        g.fillRect(-ox / scale, -oy / scale, w / scale + tex.width, h / scale + tex.height);
        g.restore();
        if (copy) {
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(copy, 0, 0);
            g.restore();
        }
    }

    // ── Shapes ───────────────────────────────────────────────────────────

    /**
     * A circle whose edge is pushed in and out by noise, the way a brush
     * never quite follows a compass. `amp` is a fraction of the radius.
     */
    function wobblyCircle(g, x, y, r, n, amp = 0.06, seed = 0, freq = 3) {
        const pts = Math.max(28, Math.min(160, Math.round(r * 0.9)));
        g.moveTo(x + r, y);
        for (let i = 0; i <= pts; i++) {
            const a = (i / pts) * TAU;
            const k = 1 + (n(Math.cos(a) * freq + seed, Math.sin(a) * freq + seed * 1.7, 3) - 0.5) * 2 * amp;
            g.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
        }
        g.closePath();
    }

    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    // ── Clouds ───────────────────────────────────────────────────────────

    const CLOUD_TONES = {
        deep: [70, 124, 226],      // underside, turned away from the sun
        shadow: [112, 160, 240],   // shade: nearly the sky's own blue
        body: [172, 202, 247],     // the turning edge, kept thin
        light: [232, 240, 254],    // sunlit face
        white: [255, 255, 255]     // the very top of each billow
    };

    /**
     * Billows for a towering cumulonimbus rising from `baseY`: heavy at the
     * base, a leaning column, a crown boiling over the top. Big billows sit
     * inside the mass and small ones crowd its edges, which is what makes a
     * cumulus read as cauliflower rather than a pile of balls.
     */
    function towerBillows(r, cx, baseY, width, height) {
        const out = [];
        const half = t => width * (0.5 - 0.24 * t + 0.32 * Math.pow(t, 5));
        const lean = t => width * 0.06 * Math.sin(t * 2.2);
        const count = 90;
        for (let i = 0; i < count; i++) {
            const t = Math.pow(r(), 0.85);
            const hw = half(t);
            const u = r() * 2 - 1;
            const edge = Math.abs(u);
            const rad = width * (0.05 + 0.1 * (1 - edge) * (0.6 + r() * 0.6)) * (1 - 0.25 * t);
            out.push({
                x: cx + lean(t) + u * (hw * 0.94 - rad * 0.7),
                y: baseY - t * height * 0.86 + (r() - 0.5) * rad * 0.4,
                r: rad,
                z: r() * rad * 0.6
            });
        }
        // The crown.
        for (let j = 0; j < 9; j++) {
            const a = j / 8 - 0.5;
            const rad = width * (0.07 + r() * 0.07) * (1 - Math.abs(a) * 0.6);
            out.push({
                x: cx + lean(1) + a * width * 0.78 + (r() - 0.5) * width * 0.04,
                y: baseY - height * 0.86 + Math.pow(Math.abs(a), 1.5) * height * 0.2 - rad * 0.3,
                r: rad, z: r() * rad
            });
        }
        // Small knobs bubbling off the sunny edge.
        for (let j = 0; j < 6; j++) {
            const t = r();
            out.push({
                x: cx + lean(t) - half(t) * (0.92 + r() * 0.1),
                y: baseY - t * height * 0.86,
                r: width * (0.02 + r() * 0.03), z: 0
            });
        }
        return out;
    }

    /**
     * Billows for a great summer cumulus, built the way they are painted: a
     * stack of horizontal shelves, broad at the base, each shelf a row of
     * billows whose lit caps sit over the shaded underside of the shelf above.
     */
    function cumulusBillows(r, cx, baseY, width, height, { layers = 5, lean = 0.08 } = {}) {
        const out = [];
        let drift = 0;
        for (let i = 0; i < layers; i++) {
            const t = i / (layers - 1);
            // Broad and heavy at the base, a slight waist, a rounded crown.
            // Stays broad high up, so the top reads as a heavy, boiling mass.
            const half = width * (0.5 - 0.05 * t - 0.3 * Math.pow(t, 4)) * (0.78 + r() * 0.44);
            drift += (r() - 0.45) * width * 0.11;
            const ccx = cx + drift + lean * width * t;
            const rad = height * (0.2 - 0.05 * t);
            const y = baseY - rad * 0.6 - t * (height - rad * 1.6);
            const n = Math.max(2, Math.round((2 * half) / (rad * 0.85)));
            for (let j = 0; j < n; j++) {
                const sx = n === 1 ? 0.5 : j / (n - 1);
                const arch = Math.sin(sx * Math.PI);
                const ax = 1.02 + r() * 0.3;
                out.push({
                    x: ccx + (sx - 0.5) * 2 * (half - rad * 0.6) + (r() - 0.5) * rad * 0.6,
                    y: y - arch * rad * 0.35 + (r() - 0.5) * rad * 0.75,
                    r: rad * (0.48 + r() * 0.62) * (0.78 + 0.22 * arch),
                    ax, z: 0
                });
            }
        }
        // Loose puffs breaking off the lower flanks.
        for (let k = 0; k < 5; k++) {
            const side = k % 2 ? 1 : -1;
            const t = r() * 0.35;
            out.push({ x: cx + side * width * (0.5 + r() * 0.12), y: baseY - height * (0.05 + t * 0.4), r: height * (0.05 + r() * 0.04), z: 0 });
        }
        return out;
    }

    /** Billows for a fair-weather cumulus: a domed row over a flat base. */
    function puffBillows(r, cx, cy, width) {
        const out = [];
        const n = 9 + Math.floor(r() * 6);
        for (let i = 0; i < n; i++) {
            const s = r();
            const hump = Math.sin(s * Math.PI);
            const rad = width * (0.05 + 0.1 * hump * (0.6 + r() * 0.6));
            out.push({ x: cx + (s - 0.5) * width * 0.86, y: cy - hump * width * 0.12 * r() - rad * 0.2, r: rad, z: r() * rad * 0.5 });
        }
        return out;
    }

    /**
     * Billows filling an ellipse, biggest in the middle: a tree's crown, a
     * shrub. Dense enough to read as one mass, ragged at the rim.
     */
    function clumpBillows(r, cx, cy, rx, ry, rMin, rMax, density = 1.4) {
        const out = [];
        const avg = (rMin + rMax) / 2;
        const n = Math.round(((Math.PI * rx * ry) / (avg * avg)) * density);
        for (let i = 0; i < n; i++) {
            const a = r() * Math.PI * 2, d = Math.sqrt(r());
            const rad = lerp(rMin, rMax, r()) * (1 - d * 0.45);
            out.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r: rad, z: (1 - d) * rad });
        }
        return out;
    }

    /**
     * Grows smaller billows on the sunlit upper side of each billow, and
     * smaller ones again on those: the cauliflower detail of a real cumulus.
     */
    function detailBillows(billows, r, { levels = 2, count = 9, minR = 3 } = {}) {
        let out = billows.slice();
        let frontier = billows;
        for (let lv = 0; lv < levels; lv++) {
            const next = [];
            for (const b of frontier) {
                if (b.r < minR * 3) continue;
                const n = Math.round(clamp(b.r / (minR * 2.5), 2, count * 2) * (0.6 + r() * 0.8) * (lv ? 0.7 : 1));
                for (let i = 0; i < n; i++) {
                    const a = -Math.PI * (-0.08 + 1.16 * r());
                    const d = b.r * (0.76 + r() * 0.14);
                    next.push({ x: b.x + Math.cos(a) * d * (b.ax || 1), y: b.y + Math.sin(a) * d, r: b.r * (0.16 + r() * 0.2), ax: 1 + ((b.ax || 1) - 1) * 0.4, z: (b.z || 0) + b.r * 0.22 });
                }
            }
            // A billow buried in its neighbours only makes spots; keep the
            // ones that reach the surface of the mass.
            const kept = next.filter(c => !out.some(b => b.r > c.r && b.y > c.y + c.r * 0.2 && Math.hypot((c.x - b.x) / (b.ax || 1), c.y - b.y) < b.r - c.r * 0.35));
            out = out.concat(kept);
            frontier = kept;
        }
        return out;
    }

    /**
     * A tile of short directional brushstrokes, light and dark, to lay over
     * flat paint so walls and cloth read as gouache rather than vector fills.
     */
    function brushTexture(size = 512, seed = 3, { angle = -0.35, spread = 0.7, count = 9000 } = {}) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const r = rng(seed);
        g.lineCap = 'round';
        for (let i = 0; i < count; i++) {
            const x = r() * size, y = r() * size;
            const a = angle + (r() - 0.5) * spread;
            const len = 4 + r() * 24, w = 1 + r() * 3.5;
            const dark = r() < 0.5;
            g.strokeStyle = dark ? 'rgba(0,0,30,' + (0.03 + r() * 0.06) + ')' : 'rgba(255,255,255,' + (0.03 + r() * 0.06) + ')';
            g.lineWidth = w;
            for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
                if ((ox && Math.abs(x + ox - size / 2) > size / 2 + len) || (oy && Math.abs(y + oy - size / 2) > size / 2 + len)) continue;
                g.beginPath();
                g.moveTo(x + ox, y + oy);
                g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
                g.stroke();
            }
        }
        return c;
    }

    function smooth01(a, b, v) {
        const t = clamp((v - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Paints a cloud, pixel by pixel.
     *
     * Each billow is a sphere; the cloud's surface is whichever sphere is
     * nearest the viewer at that pixel, so one sun lights the whole mass
     * consistently and billows crease where they meet. The light is then cut
     * into cel bands (deep, shadow, body, light, white) the way a background
     * painter would, with noise in the band edges and the silhouette so
     * nothing is ruled by a compass.
     *
     * @returns {{canvas, x, y, w, h}} position in the caller's coordinates
     */
    function cloud(billows, opts = {}) {
        const {
            dpr = 1, seed = 1, flatBase = null,
            light = [-0.42, -0.8, 0.5],
            tones = CLOUD_TONES, rough = 0.08, grainAmt = 0.05,
            blend = 0.22, shadeBase = 0.34, cuts: cutsOpt = null, edgeFreq = 0.022,
            detail = 0, paint = 0, rim = 0.08, haze = 0, hazeColor = [184, 206, 252],
            brush = 0.2, brushFreq = 0.1, ao = 0.38, aoRadius = 0.45, bounce = 0.1
        } = opts;
        const n = noise2D(seed);
        const rnd = rng(seed * 7 + 3);
        if (detail > 0) billows = detailBillows(billows, rng(seed * 31 + 5), { levels: detail, minR: 2.5 });

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const b of billows) {
            const ax = b.ax || 1;
            minX = Math.min(minX, b.x - b.r * ax * 1.15); maxX = Math.max(maxX, b.x + b.r * ax * 1.15);
            minY = Math.min(minY, b.y - b.r * 1.15); maxY = Math.max(maxY, b.y + b.r * 1.15);
        }
        if (flatBase != null) maxY = Math.min(maxY, flatBase + 4);
        const pad = 4;
        const ox = minX - pad, oy = minY - pad;
        const L = layer(maxX - minX + pad * 2, maxY - minY + pad * 2, dpr);
        const cw = L.canvas.width, ch = L.canvas.height;
        const img = L.g.createImageData(cw, ch);
        const data = img.data;

        // Billows in device pixels. Lower billows sit nearer the viewer.
        const B = billows.map(b => ({
            x: (b.x - ox) * dpr, y: (b.y - oy) * dpr, r: b.r * dpr, ax: b.ax || 1,
            z: ((b.y - minY) * 0.45 + (b.z || 0)) * dpr
        }));
        const len = Math.hypot(light[0], light[1], light[2]);
        const lx = light[0] / len, ly = light[1] / len, lz = light[2] / len;
        const flat = flatBase != null ? (flatBase - oy) * dpr : Infinity;
        const nf = edgeFreq / dpr;   // edge noise: 0.022 gives features about 45 CSS px across
        const tf = brushFreq / dpr;   // band noise: fine, like the cut of a brush
        const top = (minY - oy) * dpr, span = Math.max(1, (maxY - minY) * dpr);

        // Each pixel only tests the billows whose cell it falls in.
        const CELL = 24;
        const gw = Math.ceil(cw / CELL), gh = Math.ceil(ch / CELL);
        const grid = Array.from({ length: gw * gh }, () => []);
        B.forEach((b, i) => {
            const reach = b.r * (1 + rough) + 2;
            const x0 = Math.max(0, Math.floor((b.x - reach * b.ax) / CELL)), x1 = Math.min(gw - 1, Math.floor((b.x + reach * b.ax) / CELL));
            const y0 = Math.max(0, Math.floor((b.y - reach) / CELL)), y1 = Math.min(gh - 1, Math.floor((b.y + reach) / CELL));
            for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) grid[gy * gw + gx].push(i);
        });

        const bands = [tones.deep, tones.shadow, tones.body, tones.light, tones.white];
        const cuts = cutsOpt || [0.02, 0.26, 0.48, 0.68];
        const soft = 0.025;

        // Pass 1: the surface height. Each billow is a sphere and the surface
        // is a smooth maximum of them, so neighbouring billows melt into one
        // mass with a soft crease between them instead of reading as balls.
        const avgR = B.reduce((a, b) => a + b.r, 0) / Math.max(1, B.length);
        const kb = Math.max(1.5, avgR * blend);
        const Hf = new Float32Array(cw * ch).fill(NaN);
        const SD = new Float32Array(cw * ch).fill(-9);
        const EX = new Float32Array(cw * ch), EY = new Float32Array(cw * ch);
        const hs = new Float32Array(B.length);
        const ws = new Float32Array(B.length);
        for (let y = 0; y < ch; y++) {
            const rowCell = Math.floor(y / CELL) * gw;
            for (let x = 0; x < cw; x++) {
                const list = grid[rowCell + Math.floor(x / CELL)];
                if (!list.length) continue;
                const e = (n(x * nf, y * nf, 3) - 0.5) * 2;
                let hmax = -Infinity, sd = -Infinity, m = 0, ex = 0, ey = 0;
                for (let k = 0; k < list.length; k++) {
                    const b = B[list[k]];
                    const dx = (x - b.x) / b.ax, dy = y - b.y;
                    const rr = b.r * (1 + rough * e);
                    if (dx > rr + 2 || dx < -rr - 2) continue;
                    const d2 = dx * dx + dy * dy;
                    const d = Math.sqrt(d2);
                    const s = rr - d;
                    if (s > sd) { sd = s; ex = dx / (d || 1); ey = dy / (d || 1); }
                    if (s <= 0) continue;
                    const h = b.z + Math.sqrt(rr * rr - d2);
                    const wgt = clamp(s / (rr * 0.18 + 1), 0, 1);
                    ws[m] = wgt * wgt * (3 - 2 * wgt);
                    hs[m++] = h;
                    if (h > hmax) hmax = h;
                }
                const i = y * cw + x;
                SD[i] = sd; EX[i] = ex; EY[i] = ey;
                if (m) {
                    let S = 0;
                    for (let j = 0; j < m; j++) S += ws[j] * Math.exp((hs[j] - hmax) / kb);
                    Hf[i] = S > 0 ? hmax + kb * Math.log(S) : hmax;
                }
            }
        }

        // The neighbourhood average of the height, from a summed-area table.
        const sat = new Float64Array((cw + 1) * (ch + 1));
        for (let y = 0; y < ch; y++) {
            let row = 0;
            for (let x = 0; x < cw; x++) {
                const h = Hf[y * cw + x];
                row += Number.isNaN(h) ? 0 : h;
                sat[(y + 1) * (cw + 1) + x + 1] = sat[y * (cw + 1) + x + 1] + row;
            }
        }
        const aoR = Math.max(2, Math.round(avgR * aoRadius));
        const aoScale = Math.max(1, avgR * 0.22);
        function around(x, y) {
            const x0 = Math.max(0, x - aoR), x1 = Math.min(cw, x + aoR + 1);
            const y0 = Math.max(0, y - aoR), y1 = Math.min(ch, y + aoR + 1);
            const sum = sat[y1 * (cw + 1) + x1] - sat[y0 * (cw + 1) + x1] - sat[y1 * (cw + 1) + x0] + sat[y0 * (cw + 1) + x0];
            return sum / ((x1 - x0) * (y1 - y0));
        }

        // Pass 2: light the surface and cut it into cel bands.
        const at = (i, fallback) => (Number.isNaN(Hf[i]) ? fallback : Hf[i]);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                const sd = SD[i];
                if (sd <= -1) continue;
                let alpha = clamp(sd + 0.5, 0, 1);
                const e = (n(x * nf, y * nf, 3) - 0.5) * 2;
                if (y > flat - 6) alpha *= clamp((flat - y) / 6 + e * 0.35, 0, 1);
                if (alpha <= 0) continue;

                let nx, ny, nz;
                const h = Hf[i];
                if (Number.isNaN(h)) {
                    nx = EX[i]; ny = EY[i]; nz = 0.2;
                } else {
                    const drop = h - 4 * dpr;   // treat the outside as a steep fall-off
                    const hl = x > 0 ? at(i - 1, drop) : drop, hr = x < cw - 1 ? at(i + 1, drop) : drop;
                    const hu = y > 0 ? at(i - cw, drop) : drop, hd = y < ch - 1 ? at(i + cw, drop) : drop;
                    nx = -(hr - hl) / 2; ny = -(hd - hu) / 2; nz = 1;
                    const nl = Math.hypot(nx, ny, nz);
                    nx /= nl; ny /= nl; nz /= nl;
                }

                // Light, a little ambient, and the base sinking into shade.
                const lam = nx * lx + ny * ly + nz * lz;
                const depth = (y - top) / span;
                let v = lam * 0.66 + 0.32 - Math.pow(depth, 1.5) * shadeBase;
                if (ao > 0 && !Number.isNaN(h)) {
                    const crev = (around(x, y) - h) / aoScale;
                    v -= clamp(crev, 0, 1) * ao;
                    v += clamp(-crev, 0, 1) * ao * 0.15;
                }
                // Light thrown back up from below, into the undersides.
                if (bounce > 0 && ny > 0) v += ny * bounce * (1 - smooth01(0.15, 0.55, lam));
                v += (n(x * tf + 40, y * tf + 40, 2) - 0.5) * brush;   // brush-cut band edges
                v += (rnd() - 0.5) * grainAmt * 0.4;                // tooth

                // Edges catch light: the silhouette glows a little.
                if (rim > 0 && sd > 0) v += rim * (1 - clamp(sd / (5 * dpr), 0, 1));

                // Tones: crisp cel bands, softened toward a painted gradient.
                const band = (sw) => {
                    let c0 = bands[0], c1 = bands[0], mix = 0;
                    for (let k = 0; k < cuts.length; k++) {
                        if (v > cuts[k] - sw) { c0 = bands[k]; c1 = bands[k + 1]; mix = smooth01(cuts[k] - sw, cuts[k] + sw, v); }
                    }
                    return [c0[0] + (c1[0] - c0[0]) * mix, c0[1] + (c1[1] - c0[1]) * mix, c0[2] + (c1[2] - c0[2]) * mix];
                };
                let col = band(soft);
                if (paint > 0) {
                    const sm = band(0.11);
                    col = [lerp(col[0], sm[0], paint), lerp(col[1], sm[1], paint), lerp(col[2], sm[2], paint)];
                }
                if (haze > 0) {
                    const hk = haze * Math.pow(depth, 1.4);
                    col = [lerp(col[0], hazeColor[0], hk), lerp(col[1], hazeColor[1], hk), lerp(col[2], hazeColor[2], hk)];
                }
                const p = i * 4;
                data[p] = col[0];
                data[p + 1] = col[1];
                data[p + 2] = col[2];
                data[p + 3] = alpha * 255;
            }
        }
        L.g.putImageData(img, 0, 0);
        return { canvas: L.canvas, x: ox, y: oy, w: L.w, h: L.h };
    }

    // ── Light ────────────────────────────────────────────────────────────

    /**
     * Light spilling off a bright region onto its surroundings: the blurred
     * source, screened on top. `clip` (a function that builds a path) limits
     * where the glow lands.
     */
    function bloom(g, src, { radius = 40, alpha = 0.5, mode = 'screen', clip = null, w, h } = {}) {
        const b = blur(src, radius);
        g.save();
        if (clip) { g.beginPath(); clip(g); g.clip('evenodd'); }
        g.globalAlpha = alpha;
        g.globalCompositeOperation = mode;
        g.drawImage(b, 0, 0, w, h);
        g.restore();
    }

    /** A soft-edged light shaft: a quad filled with a fading gradient. */
    function shaft(g, quad, { color = '180,210,255', alpha = 0.12, mode = 'screen' } = {}) {
        const [a, b, c, d] = quad; // a,b at the source; c,d at the far end
        const gr = g.createLinearGradient((a.x + b.x) / 2, (a.y + b.y) / 2, (c.x + d.x) / 2, (c.y + d.y) / 2);
        gr.addColorStop(0, `rgba(${color},${alpha})`);
        gr.addColorStop(1, `rgba(${color},0)`);
        g.save();
        g.globalCompositeOperation = mode;
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
        g.closePath();
        g.fill();
        g.restore();
    }

    /** Darkens the corners, like the falloff of a lens. */
    function vignette(g, w, h, { strength = 0.5, color = '6,10,34' } = {}) {
        const vg = g.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
        vg.addColorStop(0, `rgba(${color},0)`);
        vg.addColorStop(1, `rgba(${color},${strength})`);
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
    }

    // ── Banded clouds: painted as shapes, not lit ───────────────────────
    //
    // A background painter does not light a cloud; they paint it. The outline
    // goes down first, then each tone as a shape that follows that outline,
    // shifted away from the sun. So here: a cloud is a set of lobes, each a
    // bumpy outline, and every tone of a lobe is a copy of its outline,
    // offset. The bands come out parallel and scalloped, crisp, and never
    // blotchy, because nothing is thresholded.

    /**
     * Grows a cumulus the way convection builds one. Big lobes sit along the
     * base; from the middle ones a stem of lobes climbs, leaning, each a little
     * smaller than the one below; side lobes bud off the stem; the top spreads.
     * Every lobe is then covered in billows on its upper surface, and those in
     * smaller ones: bumps on bumps.
     *
     * @returns {Array} lobes, back to front: { x, y, r, bumps: [{x, y, r}] }
     */
    function growCloud(r, {
        cx, baseY, width, height,
        lean = 0.12, baseLobes = 5, stems = 2, branch = 0.7,
        bumps = 8, subBumps = 4, minR = 3
    }) {
        const lobes = [];
        const top = baseY - height;
        // The base: a row of broad lobes, biggest in the middle.
        const base = [];
        for (let i = 0; i < baseLobes; i++) {
            const s = baseLobes === 1 ? 0.5 : i / (baseLobes - 1);
            const R = width * (0.16 + r() * 0.07) * (1 - Math.abs(s - 0.5) * 0.55);
            base.push({ x: cx + (s - 0.5) * width * 0.8 + (r() - 0.5) * width * 0.06, y: baseY - R * 0.75, r: R, stem: false });
        }
        lobes.push(...base);
        // Stems climb from the middle of the base.
        const order = base.slice().sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
        for (let k = 0; k < stems; k++) {
            let L = order[k % order.length];
            let ang = -Math.PI / 2 + lean * (k ? -0.8 : 1) + (r() - 0.5) * 0.3;
            const stop = k === 0 ? top : baseY - height * (0.4 + r() * 0.2);
            const aim = -Math.PI / 2 + lean * (k ? -0.6 : 0.5);
            while (L.y - L.r > stop && L.r > minR * 4) {
                ang = ang * 0.55 + aim * 0.45 + (r() - 0.5) * 0.45;
                // Big, uneven steps: a few heavy masses, not a stack of matching tiers.
                const R = L.r * (0.84 + r() * 0.26);
                const d = L.r * (0.72 + r() * 0.3);
                const c = { x: L.x + Math.cos(ang) * d, y: L.y + Math.sin(ang) * d, r: R, stem: true };
                lobes.push(c);
                // Side lobes bud off the stem.
                if (r() < branch) {
                    const side = r() < 0.5 ? -1 : 1;
                    const br = R * (0.6 + r() * 0.3);
                    lobes.push({ x: c.x + side * (R * (0.8 + r() * 0.25)), y: c.y + R * (0.1 + r() * 0.3), r: br, stem: false });
                }
                L = c;
            }
            // The crown spreads sideways at the top.
            const crown = 2 + Math.floor(r() * 2);
            for (let j = 0; j < crown; j++) {
                const side = j % 2 ? 1 : -1;
                lobes.push({ x: L.x + side * L.r * (0.75 + r() * 0.45), y: L.y + L.r * (0.05 + r() * 0.3), r: L.r * (0.7 + r() * 0.35), stem: false });
            }
        }
        // Billows over each lobe's upper surface, and smaller billows on those.
        for (const L of lobes) {
            L.bumps = [];
            const n = Math.round(bumps * (0.7 + r() * 0.6));
            for (let i = 0; i < n; i++) {
                const a = -Math.PI * (-0.12 + 1.24 * ((i + r() * 0.8) / n));
                const br = L.r * (0.2 + r() * 0.16);
                const d = L.r * (0.8 + r() * 0.1);
                const b = { x: L.x + Math.cos(a) * d, y: L.y + Math.sin(a) * d, r: br };
                L.bumps.push(b);
                if (br < minR * 3) continue;
                const m = Math.round(subBumps * (0.6 + r() * 0.8));
                for (let j = 0; j < m; j++) {
                    const a2 = a + (r() - 0.5) * 2.2;
                    if (Math.sin(a2) > 0.35) continue;          // only on the top side
                    L.bumps.push({ x: b.x + Math.cos(a2) * br * 0.85, y: b.y + Math.sin(a2) * br * 0.85, r: br * (0.3 + r() * 0.2) });
                }
            }
        }
        // Back to front: higher lobes are further away, lower ones overlap them.
        lobes.sort((a, b) => (a.y + a.r * 0.3) - (b.y + b.r * 0.3));
        return lobes;
    }

    /** One lobe's outline as a Path2D: its circle and all its billows. */
    function lobePath(L, n, wobble, seed) {
        const path = new Path2D();
        wobblyCircle(path, L.x, L.y, L.r, n, wobble, seed, 2.2);
        L.bumps.forEach((b, i) => wobblyCircle(path, b.x, b.y, b.r, n, wobble * 1.5, seed + i * 1.3, 3));
        return path;
    }

    /**
     * Paints a grown cloud.
     *
     * style:
     *   tones      light to dark, e.g. ['#fff', '#d8e6fb', '#a9c8f5', '#7aa9ef', '#4f8de8']
     *   offsets    how far each darker tone's copy of the outline is shifted, as
     *              a fraction of the lobe's radius (one fewer than tones)
     *   shift      direction the bands move: away from the sun, e.g. [0.35, 1]
     *   jitter     per-lobe randomness in the offsets (0..1)
     *   haze       optional { color, amount }: higher (farther) lobes fade toward
     *              this colour, up to `amount`, so every lobe has its own shade
     *   bounce     optional { tone, offset }: light reflected up into the deepest
     *              part of each shadow, as one more band past the last offset
     *   light      how strongly one sun shapes the whole cloud: lobes toward
     *              it and higher up keep wider light bands (0 = every lobe alike)
     *   wobble     how far outlines stray from true circles (fraction of radius)
     *   cast       optional drop shadow each lobe throws on those behind it:
     *              { color, blur, x, y } (blur and offsets in px)
     *   ink        optional outline: { color, width } (width as fraction of radius)
     *   bandInk    optional thin line along each band edge: { color, width }
     *   flatBase   y below which nothing is painted (the cloud's base), with a
     *              gentle wave
     *   texture    optional canvas laid over the cloud with 'overlay'
     *   textureAlpha
     *   soften     optional blur radius (px) mixed in at softenMix, for
     *              painted rather than cut edges
     *
     * @returns {{canvas, x, y, w, h}}
     */
    function paintCloud(lobes, style, { dpr = 1, seed = 1 } = {}) {
        const {
            tones, offsets, shift = [0.35, 1], jitter = 0.4, wobble = 0.03, light = 0.55,
            haze = null, bounce = null,
            cast = null, ink = null, bandInk = null, flatBase = null,
            texture = null, textureAlpha = 0.5, soften = 0, softenMix = 0.5
        } = style;
        const n = noise2D(seed);
        const rnd = rng(seed * 13 + 7);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const L of lobes) {
            for (const c of [L, ...L.bumps]) {
                minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
                minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
            }
        }
        if (flatBase != null) maxY = Math.min(maxY, flatBase + 4);
        const pad = 12 + (cast ? cast.blur * 2 : 0);
        const K = layer(maxX - minX + pad * 2, maxY - minY + pad * 2, dpr);
        const g = K.g;
        g.translate(pad - minX, pad - minY);
        if (flatBase != null) {
            g.beginPath();
            g.moveTo(minX - pad, minY - pad);
            g.lineTo(maxX + pad, minY - pad);
            for (let i = 32; i >= 0; i--) {
                const x = lerp(minX - pad, maxX + pad, i / 32);
                g.lineTo(x, flatBase + (n(x * 0.02, 5, 2) - 0.5) * 6);
            }
            g.closePath();
            g.clip();
        }
        let scratch = null;
        function silhouette(path, color, width, dx = 0, dy = 0, clipTo = null) {
            if (!scratch) scratch = layer(K.w, K.h, dpr);
            const sg = scratch.g;
            sg.setTransform(1, 0, 0, 1, 0, 0);
            sg.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
            sg.setTransform(dpr, 0, 0, dpr, 0, 0);
            sg.translate(pad - minX + dx, pad - minY + dy);
            sg.lineJoin = 'round';
            sg.strokeStyle = color;
            sg.lineWidth = width * 2;
            sg.stroke(path);
            sg.globalCompositeOperation = 'destination-out';
            sg.fill(path);
            sg.globalCompositeOperation = 'source-over';
            g.save();
            if (clipTo) g.clip(clipTo);
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.drawImage(scratch.canvas, 0, 0);
            g.restore();
        }
        const sl = Math.hypot(shift[0], shift[1]);
        const sx = shift[0] / sl, sy = shift[1] / sl;
        const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
        const hw = (maxX - minX) / 2, hh = (maxY - minY) / 2;
        function sunlit(L) {
            const toward = -((L.x - ccx) / hw) * sx * light;          // the side the sun is on
            const up = ((ccy - L.y) / hh) * light * 0.8;               // tops catch more of it
            return clamp(1 + toward + up, 0.45, 1.9);
        }

        const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
        const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

        lobes.forEach((L, li) => {
            const path = lobePath(L, n, wobble, seed * 7 + li * 3.1);
            // Distance haze: the higher a lobe, the further away, the more it
            // takes on the colour of the air.
            const far = clamp((maxY - L.y) / Math.max(1, maxY - minY), 0, 1);
            const hz = haze ? haze.amount * Math.pow(far, 1.3) : 0;
            const T = hz ? tones.map(c => mix(c, haze.color, hz)) : tones;
            if (cast) {
                g.save();
                g.shadowColor = cast.color;
                g.shadowBlur = cast.blur * dpr;
                g.shadowOffsetX = cast.x * dpr;
                g.shadowOffsetY = cast.y * dpr;
                g.fillStyle = tones[tones.length - 1];
                g.fill(path);
                g.restore();
            }
            g.save();
            g.clip(path);
            g.fillStyle = T[0];
            g.fill(path);
            const jit = (1 + (rnd() - 0.5) * 2 * jitter) * sunlit(L);
            offsets.forEach((o, i) => {
                const d = o * L.r * jit;
                g.save();
                g.translate(sx * d, sy * d);
                g.fillStyle = T[i + 1];
                g.fill(path);
                g.restore();
            });
            if (bounce) {
                const d = bounce.offset * L.r * jit;
                g.save();
                g.translate(sx * d, sy * d);
                g.fillStyle = hz ? mix(bounce.tone, haze.color, hz) : bounce.tone;
                g.fill(path);
                g.restore();
            }
            g.restore();
            if (bandInk) {
                offsets.forEach(o => {
                    const d = o * L.r * jit;
                    silhouette(path, bandInk.color, bandInk.width, sx * d, sy * d, path);
                });
            }
            if (ink) silhouette(path, ink.color, Math.max(0.8, ink.width * Math.sqrt(L.r)));
        });

        if (soften > 0) {
            const b = blur(K.canvas, soften * dpr);
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalAlpha = softenMix;
            g.globalCompositeOperation = 'source-atop';
            g.drawImage(b, 0, 0);
            g.restore();
        }
        if (texture) {
            g.setTransform(1, 0, 0, 1, 0, 0);
            grain(g, texture, K.canvas.width, K.canvas.height, { alpha: textureAlpha, mode: 'overlay' });
        }
        return { canvas: K.canvas, x: minX - pad, y: minY - pad, w: K.w, h: K.h };
    }

    window.Painter = {
        TAU, rng, noise2D, layer, blur, paper, grain, wobblyCircle, lerp, clamp,
        CLOUD_TONES, towerBillows, cumulusBillows, puffBillows, clumpBillows, detailBillows, brushTexture, cloud,
        growCloud, paintCloud, bloom, shaft, vignette
    };
})();
