/**
 * Facing selection for an actor that moves on a floor plane.
 *
 * The character walks along the roof (x) and into it (z), so the facing has to
 * come from both axes. The two are not comparable as raw numbers — x is in
 * world pixels while z is a 0..1 fraction of the roof's depth — so depth is
 * scaled into pixel-equivalents before they are weighed against each other.
 * Comparing them directly would make the character face upstage from the
 * slightest depth nudge while sprinting sideways.
 */

export const DIRECTIONS = ['down', 'up', 'left', 'right'];

/**
 * How many world pixels one full unit of depth is worth when deciding facing.
 * The roof is far wider than it is deep, so a small z change is a big move in
 * depth terms and needs weighting up to compete with sideways travel.
 */
export const DEPTH_WEIGHT = 900;

/**
 * @param {number} dx - movement along the roof, positive is screen-right
 * @param {number} dz - movement into the roof, positive is upstage/away
 * @returns {'down'|'up'|'left'|'right'}
 */
export function directionFor(dx, dz = 0) {
    const depth = dz * DEPTH_WEIGHT;

    // Horizontal wins ties: the side profile is the most readable pose, and a
    // character that flips to a back view on a diagonal reads as indecisive.
    if (Math.abs(dx) >= Math.abs(depth)) return dx >= 0 ? 'right' : 'left';
    return depth > 0 ? 'up' : 'down';
}

/**
 * Sprite clip and mirroring for a facing.
 *
 * Left reuses the right-facing artwork mirrored at draw time, so only three
 * walk cycles exist for four directions.
 */
export function clipFor(facing, moving) {
    const base = moving ? 'walk' : 'idle';
    switch (facing) {
        case 'left':  return { clip: `${base}_side`, flip: true };
        case 'right': return { clip: `${base}_side`, flip: false };
        case 'up':    return { clip: `${base}_up`, flip: false };
        default:      return { clip: `${base}_down`, flip: false };
    }
}
