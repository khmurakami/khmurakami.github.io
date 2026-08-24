/**
 * The rooftop world.
 *
 * This file is the CONTRACT. It declares the depth planes and every prop slot
 * in the world — where each prop sits, how big it is, and what it does. The
 * engine renders a labelled placeholder for any slot whose image is missing, so
 * the layout, camera, collision and doors can all be built and tuned before any
 * art exists. Art is then generated to fit the slots, rather than slots being
 * reverse-engineered from whatever art happened to come back.
 *
 * `npm run assets` prints the outstanding slots as an asset spec.
 *
 * Coordinates
 * -----------
 * World x is in world pixels. Vertical positions are fractions of viewport
 * height, so the layout holds at any window size. `referenceHeight` is the
 * height these sizes were authored against.
 */

/**
 * Deterministic scatter: places `count` copies of a prop across a span with
 * seeded jitter in position, size and flip.
 *
 * Density is what separates a set from a place, but hand-listing sixty clutter
 * entries makes the manifest unreadable and the numbers meaningless. Seeded
 * means the layout is identical every load and in tests — a roof that
 * reshuffles on refresh feels broken, not alive.
 */
function scatter(base, { from, to, count, seed = 1, jitterY = 0, sizeVary = 0.18,
                         zFrom = null, zTo = null }) {
    let a = seed >>> 0;
    const rand = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const span = (to - from) / count;
    return Array.from({ length: count }, (_, i) => ({
        ...base,
        id: `${base.id}_${i}`,
        // Even spacing plus jitter, so it reads as scattered rather than gridded.
        x: Math.round(from + span * (i + 0.15 + rand() * 0.7)),
        y: base.y + (rand() - 0.5) * jitterY,
        height: Math.round(base.height * (1 + (rand() - 0.5) * 2 * sizeVary)),
        // Spread through the depth of the roof, not along one line at the front.
        ...(zFrom != null ? { z: +(zFrom + rand() * (zTo - zFrom)).toFixed(3) } : {}),
        flip: rand() < 0.5
    }));
}

/**
 * Places clutter AROUND REASONS instead of along a line.
 *
 * `scatter` above spaces things evenly and jitters them, which is the right
 * tool for a band of foreground silhouettes and the wrong one for anything a
 * person would have put down. Measured on the roof before this existed, the gap
 * between consecutive weeds varied by 0.30 and between foreground rails by 0.11
 * — where genuinely random placement scores about 1.00. They were not scattered
 * at all; they were a grid with a wobble, and a grid reads as wallpaper.
 *
 * Real clutter is not uniform, because the reasons for it are not uniform.
 * Water pools at the drains. Weeds grow where the water sits and where nobody
 * walks. Boxes and pots and rolled tarps pile up next to the hatch you carried
 * them through and the bench you were using them at. The empty stretches
 * between are what make the busy ones read as busy.
 *
 * So each item picks one anchor — a drain, a doorway, a workbench — in
 * proportion to its weight, and lands near it. The result clumps, and every
 * clump is somewhere a person would have made one.
 *
 * Seeded, like `scatter`, and for the same reason: a roof that reshuffles on
 * refresh feels broken rather than alive, and the tests need it to hold still.
 *
 * @param {object} base       the prop to copy
 * @param {object} opts
 * @param {Array}  opts.anchors  `{ x, weight?, spread? }` — the reasons
 * @param {number} opts.count    how many
 * @param {number} opts.spread   default fall-off around an anchor, in world px
 */
function cluster(base, { anchors, count, seed = 1, spread = 190, jitterY = 0,
                         sizeVary = 0.18, zFrom = null, zTo = null }) {
    let a = seed >>> 0;
    const rand = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const total = anchors.reduce((n, an) => n + (an.weight ?? 1), 0);

    /** One anchor, chosen in proportion to its weight. */
    const pick = () => {
        let r = rand() * total;
        for (const an of anchors) {
            r -= an.weight ?? 1;
            if (r <= 0) return an;
        }
        return anchors[anchors.length - 1];
    };

    return Array.from({ length: count }, (_, i) => {
        const anchor = pick();
        // Two uniforms summed give a triangular distribution: most items land
        // near their reason and a few stray, which is how things actually end
        // up. A flat offset would just make small even bands.
        const offset = (rand() + rand() - 1) * (anchor.spread ?? spread);

        return {
            ...base,
            id: `${base.id}_${i}`,
            x: Math.round(anchor.x + offset),
            y: base.y + (rand() - 0.5) * jitterY,
            height: Math.round(base.height * (1 + (rand() - 0.5) * 2 * sizeVary)),
            ...(zFrom != null ? { z: +(zFrom + rand() * (zTo - zFrom)).toFixed(3) } : {}),
            flip: rand() < 0.5
        };
    });
}

/**
 * The reasons things end up where they do on this roof.
 *
 * Written out once and shared, so the clutter and the things it clusters around
 * cannot drift apart — move the drain and the puddles follow it.
 *
 * The roof reads west to east as a sequence of places: you arrive by the stair
 * hut, pass the workshop, the garden, the study, the pigeon post, and end at
 * the viewpoint. Everything below hangs off that.
 */
const WHERE = {
    /** Water goes downhill and stops at the grates. */
    drains: [
        { x: 980, weight: 3, spread: 150 },
        { x: 3480, weight: 3, spread: 150 }
    ],

    /** Nobody sweeps the far ends or the gaps between the places that are used. */
    neglected: [
        { x: 200, weight: 2, spread: 180 },    // west of the stair hut
        { x: 1850, weight: 1, spread: 160 },   // between workshop and garden
        { x: 2900, weight: 1, spread: 170 },   // between garden and study
        { x: 3720, weight: 2, spread: 150 },   // between study and the post
        { x: 4600, weight: 2, spread: 200 },   // the long empty run east
        { x: 6050, weight: 2, spread: 160 }    // the far end, past everything
    ],

    /** Where somebody was carrying something and put it down. */
    working: [
        { x: 640, weight: 3, spread: 170 },    // the roof hatch — everything comes up here
        { x: 1320, weight: 3, spread: 190 },   // outside the workshop shack
        { x: 2380, weight: 2, spread: 200 },   // by the greenhouse
        { x: 3420, weight: 2, spread: 160 },   // the study hatch
        { x: 4180, weight: 2, spread: 170 },   // the pigeon loft
        { x: 5560, weight: 1, spread: 180 }    // the bench at the viewpoint
    ]
};

export const city = {
    referenceHeight: 941,

    /** Where the character's feet sit, as a fraction of viewport height. */
    groundLine: 0.80,

    /**
     * The deck as a floor with depth, not a single walking line.
     *
     * `z` runs 0 at the front edge of the roof to 1 at the back wall. Screen
     * position and scale are interpolated between the two, which is what turns
     * a side-scroller into 2.5D: walking upstage moves you back into the scene
     * and makes you smaller, and props sort against you by depth rather than by
     * a fixed layer order.
     */
    deck: {
        frontY: 0.895,   // fraction of viewport height at z = 0
        backY: 0.735,    // at z = 1
        frontScale: 1.06,
        backScale: 0.80,
        /** How fast depth is traversed relative to sideways walking. */
        depthSpeed: 0.55
    },

    /** Total walkable width. The deck plane is what the player traverses. */
    width: 6200,

    /**
     * Depth planes, back to front.
     *
     * `parallax` is the fraction of camera movement the plane tracks: 1.0 is the
     * plane the character walks on, lower is further away, higher is in front.
     *
     * `haze` overlays a translucent wash after the plane is drawn — this is the
     * atmospheric perspective that makes distance read, and it is what unifies
     * separately generated props into one scene. It accumulates with distance,
     * so keep the totals modest: every haze value dims everything behind it.
     */
    planes: [
        { id: 'sky',          parallax: 0.05, haze: 0.00 },
        // THREE bands of city rather than one.
        //
        // A single skyline plane gives the background one distance, so the city
        // reads as a painted flat behind the roof however many towers are on
        // it. Splitting it into three lets buildings pass each other as the
        // camera moves, which is the only thing that actually says "miles of
        // city" rather than "a picture of a city".
        //
        // Haze is REBALANCED, not added to: it accumulates, so four hazed
        // planes at the old values would have washed the sky out entirely.
        // Spread thinner across more layers, the far sky keeps about the same
        // brightness it had and the falloff between layers is more gradual.
        //
        // Nudged apart, not piled on. Haze ACCUMULATES — a plane wears
        // everything drawn in front of it — so the furthest band already sat
        // under 65% of it and raising every value would simply have erased the
        // sky. These push the separation between consecutive bands from
        // +0.15/+0.18/+0.17 to +0.17/+0.20/+0.19, and the furthest band from
        // 65% washed to 70%. The rest of "the background is busy" is contrast
        // in the ARTWORK, which is `npm run art:depth`, not more fog.
        { id: 'skyline_far',  parallax: 0.15, haze: 0.36 },
        { id: 'skyline',      parallax: 0.25, haze: 0.30 },
        { id: 'skyline_near', parallax: 0.38, haze: 0.22 },
        { id: 'far',          parallax: 0.55, haze: 0.15 },
        { id: 'deck',         parallax: 1.00, haze: 0.00 },
        { id: 'fore',         parallax: 1.40, haze: 0.00 }
    ],

    /**
     * Raised sections of the roof, in reference pixels of height.
     *
     * Described as regions rather than drawn into the floor art, so props
     * standing on them rise automatically and the character has to use the
     * steps instead of walking up the side.
     */
    platforms: [
        // The service level: the whole back strip where the structures sit.
        { id: 'service_deck', x0: 400, x1: 4900, z0: 0.62, z1: 1.0, elevation: 46 },

        // Steps up to it, at two points along the roof.
        { id: 'steps_west', x0: 1290, x1: 1420, z0: 0.44, z1: 0.62,
          ramp: { axis: 'z', from: 0, to: 46 } },
        { id: 'steps_east', x0: 3560, x1: 3690, z0: 0.44, z1: 0.62,
          ramp: { axis: 'z', from: 0, to: 46 } },

        // A catwalk running above the deck between two of the structures.
        { id: 'catwalk', x0: 2450, x1: 3200, z0: 0.86, z1: 0.98, elevation: 96 },
        { id: 'catwalk_ramp', x0: 2330, x1: 2450, z0: 0.86, z1: 0.98,
          ramp: { axis: 'x', from: 46, to: 96 } },

        // The viewpoint sits a step down, at the very lip of the roof.
        { id: 'lookout', x0: 5250, x1: 6050, z0: 0.0, z1: 0.34, elevation: -18 },

        // The slope down into it, along its whole landward edge.
        //
        // Without this the lookout was a TRAP. `canMove` deliberately always
        // allows a step down — you can hop off any ledge — but only allows a
        // rise of `maxStep`, and climbing back out of an 18px hollow needs 18.
        // So walking to the viewpoint stranded you at the end of the roof with
        // no way back and nothing on screen explaining why. A drop you can take
        // has to be a drop you can undo, and a slope says that by being one.
        { id: 'lookout_ramp', x0: 5250, x1: 6050, z0: 0.34, z1: 0.44,
          ramp: { axis: 'z', from: -18, to: 0 } }
    ],

    /**
     * THE ROUTE — where you are allowed to walk, and the shape of it.
     *
     * Walkability used to be "the whole deck minus the solid props", which is
     * invisible: nothing on screen said where the floor ended, so you wandered
     * into the back wall and off the front lip and the roof read as a field of
     * scenery you were loose in. This declares the route instead, movement is
     * clamped to it, and `World` draws the worn path FROM THIS DATA — so the
     * path you can see and the path you can walk are one thing, not two things
     * that have to be kept in agreement.
     *
     * Two lanes, because this roof has two levels: the deck you arrive on, and
     * the raised service level along the back where the structures stand. They
     * are joined by the two flights of steps, and the gap between them is left
     * to `Terrain` — a 46px face is a wall because it is 46px, not because the
     * route says so.
     *
     * The shaping is the point. Each lane's edges are interpolated with a
     * smoothstep between control points, so the route swells at the six zone
     * landmarks and pinches on the stretches between them. That is what makes a
     * wide open deck still read as having somewhere to go: you can see the roof
     * open out ahead of you at the next thing worth stopping at.
     */
    walkway: {
        /** Worn concrete. Warmer and lighter than the deck it is scuffed into. */
        tone: [214, 198, 176],

        lanes: [
            {
                // The deck. Runs the whole roof, front to back of the lower level.
                id: 'deck',
                edge: [
                    { x: 120,  near: 0.16, far: 0.44 },   // the roof begins, narrow
                    { x: 330,  near: 0.12, far: 0.52 },
                    { x: 520,  near: 0.10, far: 0.58 },   // ARRIVAL — stair hut
                    { x: 700,  near: 0.12, far: 0.58 },
                    { x: 880,  near: 0.20, far: 0.48 },   // pinch
                    { x: 1100, near: 0.14, far: 0.56 },
                    { x: 1290, near: 0.12, far: 0.63 },   // meets the west steps
                    { x: 1420, near: 0.12, far: 0.63 },
                    { x: 1490, near: 0.10, far: 0.60 },   // WORKSHOP — the bench
                    { x: 1620, near: 0.10, far: 0.58 },
                    { x: 1900, near: 0.22, far: 0.46 },   // pinch
                    { x: 2150, near: 0.14, far: 0.56 },
                    { x: 2380, near: 0.10, far: 0.60 },   // GARDEN — greenhouse
                    { x: 2650, near: 0.12, far: 0.58 },
                    { x: 2900, near: 0.18, far: 0.50 },   // pinch
                    { x: 3080, near: 0.10, far: 0.60 },   // STUDY — the terminal
                    { x: 3320, near: 0.10, far: 0.60 },   //         utility shed
                    { x: 3500, near: 0.10, far: 0.58 },
                    { x: 3560, near: 0.12, far: 0.63 },   // meets the east steps
                    { x: 3690, near: 0.12, far: 0.63 },
                    { x: 3800, near: 0.20, far: 0.50 },   // pinch
                    { x: 4010, near: 0.10, far: 0.58 },   // POST — the mailbox
                    { x: 4300, near: 0.14, far: 0.54 },
                    { x: 4600, near: 0.18, far: 0.50 },   // pinch
                    { x: 4820, near: 0.10, far: 0.60 },   // LOOKOUT — the mast
                    { x: 5250, near: 0.04, far: 0.56 },   // out onto the viewpoint
                    { x: 5400, near: 0.03, far: 0.52 },   //   telescope
                    { x: 5720, near: 0.03, far: 0.50 },   //   the clipboard
                    { x: 6050, near: 0.06, far: 0.46 },
                    { x: 6150, near: 0.14, far: 0.40 }    // the roof ends
                ]
            },
            {
                // The service level. Only exists where the platform does, and
                // narrows to a landing at each flight of steps so the way up
                // reads as a way up rather than as the level simply starting.
                //
                // No band may be narrower than the character is deep
                // (collision.depthRadius * 2 = 0.08) or the resolver cannot fit
                // them onto it and the landing becomes a step to nowhere. These
                // two ends were 0.07 and did exactly that.
                id: 'service',
                edge: [
                    { x: 1240, near: 0.63, far: 0.78 },   // top of the west steps
                    { x: 1360, near: 0.63, far: 0.86 },
                    { x: 1700, near: 0.63, far: 0.90 },
                    { x: 2200, near: 0.63, far: 0.94 },   // on toward the catwalk
                    { x: 2900, near: 0.63, far: 0.94 },
                    { x: 3400, near: 0.63, far: 0.90 },
                    { x: 3625, near: 0.63, far: 0.86 },   // top of the east steps
                    { x: 3880, near: 0.63, far: 0.90 },
                    { x: 4300, near: 0.63, far: 0.90 },
                    { x: 4700, near: 0.63, far: 0.86 },
                    { x: 4880, near: 0.63, far: 0.78 }    // the platform ends
                ]
            }
        ]
    },

    /**
     * The character's own footprint, used against solid props. Kept small so
     * they can slip between things rather than feeling like a barge.
     */
    collision: { radius: 15, depthRadius: 0.04 },

    /** Largest height change the character can walk up without a ramp. */
    maxStep: 14,

    /** Colour of the atmospheric haze — the night sky's own blue. */
    hazeColor: [58, 62, 128],

    /** Plane the character is drawn in front of. */
    actorPlane: 'deck',

    /**
     * Where the roof meets the sky, as a fraction of viewport height.
     *
     * Props on the 'far' plane stand on distant rooftops, so their baseline has
     * to be this line. Positioning them by eye leaves them hanging in the sky or
     * sunk into the deck — and because the far plane scrolls at a different rate
     * to the deck, any mismatch slides as the camera moves, which is what makes
     * a prop read as floating rather than merely misplaced.
     *
     * Must match `1 - backdrops.deck.heightFrac`; there is a test for it.
     */
    horizonY: 0.66,

    /**
     * Prop slots. Every entry is a request for one asset.
     *
     * width/height are in reference pixels; supply one and the other is derived
     * from the image's aspect. `y` is the baseline as a fraction of viewport
     * height — props on the deck share the groundLine so they sit on the floor.
     * `door` turns the slot into an enterable destination.
     */
    /**
     * Prop slots, composed as six zones along the roof.
     *
     * Each zone has one landmark tall enough to be seen from the zone before it,
     * a cluster of props that explain what the space is for, and empty roof
     * between it and the next. Even scatter was the previous approach and it
     * made every stretch look the same: density without composition reads as a
     * prop dump, not a place someone uses.
     *
     * Depth is used deliberately — structures against the back wall, working
     * clutter mid-floor, seating at the front lip where the view is.
     *
     * `solid` gives a prop a footprint on the floor so it can be walked into.
     * Values are the width in world px and depth in z units; things you should
     * be able to step over or through (puddles, weeds, wall lamps) have none.
     */
    props: [
        // ═══ ARRIVAL (200-900) ═══════════════════════════════════════════
        // Where you come up. Deliberately sparse: the first thing you see is
        // the way back down, then open roof pulling you right.
        {
            id: 'stair_hut', z: 0.90, plane: 'deck', x: 520, y: 0.80, height: 300,
            src: './assets/city/pixel/stair_hut.webp',
            // The first door in the world, at the spawn point, with a lit
            // doorway. Whatever this one does is what the player learns doors
            // do — so it had better go inside.
            door: { action: 'scene:stairwell', label: 'Down the stairs', width: 130 },
            light: { radius: 95, color: [255, 190, 120], oy: 210, intensity: 0.9 },
            solid: { w: 210, d: 0.16 }
        },
        { id: 'arr_crate',  z: 0.74, plane: 'deck', x: 700, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.webp', solid: { w: 62, d: 0.09 } },
        { id: 'arr_box',    z: 0.62, plane: 'deck', x: 760, y: 0.80, height: 56,
          src: './assets/city/pixel/boxes.webp', solid: { w: 58, d: 0.08 } },
        { id: 'arr_planter', z: 0.30, plane: 'deck', x: 330, y: 0.80, height: 83,
          src: './assets/city/pixel/planter.webp', solid: { w: 44, d: 0.07 } },
        { id: 'arr_duct',   z: 0.84, plane: 'deck', x: 880, y: 0.80, height: 64,
          src: './assets/city/pixel/duct.webp', solid: { w: 96, d: 0.08 } },

        // ═══ WORKSHOP (900-1900) ═════════════════════════════════════════
        // Someone builds here. The bench faces out from the shack, tools and
        // crates piled where they were last put down.
        {
            id: 'corrugated_shack', z: 0.90, plane: 'deck', x: 1320, y: 0.80, height: 265,
            src: './assets/city/pixel/corrugated_shack.webp',
            motion: { reach: 300, min: 0.14 },
            // Goes somewhere rather than opening something: this door is the
            // way into the workshop interior. `scene:` is the enter-a-place verb.
            door: { action: 'scene:workshop', label: 'The workshop', width: 150 },
            light: { radius: 70, color: [255, 180, 110], oy: 165, intensity: 0.7 },
            solid: { w: 230, d: 0.16 }
        },
        { id: 'work_ac',    z: 0.80, plane: 'deck', x: 1110, y: 0.80, height: 73,
          src: './assets/city/pixel/ac_unit.webp', solid: { w: 80, d: 0.09 } },
        {
            id: 'prototype', z: 0.52, plane: 'deck', x: 1490, y: 0.80, height: 95,
            src: './assets/city/pixel/prototype_board.webp',
            interact: { action: 'project:rooftop-world', label: 'This rooftop', width: 110 },
            light: { radius: 45, color: [255, 140, 120], oy: 35, intensity: 0.7 },
            anim: { type: 'flicker' }, solid: { w: 70, d: 0.08 }
        },
        {
            id: 'laptop', z: 0.40, plane: 'deck', x: 1620, y: 0.80, height: 80,
            src: './assets/city/pixel/laptop.webp',
            interact: { action: 'project:isometric-room', label: 'The isometric room', width: 110 },
            light: { radius: 55, color: [150, 210, 255], oy: 30, intensity: 0.8 },
            solid: { w: 52, d: 0.07 }
        },
        { id: 'work_crate_a', z: 0.66, plane: 'deck', x: 1560, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.webp', solid: { w: 62, d: 0.09 } },
        { id: 'work_crate_b', z: 0.60, plane: 'deck', x: 1180, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.webp', solid: { w: 62, d: 0.09 } },
        { id: 'work_chair', z: 0.34, plane: 'deck', x: 1400, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.webp', solid: { w: 44, d: 0.07 } },
        { id: 'work_vents', z: 0.88, plane: 'deck', x: 1720, y: 0.80, height: 93,
          src: './assets/city/pixel/vent_pipes.webp', solid: { w: 62, d: 0.08 },
          // Vents vent. The cheapest motion on the roof that is also true, and
          // the thing that stops a still frame reading as an empty one.
          steam: { rate: 1.0, rise: 58, size: 10, oy: 84, ttl: 3.6 } },
        // The bulb strings used to hang in open air with nothing to string them
        // between. These are what they hang from. Placed off the measured span
        // of the art (82x58, so ~94 world px at height 94) rather than by eye,
        // and a shade taller than the string so it sags between them.
        { id: 'pole_work_w', z: 0.86, plane: 'deck', x: 1198, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.webp', solid: { w: 16, d: 0.04 } },
        { id: 'pole_work_e', z: 0.86, plane: 'deck', x: 1302, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.webp', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_work', z: 0.86, plane: 'deck', x: 1250, y: 0.535, height: 94,
          src: './assets/city/pixel/bulb_string.webp', shadow: false,
          anim: { type: 'sway', speed: 0.55, amount: 5 },
          light: { radius: 110, color: [255, 196, 128], oy: 60, intensity: 0.75 } },

        // ═══ GARDEN (1900-2900) ══════════════════════════════════════════
        // The greenhouse glows; everything around it has been left to grow.
        //
        // It used to open the BLOG, which the newsstand four hundred pixels
        // east also did — two objects, one panel, and nothing about a
        // greenhouse that suggests writing. An object whose function has
        // nothing to do with what it is teaches a visitor that the world is
        // arbitrary, and after that they stop reading it.
        {
            id: 'greenhouse', z: 0.90, plane: 'deck', x: 2380, y: 0.80, height: 275,
            src: './assets/city/pixel/greenhouse.webp',
            door: { action: 'garden', label: 'The greenhouse', width: 160 },
            // Bright, but not on the floor. The greenhouse is the warm thing on
            // this roof and should read as it from a distance — but its floor
            // pool at full strength washed the deck pale for four hundred pixels
            // either side, and took the character's silhouette with it.
            light: {
                radius: 130, color: [190, 235, 175], oy: 150,
                intensity: 0.85, poolIntensity: 0.42
            },
            // A very slow breath — a fifth of the rate anything else flickers
            // at, and a twentieth of the depth. Not a fault in the wiring: a
            // grow lamp on a thermostat, which is the only kind of movement a
            // greenhouse should have.
            anim: { type: 'flicker', speed: 0.2, amount: 0.05 },
            solid: { w: 250, d: 0.16 }
        },
        { id: 'gar_planter_a', z: 0.58, plane: 'deck', x: 2140, y: 0.80, height: 88,
          src: './assets/city/pixel/planter.webp', solid: { w: 46, d: 0.07 } },
        { id: 'gar_planter_b', z: 0.50, plane: 'deck', x: 2220, y: 0.80, height: 78,
          src: './assets/city/pixel/planter.webp', solid: { w: 44, d: 0.07 } },
        { id: 'gar_planter_c', z: 0.44, plane: 'deck', x: 2600, y: 0.80, height: 92,
          src: './assets/city/pixel/planter.webp', solid: { w: 48, d: 0.07 } },
        { id: 'gar_planter_d', z: 0.36, plane: 'deck', x: 2690, y: 0.80, height: 74,
          src: './assets/city/pixel/planter.webp', solid: { w: 42, d: 0.07 } },
        { id: 'gar_chair', z: 0.28, plane: 'deck', x: 2450, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.webp', solid: { w: 44, d: 0.07 } },
        { id: 'gar_duct', z: 0.84, plane: 'deck', x: 1980, y: 0.80, height: 64,
          src: './assets/city/pixel/duct.webp', solid: { w: 96, d: 0.08 },
          steam: { rate: 0.55, rise: 40, size: 7, oy: 56, ttl: 2.8, alpha: 0.14 } },
        { id: 'pole_gar_w', z: 0.86, plane: 'deck', x: 2328, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.webp', solid: { w: 16, d: 0.04 } },
        { id: 'pole_gar_e', z: 0.86, plane: 'deck', x: 2432, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.webp', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_garden', z: 0.86, plane: 'deck', x: 2380, y: 0.535, height: 94,
          src: './assets/city/pixel/bulb_string.webp', shadow: false,
          anim: { type: 'sway', speed: 0.5, amount: 5 },
          light: { radius: 110, color: [255, 196, 128], oy: 60, intensity: 0.75 } },

        // ═══ STUDY (2900-3800) ═══════════════════════════════════════════
        // A reading corner: papers, a terminal still on, somewhere to sit.
        {
            id: 'utility_shed', z: 0.90, plane: 'deck', x: 3320, y: 0.80, height: 250,
            src: './assets/city/pixel/utility_shed.webp',
            // On a sensor. Dark from a distance, warms up as you approach —
            // which is the one reaction that gives you a reason to walk over.
            motion: { reach: 320, min: 0.10 },
            // No longer opens anything. It offered the RESUME, which the
            // clipboard at the viewpoint also offers — the same panel twice,
            // under the same label, on two objects, one of which is a shed.
            //
            // The light stays. A security light is not a promise: the prompt is
            // what offers, and there is no prompt here now. What the shed does
            // is close the reading corner in, which is worth more than a second
            // door to somewhere you have already been.
            light: { radius: 80, color: [255, 205, 140], oy: 150, intensity: 0.8 },
            anim: { type: 'flicker' }, solid: { w: 215, d: 0.16 }
        },
        {
            id: 'crt_terminal', z: 0.56, plane: 'deck', x: 3080, y: 0.80, height: 150,
            src: './assets/city/pixel/crt_terminal.webp',
            interact: { action: 'terminal', label: 'Terminal', width: 130 },
            light: { radius: 70, color: [140, 255, 190], oy: 55, intensity: 0.85 },
            anim: { type: 'flicker' }, solid: { w: 88, d: 0.10 }
        },
        {
            id: 'poster', z: 0.86, plane: 'deck', x: 2960, y: 0.80, height: 140,
            src: './assets/city/pixel/poster.webp',
            interact: { action: 'project:sprite-pipeline', label: 'How the art was made', width: 110 },
            solid: { w: 70, d: 0.06 }
        },
        {
            id: 'newsstand', z: 0.44, plane: 'deck', x: 3500, y: 0.80, height: 110,
            src: './assets/city/pixel/newsstand.webp',
            interact: { action: 'blogstack', label: 'Read posts', width: 130 },
            solid: { w: 96, d: 0.09 }
        },
        { id: 'study_chair', z: 0.30, plane: 'deck', x: 3220, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.webp', solid: { w: 44, d: 0.07 } },
        { id: 'study_boxes', z: 0.64, plane: 'deck', x: 3620, y: 0.80, height: 56,
          src: './assets/city/pixel/boxes.webp', solid: { w: 58, d: 0.08 } },

        // ═══ POST (3800-4600) ════════════════════════════════════════════
        // The domestic corner: post, pigeons, someone's washing.
        {
            id: 'mailbox', z: 0.52, plane: 'deck', x: 4010, y: 0.80, height: 120,
            src: './assets/city/pixel/mailbox.webp',
            interact: { action: 'guestbook', label: 'Leave a note', width: 120 },
            light: { radius: 40, color: [255, 210, 150], oy: 40, intensity: 0.5 },
            solid: { w: 34, d: 0.06 }
        },
        {
            // THE POST LANDMARK. This zone measured 11.3 props per 1000px with a
            // tallest of 145 against 250-320 everywhere else — the one stretch
            // with nothing to pull you toward it.
            //
            // A loft rather than another water tank: it explains the pigeons
            // that already live here and the mail the zone is about, so the
            // thing that fixes the composition is also the thing that explains
            // the space. A tall object with no reason to be there would have
            // fixed the measurement and lost the zone.
            id: 'pigeon_loft', z: 0.90, plane: 'deck', x: 4180, y: 0.80, height: 288,
            src: './assets/city/pixel/pigeon_loft.webp',
            light: { radius: 62, color: [255, 186, 120], oy: 190, intensity: 0.55 },
            solid: { w: 150, d: 0.14 }
        },
        {
            id: 'pigeon_coop', z: 0.84, plane: 'deck', x: 4260, y: 0.80, height: 130,
            src: './assets/city/pixel/pigeon_coop.webp',
            interact: { action: 'pigeons', label: 'Pigeons', width: 130 },
            // Walking near it puts the flock up. Declared here rather than the
            // loop looking for a prop called `pigeon_coop` by name — rename the
            // prop and the birds used to stop working, silently.
            startles: { range: 90, cooldown: 6 },
            solid: { w: 110, d: 0.11 }
        },
        {
            id: 'vending', z: 0.86, plane: 'deck', x: 3880, y: 0.80, height: 145,
            src: './assets/city/pixel/vending_machine.webp',
            interact: { action: 'vending', label: 'Vending machine', width: 120 },
            light: { radius: 75, color: [150, 220, 255], oy: 80, intensity: 0.85 },
            anim: { type: 'flicker' }, solid: { w: 76, d: 0.09 }
        },
        { id: 'post_crate', z: 0.40, plane: 'deck', x: 4400, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.webp', solid: { w: 62, d: 0.09 } },
        { id: 'post_ac',    z: 0.78, plane: 'deck', x: 4480, y: 0.80, height: 73,
          src: './assets/city/pixel/ac_unit.webp', solid: { w: 80, d: 0.09 } },
        { id: 'post_planter', z: 0.26, plane: 'deck', x: 4130, y: 0.80, height: 80,
          src: './assets/city/pixel/planter.webp', solid: { w: 44, d: 0.07 } },

        // ═══ LOOKOUT (4600-6200) ═════════════════════════════════════════
        // The payoff. Kept deliberately open: nothing tall, nothing between you
        // and the sky, so stopping here feels like arriving somewhere.
        {
            id: 'radio_mast', z: 0.92, plane: 'deck', x: 4820, y: 0.80, height: 320,
            src: './assets/city/pixel/radio_mast.webp',
            // It offered CONTACT, which the mailbox at 4010 also offered. A
            // mailbox is where you leave a note; a mast is a thing that stands
            // against the sky with a red light on it, and it does that better
            // than it ever opened a form.

            light: { radius: 34, color: [255, 70, 70], oy: -6, intensity: 1, pool: false },
            anim: { type: 'pulse', speed: 0.42, amount: 0.16 },
            solid: { w: 130, d: 0.12 }
        },
        {
            id: 'telescope', z: 0.20, plane: 'deck', x: 5400, y: 0.80, height: 128,
            src: './assets/city/pixel/telescope.webp',
            interact: { action: 'stargaze', label: 'Look up', width: 260 },
            anim: { type: 'bob', speed: 0.5, amount: 1.5 },
            solid: { w: 48, d: 0.07 }
        },
        { id: 'bench', z: 0.30, plane: 'deck', x: 5620, y: 0.80, height: 95,
          src: './assets/city/pixel/bench.webp', solid: { w: 120, d: 0.08 } },
        { id: 'clipboard', z: 0.26, plane: 'deck', x: 5720, y: 0.80, height: 70,
          src: './assets/city/pixel/clipboard.webp',
          interact: { action: 'resume', label: 'Resume', width: 110 },
          solid: { w: 34, d: 0.05 } },
        { id: 'railing', z: 0.05, plane: 'deck', x: 5300, y: 0.80, height: 100,
          src: './assets/city/pixel/railing.webp', shadow: false },
        { id: 'railing_b', z: 0.05, plane: 'deck', x: 5560, y: 0.80, height: 100,
          src: './assets/city/pixel/railing.webp', shadow: false },
        // ── The lookout, furnished ───────────────────────────────────
        //
        // This zone is 1600px — a quarter of the whole world — and measured the
        // SPARSEST on the roof at 8.1 props per 1000px against the workshop's
        // 16. You walked the last quarter of the roof through the thinnest part
        // of it, which is the wrong way round: this is the destination.
        //
        // Furnished as somewhere someone actually sits. The workshop is where
        // the work happens; this is where you stop. Seating, a low table, a
        // lantern, a cooler — deliberately warmer and softer than anything at
        // the other end of the roof, so the two ends are about different things.
        { id: 'look_duct', z: 0.82, plane: 'deck', x: 4680, y: 0.80, height: 62,
          src: './assets/city/pixel/duct.webp', solid: { w: 96, d: 0.08 } },
        { id: 'look_crate', z: 0.55, plane: 'deck', x: 4730, y: 0.80, height: 76,
          src: './assets/city/pixel/crates.webp', solid: { w: 58, d: 0.09 } },
        { id: 'look_spool', z: 0.45, plane: 'deck', x: 4910, y: 0.80, height: 74,
          src: './assets/city/pixel/cable_spool.webp', solid: { w: 66, d: 0.09 } },
        { id: 'look_boxes', z: 0.72, plane: 'deck', x: 4975, y: 0.80, height: 54,
          src: './assets/city/pixel/boxes.webp', solid: { w: 56, d: 0.08 } },
        { id: 'look_barrel', z: 0.62, plane: 'deck', x: 5185, y: 0.80, height: 86,
          src: './assets/city/pixel/barrel.webp', solid: { w: 46, d: 0.07 } },
        { id: 'look_lantern', z: 0.40, plane: 'deck', x: 5250, y: 0.80, height: 58,
          src: './assets/city/pixel/lantern.webp',
          light: { radius: 92, color: [255, 176, 104], oy: 44, intensity: 0.8 },
          anim: { type: 'flicker' }, solid: { w: 24, d: 0.05 } },
        { id: 'look_table', z: 0.44, plane: 'deck', x: 5468, y: 0.80, height: 60,
          src: './assets/city/pixel/side_table.webp', solid: { w: 54, d: 0.07 } },
        { id: 'look_chair_a', z: 0.33, plane: 'deck', x: 5522, y: 0.80, height: 90,
          src: './assets/city/pixel/deck_chair.webp', solid: { w: 58, d: 0.08 } },
        { id: 'look_cooler', z: 0.48, plane: 'deck', x: 5678, y: 0.80, height: 50,
          src: './assets/city/pixel/cooler.webp', solid: { w: 52, d: 0.07 } },
        { id: 'look_chair_b', z: 0.24, plane: 'deck', x: 5812, y: 0.80, height: 88,
          src: './assets/city/pixel/deck_chair.webp', flip: true, solid: { w: 58, d: 0.08 } },
        { id: 'look_planter', z: 0.58, plane: 'deck', x: 5866, y: 0.80, height: 78,
          src: './assets/city/pixel/planter.webp', solid: { w: 44, d: 0.07 } },
        { id: 'look_vents_c', z: 0.74, plane: 'deck', x: 5962, y: 0.80, height: 84,
          src: './assets/city/pixel/vent_pipes.webp', solid: { w: 62, d: 0.08 },
          steam: { rate: 0.5, rise: 46, size: 8, oy: 76, ttl: 3.0, alpha: 0.15 } },
        // z 0.58, NOT 0.42, and this is load-bearing.
        //
        // The lookout platform ends at x 6050 with an 18px lip, and 18 > maxStep,
        // so the front of the roof east of there is only reachable by coming
        // back up the ramp at z > 0.44. At z 0.42 this crate stood exactly in
        // that corridor and sealed the last 100px of the world. The reachability
        // flood caught it; walking there would have been the only other way.
        { id: 'look_crate_b', z: 0.58, plane: 'deck', x: 6046, y: 0.80, height: 70,
          src: './assets/city/pixel/crates.webp', flip: true, solid: { w: 58, d: 0.09 } },
        { id: 'look_duct_b', z: 0.86, plane: 'deck', x: 6104, y: 0.80, height: 58,
          src: './assets/city/pixel/duct.webp', solid: { w: 96, d: 0.08 } },

        // Lights over the seating, hung between their own poles like the others.
        { id: 'pole_look_w', z: 0.68, plane: 'deck', x: 5498, y: 0.80, height: 128,
          src: './assets/city/pixel/utility_pole.webp', solid: { w: 16, d: 0.04 } },
        { id: 'pole_look_e', z: 0.68, plane: 'deck', x: 5602, y: 0.80, height: 128,
          src: './assets/city/pixel/utility_pole.webp', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_look', z: 0.68, plane: 'deck', x: 5550, y: 0.80, height: 92,
          src: './assets/city/pixel/bulb_string.webp', shadow: false,
          anim: { type: 'sway', speed: 0.6, amount: 5 },
          light: { radius: 108, color: [255, 196, 128], oy: 58, intensity: 0.7 } },

        // ── The line of light ─────────────────────────────────────
        //
        // Strung between the poles that were already there, across the two
        // longest unlit runs on the roof. It does three things at once, which
        // is why it is a better answer than adding more props: it fills the
        // dark stretch between the pigeon post and the viewpoint, it gives the
        // eye something to follow east rather than stopping at a gap, and it
        // puts warm light on the character as they walk under it — the rim
        // light has something to work with along the whole route now instead
        // of only outside the greenhouse.
        //
        // Dimmer than the three that came before it and with almost no floor
        // pool: a run of bulbs down the middle of a roof should read as a line
        // you follow, not as another place to stop.
        { id: 'bulb_run_e', z: 0.62, plane: 'deck', x: 4560, y: 0.80, height: 86,
          src: './assets/city/pixel/bulb_string.webp', shadow: false,
          anim: { type: 'sway', speed: 0.52, amount: 4 },
          light: { radius: 96, color: [255, 190, 126], oy: 54,
                   intensity: 0.55, poolIntensity: 0.45 } },
        { id: 'bulb_run_m', z: 0.60, plane: 'deck', x: 3700, y: 0.80, height: 84,
          src: './assets/city/pixel/bulb_string.webp', shadow: false, flip: true,
          anim: { type: 'sway', speed: 0.58, amount: 4 },
          light: { radius: 92, color: [255, 190, 126], oy: 52,
                   intensity: 0.5, poolIntensity: 0.45 } },
        { id: 'bulb_run_w', z: 0.64, plane: 'deck', x: 2860, y: 0.80, height: 84,
          src: './assets/city/pixel/bulb_string.webp', shadow: false,
          anim: { type: 'sway', speed: 0.55, amount: 4 },
          light: { radius: 92, color: [255, 190, 126], oy: 52,
                   intensity: 0.5, poolIntensity: 0.45 } },

        { id: 'look_vents', z: 0.88, plane: 'deck', x: 5100, y: 0.80, height: 93,
          src: './assets/city/pixel/vent_pipes.webp', solid: { w: 62, d: 0.08 },
          steam: { rate: 0.8, rise: 54, size: 9, oy: 84, ttl: 3.4 } },

        // ═══ SKY ═════════════════════════════════════════════════════════
        //
        // The upper half of the frame used to be empty: measured at 48% of the
        // viewport with nothing in it, and over half the roof had nothing at all
        // above mid-screen. The `sky` and `skyline` planes existed and carried
        // ZERO props while the deck carried sixty-four. The roof was never
        // under-furnished; the sky was.
        //
        // MIND THE PARALLAX when placing anything here. A prop's x is a world
        // coordinate but it is drawn at `x - parallax * scroll`, so a slow plane
        // only ever sweeps `parallax * maxScroll` pixels past the window. The
        // usable band is roughly x ∈ [0, viewportWidth + parallax * maxScroll]:
        // about 1600 on `sky`, 2550 on `skyline`, 4000 on `far`. Three far props
        // were authored at deck-like coordinates (4550-5450) and could not be
        // seen at any window size or scroll position. There is a test now.
        { id: 'moon', plane: 'sky', x: 380, y: 0.155, height: 92,
          src: './assets/city/pixel/moon.webp',
          // Glow kept low BECAUSE the disc itself is bright. stylecheck reports
          // the moon at lum 197 against a master of 29 and calls it washed out —
          // which is the right verdict for a lit prop and the wrong one for a
          // light source. Every colour in it is on the 64 palette (the bright
          // accents exist for exactly this), so the art stays; the additive glow
          // comes down instead, or the two together clip the maria to paper.
          light: { radius: 210, color: [176, 198, 255], oy: 0, intensity: 0.26, pool: false },
          shadow: false },

        // Thin and high. Clouds at night are what you notice the city glow on.
        { id: 'cloud_a', plane: 'sky', x: 120,  y: 0.225, height: 54,
          src: './assets/city/pixel/cloud_a.webp', shadow: false },
        { id: 'cloud_b', plane: 'sky', x: 760,  y: 0.145, height: 44,
          src: './assets/city/pixel/cloud_b.webp', shadow: false },
        { id: 'cloud_c', plane: 'sky', x: 1180, y: 0.305, height: 62,
          src: './assets/city/pixel/cloud_a.webp', flip: true, shadow: false },
        { id: 'cloud_d', plane: 'sky', x: 520,  y: 0.375, height: 40,
          src: './assets/city/pixel/cloud_b.webp', flip: true, shadow: false },

        // ═══ SKYLINE ═════════════════════════════════════════════════════
        // Masses that break the flat band of the backdrop. They stand on the
        // horizon like the far props do, and reach far higher than anything
        // else in the world — that height is the entire point of them.
        { id: 'sky_tower_a', plane: 'skyline', x: 300,  y: 0.66, height: 520,
          src: './assets/city/pixel/sky_tower_a.webp', shadow: false },
        { id: 'sky_tower_b', plane: 'skyline', x: 980,  y: 0.66, height: 385,
          src: './assets/city/pixel/sky_tower_b.webp', shadow: false },
        { id: 'sky_tower_c', plane: 'skyline', x: 1560, y: 0.66, height: 615,
          src: './assets/city/pixel/sky_tower_c.webp', shadow: false },
        { id: 'sky_tower_d', plane: 'skyline', x: 2280, y: 0.66, height: 430,
          src: './assets/city/pixel/sky_tower_b.webp', flip: true, shadow: false },
        {
            // A crane. The one diagonal in a skyline of verticals, and its
            // aircraft light is the only red in the upper frame.
            id: 'sky_crane', plane: 'skyline', x: 1880, y: 0.66, height: 470,
            src: './assets/city/pixel/sky_crane.webp',
            light: { radius: 26, color: [255, 70, 60], oy: 460, intensity: 0.9, pool: false },
            anim: { type: 'flicker' }, shadow: false
        },

        // ═══ SIGNS OF SOMEBODY ═══════════════════════════════════════════
        //
        // Objects a person left, rather than equipment a building needs. The
        // roof already had plenty of ducts and crates; what it had none of was
        // evidence that anyone comes up here on purpose — a watering can beside
        // the planters, pots waiting to be filled, a broom propped where it was
        // last used, a bike somebody carried up six flights.
        { id: 'arr_pots', z: 0.34, plane: 'deck', x: 380, y: 0.80, height: 62,
          src: './assets/city/pixel/pot_stack.webp', solid: { w: 28, d: 0.05 } },
        { id: 'arr_broom', z: 0.60, plane: 'deck', x: 700, y: 0.80, height: 118,
          src: './assets/city/pixel/broom.webp', shadow: false },
        { id: 'work_toolbox', z: 0.30, plane: 'deck', x: 1432, y: 0.80, height: 42,
          src: './assets/city/pixel/toolbox.webp', solid: { w: 40, d: 0.05 } },
        { id: 'gar_watering', z: 0.34, plane: 'deck', x: 2300, y: 0.80, height: 48,
          src: './assets/city/pixel/watering_can.webp', solid: { w: 34, d: 0.05 } },
        { id: 'gar_pots', z: 0.27, plane: 'deck', x: 2472, y: 0.80, height: 58,
          src: './assets/city/pixel/pot_stack.webp', flip: true, solid: { w: 28, d: 0.05 } },
        { id: 'study_bike', z: 0.46, plane: 'deck', x: 3040, y: 0.80, height: 96,
          src: './assets/city/pixel/roof_bicycle.webp', solid: { w: 118, d: 0.07 } },
        // Lies flat and is not solid — you step over a rolled tarp.
        { id: 'post_tarp', z: 0.44, plane: 'deck', x: 4330, y: 0.80, height: 34,
          src: './assets/city/pixel/tarp_roll.webp', shadow: false },
        { id: 'look_can', z: 0.40, plane: 'deck', x: 5904, y: 0.80, height: 44,
          src: './assets/city/pixel/watering_can.webp', flip: true, solid: { w: 34, d: 0.05 } },

        // ═══ ROOF FURNITURE ══════════════════════════════════════════════
        //
        // Height, which the deck had almost none of: the median prop was 81px
        // and 50 of 68 were under 100, so apart from the five structures the
        // whole roof was a flat line of ankle-height clutter with nothing
        // interrupting the middle of the frame.
        //
        // Set against the back wall on the service level, where a pipe stack or
        // a guyed antenna actually belongs, and kept narrow so they break the
        // skyline without walling the service walkway off.
        { id: 'arr_pipes',    z: 0.86, plane: 'deck', x: 420,  y: 0.80, height: 185,
          src: './assets/city/pixel/pipe_stack.webp', solid: { w: 40, d: 0.07 } },
        { id: 'work_antenna', z: 0.90, plane: 'deck', x: 1050, y: 0.80, height: 228,
          src: './assets/city/pixel/antenna_guyed.webp', shadow: false },
        { id: 'gar_pipes',    z: 0.88, plane: 'deck', x: 2210, y: 0.80, height: 196,
          src: './assets/city/pixel/pipe_stack.webp', solid: { w: 40, d: 0.07 },
          steam: { rate: 0.45, rise: 62, size: 8, oy: 176, ttl: 3.6, alpha: 0.15 } },
        { id: 'study_antenna', z: 0.90, plane: 'deck', x: 3180, y: 0.80, height: 236,
          src: './assets/city/pixel/antenna_guyed.webp', flip: true, shadow: false },
        { id: 'post_pipes',   z: 0.86, plane: 'deck', x: 4520, y: 0.80, height: 176,
          src: './assets/city/pixel/pipe_stack.webp', flip: true, solid: { w: 40, d: 0.07 } },

        // Hatches lie flat in the walkway and are deliberately NOT solid — you
        // step over a roof hatch, and a knee-high box you cannot walk round in
        // the middle of the route would be the worst kind of obstacle.
        { id: 'arr_hatch',   z: 0.42, plane: 'deck', x: 640,  y: 0.80, height: 44,
          src: './assets/city/pixel/roof_hatch.webp', shadow: false },
        { id: 'study_hatch', z: 0.36, plane: 'deck', x: 3420, y: 0.80, height: 44,
          src: './assets/city/pixel/roof_hatch.webp', flip: true, shadow: false },

        // ═══ THE CITY, IN THREE BANDS ════════════════════════════════════
        //
        // Every one of these sits inside the x range its parallax can actually
        // sweep past the window: skyline_far reaches about 2090, skyline 2570,
        // skyline_near 3200. Anything beyond that is authored and never seen.

        // -- Furthest band: the biggest shapes, most hazed --
        { id: 'tower_zigg',   plane: 'skyline_far', x: 180,  y: 0.66, height: 655,
          src: './assets/city/pixel/tower_zigg.webp', shadow: false },
        { id: 'tower_taper',  plane: 'skyline_far', x: 620,  y: 0.66, height: 700,
          src: './assets/city/pixel/tower_taper.webp', shadow: false },
        { id: 'roofline_a',   plane: 'skyline_far', x: 1010, y: 0.66, height: 300,
          src: './assets/city/pixel/roofline_low.webp', shadow: false },
        { id: 'tower_twin',   plane: 'skyline_far', x: 1355, y: 0.66, height: 620,
          src: './assets/city/pixel/tower_twin.webp', shadow: false },
        { id: 'stack_far',    plane: 'skyline_far', x: 1740, y: 0.66, height: 585,
          src: './assets/city/pixel/stack_tall.webp', shadow: false },
        { id: 'tower_wide_a', plane: 'skyline_far', x: 1985, y: 0.66, height: 385,
          src: './assets/city/pixel/tower_wide.webp', shadow: false },

        // -- Middle band, alongside the towers already here --
        { id: 'tower_slab',   plane: 'skyline', x: 700,  y: 0.66, height: 480,
          src: './assets/city/pixel/tower_slab.webp', shadow: false },
        {
            // Palette-cycled, like the roof's own neon. The one moving colour
            // in the middle distance.
            id: 'sky_neon', plane: 'skyline', x: 1160, y: 0.66, height: 205,
            src: './assets/city/pixel/sky_neon.webp',
            light: { radius: 96, color: [255, 96, 190], oy: 150, intensity: 0.55, pool: false },
            anim: {
                type: 'cycle', speed: 0.4, amount: 0.38,
                ramp: [[255, 96, 190], [206, 88, 232], [120, 140, 240], [232, 120, 150]]
            },
            shadow: false
        },
        { id: 'tower_mast',   plane: 'skyline', x: 1900, y: 0.66, height: 520,
          src: './assets/city/pixel/tower_mast.webp',
          light: { radius: 20, color: [255, 74, 60], oy: 505, intensity: 0.85, pool: false },
          anim: { type: 'pulse', speed: 0.36, amount: 0.14 }, shadow: false },
        {
            // An aircraft warning beacon. Slow, red, and the only thing in the
            // background with a rhythm you can count.
            id: 'beacon_mast', plane: 'skyline', x: 2380, y: 0.66, height: 430,
            src: './assets/city/pixel/beacon_mast.webp',
            light: { radius: 26, color: [255, 66, 54], oy: 420, intensity: 0.95, pool: false },
            anim: { type: 'pulse', speed: 0.5, amount: 0.2 }, shadow: false
        },

        // -- Nearest band: smaller, closer, less hazed --
        { id: 'roofline_b',   plane: 'skyline_near', x: 400,  y: 0.66, height: 330,
          src: './assets/city/pixel/roofline_low.webp', flip: true, shadow: false },
        { id: 'stack_near',   plane: 'skyline_near', x: 900,  y: 0.66, height: 545,
          src: './assets/city/pixel/stack_tall.webp', shadow: false },
        { id: 'tower_wide_b', plane: 'skyline_near', x: 1500, y: 0.66, height: 430,
          src: './assets/city/pixel/tower_wide.webp', flip: true, shadow: false },
        { id: 'sky_tank',     plane: 'skyline_near', x: 2110, y: 0.66, height: 192,
          src: './assets/city/pixel/sky_tank.webp', shadow: false },
        {
            // Smokes, using the same declared-emitter system the roof's own
            // vents use. Slow and thin, because it is streets away.
            id: 'sky_flue', plane: 'skyline_near', x: 2700, y: 0.66, height: 245,
            src: './assets/city/pixel/sky_flue.webp', shadow: false,
            steam: { rate: 0.34, rise: 120, size: 12, oy: 235, ttl: 7,
                     drift: 1.8, tone: [120, 126, 152], alpha: 0.11 }
        },

        // ═══ FAR PLANE ═══════════════════════════════════════════════════
        // Distant rooftops on the horizon. Spaced to break the skyline rather
        // than evenly, so the eye has somewhere to rest.
        { id: 'water_tower', plane: 'far', x: 1150, y: 0.66, height: 430, src: './assets/city/pixel/water_tower.webp' },
        { id: 'antenna',     plane: 'far', x: 620,  y: 0.66, height: 240, src: './assets/city/pixel/antenna.webp' },
        {
            // Palette-cycled rather than flickered. A neon tube does not blink
            // on and off, it runs colour along its length — and the ramp is
            // taken from the world's own 64 so it cannot drift out of palette.
            id: 'neon_sign', plane: 'far', x: 1830, y: 0.66, height: 150,
            src: './assets/city/pixel/neon_sign.webp',
            // The buzz that rises as you walk towards it, over this many world
            // px. Was a hardcoded 700 in the loop, keyed off the prop's id.
            hum: { range: 700 },
            light: { radius: 120, color: [255, 90, 210], oy: 70, intensity: 0.8, pool: false },
            anim: {
                type: 'cycle', speed: 0.55, amount: 0.42,
                ramp: [[255, 90, 210], [232, 74, 168], [140, 96, 226], [96, 150, 235]]
            },
            shadow: false
        },
        { id: 'chimney_a',   plane: 'far', x: 900,  y: 0.66, height: 150, src: './assets/city/pixel/chimney.webp',
          steam: { rate: 0.5, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_b',   plane: 'far', x: 2550, y: 0.66, height: 135, src: './assets/city/pixel/chimney.webp',
          steam: { rate: 0.42, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_c',   plane: 'far', x: 4150, y: 0.66, height: 160, src: './assets/city/pixel/chimney.webp',
          steam: { rate: 0.46, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_d',   plane: 'far', x: 3350, y: 0.66, height: 140, src: './assets/city/pixel/chimney.webp' },
        { id: 'dish_a',      plane: 'far', x: 1980, y: 0.66, height: 128, src: './assets/city/pixel/satellite_dish.webp' },
        { id: 'dish_b',      plane: 'far', x: 3700, y: 0.66, height: 120, src: './assets/city/pixel/satellite_dish.webp' },
        { id: 'dish_c',      plane: 'far', x: 3700, y: 0.66, height: 124, src: './assets/city/pixel/satellite_dish.webp' },
        { id: 'tank_far',    plane: 'far', x: 3050, y: 0.66, height: 200, src: './assets/city/pixel/water_tank_small.webp' },
        { id: 'far_tower',   plane: 'far', x: 2760, y: 0.66, height: 340, src: './assets/city/pixel/far_tower.webp' },
        { id: 'far_bulkhead', plane: 'far', x: 1450, y: 0.66, height: 192,
          src: './assets/city/pixel/far_bulkhead.webp' },
        { id: 'far_ac_row',   plane: 'far', x: 2450, y: 0.66, height: 112,
          src: './assets/city/pixel/far_ac_row.webp' },
        { id: 'far_escape',   plane: 'far', x: 3250, y: 0.66, height: 262,
          src: './assets/city/pixel/far_fire_escape.webp' },

        // ── Filling the holes in the horizon ──────────────────────
        //
        // Measured as visual mass per 200px of roof, the west half averaged
        // about 1,500 and three stretches came in under 350: x2000 between the
        // workshop and the garden, x2800 between the garden and the study, and
        // most of the east half past x3400. A horizon with holes in it reads as
        // boxy — flat, then a tower, then flat — and the eye stops at the gaps
        // instead of travelling along the roof.
        //
        // All of these go on the hazed bands BEHIND the deck. The roof itself
        // does not need more things on it; the city behind it needs to continue.
        // Existing art, reused at different sizes and flipped, because a horizon
        // is repetition seen at a distance.
        { id: 'far_stack_gap',  plane: 'far', x: 2020, y: 0.66, height: 268,
          src: './assets/city/pixel/stack_tall.webp', shadow: false },
        { id: 'far_bulk_gap',   plane: 'far', x: 2880, y: 0.66, height: 176,
          src: './assets/city/pixel/far_bulkhead.webp', flip: true },
        { id: 'far_tower_e',    plane: 'far', x: 3560, y: 0.66, height: 296,
          src: './assets/city/pixel/far_tower.webp', flip: true },
        { id: 'far_vents_e',    plane: 'far', x: 3980, y: 0.66, height: 138,
          src: './assets/city/pixel/far_vent_cluster.webp' },

        // Nothing further east than this on a parallax band.
        //
        // A plane at parallax 0.55 only sweeps 0.55 of the camera's travel, so
        // its usable range ends around x4025 — a prop placed beyond that scrolls
        // off before the camera ever reaches it and is simply never seen. Three
        // were placed at 4620, 5080 and 5240 before `tests/Composition.test.js`
        // pointed out that none of them could ever appear, and one of the three
        // was also standing in the patch of sky the telescope looks at.
        //
        // The east half's horizon is the skyline backdrop, by construction. What
        // it needed was not more distance — it was the line of light below.
        { id: 'far_vents',    plane: 'far', x: 800,  y: 0.66, height: 152,
          src: './assets/city/pixel/far_vent_cluster.webp',
          steam: { rate: 0.3, rise: 70, size: 8, oy: 145, ttl: 5,
                   drift: 1.5, tone: [126, 132, 158], alpha: 0.10 } },
        { id: 'far_billboard', plane: 'far', x: 3900, y: 0.66, height: 175,
          src: './assets/city/pixel/far_billboard.webp',
          light: { radius: 90, color: [120, 200, 255], oy: 100, intensity: 0.55, pool: false },
          shadow: false },
        { id: 'laundry',     plane: 'far', x: 2200, y: 0.66, height: 185, src: './assets/city/pixel/laundry_line.webp',
          anim: { type: 'sway', speed: 0.42, amount: 3 }, shadow: false },

        // Power lines, running the length of the world. One horizontal drawn
        // across the emptiest part of the frame, which is what the eye reads as
        // a city rather than as a backdrop with a gap above it. Tiles, so the
        // art must carry its poles and meet itself seamlessly.
        { id: 'cable_run', plane: 'far', x: 0, y: 0.66, height: 250,
          src: './assets/city/pixel/cable_run.webp', repeat: true,
          anim: { type: 'sway', speed: 0.3, amount: 2 }, shadow: false },

        // ═══ TEXTURE ═══════════════════════════════════════════════════
        //
        // Not scattered — CLUSTERED, around the reasons in `WHERE`. Spread
        // evenly along the roof these read as wallpaper; pooled at the drains
        // and left to grow in the stretches nobody crosses, the same nine
        // puddles say the roof slopes and the same fourteen weeds say which
        // parts of it are walked on.
        //
        // `surface` is what the footsteps and the splash read. It replaced a
        // check for ids beginning `puddle`, which quietly missed `lip_puddle`
        // below — half the standing water on the roof was dry underfoot.
        ...cluster({ id: 'puddle', plane: 'deck', y: 0.804, height: 20,
            src: './assets/city/pixel/puddle.webp', shadow: false, surface: 'water' },
            { anchors: [...WHERE.drains, ...WHERE.neglected.slice(3)],
              count: 9, seed: 111, sizeVary: 0.3, zFrom: 0.10, zTo: 0.70 }),

        // Weeds want what puddles leave behind, so they share the drains — and
        // they only survive where feet do not go, so the neglected runs carry
        // most of them.
        //
        // `brush` is what makes them bend away as you walk through them. The
        // whole stand reacts because every instance carries it, and it costs
        // one distance check per weed per frame.
        ...cluster({ id: 'weed', plane: 'deck', y: 0.805, height: 26,
            src: './assets/city/pixel/weed.webp', shadow: false,
            anim: { type: 'sway', speed: 0.62, amount: 1.5 },
            brush: { reach: 52, amount: 7 } },
            { anchors: [
                ...WHERE.neglected,
                { x: 980, weight: 2, spread: 130 },
                { x: 3480, weight: 2, spread: 130 }
              ],
              count: 14, seed: 131, sizeVary: 0.3, zFrom: 0.05, zTo: 0.92 }),

        // ── Placed things at the lip, as opposed to scattered ones ──
        //
        // A hose by the planters, a bucket outside the workshop, drains where
        // water would actually go. Put where a reason exists rather than by the
        // seeded scatter, so the front of the roof has intent in it as well as
        // density.
        { id: 'lip_drain_w', z: 0.10, plane: 'deck', x: 980,  y: 0.80, height: 20,
          src: './assets/city/pixel/drain_grate.webp', shadow: false },
        { id: 'lip_bucket',  z: 0.14, plane: 'deck', x: 1180, y: 0.80, height: 44,
          src: './assets/city/pixel/bucket.webp' },
        { id: 'lip_crate_w', z: 0.11, plane: 'deck', x: 780,  y: 0.80, height: 40,
          src: './assets/city/pixel/milk_crate.webp' },
        { id: 'lip_hose',    z: 0.12, plane: 'deck', x: 2262, y: 0.80, height: 26,
          src: './assets/city/pixel/hose_coil.webp', shadow: false },
        { id: 'lip_drain_e', z: 0.09, plane: 'deck', x: 3480, y: 0.80, height: 20,
          src: './assets/city/pixel/drain_grate.webp', flip: true, shadow: false },
        { id: 'lip_bricks',  z: 0.13, plane: 'deck', x: 4180, y: 0.80, height: 42,
          src: './assets/city/pixel/brick_stack.webp' },
        { id: 'lip_crate_e', z: 0.10, plane: 'deck', x: 5320, y: 0.80, height: 38,
          src: './assets/city/pixel/milk_crate.webp', flip: true },
        {
            // The cat's. Somebody up here feeds it, which is a better way of
            // saying so than any panel would be.
            id: 'lip_bowls', z: 0.15, plane: 'deck', x: 5596, y: 0.80, height: 20,
            src: './assets/city/pixel/pet_bowls.webp', shadow: false
        },

        // ═══ THE FRONT LIP ═══════════════════════════════════════════════
        //
        // The depth band nearest the camera held SEVEN of the deck's hundred
        // props, and it is the largest area on screen. That is why the bottom
        // of the frame read empty however much went on the roof behind it.
        //
        // Everything here sits at z below the walkway's near edge, so it is in
        // front of the walkable world rather than in it: none of it is solid,
        // none of it can block anything, and all of it passes between you and
        // the camera as you walk. That occlusion is most of what sells depth.
        //
        // Built from images the world already has. Density down here wants
        // repetition, not sixteen more generations.
        // Weeds along the lip grow in the same places as the ones behind them:
        // the wet corners and the stretches nobody has reason to cross.
        ...cluster({ id: 'lip_weed', plane: 'deck', y: 0.805, height: 24,
            src: './assets/city/pixel/weed.webp', shadow: false,
            anim: { type: 'sway', speed: 0.68, amount: 1.7 },
            brush: { reach: 54, amount: 8 } },
            { anchors: [
                ...WHERE.neglected,
                { x: 980, weight: 2, spread: 120 },
                { x: 3480, weight: 2, spread: 120 }
              ],
              count: 18, seed: 211, sizeVary: 0.34, zFrom: 0.02, zTo: 0.17 }),

        ...cluster({ id: 'lip_puddle', plane: 'deck', y: 0.804, height: 17,
            src: './assets/city/pixel/puddle.webp', shadow: false, surface: 'water' },
            { anchors: [...WHERE.drains, ...WHERE.neglected.slice(4)],
              count: 8, seed: 223, sizeVary: 0.36, zFrom: 0.03, zTo: 0.18 }),

        // Boxes, pots and rolled tarps are things somebody carried up and set
        // down out of the way. They belong next to the hatch they came through
        // and the job they were for — not spread evenly along six thousand
        // pixels of parapet, which is what they were doing.
        ...cluster({ id: 'lip_box', plane: 'deck', y: 0.80, height: 40,
            src: './assets/city/pixel/boxes.webp' },
            { anchors: WHERE.working, count: 7, seed: 233, sizeVary: 0.28,
              zFrom: 0.04, zTo: 0.16 }),

        // Pots stack up where plants are dealt with: the greenhouse, the
        // planters, and the bench somebody potters at.
        ...cluster({ id: 'lip_pot', plane: 'deck', y: 0.80, height: 46,
            src: './assets/city/pixel/pot_stack.webp' },
            { anchors: [
                { x: 2380, weight: 4, spread: 190 },   // the greenhouse
                { x: 2140, weight: 2, spread: 130 },   // the garden planters
                { x: 4130, weight: 1, spread: 120 },   // the planter by the post
                { x: 5866, weight: 1, spread: 130 }    // the one at the viewpoint
              ],
              count: 6, seed: 241, sizeVary: 0.3, zFrom: 0.03, zTo: 0.15 }),

        // Discarded tarps rather than the workshop's offcuts: that asset lives
        // in `interior/` and is lit by a warm bulb, which would read wrong
        // against a night roof. `npm run assets` caught the wrong path.
        ...cluster({ id: 'lip_tarp', plane: 'deck', y: 0.803, height: 22,
            src: './assets/city/pixel/tarp_roll.webp', shadow: false },
            { anchors: WHERE.working, count: 8, seed: 251, sizeVary: 0.34,
              zFrom: 0.02, zTo: 0.19 }),

        // ═══ FOREGROUND ══════════════════════════════════════════════════
        { id: 'parapet', plane: 'fore', x: 0, y: 1.0, height: 112,
          src: './assets/city/pixel/parapet.webp', repeat: true },
        ...scatter({ id: 'fore_plant', plane: 'fore', y: 1.0, height: 190,
            src: './assets/city/pixel/fore_plant.webp',
            anim: { type: 'sway', speed: 0.7, amount: 3, stiffness: 0.45 } },
            { from: 300, to: 6000, count: 6, seed: 141, sizeVary: 0.25 }),
        ...scatter({ id: 'fore_pipe', plane: 'fore', y: 1.0, height: 235,
            src: './assets/city/pixel/fore_pipe.webp' },
            { from: 1500, to: 5200, count: 2, seed: 151, sizeVary: 0.2 }),

        // The foreground was three unique images — a parapet, one plant and one
        // pipe — doing all the framing across the whole world, which is why
        // every frame read flat: there was nothing for the camera to look past.
        //
        // These sit at parallax 1.4, so they sweep by faster than the roof and
        // read as being between you and it. None of them are solid; they are in
        // front of the walkable world, not in it.
        //
        // All rooted at y 1.0, because the fore plane is things standing at the
        // roof's front edge. A hanging cable was tried here and dropped: at
        // parallax 1.4 anything not rooted at the bottom sweeps across the
        // middle of the frame faster than the roof moves, which reads as an
        // object sliding rather than as depth. The cables live on `far`.
        ...scatter({ id: 'fore_vent', plane: 'fore', y: 1.0, height: 268,
            src: './assets/city/pixel/fore_vent.webp', shadow: false },
            { from: 700, to: 5600, count: 3, seed: 161, sizeVary: 0.22 }),
        ...scatter({ id: 'fore_rail', plane: 'fore', y: 1.0, height: 158,
            src: './assets/city/pixel/fore_rail.webp', shadow: false },
            { from: 400, to: 5900, count: 4, seed: 171, sizeVary: 0.15 }),

        // Three more silhouettes for the camera to look past. All rooted at
        // y 1.0, and graded to lum 7 against a master of 29 — the foreground is
        // read as shape, not as detail.
        ...scatter({ id: 'fore_aerial', plane: 'fore', y: 1.0, height: 296,
            src: './assets/city/pixel/fore_aerial.webp', shadow: false },
            { from: 600, to: 5700, count: 3, seed: 181, sizeVary: 0.2 }),
        ...scatter({ id: 'fore_chimney', plane: 'fore', y: 1.0, height: 232,
            src: './assets/city/pixel/fore_chimney.webp', shadow: false },
            { from: 900, to: 5400, count: 3, seed: 191, sizeVary: 0.18 }),
        ...scatter({ id: 'fore_drum', plane: 'fore', y: 1.0, height: 214,
            src: './assets/city/pixel/fore_drum.webp', shadow: false },
            { from: 1400, to: 5000, count: 2, seed: 201, sizeVary: 0.16 })
    ],

    /** Full-width backdrops. One image per plane, tiled where marked. */
    backdrops: [
        { plane: 'sky',     src: './assets/city/pixel/layers/sky.webp' },
        { plane: 'skyline', src: './assets/city/pixel/layers/skyline.webp', repeat: true },
        { plane: 'deck',    src: './assets/city/pixel/layers/deck.webp', repeat: true,
          anchor: 'bottom', heightFrac: 0.34 }
    ],

    actor: {
        id: 'character',
        src: './assets/city/pixel/char_sheet.webp',
        sheet: { frameCount: 12, rows: 4 },
        content: { top: 2, left: 2, right: 60, baseline: 125, frameW: 62, frameH: 127 },
        place: { x: 560, height: 190 },
        fps: 5,
        animations: {
            // Four facings from three generated cycles: left reuses the side
            // artwork mirrored at draw time. 12-frame cycles rather than 8, so
            // the in-betweens read rather than stepping.
            idle_side: { row: 0, length: 4, mode: 'pingpong' },

            walk_side: { row: 1, length: 12, fps: 16, mode: 'loop' },
            walk_up:   { row: 2, length: 12, fps: 16, mode: 'loop' },
            walk_down: { row: 3, length: 12, fps: 16, mode: 'loop' },

            // Standing poses for the depth facings, borrowed from the frame of
            // their own walk cycle with the narrowest stance. Measured by foot
            // span rather than guessed, so the character stands with their feet
            // together rather than frozen mid-stride.
            idle_up:   { row: 2, length: 1, offset: 2 },
            idle_down: { row: 3, length: 1, offset: 1 }
        }
    },

    /**
     * Procedural stars. Drawn rather than painted so they twinkle, cover the
     * whole world without tiling, and can brighten when the player looks up.
     */
    starfield: {
        count: 320,
        seed: 20260821,
        parallax: 0.02,
        band: 0.72,
        /** Baseline brightness, and what it rises to while stargazing. */
        idleIntensity: 0.55,
        gazeIntensity: 1.0
    },

    /**
     * The things that live here.
     *
     * Everything else that moves out here is weather or machinery — wind,
     * steam, a plane crossing, windows switching — and all of it is indifferent
     * to you. A place where nothing notices you reads as a diorama however much
     * of it is moving. These react.
     *
     * Moths take NO configuration: `Critters` derives them from the props that
     * already declare a `light`, so every lamp in the world has them and any
     * lamp added later gets them for free.
     *
     * The flocks are placed where a pigeon would actually be — crumbs by the
     * seating, grit by the coop, shelter in the lee of the greenhouse — rather
     * than spaced evenly along the roof.
     */
    critters: {
        mothsPerLight: 2,

        /**
         * The cat lives at the lookout end.
         *
         * That is the half of the roof furnished for sitting, so the animal
         * that sleeps on a warm vent and comes over when you stop moving
         * belongs at the end of the walk rather than at the workshop end where
         * things are being made. It is also the reward for going all the way.
         */
        cat: {
            x: 5560, z: 0.30,
            roam: [4750, 6100],
            poses: {
                sit:  './assets/city/pixel/cat_sit.webp',
                walk: './assets/city/pixel/cat_walk.webp',
                curl: './assets/city/pixel/cat_curl.webp'
            },
            // Places a cat would actually choose: the warm vent, the bench, the
            // chair by the parapet, and a crate with a view.
            perches: [
                { x: 5100, z: 0.62 },
                { x: 5620, z: 0.28 },
                { x: 5820, z: 0.22 },
                { x: 6046, z: 0.50 }
            ]
        },

        pigeons: [
            { id: 'arrival', x: 760,  z: 0.30, spread: 80 },
            { id: 'garden',  x: 2240, z: 0.26, spread: 95 },
            { id: 'coop',    x: 4300, z: 0.34, spread: 120 },
            { id: 'lookout', x: 5640, z: 0.22, spread: 100 }
        ]
    },

    /** Screen post-processing. Applied to the finished frame. */
    post: {
        // Kept gentle: the scene is already a night scene, and a heavy vignette
        // on top of accumulated haze crushes the midtones.
        vignette: 0.34,
        grain: 0.04
    },

    /** How far the camera tilts at the viewpoint, in screen px. */
    lookUpOffset: 230,

    /**
     * Sprites that cross the sky rather than standing in the world.
     *
     * Declared here rather than in the game loop because everything the world
     * is made of is declared here — and because the boot screen counts its
     * total off the manifest, so a download that is not listed makes the
     * loading bar stop short of the end.
     */
    skySprites: {
        blimp: './assets/city/pixel/blimp.webp',
        searchlight: './assets/city/pixel/searchlight.webp'
    },

    // The guestbook's repository and the resume's path used to live here. They
    // belong to the SITE, not to the roof, and reading them off whichever
    // manifest the player was standing in was what broke the terminal in the
    // workshop. They are in `js/config/site.js` now.

    walkSpeed: 300,

    /**
     * Running. The animation rate scales with the speed, so the walk cycle
     * plays faster rather than the character sliding across the roof with their
     * legs turning at walking pace.
     */
    runMultiplier: 1.85,

    /** Camera leads further when running, so you can see what you are heading into. */
    runLookAhead: 210
};
