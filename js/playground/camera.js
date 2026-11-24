// One camera for the whole drawing: where it looks (x, y in u), how close
// (zoom), how far it has tipped from straight down (pitch) and turned (yaw).
// Every value runs on a spring, so the drawing moves with weight and settles.

export class Spring {
    constructor(v, stiffness = 120, damping = 20) { this.v = v; this.to = v; this.vel = 0; this.k = stiffness; this.d = damping; }
    set(v) { this.v = this.to = v; this.vel = 0; }
    step(dt) {
        this.vel += ((this.to - this.v) * this.k - this.vel * this.d) * dt;
        this.v += this.vel * dt;
        return Math.abs(this.to - this.v) > 1e-4 || Math.abs(this.vel) > 1e-4;
    }
}

export class Camera {
    constructor() {
        this.x = new Spring(5, 90, 19);
        this.y = new Spring(3.5, 90, 19);
        this.zoom = new Spring(1, 90, 19);
        this.pitch = new Spring(0, 70, 15);   // radians; 0 is a printed plan
        this.yaw = new Spring(0, 70, 15);
        this.base = 0;                        // a quarter turn on portrait screens
        this.ppu = 60;                        // screen pixels per u at zoom 1
        this.w = 1; this.h = 1; this.cx = 0.5; this.cy = 0.5;
    }
    springs() { return [this.x, this.y, this.zoom, this.pitch, this.yaw]; }
    step(dt) { let moving = false; for (const s of this.springs()) moving = s.step(dt) || moving; return moving; }

    /** World (x, y on the floor, z up, all in u) to screen pixels. */
    project(x, y, z = 0) {
        const a = this.base + this.yaw.v, s = this.ppu * this.zoom.v;
        let dx = x - this.x.v, dy = y - this.y.v;
        const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
        const p = this.pitch.v;
        return [this.w * this.cx + rx * s, this.h * this.cy + (ry * Math.cos(p) - z * Math.sin(p)) * s];
    }
    /** Screen pixels back to the floor (z = 0). */
    unproject(sx, sy) {
        const a = this.base + this.yaw.v, s = this.ppu * this.zoom.v;
        const rx = (sx - this.w * this.cx) / s, ry = (sy - this.h * this.cy) / s / Math.max(0.2, Math.cos(this.pitch.v));
        return [this.x.v + rx * Math.cos(-a) - ry * Math.sin(-a), this.y.v + rx * Math.sin(-a) + ry * Math.cos(-a)];
    }
    /** How far in front (toward the viewer) a point is, for drawing back to front. */
    depth(x, y, z = 0) {
        const a = this.base + this.yaw.v, dx = x - this.x.v, dy = y - this.y.v;
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        return ry * Math.sin(this.pitch.v) + z * Math.cos(this.pitch.v);
    }
}
