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
        { id: 'sky',     parallax: 0.05, haze: 0.00 },
        { id: 'skyline', parallax: 0.25, haze: 0.42 },
        { id: 'far',     parallax: 0.55, haze: 0.22 },
        { id: 'deck',    parallax: 1.00, haze: 0.00 },
        { id: 'fore',    parallax: 1.40, haze: 0.00 }
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
            src: './assets/city/pixel/stair_hut.png',
            // The first door in the world, at the spawn point, with a lit
            // doorway. Whatever this one does is what the player learns doors
            // do — so it had better go inside.
            door: { action: 'scene:stairwell', label: 'Down the stairs', width: 130 },
            light: { radius: 95, color: [255, 190, 120], oy: 210, intensity: 0.9 },
            solid: { w: 210, d: 0.16 }
        },
        { id: 'arr_crate',  z: 0.74, plane: 'deck', x: 700, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.png', solid: { w: 62, d: 0.09 } },
        { id: 'arr_box',    z: 0.62, plane: 'deck', x: 760, y: 0.80, height: 56,
          src: './assets/city/pixel/boxes.png', solid: { w: 58, d: 0.08 } },
        { id: 'arr_planter', z: 0.30, plane: 'deck', x: 330, y: 0.80, height: 83,
          src: './assets/city/pixel/planter.png', solid: { w: 44, d: 0.07 } },
        { id: 'arr_duct',   z: 0.84, plane: 'deck', x: 880, y: 0.80, height: 64,
          src: './assets/city/pixel/duct.png', solid: { w: 96, d: 0.08 } },

        // ═══ WORKSHOP (900-1900) ═════════════════════════════════════════
        // Someone builds here. The bench faces out from the shack, tools and
        // crates piled where they were last put down.
        {
            id: 'corrugated_shack', z: 0.90, plane: 'deck', x: 1320, y: 0.80, height: 265,
            src: './assets/city/pixel/corrugated_shack.png',
            motion: { reach: 300, min: 0.14 },
            // Goes somewhere rather than opening something: this door is the
            // way into the workshop interior. `scene:` is the enter-a-place verb.
            door: { action: 'scene:workshop', label: 'The workshop', width: 150 },
            light: { radius: 70, color: [255, 180, 110], oy: 165, intensity: 0.7 },
            solid: { w: 230, d: 0.16 }
        },
        { id: 'work_ac',    z: 0.80, plane: 'deck', x: 1110, y: 0.80, height: 73,
          src: './assets/city/pixel/ac_unit.png', solid: { w: 80, d: 0.09 } },
        {
            id: 'prototype', z: 0.52, plane: 'deck', x: 1490, y: 0.80, height: 95,
            src: './assets/city/pixel/prototype_board.png',
            interact: { action: 'project:rooftop-world', label: 'Project', width: 110 },
            light: { radius: 45, color: [255, 140, 120], oy: 35, intensity: 0.7 },
            anim: { type: 'flicker' }, solid: { w: 70, d: 0.08 }
        },
        {
            id: 'laptop', z: 0.40, plane: 'deck', x: 1620, y: 0.80, height: 80,
            src: './assets/city/pixel/laptop.png',
            interact: { action: 'project:isometric-room', label: 'Project', width: 110 },
            light: { radius: 55, color: [150, 210, 255], oy: 30, intensity: 0.8 },
            solid: { w: 52, d: 0.07 }
        },
        { id: 'work_crate_a', z: 0.66, plane: 'deck', x: 1560, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.png', solid: { w: 62, d: 0.09 } },
        { id: 'work_crate_b', z: 0.60, plane: 'deck', x: 1180, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.png', solid: { w: 62, d: 0.09 } },
        { id: 'work_chair', z: 0.34, plane: 'deck', x: 1400, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.png', solid: { w: 44, d: 0.07 } },
        { id: 'work_vents', z: 0.88, plane: 'deck', x: 1720, y: 0.80, height: 93,
          src: './assets/city/pixel/vent_pipes.png', solid: { w: 62, d: 0.08 },
          // Vents vent. The cheapest motion on the roof that is also true, and
          // the thing that stops a still frame reading as an empty one.
          steam: { rate: 1.0, rise: 58, size: 10, oy: 84, ttl: 3.6 } },
        // The bulb strings used to hang in open air with nothing to string them
        // between. These are what they hang from. Placed off the measured span
        // of the art (82x58, so ~94 world px at height 94) rather than by eye,
        // and a shade taller than the string so it sags between them.
        { id: 'pole_work_w', z: 0.86, plane: 'deck', x: 1198, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.png', solid: { w: 16, d: 0.04 } },
        { id: 'pole_work_e', z: 0.86, plane: 'deck', x: 1302, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.png', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_work', z: 0.86, plane: 'deck', x: 1250, y: 0.535, height: 94,
          src: './assets/city/pixel/bulb_string.png', shadow: false,
          anim: { type: 'sway', speed: 0.55, amount: 5 },
          light: { radius: 110, color: [255, 196, 128], oy: 60, intensity: 0.75 } },

        // ═══ GARDEN (1900-2900) ══════════════════════════════════════════
        // The greenhouse glows; everything around it has been left to grow.
        {
            id: 'greenhouse', z: 0.90, plane: 'deck', x: 2380, y: 0.80, height: 275,
            src: './assets/city/pixel/greenhouse.png',
            door: { action: 'blog', label: 'Blog', width: 160 },
            light: { radius: 130, color: [190, 235, 175], oy: 150, intensity: 0.85 },
            solid: { w: 250, d: 0.16 }
        },
        { id: 'gar_planter_a', z: 0.58, plane: 'deck', x: 2140, y: 0.80, height: 88,
          src: './assets/city/pixel/planter.png', solid: { w: 46, d: 0.07 } },
        { id: 'gar_planter_b', z: 0.50, plane: 'deck', x: 2220, y: 0.80, height: 78,
          src: './assets/city/pixel/planter.png', solid: { w: 44, d: 0.07 } },
        { id: 'gar_planter_c', z: 0.44, plane: 'deck', x: 2600, y: 0.80, height: 92,
          src: './assets/city/pixel/planter.png', solid: { w: 48, d: 0.07 } },
        { id: 'gar_planter_d', z: 0.36, plane: 'deck', x: 2690, y: 0.80, height: 74,
          src: './assets/city/pixel/planter.png', solid: { w: 42, d: 0.07 } },
        { id: 'gar_chair', z: 0.28, plane: 'deck', x: 2450, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.png', solid: { w: 44, d: 0.07 } },
        { id: 'gar_duct', z: 0.84, plane: 'deck', x: 1980, y: 0.80, height: 64,
          src: './assets/city/pixel/duct.png', solid: { w: 96, d: 0.08 },
          steam: { rate: 0.55, rise: 40, size: 7, oy: 56, ttl: 2.8, alpha: 0.14 } },
        { id: 'pole_gar_w', z: 0.86, plane: 'deck', x: 2328, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.png', solid: { w: 16, d: 0.04 } },
        { id: 'pole_gar_e', z: 0.86, plane: 'deck', x: 2432, y: 0.80, height: 130,
          src: './assets/city/pixel/utility_pole.png', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_garden', z: 0.86, plane: 'deck', x: 2380, y: 0.535, height: 94,
          src: './assets/city/pixel/bulb_string.png', shadow: false,
          anim: { type: 'sway', speed: 0.5, amount: 5 },
          light: { radius: 110, color: [255, 196, 128], oy: 60, intensity: 0.75 } },

        // ═══ STUDY (2900-3800) ═══════════════════════════════════════════
        // A reading corner: papers, a terminal still on, somewhere to sit.
        {
            id: 'utility_shed', z: 0.90, plane: 'deck', x: 3320, y: 0.80, height: 250,
            src: './assets/city/pixel/utility_shed.png',
            // On a sensor. Dark from a distance, warms up as you approach —
            // which is the one reaction that gives you a reason to walk over.
            motion: { reach: 320, min: 0.10 },
            door: { action: 'resume', label: 'Resume', width: 140 },
            light: { radius: 80, color: [255, 205, 140], oy: 150, intensity: 0.8 },
            anim: { type: 'flicker' }, solid: { w: 215, d: 0.16 }
        },
        {
            id: 'crt_terminal', z: 0.56, plane: 'deck', x: 3080, y: 0.80, height: 150,
            src: './assets/city/pixel/crt_terminal.png',
            interact: { action: 'terminal', label: 'Terminal', width: 130 },
            light: { radius: 70, color: [140, 255, 190], oy: 55, intensity: 0.85 },
            anim: { type: 'flicker' }, solid: { w: 88, d: 0.10 }
        },
        {
            id: 'poster', z: 0.86, plane: 'deck', x: 2960, y: 0.80, height: 140,
            src: './assets/city/pixel/poster.png',
            interact: { action: 'project:sprite-pipeline', label: 'Project', width: 110 },
            solid: { w: 70, d: 0.06 }
        },
        {
            id: 'newsstand', z: 0.44, plane: 'deck', x: 3500, y: 0.80, height: 110,
            src: './assets/city/pixel/newsstand.png',
            interact: { action: 'blogstack', label: 'Read posts', width: 130 },
            solid: { w: 96, d: 0.09 }
        },
        { id: 'study_chair', z: 0.30, plane: 'deck', x: 3220, y: 0.80, height: 82,
          src: './assets/city/pixel/folding_chair.png', solid: { w: 44, d: 0.07 } },
        { id: 'study_boxes', z: 0.64, plane: 'deck', x: 3620, y: 0.80, height: 56,
          src: './assets/city/pixel/boxes.png', solid: { w: 58, d: 0.08 } },

        // ═══ POST (3800-4600) ════════════════════════════════════════════
        // The domestic corner: post, pigeons, someone's washing.
        {
            id: 'mailbox', z: 0.52, plane: 'deck', x: 4010, y: 0.80, height: 120,
            src: './assets/city/pixel/mailbox.png',
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
            src: './assets/city/pixel/pigeon_loft.png',
            light: { radius: 62, color: [255, 186, 120], oy: 190, intensity: 0.55 },
            solid: { w: 150, d: 0.14 }
        },
        {
            id: 'pigeon_coop', z: 0.84, plane: 'deck', x: 4260, y: 0.80, height: 130,
            src: './assets/city/pixel/pigeon_coop.png',
            interact: { action: 'pigeons', label: 'Pigeons', width: 130 },
            solid: { w: 110, d: 0.11 }
        },
        {
            id: 'vending', z: 0.86, plane: 'deck', x: 3880, y: 0.80, height: 145,
            src: './assets/city/pixel/vending_machine.png',
            interact: { action: 'vending', label: 'Vending machine', width: 120 },
            light: { radius: 75, color: [150, 220, 255], oy: 80, intensity: 0.85 },
            anim: { type: 'flicker' }, solid: { w: 76, d: 0.09 }
        },
        { id: 'post_crate', z: 0.40, plane: 'deck', x: 4400, y: 0.80, height: 81,
          src: './assets/city/pixel/crates.png', solid: { w: 62, d: 0.09 } },
        { id: 'post_ac',    z: 0.78, plane: 'deck', x: 4480, y: 0.80, height: 73,
          src: './assets/city/pixel/ac_unit.png', solid: { w: 80, d: 0.09 } },
        { id: 'post_planter', z: 0.26, plane: 'deck', x: 4130, y: 0.80, height: 80,
          src: './assets/city/pixel/planter.png', solid: { w: 44, d: 0.07 } },

        // ═══ LOOKOUT (4600-6200) ═════════════════════════════════════════
        // The payoff. Kept deliberately open: nothing tall, nothing between you
        // and the sky, so stopping here feels like arriving somewhere.
        {
            id: 'radio_mast', z: 0.92, plane: 'deck', x: 4820, y: 0.80, height: 320,
            src: './assets/city/pixel/radio_mast.png',
            door: { action: 'contact', label: 'Contact', width: 130 },
            light: { radius: 34, color: [255, 70, 70], oy: -6, intensity: 1, pool: false },
            anim: { type: 'pulse', speed: 0.9 }, solid: { w: 130, d: 0.12 }
        },
        {
            id: 'telescope', z: 0.20, plane: 'deck', x: 5400, y: 0.80, height: 128,
            src: './assets/city/pixel/telescope.png',
            interact: { action: 'stargaze', label: 'Look up', width: 260 },
            anim: { type: 'bob', speed: 0.5, amount: 1.5 },
            solid: { w: 48, d: 0.07 }
        },
        { id: 'bench', z: 0.30, plane: 'deck', x: 5620, y: 0.80, height: 95,
          src: './assets/city/pixel/bench.png', solid: { w: 120, d: 0.08 } },
        { id: 'clipboard', z: 0.26, plane: 'deck', x: 5720, y: 0.80, height: 70,
          src: './assets/city/pixel/clipboard.png',
          interact: { action: 'resume', label: 'Resume', width: 110 },
          solid: { w: 34, d: 0.05 } },
        { id: 'railing', z: 0.05, plane: 'deck', x: 5300, y: 0.80, height: 100,
          src: './assets/city/pixel/railing.png', shadow: false },
        { id: 'railing_b', z: 0.05, plane: 'deck', x: 5560, y: 0.80, height: 100,
          src: './assets/city/pixel/railing.png', shadow: false },
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
          src: './assets/city/pixel/duct.png', solid: { w: 96, d: 0.08 } },
        { id: 'look_crate', z: 0.55, plane: 'deck', x: 4730, y: 0.80, height: 76,
          src: './assets/city/pixel/crates.png', solid: { w: 58, d: 0.09 } },
        { id: 'look_spool', z: 0.45, plane: 'deck', x: 4910, y: 0.80, height: 74,
          src: './assets/city/pixel/cable_spool.png', solid: { w: 66, d: 0.09 } },
        { id: 'look_boxes', z: 0.72, plane: 'deck', x: 4975, y: 0.80, height: 54,
          src: './assets/city/pixel/boxes.png', solid: { w: 56, d: 0.08 } },
        { id: 'look_barrel', z: 0.62, plane: 'deck', x: 5185, y: 0.80, height: 86,
          src: './assets/city/pixel/barrel.png', solid: { w: 46, d: 0.07 } },
        { id: 'look_lantern', z: 0.40, plane: 'deck', x: 5250, y: 0.80, height: 58,
          src: './assets/city/pixel/lantern.png',
          light: { radius: 92, color: [255, 176, 104], oy: 44, intensity: 0.8 },
          anim: { type: 'flicker' }, solid: { w: 24, d: 0.05 } },
        { id: 'look_table', z: 0.44, plane: 'deck', x: 5468, y: 0.80, height: 60,
          src: './assets/city/pixel/side_table.png', solid: { w: 54, d: 0.07 } },
        { id: 'look_chair_a', z: 0.33, plane: 'deck', x: 5522, y: 0.80, height: 90,
          src: './assets/city/pixel/deck_chair.png', solid: { w: 58, d: 0.08 } },
        { id: 'look_cooler', z: 0.48, plane: 'deck', x: 5678, y: 0.80, height: 50,
          src: './assets/city/pixel/cooler.png', solid: { w: 52, d: 0.07 } },
        { id: 'look_chair_b', z: 0.24, plane: 'deck', x: 5812, y: 0.80, height: 88,
          src: './assets/city/pixel/deck_chair.png', flip: true, solid: { w: 58, d: 0.08 } },
        { id: 'look_planter', z: 0.58, plane: 'deck', x: 5866, y: 0.80, height: 78,
          src: './assets/city/pixel/planter.png', solid: { w: 44, d: 0.07 } },
        { id: 'look_vents_c', z: 0.74, plane: 'deck', x: 5962, y: 0.80, height: 84,
          src: './assets/city/pixel/vent_pipes.png', solid: { w: 62, d: 0.08 },
          steam: { rate: 0.5, rise: 46, size: 8, oy: 76, ttl: 3.0, alpha: 0.15 } },
        // z 0.58, NOT 0.42, and this is load-bearing.
        //
        // The lookout platform ends at x 6050 with an 18px lip, and 18 > maxStep,
        // so the front of the roof east of there is only reachable by coming
        // back up the ramp at z > 0.44. At z 0.42 this crate stood exactly in
        // that corridor and sealed the last 100px of the world. The reachability
        // flood caught it; walking there would have been the only other way.
        { id: 'look_crate_b', z: 0.58, plane: 'deck', x: 6046, y: 0.80, height: 70,
          src: './assets/city/pixel/crates.png', flip: true, solid: { w: 58, d: 0.09 } },
        { id: 'look_duct_b', z: 0.86, plane: 'deck', x: 6104, y: 0.80, height: 58,
          src: './assets/city/pixel/duct.png', solid: { w: 96, d: 0.08 } },

        // Lights over the seating, hung between their own poles like the others.
        { id: 'pole_look_w', z: 0.68, plane: 'deck', x: 5498, y: 0.80, height: 128,
          src: './assets/city/pixel/utility_pole.png', solid: { w: 16, d: 0.04 } },
        { id: 'pole_look_e', z: 0.68, plane: 'deck', x: 5602, y: 0.80, height: 128,
          src: './assets/city/pixel/utility_pole.png', flip: true, solid: { w: 16, d: 0.04 } },
        { id: 'bulb_look', z: 0.68, plane: 'deck', x: 5550, y: 0.80, height: 92,
          src: './assets/city/pixel/bulb_string.png', shadow: false,
          anim: { type: 'sway', speed: 0.6, amount: 5 },
          light: { radius: 108, color: [255, 196, 128], oy: 58, intensity: 0.7 } },

        { id: 'look_vents', z: 0.88, plane: 'deck', x: 5100, y: 0.80, height: 93,
          src: './assets/city/pixel/vent_pipes.png', solid: { w: 62, d: 0.08 },
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
          src: './assets/city/pixel/moon.png',
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
          src: './assets/city/pixel/cloud_a.png', shadow: false },
        { id: 'cloud_b', plane: 'sky', x: 760,  y: 0.145, height: 44,
          src: './assets/city/pixel/cloud_b.png', shadow: false },
        { id: 'cloud_c', plane: 'sky', x: 1180, y: 0.305, height: 62,
          src: './assets/city/pixel/cloud_a.png', flip: true, shadow: false },
        { id: 'cloud_d', plane: 'sky', x: 520,  y: 0.375, height: 40,
          src: './assets/city/pixel/cloud_b.png', flip: true, shadow: false },

        // ═══ SKYLINE ═════════════════════════════════════════════════════
        // Masses that break the flat band of the backdrop. They stand on the
        // horizon like the far props do, and reach far higher than anything
        // else in the world — that height is the entire point of them.
        { id: 'sky_tower_a', plane: 'skyline', x: 300,  y: 0.66, height: 520,
          src: './assets/city/pixel/sky_tower_a.png', shadow: false },
        { id: 'sky_tower_b', plane: 'skyline', x: 980,  y: 0.66, height: 385,
          src: './assets/city/pixel/sky_tower_b.png', shadow: false },
        { id: 'sky_tower_c', plane: 'skyline', x: 1560, y: 0.66, height: 615,
          src: './assets/city/pixel/sky_tower_c.png', shadow: false },
        { id: 'sky_tower_d', plane: 'skyline', x: 2280, y: 0.66, height: 430,
          src: './assets/city/pixel/sky_tower_b.png', flip: true, shadow: false },
        {
            // A crane. The one diagonal in a skyline of verticals, and its
            // aircraft light is the only red in the upper frame.
            id: 'sky_crane', plane: 'skyline', x: 1880, y: 0.66, height: 470,
            src: './assets/city/pixel/sky_crane.png',
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
          src: './assets/city/pixel/pot_stack.png', solid: { w: 28, d: 0.05 } },
        { id: 'arr_broom', z: 0.60, plane: 'deck', x: 700, y: 0.80, height: 118,
          src: './assets/city/pixel/broom.png', shadow: false },
        { id: 'work_toolbox', z: 0.30, plane: 'deck', x: 1432, y: 0.80, height: 42,
          src: './assets/city/pixel/toolbox.png', solid: { w: 40, d: 0.05 } },
        { id: 'gar_watering', z: 0.34, plane: 'deck', x: 2300, y: 0.80, height: 48,
          src: './assets/city/pixel/watering_can.png', solid: { w: 34, d: 0.05 } },
        { id: 'gar_pots', z: 0.27, plane: 'deck', x: 2472, y: 0.80, height: 58,
          src: './assets/city/pixel/pot_stack.png', flip: true, solid: { w: 28, d: 0.05 } },
        { id: 'study_bike', z: 0.46, plane: 'deck', x: 3040, y: 0.80, height: 96,
          src: './assets/city/pixel/roof_bicycle.png', solid: { w: 118, d: 0.07 } },
        // Lies flat and is not solid — you step over a rolled tarp.
        { id: 'post_tarp', z: 0.44, plane: 'deck', x: 4330, y: 0.80, height: 34,
          src: './assets/city/pixel/tarp_roll.png', shadow: false },
        { id: 'look_can', z: 0.40, plane: 'deck', x: 5904, y: 0.80, height: 44,
          src: './assets/city/pixel/watering_can.png', flip: true, solid: { w: 34, d: 0.05 } },

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
          src: './assets/city/pixel/pipe_stack.png', solid: { w: 40, d: 0.07 } },
        { id: 'work_antenna', z: 0.90, plane: 'deck', x: 1050, y: 0.80, height: 228,
          src: './assets/city/pixel/antenna_guyed.png', shadow: false },
        { id: 'gar_pipes',    z: 0.88, plane: 'deck', x: 2210, y: 0.80, height: 196,
          src: './assets/city/pixel/pipe_stack.png', solid: { w: 40, d: 0.07 },
          steam: { rate: 0.45, rise: 62, size: 8, oy: 176, ttl: 3.6, alpha: 0.15 } },
        { id: 'study_antenna', z: 0.90, plane: 'deck', x: 3180, y: 0.80, height: 236,
          src: './assets/city/pixel/antenna_guyed.png', flip: true, shadow: false },
        { id: 'post_pipes',   z: 0.86, plane: 'deck', x: 4520, y: 0.80, height: 176,
          src: './assets/city/pixel/pipe_stack.png', flip: true, solid: { w: 40, d: 0.07 } },

        // Hatches lie flat in the walkway and are deliberately NOT solid — you
        // step over a roof hatch, and a knee-high box you cannot walk round in
        // the middle of the route would be the worst kind of obstacle.
        { id: 'arr_hatch',   z: 0.42, plane: 'deck', x: 640,  y: 0.80, height: 44,
          src: './assets/city/pixel/roof_hatch.png', shadow: false },
        { id: 'study_hatch', z: 0.36, plane: 'deck', x: 3420, y: 0.80, height: 44,
          src: './assets/city/pixel/roof_hatch.png', flip: true, shadow: false },

        // ═══ FAR PLANE ═══════════════════════════════════════════════════
        // Distant rooftops on the horizon. Spaced to break the skyline rather
        // than evenly, so the eye has somewhere to rest.
        { id: 'water_tower', plane: 'far', x: 1150, y: 0.66, height: 430, src: './assets/city/pixel/water_tower.png' },
        { id: 'antenna',     plane: 'far', x: 620,  y: 0.66, height: 240, src: './assets/city/pixel/antenna.png' },
        { id: 'neon_sign',   plane: 'far', x: 1830, y: 0.66, height: 150, src: './assets/city/pixel/neon_sign.png',
          light: { radius: 120, color: [255, 90, 210], oy: 70, intensity: 0.8, pool: false },
          anim: { type: 'flicker' }, shadow: false },
        { id: 'chimney_a',   plane: 'far', x: 900,  y: 0.66, height: 150, src: './assets/city/pixel/chimney.png',
          steam: { rate: 0.5, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_b',   plane: 'far', x: 2550, y: 0.66, height: 135, src: './assets/city/pixel/chimney.png',
          steam: { rate: 0.42, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_c',   plane: 'far', x: 4150, y: 0.66, height: 160, src: './assets/city/pixel/chimney.png',
          steam: { rate: 0.46, rise: 96, size: 11, oy: 150, ttl: 6, drift: 1.5, tone: [128, 134, 158], alpha: 0.13 } },
        { id: 'chimney_d',   plane: 'far', x: 3350, y: 0.66, height: 140, src: './assets/city/pixel/chimney.png' },
        { id: 'dish_a',      plane: 'far', x: 1980, y: 0.66, height: 128, src: './assets/city/pixel/satellite_dish.png' },
        { id: 'dish_b',      plane: 'far', x: 3700, y: 0.66, height: 120, src: './assets/city/pixel/satellite_dish.png' },
        { id: 'dish_c',      plane: 'far', x: 3700, y: 0.66, height: 124, src: './assets/city/pixel/satellite_dish.png' },
        { id: 'tank_far',    plane: 'far', x: 3050, y: 0.66, height: 200, src: './assets/city/pixel/water_tank_small.png' },
        { id: 'far_tower',   plane: 'far', x: 2760, y: 0.66, height: 340, src: './assets/city/pixel/far_tower.png' },
        { id: 'far_billboard', plane: 'far', x: 3900, y: 0.66, height: 175,
          src: './assets/city/pixel/far_billboard.png',
          light: { radius: 90, color: [120, 200, 255], oy: 100, intensity: 0.55, pool: false },
          shadow: false },
        { id: 'laundry',     plane: 'far', x: 2200, y: 0.66, height: 185, src: './assets/city/pixel/laundry_line.png',
          anim: { type: 'sway', speed: 0.42, amount: 3 }, shadow: false },

        // Power lines, running the length of the world. One horizontal drawn
        // across the emptiest part of the frame, which is what the eye reads as
        // a city rather than as a backdrop with a gap above it. Tiles, so the
        // art must carry its poles and meet itself seamlessly.
        { id: 'cable_run', plane: 'far', x: 0, y: 0.66, height: 250,
          src: './assets/city/pixel/cable_run.png', repeat: true,
          anim: { type: 'sway', speed: 0.3, amount: 2 }, shadow: false },

        // ═══ TEXTURE ═════════════════════════════════════════════════════
        // The only scattered things left. Puddles, weeds and grit have no
        // arrangement in reality either, and none of them are solid.
        ...scatter({ id: 'puddle', plane: 'deck', y: 0.804, height: 20,
            src: './assets/city/pixel/puddle.png', shadow: false },
            { from: 400, to: 6000, count: 9, seed: 111, sizeVary: 0.3, zFrom: 0.10, zTo: 0.70 }),
        // `brush` is what makes them bend away as you walk through them. The
        // whole stand reacts because every instance carries it, and it costs
        // one distance check per weed per frame.
        ...scatter({ id: 'weed', plane: 'deck', y: 0.805, height: 26,
            src: './assets/city/pixel/weed.png', shadow: false,
            anim: { type: 'sway', speed: 1.1, amount: 1.6 },
            brush: { reach: 52, amount: 7 } },
            { from: 300, to: 6100, count: 14, seed: 131, sizeVary: 0.3, zFrom: 0.05, zTo: 0.92 }),

        // ═══ FOREGROUND ══════════════════════════════════════════════════
        { id: 'parapet', plane: 'fore', x: 0, y: 1.0, height: 112,
          src: './assets/city/pixel/parapet.png', repeat: true },
        ...scatter({ id: 'fore_plant', plane: 'fore', y: 1.0, height: 190,
            src: './assets/city/pixel/fore_plant.png',
            anim: { type: 'sway', speed: 0.7, amount: 3, stiffness: 0.45 } },
            { from: 300, to: 6000, count: 6, seed: 141, sizeVary: 0.25 }),
        ...scatter({ id: 'fore_pipe', plane: 'fore', y: 1.0, height: 235,
            src: './assets/city/pixel/fore_pipe.png' },
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
            src: './assets/city/pixel/fore_vent.png', shadow: false },
            { from: 700, to: 5600, count: 3, seed: 161, sizeVary: 0.22 }),
        ...scatter({ id: 'fore_rail', plane: 'fore', y: 1.0, height: 158,
            src: './assets/city/pixel/fore_rail.png', shadow: false },
            { from: 400, to: 5900, count: 4, seed: 171, sizeVary: 0.15 })
    ],

    /** Full-width backdrops. One image per plane, tiled where marked. */
    backdrops: [
        { plane: 'sky',     src: './assets/city/pixel/layers/sky.png' },
        { plane: 'skyline', src: './assets/city/pixel/layers/skyline.png', repeat: true },
        { plane: 'deck',    src: './assets/city/pixel/layers/deck.png', repeat: true,
          anchor: 'bottom', heightFrac: 0.34 }
    ],

    actor: {
        id: 'character',
        src: './assets/city/pixel/char_sheet.png',
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
                sit:  './assets/city/pixel/cat_sit.png',
                walk: './assets/city/pixel/cat_walk.png',
                curl: './assets/city/pixel/cat_curl.png'
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

    /** Where the guestbook posts to. */
    guestbook: {
        repo: 'khmurakami/khmurakami.github.io',
        labels: 'guestbook'
    },

    /** Resume file offered by the clipboard. */
    resumeFile: './assets/resume.pdf',

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
