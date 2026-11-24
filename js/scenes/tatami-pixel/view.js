// Where you are looking from, -1..1: the mouse on a computer, the tilt on a phone.

import { clamp, query } from './base.js?v=20261124-1123';

// Where your head is, -1..1: from the mouse, or from the phone's tilt; see frame().
const view = { x: 0, y: 0, tx: 0, ty: 0, tilt: false, ox: 0, oy: 0, gx: 0, gy: 0, base: null };
if (query.has('look')) {
    const [x, y] = query.get('look').split(',').map(Number);
    view.x = view.tx = view.ox = x || 0; view.y = view.ty = view.oy = y || 0;
}
const aim = () => { view.tx = clamp(view.ox + view.gx, -1, 1); view.ty = clamp(view.oy + view.gy, -1, 1); };
// A finger doesn't move the room: the picture stays put under it, so a tap
// lands where it was aimed and a swipe only sends wind. The mouse looks.
addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && !view.tilt) {
        view.tx = (e.clientX / innerWidth) * 2 - 1;
        view.ty = (e.clientY / innerHeight) * 2 - 1;
    }
});
// Tilt counts from however the phone is being held, which it slowly settles back to,
// and turns with the screen when the phone is on its side.
addEventListener('deviceorientation', e => {
    if (e.gamma == null || e.beta == null) return;
    const turn = (window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
    const sx = turn === 90 ? e.beta : turn === -90 || turn === 270 ? -e.beta : e.gamma;
    const sy = turn === 90 ? -e.gamma : turn === -90 || turn === 270 ? e.gamma : e.beta;
    if (!view.base || view.base.turn !== turn) view.base = { x: sx, y: sy, turn };
    view.base.x += (sx - view.base.x) * 0.003; view.base.y += (sy - view.base.y) * 0.003;
    view.tilt = true;
    view.gx = clamp((sx - view.base.x) / 20, -1, 1);
    view.gy = clamp((sy - view.base.y) / 20, -1, 1);
    aim();
});


function stepView(dt) {
    const k = 1 - Math.exp(-dt * 3);
    view.x += (view.tx - view.x) * k;
    view.y += (view.ty - view.y) * k;
}

export { aim, stepView, view };
