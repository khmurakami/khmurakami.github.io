/**
 * One wind value for the whole world.
 *
 * Every swaying prop reads from this rather than running its own oscillator.
 * Independent phases look like a screensaver: nine planters each doing their
 * own thing. Shared wind looks like weather — everything leans together, the
 * gust passes, everything settles, and the roof feels like it is outdoors.
 *
 * Props keep a small individual lag and stiffness so the world does not move as
 * one rigid sheet, but the *signal* is common.
 */
export class Wind {
    /**
     * @param {object} [config]
     * @param {number} [config.base]      - steady breeze strength, 0..1
     * @param {number} [config.gustEvery] - mean seconds between gusts
     * @param {number} [config.gustPower] - how much harder a gust blows than the breeze
     * @param {number} [config.seed]
     */
    constructor({ base = 0.35, gustEvery = 9, gustPower = 2.4, seed = 88,
                  frontSpeed = 900 } = {}) {
        this.base = base;
        /**
         * How fast a gust front crosses the world, in world px per second.
         *
         * This is what makes wind READ as weather rather than as everything
         * oscillating in place: props lag by their distance along the roof, so
         * a gust arrives at the stair hut, sweeps east, and reaches the lookout
         * a few seconds later. You can watch it coming.
         */
        this.frontSpeed = frontSpeed;
        this.gustEvery = gustEvery;
        this.gustPower = gustPower;
        this.seed = seed;

        this.t = 0;
        /** Current signed wind, roughly -1..1. Props multiply their sway by this. */
        this.value = 0;
        /** 0..1, how much of the current wind is gust rather than breeze. */
        this.gust = 0;
    }

    update(dt) {
        this.t += dt;
        const t = this.t;

        // Breeze: two slow waves at unrelated rates so it never obviously repeats.
        const breeze = 0.62 * Math.sin(t * 0.23) + 0.38 * Math.sin(t * 0.41 + 1.7);

        // Gusts: a slow wave raised to a high power spends most of its time near
        // zero and briefly spikes, which is what a gust actually does. A plain
        // sine would make the wind pulse rhythmically instead.
        const cycle = Math.sin(t * (Math.PI * 2 / this.gustEvery) + this.seed);
        this.gust = Math.pow(Math.max(0, cycle), 6);

        // Fast chop rides on top, but only while a gust is actually blowing.
        const chop = Math.sin(t * 3.1 + 0.5) * 0.25 * this.gust;

        this.value = (breeze * this.base) + (this.gust * this.base * this.gustPower) + chop;
        return this.value;
    }

    /**
     * Wind as felt by one prop.
     *
     * `lag` delays lighter objects slightly behind the gust front, and
     * `stiffness` resists it — a hanging bulb string swings far more than a
     * weed. Both are derived per prop so the roof does not move as one sheet.
     *
     * @param {number} lag       - seconds this prop trails the wind front
     * @param {number} stiffness - 0 = free-swinging, 1 = rigid
     */
    /**
     * The wind at a world position, at this instant.
     *
     * Distance along the roof becomes lag, so the gust front travels.
     * @param {number} worldX
     * @param {number} [stiffness]
     * @param {number} [jitter] - small extra lag so props do not move in rank
     */
    atX(worldX, stiffness = 0, jitter = 0) {
        return this.at(worldX / this.frontSpeed + jitter, stiffness);
    }

    at(lag = 0, stiffness = 0) {
        const t = this.t - lag;
        const breeze = 0.62 * Math.sin(t * 0.23) + 0.38 * Math.sin(t * 0.41 + 1.7);
        const cycle = Math.sin(t * (Math.PI * 2 / this.gustEvery) + this.seed);
        const gust = Math.pow(Math.max(0, cycle), 6);
        const chop = Math.sin(t * 3.1 + 0.5) * 0.25 * gust;
        const raw = (breeze * this.base) + (gust * this.base * this.gustPower) + chop;
        return raw * (1 - stiffness);
    }
}
