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
        const action = box.dataset.action;
        const targetX = parseFloat(box.dataset.targetX);
        const targetY = parseFloat(box.dataset.targetY);

        if (!isNaN(targetX) && !isNaN(targetY)) {
            // Walk character to target
            charImgX = targetX;
            charImgY = targetY;
            character.setAnimation('walk');
            
            // Trigger action after walk (crude timeout for now)
            setTimeout(() => {
                character.setAnimation('idle');
                executeAction(action);
            }, 1000);
        } else {
            executeAction(action);
        }
    });
});

function executeAction(action) {
    switch (action) {
        case 'blog': window.location.href = 'blog.html'; break;
        case 'about': alert('About Me — coming soon!'); break;
        case 'resume': alert('Resume — coming soon!'); break;
        case 'projects': alert('Projects — coming soon!'); break;
        case 'contact': alert('Contact — coming soon!'); break;
    }
}

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

    // New: Initialize Recent Posts Widget
    const recentPostsContainer = document.getElementById('recent-posts-container');
    if (recentPostsContainer) {
        const recentPosts = BlogService.getAllPosts().slice(0, 3);
        recentPosts.forEach(post => {
            const item = document.createElement('a');
            item.href = `blog.html?id=${post.id}`; // Phase 4 will handle deep linking
            item.className = 'recent-post-item';
            item.innerHTML = `
                ${post.title}
                <span>${post.date}</span>
            `;
            recentPostsContainer.appendChild(item);
        });
    }

    // New: Initialize Sidebar Categories and Tags
    const sidebarCategories = document.getElementById('sidebar-categories');
    const sidebarTags = document.getElementById('sidebar-tags');
    if (sidebarCategories || sidebarTags) {
        const posts = BlogService.getAllPosts();
        
        // Extract unique categories
        const categories = [...new Set(posts.map(p => p.category))];
        if (sidebarCategories) {
            sidebarCategories.innerHTML = '';
            categories.forEach(cat => {
                const li = document.createElement('li');
                li.textContent = cat;
                li.addEventListener('click', () => {
                    window.location.href = `blog.html?category=${encodeURIComponent(cat)}`;
                });
                sidebarCategories.appendChild(li);
            });
        }

        // Extract unique tags
        const tags = [...new Set(posts.flatMap(p => p.tags))];
        if (sidebarTags) {
            sidebarTags.innerHTML = '';
            tags.forEach(tag => {
                const li = document.createElement('li');
                li.textContent = `#${tag}`;
                li.addEventListener('click', () => {
                    window.location.href = `blog.html?tag=${encodeURIComponent(tag)}`;
                });
                sidebarTags.appendChild(li);
            });
        }
    }

    // New: Initialize Featured Hero
    const heroTitle = document.getElementById('hero-title');
    const heroSummary = document.getElementById('hero-summary');
    const heroLink = document.getElementById('hero-link');
    if (heroTitle && heroSummary && heroLink) {
        const latestPost = BlogService.getAllPosts()[0];
        if (latestPost) {
            heroTitle.textContent = latestPost.title;
            heroSummary.textContent = latestPost.summary;
            heroLink.href = `blog.html?id=${latestPost.id}`;
        }
    }

    // New: Global Search (Cmd+K)
    const commandPalette = document.getElementById('command-palette');
    const paletteInput = document.getElementById('palette-input');
    const searchResults = document.getElementById('search-results');

    if (commandPalette && paletteInput) {
        // Toggle palette
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                commandPalette.classList.remove('hidden');
                paletteInput.focus();
            }
            if (e.key === 'Escape') {
                commandPalette.classList.add('hidden');
            }
        });

        // Close on click outside
        commandPalette.addEventListener('click', (e) => {
            if (e.target === commandPalette) commandPalette.classList.add('hidden');
        });

        // Search logic
        paletteInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (!query) {
                searchResults.innerHTML = '<div class="empty-state">Start typing to search...</div>';
                return;
            }

            const posts = BlogService.getAllPosts();
            const filtered = posts.filter(p => 
                p.title.toLowerCase().includes(query) || 
                p.summary.toLowerCase().includes(query) ||
                p.category.toLowerCase().includes(query) ||
                p.tags.some(t => t.toLowerCase().includes(query))
            );

            searchResults.innerHTML = '';
            if (filtered.length === 0) {
                searchResults.innerHTML = '<div class="empty-state">No results found for "' + query + '"</div>';
            } else {
                filtered.forEach((post, index) => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.innerHTML = `
                        <div class="title">${post.title}</div>
                        <div class="meta">Post • ${post.category} • ${post.date}</div>
                    `;
                    item.addEventListener('click', () => {
                        window.location.href = `blog.html?id=${post.id}`;
                    });
                    searchResults.appendChild(item);
                });
            }
        });
    }

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
