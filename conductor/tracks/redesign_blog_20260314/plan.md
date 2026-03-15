# Implementation Plan: Redesign to Personal Blog Integration

## Phase 1: Scaffolding & Blog Engine [checkpoint: a4d1699]
- [x] Task: Initialize `posts/` directory and create sample Markdown posts.
- [x] Task: Add `marked.js` library for Markdown parsing.
- [x] Task: Develop `BlogService` module for fetching and parsing post metadata.
    - [x] Write unit tests for `BlogService` (fetching post list, parsing metadata).
    - [x] Implement `BlogService`.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding & Blog Engine' (Protocol in workflow.md)

## Phase 2: Blog Layout & Post Rendering [checkpoint: b7b552c]
- [x] Task: Create `blog.html` and `blog.css` for the blog's main layout.
- [x] Task: Develop `BlogRenderer` module to convert Markdown to HTML.
    - [x] Write unit tests for `BlogRenderer`.
    - [x] Implement `BlogRenderer`.
- [x] Task: Implement the blog list view and individual post view logic in `blog.js`.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Blog Layout & Post Rendering' (Protocol in workflow.md)

## Phase 3: Search, Filtering & Widgets [checkpoint: 14d63fb]
- [x] Task: Implement search and category filtering in `BlogService`.
    - [x] Write unit tests for search and filtering logic.
    - [x] Implement search and category filtering.
- [x] Task: Create the "Recent Posts" widget for the home page.
    - [x] Write unit tests for widget data fetching and rendering.
    - [x] Implement Recent Posts widget on `index.html`.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Search, Filtering & Widgets' (Protocol in workflow.md)

## Phase 4: Integration & Navigation [checkpoint: e1aaf21]
- [x] Task: Refine home page with professional headings, navigation, and branding.
- [x] Task: Add an interactive object (e.g., a laptop) to the isometric room that links to the blog.
- [x] Task: Implement a responsive navigation menu (top or side) on all pages.
- [x] Task: Update character navigation to handle transitions between the room and the blog page.
- [x] Task: Conductor - User Manual Verification 'Phase 4: Integration & Navigation' (Protocol in workflow.md)

## Phase 5: Final Refinement & Mobile Optimization
- [x] Task: Polish CSS styling for a consistent "cozy" aesthetic across the blog and room.
- [x] Task: Verify responsive design and touch interactions on mobile.
- [x] Task: Conductor - User Manual Verification 'Phase 5: Final Refinement' (Protocol in workflow.md)
