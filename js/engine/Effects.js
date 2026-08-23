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
    constructor({ seed = 4242 } = {}) {
        this.grainCanvas = null;
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
        const [r, g, b] = color;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y);
        ctx.scale(1, 0.32);

        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${0.42 * intensity})`);
        grad.addColorStop(0.45, `rgba(${r},${g},${b},${0.16 * intensity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** A glow around a light source itself, so bulbs bloom rather than sit flat. */
    bloom(ctx, x, y, radius, color, intensity = 1) {
        if (intensity <= 0.01) return;
        const [r, g, b] = color;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${0.55 * intensity})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.18 * intensity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
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
    vignette(ctx, w, h, strength = 0.55) {
        const grad = ctx.createRadialGradient(
            w / 2, h * 0.55, Math.min(w, h) * 0.28,
            w / 2, h * 0.55, Math.max(w, h) * 0.78);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${strength})`);
        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
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
