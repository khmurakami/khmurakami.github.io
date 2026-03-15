# Implementation Plan: Redesign to Personal Blog Integration

## Phase 1: Scaffolding & Blog Engine [checkpoint: a4d1699]
- [x] Task: Initialize `posts/` directory and create sample Markdown posts.
- [x] Task: Add `marked.js` library for Markdown parsing.
- [x] Task: Develop `BlogService` module for fetching and parsing post metadata.
    - [x] Write unit tests for `BlogService` (fetching post list, parsing metadata).
    - [x] Implement `BlogService`.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding & Blog Engine' (Protocol in workflow.md)

## Phase 2: Blog Layout & Post Rendering
- [~] Task: Create `blog.html` and `blog.css` for the blog's main layout.
- [ ] Task: Develop `BlogRenderer` module to convert Markdown to HTML.
    - [ ] Write unit tests for `BlogRenderer`.
    - [ ] Implement `BlogRenderer`.
- [ ] Task: Implement the blog list view and individual post view logic in `blog.js`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Blog Layout & Post Rendering' (Protocol in workflow.md)

## Phase 3: Search, Filtering & Widgets
- [ ] Task: Implement search and category filtering in `BlogService`.
    - [ ] Write unit tests for search and filtering logic.
    - [ ] Implement search and category filtering.
- [ ] Task: Create the "Recent Posts" widget for the home page.
    - [ ] Write unit tests for widget data fetching and rendering.
    - [ ] Implement Recent Posts widget on `index.html`.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Search, Filtering & Widgets' (Protocol in workflow.md)

## Phase 4: Integration & Navigation
- [ ] Task: Add an interactive object (e.g., a laptop) to the isometric room that links to the blog.
- [ ] Task: Implement a responsive navigation menu (top or side) on all pages.
- [ ] Task: Update character navigation to handle transitions between the room and the blog page.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Integration & Navigation' (Protocol in workflow.md)

## Phase 5: Final Refinement & Mobile Optimization
- [ ] Task: Polish CSS styling for a consistent "cozy" aesthetic across the blog and room.
- [ ] Task: Verify responsive design and touch interactions on mobile.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Final Refinement' (Protocol in workflow.md)
