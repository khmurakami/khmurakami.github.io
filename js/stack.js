/*
 * Stack: solid things drawn as piles of flat slices.
 *
 * Sprite stacking draws an object as horizontal slices, each a little higher
 * on screen than the one below; turn every slice by the same angle and the
 * pile reads as a solid you can see from any side. Here the slices are
 * smooth shapes, not pixels: a volume is a set of spheres, each slice is the
 * circles those spheres cut at one height, and how a slice is painted is up
 * to a render mode.
 *
 * Three kinds of parts, each pluggable:
 *   shapes   seed + options -> spheres { x, y (up), z, r }      Stack.shapes
 *   slices   spheres -> horizontal cuts, each a list of circles  Stack.slices
 *   modes    how to paint the pile: painted, paper, contour, mist Stack.modes
 *
 * The geometry and lighting are plain functions with no canvas in them, so
 * they can be tested (scripts/test-stack.mjs).
 */
(function (root) {
    'use strict';

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
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const norm = v => { const n = Math.hypot(...v) || 1; return v.map(q => q / n); };

    // ── Shapes ────────────────────────────────────────────────────────────

    /** A random unit vector, optionally only those with y >= minY. */
    function direction(r, minY = -1) {
        for (;;) {
            const v = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
            const m = Math.hypot(...v);
            if (m > 1 || m < 1e-3) continue;
            if (v[1] / m < minY) continue;
            return v.map(q => q / m);
        }
    }

    const shapes = {
        /** One sphere: the simplest thing to check a mode against. */
        sphere(seed, { r = 120 } = {}) {
            return [{ x: 0, y: r, z: 0, r }];
        },

        /**
         * A cumulus grown the way convection builds one: a broad, lumpy base,
         * several towers of different heights rising from it, each about as
         * wide as the lobes it climbs from and tapering only slowly, with side
         * lobes budding off; then billows over the upper side of every lobe,
         * and smaller billows on those.
         *
         * The overall form is a wide, uneven mound, wider than it is tall,
         * never one narrow stalk with a round head.
         */
        cumulus(seed, {
            width = 300, depth = 170, height = 170, baseLobes = 10, baseR = 60,
            towers = 3, lean = 0.12, branch = 0.85, taper = 0.93,
            billows = 6, billowSize = 0.4, subBillows = 1
        } = {}) {
            const r = rng(seed), S = [];
            // The base: an uneven oval of broad lobes, and a second ring inside it.
            for (let i = 0; i < baseLobes; i++) {
                const a = (i / baseLobes) * Math.PI * 2 + r() * 0.5;
                const R = baseR * (0.77 + r() * 0.46);
                S.push({ x: Math.cos(a) * width / 2, y: R * 0.4, z: Math.sin(a) * depth / 2, r: R, part: 'base' });
            }
            const inner = [];
            for (let i = 0; i < Math.max(3, towers + 1); i++) {
                const a = (i / Math.max(3, towers + 1)) * Math.PI * 2 + r();
                const c = { x: Math.cos(a) * width * 0.2, y: baseR * (0.8 + r() * 0.3), z: Math.sin(a) * depth * 0.18, r: baseR * (1.05 + r() * 0.3), part: 'base' };
                inner.push(c);
                S.push(c);
            }
            // Towers: the tallest reaches `height`, the others stop well short,
            // so the top is a skyline of heads rather than one.
            const starts = inner.slice().sort(() => r() - 0.5).slice(0, towers);
            starts.forEach((start, k) => {
                const reach = height * (k === 0 ? 1 : 0.5 + r() * 0.3);
                let L = start, dir = [0, 1, 0];
                const side = Math.sign(start.x || 1);
                while (L.y + L.r < reach + baseR && L.r > baseR * 0.35) {
                    dir = norm([dir[0] * 0.5 + lean * side + (r() - 0.5) * 0.6, 1, dir[2] * 0.5 + (r() - 0.5) * 0.6]);
                    const R = L.r * (taper + (r() - 0.5) * 0.12), d = L.r * (0.55 + r() * 0.2);
                    const C = { x: L.x + dir[0] * d, y: L.y + dir[1] * d, z: L.z + dir[2] * d, r: R, part: 'tower' };
                    S.push(C);
                    // Side lobes keep each tower as broad as a mass, not a stalk.
                    const buds = r() < branch ? 1 + (r() < 0.5 ? 1 : 0) : 0;
                    for (let b = 0; b < buds; b++) {
                        const a = r() * Math.PI * 2;
                        S.push({ x: C.x + Math.cos(a) * R * 0.8, y: C.y - R * (0.1 + r() * 0.25), z: C.z + Math.sin(a) * R * 0.8, r: R * (0.65 + r() * 0.25), part: 'side' });
                    }
                    L = C;
                }
            });
            for (const B of S.slice()) {
                const n = Math.round(billows * (0.8 + r() * 0.5));
                for (let i = 0; i < n; i++) {
                    const v = direction(r, -0.15);
                    const br = B.r * billowSize * (0.75 + r() * 0.5);
                    const b = { x: B.x + v[0] * B.r * 0.82, y: B.y + v[1] * B.r * 0.82, z: B.z + v[2] * B.r * 0.82, r: br, part: 'billow' };
                    S.push(b);
                    for (let k = 0; k < subBillows; k++) {
                        const w = direction(r, 0);
                        S.push({ x: b.x + w[0] * br * 0.85, y: b.y + w[1] * br * 0.85, z: b.z + w[2] * br * 0.85, r: br * (0.35 + r() * 0.2), part: 'billow' });
                    }
                }
            }
            return S;
        },

        /**
         * A shrub or hedge: a solid dome (a row of big core spheres, so no
         * sky shows through) with leaf clumps over its skin, each clump with
         * a smaller one budding off its upper side.
         */
        shrub(seed, { width = 300, depth = 160, height = 140, clumps = 40, rMin = 18, rMax = 36, buds = 1 } = {}) {
            const r = rng(seed), S = [];
            const coreR = Math.min(height * 0.8, depth / 2), n = Math.max(1, Math.ceil(width / coreR));
            for (let i = 0; i < n; i++) {
                const s = n === 1 ? 0 : (i / (n - 1)) * 2 - 1, k = Math.sqrt(Math.max(0.15, 1 - s * s));
                S.push({ x: s * (width / 2 - coreR * 0.6), y: height * 0.35 * k, z: 0, r: coreR * k * (0.9 + r() * 0.2), part: 'leaf' });
            }
            for (let i = 0; i < clumps; i++) {
                const v = direction(r, 0.05), d = 0.82 + r() * 0.18;
                S.push({ x: v[0] * d * width / 2, y: v[1] * d * height, z: v[2] * d * depth / 2, r: rMin + (rMax - rMin) * r(), part: 'leaf' });
            }
            return budsOn(S, r, buds, 'leaf');
        },

        /**
         * A tree's crown: an ellipsoid held clear of the ground, a solid core
         * with leaf clumps over its skin, so it reads as one mass of leaves
         * with smaller clumps on it.
         */
        crown(seed, { width = 380, depth = 300, height = 280, clumps = 45, rMin = 24, rMax = 52, buds = 1 } = {}) {
            const r = rng(seed), S = [], cy = rMax + height / 2;
            for (let i = 0; i < 5; i++) {
                const v = direction(r, -1);
                S.push({ x: v[0] * width * 0.18, y: cy + v[1] * height * 0.15, z: v[2] * depth * 0.18, r: Math.min(width, height) * 0.3, part: 'leaf' });
            }
            for (let i = 0; i < clumps; i++) {
                const v = direction(r, -1), d = 0.8 + r() * 0.2;
                S.push({ x: v[0] * d * width / 2, y: cy + v[1] * d * height / 2, z: v[2] * d * depth / 2, r: rMin + (rMax - rMin) * r(), part: 'leaf' });
            }
            return budsOn(S, r, buds, 'leaf');
        },

        /**
         * A hydrangea: a shrub with round flower heads resting in its upper
         * half, each head a ball of florets (part 'flower', so a scene can
         * paint them in their own colour).
         */
        hydrangea(seed, { width = 300, depth = 220, height = 230, clumps = 50, rMin = 20, rMax = 40, heads = 6, headR = 30, florets = 9 } = {}) {
            const S = shapes.shrub(seed, { width, depth, height, clumps, rMin, rMax }), r = rng(seed + 1);
            for (let k = 0; k < heads; k++) {
                // On the skin of the dome, on the side facing the viewer (-z), not buried in it.
                const v = direction(r, 0.15); v[2] = -Math.abs(v[2]) - 0.3;
                const m = Math.hypot(...v), hr = headR * (0.8 + r() * 0.4);
                const c = { x: v[0] / m * width / 2, y: v[1] / m * height * 0.95 + hr * 0.3, z: v[2] / m * depth / 2 - hr * 0.2 };
                // One round head (florets: 1) for small drawings, or a ball of florets.
                if (florets === 1) { S.push({ ...c, r: hr * 0.8, part: 'flower' }); continue; }
                for (let i = 0; i < florets; i++) {
                    const v = direction(r, -0.3);
                    S.push({ x: c.x + v[0] * hr * 0.6, y: c.y + v[1] * hr * 0.5, z: c.z + v[2] * hr * 0.6, r: hr * (0.35 + r() * 0.25), part: 'flower' });
                }
            }
            return S;
        }
    };

    /** `n` smaller spheres budding off the upper side of each sphere in S. */
    function budsOn(S, r, n, part) {
        for (const B of S.slice()) for (let i = 0; i < n; i++) {
            const v = direction(r, 0.1);
            S.push({ x: B.x + v[0] * B.r * 0.8, y: B.y + v[1] * B.r * 0.8, z: B.z + v[2] * B.r * 0.8, r: B.r * (0.4 + r() * 0.2), part });
        }
        return S;
    }

    // ── Slices ────────────────────────────────────────────────────────────

    /** The circles the spheres cut at height h: { x, z, r, s } with s the sphere. */
    function cut(spheres, h, minR = 0.8) {
        const out = [];
        for (const s of spheres) {
            const dy = h - s.y;
            if (Math.abs(dy) >= s.r) continue;
            const r = Math.sqrt(s.r * s.r - dy * dy);
            if (r > minR) out.push({ x: s.x, z: s.z, r, s });
        }
        // Big masses first, billows over them.
        out.sort((a, b) => b.s.r - a.s.r);
        return out;
    }

    /**
     * `count` evenly spaced cuts from the ground (y = 0) to the top. Starting
     * at the ground gives a flat base, as cumulus have. Empty cuts are dropped.
     * Each: { h, t (0 at the base, 1 at the top), circles }.
     */
    function slices(spheres, count) {
        const top = Math.max(...spheres.map(s => s.y + s.r));
        const out = [];
        for (let i = 0; i < count; i++) {
            const h = (i + 0.5) / count * top;
            const circles = cut(spheres, h);
            if (circles.length) out.push({ h, t: h / top, circles });
        }
        return out;
    }

    function bounds(spheres) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = 0;
        for (const s of spheres) {
            x0 = Math.min(x0, s.x - s.r); x1 = Math.max(x1, s.x + s.r);
            z0 = Math.min(z0, s.z - s.r); z1 = Math.max(z1, s.z + s.r);
            y1 = Math.max(y1, s.y + s.r);
        }
        return { x0, x1, z0, z1, top: y1, radius: Math.max(Math.hypot(x0, z0), Math.hypot(x1, z1), Math.hypot(x0, z1), Math.hypot(x1, z0)) };
    }

    // ── Camera ────────────────────────────────────────────────────────────

    /**
     * Turns the pile by `theta` about its vertical axis and looks down on it
     * at `phi` (0 = level, PI/2 = straight down). (ox, oy) is where the base
     * centre lands on screen; `scale` is pixels per unit.
     *
     * matrix(h) maps a slice's (x, z) plane at height h to the screen, as the
     * six numbers canvas setTransform takes.
     */
    function camera({ theta = 0, phi = 0.32, ox = 0, oy = 0, scale = 1 } = {}) {
        const c = Math.cos(theta), s = Math.sin(theta), sp = Math.sin(phi), cp = Math.cos(phi);
        return {
            theta, phi, scale,
            matrix(h) { return [c * scale, -s * sp * scale, -s * scale, -c * sp * scale, ox, oy - h * cp * scale]; },
            project(x, y, z) {
                const xr = x * c - z * s, zr = x * s + z * c;
                return [ox + xr * scale, oy - (y * cp + zr * sp) * scale];
            },
            /** A direction given relative to the viewer (x right, y up, z away), in the pile's own frame. */
            toWorld([vx, vy, vz]) { return [vx * c + vz * s, vy, -vx * s + vz * c]; }
        };
    }

    // ── Light ─────────────────────────────────────────────────────────────

    /**
     * Which part of a sliced circle faces the light past a threshold. On a
     * sphere, n.L >= th is a half-space, so in one slice it is the circle cut
     * by a straight chord:
     *
     *     (p - c) . L_xz  >=  th * R - dy * L_y        (dy = h - sphere centre)
     *
     * Returns null (none of it), 'all', or { from, to } — the arc, in radians
     * in the slice's (x, z) plane, that with its chord bounds the lit part.
     * `light` is a unit vector in the pile's frame.
     */
    function litPart(circle, h, light, th) {
        const { x, z, r, s } = circle;
        const m = Math.hypot(light[0], light[2]);
        const k = th * s.r - (h - s.y) * light[1];
        if (m < 1e-9) return k <= 0 ? 'all' : null;                 // light straight overhead
        const dist = k / m;
        if (dist >= r) return null;
        if (dist <= -r) return 'all';
        const a0 = Math.atan2(light[2], light[0]), b = Math.acos(dist / r);
        return { from: a0 - b, to: a0 + b };
    }

    // ── Deferred: which surface is at each pixel ─────────────────────────
    //
    // Drawing slices as antialiased shapes leaves a faint seam where each
    // meets the next, and hundreds of seams make rings. Instead, rasterise the
    // pile ourselves, with no antialiasing: for every pixel, which slice and
    // which sphere is on top. From those the exact 3D point and the surface's
    // direction there follow, and shading becomes a per-pixel decision.

    /**
     * Rasterises a pile as seen by `cam` into a W x H buffer (times `ss` for
     * supersampling). Later (higher) slices overwrite earlier ones, as
     * stacking does.
     * Returns { w, h, ss, sphere: Int32Array (-1 = empty), slice: Int32Array, list, spheres, cam }.
     */
    function gbuffer(p, cam, W, H, { slices: count = 300, ss = 1 } = {}) {
        const w = Math.round(W * ss), h = Math.round(H * ss);
        const sphere = new Int32Array(w * h).fill(-1);
        const slice = new Int32Array(w * h).fill(-1);
        const list = p.slicesFor(count);
        const index = new Map(p.spheres.map((s, i) => [s, i]));
        for (let i = 0; i < list.length; i++) {
            const sl = list[i];
            const [a, b, c, d, e, f] = cam.matrix(sl.h).map(v => v * ss);
            const det = a * d - b * c;
            const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;   // screen delta -> (x, z)
            const hw = Math.sqrt(a * a + c * c), hh = Math.sqrt(b * b + d * d);
            const A = ia * ia + ib * ib;
            for (const ci of sl.circles) {
                const sid = index.get(ci.s);
                const X0 = a * ci.x + c * ci.z + e, Y0 = b * ci.x + d * ci.z + f;
                const y0 = Math.max(0, Math.floor(Y0 - ci.r * hh)), y1 = Math.min(h - 1, Math.ceil(Y0 + ci.r * hh));
                if (X0 + ci.r * hw < 0 || X0 - ci.r * hw > w) continue;
                for (let Y = y0; Y <= y1; Y++) {
                    const py = Y + 0.5 - f;
                    // local point at screen x = 0 on this row, minus the circle's centre
                    const qx = -ia * e + ic * py - ci.x, qz = -ib * e + id * py - ci.z;
                    const B = 2 * (ia * qx + ib * qz), C = qx * qx + qz * qz - ci.r * ci.r;
                    const disc = B * B - 4 * A * C;
                    if (disc < 0) continue;
                    const sq = Math.sqrt(disc);
                    const xa = Math.max(0, Math.ceil((-B - sq) / (2 * A) - 0.5));
                    const xb = Math.min(w - 1, Math.floor((-B + sq) / (2 * A) - 0.5));
                    const row = Y * w;
                    for (let X = xa; X <= xb; X++) { sphere[row + X] = sid; slice[row + X] = i; }
                }
            }
        }
        return { w, h, ss, sphere, slice, list, spheres: p.spheres, cam };
    }

    /**
     * The surface direction at every covered pixel, in the pile's frame:
     * Float32Array of (x, y, z) per pixel, zero where empty. The point is
     * recovered from the pixel and its slice's height, so it is exact to
     * within one slice.
     */
    function normals(gb) {
        const { w, h, ss, sphere, slice, list, spheres, cam } = gb;
        const N = new Float32Array(w * h * 3);
        const inv = list.map(sl => {
            const [a, b, c, d, e, f] = cam.matrix(sl.h).map(v => v * ss);
            const det = a * d - b * c;
            return [d / det, -b / det, -c / det, a / det, e, f];
        });
        for (let k = 0; k < w * h; k++) {
            const si = sphere[k];
            if (si < 0) continue;
            const [ia, ib, ic, id, e, f] = inv[slice[k]];
            const X = (k % w) + 0.5 - e, Y = Math.floor(k / w) + 0.5 - f;
            const s = spheres[si];
            const nx = ia * X + ic * Y - s.x, ny = list[slice[k]].h - s.y, nz = ib * X + id * Y - s.z;
            const m = Math.hypot(nx, ny, nz) || 1;
            N[k * 3] = nx / m; N[k * 3 + 1] = ny / m; N[k * 3 + 2] = nz / m;
        }
        return N;
    }

    /**
     * Box-blurs a per-pixel field of `ch` channels over covered pixels only
     * (so the empty sky does not bleed in), `passes` times: three passes is
     * close to a Gaussian. Used to let neighbouring billows share their light.
     */
    function blurField(F, covered, w, h, radius, ch = 3, passes = 3) {
        const r = Math.max(1, Math.round(radius));
        let src = F;
        const tmp = new Float32Array(F.length);
        const sum = new Float64Array(ch);
        const run = (from, to, len, stride, count) => {
            for (let line = 0; line < count; line++) {
                const base = stride === 1 ? line * len : line;
                sum.fill(0); let n = 0;
                const at = i => base + i * stride;
                for (let i = 0; i < Math.min(r, len); i++) if (covered[at(i)]) { n++; for (let c = 0; c < ch; c++) sum[c] += from[at(i) * ch + c]; }
                for (let i = 0; i < len; i++) {
                    const add = i + r, sub = i - r - 1;
                    if (add < len && covered[at(add)]) { n++; for (let c = 0; c < ch; c++) sum[c] += from[at(add) * ch + c]; }
                    if (sub >= 0 && covered[at(sub)]) { n--; for (let c = 0; c < ch; c++) sum[c] -= from[at(sub) * ch + c]; }
                    const k = at(i);
                    for (let c = 0; c < ch; c++) to[k * ch + c] = covered[k] && n ? sum[c] / n : 0;
                }
            }
        };
        for (let p = 0; p < passes; p++) {
            const dst = new Float32Array(F.length);
            run(src, tmp, w, 1, h);          // rows
            run(tmp, dst, h, w, w);          // columns
            src = dst;
        }
        return src;
    }

    // ── Painting ──────────────────────────────────────────────────────────

    const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    function mix(a, b, t) {
        const A = hex(a), B = hex(b);
        return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('');
    }
    function ramp(stops, t) {
        t = clamp(t, 0, 1) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(t));
        return mix(stops[i], stops[i + 1], t - i);
    }

    function pathOf(slice) {
        if (!slice.path) {
            const p = new Path2D();
            for (const c of slice.circles) { p.moveTo(c.x + c.r, c.z); p.arc(c.x, c.z, c.r, 0, Math.PI * 2); }
            slice.path = p;
        }
        return slice.path;
    }

    function scratchFor(g) {
        const c = g.canvas;
        if (!c._stackScratch || c._stackScratch.width !== c.width || c._stackScratch.height !== c.height) {
            const s = document.createElement('canvas');
            s.width = c.width; s.height = c.height;
            c._stackScratch = s;
            const s2 = document.createElement('canvas');
            s2.width = c.width; s2.height = c.height;
            c._stackScratch2 = s2;
        }
        return [c._stackScratch.getContext('2d'), c._stackScratch2.getContext('2d')];
    }

    /** Cel lighting of one slice into `sg`: every circle in the dark tone, then each lit chord in the next. */
    function shadeSlice(sg, sl, cam, light, thresholds, cols) {
        sg.setTransform(...cam.matrix(sl.h));
        for (const c of sl.circles) {
            sg.fillStyle = cols[0];
            sg.beginPath(); sg.arc(c.x, c.z, c.r, 0, Math.PI * 2); sg.fill();
            thresholds.forEach((th, i) => {
                const part = litPart(c, sl.h, light, th);
                if (!part) return;
                sg.fillStyle = cols[i + 1];
                sg.beginPath();
                if (part === 'all') sg.arc(c.x, c.z, c.r, 0, Math.PI * 2);
                else { sg.arc(c.x, c.z, c.r, part.from, part.to); sg.closePath(); }
                sg.fill();
            });
        }
    }

    // Our draft style: a faded summer afternoon. Tones are dark to light.
    const PALETTE = {
        tones: ['#7b90a6', '#93a9b8', '#d3d9d6', '#fbf3e2'],
        base: ['#93a9b8', '#d3d9d6'],          // the bottom sits in its own shadow
        ink: '#1f2f6e', paper: '#f2ead9',
        layers: ['#5d68c2', '#8e9ae0', '#c9cdf0', '#f3ece4', '#fffaf2'],
        edges: ['#3f4aa0', '#6772c4', '#a3a8dc', '#d6d0d4']
    };

    /**
     * Render modes. Each has `defaults` (its settings, all overridable) and
     * draw(g, pile, cam, opts) where pile = { spheres, slicesFor(count) }.
     * Add a mode by adding a key.
     */
    const modes = {
        painted: {
            defaults: { slices: 600, thresholds: [0.02, 0.48], light: [-0.62, 0.66, -0.42], lift: 0.25 },
            draw(g, pile, cam, o) {
                const [sg] = scratchFor(g);
                const light = norm(cam.toWorld(norm(o.light)));
                const T = o.palette.tones;
                for (const sl of pile.slicesFor(o.slices)) {
                    const up = Math.min(1, o.lift + sl.t * (1.1 - o.lift));
                    const cols = [mix(T[0], T[1], up), mix(T[1], T[2], up), mix(T[2], T[3], up * 1.2)].slice(-(o.thresholds.length + 1));
                    sg.setTransform(1, 0, 0, 1, 0, 0);
                    sg.clearRect(0, 0, sg.canvas.width, sg.canvas.height);
                    shadeSlice(sg, sl, cam, light, o.thresholds, cols);
                    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(sg.canvas, 0, 0); g.restore();
                }
            }
        },

        mist: {
            defaults: { slices: 300, thresholds: [0.02, 0.48], light: [-0.62, 0.66, -0.42], lift: 0.25, alpha: 0.075, blur: 1.2 },
            draw(g, pile, cam, o) {
                const [sg] = scratchFor(g);
                const light = norm(cam.toWorld(norm(o.light)));
                const T = o.palette.tones;
                for (const sl of pile.slicesFor(o.slices)) {
                    const up = Math.min(1, o.lift + sl.t * (1.1 - o.lift));
                    const cols = [mix(T[0], T[1], up), mix(T[1], T[2], up), mix(T[2], T[3], up * 1.2)];
                    sg.setTransform(1, 0, 0, 1, 0, 0);
                    sg.clearRect(0, 0, sg.canvas.width, sg.canvas.height);
                    shadeSlice(sg, sl, cam, light, o.thresholds, cols);
                    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
                    g.globalAlpha = o.alpha;
                    if (o.blur) g.filter = `blur(${o.blur * cam.scale}px)`;
                    g.drawImage(sg.canvas, 0, 0);
                    g.restore();
                }
            }
        },

        paper: {
            defaults: { slices: 11, thickness: 6, shadow: 16, shadowColor: 'rgba(8,10,50,0.45)' },
            draw(g, pile, cam, o) {
                const [sg] = scratchFor(g);
                for (const sl of pile.slicesFor(o.slices)) {
                    const path = pathOf(sl), M = cam.matrix(sl.h);
                    sg.setTransform(1, 0, 0, 1, 0, 0);
                    sg.clearRect(0, 0, sg.canvas.width, sg.canvas.height);
                    sg.fillStyle = ramp(o.palette.edges, sl.t * 1.1);
                    for (let k = Math.round(o.thickness * cam.scale); k >= 1; k--) {
                        sg.setTransform(M[0], M[1], M[2], M[3], M[4], M[5] + k);
                        sg.fill(path);
                    }
                    sg.setTransform(...M);
                    sg.fillStyle = ramp(o.palette.layers, sl.t * 1.1);
                    sg.fill(path);
                    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
                    g.shadowColor = o.shadowColor; g.shadowBlur = o.shadow * cam.scale;
                    g.shadowOffsetX = 5 * cam.scale; g.shadowOffsetY = 6 * cam.scale;
                    g.drawImage(sg.canvas, 0, 0);
                    g.restore();
                }
            }
        },

        contour: {
            defaults: { slices: 34, width: 1.2 },
            draw(g, pile, cam, o) {
                const [sg, sg2] = scratchFor(g);
                for (const sl of pile.slicesFor(o.slices)) {
                    const path = pathOf(sl), M = cam.matrix(sl.h);
                    sg.setTransform(1, 0, 0, 1, 0, 0);
                    sg.clearRect(0, 0, sg.canvas.width, sg.canvas.height);
                    sg.setTransform(...M);
                    sg.fillStyle = o.palette.paper; sg.fill(path);
                    // The outline of the union only: stroke every circle, then cut the insides away.
                    sg2.setTransform(1, 0, 0, 1, 0, 0);
                    sg2.clearRect(0, 0, sg2.canvas.width, sg2.canvas.height);
                    sg2.setTransform(...M);
                    sg2.lineWidth = o.width * 2 / cam.scale;
                    sg2.strokeStyle = o.palette.ink;
                    sg2.stroke(path);
                    sg2.globalCompositeOperation = 'destination-out'; sg2.fill(path); sg2.globalCompositeOperation = 'source-over';
                    sg.setTransform(1, 0, 0, 1, 0, 0); sg.drawImage(sg2.canvas, 0, 0);
                    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(sg.canvas, 0, 0); g.restore();
                }
            }
        },

        /**
         * Shaded per pixel from the pile's surface (see gbuffer). No seams
         * between slices, and the surface's direction can be smoothed so
         * neighbouring billows share one light, as a painter lights a few
         * big masses and keeps the bumps for the edges.
         *
         *   smooth   0 = every billow lit on its own, 1 = fully merged
         *   radius   how far light is shared, as a fraction of the pile's size
         *   ss       supersampling, for clean edges
         */
        cel: {
            defaults: { slices: 300, ss: 2, smooth: 0, radius: 0.08, thresholds: [0.02, 0.48], light: [-0.62, 0.66, -0.42], lift: 0.25 },
            draw(g, pile, cam, o) {
                const W = g.canvas.width, H = g.canvas.height;
                const gb = gbuffer(pile, cam, W, H, { slices: o.slices, ss: o.ss });
                const { w, h, ss } = gb;
                let N = normals(gb);
                const covered = new Uint8Array(w * h);
                for (let k = 0; k < w * h; k++) covered[k] = gb.sphere[k] >= 0;
                if (o.smooth > 0) {
                    const B = blurField(N, covered, w, h, o.radius * pile.bounds.radius * cam.scale * ss);
                    for (let k = 0; k < w * h; k++) {
                        if (!covered[k]) continue;
                        const x = N[k * 3] + (B[k * 3] - N[k * 3]) * o.smooth;
                        const y = N[k * 3 + 1] + (B[k * 3 + 1] - N[k * 3 + 1]) * o.smooth;
                        const z = N[k * 3 + 2] + (B[k * 3 + 2] - N[k * 3 + 2]) * o.smooth;
                        const m = Math.hypot(x, y, z) || 1;
                        N[k * 3] = x / m; N[k * 3 + 1] = y / m; N[k * 3 + 2] = z / m;
                    }
                }
                const L = norm(cam.toWorld(norm(o.light)));
                const T = o.palette.tones;
                const cols = gb.list.map(sl => {
                    const up = Math.min(1, o.lift + sl.t * (1.1 - o.lift));
                    return [mix(T[0], T[1], up), mix(T[1], T[2], up), mix(T[2], T[3], up * 1.2)].slice(-(o.thresholds.length + 1)).map(hex);
                });
                const out = new ImageData(W, H);
                const D = out.data, n2 = ss * ss;
                for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
                    let r = 0, gg = 0, b = 0, cov = 0;
                    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
                        const k = (Y * ss + sy) * w + X * ss + sx;
                        if (!covered[k]) continue;
                        const d = N[k * 3] * L[0] + N[k * 3 + 1] * L[1] + N[k * 3 + 2] * L[2];
                        let tone = 0;
                        for (const th of o.thresholds) if (d >= th) tone++;
                        const c = cols[gb.slice[k]][tone];
                        r += c[0]; gg += c[1]; b += c[2]; cov++;
                    }
                    if (!cov) continue;
                    const i = (Y * W + X) * 4;
                    D[i] = r / cov; D[i + 1] = gg / cov; D[i + 2] = b / cov; D[i + 3] = 255 * cov / n2;
                }
                const tmp = document.createElement('canvas');
                tmp.width = W; tmp.height = H;
                tmp.getContext('2d').putImageData(out, 0, 0);
                g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tmp, 0, 0); g.restore();
            }
        },

        /** The silhouette, white, for measuring: same pile, no shading. */
        mask: {
            defaults: { slices: 300 },
            draw(g, pile, cam, o) {
                g.save();
                g.fillStyle = '#fff';
                for (const sl of pile.slicesFor(o.slices)) { g.setTransform(...cam.matrix(sl.h)); g.fill(pathOf(sl)); }
                g.restore();
            }
        }
    };

    /** A volume, ready to slice at any count (cached per count). */
    function pile(spheres) {
        const cache = new Map();
        return {
            spheres,
            bounds: bounds(spheres),
            slicesFor(n) { if (!cache.has(n)) cache.set(n, slices(spheres, n)); return cache.get(n); }
        };
    }

    /** Draws a pile in a mode. `opts` overrides the mode's defaults; `palette` overrides PALETTE. */
    function draw(g, p, cam, mode, opts = {}) {
        const m = modes[mode];
        if (!m) throw new Error(`no stack mode "${mode}" (have: ${Object.keys(modes).join(', ')})`);
        m.draw(g, p, cam, { ...m.defaults, ...opts, palette: { ...PALETTE, ...(opts.palette || {}) } });
    }

    root.Stack = { rng, shapes, cut, slices, bounds, camera, litPart, gbuffer, normals, blurField, pile, draw, modes, PALETTE, mix, ramp };
})(typeof window !== 'undefined' ? window : globalThis);
