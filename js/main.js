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

// ── Modals (replaces jarring alert() popups) ────────────────────
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
}

document.querySelectorAll('.modal').forEach(modal => {
    // Close when clicking the dimmed backdrop (but not the card itself)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
    });
});
document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
});

// Any element with data-open-modal="modal-id" opens that modal
document.querySelectorAll('[data-open-modal]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(trigger.dataset.openModal);
    });
});

function executeAction(action) {
    switch (action) {
        case 'blog': window.location.href = 'blog.html'; break;
        case 'about': openModal('modal-about'); break;
        case 'resume': openModal('modal-resume'); break;
        case 'projects': openModal('modal-projects'); break;
        case 'contact': openModal('modal-contact'); break;
    }
}

// ── Room Coordinate System ──────────────────────────────────────
const mapper = new RoomMapper('room-bg');

// ── Sprite Canvas Setup ─────────────────────────────────────────
const canvas = document.getElementById('sprite-canvas');
const ctx = canvas.getContext('2d');
const hitboxLayer = document.getElementById('hitbox-layer');

function syncOverlays() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    mapper.update(); // Recalculate the rendered room-image rectangle

    // Pin the interactive hitbox layer exactly over the rendered room image so
    // the hotspots line up with the room on any screen size.
    if (hitboxLayer && mapper.imgWidth) {
        hitboxLayer.style.left = `${mapper.offsetX}px`;
        hitboxLayer.style.top = `${mapper.offsetY}px`;
        hitboxLayer.style.width = `${mapper.imgWidth}px`;
        hitboxLayer.style.height = `${mapper.imgHeight}px`;
    }
}

// ── Character Sprite ────────────────────────────────────────────
// Uses the purpose-built 64×64 transparent production strips.
const character = new Sprite({
    targetHeight: 130,
    strips: {
        idle: { src: 'assets/production/generated/char_idle_breathe_strip.png', frames: 4, fps: 4 },
        walk: { src: 'assets/production/generated/char_walk_downright_strip.png', frames: 12, fps: 12 },
    },
});

// Character position in ORIGINAL IMAGE PIXEL COORDINATES (1024×559 source).
let charImgX = 456; // User-confirmed floor tile position
let charImgY = 398;
let walkTimer = null;

// Walk the character toward an image-space point, then rest (and optionally act).
function walkTo(imgX, imgY, onArrive) {
    charImgX = imgX;
    charImgY = imgY;
    character.setAnimation('walk');

    if (walkTimer) clearTimeout(walkTimer);
    walkTimer = setTimeout(() => {
        character.setAnimation('idle');
        if (onArrive) onArrive();
    }, 500);
}

// ── Hitbox interactions ─────────────────────────────────────────
document.querySelectorAll('.hitbox').forEach(box => {
    box.addEventListener('click', () => {
        const action = box.dataset.action;
        const targetX = parseFloat(box.dataset.targetX);
        const targetY = parseFloat(box.dataset.targetY);

        if (character.ready && !isNaN(targetX) && !isNaN(targetY)) {
            walkTo(targetX, targetY, () => executeAction(action));
        } else {
            executeAction(action);
        }
    });
});

// Click anywhere on the room floor to walk the character there.
canvas.addEventListener('click', (e) => {
    if (!character.ready) return;
    const rect = canvas.getBoundingClientRect();
    const img = mapper.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    if (mapper.isInBounds(img.x, img.y)) {
        walkTo(img.x, img.y);
    }
});

// Boot guard to prevent double-initialization
let isBooted = false;

// ── Game Loop ───────────────────────────────────────────────────
function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Scale the character to ~20% of the room's rendered height, so it looks
    // correct on any screen size.
    const charHeightOnScreen = mapper.imgHeight * 0.20;
    if (charHeightOnScreen > 0) {
        character.scale = charHeightOnScreen / character.frameHeight;
    }

    const screenPos = mapper.imageToScreen(charImgX, charImgY);
    character.x = screenPos.x;
    character.y = screenPos.y;

    character.update(timestamp);
    character.draw(ctx);

    requestAnimationFrame(gameLoop);
}

// ── Boot ─────────────────────────────────────────────────────────
const roomImg = document.getElementById('room-bg');

function boot() {
    if (isBooted) return;
    isBooted = true;

    // Recent Posts widget
    const recentPostsContainer = document.getElementById('recent-posts-container');
    if (recentPostsContainer) {
        const recentPosts = BlogService.getAllPosts().slice(0, 3);
        recentPosts.forEach(post => {
            const item = document.createElement('a');
            item.href = `blog.html?id=${post.id}`;
            item.className = 'recent-post-item';
            item.innerHTML = `${post.title}<span>${post.date}</span>`;
            recentPostsContainer.appendChild(item);
        });
    }

    // Sidebar categories & tags
    const sidebarCategories = document.getElementById('sidebar-categories');
    const sidebarTags = document.getElementById('sidebar-tags');
    if (sidebarCategories || sidebarTags) {
        const posts = BlogService.getAllPosts();

        if (sidebarCategories) {
            const categories = [...new Set(posts.map(p => p.category))];
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

        if (sidebarTags) {
            const tags = [...new Set(posts.flatMap(p => p.tags))];
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

    // Featured hero
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

    // Global command palette (Cmd/Ctrl+K)
    const commandPalette = document.getElementById('command-palette');
    const paletteInput = document.getElementById('palette-input');
    const searchResults = document.getElementById('search-results');

    if (commandPalette && paletteInput) {
        commandPalette.addEventListener('click', (e) => {
            if (e.target === commandPalette) commandPalette.classList.add('hidden');
        });

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
                searchResults.innerHTML = `<div class="empty-state">No results found for "${query}"</div>`;
            } else {
                filtered.forEach((post) => {
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

    // Single global keyboard handler: Cmd/Ctrl+K toggles search; Esc closes.
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (commandPalette) {
                commandPalette.classList.remove('hidden');
                paletteInput.focus();
            }
        }
        if (e.key === 'Escape') {
            closeAllModals();
            if (commandPalette) commandPalette.classList.add('hidden');
        }
    });

    syncOverlays();
    window.addEventListener('resize', syncOverlays);

    // Load the character sprite. On failure we simply don't draw it — the page
    // stays clean rather than showing a broken/garbled fallback.
    character.load()
        .then(() => requestAnimationFrame(gameLoop))
        .catch((err) => {
            console.warn('Character sprite unavailable, continuing without it.', err);
        });
}

// Wait for the room image to fully load before booting
if (roomImg.complete && roomImg.naturalWidth) {
    boot();
} else {
    roomImg.addEventListener('load', boot);
}
