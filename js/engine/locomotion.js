/**
 * Decides where the character wants to move this frame.
 *
 * Two input schemes share one character: keys held down, and a click-to-walk
 * destination. They have to be arbitrated explicitly, because a destination
 * left over from an earlier click will quietly take over the moment the keys
 * are released and walk the character back to it.
 *
 * Pure function: no DOM, no canvas, no state of its own, so the arbitration can
 * actually be tested.
 */

/**
 * @param {object} input
 * @param {number} input.held       -1, 0 or +1 along the roof
 * @param {number} input.heldZ      -1, 0 or +1 into the roof
 * @param {number|null} input.target destination from a click, or null for none
 * @param {number} input.x          current position along the roof
 * @param {number} input.z          current depth, 0..1
 * @param {number} input.dt         seconds since the last frame
 * @param {number} input.speed      world px per second
 * @param {number} input.depthSpeed depth units per second
 * @param {number} [input.arriveAt] how close counts as arrived
 * @returns {{nextX:number, nextZ:number, wants:boolean, target:number|null}}
 */
export function intent({
    held, heldZ, target, x, z, dt,
    speed, depthSpeed, arriveAt = 4
}) {
    let nextX = x;
    let nextZ = z;
    let wants = false;
    let nextTarget = target;

    // Keys win outright, and cancel any click destination. Without this the
    // stale destination resumes control on key release and drags the character
    // backwards — reading as the character spontaneously turning around.
    if (held !== 0) {
        nextX = x + held * speed * dt;
        nextTarget = null;
        wants = true;
    } else if (target !== null) {
        const gap = target - x;
        if (Math.abs(gap) > arriveAt) {
            nextX = x + Math.sign(gap) * speed * dt;
            wants = true;
            // Never overshoot the destination and oscillate around it.
            if (Math.sign(target - nextX) !== Math.sign(gap)) nextX = target;
        } else {
            nextTarget = null;   // arrived
        }
    }

    if (heldZ !== 0) {
        nextZ = Math.max(0, Math.min(1, z + heldZ * depthSpeed * dt));
        nextTarget = null;
        wants = true;
    }

    return { nextX, nextZ, wants, target: nextTarget };
}
