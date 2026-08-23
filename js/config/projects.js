/**
 * Projects, surfaced as physical objects on the roof.
 *
 * Each entry is both a panel's content and a prop the player can inspect, so
 * the work sits in the world rather than behind a menu. Edit freely — the world
 * reads this file, nothing is hardcoded in the engine.
 */
export const projects = [
    {
        id: 'isometric-room',
        prop: 'laptop',
        title: 'Cozy Isometric Portfolio',
        year: '2026',
        tags: ['Canvas', 'JavaScript', 'Generative art'],
        summary: 'An interactive isometric room rendered on canvas, with a sprite engine, '
            + 'depth sorting and a fully generated art pipeline.',
        body: 'Built a small 2.5D engine from scratch: sprite sheets with clip offsets and '
            + 'ping-pong playback, depth-sorted drawing, and a manifest-driven scene so art '
            + 'and layout stay decoupled. The asset pipeline generates, cuts out, repacks and '
            + 'style-checks every sprite.',
        links: [{ label: 'Source', href: 'https://github.com/khmurakami' }]
    },
    {
        id: 'rooftop-world',
        prop: 'prototype',
        title: 'Rooftop — 2.5D side-scroller',
        year: '2026',
        tags: ['Game engine', 'Parallax', 'Web Audio'],
        summary: 'The world you are standing on. Parallax planes, global wind, procedural '
            + 'starfield and synthesised ambience.',
        body: 'Five depth planes with per-plane atmospheric haze, a slot-based world manifest '
            + 'that renders placeholders for unmade art, one global wind signal driving every '
            + 'swaying prop, and a fully procedural audio bed with no shipped audio files.',
        links: []
    },
    {
        id: 'sprite-pipeline',
        prop: 'poster',
        title: 'Generated sprite pipeline',
        year: '2026',
        tags: ['Python', 'Pillow', 'Tooling'],
        summary: 'Turning generated images into engine-ready sprite sheets: cutout, repack, '
            + 'compose, seam repair and style verification.',
        body: 'Generated art arrives with uneven frame spacing, wobbling baselines, soft edges '
            + 'and inconsistent scale. The pipeline flood-fills backgrounds from the border, '
            + 'finds real frame boundaries, normalises height across clips and verifies the '
            + 'result against a style reference so twenty assets still read as one set.',
        links: []
    }
];
