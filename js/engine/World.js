import { Sprite } from './Sprite.js';

/**
 * Renders a slot-based side-scrolling world: depth planes, the props slotted
 * into them, and the actors that walk among them.
 *
 * Two things distinguish this from a plain layer stack:
 *
 * 1. Missing art is not an error. A slot whose image has not been made yet
 *    draws as a labelled placeholder, so layout, camera, doors and movement are
 *    all workable before any asset exists.
 *
 * 2. Atmosphere is applied per plane, not baked into the art. Each plane gets a
 *    haze wash and optional darkening after it is drawn, which is what makes
 *    separately generated props read as one place at one time of day.
 */
/**
 * Draws an image snapped to whole render pixels.
 *
 * Both EDGES are rounded, not the position and the size separately: rounding a
 * float width independently of a float x makes a sprite breathe by a pixel as
 * it moves, because the two roundings disagree. Snapping left and right and
 * taking the difference keeps the edges on the grid and the width honest.
 *
 * Without this, nearest-neighbour sampling at a fractional destination doubles
 * and drops rows of pixels as a sprite moves — pixel swim, and the single most
 * recognisable tell that something is not really pixel art.
 */
function blit(ctx, img, x, y, w, h) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const dw = Math.max(1, Math.round(x + w) - x0);
    const dh = Math.max(1, Math.round(y + h) - y0);
    ctx.drawImage(img, x0, y0, dw, dh);
}

export class World {
    /**
     * The viewport the world was composed against.
     *
     * Everything is sized relative to this rather than to the actual window, so
     * the same amount of roof and the same object sizes appear on every screen
     * shape. 900 because that is what the deck bands, prop heights and horizon
     * were all authored at.
     */
    static DESIGN_HEIGHT = 900;

    constructor(manifest, camera) {
        this.manifest = manifest;
        this.camera = camera;
        this.planes = manifest.planes;
        this.images = new Map();   // src -> HTMLImageElement
        this.missing = new Set();  // srcs that failed to load
        this.actors = [];

        // Per-plane draw hooks, keyed by plane id. Anything drawn procedurally
        // — the starfield, weather, particles — slots into the depth stack here
        // rather than being composited over the finished frame, so it sits at
        // the correct distance and receives that plane's haze.
        this.hooks = {};

        // Wall-clock for ambient motion. Props sway and flicker off this, so a
        // paused tab resumes rather than jumping.
        this.time = 0;

        // Set by the game each frame; drives interaction affordance.
        this.playerX = null;
        /** Shared wind. Assigned by the game; sway reads from it. */
        this.wind = null;
        /** Elevation lookup. Assigned by the game; props and actors stand on it. */
        this.terrain = null;
        /** The walkable route. Assigned by the game; drawn as wear on the floor. */
        this.walkway = null;
    }

    static loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(src));
            img.src = src;
        });
    }

    /**
     * Loads every referenced image. Failures are recorded rather than thrown —
     * an unmade asset is an expected state here, not a fault.
     */
    /**
     * Every distinct image this scene needs.
     *
     * Deduplicated, because a prop reused across slots — or an asset a room
     * borrows from the roof — is one download and should be counted once. The
     * boot screen totals these to know how far along it is.
     */
    get assetSrcs() {
        return [...new Set([
            ...(this.manifest.backdrops || []).map(b => b.src),
            ...this.manifest.props.map(p => p.src)
        ])];
    }

    /**
     * @param {() => void} [onSettled] - called once per image, loaded or not.
     *        A missing slot is an expected state here, so progress counts
     *        settled rather than successful; counting only successes would
     *        stall the bar at whatever fraction of the world has art.
     */
    async load(onSettled) {
        const unique = this.assetSrcs;

        const results = await Promise.allSettled(unique.map(s =>
            onSettled
                ? World.loadImage(s).finally(onSettled)
                : World.loadImage(s)));
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') this.images.set(unique[i], r.value);
            else this.missing.add(unique[i]);
        });

        const have = this.images.size;
        console.log(`[world] assets ${have}/${unique.length} present`
            + (this.missing.size ? `, ${this.missing.size} slots showing placeholders` : ''));
        return this;
    }

    addActor(sprite) {
        // Tagged so the shared depth queue can tell actors from props.
        sprite.isSprite = true;
        if (sprite.z == null) sprite.z = 0.5;
        this.actors.push(sprite);
        return sprite;
    }

    update(ts) {
        this.time = ts / 1000;
        for (const a of this.actors) a.update(ts);
    }

    /**
     * Ambient motion for a prop, derived from its id so every instance of a
     * scattered asset moves on its own phase. Without that, a row of nine
     * planters sways in perfect unison and reads as a bug.
     */
    animOffset(p) {
        if (!p.anim) return { dx: 0, dy: 0, rot: 0, dim: 1 };

        const seed = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const phase = (seed % 100) / 100 * Math.PI * 2;
        const t = this.time;
        const a = p.anim;

        switch (a.type) {
            case 'sway': {
                // Driven by the shared wind, not an independent oscillator, so
                // the whole roof leans and settles together. The per-prop lag and
                // stiffness keep it from moving as one rigid sheet.
                if (this.wind) {
                    // Lag comes from the prop's POSITION, not from its id.
                    //
                    // It used to be `(seed % 7) * 0.06` — arbitrary jitter whose
                    // only job was to stop the roof moving as one rigid sheet.
                    // Deriving it from x instead costs nothing and turns the
                    // same mechanism into weather: the gust front sweeps along
                    // the roof at a real speed, so a stand of weeds bends, then
                    // the one after it, and you can watch a gust coming.
                    const stiff = a.stiffness != null ? a.stiffness : ((seed % 5) * 0.04);
                    const jitter = (seed % 7) * 0.02;
                    return {
                        dx: this.wind.atX(p.x, stiff, jitter) * (a.amount || 4)
                            + this.brushOf(p),
                        dy: 0, rot: 0, dim: 1
                    };
                }
                const k = Math.sin(t * (a.speed || 0.8) + phase);
                return { dx: k * (a.amount || 4), dy: 0, rot: 0, dim: 1 };
            }
            case 'bob': {
                const k = Math.sin(t * (a.speed || 1.2) + phase);
                return { dx: 0, dy: k * (a.amount || 3), rot: 0, dim: 1 };
            }
            case 'flicker': {
                // Two out-of-phase waves plus a rare dropout, so it reads
                // electrical rather than like a sine wave.
                const base = 0.82 + 0.18 * Math.sin(t * 9 + phase);
                const jitter = Math.sin(t * 37.7 + phase * 3) > 0.93 ? 0.45 : 1;
                return { dx: 0, dy: 0, rot: 0, dim: base * jitter };
            }
            case 'cycle': {
                // PALETTE CYCLING, the oldest trick in the book: animate the
                // COLOURS rather than the pixels. A neon tube or a CRT does not
                // move, it changes hue, and faking that by fading a whole
                // sprite in and out just makes it blink.
                //
                // Canvas cannot swap indices in an indexed image, so the same
                // effect is had by compositing a colour over the sprite's own
                // opaque pixels: the shape is untouched and only its colour
                // walks along the ramp.
                const speed = a.speed || 1;
                const k = (t * speed + phase / (Math.PI * 2)) % 1;
                return { dx: 0, dy: 0, rot: 0, dim: 1, cycle: k };
            }
            case 'pulse': {
                const k = 0.5 + 0.5 * Math.sin(t * (a.speed || 0.6) + phase);
                return { dx: 0, dy: 0, rot: 0, dim: 0.7 + 0.3 * k };
            }
            default:
                return { dx: 0, dy: 0, rot: 0, dim: 1 };
        }
    }

    /**
     * How far a swaying prop is pushed aside by the player walking past it.
     *
     * The best interaction is one the player did not know was there until they
     * caused it. Nothing prompts, nothing is pressed — you walk through a stand
     * of weeds and it bends away from you and springs back, and the roof stops
     * being a painting you are in front of.
     *
     * Pushed AWAY from the player rather than in a fixed direction, so walking
     * back through bends it the other way.
     */
    brushOf(p) {
        if (this.playerX == null || !p.brush) return 0;
        const reach = p.brush.reach || 46;
        const gap = p.x - this.playerX;
        const d = Math.abs(gap);
        if (d > reach) return 0;

        // Falls off with distance, and is zero exactly at the edge of reach so
        // it eases in rather than snapping on.
        const strength = 1 - d / reach;
        return Math.sign(gap || 1) * strength * strength * (p.brush.amount || 5);
    }

    /**
     * Multiplier on a light's intensity from the player being near it.
     *
     * A prop declaring `motion` is on a sensor: dark until somebody walks up
     * to it, then it warms on. It is the same idea as `brush` — the world
     * responding without asking to be pressed — but it also does something
     * `brush` cannot, which is give you a reason to walk somewhere.
     *
     * Eased rather than switched, because a hard cut reads as a bug and a slow
     * warm reads as a filament.
     */
    motionOf(p) {
        const m = p.motion;
        if (!m) return 1;
        if (this.playerX == null) return m.min != null ? m.min : 0.12;

        const reach = m.reach || 300;
        const min = m.min != null ? m.min : 0.12;
        const d = Math.abs(p.x - this.playerX);
        if (d >= reach) return min;

        const t = 1 - d / reach;
        return min + (1 - min) * (t * t * (3 - 2 * t));
    }

    plane(id) {
        return this.planes.find(p => p.id === id);
    }

    /** Vertical shift for a plane when the camera is tilted up. */
    lookOffset(plane) {
        if (!this.camera.lookY || !plane) return 0;
        return this.camera.lookY * plane.parallax;
    }

    /**
     * Depth helpers. `z` is 0 at the front edge of the deck and 1 at the back
     * wall; both the screen position and the scale are interpolated between the
     * two, which is what makes walking upstage read as moving into the scene
     * rather than sliding up a flat image.
     */
    groundYFor(z, viewH) {
        const d = this.manifest.deck;
        if (!d) return viewH * this.manifest.groundLine;
        return viewH * (d.frontY + (d.backY - d.frontY) * z);
    }

    /**
     * How far up the screen a height lifts something at this depth.
     *
     * Scaled by depth so a crate on a platform at the back rises less than the
     * same crate would at the front — otherwise the platform looks like it
     * tilts toward the camera.
     */
    liftFor(elevation, z, viewH) {
        if (!elevation) return 0;
        return elevation * this.unit() * this.depthScale(z);
    }

    /** Floor height under a prop or actor. */
    elevationOf(o) {
        if (o.elevation != null) return o.elevation;
        if (!this.terrain) return 0;
        // worldX first: on a Sprite, `x` is the SCREEN position, reassigned every
        // frame during draw. Reading that as a world coordinate looks up the
        // terrain at the wrong place, so the character drifts in and out of
        // raised regions as the camera moves and floats off the floor.
        const worldX = o.worldX != null ? o.worldX : o.x;
        return this.terrain.elevationAt(worldX, this.depthOf(o));
    }

    depthScale(z) {
        const d = this.manifest.deck;
        if (!d) return 1;
        return d.frontScale + (d.backScale - d.frontScale) * z;
    }

    /** A deck prop's depth, falling back to whatever its y implies. */
    depthOf(p) {
        if (p.z != null) return p.z;
        const d = this.manifest.deck;
        if (!d || p.y == null) return 0.5;
        return Math.max(0, Math.min(1, (d.frontY - p.y) / (d.frontY - d.backY)));
    }

    /** Scale factor from reference pixels to the current viewport. */
    unit() {
        // Derived from the DESIGN viewport and the camera's scale, not from the
        // buffer height.
        //
        // Taking it from the buffer tied the world's size to the window's
        // height alone, which is why a phone was unusable: a narrow portrait
        // screen is nearly as TALL as a laptop, so the character came out the
        // same size while only a twentieth of the roof fitted beside them.
        //
        // `camera.pixelScale` already carries both the render scale and the
        // view scale, so a scale change moves sizes and positions together and
        // the composition holds at any shape of window. On a 16:9 screen this
        // is identical to what it replaced, to the last decimal.
        return World.DESIGN_HEIGHT
            / this.manifest.referenceHeight
            / (this.camera.pixelScale || 1);
    }

    // ── Drawing ──────────────────────────────────────────────────────

    draw(ctx, viewW, viewH) {
        for (const plane of this.planes) {
            this.drawBackdrops(ctx, plane, viewW, viewH);

            // The route goes down on the floor itself, over the deck art and
            // under everything standing on it. Drawn from the same Walkway the
            // movement code clamps against, so the path you can see and the
            // path you can walk are one object rather than two that agree.
            if (plane.id === this.manifest.actorPlane && this.walkway) {
                this.drawWalkway(ctx, plane, viewW, viewH);
            }

            if (this.hooks[plane.id]) this.hooks[plane.id](ctx, viewW, viewH);

            // On the floor plane the actors are drawn inside drawProps, sorted
            // among the props by depth. Anywhere else they sit on top.
            this.drawProps(ctx, plane, viewW, viewH);
            if (plane.id === this.manifest.actorPlane && !this.manifest.deck) {
                this.drawActors(ctx, viewH);
            }

            this.applyAtmosphere(ctx, plane, viewW, viewH);
        }
    }

    drawBackdrops(ctx, plane, viewW, viewH) {
        for (const b of (this.manifest.backdrops || [])) {
            if (b.plane !== plane.id) continue;
            const img = this.images.get(b.src);
            if (!img) { this.placeholderBand(ctx, b, viewW, viewH); continue; }

            const drawH = b.heightFrac ? viewH * b.heightFrac : viewH;
            const scale = drawH / img.height;
            const w = img.width * scale;
            // Nearer planes swing further when the camera tilts, which is what
            // makes the tilt read as a look rather than a pan.
            const y = (b.anchor === 'bottom' ? viewH - drawH : 0) + this.lookOffset(plane);
            let x = -this.camera.x * plane.parallax;

            if (b.repeat) {
                x = x % w;
                if (x > 0) x -= w;
                for (let dx = x; dx < viewW; dx += w) blit(ctx, img, dx, y, w, drawH);
            } else {
                blit(ctx, img, x, y, w, drawH);
            }
        }
    }

    /**
     * The worn path.
     *
     * Roofs wear where they are walked on, so the affordance is drawn as wear:
     * a lighter, warmer scuff along the route, fading out at both edges, with a
     * darker seam where grime collects against the back wall. Nothing here
     * reads as an overlay — it is the floor being dirtier in the shape of the
     * traffic across it.
     *
     * Three passes at different insets rather than one filled band: a hard
     * outline round a walkable area is a level-editor gizmo, and the moment a
     * player sees an edge that crisp they read it as UI.
     */
    drawWalkway(ctx, plane, viewW, viewH) {
        const x0 = this.camera.renderX;
        const look = this.lookOffset(plane);
        const tone = this.manifest.walkway.tone || [214, 198, 176];
        const [r, g, b] = tone;

        // Screen position of a point on the floor, including any platform it
        // crosses — a path that ignores elevation slides off the service deck.
        const at = (x, z) => ({
            sx: this.camera.toScreen(x, plane.parallax),
            sy: this.groundYFor(z, viewH)
                - this.liftFor(this.terrain ? this.terrain.elevationAt(x, z) : 0, z, viewH)
                + look
        });

        // Inset in z units, and the alpha at that inset. Widest and faintest
        // first, so the passes build up toward the middle of the route.
        const passes = [
            { inset: -0.010, alpha: 0.030 },
            { inset: 0.022, alpha: 0.038 },
            { inset: 0.070, alpha: 0.034 }
        ];

        ctx.save();
        // Each lane is its own run of floor at its own height. Drawn separately
        // rather than merged, so the raised service level reads as a second
        // walkway above the deck instead of one band smeared across the gap.
        for (const lane of this.walkway.lanes) {
            // WORLD span, not the render span. `x0` is a world coordinate, so
            // the width added to it has to be one too — `viewW` is the buffer's
            // width in render px, and using it here sampled the route across
            // only 1/pixelScale of the roof actually on screen.
            const pts = lane.sample(x0 - 40, x0 + this.camera.viewportWidth + 40);
            if (pts.length < 2) continue;

            for (const pass of passes) {
                const near = [], far = [];
                for (const p of pts) {
                    // Never let the insets cross on a narrow stretch, or the
                    // polygon folds through itself and paints a bow-tie.
                    const room = Math.max(0, (p.far - p.near) / 2 - 0.004);
                    const in_ = Math.min(pass.inset, room);
                    near.push(at(p.x, p.near + in_));
                    far.push(at(p.x, p.far - in_));
                }

                ctx.beginPath();
                near.forEach((q, i) => i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy));
                for (let i = far.length - 1; i >= 0; i--) ctx.lineTo(far[i].sx, far[i].sy);
                ctx.closePath();

                ctx.fillStyle = `rgba(${r},${g},${b},${pass.alpha})`;
                ctx.fill();
            }

            // The seam at the back, where the floor meets whatever it runs
            // against. The only crisp thing in the treatment — it reads as dirt
            // collected in a corner rather than as a boundary being announced.
            ctx.beginPath();
            pts.forEach((p, i) => {
                const q = at(p.x, p.far);
                i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy);
            });
            ctx.strokeStyle = 'rgba(12,10,24,0.20)';
            ctx.lineWidth = Math.max(1, viewH / 520);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawProps(ctx, plane, viewW, viewH) {
        const unit = this.unit();

        const isFloor = plane.id === this.manifest.actorPlane && this.manifest.deck;

        // Sort by depth on the floor plane, by baseline elsewhere. Furthest
        // draws first so nearer things overlap it — the character included,
        // which is what lets you walk behind a crate and in front of the next.
        const list = this.manifest.props
            .filter(p => p.plane === plane.id)
            .sort(isFloor
                ? (a, b) => this.depthOf(b) - this.depthOf(a)
                : (a, b) => (a.y - b.y) || (a.height - b.height));

        // Actors take part in the same depth sort as the props.
        const queue = isFloor
            ? [...list, ...this.actors.filter(a => a.loaded && a.visible)]
                .sort((a, b) => this.depthOf(b) - this.depthOf(a))
            : list;

        for (const p of queue) {
            if (p.isSprite) { this.drawActor(ctx, p, viewH); continue; }

            const img = this.images.get(p.src);
            const anim = this.animOffset(p);

            // On the floor plane, depth drives both position and size.
            const z = isFloor ? this.depthOf(p) : null;
            const dScale = isFloor ? this.depthScale(z) : 1;

            const h = p.height * unit * dScale;
            const w = img ? h * (img.width / img.height) : (p.width || p.height) * unit * dScale;
            const lift = isFloor ? this.liftFor(this.elevationOf(p), z, viewH) : 0;
            const baseY = (isFloor ? this.groundYFor(z, viewH) : viewH * p.y)
                - lift + this.lookOffset(plane) + Math.round(anim.dy);
            // Sway and brush offsets are quantised to whole render pixels.
            //
            // A 0.4px sway does not move an edge, it SMEARS it: nearest
            // neighbour resamples the sprite a fraction of a pixel across and
            // the outline crawls. Stepping in whole pixels is what a pixel
            // artist would do by hand, and it is the difference between a prop
            // that sways and one that shimmers.
            const screenX = this.camera.toScreen(p.x, plane.parallax) + Math.round(anim.dx);

            // A repeating prop (the parapet) tiles across the whole world.
            if (p.repeat && img) {
                let x = screenX % w;
                if (x > 0) x -= w;
                for (let dx = x; dx < viewW; dx += w) {
                    blit(ctx, img, dx, baseY - h, w, h);
                }
                continue;
            }

            // Cull anything fully off-screen before touching the context.
            if (screenX + w < -w || screenX - w > viewW + w) continue;

            // Contact shadow first, so the prop sits on top of its own shadow.
            if (p.shadow !== false && plane.id === this.manifest.actorPlane && this.fx) {
                this.fx.contactShadow(ctx, screenX, baseY, w * 0.9, 0.4);
            }

            if (img) {
                if (anim.dim !== 1) { ctx.save(); ctx.globalAlpha = anim.dim; }
                blit(ctx, img, screenX - w / 2, baseY - h, w, h);

                // The palette-cycle pass. `source-atop` confines it to the
                // pixels the sprite actually drew, so the shape stays exactly
                // as authored and only its colour moves.
                if (anim.cycle != null && p.anim.ramp) {
                    const ramp = p.anim.ramp;
                    const c = ramp[Math.floor(anim.cycle * ramp.length) % ramp.length];
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.globalAlpha = p.anim.amount != null ? p.anim.amount : 0.5;
                    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
                    ctx.fillRect(Math.round(screenX - w / 2), Math.round(baseY - h),
                        Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
                    ctx.restore();
                }
                if (anim.dim !== 1) ctx.restore();
            } else {
                this.placeholder(ctx, p, screenX, baseY, w, h);
            }

            // Interaction affordance: interactables announce themselves as the
            // player approaches, so nothing can be walked past unnoticed.
            if ((p.door || p.interact) && this.playerX != null && this.fx) {
                const zone = p.door || p.interact;
                const range = (zone.width || 130) * 2.6;
                const dist = Math.abs(this.playerX - p.x);
                if (dist < range) {
                    const near = 1 - dist / range;
                    this.drawAffordance(ctx, screenX, baseY - h, w, near);
                }
            }

            // Emissive props light their surroundings.
            if (p.light && this.fx) {
                const L = p.light;
                const lx = screenX + (L.ox || 0) * unit;
                const ly = baseY - h + (L.oy != null ? L.oy : h * 0.5);
                const intensity = (L.intensity != null ? L.intensity : 1)
                    * anim.dim * this.motionOf(p);
                this.fx.bloom(ctx, lx, ly, (L.radius || 90) * unit, L.color || [255, 200, 130], intensity);
                if (L.pool !== false) {
                    this.fx.lightPool(ctx, screenX, baseY, (L.radius || 90) * 1.5 * unit,
                        L.color || [255, 200, 130], intensity * 0.9);
                }
            }
        }
    }

    /** Draws one actor, placed and scaled by its depth on the floor. */
    drawActor(ctx, a, viewH) {
        const plane = this.plane(this.manifest.actorPlane);
        const z = this.depthOf(a);
        const dScale = this.manifest.deck ? this.depthScale(z) : 1;

        a.x = this.camera.toScreen(a.worldX, plane ? plane.parallax : 1);
        const lift = this.manifest.deck
            ? this.liftFor(this.elevationOf(a), z, viewH) : 0;
        a.y = (this.manifest.deck
            ? this.groundYFor(z, viewH)
            : viewH * this.manifest.groundLine) - lift + this.lookOffset(plane);
        a.scale = a.worldScale * this.unit() * dScale;

        // Without a contact shadow the character hovers; it shrinks with depth
        // along with everything else.
        if (this.fx) {
            this.fx.contactShadow(ctx, a.x, a.y, a.frameWidth * a.scale * 0.42, 0.5);
        }
        a.draw(ctx);
    }

    drawActors(ctx, viewH) {
        for (const a of this.actors) {
            if (!a.loaded || !a.visible) continue;
            this.drawActor(ctx, a, viewH);
        }
    }

    /**
     * Haze and darkening for one plane. Applied after the plane is drawn so it
     * affects that plane and everything behind it, which is how real
     * atmospheric perspective accumulates with distance.
     */
    applyAtmosphere(ctx, plane, viewW, viewH) {
        const [r, g, b] = this.manifest.hazeColor || [0, 0, 0];

        // Plane darkening was removed. `source-atop` over the full viewport
        // tints every pixel drawn so far, not just this plane's, so darkening
        // the foreground quietly dimmed the entire scene by the same amount.
        // Doing it correctly needs the plane rendered to its own buffer first;
        // it is not worth a per-frame offscreen pass when the foreground art is
        // already generated as near-silhouette.

        if (plane.haze) {
            ctx.save();
            ctx.fillStyle = `rgba(${r},${g},${b},${plane.haze})`;
            ctx.fillRect(0, 0, viewW, viewH);
            ctx.restore();
        }
    }

    // ── Placeholders ─────────────────────────────────────────────────

    /**
     * A small bobbing chevron above an interactable, fading in with proximity.
     * Deliberately understated: it should read as "there is something here",
     * not as a quest marker.
     */
    drawAffordance(ctx, x, topY, w, near) {
        const a = Math.pow(near, 1.6);
        const bob = Math.sin(this.time * 2.4) * 3;
        const y = topY - 18 + bob;

        ctx.save();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = 'rgba(255,226,170,0.95)';
        ctx.beginPath();
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.closePath();
        ctx.fill();

        // A soft halo so it reads against a busy skyline.
        ctx.globalAlpha = a * 0.22;
        ctx.beginPath();
        ctx.arc(x, y + 2, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** A labelled dashed box standing in for an unmade prop. */
    placeholder(ctx, p, screenX, baseY, w, h) {
        const x = screenX - w / 2;
        const y = baseY - h;

        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = p.door ? 'rgba(255,190,90,0.9)' : 'rgba(150,190,255,0.65)';
        ctx.fillStyle = p.door ? 'rgba(255,190,90,0.10)' : 'rgba(150,190,255,0.07)';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        ctx.setLineDash([]);
        ctx.fillStyle = p.door ? 'rgba(255,214,150,0.95)' : 'rgba(190,215,255,0.8)';
        ctx.font = '13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.id, screenX, y - 7);
        ctx.restore();
    }

    /** A hatched band standing in for an unmade backdrop. */
    placeholderBand(ctx, b, viewW, viewH) {
        const drawH = b.heightFrac ? viewH * b.heightFrac : viewH;
        const y = b.anchor === 'bottom' ? viewH - drawH : 0;
        ctx.save();
        ctx.fillStyle = 'rgba(120,150,220,0.06)';
        ctx.fillRect(0, y, viewW, drawH);
        ctx.setLineDash([4, 8]);
        ctx.strokeStyle = 'rgba(150,190,255,0.35)';
        ctx.strokeRect(1, y + 1, viewW - 2, drawH - 2);
        ctx.restore();
    }

    /** Builds the actor sprite from the manifest, anchored on measured art. */
    static actorFromEntry(entry) {
        const { content, place, sheet } = entry;
        const sprite = new Sprite({
            src: entry.src,
            frameCount: sheet.frameCount,
            rows: sheet.rows || 1,
            fps: entry.fps,
            pivotX: ((content.left + content.right) / 2) / content.frameW,
            pivotY: content.baseline / content.frameH,
            animations: entry.animations
        });
        sprite.id = entry.id;
        sprite.worldX = place.x;
        sprite.worldScale = place.height / (content.baseline - content.top);
        return sprite;
    }

    /**
     * Interaction zones derived from the prop slots.
     *
     * Both doors and other interactables come from the same place, so a zone
     * can never drift away from the object it belongs to.
     */
    static zonesFrom(manifest) {
        return manifest.props
            .filter(p => p.door || p.interact)
            .map(p => {
                const z = p.door || p.interact;
                return {
                    id: p.id,
                    x: p.x,
                    width: z.width || 130,
                    action: z.action,
                    label: z.label,
                    kind: p.door ? 'door' : 'interact'
                };
            });
    }

    /** Door zones only. */
    static doorsFrom(manifest) {
        return World.zonesFrom(manifest).filter(z => z.kind === 'door');
    }
}
