/**
 * Screen and light effects.
 *
 * These are the passes an artist would expect to exist in the engine rather
 * than paint into every asset: light spilling onto the floor, contact shadows,
 * a vignette, and film grain. Painting them in would freeze them — a lamp
 * baked into a prop cannot flicker, and a shadow baked under a crate cannot
 * respond to a light moving past it.
 */

/** Deterministic PRNG so grain is stable frame to frame where we want it. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Effects {
    /**
     * 4x4 Bayer threshold matrix, normalised to 0..1.
     *
     * The classic ordered-dither kernel. Using a fixed matrix rather than noise
     * is what makes the pattern read as deliberate crosshatch instead of as
     * grain — it is stable frame to frame, so a light pool stops shimmering.
     */
    static BAYER = [
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5
    ].map(v => v / 16);

    constructor({ seed = 4242 } = {}) {
        this.grainCanvas = null;
        /** Baked dither tiles, keyed by shape. See `poolTile`. */
        this.tiles = new Map();
        this.seed = seed;
    }

    /**
     * A soft pool of light on the ground under a source.
     *
     * Drawn as a flattened radial gradient rather than a circle: light falling
     * on a floor seen from the side reads as an ellipse, and a circular pool
     * makes the ground look vertical.
     */
    lightPool(ctx, x, y, radius, color, intensity = 1) {
        if (intensity <= 0.01) return;
        const tile = this.poolTile(radius, color);
        if (!tile) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, intensity);
        // Snapped, like every other blit. A dithered tile drawn at a fractional
        // position resamples its own dither pattern into mush.
        ctx.drawImage(tile, Math.round(x - tile.width / 2), Math.round(y - tile.height / 2));
        ctx.restore();
    }

    /**
     * A light pool, BAKED ONCE with an ordered dither.
     *
     * Smooth alpha gradients are the other big tell that something is not real
     * pixel art: the artwork is quantised to 64 colours and hard-edged, and
     * then a perfectly smooth radial wash goes over the top of it. Real pixel
     * art quantises its light too, and breaks the steps up with a dither
     * pattern rather than blending them.
     *
     * Baked because the shape never changes — only the position and the
     * brightness do, and those are a blit and a globalAlpha. Doing the
     * per-pixel work every frame for every lamp would be unaffordable; doing it
     * once per distinct radius and colour costs nothing.
     */
    poolTile(radius, color) {
        // Radius is quantised for the cache key, or a resize would mint a new
        // tile for every lamp at every intermediate size.
        const R = Math.max(4, Math.round(radius / 4) * 4);
        const key = `p${R}|${color[0]},${color[1]},${color[2]}`;
        const hit = this.tiles.get(key);
        if (hit) return hit;

        const FLAT = 0.32;   // light on a floor seen from the side is an ellipse
        const w = R * 2;
        const h = Math.max(2, Math.round(R * 2 * FLAT));
        if (w > 1400 || h > 1400) return null;

        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (!g) return null;
        const img = g.createImageData(w, h);
        const [r, gg, b] = color;

        const cx = w / 2, cy = h / 2;
        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const nx = (px - cx) / (w / 2);
                const ny = (py - cy) / (h / 2);
                const d = Math.sqrt(nx * nx + ny * ny);

                // The falloff the old gradient described, as a curve.
                let a = d >= 1 ? 0 : (d < 0.45 ? 0.42 - (d / 0.45) * 0.26
                                              : 0.16 * (1 - (d - 0.45) / 0.55));
                a = Math.max(0, a);

                // Ordered dither. The alpha is quantised to LEVELS steps and the
                // remainder is resolved by a Bayer threshold, so the boundary
                // between two steps becomes a checkerboard instead of a band.
                const LEVELS = 4;
                const v = a * LEVELS / 0.42;
                const lo = Math.floor(v);
                const frac = v - lo;
                const t = Effects.BAYER[(py & 3) * 4 + (px & 3)];
                const step = Math.min(LEVELS, lo + (frac > t ? 1 : 0));

                const i = (py * w + px) * 4;
                img.data[i] = r;
                img.data[i + 1] = gg;
                img.data[i + 2] = b;
                img.data[i + 3] = Math.round((step / LEVELS) * 0.42 * 255);
            }
        }
        g.putImageData(img, 0, 0);

        this.remember(key, c);
        return c;
    }

    /** Keeps the tile cache from growing without bound across resizes. */
    remember(key, tile) {
        if (this.tiles.size > 48) {
            this.tiles.delete(this.tiles.keys().next().value);
        }
        this.tiles.set(key, tile);
    }

    /**
     * Ripples, from a fixed pool.
     *
     * A pool rather than a growing array on purpose: splashes are spawned by
     * footsteps, footsteps happen three times a second forever, and the one
     * thing this must not do is accumulate. The oldest ripple is reused when
     * the pool is full, so the cost is flat no matter how long anyone walks.
     */
    splash(x, z, worldX) {
        if (!this.ripples) {
            this.ripples = Array.from({ length: 12 }, () => ({ life: 1, ttl: 1 }));
            this.ripplePtr = 0;
        }
        const r = this.ripples[this.ripplePtr];
        this.ripplePtr = (this.ripplePtr + 1) % this.ripples.length;
        r.worldX = worldX;
        r.z = z;
        r.life = 0;
        r.ttl = 0.75;
        return r;
    }

    updateRipples(dt) {
        if (!this.ripples) return;
        for (const r of this.ripples) if (r.life < r.ttl) r.life += dt;
    }

    /**
     * Draws the live ripples as expanding rings on the floor.
     * @param {import('./World.js').World} world
     */
    drawRipples(ctx, world, viewH) {
        if (!this.ripples) return;
        const plane = world.plane(world.manifest.actorPlane) || { parallax: 1 };
        const look = world.lookOffset(plane);
        const unit = world.unit();

        ctx.save();
        for (const r of this.ripples) {
            if (r.life >= r.ttl) continue;
            const t = r.life / r.ttl;
            const dScale = world.depthScale(r.z);
            const sx = world.camera.toScreen(r.worldX, plane.parallax);
            const lift = world.liftFor(
                world.terrain ? world.terrain.elevationAt(r.worldX, r.z) : 0, r.z, viewH);
            const sy = world.groundYFor(r.z, viewH) - lift + look;

            const rw = (5 + t * 26) * unit * dScale;
            ctx.globalAlpha = (1 - t) * 0.4;
            ctx.strokeStyle = 'rgba(190,214,255,0.9)';
            ctx.lineWidth = Math.max(1, unit);
            ctx.beginPath();
            // Flattened, because it is a ring lying on the floor seen at an angle.
            ctx.ellipse(sx, sy, rw, rw * 0.32, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** A glow around a light source itself, so bulbs bloom rather than sit flat. */
    bloom(ctx, x, y, radius, color, intensity = 1) {
        if (intensity <= 0.01) return;
        const tile = this.bloomTile(radius, color);
        if (!tile) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, intensity);
        ctx.drawImage(tile, Math.round(x - tile.width / 2), Math.round(y - tile.height / 2));
        ctx.restore();
    }

    /** The bloom, baked and dithered on the same terms as the pool. */
    bloomTile(radius, color) {
        const R = Math.max(4, Math.round(radius / 4) * 4);
        const key = `b${R}|${color[0]},${color[1]},${color[2]}`;
        const hit = this.tiles.get(key);
        if (hit) return hit;

        const w = R * 2, h = R * 2;
        if (w > 1400) return null;

        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (!g) return null;
        const img = g.createImageData(w, h);
        const [r, gg, b] = color;
        const cx = w / 2, cy = h / 2;

        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const nx = (px - cx) / R, ny = (py - cy) / R;
                const d = Math.sqrt(nx * nx + ny * ny);
                let a = d >= 1 ? 0 : (d < 0.4 ? 0.55 - (d / 0.4) * 0.37
                                              : 0.18 * (1 - (d - 0.4) / 0.6));
                a = Math.max(0, a);

                const LEVELS = 4;
                const v = a * LEVELS / 0.55;
                const lo = Math.floor(v);
                const t = Effects.BAYER[(py & 3) * 4 + (px & 3)];
                const step = Math.min(LEVELS, lo + ((v - lo) > t ? 1 : 0));

                const i = (py * w + px) * 4;
                img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b;
                img.data[i + 3] = Math.round((step / LEVELS) * 0.55 * 255);
            }
        }
        g.putImageData(img, 0, 0);
        this.remember(key, c);
        return c;
    }

    /**
     * A contact shadow beneath a standing object.
     *
     * Without one, everything looks pasted on rather than resting on the deck —
     * the single cheapest fix for a flat-looking 2.5D scene.
     */
    contactShadow(ctx, x, y, width, opacity = 0.45) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.22);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
        grad.addColorStop(0, `rgba(4,6,20,${opacity})`);
        grad.addColorStop(1, 'rgba(4,6,20,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Darkens the frame edges. Focuses the eye centre-screen and hides the fact
     * that the world ends somewhere off to the sides.
     */
    /**
     * The vignette, dithered and cached at the buffer's size.
     *
     * A smooth corner-darkening over hard-edged art is the same mismatch the
     * light pools had, and at buffer resolution it is more obvious rather than
     * less: the frame is only a few hundred pixels across, so a smooth ramp
     * across it is very visibly a gradient.
     *
     * Cached on size and strength, which change only on resize or a scene swap.
     */
    vignette(ctx, w, h, strength = 0.55) {
        if (strength <= 0.001) return;
        const key = `v${w}x${h}|${strength.toFixed(3)}`;
        let tile = this.tiles.get(key);

        if (!tile) {
            tile = document.createElement('canvas');
            tile.width = w; tile.height = h;
            const g = tile.getContext('2d');
            if (!g) return;
            const img = g.createImageData(w, h);

            const cx = w / 2, cy = h * 0.55;
            const inner = Math.min(w, h) * 0.28;
            const outer = Math.max(w, h) * 0.78;

            for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                    const d = Math.hypot(px - cx, py - cy);
                    const t = Math.max(0, Math.min(1, (d - inner) / (outer - inner)));

                    const LEVELS = 6;
                    const v = t * LEVELS;
                    const lo = Math.floor(v);
                    const th = Effects.BAYER[(py & 3) * 4 + (px & 3)];
                    const step = Math.min(LEVELS, lo + ((v - lo) > th ? 1 : 0));

                    const i = (py * w + px) * 4;
                    img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
                    img.data[i + 3] = Math.round((step / LEVELS) * strength * 255);
                }
            }
            g.putImageData(img, 0, 0);
            this.remember(key, tile);
        }

        ctx.drawImage(tile, 0, 0);
    }

    /**
     * Film grain, cached as a tile and stamped across the frame.
     *
     * Regenerating noise per frame is expensive and reads as static; a cached
     * tile offset by a couple of pixels each frame gives the same texture for
     * almost nothing.
     */
    grain(ctx, w, h, opacity = 0.05, frame = 0) {
        if (!this.grainCanvas) {
            const size = 128;
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d');
            if (!g) return;
            const img = g.createImageData(size, size);
            const rand = rng(this.seed);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = 128 + (rand() - 0.5) * 190;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                img.data[i + 3] = 255;
            }
            g.putImageData(img, 0, 0);
            this.grainCanvas = c;
        }

        const size = this.grainCanvas.width;
        // Shift the tile each frame so the grain moves instead of sitting still.
        const ox = -(frame * 7) % size;
        const oy = -(frame * 11) % size;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = 'overlay';
        for (let x = ox; x < w; x += size) {
            for (let y = oy; y < h; y += size) {
                ctx.drawImage(this.grainCanvas, x, y);
            }
        }
        ctx.restore();
    }
}
