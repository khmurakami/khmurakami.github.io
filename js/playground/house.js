// The house, as data, measured in mats. One unit (u) is half a ken: 0.91 m,
// the short side of a tatami. A mat is 1 x 2 u. North is up (smaller y).
//
// Each room is a work; a room without a work is drawn as planned. To add a work,
// give a planned room its `work` id (see works.js) and a revision date.

export const U = 0.91; // metres per unit

// Mat layouts, as [x, y, w, h] in u, laid so that four corners never meet.
const LAYOUTS = {
    4.5: [[0, 0, 2, 1], [2, 0, 1, 2], [1, 2, 2, 1], [0, 1, 1, 2], [1, 1, 1, 1]],
    6: [[0, 0, 1, 2], [1, 0, 2, 1], [3, 0, 1, 2], [1, 1, 2, 1], [0, 2, 2, 1], [2, 2, 2, 1]],
    8: [[0, 0, 2, 1], [2, 0, 2, 1], [0, 1, 1, 2], [3, 1, 1, 2], [1, 1, 2, 1], [1, 2, 2, 1], [0, 3, 2, 1], [2, 3, 2, 1]]
};

/** The mats of a room, turned a quarter if the room is taller than its layout. */
export function matsOf(room) {
    const base = LAYOUTS[room.mats];
    const wide = base.reduce((m, [x, , w]) => Math.max(m, x + w), 0);
    const turn = room.w !== wide;
    return base.map(([x, y, w, h]) => (turn ? [y, x, h, w] : [x, y, w, h])).map(([x, y, w, h]) => [room.x + x, room.y + y, w, h]);
}

export const HOUSE = {
    w: 10, h: 6, // the house, without the garden
    rooms: [
        {
            id: 'west', name: 'Room B', mats: 6, x: 0, y: 1, w: 3, h: 4, rev: 'B'
        },
        {
            id: 'tatami-room', name: 'Tatami Room', mats: 8, x: 3, y: 1, w: 4, h: 4, work: 'tatami-room', rev: 'A',
            // What's in the room, as plan symbols, matching the pixel room.
            things: [
                { kind: 'futon', x: 5.15, y: 2.05, w: 1.15, h: 2.2 },
                { kind: 'laptop', x: 5.35, y: 3.05, w: 0.55, h: 0.4 },
                { kind: 'tray', x: 4.1, y: 4.25, w: 0.8, h: 0.5 },
                { kind: 'radio', x: 3.25, y: 1.3, w: 0.5, h: 0.3 },
                { kind: 'books', x: 3.3, y: 3.2, w: 0.4, h: 0.55 },
                { kind: 'crane', x: 4.05, y: 3.35, w: 0.42, h: 0.42 },
                { kind: 'cat', x: 3.75, y: 5.5, r: 0.3 }
            ]
        },
        {
            id: 'east', name: 'Room C', mats: 4.5, x: 7, y: 2, w: 3, h: 3, rev: 'C'
        }
    ],
    closet: { x: 7, y: 1, w: 3, h: 1 },     // oshiire: a cupboard for futons
    corridor: { x: 0, y: 0, w: 10, h: 1 }, // the inside corridor, along the north
    engawa: { x: 0, y: 5, w: 10, h: 1 },   // the veranda, along the south, open to the garden
    entry: { x: 0, y: 0.5 },               // where you come in: the west end of the corridor
    garden: [
        { kind: 'stone', x: 2.2, y: 6.9, r: 0.28 }, { kind: 'stone', x: 3.1, y: 7.35, r: 0.24 }, { kind: 'stone', x: 4.0, y: 7.1, r: 0.3 },
        { kind: 'stone', x: 4.9, y: 7.55, r: 0.22 }, { kind: 'tree', x: 8.4, y: 7.4, r: 0.95 }, { kind: 'lantern', x: 6.6, y: 7.0, r: 0.22 },
        { kind: 'tree', x: 0.7, y: 7.6, r: 0.6 }
    ]
};

export const WALL_H = 2.6; // wall height in u (2.4 m), for when a room stands up
