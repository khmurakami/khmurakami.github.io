/**
 * Elevation across the floor.
 *
 * The world already has two axes — x along the roof and z into it. This adds
 * the third: how high the floor is at any point. Raised sections, catwalks and
 * the steps between them are described as regions rather than baked into the
 * art, so props stand on them automatically and the character walks up them
 * without anything being hand-placed twice.
 *
 * Height is deliberately separate from depth. Moving upstage makes you smaller;
 * climbing does not. Conflating them is what makes fake-3D scenes read wrong.
 */
export class Terrain {
    /**
     * @param {Array} platforms - regions of raised floor. Each is
     *   { id, x0, x1, z0, z1, elevation, ramp? }
     *   `ramp` makes the height interpolate across the region:
     *   { axis: 'x' | 'z', from: number, to: number }
     */
    constructor(platforms = []) {
        this.platforms = platforms;
    }

    contains(p, x, z) {
        return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
    }

    /**
     * Height of the floor at a point, in reference pixels.
     *
     * Overlapping regions resolve to the highest, so a step sitting on a
     * platform reads as the top surface rather than fighting with it.
     */
    elevationAt(x, z) {
        // Starts unset rather than at zero: sunken areas are as valid as raised
        // ones, and seeding with 0 would quietly make negative heights
        // impossible to express.
        let best = null;
        for (const p of this.platforms) {
            if (!this.contains(p, x, z)) continue;
            const h = this.heightOf(p, x, z);
            if (best === null || h > best) best = h;
        }
        return best === null ? 0 : best;
    }

    heightOf(p, x, z) {
        if (!p.ramp) return p.elevation || 0;

        const { axis, from, to } = p.ramp;
        const span = axis === 'x' ? (p.x1 - p.x0) : (p.z1 - p.z0);
        if (span <= 0) return to;

        const along = axis === 'x' ? (x - p.x0) : (z - p.z0);
        const t = Math.max(0, Math.min(1, along / span));
        return from + (to - from) * t;
    }

    /**
     * Whether a step from one point to another is walkable.
     *
     * A small rise is a kerb and can be stepped over; a large one is a wall and
     * cannot. Without this the character would teleport up the side of a
     * platform instead of having to use the ramp.
     *
     * @param {number} maxStep - largest height change that can be walked, in
     *                           reference px
     */
    canMove(fromX, fromZ, toX, toZ, maxStep = 14) {
        const rise = this.elevationAt(toX, toZ) - this.elevationAt(fromX, fromZ);
        return rise <= maxStep;
    }

    /** The region under a point, if any — useful for debugging and triggers. */
    platformAt(x, z) {
        let found = null;
        let best = -1;
        for (const p of this.platforms) {
            if (!this.contains(p, x, z)) continue;
            const h = this.heightOf(p, x, z);
            if (h > best) { best = h; found = p; }
        }
        return found;
    }
}
