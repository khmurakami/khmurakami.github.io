/* Living sky: deterministic cloud lives and deferred procedural cloud lighting.
 * Geometry/normals are prepared once; sunlight and depth haze change each frame.
 * No image, audio or network assets. Loaded only by the stack and world studios.
 *
 * KEEP IT A DRAWING. Clouds are painted with js/layers.js paints (CelLight
 * bands, a Terminator seam, Lift), never smooth n.sun shading: flat tones
 * with hard edges between them, as a painter lays them. Haze tints a whole
 * cloud one flat colour; it does not grade it. scripts/test-world.mjs checks.
 */
(function (root) {
    'use strict';
    const clamp = t => Math.max(0, Math.min(1, t));
    const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const rgb = c => `rgb(${c.map(Math.round).join(',')})`;
    const unhex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    // A painter's summer sky: the physical gradient, with its chroma pushed
    // `by` times around its own grey (luma kept), clamped to the gamut.
    const saturate = (c, by) => {
        const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        return c.map(v => Math.max(0, Math.min(255, y + (v - y) * by)));
    };
    function lifecycle(age) {
        return { opacity: ease(age / 0.12) * (1 - ease((age - 0.8) / 0.2)),
            growth: 0.3 + 0.7 * ease(age / 0.55) };
    }
    function cloudState(c, time) {
        const cycle = (time + c.offset) / c.life;
        const age = cycle - Math.floor(cycle);
        return { ...lifecycle(age), age, x: c.x + (age - 0.5) * c.travel,
            y: c.y - 0.025 * Math.sin(age * Math.PI) };
    }
    // Distant clouds pale toward the sky, but never past `0.62`: a painter
    // still gives the far ones a shape, just fewer, closer tones.
    const haze = depth => 0.3 * (1 - Math.exp(-2.4 * Math.max(0, depth)));
    // Afternoon tones (the `afternoon` style's) warming toward the dusk ones.
    const DAY = { shadow: [150, 182, 222], mid: [214, 228, 244], light: [255, 255, 252], seam: [240, 196, 170] };
    const DUSK = { shadow: [96, 82, 118], mid: [190, 132, 138], light: [255, 190, 146], seam: [255, 140, 96] };
    /** The paint chain for a cloud under `sun` at `warmth` (0 day .. 1 dusk): bands, a warm seam, a shaded base. */
    function cloudPaints(sun, warmth) {
        const P = root.Layers.paints, hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
        const t = k => hex(mix(DAY[k], DUSK[k], warmth));
        return [
            new P.CelLight({ tones: [t('shadow'), t('mid'), t('light')], thresholds: [-0.2, 0.05], sun }),
            new P.Terminator({ color: t('seam'), at: -0.2, width: 0.05, amount: 0.35, sun, hard: true }),
            new P.Lift({ color: t('shadow'), amount: 0.35, height: 0.3, hard: true })
        ];
    }
    function daylight(progress) {
        return root.Clock.daylight(progress);
    }
    /**
     * Paints a prepared cloud ({ image, normals, heights, covered }) with a
     * paint chain, then tints it all `fog` of the way to one sky colour.
     */
    /** Square erosion (true: beyond the image counts as set) or dilation of a 0/1 mask by radius r, separably. */
    function morph(mask, w, h, r, erode) {
        const pass = (src, step, span, lines, stride) => {
            const out = new Uint8Array(src.length);
            for (let l = 0; l < lines; l++) for (let i = 0; i < span; i++) {
                let v = erode ? 1 : 0;
                for (let j = i - r; j <= i + r; j++) {
                    const m = j < 0 || j >= span ? (erode ? 1 : 0) : src[l * stride + j * step];
                    v = erode ? v & m : v | m;
                }
                out[l * stride + i * step] = v;
            }
            return out;
        };
        return pass(pass(mask, 1, w, h, w), w, h, w, 1);
    }
    function paintCloud({ image, normals: N, heights, covered }, chain, fog, sky) {
        // Treat shadow and its seam as one shape. Keep only a few substantial
        // silhouette-connected masses; interior holes become the flat midtone.
        const removed = new Uint8Array(covered.length), w = image.width, h = image.height;
        const cel = chain[0], seam = chain[1];
        // The sky around the cloud: pixels outside the closed silhouette
        // (dilated then eroded, so slits and pinholes seal) that reach the
        // image border. Every other gap is painted as the flat midtone,
        // never left see-through.
        const closed = w && h ? morph(morph(covered, w, h, 3, false), w, h, 3, true) : covered;
        const outside = new Uint8Array(covered.length), ring = [];
        for (let k = 0; k < covered.length; k++) {
            const x = k % w, y = (k - x) / w;
            if (!closed[k] && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) { outside[k] = 1; ring.push(k); }
        }
        for (const p of ring) {
            const x = p % w;
            for (const q of [x ? p-1 : -1, x<w-1 ? p+1 : -1, p-w, p+w])
                if (q >= 0 && q < covered.length && !closed[q] && !outside[q]) { outside[q] = 1; ring.push(q); }
        }
        if (w && h && cel instanceof root.Layers.paints.CelLight && seam instanceof root.Layers.paints.Terminator) {
            const pending = new Uint8Array(covered.length), parts = [];
            let area = 0;
            for (let k = 0; k < covered.length; k++) if (covered[k]) {
                area++;
                const m = Math.hypot(N[k*3], N[k*3+1], N[k*3+2]) || 1;
                const d = (N[k*3]*cel.sun[0] + N[k*3+1]*cel.sun[1] + N[k*3+2]*cel.sun[2]) / m;
                pending[k] = d < Math.max(cel.thresholds[0], seam.at + seam.width) ? 1 : 0;
            }
            // An opening: erode the shadow by R, keep the big masses that reach
            // the silhouette, grow them back by R. Necks thinner than 2R break,
            // so pockets hanging off a mass by a thread are painted out too.
            const R = 3, shade = pending.slice();
            const core = morph(Uint8Array.from(shade, (v, k) => v | outside[k]), w, h, R, true);
            for (let k = 0; k < core.length; k++) core[k] &= shade[k];
            for (let k = 0; k < core.length; k++) if (core[k]) {
                const pixels = [k]; core[k] = 0; let edge = false;
                for (const p of pixels) {
                    const x = p % w;
                    for (const q of [x ? p-1 : -1, x<w-1 ? p+1 : -1, p-w, p+w]) {
                        if (q < 0 || q >= covered.length || outside[q]) { edge = true; continue; }
                        if (core[q]) { core[q] = 0; pixels.push(q); }
                    }
                }
                parts.push({ pixels, edge });
            }
            parts.sort((a,b) => b.pixels.length - a.pixels.length);
            const keep = new Uint8Array(covered.length);
            let kept = 0;
            // The base shadow, plus a second mass only if it is a real second
            // form (40% of the first), never a small notch beside it.
            let first = 0;
            for (const part of parts) if (part.edge && part.pixels.length >= area * 0.01 && kept < 2
                && part.pixels.length >= first * 0.4) {
                first ||= part.pixels.length; kept++; for (const k of part.pixels) keep[k] = 1;
            }
            const grown = morph(keep, w, h, R, false);
            for (let k = 0; k < shade.length; k++) if (shade[k] && !grown[k]) removed[k] = 1;
        }
        const s = { x: 0, y: 0, z: 0, n: [0, 0, 1], t: 0, volume: null };
        let rowHeight = 0; // a gap takes the height of the cloud just left of it
        for (let k = 0; k < covered.length; k++) {
            let t = heights[k];
            if (!covered[k]) {
                if (outside[k] || !cel.tones) { image.data[k * 4 + 3] = 0; continue; }
                removed[k] = 1; t = rowHeight;
            } else rowHeight = heights[k];
            const m = Math.sqrt(N[k * 3] ** 2 + N[k * 3 + 1] ** 2 + N[k * 3 + 2] ** 2) || 1;
            s.n[0] = N[k * 3] / m; s.n[1] = N[k * 3 + 1] / m; s.n[2] = N[k * 3 + 2] / m; s.t = t;
            let painted;
            if (removed[k]) {
                painted = cel.tones[1].slice();
                for (let j = 2; j < chain.length; j++) painted = chain[j].apply(painted, s);
            } else painted = root.Layers.paint(chain, s);
            const color = mix(painted, sky, fog);
            image.data[k * 4] = color[0]; image.data[k * 4 + 1] = color[1]; image.data[k * 4 + 2] = color[2]; image.data[k * 4 + 3] = 255;
        }
        return image;
    }
    /** Studio viewpoints, radians. Backlit looks toward the supplied sun's
     * azimuth; its direction is fixed at selection time, not animated. */
    class CameraPreset {
        static presets = Object.freeze(Object.fromEntries(Object.entries({
            front: { theta: 0, phi: 0.32 },
            'three-quarter': { theta: Math.PI / 4, phi: 0.32 },
            low: { theta: 0.35, phi: 0.08 },
            aerial: { theta: Math.PI / 4, phi: 1.12 },
            backlit: { theta: 0, phi: 0.15 }
        }).map(([name, value]) => [name, Object.freeze(value)])));
        constructor(name = 'three-quarter', { sun = [-0.62, 0.66, -0.42] } = {}) {
            if (!Object.hasOwn(CameraPreset.presets, name)) throw new RangeError(`Unknown camera: ${name}`);
            this.name = name;
            Object.assign(this, CameraPreset.presets[name]);
            if (name === 'backlit') this.theta = Math.atan2(sun[0], sun[2]);
        }
        /** World sunlight expressed in Stack's viewer-relative light coordinates. */
        viewerLight(sun, theta = this.theta) {
            const c = Math.cos(theta), s = Math.sin(theta);
            return [sun[0] * c - sun[2] * s, sun[1], sun[0] * s + sun[2] * c];
        }
        /** Sky.gradient takes azimuth relative to the sun, not the world. */
        skyAzimuth(sun, theta = this.theta) {
            return Math.PI / 2 - theta - Math.atan2(sun[2], sun[0]);
        }
        /** Fit the projected bounding box, including tilted depth, without clipping. */
        frame(bounds, w, h, { theta = this.theta, phi = this.phi, fit = 0.8 } = {}) {
            const unit = root.Stack.camera({ theta, phi });
            const points = [];
            for (const x of [bounds.x0, bounds.x1]) for (const y of [0, bounds.top])
                for (const z of [bounds.z0, bounds.z1]) points.push(unit.project(x, y, z));
            const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const scale = Math.min(w * fit / (x1 - x0), h * fit / (y1 - y0));
            return root.Stack.camera({ theta, phi, scale,
                ox: w / 2 - (x0 + x1) * scale / 2, oy: h / 2 - (y0 + y1) * scale / 2 });
        }
    }
    /** Flat paper shapes; motion changes outlines, never introduces smooth shading. */
    class Landscape {
        constructor() {
            this.ripples = []; this.time = 0;
            const r = root.Stack.rng(718);
            this.grass = Array.from({ length: 540 }, () => ({ x: r(), y: 0.7 + r() * 0.3, size: 0.008 + r() * 0.018, phase: r() * 6.28 }));
            this.leaves = Array.from({ length: 65 }, () => ({ x: 0.19 + (r() - 0.5) * 0.28, y: 0.45 + (r() - 0.5) * 0.17, size: 0.018 + r() * 0.033 }));
        }
        contains(x, y) { return ((x - 0.66) / 0.29) ** 2 + ((y - 0.79) / 0.105) ** 2 < 1; }
        tap(x, y, reduced = false) {
            if (reduced || !this.contains(x, y)) return false;
            this.ripples.push({ x, y, age: 0 });
            if (this.ripples.length > 12) this.ripples.shift();
            return true;
        }
        step(dt, reduced) {
            if (reduced) { this.ripples = []; return; }
            dt = Math.max(0, Math.min(0.1, dt)); this.time += dt;
            for (const r of this.ripples) r.age += dt;
            this.ripples = this.ripples.filter(r => r.age < 4);
        }
        get active() { return this.ripples.length > 0; }
        rings() { return this.ripples.map(r => ({ ...r, radius: 0.12 * ease(r.age / 4), alpha: ease(r.age / 0.4) * (1 - ease((r.age - 1) / 3)) })); }
        draw(g, w, h, state, colors, hits, motion) {
            const t = motion?.reduced ? 0 : this.time;
            const wind = motion?.reduced ? 0 : (motion?.wind || 0);
            const sway = Math.sin(t * 1.2) * 0.002 + wind * 0.006;
            const tone = c => rgb(mix(mix(mix(state.season ? state.season.apply(unhex(c)) : unhex(c), [91, 76, 94], state.warmth * 0.55), [81,99,102], (state.weather?.overcast || 0)*0.4), [22,36,45], (state.weather?.night || 0)*0.82));
            g.save(); g.scale(w, h);
            for (let k = 0; k < 3; k++) {
                g.fillStyle = tone(['#8eaf87', '#75965e', '#587b4e'][k]);
                g.beginPath(); g.moveTo(0, 1);
                for (let x = 0; x <= 1.01; x += 0.01) g.lineTo(x, 0.65 + k * 0.075 + 0.035 * Math.sin(x * 8 + k * 2));
                g.lineTo(1, 1); g.closePath(); g.fill();
            }
            const pond = () => { g.beginPath(); g.ellipse(0.66, 0.79, 0.29, 0.105, 0, 0, Math.PI * 2); };
            g.fillStyle = tone('#c6c695');
            g.beginPath(); g.ellipse(0.66, 0.792, 0.302, 0.116, 0, 0, Math.PI * 2); g.fill();
            g.save(); pond(); g.clip();
            // Reverse the actual atmosphere bands and cloud canvases across the waterline.
            for (let i = 0; i < 6; i++) {
                g.fillStyle = rgb(mix(colors[8 - i], [55, 109, 112], 0.27));
                g.fillRect(0.35, 0.68 + i * 0.04, 0.62, 0.041);
            }
            g.save(); g.translate(0, 1.03); g.scale(1, -0.46);
            for (const hit of hits) {
                g.globalAlpha = hit.opacity * 0.65;
                g.drawImage(hit.cache.canvas, hit.x / w, hit.y / h, hit.w / w, hit.h / h);
            }
            g.restore();
            g.strokeStyle = '#c4dad1'; g.lineWidth = 0.0012;
            for (let i = 0; i < 17; i++) {
                const x = 0.4 + ((i * 0.137) % 0.5), y = 0.71 + i * 0.01;
                g.beginPath(); g.moveTo(x + sway, y); g.lineTo(x + 0.02 + sway, y); g.stroke();
            }
            for (const r of this.rings()) for (let i = 0; i < 3; i++) {
                g.globalAlpha = r.alpha * (1 - i * 0.23); g.strokeStyle = '#eff1ce';
                g.beginPath(); g.ellipse(r.x, r.y, r.radius * (1 - i * 0.22) + 0.002, r.radius * 0.32 * (1 - i * 0.22) + 0.001, 0, 0, Math.PI * 2); g.stroke();
            }
            g.restore();
            // One broad canopy shadow, with leaf-shaped holes of sunlight beneath it.
            g.fillStyle = tone('#405e42');
            g.beginPath(); g.ellipse(0.2, 0.82, 0.16, 0.055, -0.08, 0, Math.PI * 2); g.fill();
            this.leaves.forEach((leaf, i) => {
                const flutter = 0.65 + 0.35 * Math.sin(t * 1.4 + i);
                g.fillStyle = tone(i % 3 ? '#95ab66' : '#bdc785');
                g.beginPath(); g.ellipse(leaf.x + sway * 2, 0.81 + (leaf.y - 0.45) * 0.45, leaf.size * 0.25 * flutter, leaf.size * 0.11, -0.4, 0, Math.PI * 2); g.fill();
            });
            g.fillStyle = tone('#675e42');
            g.beginPath(); g.moveTo(0.177, 0.82); g.lineTo(0.19, 0.48); g.lineTo(0.211, 0.45); g.lineTo(0.2, 0.67); g.lineTo(0.22, 0.56); g.lineTo(0.23, 0.56); g.lineTo(0.204, 0.73); g.lineTo(0.207, 0.82); g.closePath(); g.fill();
            this.leaves.forEach((leaf, i) => {
                g.fillStyle = tone(['#355e48', '#4c784e', '#729553'][i % 3]);
                g.beginPath(); g.ellipse(leaf.x + sway * (leaf.y < 0.45 ? 1 : 0.6), leaf.y, leaf.size, leaf.size * 0.7, -0.2, 0, Math.PI * 2); g.fill();
            });
            for (const blade of this.grass) {
                if (this.contains(blade.x, blade.y) || blade.y < 0.73 + 0.03 * Math.sin(blade.x * 8)) continue;
                const bend = (Math.sin(t * 1.5 + blade.phase) * 0.15 + wind * 0.5) * blade.size;
                g.fillStyle = tone(blade.phase < 3 ? '#a8b976' : '#3e6749');
                g.beginPath(); g.moveTo(blade.x - 0.0015, blade.y); g.quadraticCurveTo(blade.x, blade.y - blade.size * 0.5, blade.x + bend, blade.y - blade.size); g.lineTo(blade.x + 0.0015, blade.y); g.fill();
            }
            g.restore();
        }
    }
    /** Civil-hour envelopes and seeded marks: seeking never accumulates particles. */
    class Weather {
        constructor() {
            const r = root.Stack.rng(602);
            this.drops = Array.from({ length: 220 }, () => ({ x: r(), y: r(), speed: 0.35 + r() * 0.25 }));
            this.flies = Array.from({ length: 38 }, () => ({ x: 0.28 + r() * 0.65, y: 0.68 + r() * 0.23, phase: r() * Math.PI * 2 }));
        }
        sample(hour, seconds, reduced = false) {
            const window = (a,b,c,d) => ease((hour-a)/(b-a)) * (1-ease((hour-c)/(d-c)));
            const night = ease((hour - 19) / 1.4), time = reduced ? 3 : seconds;
            const hanabi = hour >= 19.5 && hour < 23;
            const bursts = [];
            for (let i = 0; i < 3; i++) {
                const age = ((time + i * 3.7) % 12 + 12) % 12;
                const alpha = ease(age / 1.2) * (1 - ease((age - 2.2) / 3.8)) * window(19.5,20.2,22.5,23);
                if (alpha > 0) bursts.push({ x: [0.48,0.77,0.3][i], y: [0.28,0.34,0.22][i],
                    radius: 0.018 + 0.14 * ease(age / 6), alpha, age, color: ['#efc58b','#c6c5e7','#edafa6'][i] });
            }
            return { time, night, hanabi, rain: window(14,14.8,15.2,16), overcast: window(13.5,14.5,15.2,16.5),
                wet: window(14.4,15.4,16.8,18), rainbow: window(15.6,16.3,16.8,17.6),
                fireflies: window(18,18.8,20,21.5), bursts,
                glow: reduced ? 0 : Math.min(1, bursts.reduce((v,b) => v + b.alpha, 0)) };
        }
        sky(colors, state) {
            return colors.map((c,i) => mix(mix(c, [109+i*6,120+i*6,129+i*6], state.overcast * 0.88),
                [20+i*3,29+i*3,52+i*3], state.night));
        }
        drawSky(g,w,h,s) {
            g.save();
            if (s.rainbow > 0) {
                g.globalAlpha = s.rainbow * 0.48; g.lineWidth = w * 0.008;
                ['#d98d88','#e3b783','#e6d598','#a9c49b','#91b8ca','#aa9dbf'].forEach((color,i) => {
                    g.strokeStyle = color; g.beginPath();
                    g.ellipse(w*0.65,h*0.69,w*(0.32-i*0.008),h*(0.49-i*0.012),0,Math.PI,Math.PI*2); g.stroke();
                });
            }
            for (const b of s.bursts) {
                g.globalAlpha = b.alpha * 0.85; g.strokeStyle = b.color; g.lineWidth = Math.max(1,w*0.002);
                for (let i=0;i<40;i++) {
                    const a = i / 40 * Math.PI*2, radius = b.radius * (i%2 ? 0.82 : 1);
                    const x = b.x*w, y = (b.y + 0.018*ease(b.age/6))*h;
                    g.beginPath(); g.moveTo(x+Math.cos(a)*radius*w*0.78,y+Math.sin(a)*radius*w*0.78);
                    g.lineTo(x+Math.cos(a)*radius*w,y+Math.sin(a)*radius*w); g.stroke();
                }
            }
            g.restore();
        }
        drawGround(g,w,h,s) {
            g.save();
            // Wet blades and shore pick up the returning light in short flat strokes.
            g.globalAlpha = s.wet * (1-s.overcast) * 0.65; g.fillStyle = '#e7e6bf';
            for(let i=0;i<45;i++) {
                const x = 0.32 + (i*0.137)%0.63, y = 0.75 + (i*0.073)%0.2;
                g.fillRect(x*w,y*h,w*0.012,h*0.002);
            }
            g.strokeStyle = '#ccd8dc'; g.lineWidth = Math.max(1,w*0.001);
            g.globalAlpha = s.rain * 0.55;
            for(const drop of this.drops) {
                const y = (drop.y + s.time*drop.speed)%1;
                g.beginPath(); g.moveTo(drop.x*w,y*h); g.lineTo((drop.x-0.004)*w,(y+0.024)*h); g.stroke();
            }
            for(const f of this.flies) {
                const pulse = 0.5 + 0.5*Math.sin(s.time*1.4+f.phase);
                const x = (f.x + 0.009*Math.sin(s.time*0.55+f.phase))*w;
                const y = (f.y + 0.008*Math.sin(s.time*0.7+f.phase))*h;
                g.globalAlpha = s.fireflies * (0.25+0.75*pulse*pulse);
                g.fillStyle = '#b5c982'; g.fillRect(x-2,y-2,4,4);
                g.fillStyle = '#f3ebae'; g.fillRect(x-1,y-1,2,2);
            }
            g.restore();
        }
    }
    /** Only two height regions: light eases in time, never grades the surface. */
    class WeatherLight {
        constructor(state, x) { this.state = state; this.x = x; }
        apply(color, sample) {
            const s = this.state;
            let c = mix(mix(color, [102,114,126],s.overcast*0.7),[42,49,75],s.night*0.86);
            const local = s.bursts.reduce((v,b) => Math.max(v,b.alpha * (1-clamp(Math.abs(this.x-b.x)/0.5))),0);
            if(sample.t < 0.35) c = mix(c,[240,177,137],s.glow*local*0.6);
            return c;
        }
    }
    /**
     * One cloud, for any scene: a Stack shape seen through a camera preset,
     * rendered once into a w x h buffer (normals, heights, coverage), then
     * painted in flat bands as often as the light changes.
     */
    class PaintedCloud {
        constructor(shape, { w = 280, h = 200, camera = new CameraPreset('front'), fit = 0.9, blur = 3, slices = 220, puffs = false } = {}) {
            const S = root.Stack, pile = S.pile(shape);
            const cam = camera.frame(pile.bounds, w, h, { fit });
            this.camera = camera; this.w = w; this.h = h;
            if (puffs) {
                // Every billow its own sphere, seen exactly: see impostors().
                Object.assign(this, PaintedCloud.impostors(pile.spheres, cam, w, h, pile.bounds.top));
                this.spheres = pile.spheres;
            } else {
                const gb = S.gbuffer(pile, cam, w, h, { slices });
                this.covered = Uint8Array.from(gb.sphere, s => s >= 0 ? 1 : 0);
                // A painter simplifies a cloud to a few big lit shapes, not one per billow.
                this.normals = S.blurField(S.normals(gb), this.covered, w, h, blur);
                // Height up the cloud, 0 base .. 1 top, from each pixel's slice: Lift shades the base.
                this.heights = Float32Array.from(gb.slice, i => i >= 0 ? gb.list[i].h / pile.bounds.top : 0);
            }
            // The painted silhouette's extent, in buffer pixels, for placing it in a scene.
            let x0 = w, x1 = -1, y0 = h, y1 = -1;
            for (let k = 0; k < this.covered.length; k++) if (this.covered[k]) {
                const x = k % w, y = (k - x) / w;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
            this.extent = { x0, x1: x1 + 1, y0, y1: y1 + 1 };
            this.canvas = root.document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
            this.g = this.canvas.getContext('2d'); this.image = new ImageData(w, h);
        }
        /** Paints under world sunlight `sun` at `warmth`, `fog` of the way into `sky`; returns the canvas. */
        paint(sun, warmth, fog = 0, sky = [255, 255, 255], extra = []) {
            paintCloud(this, cloudPaints(this.camera.viewerLight(sun), warmth).concat(extra), fog, sky);
            this.g.putImageData(this.image, 0, 0);
            return this.canvas;
        }
        /**
         * Spheres drawn as impostors: orthographic (Stack.camera), so each is a
         * disc of radius r * scale. At every pixel the sphere whose front
         * surface is nearest the viewer wins (a depth test), and below the
         * ground (y < 0) is cut away for the flat base. The normal comes from
         * the pixel's place in its disc, so it is exact and smooth. Viewer
         * right, up and toward: R = (c, 0, -s), U = (s sp, cp, c sp),
         * F = (-s cp, sp, -c cp). Returns { covered, normals, heights, sphere }.
         */
        static impostors(spheres, cam, w, h, top) {
            const covered = new Uint8Array(w * h), N = new Float32Array(w * h * 3), heights = new Float32Array(w * h);
            const sphere = new Int32Array(w * h).fill(-1), depth = new Float32Array(w * h).fill(-Infinity);
            const c = Math.cos(cam.theta), s = Math.sin(cam.theta), sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
            const R = [c, 0, -s], U = [s * sp, cp, c * sp], F = [-s * cp, sp, -c * cp];
            spheres.forEach((q, si) => {
                const [cx, cy] = cam.project(q.x, q.y, q.z), r = q.r * cam.scale;
                const cz = q.x * F[0] + q.y * F[1] + q.z * F[2];
                const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
                const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                    const dx = (x + 0.5 - cx) / r, dy = -(y + 0.5 - cy) / r, d2 = dx * dx + dy * dy;
                    if (d2 > 1) continue;
                    const dz = Math.sqrt(1 - d2), n = [0, 1, 2].map(i => dx * R[i] + dy * U[i] + dz * F[i]);
                    const py = q.y + q.r * n[1];
                    if (py < 0) continue;
                    const z = cz + q.r * dz, k = y * w + x;
                    if (z <= depth[k]) continue;
                    depth[k] = z; sphere[k] = si; covered[k] = 1; heights[k] = py / top;
                    N[k * 3] = n[0]; N[k * 3 + 1] = n[1]; N[k * 3 + 2] = n[2];
                }
            });
            return { covered, normals: N, heights, sphere, depth };
        }
        /**
         * Paints every puff on its own, as a painter heaps a cumulus: each
         * billow takes its own sphere's light (a style's chain from
         * Layers.styles, under `sun`), and a thin `line` is drawn where
         * overlapping puffs turn sharply apart (normals more than ~50 degrees
         * apart). Construct with puffs: true so each sphere keeps its own exact normal.
         * `parts` paints spheres of a given part in another style: { flower: 'hydrangea' }.
         */
        paintPuffs(style, sun, { fog = 0, sky = [255, 255, 255], line = null, edge = 0.65, depthGap = 4, parts = {} } = {}) {
            const chainFor = name => {
                const chain = root.Layers.build(root.Layers.styles[name].paints.filter(p => p.type !== 'Crevice'), { sun });
                return { chain, ink: line ? unhex(line) : chain[0].tones[0].map(v => v * 0.82) };
            };
            const base = chainFor(style);
            const byPart = Object.fromEntries(Object.entries(parts).map(([part, name]) => [part, chainFor(name)]));
            const { image, normals: N, covered, heights, w } = this, d = image.data;
            const s = { x: 0, y: 0, z: 0, n: [0, 0, 1], t: 0, volume: null };
            for (let k = 0; k < covered.length; k++) {
                if (!covered[k]) { d[k * 4 + 3] = 0; continue; }
                s.n[0] = N[k * 3]; s.n[1] = N[k * 3 + 1]; s.n[2] = N[k * 3 + 2]; s.t = heights[k];
                const { chain, ink } = (this.spheres && byPart[this.spheres[this.sphere[k]].part]) || base;
                let c = root.Layers.paint(chain, s);
                const x = k % w;
                // The line lies on the far puff, just outside the rim of a nearer
                // one overlapping it: a painter's line under a puff, never a net.
                for (const q of [x ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
                    if (q < 0 || q >= covered.length || !covered[q] || this.sphere[q] === this.sphere[k]) continue;
                    if (this.depth[q] - this.depth[k] > depthGap &&
                        N[k*3]*N[q*3] + N[k*3+1]*N[q*3+1] + N[k*3+2]*N[q*3+2] < edge) { c = mix(c, ink, 0.7); break; }
                }
                c = mix(c, sky, fog);
                d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255;
            }
            this.g.putImageData(image, 0, 0);
            return this.canvas;
        }
        /**
         * A painter's key light, in the pile's frame: from `side` (negative:
         * the left) and `toward` the viewer, `elevation` radians up. The
         * hour can still set the elevation; the direction stays composed.
         */
        keyLight(elevation, side = -0.8, toward = 0.2) {
            const c = Math.cos(this.camera.theta), s = Math.sin(this.camera.theta);
            const sp = Math.sin(this.camera.phi), cp = Math.cos(this.camera.phi);
            const R = [c, 0, -s], U = [s * sp, cp, c * sp], F = [-s * cp, sp, -c * cp];
            const flat = Math.hypot(side, toward) || 1, ce = Math.cos(elevation), se = Math.sin(elevation);
            const v = [side / flat * ce, se, toward / flat * ce];
            return [0, 1, 2].map(i => v[0] * R[i] + v[1] * [0, 1, 0][i] + v[2] * F[i]);
        }
        /** Where to draw the canvas so the silhouette is `width` px wide, centred on cx, its base on baseY. */
        place(cx, baseY, width) {
            const e = this.extent, k = width / (e.x1 - e.x0);
            return { x: cx - ((e.x0 + e.x1) / 2) * k, y: baseY - e.y1 * k, w: this.w * k, h: this.h * k };
        }
    }
    /**
     * A cloud for a scene, painted per billow: the Stack shape is cut into
     * painted layers (js/layers.js, a style from Layers.styles) and stacked
     * through a camera preset, once. Every point takes its own billow's
     * light, so a heap reads as many round puffs, each with its lit cap.
     * `fog` melts it toward one sky colour, flatly.
     */
    class LayeredCloud {
        constructor(shape, { w = 280, h = 200, camera = new CameraPreset('front'), fit = 0.92, style = 'tatami',
            sun = null, slices = 120, res = 1, fog = 0, sky = [255, 255, 255] } = {}) {
            const S = root.Stack, pile = S.pile(shape);
            this.w = w; this.h = h;
            this.canvas = root.document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
            const g = this.canvas.getContext('2d');
            S.draw(g, pile, camera.frame(pile.bounds, w, h, { fit }), 'layers', { style, slices, res, ...(sun ? { sun } : {}) });
            if (fog > 0) {
                g.globalCompositeOperation = 'source-atop'; g.globalAlpha = fog;
                g.fillStyle = `rgb(${sky.map(Math.round).join(',')})`; g.fillRect(0, 0, w, h);
                g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
            }
            const a = g.getImageData(0, 0, w, h).data;
            let x0 = w, x1 = -1, y0 = h, y1 = -1;
            for (let k = 0; k < w * h; k++) if (a[k * 4 + 3] > 128) {
                const x = k % w, y = (k - x) / w;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
            this.extent = { x0, x1: x1 + 1, y0, y1: y1 + 1 };
        }
        place(cx, baseY, width) { return PaintedCloud.prototype.place.call(this, cx, baseY, width); }
    }
    class Scene {
        constructor(clock, { seed = 24, count = 10, camera = 'front', motion = null } = {}) {
            this.clock = clock; this.motion = motion; this.hits = []; this.landscape = new Landscape(); this.weather = new Weather();
            const random = root.Stack.rng(seed);
            this.clouds = Array.from({ length: count }, (_, i) => ({
                seed: seed + i * 19, depth: 0.08 + i / count * 0.9,
                x: 0.08 + random() * 0.84, y: 0.35 + i / count * 0.39,
                life: 65 + random() * 50, offset: random() * 110,
                travel: 0.25 + random() * 0.25
            })).sort((a, b) => b.depth - a.depth);
            this.setCamera(camera);
        }
        setCamera(name) {
            // A fixed morning viewpoint lets the sun travel naturally through the day.
            const camera = new CameraPreset(name, { sun: daylight(0.25).sun });
            this.camera = camera;
            for (const cloud of this.clouds) delete cloud.cache;
            const sky = new root.Sky({ haze: 0.2 });
            this.skies = Array.from({ length: 81 }, (_, i) =>
                sky.gradient(this.clock.lightAt(i / 80).sun, { stops: 9,
                    azimuth: camera.skyAzimuth(this.clock.lightAt(i / 80).sun) }).map(c => saturate(unhex(c), 1.7)));
        }
        snapshot() {
            return { ...this.clock.daylight, season: this.season, weather: this.weather.sample(this.clock.daylight.hour, this.clock.time, this.motion?.reduced), clouds: this.clouds.map(c => {
                const state = cloudState(c, this.clock.time), m = this.motion;
                state.x += (this.presence?.x || 0) * 0.018 * (1 - c.depth);
                state.y += (this.presence?.y || 0) * 0.012 * (1 - c.depth);
                if (m) {
                    state.x += (m.drift - m.turn * 0.35) * (1 - c.depth * 0.65);
                    state.x = ((state.x + 0.3) % 1.6 + 1.6) % 1.6 - 0.3;
                    state.growth *= 1 + m.billow(c.seed);
                }
                return { ...c, ...state };
            }) };
        }
        skyColors() {
            const t = this.clock.progress * 80, i = Math.min(79, Math.floor(t));
            return this.skies[i].map((c, j) => mix(c, this.skies[i + 1][j], t - i));
        }
        prepare(c) {
            return new PaintedCloud(root.Stack.shapes.cumulus(c.seed, { billows: 5, subBillows: 2 }), { camera: this.camera });
        }
        hitTest(x, y) {
            for (const hit of this.hits.slice().reverse()) {
                const u = (x - hit.x) / hit.w, v = (y - hit.y) / hit.h;
                if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
                const cache = hit.cache;
                if (cache.covered[Math.floor(v * 200) * 280 + Math.floor(u * 280)]) return hit.seed;
            }
            return null;
        }
        draw(g, w, h) {
            this.hits = [];
            const state = this.snapshot(), colors = this.weather.sky(this.skyColors(), state.weather);
            const skyAt = y => {
                const t = clamp(y) * (colors.length - 1), i = Math.min(colors.length - 2, Math.floor(t));
                return mix(colors[i], colors[i + 1], t - i);
            };
            // Broad washes belong to the sky only; cloud paint stays hard-edged.
            const wash = g.createLinearGradient(0, 0, 0, h);
            colors.forEach((c, i) => wash.addColorStop(i / (colors.length - 1), rgb(c)));
            g.fillStyle = wash; g.fillRect(0, 0, w, h);
            this.weather.drawSky(g, w, h, state.weather);
            for (let i = 0; i < state.clouds.length; i++) {
                const c = state.clouds[i];
                if (c.opacity < 0.001) continue;
                const source = this.clouds[i];
                const cache = source.cache || (source.cache = this.prepare(c));
                const width = w * (0.36 - c.depth * 0.19) * c.growth;
                const height = width * 200 / 280 * (0.65 + c.growth * 0.35);
                const top = c.y * h - height * 0.91;
                paintCloud(cache, cloudPaints(state.sun, state.warmth).concat(this.season ? [this.season, new WeatherLight(state.weather, c.x)] : [new WeatherLight(state.weather, c.x)]), 1 - (1 - haze(c.depth)) * c.opacity, skyAt((top + height * 0.5) / (h * 0.9)));
                cache.g.putImageData(cache.image, 0, 0);
                this.hits.push({ seed: c.seed, opacity: c.opacity, x: c.x * w - width / 2, y: top, w: width, h: height, cache });
                // Solid paint: a forming or fading cloud melts into the sky's colour,
                // it is never see-through, so overlapping clouds stay opaque.
                g.drawImage(cache.canvas, c.x * w - width / 2, top, width, height);
            }
            g.globalAlpha = 1;
            // Quiet distant ridges anchor the sky, all drawn from sine curves.
            for (let layer = 0; layer < 3; layer++) {
                g.fillStyle = rgb(mix(skyAt(1), [36, 67, 75], 0.15 + layer * 0.12));
                g.beginPath(); g.moveTo(0, h);
                for (let x = 0; x <= w + 4; x += 4) {
                    const u = x / w + (this.presence?.x || 0) * 0.004 * (layer + 1) + (this.motion?.turn || 0) * (0.06 + layer * 0.02);
                    g.lineTo(x, h * (0.87 + layer * 0.045 - 0.025 * Math.sin(u * 11 + layer) - 0.016 * Math.sin(u * 23 + layer * 3)));
                }
                g.lineTo(w, h); g.closePath(); g.fill();
            }
            this.landscape.draw(g, w, h, state, colors, this.hits, this.motion);
            this.weather.drawGround(g, w, h, state.weather);
            return state;
        }
    }
    root.LivingSky = { PaintedCloud, LayeredCloud, saturate, Weather, WeatherLight, Landscape, CameraPreset, Scene, lifecycle, cloudState, daylight, haze, ease, cloudPaints, paintCloud };
})(typeof window !== 'undefined' ? window : globalThis);
