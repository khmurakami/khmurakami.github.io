export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Single background image
        this.bgImage = null;

        // Scale and offset parameters to map original pixel coordinates to the scaled canvas
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    /**
     * Resizes the internal canvas resolution to match its CSS size.
     */
    resize(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    /**
     * Pre-loads the main background image.
     */
    async loadBackground(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.bgImage = img;
                resolve(img);
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    /**
     * Renders the background image perfectly centered and scaled to fit the container.
     */
    draw(hitboxes = [], hoveredId = null) {
        if (!this.bgImage) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Core logic: Calculate the scale required to "contain" the entire image within the canvas
        const scaleX = this.canvas.width / this.bgImage.width;
        const scaleY = this.canvas.height / this.bgImage.height;
        this.scale = Math.min(scaleX, scaleY); // Maintain aspect ratio

        // Calculate centering offsets
        const drawWidth = this.bgImage.width * this.scale;
        const drawHeight = this.bgImage.height * this.scale;
        this.offsetX = (this.canvas.width - drawWidth) / 2;
        this.offsetY = (this.canvas.height - drawHeight) / 2;

        // Draw background
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.bgImage, this.offsetX, this.offsetY, drawWidth, drawHeight);

        // Debug/Interaction: Draw the configured hitboxes
        hitboxes.forEach(box => {
            // Translate the original image coordinates into screen coordinates
            const screenX = this.offsetX + (box.x * this.scale);
            const screenY = this.offsetY + (box.y * this.scale);
            const screenW = box.w * this.scale;
            const screenH = box.h * this.scale;

            if (box.id === hoveredId) {
                // Highlight when hovered
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.fillRect(screenX, screenY, screenW, screenH);

                // Draw a nice tooltip
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 16px sans-serif';
                this.ctx.shadowColor = 'black';
                this.ctx.shadowBlur = 4;
                this.ctx.fillText(box.desc, screenX, screenY - 10);
                this.ctx.shadowBlur = 0; // reset
            } else {
                // Semi-transparent debug outline so you can see where the boxes are
                this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.4)';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(screenX, screenY, screenW, screenH);
            }
        });
    }

    /**
     * Detects if screen coordinates (e.g., a mouse click) intersect with any configured Hitbox.
     */
    getHitboxAtPoint(screenX, screenY, hitboxes) {
        if (!this.bgImage) return null;

        // Un-scale the screen coordinates back into the original image's pixel coordinate space
        const imgX = (screenX - this.offsetX) / this.scale;
        const imgY = (screenY - this.offsetY) / this.scale;

        // Check if those coordinates fall within any hitbox
        for (let i = hitboxes.length - 1; i >= 0; i--) {
            const box = hitboxes[i];
            if (imgX >= box.x && imgX <= box.x + box.w &&
                imgY >= box.y && imgY <= box.y + box.h) {
                return box;
            }
        }
        return null;
    }
}
