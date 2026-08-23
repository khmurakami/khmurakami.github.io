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
    /** Most birds alive at once. A startled flock is seven. */
    static MAX_BIRDS = 60;

    constructor({ worldWidth, seed = 909, planeEvery = 38, windowCount = 260 } = {}) {
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
        this.windows = Array.from({ length: windowCount }, (_, i) => ({
            // Which of the three city bands this window belongs to.
            band: i % 3,
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

        /** Sky sprites, handed over once loaded. See world-main. */
        this.sprites = null;

        /**
         * An airship, crossing.
         *
         * The aeroplane is a dash and a strobe because it is miles up and could
         * not be resolved into a shape. A blimp is the opposite kind of object:
         * low, enormous and slow, close enough to read as a thing rather than a
         * light, and it takes well over a minute to cross. That slowness is the
         * entire point — it is the one element in the sky you notice has MOVED
         * rather than watching it move.
         *
         * First pass comes reasonably soon so a short visit still catches one;
         * after that it is rare, because a blimp every thirty seconds is a
         * ceiling fan.
         */
        this.blimp = {
            active: false,
            progress: 0,
            duration: 0,
            y: 0.2,
            dir: 1,
            cooldown: 24 + rand() * 40,
            /** Set at boot; without it the airship simply never appears. */
            bob: rand() * Math.PI * 2
        };

        /**
         * A searchlight, sweeping.
         *
         * Anchored to a world x on the skyline rather than to the screen: it
         * belongs to a building, so it has to stay with that building when the
         * camera pans. The blimp is the opposite — it crosses the view and is
         * screen-space.
         *
         * The sweep is a slow sine with a long period and an eased turnaround,
         * because a beam travelling at constant speed and reversing instantly
         * reads as a windscreen wiper.
         */
        this.searchlight = {
            x: 2150,
            phase: rand() * Math.PI * 2,
            speed: 0.085,
            /** Half-width of the sweep, in radians. */
            arc: 0.62
        };

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
        // Capped. The coop is throttled by the game loop, but the pigeon prop
        // calls this straight from the interact key with no throttle at all —
        // holding E pushed seven more birds per press onto an array whose only
        // limit was how fast they aged out.
        if (this.birds.length >= Ambient.MAX_BIRDS) return;

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

        // ── Blimp ──
        const bl = this.blimp;
        if (bl.active) {
            bl.progress += dt / bl.duration;
            if (bl.progress >= 1.12) {
                bl.active = false;
                // Rare after the first. Minutes, not seconds.
                bl.cooldown = 190 + Math.random() * 220;
            }
        } else {
            bl.cooldown -= dt;
            if (bl.cooldown <= 0) {
                bl.active = true;
                bl.progress = -0.12;
                bl.dir = Math.random() < 0.5 ? 1 : -1;
                bl.y = 0.13 + Math.random() * 0.14;
                bl.duration = 95 + Math.random() * 70;
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

    /**
     * Lit windows, drawn on one band of the skyline.
     *
     * `band` selects which third of the windows belong to this plane. The city
     * is three parallax layers now, and windows lighting up on only one of them
     * puts every lit room at exactly the same distance — which reads as a
     * decal on the middle layer rather than as a city with depth.
     *
     * Nearer bands get slightly larger, slightly brighter windows, because they
     * are nearer.
     */
    drawSkyline(ctx, camera, viewW, viewH, parallax, band = null) {
        const dy = camera.lookY ? camera.lookY * parallax : 0;
        const scale = band == null ? 1 : 0.75 + band * 0.35;

        ctx.save();
        for (const w of this.windows) {
            if (!w.on) continue;
            if (band != null && w.band !== band) continue;
            const x = camera.toScreen(w.x, parallax);
            if (x < -6 || x > viewW + 6) continue;

            // Televisions flicker cold; ordinary windows hold steady warm.
            let alpha = 0.75;
            let color = w.warm ? '255,203,130' : '150,200,255';
            if (w.tv) {
                alpha = 0.45 + 0.4 * Math.abs(Math.sin(this.t * 6.3 + w.x));
                color = '130,180,255';
            }
            ctx.globalAlpha = alpha * (band == null ? 1 : 0.7 + band * 0.18);
            ctx.fillStyle = `rgba(${color},1)`;
            // Snapped and at least one pixel: a lit window is the smallest
            // thing in the world, and at a fraction of a pixel it flickers on
            // and off as the camera moves rather than staying lit.
            ctx.fillRect(
                Math.round(x), Math.round(w.y * viewH + dy),
                Math.max(1, Math.round(w.w * scale)),
                Math.max(1, Math.round(w.h * scale))
            );
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

    /**
     * The airship. Drawn on the sky plane, in front of the aeroplane.
     *
     * Screen-space like the aeroplane rather than world-space: it is crossing
     * the view, not sitting at a place in the world, so anchoring it to a world
     * x would make it drift backwards whenever the camera panned.
     *
     * @param {HTMLImageElement|null} image
     */
    drawBlimp(ctx, camera, viewW, viewH, parallax, image) {
        const b = this.blimp;
        if (!b.active || !image) return;

        const dy = camera.lookY ? camera.lookY * parallax : 0;
        const t = b.progress;
        const span = viewW + 460;
        const x = b.dir > 0 ? t * span - 230 : (1 - t) * span - 230;

        // A slow vertical wallow. An airship that tracks a perfectly flat line
        // reads as a sticker being slid across the sky.
        const bob = Math.sin(this.t * 0.26 + b.bob) * viewH * 0.006;
        const y = b.y * viewH + dy + bob;

        // Sized off the viewport so it stays the same physical size whatever
        // the render buffer is.
        const h = Math.max(8, Math.round(viewH * 0.075));
        const w = Math.round(h * (image.width / image.height));

        // Fades in and out at the edges rather than popping.
        const edge = Math.min(1, Math.min(t + 0.12, 1.12 - t) / 0.12);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, edge)) * 0.92;

        const dx = Math.round(x - w / 2);
        const dyy = Math.round(y - h / 2);

        // The art has the nose pointing left; travelling right means mirroring.
        if (b.dir > 0) {
            ctx.translate(dx + w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(image, 0, dyy, w, h);
        } else {
            ctx.drawImage(image, dx, dyy, w, h);
        }
        ctx.restore();

        // The lit flank, added rather than painted, so it glows against the sky
        // the same way every other light in the world does.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, edge)) * 0.20;
        ctx.fillStyle = 'rgba(255,214,150,1)';
        ctx.fillRect(dx + Math.round(w * 0.28), dyy + Math.round(h * 0.34),
            Math.round(w * 0.44), Math.max(1, Math.round(h * 0.26)));
        ctx.restore();
    }

    /**
     * The searchlight beam, drawn on a skyline plane.
     *
     * Rotated about its APEX — the narrow bottom point of the art — because
     * that is where the lamp is. Rotating about the middle would make the beam
     * swing like a pendulum instead of pivoting like a light.
     *
     * @param {HTMLImageElement|null} image
     */
    drawSearchlight(ctx, camera, viewW, viewH, parallax, image) {
        if (!image) return;
        const sl = this.searchlight;

        const sx = camera.toScreen(sl.x, parallax);
        const h = viewH * 0.46;
        const w = h * (image.width / image.height);
        if (sx < -w * 2 || sx > viewW + w * 2) return;

        const dy = camera.lookY ? camera.lookY * parallax : 0;
        // The apex sits on the horizon, which is where the rooftops are.
        const baseY = viewH * 0.66 + dy;

        // Eased at the ends of the arc: sin of a sine spends longer at the
        // extremes, which is what a real sweep does as it turns around.
        const t = Math.sin(this.t * sl.speed + sl.phase);
        const angle = Math.sin(t * Math.PI / 2) * sl.arc;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.13;
        ctx.translate(Math.round(sx), Math.round(baseY));
        ctx.rotate(angle);
        // Drawn upward from the pivot: the art is widest at the top.
        ctx.drawImage(image, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
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
            const x = camera.toScreen(b.x, parallax);
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
