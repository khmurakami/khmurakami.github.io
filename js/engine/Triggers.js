/**
 * Trigger volumes along the world's x axis — the doors of the buildings.
 *
 * A trigger is a span of world space rather than a point, so the player can
 * stand anywhere in a doorway rather than having to hit an exact pixel. The
 * manager reports enter/exit transitions instead of raw containment, so the
 * caller can show a prompt once on arrival rather than every frame.
 */
export class Triggers {
    /**
     * @param {Array<{id: string, x: number, width: number, action: string, label?: string}>} zones
     *        `x` is the centre of the doorway in world px.
     */
    constructor(zones = []) {
        this.zones = zones;
        this.active = null;
    }

    /** The zone containing this position, or null. Nearest centre wins overlaps. */
    zoneAt(worldX) {
        let best = null;
        let bestDist = Infinity;
        for (const z of this.zones) {
            const dist = Math.abs(worldX - z.x);
            if (dist <= z.width / 2 && dist < bestDist) {
                best = z;
                bestDist = dist;
            }
        }
        return best;
    }

    /**
     * Advances the manager to a new position.
     *
     * @param {number} worldX
     * @returns {{entered: object|null, exited: object|null, active: object|null}}
     *          `entered` and `exited` are only set on the frame the transition
     *          happens, so a prompt can be shown and hidden exactly once.
     */
    update(worldX) {
        const found = this.zoneAt(worldX);
        const previous = this.active;

        if (found === previous) {
            return { entered: null, exited: null, active: found };
        }

        this.active = found;
        return { entered: found, exited: previous, active: found };
    }

    /** Forgets the current zone, so re-entering fires `entered` again. */
    reset() {
        this.active = null;
    }
}
