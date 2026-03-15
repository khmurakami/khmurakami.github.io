# Implementation Plan: Confluence-Style Documentation Hub

## Phase 1: Centered Canvas & Dual Navigation
- [ ] Task: Create the "Centered Page Canvas" UI in `blog.html` and `blog.css`.
    - [ ] Design the white/light page container with box shadows and precise padding.
    - [ ] Update background styles to frame the page with the "cozy night" theme.
- [ ] Task: Implement the Sidebar Mode Toggle (Feed vs. Doc Tree).
    - [ ] Add toggle buttons to the sidebar header.
    - [ ] Create the state management in `js/blog.js` to switch between views.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Visual Overhaul' (Protocol in workflow.md)

## Phase 2: Nested Documentation Tree
- [ ] Task: Develop the `DocTreeService` to organize posts into nested structures.
    - [ ] Write unit tests for tree generation (Categories > Tags > Posts).
    - [ ] Implement the service logic.
- [ ] Task: Build the interactive tree component in the sidebar.
    - [ ] Add expand/collapse folder animations.
    - [ ] Ensure deep-linking works when clicking tree items.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Doc Tree' (Protocol in workflow.md)

## Phase 3: Live GitHub Editor & Toolbar
- [ ] Task: Integrate a Markdown editor library into the "Edit" view.
- [ ] Task: Build the Confluence-style toolbar with status badges.
    - [ ] Implement formatting buttons and badge selection logic.
- [ ] Task: Develop the `GitHubStorageService` for API integration.
    - [ ] Implement secure token handling (prompt user for PAT).
    - [ ] Build the commit/push logic using GitHub REST API.
    - [ ] Write unit tests for data serialization and API request preparation.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Live Editor' (Protocol in workflow.md)
