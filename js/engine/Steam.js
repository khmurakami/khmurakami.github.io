/**
 * Steam and smoke, rising off the things that would be producing it.
 *
 * A rooftop at night is mostly still, and stillness reads as emptiness however
 * many props are standing on it. This is the cheapest motion that is also true:
 * vents vent, chimneys smoke, and both drift on the same wind everything else
 * on the roof is already swaying to.
 *
 * Emitters are DECLARED, not hardcoded — any prop with a `steam` key becomes
 * one, so the manifest stays the single place that says what is on the roof and
 * what it does. A vent that gets moved takes its plume with it.
 *
 * Puffs are drawn as chunky squares on a quantised grid rather than soft
 * circles. A smoothly blended alpha blob in front of hand-quantised pixel art
 * announces itself as canvas immediately; blocks read as part of the same
 * drawing.
 */

/** Small deterministic PRNG. A roof that puffs differently every load is noise. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Steam {
    /**
     * @param {Array} props   - manifest props; those with `steam` become emitters
     * @param {object} [opts]
     * @param {number} [opts.seed]
     * @param {number} [opts.max] - hard cap on live puffs, across all emitters
     */
    constructor(props = [], { seed = 4242, max = 160 } = {}) {
        this.rand = rng(seed);
        this.max = max;
        this.t = 0;

        this.emitters = props
            .filter(p => p.steam)
            .map(p => {
                const s = p.steam === true ? {} : p.steam;
                return {
                    id: p.id,
                    x: p.x,
                    z: p.z != null ? p.z : null,
                    plane: p.plane,
                    /** Puffs per second. */
                    rate: s.rate != null ? s.rate : 1.1,
                    /** How far up a puff travels before it is gone, in reference px. */
                    rise: s.rise != null ? s.rise : 46,
                    /** Puff size in reference px, at birth. */
                    size: s.size != null ? s.size : 9,
                    /** Height above the prop's base that the plume starts. */
                    oy: s.oy != null ? s.oy : 0,
                    /** Seconds a puff lives. */
                    ttl: s.ttl != null ? s.ttl : 3.4,
                    /** 0..1, how much the wind pushes it sideways. */
                    drift: s.drift != null ? s.drift : 1,
                    tone: s.tone || [206, 214, 232],
                    alpha: s.alpha != null ? s.alpha : 0.20,
                    due: 0
                };
            });

        this.puffs = [];
    }

    /**
     * @param {number} dt
     * @param {number} [wind] - signed wind value; puffs lean with it
     */
    update(dt, wind = 0) {
        if (dt <= 0) return;
        this.t += dt;

        for (const e of this.emitters) {
            e.due -= dt;
            if (e.due > 0) continue;
            // Jittered interval rather than a fixed one — evenly spaced puffs
            // read as a machine cycling, not as a vent breathing.
            e.due = (1 / e.rate) * (0.6 + this.rand() * 0.8);

            if (this.puffs.length >= this.max) continue;
            this.puffs.push({
                e,
                life: 0,
                ttl: e.ttl * (0.75 + this.rand() * 0.5),
                sway: this.rand() * Math.PI * 2,
                wobble: 0.5 + this.rand(),
                spread: this.rand()
            });
        }

        for (const p of this.puffs) {
            p.life += dt;
            // Wind is integrated, not sampled: a puff carries the gusts it has
            // actually lived through, so the top of a plume lags the bottom.
            p.carried = (p.carried || 0) + wind * dt * 26 * p.e.drift;
        }
        // Compacted in place rather than filtered into a new array.
        //
        // `filter` allocates a fresh array every frame and hands the old one to
        // the collector, forever. It is a small array and therefore a small
        // allocation, which is exactly what makes it easy to leave in: the cost
        // is not any one frame, it is a minor collection every few seconds for
        // the life of the page, and a minor collection is a dropped frame.
        //
        // The ripples in `Effects` already use a fixed ring buffer for the same
        // reason; this is the same discipline applied to a list that genuinely
        // varies in length.
        let live = 0;
        for (const p of this.puffs) {
            if (p.life < p.ttl) this.puffs[live++] = p;
        }
        this.puffs.length = live;
    }

    /**
     * Drops every live puff.
     *
     * Only the ACTIVE scene is updated, so a room you walk out of keeps its
     * plumes frozen mid-air for as long as the tab is open, and ages the whole
     * stalled batch out at once when you come back. Cleared on the way out
     * instead: a vent you are not looking at does not need to be simulated.
     */
    clear() {
        this.puffs.length = 0;
        for (const e of this.emitters) e.due = 0;
    }

    /** How far through its life a puff is, 0..1. */
    static ageOf(p) {
        return Math.min(1, p.life / p.ttl);
    }

    /**
     * Draws every live puff.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import('./World.js').World} world - for the floor geometry
     * @param {number} viewH
     */
    draw(ctx, world, viewH) {
        if (!this.puffs.length) return;
        const unit = world.unit();

        ctx.save();
        for (const p of this.puffs) {
            const e = p.e;
            const age = Steam.ageOf(p);

            // Fades in quickly and out slowly: a puff that appears at full
            // strength pops, and one that vanishes at full strength blinks.
            const fade = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
            const alpha = e.alpha * fade;
            if (alpha <= 0.005) continue;

            const z = e.z != null ? e.z : 0.5;
            const dScale = e.plane === 'deck' ? world.depthScale(z) : 1;

            const baseY = e.plane === 'deck'
                ? world.groundYFor(z, viewH) - world.liftFor(world.terrain
                    ? world.terrain.elevationAt(e.x, z) : 0, z, viewH)
                : viewH * world.manifest.horizonY;

            const plane = world.plane(e.plane) || { parallax: 1 };
            const sway = Math.sin(p.sway + this.t * p.wobble) * 4 * age;

            // Walking through a plume pushes it aside. Only the low, young
            // puffs move — by the time it is up at head height it has thinned
            // out and drifted, and shoving the top of a column around from the
            // ground reads as wrong.
            let brush = 0;
            if (world.playerX != null && e.plane === world.manifest.actorPlane) {
                const gap = e.x - world.playerX;
                const d = Math.abs(gap);
                if (d < 70 && age < 0.55) {
                    const k = (1 - d / 70) * (1 - age / 0.55);
                    brush = Math.sign(gap || 1) * k * 26;
                }
            }

            const sx = world.camera.toScreen(e.x, plane.parallax)
                + (p.carried || 0) * age + sway + brush;
            const sy = baseY
                - (e.oy + e.rise * age) * unit * dScale
                + world.lookOffset(plane);

            // Puffs grow as they rise and cool.
            const size = (e.size * (0.7 + age * 1.5)) * unit * dScale;
            const block = Math.max(2, Math.round(size / 3));

            ctx.fillStyle = `rgba(${e.tone[0]},${e.tone[1]},${e.tone[2]},${alpha})`;

            // A fixed little cluster, snapped to the block grid. Four squares is
            // enough to read as a puff and few enough to stay chunky.
            const cells = [
                [0, 0], [1, 0], [0, -1],
                [p.spread > 0.5 ? 1 : -1, -1]
            ];
            for (const [cx, cy] of cells) {
                ctx.fillRect(
                    Math.round((sx + cx * block) / block) * block,
                    Math.round((sy + cy * block) / block) * block,
                    block, block
                );
            }
        }
        ctx.restore();
    }
}
