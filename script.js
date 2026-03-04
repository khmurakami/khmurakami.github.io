document.addEventListener('DOMContentLoaded', () => {

    // --- Modal Logic ---
    const hotspots = document.querySelectorAll('.hotspot');
    const closeBtns = document.querySelectorAll('.close-btn');
    const modals = document.querySelectorAll('.modal');

    hotspots.forEach(spot => {
        spot.addEventListener('click', (e) => {
            const targetId = spot.getAttribute('data-target');
            const targetModal = document.getElementById(targetId);
            if (targetModal) {
                targetModal.classList.add('active');
            }
        });
    });

    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = btn.closest('.modal');
            modal.classList.remove('active');
        });
    });

    // Close on background click
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });


    // --- Hero Movement Logic ---
    const hero = document.getElementById('hero-sprite');
    const gameContainer = document.getElementById('game-container');
    const bgImage = document.getElementById('room-bg');

    // State
    let isPlayerControlled = false;
    let autoMoveTimeout; // Replaced interval with timeout for dynamic pacing

    // We want the hero to wander within the bounds of the actual image
    function getRandomPosition() {
        const bgRect = bgImage.getBoundingClientRect();
        const minX = bgRect.left + (bgRect.width * 0.1);
        const maxX = bgRect.right - (bgRect.width * 0.2);
        const minY = bgRect.top + (bgRect.height * 0.4);
        const maxY = bgRect.bottom - (bgRect.height * 0.2);
        return {
            x: Math.random() * (maxX - minX) + minX,
            y: Math.random() * (maxY - minY) + minY
        };
    }

    function wanderHero() {
        if (isPlayerControlled) return;

        const pos = getRandomPosition();
        const rect = hero.getBoundingClientRect();

        if (pos.x < rect.left) {
            hero.style.transform = 'scaleX(-1)';
        } else {
            hero.style.transform = 'scaleX(1)';
        }

        // Calculate comfortable, slow wandering speed
        const dx = pos.x - rect.left;
        const dy = pos.y - rect.top;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = 35; // Pixels per second (very cozy)
        const duration = distance / speed;

        hero.style.transition = `left ${duration}s linear, top ${duration}s linear`;
        // Make sure character is animating while moving automatically
        hero.classList.add('walking');

        hero.style.left = `${pos.x}px`;
        hero.style.top = `${pos.y}px`;

        // Wait for the walk to finish, then pause before wandering again
        autoMoveTimeout = setTimeout(() => {
            if (!isPlayerControlled) {
                // Stop walking animation when they arrive at the spot
                hero.classList.remove('walking');
                // Cozy pause: 2 to 6 seconds standing still
                autoMoveTimeout = setTimeout(wanderHero, 2000 + Math.random() * 4000);
            }
        }, Math.max(duration * 1000, 100)); // Minimum timeout to prevent bugs
    }

    function startAutoMovement() {
        wanderHero();
    }

    startAutoMovement();

    // --- Player Control Logic ---
    let currentX = window.innerWidth / 2;
    let currentY = window.innerHeight * 0.7;
    const manualSpeed = 7;
    const keys = {};

    // Robust list for random interaction animations
    const interactionAnimations = [
        "assets/characters/hero/jumping.gif",
        // Add more exported GIFs here to expand the randomness!
    ];

    window.addEventListener('keydown', (e) => {
        // Spacebar to trigger random interaction
        if (e.code === 'Space' && !hero.classList.contains('interacting')) {
            e.preventDefault(); // Stop page scroll

            // Randomly pick an animation from our array
            const randomAnim = interactionAnimations[Math.floor(Math.random() * interactionAnimations.length)];

            // Apply it via a CSS variable so it overrides the content
            hero.style.setProperty('--anim-url', `url("${randomAnim}")`);
            hero.classList.add('interacting');

            // Remove interacting class after 1 second (1000ms GIF duration)
            setTimeout(() => {
                hero.classList.remove('interacting');
            }, 1000);
        }

        // Only take over autonomous wandering if they drive
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {

            if (!isPlayerControlled) {
                isPlayerControlled = true;
                clearTimeout(autoMoveTimeout);

                hero.style.transition = 'none'; // Snappy manual movement

                const rect = hero.getBoundingClientRect();
                currentX = rect.left;
                currentY = rect.top;
            }

            keys[e.key] = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });

    function updateHeroPosition() {
        if (!isPlayerControlled) return;

        let isMoving = false;

        if (keys['ArrowUp'] || keys['w']) { currentY -= manualSpeed; isMoving = true; }
        if (keys['ArrowDown'] || keys['s']) { currentY += manualSpeed; isMoving = true; }
        if (keys['ArrowLeft'] || keys['a']) {
            currentX -= manualSpeed;
            hero.style.transform = 'scaleX(-1)';
            isMoving = true;
        }
        if (keys['ArrowRight'] || keys['d']) {
            currentX += manualSpeed;
            hero.style.transform = 'scaleX(1)';
            isMoving = true;
        }

        // Toggle walking animation
        if (isMoving && !hero.classList.contains('interacting')) {
            hero.classList.add('walking');
        } else {
            hero.classList.remove('walking');
        }

        currentX = Math.max(0, Math.min(window.innerWidth - hero.clientWidth, currentX));
        currentY = Math.max(0, Math.min(window.innerHeight - hero.clientHeight, currentY));

        hero.style.left = `${currentX}px`;
        hero.style.top = `${currentY}px`;
    }

    // Game loop for smooth manual movement
    function gameLoop() {
        if (isPlayerControlled) {
            updateHeroPosition();
        }
        requestAnimationFrame(gameLoop);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
});
