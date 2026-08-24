/**
 * A horizontally scrolling camera for the side-scrolling world.
 *
 * The camera holds a position in WORLD pixels and converts world coordinates to
 * screen coordinates. It follows a target through a deadzone — a band in the
 * middle of the viewport where the target can move without the camera reacting.
 * Without that band the whole scene slides under every small step, which reads
 * as the world twitching rather than the character walking.
 */
export class Camera {
    /**
     * @param {object} config
     * @param {number} config.worldWidth    - Total walkable width of the world, in world px
     * @param {number} config.viewportWidth - Visible width, in world px
     * @param {number} [config.deadzone]    - Fraction of the viewport (0..1) the target
     *                                        can roam before the camera follows
     */
    constructor({ worldWidth, viewportWidth, deadzone = 0.3, pixelScale = 1 }) {
        this.worldWidth = worldWidth;
        this.viewportWidth = viewportWidth;
        this.deadzone = deadzone;
        this.x = 0;

        /**
         * World pixels per render pixel.
         *
         * The world is drawn into a low-resolution buffer and integer-upscaled
         * to the display, so a world coordinate is no longer a render
         * coordinate. Everything about following, deadzones and clamping stays
         * in WORLD px — only the final conversion in `toScreen` divides.
         *
         * Because the divide happens here and nowhere else, `renderX` remains
         * the exact inverse for turning a click back into a world position.
         */
        this.pixelScale = pixelScale;

        // Vertical look. The camera never scrolls vertically with the player —
        // the deck is one level — but it can tilt up at a viewpoint. Eased
        // rather than snapped, because the tilt is the whole moment.
        this.lookY = 0;
        this.targetLookY = 0;
        this.lookSpeed = 2.6;

        // Horizontal look-ahead: the camera leads slightly in the direction of
        // travel and drifts back on stopping. Almost invisible when present;
        // the scene feels stiff and reactive without it.
        this.ahead = 0;
        this.aheadTarget = 0;
        this.aheadMax = 130;
        this.aheadSpeed = 1.8;
    }

    /**
     * @param {number} dir - -1, 0 or +1 direction of travel
     */
    leadBy(dir) {
        this.aheadTarget = dir * this.aheadMax;
    }

    updateAhead(dt) {
        const k = 1 - Math.exp(-this.aheadSpeed * dt);
        this.ahead += (this.aheadTarget - this.ahead) * k;
        return this.ahead;
    }

    /**
     * Requests a vertical look offset, in screen px. Positive pushes the world
     * down the screen, which reads as the character looking up.
     */
    look(offset) {
        this.targetLookY = offset;
    }

    /** Eases the look toward its target. Call once per frame. */
    updateLook(dt) {
        const k = 1 - Math.exp(-this.lookSpeed * dt);
        this.lookY += (this.targetLookY - this.lookY) * k;
        if (Math.abs(this.targetLookY - this.lookY) < 0.1) this.lookY = this.targetLookY;
        return this.lookY;
    }

    /** Largest valid camera x. Zero when the world is narrower than the viewport. */
    get maxX() {
        return Math.max(0, this.worldWidth - this.viewportWidth);
    }

    /** Clamps to the world bounds so the camera never reveals past the edges. */
    clamp(x) {
        return Math.min(this.maxX, Math.max(0, x));
    }

    /** Centres immediately on a target, ignoring the deadzone. Used on spawn. */
    snapTo(targetX) {
        this.x = this.clamp(targetX - this.viewportWidth / 2);
        return this.x;
    }

    /**
     * Moves the camera only as far as needed to keep the target inside the
     * deadzone band.
     * @param {number} targetX - target position in world px
     */
    follow(targetX) {
        const margin = (this.viewportWidth * this.deadzone) / 2;
        const centre = this.x + this.viewportWidth / 2;

        if (targetX < centre - margin) {
            this.x = this.clamp(this.x + (targetX - (centre - margin)));
        } else if (targetX > centre + margin) {
            this.x = this.clamp(this.x + (targetX - (centre + margin)));
        }
        return this.x;
    }

    /**
     * World x -> screen x for a layer at the given parallax factor.
     *
     * 1 is the ground plane and tracks the camera exactly. Below 1 sits further
     * away and drifts more slowly; above 1 sits in front of the action and
     * sweeps past faster than the ground.
     *
     * The centring origin is added *outside* the parallax term. Folding it into
     * `renderX` would scale it by each plane's parallax, sliding the back of a
     * room sideways relative to its floor.
     */
    toScreen(worldX, parallax = 1) {
        return (worldX + this.originX) / this.pixelScale - this.planeOffset(parallax);
    }

    /**
     * A plane's scroll, in WHOLE buffer pixels.
     *
     * This is the difference between a scene that pans and a scene that boils.
     *
     * Every sprite is drawn at a rounded position, because a sprite drawn at a
     * fractional one is resampled and its outline crawls. But the position
     * being rounded used to contain the camera, which moves continuously — so
     * each prop crossed its own rounding threshold at its own moment. Two props
     * a fixed distance apart were measured wobbling between 68 and 69 pixels
     * apart, changing 1,480 times over a 4,000-frame pan. Nothing in the world
     * had moved relative to anything else; the scene simply shimmered.
     *
     * Rounding the camera instead makes each prop's fractional part a CONSTANT
     * — it depends only on its own world x, which never changes. So rounding is
     * stable, the whole plane steps by exactly one pixel at a time, and props
     * hold their spacing exactly.
     *
     * Per plane, because each parallax scrolls at its own rate and each is
     * entitled to its own whole-pixel step.
     */
    planeOffset(parallax = 1) {
        return Math.round(this.scrollX * parallax / this.pixelScale);
    }

    /**
     * The scrolled position, before centring: followed position plus look-ahead,
     * clamped so leading cannot reveal past the world edge.
     */
    get scrollX() {
        return this.clamp(this.x + this.ahead);
    }

    /**
     * Left margin when the world is narrower than the viewport.
     *
     * A room interior is smaller than the window, so there is nothing to
     * scroll; without this it would sit hard against the left edge with the
     * dead space all on one side. Zero for the rooftop, which is far wider than
     * any viewport, so scrolling worlds are unaffected.
     */
    get originX() {
        return Math.max(0, (this.viewportWidth - this.worldWidth) / 2);
    }

    /** Width of the render buffer, in render px. */
    get renderWidth() {
        return this.viewportWidth / this.pixelScale;
    }

    /**
     * The position actually used for drawing the ground plane, and the exact
     * inverse of a screen-x back to world-x — clicking the floor depends on it.
     */
    get renderX() {
        return this.scrollX - this.originX;
    }
}
