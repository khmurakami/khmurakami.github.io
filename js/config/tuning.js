/**
 * The loop's tuning numbers, with the reasoning attached.
 *
 * These were literals scattered through `world-main.js` — a `40` for the ends
 * of a walkway, a `165` for the stride, a `7` for how long counts as standing
 * still. Every one of them is a design decision, and each was invisible next to
 * `walkSpeed` and `runMultiplier`, which were already declared in the manifest
 * where you would go looking.
 *
 * A manifest may override any of these by declaring the same key, so a room
 * with a shorter stride or a different idle rhythm says so in its own file. The
 * loop reads through `tuned()`, so a scene that says nothing simply gets these.
 */
export const TUNING = {
    /**
     * How far from the ends of the world you can walk, where no walkway says.
     *
     * A walkway declares its own `from`/`to` and almost everything has one;
     * this keeps a manifest without one off its own edges rather than letting
     * the character walk into the margin where nothing is drawn.
     */
    edgeMargin: 40,

    /**
     * Camera look-ahead at a walk, capped as a fraction of the world's width.
     *
     * The cap matters in small rooms: a look-ahead that is a large share of the
     * room swings the whole view for two steps, which reads as the camera
     * lurching rather than leading.
     */
    lookAhead: 130,
    lookAheadShare: 1 / 12,

    /** World px of travel between footfalls. Timed off the stride, not a clock. */
    strideLength: 165,

    /**
     * Carried into a standing start, so setting off lands a step promptly
     * instead of after most of a stride of silence.
     */
    stridePrimed: 140,

    /** Seconds of standing still before the character starts glancing about. */
    idleGlanceAfter: 7,
    /** Minimum seconds between glances, and how long one lasts. */
    idleGlanceGap: 4,
    idleGlanceHold: [1.2, 2.0],

    /**
     * How close a footfall has to be to standing water to splash, in world px.
     *
     * Puddles are drawn small; the sound and the ring want to land when the
     * feet are near one rather than exactly over its centre.
     */
    splashReach: 55,

    /** Ground colour behind everything, where a manifest declares no tone. */
    groundTone: '#141a3a'
};

/**
 * One tuning value for the scene the player is in.
 *
 * @param {Object} manifest The active scene.
 * @param {string} key
 */
export function tuned(manifest, key) {
    const own = manifest ? manifest[key] : undefined;
    return own === undefined ? TUNING[key] : own;
}
