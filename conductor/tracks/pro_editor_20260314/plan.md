# Implementation Plan: Professional Editor & Content Refinement

## Phase 1: Advanced Insertion Tools (Tables & Images)
- [ ] Task: Implement the "Insert Image" action in `blog.js` (prompt for URL/Alt and insert Markdown snippet).
- [ ] Task: Build the Visual Table Grid Selector.
    - [ ] Create the HTML/CSS for the hover-grid dropdown menu in the toolbar.
    - [ ] Write logic in `blog.js` to generate the correct Markdown table structure based on the selected grid size (e.g., 3x3).
- [ ] Task: Ensure `blog.css` handles rendered images responsively (`max-width: 100%`).
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Insertion Tools' (Protocol in workflow.md)

## Phase 2: Professional Typography Controls
- [ ] Task: Add a "Typography Panel" or dropdown to the editor toolbar.
- [ ] Task: Implement the Font Family, Font Size, and Line Height controls.
    - [ ] Map these controls to CSS Custom Properties (Variables) dynamically in `js/blog.js`.
    - [ ] Ensure changes instantly reflect in the "View Page" mode.
- [ ] Task: Persist typography settings for the session (or globally via `localStorage`).
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Typography' (Protocol in workflow.md)

## Phase 3: Enhanced Markdown Engine & Help
- [ ] Task: Integrate live syntax highlighting into the editor textarea.
    - [ ] Evaluate adding a lightweight library (e.g., Prism.js) or building a custom regex-based overlay.
- [ ] Task: Enhance `BlogRenderer.js` to support extended Markdown (Tables, Task Lists).
    - [ ] Update tests in `BlogRenderer.test.js` to cover new syntax parsing.
- [ ] Task: Build and style a slide-out "Markdown Cheatsheet" Help Panel.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Markdown Engine' (Protocol in workflow.md)
