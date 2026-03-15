import { Sprite } from './engine/Sprite.js';
import { RoomMapper } from './engine/RoomMapper.js';
import { BlogService } from './engine/BlogService.js';

// ── Parallax ────────────────────────────────────────────────────
const bgForest = document.getElementById('bg-forest');
const gameContainer = document.getElementById('game-container');

document.addEventListener('mousemove', (e) => {
    const normalX = (e.clientX / window.innerWidth - 0.5) * 2;
    const normalY = (e.clientY / window.innerHeight - 0.5) * 2;

    bgForest.style.transform = `translate(${normalX * -18}px, ${normalY * -10}px)`;
    gameContainer.style.transform = `translate(${normalX * 6}px, ${normalY * 3}px)`;
});

// ── Hitbox interactions ─────────────────────────────────────────
document.querySelectorAll('.hitbox').forEach(box => {
    box.addEventListener('click', () => {
        switch (box.dataset.action) {
            case 'about': alert('About Me — coming soon!'); break;
            case 'resume': alert('Resume — coming soon!'); break;
            case 'projects': alert('Projects — coming soon!'); break;
            case 'contact': alert('Contact — coming soon!'); break;
        }
    });
});

// ── Room Coordinate System ──────────────────────────────────────
const mapper = new RoomMapper('room-bg');

// ── Sprite Canvas Setup ─────────────────────────────────────────
const canvas = document.getElementById('sprite-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    mapper.update(); // Recalculate image position after resize
}

// ── Character Sprite ─────────────────────────────────────────────
const character = new Sprite({
    src: 'assets/charcter/Gemini_Generated_Image_2hlwkz2hlwkz2hlw.png',
    frameCount: 6,  // 6 columns in the sheet
    rows: 2,        // 2 rows in the sheet
    fps: 8,
    targetHeight: 200, // Adjusted after feedback (140 was too small, 280 was too big)
    animations: {
        idle: { row: 0, length: 6 },
        walk: { row: 1, length: 6 }
    }
});

// Character position in ORIGINAL IMAGE PIXEL COORDINATES (1024×559 source).
let charImgX = 456;  // User-confirmed floor tile position
let charImgY = 398;

// Boot guard to prevent double-initialization
let isBooted = false;

// Debug mode — click on the room to log image coordinates in the console
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const imgCoords = mapper.screenToImage(screenX, screenY);
    console.log(`Clicked image coords: x=${Math.round(imgCoords.x)}, y=${Math.round(imgCoords.y)}`);

    // Move character to clicked position
    charImgX = imgCoords.x;
    charImgY = imgCoords.y;

    // Play walk animation when moving (basic toggle for now)
    character.setAnimation('walk');
    setTimeout(() => character.setAnimation('idle'), 1000);
});

// ── Game Loop ───────────────────────────────────────────────────
function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Dynamically scale character to be ~10% of the room's rendered height
    // This ensures the character looks correct on ANY screen size
    const charHeightOnScreen = mapper.imgHeight * 0.20; // Adjusted to ~20% of room height
    character.scale = charHeightOnScreen / character.frameHeight;

    // Convert the character's image-space position to screen position
    const screenPos = mapper.imageToScreen(charImgX, charImgY);
    character.x = screenPos.x;
    character.y = screenPos.y;

    character.update(timestamp);
    character.draw(ctx);

    // Debug: show the grid overlay (remove once positions are perfect)
    mapper.drawDebugOverlay(ctx);

    requestAnimationFrame(gameLoop);
}

// ── Boot ─────────────────────────────────────────────────────────
const roomImg = document.getElementById('room-bg');

function boot() {
    if (isBooted) return;
    isBooted = true;

    // Phase 1 verification log
    console.log('--- BLOG ENGINE INITIALIZED ---');
    console.log('Available Posts:', BlogService.getAllPosts());
    console.log('--------------------------------');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    character.load()
        .then(() => {
            console.log(`Sprite loaded: ${character.frameWidth}×${character.frameHeight}px per frame`);
            console.log(`Room image natural size: ${roomImg.naturalWidth}×${roomImg.naturalHeight}`);
            console.log('Click on the room to log image coordinates!');
            requestAnimationFrame(gameLoop);
        })
        .catch(err => console.error('Failed to load sprite:', err));
}

// Wait for the room image to fully load before booting
if (roomImg.complete) {
    boot();
} else {
    roomImg.addEventListener('load', boot);
}
