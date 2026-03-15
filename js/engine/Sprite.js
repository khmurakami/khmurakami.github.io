export class Sprite {
    /**
     * @param {object} config
     * @param {string} config.src        - Path to the sprite sheet image
     * @param {number} config.frameWidth - Width of a single frame in pixels
     * @param {number} config.frameHeight- Height of a single frame in pixels
     * @param {number} config.frameCount - Total number of frames in the sheet
     * @param {number} config.fps        - Animation speed (frames per second)
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

        // Animations: { name: { row: 0, length: 8 } }
        this.animations = config.animations || {
            idle: { row: 0, length: this.frameCount }
        };
        this.currentAnimation = 'idle';

        // World position (anchor: bottom-center)
        this.x = 0;
        this.y = 0;
    }

    /**
     * Loads the sprite sheet and strips the magenta (#FF00FF) background.
     */
    async load() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Process on an offscreen canvas to remove magenta
                const offCanvas = document.createElement('canvas');
                offCanvas.width = img.width;
                offCanvas.height = img.height;
                const offCtx = offCanvas.getContext('2d');
                offCtx.drawImage(img, 0, 0);

                const imageData = offCtx.getImageData(0, 0, img.width, img.height);
                const data = imageData.data;

                // Strip magenta (#FF00FF) AND anti-aliased edge pixels.
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    // Condition: high red AND high blue AND significantly low green
                    // This catches the pure magenta and the purple-ish anti-aliased edges
                    if (r > 100 && b > 100 && g < 150 && (r + b) > (g * 1.5)) {
                        data[i + 3] = 0;
                    }
                }

                offCtx.putImageData(imageData, 0, 0);
                this.sheet = offCanvas;

                // Auto-detect frame dimensions based on actual image size and config
                this.frameWidth = img.width / this.frameCount;
                this.frameHeight = img.height / this.rows;

                // Auto-compute scale so the character renders at targetHeight px tall
                this.scale = this.targetHeight / this.frameHeight;

                resolve(this);
            };
            img.onerror = reject;
            img.src = this.src;
        });
    }

    /**
     * Sets the current animation.
     * @param {string} name 
     */
    setAnimation(name) {
        if (this.animations[name] && this.currentAnimation !== name) {
            this.currentAnimation = name;
            this.currentRow = this.animations[name].row;
            this.currentFrame = 0;
        }
    }

    /**
     * Call this every animation loop tick. Advances the frame based on elapsed time.
     * @param {number} timestamp - from requestAnimationFrame
     */
    update(timestamp) {
        const anim = this.animations[this.currentAnimation];
        const length = anim ? anim.length : this.frameCount;

        const frameDuration = 1000 / this.fps;
        if (timestamp - this.lastFrameTime > frameDuration) {
            this.currentFrame = (this.currentFrame + 1) % length;
            this.lastFrameTime = timestamp;
        }
    }

    /**
     * Draws the current animation frame at this.x, this.y on the given canvas context.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (!this.sheet) return;

        ctx.imageSmoothingEnabled = false;

        const anim = this.animations[this.currentAnimation];
        const row = anim ? anim.row : this.currentRow;

        ctx.drawImage(
            this.sheet,
            // Source: crop out the current frame from the correct row
            this.currentFrame * this.frameWidth,
            row * this.frameHeight,
            this.frameWidth,
            this.frameHeight,
            // Destination: position on canvas, anchor is bottom-center
            this.x - (this.frameWidth * this.scale) / 2,
            this.y - (this.frameHeight * this.scale),
            this.frameWidth * this.scale,
            this.frameHeight * this.scale
        );
    }
}
