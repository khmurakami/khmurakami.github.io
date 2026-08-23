/**
 * Inside the corrugated shack — the workshop.
 *
 * THE IDEA. This is the room the rooftop was built in. Everything in here is a
 * real artefact of making this site: the pegboard holds the actual scripts in
 * the asset pipeline, the paint shelf holds the actual 64-colour palette, the
 * plans on the bench are the manifest that declared the roof, and the CRT runs
 * the same terminal that stands out on the roof.
 *
 * That premise is the whole point. A room full of *plausible workshop objects*
 * is set dressing, and it reads as set dressing however good the art is,
 * because nothing in it rewards looking. A room where every object is a true
 * thing about the world you are standing in rewards all of it — and it settles
 * what belongs in here and what does not.
 *
 * THE CONTRACT is identical to the rooftop's (see `city.js`). Same planes, same
 * slots, same solids. That is what lets `World`, `Collision`, `Terrain` and
 * `Triggers` cross the threshold unchanged, and what lets this room be walked
 * around as labelled placeholders before a single interior asset exists.
 */

export const workshop = {
    referenceHeight: 941,

    /** Where the character's feet sit, as a fraction of viewport height. */
    groundLine: 0.80,

    /**
     * The floor.
     *
     * Deeper and larger-scaled than the roof deck: indoors you are close to the
     * walls, and the character reading bigger is what sells having stepped from
     * an open roof into a small space. Depth is traversed faster too — the room
     * is a few strides across and should feel it.
     */
    deck: {
        frontY: 0.905,
        backY: 0.700,
        frontScale: 1.18,
        backScale: 0.92,
        depthSpeed: 0.85
    },

    /**
     * Narrower than any viewport, deliberately.
     *
     * The room does not scroll — you see all of it at once, which is what makes
     * it read as a room rather than another corridor. `Camera.originX` centres
     * it in the window.
     */
    width: 1500,

    /**
     * Interior planes.
     *
     * There is no distance indoors, so there is almost no parallax: the wall is
     * a hand's reach behind the bench. `fore` is the only plane moving
     * differently, holding what hangs between the camera and the room. Haze on
     * the back wall is kept tiny — indoor air is not deep enough to have
     * colour, and the haze that unifies a skyline just makes a wall look dirty.
     */
    planes: [
        { id: 'back', parallax: 0.92, haze: 0.06 },
        { id: 'deck', parallax: 1.00, haze: 0.00 },
        { id: 'fore', parallax: 1.12, haze: 0.00 }
    ],

    /** A flat floor. No steps indoors — the room is one stride deep. */
    platforms: [],

    /**
     * The floor you can actually stand on.
     *
     * A room needs this as much as the roof does: without it you walk into the
     * back wall and stand inside the pegboard. Narrows at each end so the room
     * has corners rather than continuing past its own walls.
     */
    walkway: {
        tone: [206, 186, 158],
        edge: [
            { x: 60,   near: 0.16, far: 0.62 },
            { x: 250,  near: 0.10, far: 0.72 },   // the cot end
            { x: 720,  near: 0.10, far: 0.66 },   // in front of the bench
            { x: 1100, near: 0.10, far: 0.74 },
            { x: 1290, near: 0.12, far: 0.72 },   // the doormat
            { x: 1430, near: 0.20, far: 0.66 }
        ]
    },

    collision: { radius: 15, depthRadius: 0.04 },
    maxStep: 14,

    /** Warmer than the roof's night blue: this room has a bulb burning in it. */
    hazeColor: [92, 74, 66],

    actorPlane: 'deck',

    /**
     * Painted behind everything, so a slot still showing its placeholder reads
     * against the inside of a shed rather than against the night sky.
     */
    groundTone: '#2a2018',

    /** Where the floor meets the back wall. Must equal 1 - deck backdrop heightFrac. */
    horizonY: 0.70,

    props: [
        // ═══ THE BACK WALL ═══════════════════════════════════════════════
        // Left to right, the wall is the story of how the art got made: what it
        // looks like out there, what was built, what built it, and what it was
        // all coloured with.

        {
            // The roof you just left, seen from inside. The one cool light in a
            // warm room, and the reason this interior does not feel sealed off.
            id: 'window', plane: 'back', x: 250, y: 0.605, height: 150,
            src: './assets/city/interior/window.png',
            light: { radius: 130, color: [130, 170, 255], oy: 70, intensity: 0.55, pool: false },
            shadow: false
        },
        {
            // Index cards, pinned. Projects as objects on a board rather than a
            // list in a panel — you read a pinboard by walking up to it.
            id: 'pinboard', plane: 'back', x: 620, y: 0.625, height: 132,
            src: './assets/city/interior/pinboard.png',
            interact: { action: 'projects', label: 'Read the board', width: 150 },
            shadow: false
        },
        {
            // Pegboard. The tools hanging on it are the actual pipeline scripts.
            id: 'tool_wall', plane: 'back', x: 905, y: 0.635, height: 118,
            src: './assets/city/interior/tool_wall.png',
            interact: { action: 'pipeline', label: 'Look at the tools', width: 150 },
            shadow: false
        },
        {
            // Sixty-four jars. Every colour in the world came off this shelf.
            id: 'paint_shelf', plane: 'back', x: 1165, y: 0.615, height: 108,
            src: './assets/city/interior/paint_shelf.png',
            interact: { action: 'palette', label: 'Sixty-four jars', width: 150 },
            shadow: false
        },

        // ═══ THE FLOOR ═══════════════════════════════════════════════════

        {
            // The bench the whole room is arranged around.
            id: 'workbench', z: 0.70, plane: 'deck', x: 720, y: 0.80, height: 108,
            src: './assets/city/interior/workbench.png',
            solid: { w: 260, d: 0.13 }
        },
        {
            // The same terminal that stands on the roof, on the bench where it
            // was presumably built. Reusing the roof's own asset is the joke.
            id: 'crt', z: 0.62, plane: 'deck', x: 790, y: 0.80, height: 92,
            src: './assets/city/pixel/crt_terminal.png',
            interact: { action: 'terminal', label: 'Use the terminal', width: 120 },
            light: { radius: 60, color: [120, 255, 190], oy: 60, intensity: 0.8 },
            anim: { type: 'flicker' },
            solid: { w: 60, d: 0.07 }
        },
        {
            // The manifest, as drawings. `city.js` genuinely is a drawing of the
            // roof made before the roof existed, so this is not a metaphor.
            id: 'plans', z: 0.63, plane: 'deck', x: 620, y: 0.80, height: 62,
            src: './assets/city/interior/plans.png',
            interact: { action: 'manifest', label: 'Unroll the plans', width: 110 },
            shadow: false
        },
        {
            // Diegetic mute. A switch labelled "sound" in the corner of the
            // screen is UI; a radio you walk over and turn off is the room.
            id: 'radio', z: 0.56, plane: 'deck', x: 380, y: 0.80, height: 54,
            src: './assets/city/interior/radio.png',
            interact: { action: 'radio', label: 'The radio', width: 110 },
            solid: { w: 42, d: 0.06 }
        },
        {
            // Someone works late enough to sleep here. One object doing all the
            // characterisation the room needs.
            id: 'cot', z: 0.84, plane: 'deck', x: 250, y: 0.80, height: 68,
            src: './assets/city/interior/cot.png',
            interact: { action: 'cot', label: 'The cot', width: 130 },
            solid: { w: 180, d: 0.11 }
        },

        // Working clutter. Not scattered — put where someone would put it: the
        // stool at the bench, the crates against the wall, out of the walkway.
        { id: 'stool', z: 0.54, plane: 'deck', x: 855, y: 0.80, height: 62,
          src: './assets/city/pixel/folding_chair.png', solid: { w: 44, d: 0.06 } },
        { id: 'parts_crate', z: 0.80, plane: 'deck', x: 1040, y: 0.80, height: 78,
          src: './assets/city/pixel/crates.png', solid: { w: 60, d: 0.09 } },
        { id: 'parts_boxes', z: 0.76, plane: 'deck', x: 1118, y: 0.80, height: 54,
          src: './assets/city/pixel/boxes.png', solid: { w: 56, d: 0.08 } },
        { id: 'offcuts', z: 0.34, plane: 'deck', x: 1010, y: 0.80, height: 34,
          src: './assets/city/interior/offcuts.png', shadow: false },

        {
            // The way out. Standing in it prompts exactly like a door on the
            // roof does — the same Triggers zone, so leaving and entering are
            // one interaction from the player's side.
            // 240, not 200: at the back of the room depth scaling takes almost
            // 8% off, and a doorway that measures shorter than the person
            // walking through it is the kind of thing you feel before you see.
            id: 'door_out', z: 0.92, plane: 'deck', x: 1350, y: 0.80, height: 240,
            src: './assets/city/interior/door_inner.png',
            door: { action: 'leave', label: 'Back out to the roof', width: 150 },
            solid: { w: 40, d: 0.05 }
        },

        // ═══ FOREGROUND ══════════════════════════════════════════════════
        // The bulb strings finally have something to hang between. On the roof
        // they float in open air with nothing to string them from; across a
        // ceiling they are the light the whole room is lit by.
        { id: 'bulbs', plane: 'fore', x: 0, y: 0.30, height: 46,
          src: './assets/city/pixel/bulb_string.png', repeat: true,
          anim: { type: 'sway', speed: 0.5, amount: 2 }, shadow: false },
        { id: 'ceiling_beam', plane: 'fore', x: 0, y: 0.14, height: 60,
          src: './assets/city/interior/beam.png', repeat: true, shadow: false }
    ],

    backdrops: [
        { plane: 'back', src: './assets/city/interior/wall.png', repeat: true },
        { plane: 'deck', src: './assets/city/interior/floor.png', repeat: true,
          anchor: 'bottom', heightFrac: 0.30 }
    ],

    /**
     * Where you arrive, and which way you are looking.
     *
     * Just inside the door, facing left into the room, so the first thing in
     * frame is the bench rather than the wall you walked through.
     */
    spawn: { x: 1270, z: 0.62 },
    facing: 'left',

    /**
     * Slower than outdoors. You cross this room in three strides; at roof pace
     * you would cross it in one and never look at anything.
     */
    walkSpeed: 190,
    runMultiplier: 1.4,
    runLookAhead: 60,

    /** Heavier than the roof: a small space with one bulb in it. */
    post: {
        vignette: 0.46,
        grain: 0.05
    }
};
