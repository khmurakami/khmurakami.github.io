# Isometric Room Portfolio

Welcome to my cozy, interactive developer space! 

This is a lightweight portfolio built entirely with HTML, CSS, and Vanilla JavaScript, designed to run flawlessly on GitHub Pages. Instead of a typical scrolling website, this acts as a mini-game or digital room where you can explore my projects and background.

## How it works

The entire experience is powered by **Image Mapping** and **Absolute Positioning**.

1.  **The Room:** The main background is a single, beautiful isometric image (located in `assets/room.png`) that was generated and scaled using CSS `object-fit: contain` to stay perfectly proportioned on any screen size.
2.  **The Interactables:** The "hotspots" (the laptop, bed, and bookshelf) aren't complex 3D objects. They are actually completely invisible HTML `<div>` elements, positioned precisely over the image using percentage-based CSS (e.g., `left: 45%; top: 35%`). When you click these invisible zones, JavaScript opens a minimalist CSS Glassmorphism modal to display the content.
3.  **The Character:** The character is an independent `<img>` tag floating on top of the background. It uses a JavaScript "wander" script to randomly pick coordinates on the floor and smoothly CSS animate towards them. If you press the keyboard (W, A, S, D or Arrows), the wander script cancels, and you gain full control of the `left` and `top` positioning in real-time.

## The Image Generation Process

To achieve this specific art style, we used AI generation carefully stitched together. All assets are stored in the `/assets/` directory.

### 1. Generating the Room
*   **Prompt setup:** `A 3D isometric lay of a cozy developer bedroom, soft warm lighting, containing a desk with dual monitors, a cozy bed, some indoor plants, and a bookshelf. Clean modern aesthetic, highly detailed, perfect for an interactive portfolio.`

### 2. Generating the Hero Sprite
To create a cleanly removable character sprite, we had to ensure it was created against a solid background (not a transparent checkerboard, which AI struggles to key out natively).
*   **Prompt setup:** `A simple highly aesthetic minimal pixel art 2d sprite of a human indie developer wearing a hoodie, standing, isometric angle. The background MUST BE PURE SOLID WHITE (#FFFFFF). No checkerboard background, strictly a solid white background so it can be easily keyed out. No floor pad/shadow beneath if possible.`
*   **Processing:** We used a local Python script (`remove_bg.py` included in this repo) utilizing the Pillow library to strip out all white pixels, leaving us with a perfectly transparent `.png` sprite (`assets/characters/hero_idle.png`).

### 3. Generating the Jump Animation
To make the character feel alive, we needed a continuous sprite sheet that perfectly matched the generated hero.
*   **Prompt setup:** `A simple highly aesthetic minimal pixel art sprite sheet of this specific human indie developer wearing a hoodie jumping. 3x3 grid, sequence, frame by frame animation, square aspect ratio, transparent background. Must look exactly like the reference character.`
*   **Processing:** We created a second Python script (`split_sprites.py`) that took the resulting 3x3 grid image, mathematically chopped it into 9 individual frames based on the total pixel width/height, and saved them chronologically. It then used the Pillow library to stitch them together into an animated `.gif` with a 100ms delay per frame.
*   **Implementation:** When the user presses the 'Spacebar', JavaScript adds a `.jumping` CSS class to the character. This class temporarily overrides the source image with the animated `.gif` and adds a CSS `transform: translateY(-10px)` to make the character physically pop upward on the screen.

Feel free to explore the code, fork the repository, and swap the assets to create your own cozy space!