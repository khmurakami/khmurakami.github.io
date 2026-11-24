// One camera for the whole drawing: where it looks (x, y in u), how close
// (zoom), how far it has tipped from straight down (pitch) and turned (yaw).
//
// The camera never bounces: it glides, easing in and out over a set time, and
// only when the visitor asks it to. (The paper walls get the springs.)

const smooth = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A value that glides to a target over a given time. */
export class Glide {
    constructor(v) { this.v = v; this.from = v; this.to = v; this.t0 = 0; this.dur = 0; }
    set(v) { this.v = this.from = this.to = v; this.dur = 0; }
    go(to, ms, now = performance.now(), ease = smooth) { this.from = this.v; this.to = to; this.t0 = now; this.dur = ms; this.ease = ease; }
    step(now) {
        if (!this.dur) return false;
        const k = Math.min(1, (now - this.t0) / this.dur);
        this.v = this.from + (this.to - this.from) * this.ease(k);
        if (k >= 1) { this.dur = 0; this.v = this.to; return false; }
        return true;
    }
}

/** A spring, for paper: a little give and a soft settle. */
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
        this.x = new Glide(5); this.y = new Glide(3.5); this.zoom = new Glide(1);
        this.pitch = new Glide(0); this.yaw = new Glide(0);   // radians; pitch 0 is a printed plan
        this.base = 0;                                        // a quarter turn on portrait screens
        this.ppu = 60;                                        // screen pixels per u at zoom 1
        this.w = 1; this.h = 1; this.cx = 0.5; this.cy = 0.5;
    }
    parts() { return { x: this.x, y: this.y, zoom: this.zoom, pitch: this.pitch, yaw: this.yaw }; }
    step(now) { let moving = false; for (const g of Object.values(this.parts())) moving = g.step(now) || moving; return moving; }
    /** Glide several values together, e.g. glide({ x: 3, zoom: 2 }, 1200). */
    glide(to, ms, ease) { const now = performance.now(); for (const [k, v] of Object.entries(to)) this[k].go(v, ms, now, ease); }
    jump(to) { for (const [k, v] of Object.entries(to)) this[k].set(v); }
    get moving() { return Object.values(this.parts()).some(g => g.dur); }

    /** World (x, y on the floor, z up, all in u) to screen pixels. */
    project(x, y, z = 0) {
        const a = this.base + this.yaw.v, s = this.ppu * this.zoom.v;
        const dx = x - this.x.v, dy = y - this.y.v;
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
        return (dx * Math.sin(a) + dy * Math.cos(a)) * Math.sin(this.pitch.v) + z * Math.cos(this.pitch.v);
    }
}
