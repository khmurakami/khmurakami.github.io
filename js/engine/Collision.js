/**
 * Solid props.
 *
 * Without this the character walks through the world and nothing has weight —
 * a shed is a picture rather than a building. Footprints are declared on the
 * floor (x and z), not on screen: a prop's drawn height is irrelevant to whether
 * you can walk into it, and using the sprite's bounds would make tall thin
 * things block more than they should.
 */
export class Collision {
    /**
     * @param {Array} props - manifest props; those with `solid` become blockers
     * @param {object} [opts]
     * @param {number} [opts.radius] - the character's own half-width, in world px
     * @param {number} [opts.depthRadius] - the character's half-depth, in z units
     */
    constructor(props = [], { radius = 16, depthRadius = 0.045 } = {}) {
        this.radius = radius;
        this.depthRadius = depthRadius;

        this.blockers = props
            .filter(p => p.solid)
            .map(p => {
                const s = p.solid === true ? {} : p.solid;
                // Default footprint: as wide as the prop is tall is far too much,
                // so declare width explicitly and keep depth shallow — most
                // rooftop objects are wider than they are deep.
                const w = s.w != null ? s.w : p.height * 0.8;
                const d = s.d != null ? s.d : 0.10;
                return {
                    id: p.id,
                    x0: p.x - w / 2,
                    x1: p.x + w / 2,
                    z0: (p.z != null ? p.z : 0.5) - d / 2,
                    z1: (p.z != null ? p.z : 0.5) + d / 2
                };
            });
    }

    /** Whether the character standing here would overlap a blocker. */
    blocked(x, z) {
        for (const b of this.blockers) {
            if (x + this.radius > b.x0 && x - this.radius < b.x1 &&
                z + this.depthRadius > b.z0 && z - this.depthRadius < b.z1) {
                return b;
            }
        }
        return null;
    }

    /**
     * Resolves a proposed move, testing each axis separately.
     *
     * Per-axis is what lets the player slide along a wall instead of sticking to
     * it: walking diagonally into a shed should still carry you sideways past
     * it. Testing the combined move in one go would stop both axes dead.
     */
    resolve(fromX, fromZ, toX, toZ) {
        let x = fromX;
        let z = fromZ;

        if (!this.blocked(toX, z)) x = toX;
        if (!this.blocked(x, toZ)) z = toZ;

        return { x, z, hit: (x !== toX || z !== toZ) };
    }
}
