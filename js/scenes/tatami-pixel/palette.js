// Palettes: one colour ramp per material, and how each season repaints them.

import { Ramp } from './base.js?v=20261124-1101';
import { px } from './frame.js?v=20261124-1101';
import { S } from './state.js?v=20261124-1101';

// ── Palettes: one ramp per material, dark to light ────────────────────
// Cobalt summer light: shadows lean indigo, lights lean cyan-white.
const ramp = (c, band = 0.4) => new Ramp(c, { band: band * 0.45 });
const PAL = {
    sky: ramp(['#1838a8', '#1f4bc4', '#285ed8', '#3673e6', '#4f8cef', '#7caaf3', '#b4d0f6'], 0.6),
    cloud: ramp(['#6a76c6', '#97a6e4', '#c6d2f4', '#eef1fb', '#fffcf4'], 0.2),
    cirrus: ramp(['#86acf2', '#c4d8f8'], 0.5),
    mtnFar: ramp(['#7590d8', '#8aa4e2', '#a8bdee'], 0.5),
    mtnNear: ramp(['#4e72b8', '#5c82c0', '#7698cc'], 0.5),
    fieldLit: ramp(['#3f7a8e', '#4b8d92', '#64a498'], 0.5),
    fieldShade: ramp(['#2e5f86', '#376c8c', '#457c92'], 0.5),
    bank: ramp(['#9cbcd8', '#cfe0dc'], 0.5),
    leaf: ramp(['#0a1838', '#10294c', '#173f5c', '#22596a', '#3a7a74', '#68a080'], 0.3),
    flower: ramp(['#3a3a9c', '#5660c4', '#7d8ae6', '#a9b6f8', '#e0e4ff'], 0.3),
    bark: ramp(['#0e0c2c', '#1c1840', '#2e2852', '#4a3e66'], 0.3),
    houseWall: ramp(['#283a6e', '#34487e', '#4a5e92'], 0.3),
    roof: ramp(['#14205a', '#1c2c70', '#2c4290', '#5068b0'], 0.3),
    windowGlow: ramp(['#f0c070', '#ffe6b0'], 0),
    wall: ramp(['#0a0a26', '#0f0f32', '#151642', '#1c1e52', '#252a62', '#323a7a'], 0.5),
    board: ramp(['#08081e', '#100f34', '#1a1a4c', '#262862'], 0.4),
    wood: ramp(['#0c0a24', '#17133a', '#251d50', '#3e3068', '#8a6a7a'], 0.3),
    paper: ramp(['#8a90cc', '#a8acdc', '#c8c8e8', '#e6e0ee', '#fff6ec'], 0.5),
    lattice: ramp(['#14123e', '#1e1c54'], 0),
    tatami: ramp(['#0e1a38', '#142646', '#1c3252', '#26425e', '#33546a', '#466a76', '#5e8282'], 0.5),
    tatamiSun: ramp(['#7a7068', '#a08c74', '#c2a87e', '#dec494', '#f2e0b8'], 0.5),
    heri: ramp(['#08081e', '#0e0e30', '#18184a'], 0.3),
    engawa: ramp(['#16224e', '#1c2a5c', '#24366a', '#2e4278'], 0.5),
    engawaSun: ramp(['#7a5a64', '#a8786a', '#cc9a72', '#e8bc84', '#f8dca4'], 0.5),
    soffit: ramp(['#0a0c30', '#121640', '#1c2050', '#2c2c5c', '#4a3e62', '#6e566a'], 0.3),
    cream: ramp(['#4a4c88', '#6c70a8', '#9498c6', '#bcbedc', '#dedcec', '#f6f2f2'], 0.3),
    creamSun: ramp(['#94849a', '#c4b0b0', '#eadcca', '#fff4e4', '#ffffff'], 0.3),
    towel: ramp(['#1a2a6e', '#24408e', '#3458aa', '#5a7ec4', '#90aedc', '#c8d8f0', '#eef2fa'], 0.3),
    towelSun: ramp(['#34488e', '#5068aa', '#7c8ec2', '#aeb4d2', '#e2dcd4', '#fff8ec'], 0.3),
    mattress: ramp(['#3a4688', '#525ea2', '#7280bc', '#96a2d2', '#bcc4e6', '#e2e4f4'], 0.45),
    pillow: ramp(['#6a6aa8', '#9090c4', '#bab8dc', '#ddd8ec', '#f8f0ee'], 0.4),
    blanket: ramp(['#1b3884', '#284ea2', '#3a66ba', '#5684d0', '#7ea8e6', '#acc8f6'], 0.45),
    stripe: ramp(['#c8b4c8', '#ecdcdc', '#fff4ec'], 0.3),
    fan: ramp(['#a8a8d8', '#d4d0ec', '#f8f2f2'], 0.3),
    fanInk: ramp(['#d0405c', '#ee6a7a'], 0),
    alu: ramp(['#22244a', '#3e4270', '#6a7098', '#9ca2c0', '#ccd0e2', '#f2f2f8'], 0.3),
    bezel: ramp(['#08081a', '#14142c', '#24244a'], 0),
    tabby: ramp(['#3a1e2e', '#6a3434', '#a4583a', '#d48444', '#f0ae62', '#ffd896'], 0.3),
    catEye: ramp(['#0a0a1a', '#f2c84a'], 0),
    steel: ramp(['#6a6ea8', '#d8d8ee'], 0),
    radio: ramp(['#141240', '#22225a', '#343a78', '#4c5a98', '#7a8cc0'], 0.3),
    dial: ramp(['#d8a860', '#ffe0a0'], 0),
    pig: ramp(['#1c1e4c', '#2c3264', '#3e4a7c', '#567094', '#7c98a8', '#b4ccc0'], 0.35),
    ember: ramp(['#d8583c', '#ff9a64', '#ffd9a8'], 0),
    tray: ramp(['#1a0e2a', '#2e1434', '#4a1c3c', '#7a2e44', '#b45a5a'], 0.3),
    rind: ramp(['#0e3040', '#185048', '#2a6c50'], 0.3),
    pith: ramp(['#c8d8c8', '#f0f4e8'], 0),
    flesh: ramp(['#a13a58', '#cf5a74', '#ee7f94', '#ffadb8'], 0.35),
    seed: ramp(['#0b0e26'], 0),
    glass: ramp(['#3a7eb0', '#66b4d8', '#a0dcf0', '#e8faff'], 0.3),
    cap: ramp(['#c8404c', '#ee6a6a'], 0),
    shadow: ramp(['#06061e'], 0),
    culm: ramp(['#10283a', '#1c4440', '#2e6448', '#4e8a50', '#86b462', '#c2dc84'], 0.3),
    sasa: ramp(['#0c2238', '#14384a', '#1e5250', '#2e6e54', '#4a8e5a', '#80b46a'], 0.3)
};


// The hanging scroll and the books.
PAL.scrollWood = ramp(['#2a1810', '#5a3a24', '#8a5a3a'], 0.3);
PAL.mount = ramp(['#1e2a3a', '#34485e', '#4e6a82'], 0.3);
PAL.gold = ramp(['#8a6a2a', '#c8a050', '#e8c878'], 0.3);
PAL.silk = ramp(['#b8a888', '#e0d4b4', '#f4ead0'], 0.3);
PAL.ink = ramp(['#2a1c18', '#4a3428', '#6a4a38'], 0.3);
PAL.pinkB = ramp(['#d07898', '#f4a8c0', '#ffd8e4'], 0.3);
PAL.redB = ramp(['#8a1e24', '#c83a3a', '#e86a5a'], 0.3);
PAL.orangeB = ramp(['#c04a1a', '#ec7a2a', '#ffb060'], 0.3);
PAL.greenB = ramp(['#1e3a28', '#3a6a44', '#5a9a5a'], 0.3);
PAL.moonB = ramp(['#d8c890', '#f4eab8', '#fffbe0'], 0.3);
PAL.blueB = ramp(['#5a7ab0', '#8aa8d8', '#b8d0f0'], 0.3);
PAL.snowB = ramp(['#c8d0e8', '#eef2fc', '#ffffff'], 0.3);
PAL.craneGlass = ramp(['#1a2a5a', '#2e4a8a', '#5a82c4', '#a8ccf0'], 0.3);
PAL.cranePink = ramp(['#7a2a4a', '#b8486a', '#e8789a', '#ffb0c8'], 0.3);
PAL.book0 = ramp(['#6a2430', '#c04a4a', '#e8806a'], 0.3);
PAL.book1 = ramp(['#1c2c66', '#3a64b0', '#6a96dc'], 0.3);
PAL.book2 = ramp(['#7a5414', '#d8a83a', '#f0d070'], 0.3);
PAL.book3 = ramp(['#1e4a38', '#428466', '#74b08c'], 0.3);
PAL.pages = ramp(['#b8aa8e', '#e8dcc0', '#f8f0dc'], 0.3);

// ── Seasons ──────────────────────────────────────────────────────────
// The room is painted in summer. The rest of the year swaps a few ramps
// (the tree, the shrubs, the paddies, the far hills) and what is on the
// tray, takes down the thunderhead, and lets something fall past the door.
PAL.crown = PAL.leaf;
const SUMMER = { ...PAL };
const SEASON = {
    spring: {
        crown: ramp(['#3a1e44', '#6a3a66', '#a8608a', '#d890b0', '#f4bcd0', '#ffe4ee'], 0.3),
        leaf: ramp(['#0c2236', '#143c48', '#1e5a52', '#2e7656', '#4e945e', '#7ab47a'], 0.3),
        fieldLit: ramp(['#6a8ec8', '#88a8d8', '#a8c4e6'], 0.5), fieldShade: ramp(['#5476b4', '#6a8cc4', '#86a4d4'], 0.5),
        bank: ramp(['#4e8a50', '#86b462'], 0.5)
    },
    autumn: {
        crown: ramp(['#2a0e2a', '#5a1a34', '#9a2e3a', '#d0503a', '#f08a44', '#ffc46a'], 0.3),
        leaf: ramp(['#141a34', '#2e2a3c', '#5a3a3e', '#8a5a40', '#b88a4a', '#e0b866'], 0.3),
        fieldLit: ramp(['#9a7a3a', '#c09a48', '#dcbc64'], 0.5), fieldShade: ramp(['#7a6034', '#9a7a3e', '#b8964e'], 0.5),
        bank: ramp(['#c8b07a', '#eadcae'], 0.5)
    },
    winter: {
        crown: ramp(['#0a1838', '#10294c', '#173f5c', '#2e5468', '#d8e4f4', '#ffffff'], 0.3),
        leaf: ramp(['#0a1838', '#10294c', '#173f5c', '#2e5468', '#cfdcf0', '#f6f9ff'], 0.3),
        fieldLit: ramp(['#c8d4ec', '#dde6f6', '#f0f4fc'], 0.5), fieldShade: ramp(['#aab8d8', '#c0cce6', '#d4ddf0'], 0.5),
        bank: ramp(['#ffffff', '#ffffff'], 0.5),
        mtnFar: ramp(['#a8b8e0', '#c0ceec', '#dfe7f8'], 0.5), mtnNear: ramp(['#6a86c0', '#8aa2d0', '#c4d2ec'], 0.5)
    }
};
const CAPTION = { spring: 'soft spring days', summer: 'lazy summer days', autumn: 'slow autumn days', winter: 'quiet winter days' };
PAL.kaki = ramp(['#4a1414', '#94301e', '#d0521e', '#f0803a', '#ffb070'], 0.3);
PAL.mikan = ramp(['#6a2a1a', '#c0581e', '#ec8a2a', '#ffb850', '#ffe0a0'], 0.3);
PAL.calyx = ramp(['#183020', '#2e5a34', '#4e8a50'], 0);
PAL.dango = ramp(['#a85a7a', '#e890b0', '#ffd0e0'], 0.3);
PAL.mochi = ramp(['#a8a0b8', '#e6e0ec', '#ffffff'], 0.3);
PAL.yomogi = ramp(['#3a6a3a', '#7aac5e', '#bce09a'], 0.3);
PAL.stick = ramp(['#7a5a3a', '#c8a070'], 0);
PAL.cup = ramp(['#1e2c40', '#3a5a64', '#6a8e86', '#a0c0a4', '#d4e8cc'], 0.3);
PAL.tea = ramp(['#4a6a2a', '#8aa848'], 0);
SUMMER.kaki = PAL.kaki;

/** Set the ramps for the season, before anything is baked. */
function dress(season) {
    Object.assign(PAL, SUMMER, SEASON[season] || {});
    // Out of summer the hydrangeas have no heads: their flowers are leaves.
    if (season !== 'summer') PAL.flower = PAL.leaf;
}

/** What falls past the door: petals, maple leaves or snow. */
function falling(o, t, w) {
    const kind = S.season;
    if (kind === 'summer') return;
    const n = kind === 'winter' ? 70 : 26, span = S.xR - S.xL + 40, top = S.yEave - 10, h = S.yEngawa - top + 10;
    const C = { spring: ['#ffd0e0', '#f4a0c0', '#ffe8f0'], autumn: ['#e0603a', '#f0a040', '#c03a3a', '#e8c050'], winter: ['#ffffff', '#e4ecff', '#c8d4f4'] }[kind];
    for (let i = 0; i < n; i++) {
        const a = (i * 0.61803) % 1, b = (i * 0.7548) % 1, sp = kind === 'winter' ? 6 + b * 6 : 9 + b * 8;
        const y = top + (((t * sp + a * h * 3) % h) + h) % h;
        const drift = kind === 'winter' ? 3 : 10;
        const x = S.xL - 20 + ((a * span + t * (2 + w * 12) + (S.fallPush || 0) + Math.sin(t * 0.9 + i) * drift) % span + span) % span;
        const c = C[i % C.length];
        if (kind === 'winter') { px(o, x, y, c); if (i % 5 === 0) px(o, x + 1, y, c); continue; }
        // Petals and leaves tumble: two pixels, turning.
        const flip = Math.sin(t * (3 + b * 3) + i) > 0;
        px(o, x, y, c);
        px(o, x + (flip ? 1 : 0), y + (flip ? 0 : 1), c);
        if (kind === 'autumn' && i % 3 === 0) px(o, x - 1, y, c);
    }
}

export { CAPTION, PAL, SEASON, SUMMER, dress, falling, ramp };
