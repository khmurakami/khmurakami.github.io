import { describe, it, expect } from 'vitest';
import { city } from '../js/config/city.js';

/**
 * What the frame actually contains, at every point along the roof.
 *
 * These are the failures that no single manifest entry looks wrong for. A prop
 * has a sensible x, a sensible height and a real image, and is still never
 * drawn — because on a parallax plane the x you write is not the x it appears
 * at, and a slow plane only ever sweeps a fraction of the world past the
 * window. Three far props were authored at deck-like coordinates and could not
 * be seen at any window size or scroll position.
 *
 * The other failure is emptiness. The upper half of the frame measured 48% void
 * with the `sky` and `skyline` planes carrying zero props between them, while
 * the deck carried sixty-four. Nothing was broken; there was simply nothing up
 * there, and no test could tell.
 */

/** Widths worth caring about: laptop, common desktop, large desktop. */
const VIEWPORTS = [1366, 1600, 1920];

const REF = city.referenceHeight;
const parallaxOf = (id) => city.planes.find(p => p.id === id).parallax;

/** Top of a prop as a fraction of viewport height. 0 is the top of the screen. */
const topFracOf = (p) => p.y - p.height / REF;

/** Props that are drawn against the sky rather than standing on the floor. */
const backdropProps = city.props.filter(p => p.plane !== 'deck' && p.plane !== 'fore');

describe('everything declared is actually drawn', () => {
    it.each(VIEWPORTS)('shows every parallax prop somewhere, at %ipx wide', (vw) => {
        const maxScroll = Math.max(0, city.width - vw);

        for (const p of city.props) {
            if (p.plane === 'deck' || p.repeat) continue;
            const parallax = parallaxOf(p.plane);

            // Screen x sweeps from `x` down to `x - parallax * maxScroll`.
            const right = p.x;
            const left = p.x - parallax * maxScroll;

            // Generous margins: a wide prop is still on screen when its anchor
            // is a little outside. The failure this catches is not marginal.
            const seen = right > -300 && left < vw + 300;
            expect(seen, `${p.id} (${p.plane}, x=${p.x}) is never on screen`).toBe(true);
        }
    });

    it('keeps each plane inside the x band its parallax can reach', () => {
        // The usable band is [0, viewportWidth + parallax * maxScroll]. Stated
        // as a rule so the next person placing a skyline prop has a number
        // rather than having to rediscover it.
        const vw = Math.min(...VIEWPORTS);
        const maxScroll = city.width - vw;

        for (const plane of city.planes) {
            if (plane.id === 'deck' || plane.id === 'fore') continue;
            const limit = vw + plane.parallax * maxScroll;

            for (const p of city.props.filter(q => q.plane === plane.id && !q.repeat)) {
                expect(p.x, `${p.id} is beyond what ${plane.id} can sweep`)
                    .toBeLessThanOrEqual(limit + 300);
            }
        }
    });
});

describe('the sky is not empty', () => {
    it('puts props on every plane, not just the floor', () => {
        // `sky` and `skyline` were declared, hazed, parallaxed — and carried
        // nothing at all.
        for (const plane of city.planes) {
            const n = city.props.filter(p => p.plane === plane.id).length;
            expect(n, `plane '${plane.id}' has no props`).toBeGreaterThan(0);
        }
    });

    it('reaches the top third of the frame somewhere on every plane above the deck', () => {
        for (const id of ['sky', 'skyline']) {
            const highest = Math.min(
                ...city.props.filter(p => p.plane === id).map(topFracOf)
            );
            expect(highest, `nothing on '${id}' reaches the upper frame`).toBeLessThan(0.34);
        }
    });

    it('has something in the upper half of the frame from anywhere on the roof', () => {
        // The real test. Walk the camera across the world and ask what is above
        // the midline. A world can have tall things and still show a bare sky
        // for a third of its length if they are all bunched together.
        const vw = 1600;
        const maxScroll = city.width - vw;
        const bare = [];

        for (let scroll = 0; scroll <= maxScroll; scroll += 100) {
            const filled = backdropProps.some(p => {
                if (topFracOf(p) > 0.5) return false;
                const parallax = parallaxOf(p.plane);
                if (p.repeat) return true;   // tiles across the whole view
                const sx = p.x - parallax * scroll;
                return sx > -220 && sx < vw + 220;
            });
            if (!filled) bare.push(scroll);
        }

        expect(bare, `bare sky at ${bare.length} camera positions, e.g. ${bare.slice(0, 6)}`)
            .toHaveLength(0);
    });
});

describe('deck props do not pretend to have a y', () => {
    it('is documented that y is ignored on the floor plane', () => {
        // `World.drawProps` takes the baseline from groundYFor(z) on the floor
        // plane and ignores `y` entirely. Several deck props carry a y that
        // reads like a deliberate height (the bulb strings say 0.535) and has
        // no effect whatever. This pins the behaviour so the next person to
        // "fix" a hanging prop by editing its y finds out here instead.
        const hanging = city.props.filter(p => p.plane === 'deck' && p.y !== city.groundLine);
        for (const p of hanging) {
            expect(p.z, `${p.id} sets y=${p.y}, which the floor plane ignores`)
                .toBeDefined();
        }
    });
});
