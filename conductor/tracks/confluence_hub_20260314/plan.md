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
- [x] Task: Develop the `DocTreeService` to organize posts into nested structures. fefb481
    - [x] Write unit tests for tree generation (Categories > Tags > Posts).
    - [x] Implement the service logic.
- [x] Task: Build the interactive tree component in the sidebar. 7909305
    - [x] Add expand/collapse folder animations.
    - [x] Ensure deep-linking works when clicking tree items.
- [x] Task: Implement Drag & Drop and Structure Management. cc7f290
    - [x] Add "New Folder" and "New Page" actions to the tree UI.
    - [x] Implement HTML5 Drag & Drop API for reorganizing items.
    - [x] Develop logic to track structural changes in a "Draft State".
- [x] Task: Conductor - User Manual Verification 'Phase 2: Doc Tree' (Protocol in workflow.md) [checkpoint: cc7f290]

## Phase 3: Live GitHub Editor & Toolbar [checkpoint: 1ba0d7e]
- [x] Task: Develop the `GitHubStorageService` for API integration. a9a3e8e
    - [x] Implement secure token handling (prompt user for PAT).
    - [x] Build the commit/push logic using GitHub REST API.
    - [x] Write unit tests for data serialization and API request preparation.
- [x] Task: Implement Local Storage Auto-save for draft protection. 1ba0d7e
- [x] Task: Integrate a Markdown editor library into the "Edit" view. 1ba0d7e
- [x] Task: Build the Confluence-style toolbar with status badges. 1ba0d7e
- [x] Task: Conductor - User Manual Verification 'Phase 3: Live Editor' (Protocol in workflow.md) [checkpoint: 1ba0d7e]
