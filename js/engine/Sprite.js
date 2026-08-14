export class Sprite {
    /**
     * A pixel-art sprite that supports two source formats:
     *
     *  1. Per-animation horizontal strips (preferred) — one PNG per animation,
     *     laid out as a single row of frames. Transparent PNGs, no processing:
     *
     *       new Sprite({
     *         targetHeight: 130,
     *         strips: {
     *           idle: { src: '…/char_idle_breathe_strip.png', frames: 4,  fps: 4  },
     *           walk: { src: '…/char_walk_downright_strip.png', frames: 12, fps: 12 },
     *         }
     *       });
     *
     *  2. A single sheet with rows (legacy) — magenta (#FF00FF) is stripped on load.
     *
     * @param {object} config
     */
    constructor(config) {
        this.src = config.src;
        this.frameWidth = config.frameWidth || 0;
        this.frameHeight = config.frameHeight || 0;
        this.frameCount = config.frameCount || 1;
        this.rows = config.rows || 1;
        this.fps = config.fps || 8;
        this.targetHeight = config.targetHeight || 120;

        this.currentFrame = 0;
        this.currentRow = 0;
        this.lastFrameTime = 0;
        this.sheet = null;
        this.scale = 1;
        this.ready = false;

        // Per-animation strips (preferred). name -> { img, frames, frameWidth, frameHeight, fps }
        this.strips = config.strips || null;
        this.stripData = {};

        // Animations: { name: { row: 0, length: 8 } } — only used for the legacy sheet.
        this.animations = config.animations || {
            idle: { row: 0, length: this.frameCount }
        };
        this.currentAnimation = 'idle';

        // World position (anchor: bottom-center)
        this.x = 0;
        this.y = 0;
    }

    /**
     * Loads the sprite. Returns a promise that resolves once frames are ready.
     * Rejects on a genuine load failure so the caller can fail gracefully
     * (never render a broken/garbled fallback).
     */
    async load() {
        return this.strips ? this._loadStrips() : this._loadSheet();
    }

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
            img.src = src;
        });
    }

    async _loadStrips() {
        const names = Object.keys(this.strips);

        await Promise.all(names.map(async (name) => {
            const cfg = this.strips[name];
            const img = await this._loadImage(cfg.src);
            const frames = cfg.frames || 1;
            this.stripData[name] = {
                img,
                frames,
                frameWidth: Math.round(img.width / frames),
                frameHeight: img.height,
                fps: cfg.fps || this.fps,
            };
        }));

        // Base dimensions come from the current (idle) strip, falling back to the first.
        const base = this.stripData[this.currentAnimation] || this.stripData[names[0]];
        this.frameWidth = base.frameWidth;
        this.frameHeight = base.frameHeight;
        this.scale = this.targetHeight / this.frameHeight;
        this.ready = true;
        return this;
    }

    async _loadSheet() {
        const img = await this._loadImage(this.src);

        // Process on an offscreen canvas to remove magenta (#FF00FF).
        const offCanvas = document.createElement('canvas');
        offCanvas.width = img.width;
        offCanvas.height = img.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(img, 0, 0);

        const imageData = offCtx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > 100 && b > 100 && g < 150 && (r + b) > (g * 1.5)) {
                data[i + 3] = 0;
            }
        }
        offCtx.putImageData(imageData, 0, 0);
        this.sheet = offCanvas;

        this.frameWidth = img.width / this.frameCount;
        this.frameHeight = img.height / this.rows;
        this.scale = this.targetHeight / this.frameHeight;
        this.ready = true;
        return this;
    }

    /**
     * Sets the current animation.
     * @param {string} name
     */
    setAnimation(name) {
        if (this.currentAnimation === name) return;

        const exists = this.strips ? this.stripData[name] : this.animations[name];
        if (!exists) return;

        this.currentAnimation = name;
        this.currentFrame = 0;
        if (!this.strips && this.animations[name]) {
            this.currentRow = this.animations[name].row;
        }
    }

    /**
     * Advances the frame based on elapsed time.
     * @param {number} timestamp - from requestAnimationFrame
     */
    update(timestamp) {
        let length, fps;
        if (this.strips) {
            const strip = this.stripData[this.currentAnimation];
            if (!strip) return;
            length = strip.frames;
            fps = strip.fps;
        } else {
            const anim = this.animations[this.currentAnimation];
            length = anim ? anim.length : this.frameCount;
            fps = this.fps;
        }

        const frameDuration = 1000 / fps;
        if (timestamp - this.lastFrameTime > frameDuration) {
            this.currentFrame = (this.currentFrame + 1) % length;
            this.lastFrameTime = timestamp;
        }
    }

    /**
     * Draws the current frame at this.x, this.y (anchor: bottom-center).
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (!this.ready) return;
        ctx.imageSmoothingEnabled = false;

        if (this.strips) {
            const strip = this.stripData[this.currentAnimation]
                || this.stripData[Object.keys(this.stripData)[0]];
            if (!strip) return;

            const fw = strip.frameWidth;
            const fh = strip.frameHeight;
            const frame = this.currentFrame % strip.frames;
            ctx.drawImage(
                strip.img,
                frame * fw, 0, fw, fh,
                this.x - (fw * this.scale) / 2,
                this.y - (fh * this.scale),
                fw * this.scale,
                fh * this.scale
            );
            return;
        }

        // Legacy sheet path
        if (!this.sheet) return;
        const anim = this.animations[this.currentAnimation];
        const row = anim ? anim.row : this.currentRow;
        ctx.drawImage(
            this.sheet,
            this.currentFrame * this.frameWidth,
            row * this.frameHeight,
            this.frameWidth,
            this.frameHeight,
            this.x - (this.frameWidth * this.scale) / 2,
            this.y - (this.frameHeight * this.scale),
            this.frameWidth * this.scale,
            this.frameHeight * this.scale
        );
    }
}
