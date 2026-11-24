// One camera for the whole house. It looks at a target point (x, y on the
// floor, z up, in u) from a distance, tipped from straight down by `pitch`
// and turned by `yaw`. Far away (the default) it reads as a flat printed
// plan; brought close, it's a person standing in the corridor. Because the
// zoom holds the target's scale while the distance changes, moving between
// the two is one continuous shot, like a dolly zoom.
//
// The camera never bounces: it glides, easing in and out over a set time, and
// only when the visitor asks it to. (The paper walls get the springs.)

const smooth = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const FAR = Math.log(400);   // the plan view's distance, as a log

/** A value that glides to a target over a given time. */
export class Glide {
    constructor(v) { this.v = v; this.from = v; this.to = v; this.t0 = 0; this.dur = 0; }
    set(v) { this.v = this.from = this.to = v; this.dur = 0; }
    go(to, ms, now = performance.now(), ease = smooth) { this.from = this.v; this.to = to; this.t0 = now; this.dur = Math.max(1, ms); this.ease = ease; }
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
        this.x = new Glide(5); this.y = new Glide(3.5); this.z = new Glide(0);
        this.zoom = new Glide(1);
        this.pitch = new Glide(0); this.yaw = new Glide(0);   // radians; pitch 0 looks straight down
        this.dist = new Glide(FAR);                           // log of the distance to the target
        this.cy = new Glide(0.5);                             // where the target sits on screen, top to bottom
        this.base = 0;                                        // a quarter turn on portrait screens
        this.ppu = 60;                                        // screen pixels per u at the target, at zoom 1
        this.w = 1; this.h = 1; this.cx = 0.5;
    }
    parts() { return { x: this.x, y: this.y, z: this.z, zoom: this.zoom, pitch: this.pitch, yaw: this.yaw, dist: this.dist, cy: this.cy }; }
    step(now) {
        let moving = false;
        if (this.shot) moving = this.shot.step(now, this);
        else for (const g of Object.values(this.parts())) moving = g.step(now) || moving;
        this.frame();
        return moving;
    }
    /**
     * Play one continuous shot through a list of keyframes, [{ t: ms, pose }],
     * the first at t = 0. The camera passes through every pose on smooth curves:
     * it only comes to rest where two keyframes hold the same pose (a deliberate
     * pause), and at the very end.
     */
    play(keys, done) { this.shot = new Shot(keys, performance.now(), () => { this.shot = null; if (done) done(); }); }
    stop() { this.shot = null; }
    /** Glide several values together, e.g. glide({ x: 3, zoom: 2 }, 1200). */
    glide(to, ms, ease) { const now = performance.now(); for (const [k, v] of Object.entries(to)) this[k].go(v, ms, now, ease); }
    jump(to) { for (const [k, v] of Object.entries(to)) this[k].set(v); this.frame(); }

    /** Work out the camera's position and axes for this frame. */
    frame() {
        const a = this.base + this.yaw.v, el = Math.PI / 2 - this.pitch.v;   // el: how far below the horizon it looks
        const hx = -Math.sin(a), hy = -Math.cos(a);                          // the way it faces, on the floor
        const F = [Math.cos(el) * hx, Math.cos(el) * hy, -Math.sin(el)];
        const R = [-hy, hx, 0];
        const Up = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
        const D = Math.exp(this.dist.v);
        this.F = F; this.R = R; this.U = Up; this.D = D;
        this.C = [this.x.v - F[0] * D, this.y.v - F[1] * D, this.z.v - F[2] * D];
        this.f = this.ppu * this.zoom.v * D;                                  // focal length, in pixels
        this.scale = this.ppu * this.zoom.v;
    }
    /** How close the camera is to standing in the house: 0 far above, 1 at eye level. */
    get near() { return Math.max(0, Math.min(1, (FAR - this.dist.v) / (FAR - Math.log(1.2)))); }

    /** World (x, y on the floor, z up, all in u) to screen pixels; null if it's behind the camera. */
    project(x, y, z = 0) {
        if (!this.F) this.frame();
        const v = [x - this.C[0], y - this.C[1], z - this.C[2]];
        const cz = v[0] * this.F[0] + v[1] * this.F[1] + v[2] * this.F[2];
        if (cz < 0.04) return null;
        const k = this.f / cz;
        return [this.w * this.cx + (v[0] * this.R[0] + v[1] * this.R[1]) * k, this.h * this.cy.v - (v[0] * this.U[0] + v[1] * this.U[1] + v[2] * this.U[2]) * k];
    }
    /** Screen pixels back to the floor (z = 0). */
    unproject(sx, sy) {
        if (!this.F) this.frame();
        const px = (sx - this.w * this.cx) / this.f, py = -(sy - this.h * this.cy.v) / this.f;
        const d = [this.F[0] + this.R[0] * px + this.U[0] * py, this.F[1] + this.R[1] * px + this.U[1] * py, this.F[2] + this.R[2] * px + this.U[2] * py];
        const t = d[2] < -1e-6 ? -this.C[2] / d[2] : 1e6;
        return [this.C[0] + d[0] * t, this.C[1] + d[1] * t];
    }
    /** How near the viewer a point is, for drawing back to front (bigger is nearer). */
    depth(x, y, z = 0) {
        if (!this.F) this.frame();
        return -((x - this.C[0]) * this.F[0] + (y - this.C[1]) * this.F[1] + (z - this.C[2]) * this.F[2]);
    }
}

/**
 * A shot: every camera value follows a smooth, monotone curve through its
 * keyframes (never overshooting, so nothing wobbles), starting and ending at
 * rest. One clock drives it all, so moving, turning and tipping stay together.
 */
class Shot {
    constructor(keys, t0, done) {
        this.keys = keys; this.t0 = t0; this.done = done;
        this.names = Object.keys(keys[0].pose);
        this.slopes = {};
        for (const n of this.names) {
            const t = keys.map(k => k.t), y = keys.map(k => k.pose[n]);
            const d = y.slice(1).map((v, i) => (v - y[i]) / Math.max(1, t[i + 1] - t[i]));
            // Weighted harmonic mean of the neighbouring slopes: smooth, and flat wherever the path turns or rests.
            this.slopes[n] = y.map((_, i) => (i === 0 || i === y.length - 1 || d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])));
        }
    }
    at(t, n) {
        const k = this.keys;
        let i = 0;
        while (i < k.length - 2 && t > k[i + 1].t) i++;
        const h = k[i + 1].t - k[i].t, s = Math.max(0, Math.min(1, (t - k[i].t) / h));
        const y0 = k[i].pose[n], y1 = k[i + 1].pose[n], m0 = this.slopes[n][i] * h, m1 = this.slopes[n][i + 1] * h;
        const s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * m1;
    }
    step(now, cam) {
        const t = now - this.t0, end = this.keys[this.keys.length - 1].t;
        for (const n of this.names) cam[n].set(t >= end ? this.keys[this.keys.length - 1].pose[n] : this.at(t, n));
        if (t >= end) { this.done(); return false; }
        return true;
    }
}
