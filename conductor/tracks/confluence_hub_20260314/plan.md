# Implementation Plan: Confluence-Style Documentation Hub

## Phase 1: Centered Canvas & Dual Navigation [checkpoint: 9cac72e]
- [x] Task: Create the "Centered Page Canvas" UI in `blog.html` and `blog.css`. 9cac72e
    - [x] Design the white/light page container with box shadows and precise padding.
    - [x] Update background styles to frame the page with the "cozy night" theme.
- [x] Task: Implement the Sidebar Mode Toggle (Feed vs. Doc Tree). 9cac72e
    - [x] Add toggle buttons to the sidebar header.
    - [x] Create the state management in `js/blog.js` to switch between views.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Visual Overhaul' (Protocol in workflow.md) [checkpoint: 9cac72e]

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
