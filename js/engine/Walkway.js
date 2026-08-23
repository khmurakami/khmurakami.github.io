/**
 * Where you are allowed to walk, as a shaped route rather than a rectangle.
 *
 * THE PROBLEM this solves. Walkability used to be "the whole deck, minus the
 * solid props" — which is invisible. Nothing on screen told you the floor was
 * a floor, where it ended, or why you stopped. You could wander into the back
 * wall and off the front lip, and the roof read as a field of scenery you were
 * loose in rather than a place with a route through it.
 *
 * THE FIX is that the route is declared as data, movement is clamped to it, and
 * `World` draws the floor *from this same object*. The worn path you can see is
 * not a decoration laid over the collision volume — it IS the collision volume.
 * They cannot drift apart, because there is only one of them.
 *
 * The route is a polyline of control points, each naming the near and far edge
 * of the walkable band at that x. Between them the edges are interpolated with
 * a smoothstep, so the path curves rather than kinking: widening into a zone
 * landmark, narrowing on the stretch between two of them. That shaping is what
 * makes a wide-open deck still read as having somewhere to go.
 */

/** Smoothstep. Linear interpolation kinks visibly at every control point. */
const ease = (t) => t * t * (3 - 2 * t);

/** One continuous run of route: a near edge and a far edge along x. */
class Lane {
    constructor(id, edge) {
        if (!edge || edge.length < 2) {
            throw new Error(`Walkway: lane '${id}' needs at least two control points`);
        }
        this.id = id;
        // Sorted rather than trusted, so the manifest can list control points in
        // whatever order reads best beside the props they belong to.
        this.points = [...edge].sort((a, b) => a.x - b.x);
    }

    get from() { return this.points[0].x; }
    get to() { return this.points[this.points.length - 1].x; }

    /** Whether this lane exists at all at this x. */
    spans(x) { return x >= this.from && x <= this.to; }

    /**
     * The band at this x, as `{near, far}`.
     *
     * Past either end the outermost band is held rather than extrapolated:
     * continuing a slope past its last point eventually inverts the band and
     * produces a stretch of route with negative width.
     */
    bandAt(x) {
        const pts = this.points;
        if (x <= pts[0].x) return { near: pts[0].near, far: pts[0].far };

        const last = pts[pts.length - 1];
        if (x >= last.x) return { near: last.near, far: last.far };

        for (let i = 1; i < pts.length; i++) {
            const b = pts[i];
            if (x > b.x) continue;
            const a = pts[i - 1];
            const t = ease((x - a.x) / (b.x - a.x));
            return {
                near: a.near + (b.near - a.near) * t,
                far: a.far + (b.far - a.far) * t
            };
        }
        return { near: last.near, far: last.far };
    }

    /** Samples the lane across an x range, for drawing. */
    sample(x0, x1, step = 28) {
        const out = [];
        const start = Math.max(x0, this.from);
        const end = Math.min(x1, this.to);
        if (end <= start) return out;

        for (let x = start; x < end; x += step) out.push({ x, ...this.bandAt(x) });
        // Always finish exactly on the end, or the path stops a fraction short
        // and shows a seam at the edge of the screen.
        out.push({ x: end, ...this.bandAt(end) });
        return out;
    }
}

export class Walkway {
    /**
     * @param {object} spec
     * @param {Array<{id?: string, edge: Array}>} [spec.lanes]
     *        One entry per run of route. A roof with a raised service level has
     *        two: they are separate places to walk, at different heights, joined
     *        by steps — and a single band cannot describe a gap in the middle.
     * @param {Array} [spec.edge] - shorthand for a single unnamed lane
     */
    constructor(spec = {}) {
        const lanes = spec.lanes
            ? spec.lanes.map((l, i) => new Lane(l.id || `lane${i}`, l.edge))
            : [new Lane('main', spec.edge)];
        if (!lanes.length) throw new Error('Walkway: no lanes');
        this.lanes = lanes;
    }

    /**
     * The route's own extent along x — the west and east ends of the world.
     *
     * The walkable world is the route, not the manifest width. Letting the
     * character walk past the last control point puts them on deck that no lane
     * covers, where `clamp` has no band to pull them onto and depth stops being
     * constrained at all.
     */
    get from() { return Math.min(...this.lanes.map(l => l.from)); }
    get to() { return Math.max(...this.lanes.map(l => l.to)); }

    /** Every lane that exists at this x, with its band. */
    bandsAt(x) {
        return this.lanes
            .filter(l => l.spans(x))
            .map(l => ({ id: l.id, ...l.bandAt(x) }));
    }

    /** Whether this spot is on any lane. */
    contains(x, z) {
        return this.bandsAt(x).some(b => z >= b.near && z <= b.far);
    }

    /**
     * Pulls a position onto the nearest lane.
     *
     * Clamped rather than blocked: walking into the back wall should slide you
     * along it, the way per-axis collision does. Stopping dead at the edge of a
     * band the player cannot see reads as the game snagging.
     *
     * The nearest lane wins, so stepping off the raised service level puts you
     * on its own edge rather than teleporting to the deck below — the height
     * change is `Terrain`'s business, not this one's.
     */
    clamp(x, z) {
        const bands = this.bandsAt(x);
        if (!bands.length) return z;

        let best = z;
        let bestDist = Infinity;
        for (const b of bands) {
            const c = Math.min(b.far, Math.max(b.near, z));
            const dist = Math.abs(c - z);
            if (dist < bestDist) { bestDist = dist; best = c; }
        }
        return best;
    }
}
