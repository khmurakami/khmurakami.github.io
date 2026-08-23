/**
 * A procedural, twinkling starfield.
 *
 * Drawn rather than generated: stars need to animate, to intensify on cue when
 * the player looks up, and to cover the full width of the world without tiling.
 * A painted star layer can do none of those, and would repeat visibly.
 *
 * Positions come from a seeded generator so the sky is identical on every load
 * and in tests — a starfield that reshuffles on refresh reads as noise.
 */

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Starfield {
    /**
     * @param {object} config
     * @param {number} config.worldWidth - stars are spread across this
     * @param {number} [config.count]    - how many stars
     * @param {number} [config.seed]
     * @param {number} [config.parallax] - very low: stars are effectively at infinity
     * @param {number} [config.band]     - fraction of viewport height stars occupy, from the top
     */
    constructor({ worldWidth, count = 260, seed = 1337, parallax = 0.02, band = 0.72 }) {
        this.parallax = parallax;
        this.band = band;

        const rand = rng(seed);
        this.stars = Array.from({ length: count }, () => ({
            x: rand() * worldWidth,
            // Biased toward the top of the band so the sky thins out near the skyline.
            y: Math.pow(rand(), 1.6),
            r: 0.6 + rand() * 1.5,
            // Each star twinkles at its own rate and phase, so the field never pulses as one.
            speed: 0.4 + rand() * 1.4,
            phase: rand() * Math.PI * 2,
            warm: rand() < 0.25
        }));
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {import('./Camera.js').Camera} camera
     * @param {number} viewW
     * @param {number} viewH
     * @param {number} timeMs
     * @param {number} [intensity] - 0..1+, raised while the player is stargazing
     */
    draw(ctx, camera, viewW, viewH, timeMs, intensity = 1) {
        if (intensity <= 0) return;

        const t = timeMs / 1000;
        const dy = camera.lookY ? camera.lookY * this.parallax : 0;

        ctx.save();
        for (const s of this.stars) {
            const x = camera.toScreen(s.x, this.parallax);
            if (x < -4 || x > viewW + 4) continue;

            const y = s.y * viewH * this.band + dy;
            if (y < -4 || y > viewH + 4) continue;

            // Twinkle never reaches zero, so stars shimmer rather than blink out.
            const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
            const alpha = Math.min(1, tw * intensity);

            ctx.globalAlpha = alpha;
            ctx.fillStyle = s.warm ? '#ffe9c4' : '#dce8ff';
            ctx.beginPath();
            ctx.arc(x, y, s.r * (0.85 + 0.15 * tw), 0, Math.PI * 2);
            ctx.fill();

            // The brightest few get a soft bloom, which is what sells "night sky"
            // rather than "white dots".
            if (s.r > 1.7 && intensity > 0.6) {
                ctx.globalAlpha = alpha * 0.22;
                ctx.beginPath();
                ctx.arc(x, y, s.r * 3.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
