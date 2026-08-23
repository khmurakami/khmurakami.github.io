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
 * @param {number} [input.vx]        current velocity, world px per second
 * @param {number} [input.accel]     px/s^2 getting going
 * @param {number} [input.brake]     px/s^2 stopping
 * @param {number} [input.turn]      multiplier on brake when reversing; below 1,
 *                                   so changing your mind mid-stride costs time
 * @returns {{nextX:number, nextZ:number, wants:boolean, target:number|null,
 *            vx:number, moving:boolean}}
 */
export function intent({
    held, heldZ, target, x, z, dt,
    speed, depthSpeed, arriveAt = 4,
    vx = 0, accel = 2600, brake = 3400, turn = 0.5
}) {
    let nextX = x;
    let nextZ = z;
    let wants = false;
    let nextTarget = target;

    // ── What the player is asking for, as a direction ────────────────
    //
    // Keys win outright, and cancel any click destination. Without this the
    // stale destination resumes control on key release and drags the character
    // backwards — reading as the character spontaneously turning around.
    let want = 0;
    if (held !== 0) {
        want = held;
        nextTarget = null;
        wants = true;
    } else if (target !== null) {
        const gap = target - x;
        if (Math.abs(gap) > arriveAt) {
            want = Math.sign(gap);
            wants = true;
        } else {
            nextTarget = null;   // arrived
        }
    }

    // ── Momentum ─────────────────────────────────────────────────────
    //
    // The character used to reach full speed and stop dead within a single
    // frame, which reads as a cursor being dragged rather than as a person
    // walking. Velocity is carried between frames instead, and the rates are
    // asymmetric because bodies are: stopping is quicker than starting, and
    // REVERSING is slower than either — that little scuff of hesitation when
    // you change your mind mid-stride is most of what sells the weight.
    const goal = want * speed;
    let rate = accel;
    if (want === 0) rate = brake;
    else if (vx !== 0 && Math.sign(want) !== Math.sign(vx)) rate = brake * turn;
    // `turn` is BELOW 1 on purpose. A higher rate would snap the turnaround,
    // which is right for a platformer and wrong here: the hesitation is the
    // point. Reversing takes longer than simply stopping.

    const dv = goal - vx;
    const step = rate * dt;
    let nextVx = Math.abs(dv) <= step ? goal : vx + Math.sign(dv) * step;

    // Below a pixel or so a second it is standing still, and letting a tiny
    // residual velocity run keeps the walk cycle twitching forever.
    if (want === 0 && Math.abs(nextVx) < 1) nextVx = 0;

    nextX = x + nextVx * dt;

    // Never overshoot a click destination and oscillate around it. Checked on
    // the resolved position, so momentum cannot carry past the flag either.
    if (want !== 0 && target !== null) {
        const gap = target - x;
        if (Math.sign(target - nextX) !== Math.sign(gap)) {
            nextX = target;
            nextVx = 0;
            nextTarget = null;
        }
    }

    if (heldZ !== 0) {
        nextZ = Math.max(0, Math.min(1, z + heldZ * depthSpeed * dt));
        nextTarget = null;
        wants = true;
    }

    // `wants` is what the player asked for; `moving` is what is actually
    // happening. They differ during the coast after a key release, which is
    // exactly when the walk cycle still needs to be playing.
    return {
        nextX, nextZ, wants, target: nextTarget,
        vx: nextVx,
        moving: wants || Math.abs(nextVx) > 1
    };
}
