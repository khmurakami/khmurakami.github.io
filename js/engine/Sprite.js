/**
 * A single animation clip within a sprite sheet.
 * @typedef {object} Clip
 * @property {number} row     - Zero-based row in the sheet
 * @property {number} length  - Frame count in this clip
 * @property {number} [offset] - First column of the clip within its row (default 0).
 *                               Lets a 1-frame directional idle borrow a standing
 *                               pose out of the middle of a walk row.
 * @property {number} [fps]   - Per-clip override of the sheet fps
 * @property {'loop'|'pingpong'|'once'} [mode] - Playback mode (default 'loop')
 */

export class Sprite {
    /**
     * @param {object} config
     * @param {string} config.src         - Path to the sprite sheet (PNG with true alpha)
     * @param {number} config.frameCount  - Frames per row (columns)
     * @param {number} [config.rows]      - Rows in the sheet
     * @param {number} [config.fps]       - Default animation speed
     * @param {number} [config.targetHeight] - Rendered height in px, drives auto-scale
     * @param {number} [config.pivotX]    - Horizontal anchor 0..1 of frame width (default 0.5)
     * @param {number} [config.pivotY]    - Vertical anchor 0..1 of frame height (default 1 = feet)
     * @param {Object<string, Clip>} [config.animations]
     */
    constructor(config) {
        this.src = config.src;
        this.frameCount = config.frameCount || 1;
        this.rows = config.rows || 1;
        this.fps = config.fps || 8;
        this.targetHeight = config.targetHeight || 120;

        // Anchor as a fraction of the frame box. Bottom-center by default so
        // props and actors sit on the floor at their own y.
        this.pivotX = config.pivotX ?? 0.5;
        this.pivotY = config.pivotY ?? 1;

        this.frameWidth = 0;
        this.frameHeight = 0;
        this.sheet = null;
        this.scale = 1;
        this.loaded = false;

        this.currentFrame = 0;
        this.lastFrameTime = 0;
        this.direction = 1;   // pingpong sweep direction
        this.finished = false; // true once a 'once' clip has played out

        this.animations = config.animations || {
            idle: { row: 0, length: this.frameCount }
        };
        this.currentAnimation = Object.keys(this.animations)[0];

        // Called when a 'once' clip reaches its final frame.
        this.onComplete = null;

        // Playback rate multiplier. Lets one cycle serve both walking and
        // running: the frame rate has to track the movement speed or the feet
        // slide, which is the single most obvious animation tell.
        this.rate = 1;

        // World position, in room-image pixel space.
        this.x = 0;
        this.y = 0;
        this.visible = true;

        // Draw mirrored. Cheaper than storing a mirrored copy of every clip,
        // and exact by construction — a side-scroller only ever needs the two
        // horizontal facings.
        this.flipX = false;
    }

    /**
     * Loads the sheet. Sources are authored with true alpha, so the pixels are
     * used as-is — no colour keying, which would eat the room's indigo shadows.
     */
    load() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.sheet = img;
                this.frameWidth = img.width / this.frameCount;
                this.frameHeight = img.height / this.rows;
                this.scale = this.targetHeight / this.frameHeight;
                this.loaded = true;
                resolve(this);
            };
            img.onerror = () => reject(new Error(`Failed to load sprite: ${this.src}`));
            img.src = this.src;
        });
    }

    get clip() {
        return this.animations[this.currentAnimation];
    }

    /**
     * Switches clips. Re-selecting the current clip is a no-op unless forced,
     * so calling this every frame is safe.
     * @param {string} name
     * @param {boolean} [force] - Restart even if already playing
     */
    setAnimation(name, force = false) {
        if (!this.animations[name]) return;
        if (this.currentAnimation === name && !force) return;
        this.currentAnimation = name;
        this.currentFrame = 0;
        this.direction = 1;
        this.finished = false;
        this.lastFrameTime = 0;
    }

    /**
     * Advances the clip. Time-based, so playback speed is independent of
     * display refresh rate.
     * @param {number} timestamp - from requestAnimationFrame
     */
    update(timestamp) {
        const clip = this.clip;
        if (!clip || this.finished) return;

        const length = clip.length || this.frameCount;
        if (length <= 1) return;

        const fps = (clip.fps || this.fps) * (this.rate || 1);
        if (this.lastFrameTime === 0) this.lastFrameTime = timestamp;
        if (timestamp - this.lastFrameTime < 1000 / fps) return;
        this.lastFrameTime = timestamp;

        const mode = clip.mode || 'loop';
        if (mode === 'pingpong') {
            // Sweep out and back. Reverses at the ends rather than snapping,
            // which reads as breathing instead of a hard cut.
            this.currentFrame += this.direction;
            if (this.currentFrame >= length - 1) {
                this.currentFrame = length - 1;
                this.direction = -1;
            } else if (this.currentFrame <= 0) {
                this.currentFrame = 0;
                this.direction = 1;
            }
        } else if (mode === 'once') {
            if (this.currentFrame < length - 1) {
                this.currentFrame++;
            } else {
                this.finished = true;
                if (this.onComplete) this.onComplete(this);
            }
        } else {
            this.currentFrame = (this.currentFrame + 1) % length;
        }
    }

    /** Sort key for draw order — the floor point the sprite stands on. */
    get depth() {
        return this.y;
    }

    /**
     * Draws the current frame anchored at (x, y).
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (!this.loaded || !this.visible) return;

        // A lean, sheared about the feet.
        //
        // Everything else on the roof leans in the wind — weeds, bulb strings,
        // the laundry — and the one thing standing in the middle of it was
        // rigid, which quietly said the weather was a backdrop rather than
        // something happening to the scene. Sheared rather than rotated so the
        // feet stay flat on the floor.
        if (this.lean) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.transform(1, 0, -this.lean, 1, 0, 0);
            ctx.translate(-this.x, -this.y);
            this.drawFrame(ctx);
            ctx.restore();
            return;
        }
        this.drawFrame(ctx);
    }

    drawFrame(ctx) {
        const clip = this.clip;
        const row = clip ? clip.row : 0;
        const offset = (clip && clip.offset) || 0;
        const w = this.frameWidth * this.scale;
        const h = this.frameHeight * this.scale;

        const sx = (offset + this.currentFrame) * this.frameWidth;
        const sy = row * this.frameHeight;
        const dy = Math.round(this.y - h * this.pivotY);

        if (this.flipX) {
            // Mirror about the sprite's own pivot, so the anchor point — the
            // feet — stays put instead of the sprite jumping sideways when the
            // character turns around.
            const dx = Math.round(this.x + w * this.pivotX);
            ctx.save();
            ctx.translate(dx, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(this.sheet, sx, sy, this.frameWidth, this.frameHeight,
                0, 0, Math.round(w), Math.round(h));
            ctx.restore();
            return;
        }

        ctx.drawImage(
            this.sheet, sx, sy, this.frameWidth, this.frameHeight,
            Math.round(this.x - w * this.pivotX), dy,
            Math.round(w), Math.round(h)
        );
    }
}
