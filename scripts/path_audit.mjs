/**
 * Measures the route a visitor actually walks, and what is standing in it.
 *
 *   node scripts/path_audit.mjs
 *   node scripts/path_audit.mjs --scene workshop
 *
 * A roof full of objects is not the same thing as a roof that reads as a place.
 * Two failures look identical in the manifest and feel completely different to
 * walk through:
 *
 *   CLUTTER WITHOUT MEANING — props placed by a scatter function, evenly spaced
 *   with jitter, belonging to nobody. Density is what separates a set from a
 *   place, but density ALONE reads as texture rather than as habitation.
 *
 *   OBSTRUCTION WITHOUT MEANING — a solid prop sitting in the walkable corridor
 *   that the visitor has to steer around for no reason. A crate you walk round
 *   because somebody put it down mid-job is a story. A crate you walk round
 *   because the layout never checked is an annoyance. They are the same entry
 *   in the manifest, and only one of them has earned it.
 *
 * Both are reported as numbers, because "feels cluttered" is not something two
 * people can agree on and "takes 40% of the corridor and does nothing" is.
 */
import { scenes } from '../js/config/scenes.js';
import { Walkway } from '../js/engine/Walkway.js';
import { Collision } from '../js/engine/Collision.js';

const args = process.argv.slice(2);
const only = args.includes('--scene') ? args[args.indexOf('--scene') + 1] : null;

const STEP = 20;            // world px between samples along the route
const Z_STEP = 0.02;        // depth resolution
const PINCH = 0.22;         // corridor narrower than this is tight
const CHARACTER_D = 0.08;   // roughly the depth the character occupies

for (const { id, manifest } of scenes) {
    if (only && id !== only) continue;
    if (!manifest.walkway) continue;

    const walkway = new Walkway(manifest.walkway);
    const collision = new Collision(manifest.props, manifest.collision);

    const from = walkway.from;
    const to = walkway.to;

    // ── The corridor ─────────────────────────────────────────────
    //
    // At each x, how much depth is genuinely walkable: the route's own band,
    // less anything solid standing in it. Measured by trying to stand in each
    // slice rather than by reading the boxes, so it accounts for however
    // collision actually resolves.
    const samples = [];

    for (let x = from; x <= to; x += STEP) {
        // A route can have several lanes at one x — the deck and a raised
        // service level — so the corridor is the union of their bands.
        const bands = walkway.bandsAt(x);
        if (!bands.length) continue;

        const width = bands.reduce((n, b) => n + (b.far - b.near), 0);

        let open = 0;
        for (let z = 0; z <= 1; z += Z_STEP) {
            if (!walkway.contains(x, z)) continue;
            const solved = collision.resolve(x, z, x, z);
            if (Math.abs(solved.x - x) < 0.5 && Math.abs(solved.z - z) < 1e-6) open += Z_STEP;
        }
        samples.push({ x, band: width, open });
    }

    const tight = samples.filter(s => s.open < PINCH);
    const blocked = samples.filter(s => s.open < CHARACTER_D);

    // ── What is standing in it ───────────────────────────────────
    const obstructions = [];
    for (const p of manifest.props) {
        if (!p.solid) continue;
        const bands = walkway.bandsAt(p.x);
        if (!bands.length) continue;

        const z = p.z != null ? p.z : 0.5;
        const d = p.solid === true ? 0.1 : (p.solid.d || 0.1);

        const width = bands.reduce((n, b) => n + (b.far - b.near), 0);
        const overlap = bands.reduce((n, b) => n + Math.max(0,
            Math.min(z + d / 2, b.far) - Math.max(z - d / 2, b.near)), 0);
        const share = overlap / Math.max(width, 1e-6);

        if (share > 0.01) {
            obstructions.push({
                id: p.id, x: p.x, share,
                purposeful: !!(p.interact || p.door)
            });
        }
    }
    obstructions.sort((a, b) => b.share - a.share);

    // ── How much is generated ────────────────────────────────────
    const scattered = manifest.props.filter(p => /_\d+$/.test(p.id));
    const placed = manifest.props.length - scattered.length;

    // Evenness is the tell. A scatter function spaces things at one interval
    // plus jitter, so the gaps between siblings are all alike; things people
    // put down cluster where they were using them.
    const families = new Map();
    for (const p of scattered) {
        const base = p.id.replace(/_\d+$/, '');
        if (!families.has(base)) families.set(base, []);
        families.get(base).push(p.x);
    }

    const evenness = [];
    for (const [base, xs] of families) {
        if (xs.length < 4) continue;
        const sorted = [...xs].sort((a, b) => a - b);
        const gaps = sorted.slice(1).map((x, i) => x - sorted[i]);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
        evenness.push({ base, n: xs.length, mean, cv: sd / mean });
    }
    evenness.sort((a, b) => a.cv - b.cv);

    // ── Report ───────────────────────────────────────────────────
    console.log(`\n=== ${id} ===  ${manifest.props.length} props, route ${from}-${to}px\n`);

    const depths = samples.map(s => s.open).sort((a, b) => a - b);
    const q = (f) => depths[Math.min(depths.length - 1, Math.floor(depths.length * f))] ?? 0;

    console.log('corridor — walkable depth along the route, 0 to 1');
    console.log(`  min ${q(0).toFixed(2)}   p10 ${q(0.10).toFixed(2)}`
        + `   median ${q(0.50).toFixed(2)}   widest ${q(0.99).toFixed(2)}`);
    console.log(`  tight (under ${PINCH}): ${tight.length} of ${samples.length} samples`
        + ` — ${(100 * tight.length / samples.length).toFixed(0)}% of the walk`);
    console.log(`  impassable:            ${blocked.length}`);

    if (blocked.length) {
        const runs = [];
        let run = null;
        for (const s of blocked) {
            if (run && s.x - run.to <= STEP) run.to = s.x;
            else runs.push(run = { from: s.x, to: s.x });
        }
        console.log(`    ${runs.map(r => `x ${r.from}-${r.to}`).join(', ')}`);
    }

    console.log('\nsolid props standing in the route');
    for (const o of obstructions.slice(0, 12)) {
        console.log(`  ${(o.share * 100).toFixed(0).padStart(3)}% of the corridor`
            + `   x${String(o.x).padStart(5)}   ${o.id.padEnd(18)}`
            + (o.purposeful ? '  <- you can open it' : ''));
    }
    const pointless = obstructions.filter(o => !o.purposeful && o.share > 0.25);
    console.log(`  ${obstructions.length} in the route,`
        + ` ${obstructions.filter(o => o.purposeful).length} of them interactive`);
    console.log(`  ${pointless.length} take over a quarter of it and do nothing:`
        + ` ${pointless.slice(0, 8).map(o => o.id).join(', ') || '(none)'}`);

    console.log('\nscatter');
    console.log(`  ${placed} placed by hand, ${scattered.length} generated`
        + ` — ${(100 * scattered.length / manifest.props.length).toFixed(0)}% generated`);
    if (evenness.length) {
        console.log('  gap variation between siblings (0.00 = a grid, ~1.00 = random):');
        for (const e of evenness) {
            console.log(`    ${e.base.padEnd(16)} ${String(e.n).padStart(2)} of them,`
                + ` every ${e.mean.toFixed(0).padStart(4)}px, variation ${e.cv.toFixed(2)}`);
        }
    }

    // ── The foreground is judged together, not family by family ──
    //
    // A low per-family figure looks alarming here and usually is not. Seven
    // kinds of silhouette interleave at different intervals and phases, and a
    // visitor sees the PROCESSION, not one family at a time: the rails score
    // 0.11 on their own and 0.88 combined, which is what actually passes the
    // camera. Measuring per family is right for clutter, where the eye notices
    // "another weed, same distance again", and wrong for framing.
    const fore = manifest.props
        .filter(p => p.plane === 'fore' && /_\d+$/.test(p.id))
        .map(p => p.x)
        .sort((a, b) => a - b);

    if (fore.length > 3) {
        const gaps = fore.slice(1).map((x, i) => x - fore[i]);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
        console.log(`  foreground, all families together: ${fore.length} props,`
            + ` every ${mean.toFixed(0)}px, variation ${(sd / mean).toFixed(2)}`);
    }
}

console.log();
