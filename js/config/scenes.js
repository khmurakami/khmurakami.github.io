/**
 * Every place in the world, declared once.
 *
 * The scene list used to be written out in four separate files — the engines
 * built in `world-main.js`, the manager's list beside it, `asset_spec.mjs` and
 * `check_assets.mjs`. Adding a room meant four edits, and the three you could
 * forget all failed SILENTLY: the room simply stopped being checked, so a slot
 * with no art or an asset missing from git sailed through CI and 404'd live.
 *
 * One list. The loop builds from it, the manager routes from it, and both asset
 * checks walk it — so a new room is checked from the moment it exists.
 */
import { city } from './city.js';
import { workshop } from './workshop.js';
import { stairwell } from './stairwell.js';

export const scenes = [
    {
        id: 'roof',
        manifest: city,
        // The roof is where a visitor arrives, so its spawn is the character's
        // authored place rather than a doorway.
        spawn: { x: city.actor.place.x, z: 0.45 }
    },
    {
        id: 'workshop',
        manifest: workshop,
        spawn: workshop.spawn,
        facing: workshop.facing
    },
    {
        id: 'stairwell',
        manifest: stairwell,
        spawn: stairwell.spawn,
        facing: stairwell.facing
    }
];

/** The scene a visitor arrives in. */
export const START_SCENE = 'roof';

/** `{ id: manifest }`, the shape the asset checks want. */
export const manifests = Object.fromEntries(scenes.map(s => [s.id, s.manifest]));
