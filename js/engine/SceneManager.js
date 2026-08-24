/**
 * Which place you are in, and the transition between places.
 *
 * A scene is a manifest plus a spawn point. The rooftop is a scene; so is the
 * inside of the workshop. Because an interior is declared with exactly the same
 * contract as the roof — planes, prop slots, platforms, solids — every engine
 * system keeps working across the boundary and a room renders as labelled
 * placeholders before any art for it exists.
 *
 * The manager owns three things the game loop should not have to:
 *
 *  - a STACK, so leaving a room puts you back on the exact tile you entered
 *    from rather than at the roof's spawn point;
 *  - a TRANSITION, so the swap happens behind a veil instead of the world
 *    visibly teleporting under the character;
 *  - the `busy` flag, so input is ignored while the veil is up. Without it you
 *    can walk during the fade and arrive somewhere you did not aim for.
 *
 * It is deliberately free of DOM and canvas: it decides *what* is active and
 * *how opaque the veil is*, and the game draws that. That is what makes the
 * timing testable.
 */
export class SceneManager {
    /**
     * @param {object} config
     * @param {Array<{id: string, manifest: object, spawn: {x: number, z: number},
     *                facing?: string}>} config.scenes
     * @param {string} config.start          - id of the scene to begin in
     * @param {number} [config.fadeDuration] - seconds for each half of the fade
     */
    constructor({ scenes, start, fadeDuration = 0.34, isReady = () => true }) {
        this.scenes = new Map(scenes.map(s => [s.id, s]));
        if (!this.scenes.has(start)) {
            throw new Error(`SceneManager: unknown start scene '${start}'`);
        }

        this.activeId = start;
        this.fadeDuration = fadeDuration;

        /**
         * Whether a scene's art has arrived.
         *
         * Defaults to "always", so a caller that loads everything up front —
         * and every test — behaves exactly as it did. See `update`.
         */
        this.isReady = isReady;

        /** Where we came from, innermost last. Entries restore a position. */
        this.stack = [];

        /** null | 'out' | 'in'. The veil is only up while this is set. */
        this.phase = null;
        this.elapsed = 0;
        this.queued = null;

        /**
         * Called at the midpoint of the fade, with the scene being entered and
         * the position to place the character at. The game rebuilds its engines
         * here, hidden by the veil.
         * @type {(scene: object, spawn: {x: number, z: number, facing?: string}) => void}
         */
        this.onSwap = () => {};
    }

    /** The active scene definition. */
    get scene() {
        return this.scenes.get(this.activeId);
    }

    /** The active manifest — what World, Collision and Terrain are built from. */
    get manifest() {
        return this.scene.manifest;
    }

    /** True while a transition is in flight. The game freezes input on this. */
    get busy() {
        return this.phase !== null;
    }

    /** True when there is somewhere to go back to. */
    get canLeave() {
        return this.stack.length > 0;
    }

    /**
     * Opacity of the black veil, 0..1.
     *
     * Rises over the first half and falls over the second, reaching exactly 1
     * at the swap so the change of place is never visible.
     */
    get veil() {
        if (!this.phase) return 0;
        const t = Math.min(1, this.elapsed / this.fadeDuration);
        return this.phase === 'out' ? t : 1 - t;
    }

    /**
     * Begins a move into another scene.
     *
     * @param {string} id      - scene to enter
     * @param {object} from    - {x, z, facing} to return to when leaving again
     * @returns {boolean} false if the move was refused — unknown scene, or a
     *          transition already running. Refusing rather than queueing means
     *          mashing the interact key cannot stack up transitions.
     */
    enter(id, from) {
        if (this.busy || !this.scenes.has(id) || id === this.activeId) return false;

        const target = this.scenes.get(id);
        this.stack.push({ id: this.activeId, ...from });
        this.queued = { id, spawn: { ...target.spawn, facing: target.facing } };
        this.phase = 'out';
        this.elapsed = 0;
        return true;
    }

    /**
     * Begins a move back to wherever we entered the current scene from.
     * @returns {boolean} false if there is nowhere to go back to, or mid-fade.
     */
    leave() {
        if (this.busy || !this.canLeave) return false;

        const back = this.stack.pop();
        this.queued = { id: back.id, spawn: { x: back.x, z: back.z, facing: back.facing } };
        this.phase = 'out';
        this.elapsed = 0;
        return true;
    }

    /**
     * Advances the transition. Call once per frame with the frame delta.
     *
     * The swap happens on crossing the midpoint, not on a timer of its own, so
     * a long frame cannot leave the veil down over the old scene.
     */
    update(dt) {
        if (!this.phase) return;
        this.elapsed += dt;
        if (this.elapsed < this.fadeDuration) return;

        // The veil holds at full black until the room being entered has its
        // art.
        //
        // Only the starting scene is waited for before the world is revealed;
        // the interiors download behind it, because 26 files for rooms nobody
        // has walked into yet were 22% of the artwork on the critical path.
        // Almost always they are long finished before anyone reaches a door.
        // When they are not, the transition simply stays dark a moment longer,
        // which is invisible — a black screen in the middle of a fade is what a
        // fade looks like. The alternative is arriving in a room built of
        // dashed placeholder boxes.
        if (this.phase === 'out' && !this.isReady(this.queued.id)) {
            this.elapsed = this.fadeDuration;
            return;
        }

        if (this.phase === 'out') {
            const { id, spawn } = this.queued;
            this.activeId = id;
            this.queued = null;
            // Carry the overshoot into the fade-in rather than discarding it,
            // so the two halves total the same time regardless of frame rate.
            this.elapsed -= this.fadeDuration;
            this.phase = 'in';
            this.onSwap(this.scene, spawn);
        } else {
            this.phase = null;
            this.elapsed = 0;
        }
    }
}
