# Core Technologies
*   **HTML5 & CSS3:** For structuring the digital room and implementing visual effects like Glassmorphism, Parallax, and high-performance image rendering.
*   **Vanilla JavaScript (ES Modules):** For the interactive logic, character navigation, coordinate mapping, and modal handling without external heavy frameworks.

# Asset Pipeline
*   **Python 3:** Used for processing AI-generated isometric images and character sprites.
*   **Pillow Library:** For image background removal, frame-by-frame sprite splitting, and animated GIF generation.
*   **AI Generative Models:** (e.g., Stable Diffusion, Gemini) for creating unique, high-quality isometric environment and character assets.

# Architecture & Design
*   **Modular JS Engine:** A custom-built engine with dedicated modules for `Renderer`, `RoomMapper`, and `Sprite` logic.
*   **Image-Space Mapping:** A custom coordinate system to link HTML viewport coordinates to the 1024x559 source image coordinates for consistent cross-device navigation.
*   **Static Deployment:** Designed to be lightweight and fully compatible with static hosting environments like GitHub Pages.

# Development Environment
*   **Git:** Version control for project management and deployment to GitHub.
*   **Python Virtual Environment (.venv):** To manage dependencies for the asset processing scripts.
