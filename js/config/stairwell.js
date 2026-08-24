/**
 * Inside the stair hut — the landing.
 *
 * THE IDEA. This is the threshold. It is the top of the stairwell you came up
 * to get to the roof, and the only room in the world that faces both ways: the
 * city is down those stairs, the roof is back through that door.
 *
 * So it is the arrival room, and everything in it is about arriving — the coat
 * that got hung up on the way in, the noticeboard every old building has by its
 * stairs, the mail nobody has taken up yet. That is also why the "about me"
 * content lives here rather than in a panel labelled About: read off a
 * noticeboard on a landing it is a person who lives somewhere, and a page of
 * biography is a page of biography wherever you put it.
 *
 * It is the FIRST door you meet — it sits at the spawn point with a lit
 * doorway — which makes it the door that teaches what doors do. That is the
 * whole reason it is a room and not a panel.
 *
 * THE CONTRACT is identical to the rooftop's (see `city.js`).
 */

export const stairwell = {
    referenceHeight: 941,

    groundLine: 0.80,

    /**
     * Tighter and steeper than the workshop.
     *
     * A stairwell landing is the smallest room in the world: you are almost
     * against the back wall, so the scale barely falls off across its depth.
     */
    deck: {
        frontY: 0.900,
        backY: 0.710,
        frontScale: 1.22,
        backScale: 0.98,
        depthSpeed: 0.9
    },

    /** Small even by interior standards. Two strides end to end. */
    width: 1100,

    planes: [
        { id: 'back', parallax: 0.94, haze: 0.05 },
        { id: 'deck', parallax: 1.00, haze: 0.00 },
        { id: 'fore', parallax: 1.14, haze: 0.00 }
    ],

    platforms: [],

    /**
     * The landing floor. Small enough that the edges are the whole room.
     */
    walkway: {
        tone: [190, 196, 200],
        edge: [
            { x: 60,   near: 0.18, far: 0.66 },
            { x: 240,  near: 0.12, far: 0.70 },
            { x: 640,  near: 0.12, far: 0.70 },
            { x: 900,  near: 0.12, far: 0.72 },   // the doormat
            { x: 1040, near: 0.20, far: 0.66 }
        ]
    },

    collision: { radius: 15, depthRadius: 0.04 },
    maxStep: 14,

    /**
     * Cold, unlike the workshop.
     *
     * A shared stairwell is nobody's room — painted institutional green, lit by
     * whatever bulb the building put in. Making it as warm as the workshop
     * would lose the one thing the two interiors have to say against each
     * other: one is worked in, this one is only passed through.
     */
    hazeColor: [70, 78, 88],
    groundTone: '#232a2c',

    actorPlane: 'deck',

    /** Where the floor meets the back wall. Must equal 1 - deck backdrop heightFrac. */
    horizonY: 0.71,

    props: [
        // ═══ THE BACK WALL ═══════════════════════════════════════════════
        {
            // Coat, bag, the thing you drop on the way in.
            id: 'coat_hooks', plane: 'back', x: 205, y: 0.600, height: 96,
            src: './assets/city/interior/coat_hooks.webp',
            interact: { action: 'coats', label: 'The hooks', width: 120 },
            shadow: false
        },
        {
            // Every old building has one of these by the stairs. This one
            // carries the about-me, which is the honest place for it.
            id: 'noticeboard', plane: 'back', x: 430, y: 0.628, height: 122,
            src: './assets/city/interior/noticeboard.webp',
            interact: { action: 'about', label: 'Read the notices', width: 150 },
            shadow: false
        },
        {
            // The building's mail. Leaving a note goes in a slot, which beats
            // a form in a panel by some distance.
            id: 'mailboxes', plane: 'back', x: 640, y: 0.645, height: 104,
            src: './assets/city/interior/mailboxes.webp',
            interact: { action: 'guestbook', label: 'Leave a note', width: 140 },
            shadow: false
        },
        {
            // Wired glass onto the airshaft. The one daylight-coloured thing in
            // a room lit by a bare bulb.
            id: 'stair_window', plane: 'back', x: 880, y: 0.585, height: 104,
            src: './assets/city/interior/stair_window.webp',
            light: { radius: 105, color: [150, 175, 215], oy: 52, intensity: 0.45, pool: false },
            shadow: false
        },

        // ═══ THE FLOOR ═══════════════════════════════════════════════════
        {
            // Down to the street. You cannot take them — the city is not built.
            // Saying so out loud is better than a stairwell that silently does
            // nothing when you stand in it.
            id: 'stairs_down', z: 0.52, plane: 'deck', x: 760, y: 0.80, height: 74,
            src: './assets/city/interior/stairs_down.webp',
            interact: { action: 'stairwell', label: 'Down to the street', width: 150 },
            shadow: false
        },
        {
            id: 'bike', z: 0.74, plane: 'deck', x: 330, y: 0.80, height: 104,
            src: './assets/city/interior/bike.webp',
            solid: { w: 120, d: 0.09 }
        },
        {
            id: 'radiator', z: 0.82, plane: 'deck', x: 560, y: 0.80, height: 62,
            src: './assets/city/interior/radiator.webp',
            solid: { w: 92, d: 0.08 }
        },

        // Clutter that belongs on a landing and nowhere else.
        { id: 'boots', z: 0.44, plane: 'deck', x: 235, y: 0.80, height: 30,
          src: './assets/city/interior/boots.webp', shadow: false },
        { id: 'landing_plant', z: 0.66, plane: 'deck', x: 470, y: 0.80, height: 72,
          src: './assets/city/pixel/planter.webp', solid: { w: 40, d: 0.06 } },
        { id: 'taped_poster', plane: 'back', x: 1000, y: 0.615, height: 78,
          src: './assets/city/pixel/poster.webp', shadow: false },

        {
            // Back up to the roof.
            id: 'door_up', z: 0.90, plane: 'deck', x: 955, y: 0.80, height: 240,
            src: './assets/city/interior/door_stair.webp',
            door: { action: 'leave', label: 'Back up to the roof', width: 150 },
            solid: { w: 40, d: 0.05 }
        },

        // ═══ FOREGROUND ══════════════════════════════════════════════════
        // The handrail you are standing behind, and the bulb the room is lit by.
        { id: 'handrail', plane: 'fore', x: 0, y: 1.0, height: 92,
          src: './assets/city/interior/handrail.webp', repeat: true, shadow: false },
        { id: 'bare_bulb', plane: 'fore', x: 520, y: 0.22, height: 54,
          src: './assets/city/interior/bare_bulb.webp',
          light: { radius: 150, color: [255, 220, 160], oy: 30, intensity: 0.7, pool: false },
          anim: { type: 'sway', speed: 0.35, amount: 1.5 }, shadow: false }
    ],

    backdrops: [
        { plane: 'back', src: './assets/city/interior/stair_wall.webp', repeat: true },
        { plane: 'deck', src: './assets/city/interior/stair_floor.webp', repeat: true,
          anchor: 'bottom', heightFrac: 0.29 }
    ],

    /** Just inside the door, facing left into the room. */
    spawn: { x: 875, z: 0.60 },
    facing: 'left',

    /** Small room, short strides. */
    walkSpeed: 175,
    runMultiplier: 1.35,
    runLookAhead: 50,

    post: {
        vignette: 0.44,
        grain: 0.05
    }
};
