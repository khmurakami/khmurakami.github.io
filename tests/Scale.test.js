import { describe, it, expect } from 'vitest';
import { city } from '../js/config/city.js';

/**
 * The world is built from independently generated art, so nothing enforces that
 * a crate is smaller than a person. These guard the layout against the kind of
 * drift that only shows up once you stand next to something.
 */
const d = city.deck;
const depthScale = (z) => d.frontScale + (d.backScale - d.frontScale) * z;

/** Rendered height in reference px, accounting for depth on the floor plane. */
const renders = (p) => {
    const z = p.z != null ? p.z : 0.5;
    return p.height * (p.plane === 'deck' ? depthScale(z) : 1);
};

const CHARACTER = city.actor.place.height * depthScale(0.45);
/** Real-world centimetres, taking the character as 175cm. */
const cm = (p) => (renders(p) / CHARACTER) * 175;

const prop = (id) => city.props.find(p => p.id === id || p.id === `${id}_0`);

describe('props are in human scale', () => {
    it('makes the character roughly person-sized against the world', () => {
        expect(CHARACTER).toBeGreaterThan(120);
        expect(CHARACTER).toBeLessThan(260);
    });

    it('keeps furniture below head height', () => {
        // Ids come from the authored zone layout rather than a scatter prefix.
        for (const id of ['bench', 'arr_crate', 'work_chair', 'gar_planter_a',
                          'arr_box', 'arr_duct', 'work_ac']) {
            expect(cm(prop(id)), id).toBeLessThan(140);
        }
    });

    it('keeps the parapet at waist-to-chest height', () => {
        // A parapet taller than a person hides the roof behind it and swallows
        // the bottom of the frame.
        const h = cm(prop('parapet'));
        expect(h).toBeGreaterThan(80);
        expect(h).toBeLessThan(130);
    });

    it('keeps things you stand next to within a sane range', () => {
        for (const id of ['telescope', 'railing', 'vending', 'mailbox', 'newsstand']) {
            const h = cm(prop(id));
            expect(h, `${id} = ${h.toFixed(0)}cm`).toBeGreaterThan(60);
            expect(h, `${id} = ${h.toFixed(0)}cm`).toBeLessThan(200);
        }
    });

    it('makes every enterable structure taller than the character', () => {
        for (const p of city.props.filter(p => p.door)) {
            expect(renders(p), p.id).toBeGreaterThan(CHARACTER);
        }
    });

    it('leaves nothing absurdly out of scale', () => {
        // The `skyline` plane is exempt, and only that one.
        //
        // It is the horizon city: forty-storey towers several blocks away, and
        // measuring them against a person standing on this roof is a category
        // error — being enormous is the entire job. Every other plane stays
        // capped, including `far`, where a water tower reads at about 4m and
        // would be a genuine mistake at 20.
        const seen = new Set();
        for (const p of city.props) {
            if (p.plane === 'skyline') continue;
            const base = p.id.replace(/_\d+$/, '');
            if (seen.has(base)) continue;
            seen.add(base);
            expect(cm(p), `${base} = ${cm(p).toFixed(0)}cm`).toBeLessThan(600);
        }
    });

    it('keeps the skyline towering over everything on the roof', () => {
        // The exemption above is not a licence to shrink them. They exist to
        // give the empty upper half of the frame something in it, and a
        // "skyline" no taller than the water tower does not do that.
        const tallestOnRoof = Math.max(...city.props
            .filter(p => p.plane !== 'skyline')
            .map(p => p.height));
        const shortestTower = Math.min(...city.props
            .filter(p => p.plane === 'skyline')
            .map(p => p.height));

        expect(shortestTower).toBeGreaterThan(tallestOnRoof * 0.8);
    });
});

describe('nothing floats', () => {
    it('keeps the declared horizon in step with the deck band', () => {
        const deck = city.backdrops.find(b => b.plane === 'deck');
        expect(city.horizonY).toBeCloseTo(1 - deck.heightFrac, 3);
    });

    it('stands every far-plane prop on the horizon', () => {
        // The far plane scrolls at a different rate to the deck, so any prop
        // whose baseline is off the horizon slides against the roof as the
        // camera moves — which reads as floating, not as misplaced.
        for (const p of city.props.filter(p => p.plane === 'far')) {
            expect(p.y, `${p.id} at y=${p.y}`).toBeCloseTo(city.horizonY, 2);
        }
    });

    it('anchors every deck prop to the floor rather than a screen position', () => {
        for (const p of city.props.filter(p => p.plane === 'deck')) {
            expect(p.z, `${p.id} has no depth`).not.toBeUndefined();
            expect(p.z, p.id).toBeGreaterThanOrEqual(0);
            expect(p.z, p.id).toBeLessThanOrEqual(1);
        }
    });

    it('roots every foreground prop at the bottom of the frame', () => {
        for (const p of city.props.filter(p => p.plane === 'fore')) {
            expect(p.y, p.id).toBeCloseTo(1.0, 2);
        }
    });
});
