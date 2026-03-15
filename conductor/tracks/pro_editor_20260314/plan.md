# Implementation Plan: Professional Editor Integration & Architecture Refactor

## Phase 1: Architectural Refactor
- [x] Task: Create `js/controllers/SidebarController.js` and move tree/feed logic into it.
- [x] Task: Create `js/controllers/NavigationController.js` for URL handling and history.
- [x] Task: Create `js/controllers/EditorController.js` (initially with existing logic) and `BlogApp.js` to orchestrate them.
- [x] Task: Replace `js/blog.js` inclusion in `blog.html` with the new `BlogApp.js` module.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Refactor' (Protocol in workflow.md)

## Phase 2: Toast UI Editor Integration
- [x] Task: Install `@toast-ui/editor` via CDN in `blog.html`.
- [x] Task: Remove the custom toolbar, table grid, and textarea from `blog.html` and `blog.css`.
- [x] Task: Update `EditorController.js` to initialize the Toast UI Editor on the target div.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Editor UI' (Protocol in workflow.md)

## Phase 3: Data Binding & Polish
- [ ] Task: Bind the `EditorController` to the `GitHubStorageService` to pull `editor.getMarkdown()` on publish.
- [ ] Task: Bind the `localStorage` auto-save logic to the editor's `change` event.
- [ ] Task: Refine CSS to ensure the Toast UI Editor fits perfectly within the "Centered Canvas" without overflowing or causing double scrollbars.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Data & Polish' (Protocol in workflow.md)
