/**
 * Ambient life: things that happen on their own schedule.
 *
 * A world where everything either loops or waits for the player reads as a
 * diorama. These events run on timers the player never sees start, so the roof
 * feels observed rather than staged — a plane crosses whether or not anyone is
 * watching, and windows go dark in buildings nobody will ever enter.
 *
 * All of it is drawn, not painted: a plane baked into the skyline cannot cross,
 * and a lit window baked into the art cannot go out.
 */

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Ambient {
    constructor({ worldWidth, seed = 909, planeEvery = 38, windowCount = 90 } = {}) {
        this.worldWidth = worldWidth;
        this.planeEvery = planeEvery;
        this.t = 0;

        const rand = rng(seed);

        // A slow aircraft crossing the sky. Starts part-way through its first
        // pass so the player is not greeted by an empty sky.
        this.plane = {
            active: true,
            progress: 0.35,
            duration: 26,
            y: 0.16 + rand() * 0.12,
            dir: 1,
            cooldown: 0
        };

        // Skyline windows that switch on and off over the evening. Positions are
        // seeded so they sit in plausible grid rows rather than scattered.
        this.windows = Array.from({ length: windowCount }, () => ({
            x: rand() * worldWidth,
            y: 0.34 + Math.pow(rand(), 1.4) * 0.30,
            w: 2 + rand() * 3,
            h: 3 + rand() * 4,
            warm: rand() < 0.72,
            on: rand() < 0.6,
            // Each window keeps its own clock, so they never switch together.
            next: 6 + rand() * 50,
            // A few are televisions: cold and restless rather than steady.
            tv: rand() < 0.16
        }));

        this.birds = [];

        /**
         * A meteor, very occasionally.
         *
         * Everything else up there is a loop — the plane crosses, the windows
         * toggle, the steam rises — and a loop stops being noticed once you
         * have seen its period. This is the one thing in the sky that is rare
         * enough to feel like it happened *while you were looking*, which is
         * worth more to a night scene than another moving object.
         *
         * Long odds on purpose. Seeing one twice in a minute would spend it.
         */
        this.meteor = null;
        this.meteorCooldown = 25 + rand() * 70;
    }

    /** Fires a meteor now. Exposed for testing and for a debug key. */
    launchMeteor(rand = Math.random) {
        const fromLeft = rand() < 0.5;
        this.meteor = {
            progress: 0,
            duration: 0.75 + rand() * 0.6,
            x0: fromLeft ? -0.05 : 1.05,
            x1: fromLeft ? 0.55 + rand() * 0.5 : -0.05 + rand() * 0.5,
            y0: 0.04 + rand() * 0.10,
            y1: 0.30 + rand() * 0.22,
            len: 60 + rand() * 70
        };
        return this.meteor;
    }

    /** Sends a flock up from a world position — used when the player nears the coop. */
    startle(worldX, count = 7, seed = 5) {
        const rand = rng(seed + Math.floor(worldX));
        for (let i = 0; i < count; i++) {
            this.birds.push({
                x: worldX + (rand() - 0.5) * 60,
                y: 0.78,
                vx: (0.4 + rand() * 1.1) * (rand() < 0.5 ? -1 : 1),
                vy: -(0.35 + rand() * 0.5),
                phase: rand() * Math.PI * 2,
                life: 0,
                ttl: 4 + rand() * 2
            });
        }
    }

    update(dt) {
        this.t += dt;

        // ── Plane ──
        const p = this.plane;
        if (p.active) {
            p.progress += dt / p.duration;
            if (p.progress >= 1.15) {
                p.active = false;
                p.cooldown = this.planeEvery * (0.6 + Math.random() * 0.8);
            }
        } else {
            p.cooldown -= dt;
            if (p.cooldown <= 0) {
                p.active = true;
                p.progress = -0.15;
                p.dir = Math.random() < 0.5 ? 1 : -1;
                p.y = 0.12 + Math.random() * 0.16;
                p.duration = 22 + Math.random() * 14;
            }
        }

        // ── Windows ──
        for (const w of this.windows) {
            w.next -= dt;
            if (w.next <= 0) {
                w.on = !w.on;
                // Turning on is rarer than turning off as the night goes on.
                w.next = (w.on ? 25 : 12) + Math.random() * 60;
            }
        }

        // ── Meteor ──
        if (this.meteor) {
            this.meteor.progress += dt / this.meteor.duration;
            if (this.meteor.progress >= 1) {
                this.meteor = null;
                this.meteorCooldown = 25 + Math.random() * 70;
            }
        } else {
            this.meteorCooldown -= dt;
            if (this.meteorCooldown <= 0) this.launchMeteor();
        }

        // ── Birds ──
        for (const b of this.birds) {
            b.life += dt;
            b.x += b.vx * 90 * dt;
            b.y += b.vy * 0.08 * dt;
            b.vy = Math.min(b.vy + dt * 0.12, -0.05);  // level out as they climb
        }
        this.birds = this.birds.filter(b => b.life < b.ttl);
    }

    /** Windows and the plane sit on the skyline plane, behind the rooftop. */
    drawSkyline(ctx, camera, viewW, viewH, parallax) {
        const dy = camera.lookY ? camera.lookY * parallax : 0;

        ctx.save();
        for (const w of this.windows) {
            if (!w.on) continue;
            const x = w.x - camera.x * parallax;
            if (x < -6 || x > viewW + 6) continue;

            // Televisions flicker cold; ordinary windows hold steady warm.
            let alpha = 0.75;
            let color = w.warm ? '255,203,130' : '150,200,255';
            if (w.tv) {
                alpha = 0.45 + 0.4 * Math.abs(Math.sin(this.t * 6.3 + w.x));
                color = '130,180,255';
            }
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgba(${color},1)`;
            ctx.fillRect(x, w.y * viewH + dy, w.w, w.h);
        }
        ctx.restore();
    }

    /**
     * The meteor. Screen-space, not world-space.
     *
     * It is at an effectively infinite distance, so it does not parallax with
     * the roof at all — anchoring it to a world x would make it drift as the
     * camera pans, which reads as a bug in the sky.
     */
    drawMeteor(ctx, viewW, viewH) {
        const m = this.meteor;
        if (!m) return;

        const t = m.progress;
        // Fades in over the first fifth and out over the rest.
        const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        if (a <= 0) return;

        const x = (m.x0 + (m.x1 - m.x0) * t) * viewW;
        const y = (m.y0 + (m.y1 - m.y0) * t) * viewH;
        const dx = (m.x1 - m.x0) * viewW;
        const dy = (m.y1 - m.y0) * viewH;
        const d = Math.hypot(dx, dy) || 1;

        ctx.save();
        const grad = ctx.createLinearGradient(x, y, x - (dx / d) * m.len, y - (dy / d) * m.len);
        grad.addColorStop(0, `rgba(255,246,224,${0.9 * a})`);
        grad.addColorStop(1, 'rgba(255,246,224,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (dx / d) * m.len, y - (dy / d) * m.len);
        ctx.stroke();
        ctx.restore();
    }

    /** The aircraft, drawn on the sky plane. */
    drawPlane(ctx, camera, viewW, viewH, parallax) {
        const p = this.plane;
        if (!p.active) return;

        const dy = camera.lookY ? camera.lookY * parallax : 0;
        const t = Math.max(0, Math.min(1, p.progress));
        const x = p.dir > 0 ? t * (viewW + 120) - 60 : (1 - t) * (viewW + 120) - 60;
        const y = p.y * viewH + dy;

        ctx.save();
        // Body: too far to resolve, so a dim dash rather than an aircraft shape.
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#cfd8f5';
        ctx.fillRect(x - 3, y, 6, 1.6);

        // Strobe. Real aircraft blink about once a second.
        const blink = Math.sin(this.t * 6.2) > 0.75;
        if (blink) {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = p.dir > 0 ? '#ff6b6b' : '#8fffa8';
            ctx.beginPath();
            ctx.arc(x + (p.dir > 0 ? 4 : -4), y, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /** Startled birds, drawn on the deck plane. */
    drawBirds(ctx, camera, viewW, viewH, parallax) {
        if (!this.birds.length) return;
        const dy = camera.lookY ? camera.lookY * parallax : 0;

        ctx.save();
        ctx.strokeStyle = 'rgba(20,22,40,0.85)';
        ctx.lineWidth = 1.6;
        for (const b of this.birds) {
            const x = b.x - camera.x * parallax;
            if (x < -20 || x > viewW + 20) continue;
            const y = b.y * viewH + dy;

            // Fade out over the last second rather than vanishing.
            ctx.globalAlpha = Math.min(1, (b.ttl - b.life) / 1.0) * 0.9;

            // Two strokes forming a shallow V, flapping.
            const flap = Math.sin(b.life * 14 + b.phase) * 3.4;
            ctx.beginPath();
            ctx.moveTo(x - 5, y + flap);
            ctx.lineTo(x, y);
            ctx.lineTo(x + 5, y + flap);
            ctx.stroke();
        }
        ctx.restore();
    }
}
