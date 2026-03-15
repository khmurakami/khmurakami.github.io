/**
 * RoomMapper — Maps between the original room image pixel coordinates and screen coordinates.
 * 
 * Since the room image uses object-fit:contain, it doesn't fill the whole container.
 * This class figures out exactly where the image is rendered and provides conversion
 * functions so sprites and assets can be placed at specific room-image pixels.
 * 
 * Usage:
 *   const mapper = new RoomMapper('room-bg');
 *   const screen = mapper.imageToScreen(500, 400);  // "pixel 500,400 of the original image"
 *   ctx.drawImage(sprite, screen.x, screen.y);      // draws at the correct screen position
 */
export class RoomMapper {
    constructor(imgElementId) {
        this.imgEl = document.getElementById(imgElementId);

        // These will be computed on each update()
        this.offsetX = 0;  // Where the image starts on screen (left edge)
        this.offsetY = 0;  // Where the image starts on screen (top edge)
        this.scale = 1;    // How much the image is scaled from its natural size
        this.imgWidth = 0; // Rendered width of the image on screen
        this.imgHeight = 0;// Rendered height of the image on screen
    }

    /**
     * Call this after load and on every resize. Recalculates where the image
     * actually sits within its container.
     */
    update() {
        if (!this.imgEl || !this.imgEl.naturalWidth) return;

        const rect = this.imgEl.getBoundingClientRect();
        const containerRect = this.imgEl.parentElement.getBoundingClientRect();

        // object-fit:contain scales the image to fit — find the actual rendered size
        const naturalW = this.imgEl.naturalWidth;
        const naturalH = this.imgEl.naturalHeight;

        // The scale is determined by whichever dimension is the limiting factor
        const scaleX = rect.width / naturalW;
        const scaleY = rect.height / naturalH;
        this.scale = Math.min(scaleX, scaleY);

        this.imgWidth = naturalW * this.scale;
        this.imgHeight = naturalH * this.scale;

        // The image is centered within the <img> element's box
        this.offsetX = rect.left - containerRect.left + (rect.width - this.imgWidth) / 2;
        this.offsetY = rect.top - containerRect.top + (rect.height - this.imgHeight) / 2;
    }

    /**
     * Convert a position in the ORIGINAL image's pixel space to screen canvas coordinates.
     * e.g., imageToScreen(500, 400) = where pixel 500,400 of the source image appears on screen.
     */
    imageToScreen(imgX, imgY) {
        return {
            x: this.offsetX + imgX * this.scale,
            y: this.offsetY + imgY * this.scale
        };
    }

    /**
     * Convert screen canvas coordinates back to the original image's pixel space.
     * Useful for click detection, debugging, etc.
     */
    screenToImage(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    /**
     * Returns true if the given image-space coordinates are within the room image bounds.
     */
    isInBounds(imgX, imgY) {
        return imgX >= 0 && imgX <= this.imgEl.naturalWidth &&
            imgY >= 0 && imgY <= this.imgEl.naturalHeight;
    }

    /**
     * Debug helper: draws the image boundary and a grid on the canvas.
     */
    drawDebugOverlay(ctx) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.offsetX, this.offsetY, this.imgWidth, this.imgHeight);

        // Draw a dot every 100 original pixels as a reference grid
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        for (let x = 0; x < this.imgEl.naturalWidth; x += 100) {
            for (let y = 0; y < this.imgEl.naturalHeight; y += 100) {
                const screen = this.imageToScreen(x, y);
                ctx.fillRect(screen.x - 1, screen.y - 1, 3, 3);
            }
        }
    }
}
