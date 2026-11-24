// The camera, in art pixels, and cropping a sprite canvas to what it drew.

import { Pixel, Sprite } from './base.js?v=20261124-1119';
import { A } from './state.js?v=20261124-1119';

// ── Camera, in art pixels ─────────────────────────────────────────────
// As tatami-world's, on the art's own size, shifted by the margin M that
// every layer carries so looking around never shows an edge.
// The shot: sitting low on the mats at the foot of the futon, a little
// left of the room's middle, with the lens shifted so the vanishing point
// falls on a third and the futon runs out of the frame in the foreground.
const SHOT = {
    wide: { f: 0.62, eye: 0.58, camX: -0.2, camH: 0.62, vx: 0.33 },
    tall: { f: 1.0, eye: 0.46, camX: -0.5, camH: 0.62, vx: 0.4 }
};
function makeCamera(W, H, M) {
    const portrait = H > W * 1.05, s = portrait ? SHOT.tall : SHOT.wide;
    const f = portrait ? H * 0.75 * s.f : Math.max(W * s.f, H * 1.1);
    const ye = H * s.eye + M, cx = W * s.vx + M, { camX, camH } = s;
    const p = (x, y, z) => ({ x: cx + ((x - camX) * f) / z, y: ye - ((y - camH) * f) / z });
    return { f, ye, cx, camX, camH, portrait, p };
}

/** A painted sprite cropped to its pixels: { canvas, x, y, w, h } in layer pixels. */
function crop(canvas) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let k = 0; k < w * h; k++) if (d[k * 4 + 3]) { const x = k % w, y = (k - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    const c = Pixel.layer(x1 - x0 + 1, y1 - y0 + 1);
    c.g.drawImage(canvas, -x0, -y0);
    return { canvas: c.canvas, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const sprite = () => new Sprite(A.LW, A.LH);

export { SHOT, crop, makeCamera, sprite };
