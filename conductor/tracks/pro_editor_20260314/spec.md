# Track Specification: Professional Editor Integration & Architecture Refactor

## Overview
This track pivots from custom UI hacks to integrating a professional, enterprise-grade editor (Toast UI Editor) to provide a true Confluence-like WYSIWYG/Markdown experience. Simultaneously, it refactors the monolithic `blog.js` into a scalable, Object-Oriented component architecture.

## User Stories
- As a creator, I want to write posts using a true WYSIWYG editor that handles tables, images, and formatting natively without UI glitches.
- As a developer, I want the blog's JavaScript to be organized into clean, isolated classes so I can add future features without causing regressions.

## Functional Requirements
- **Toast UI Editor Integration:**
    - Replace the custom `<textarea>` and manual toolbar with the `@toast-ui/editor` library.
    - Configure the editor to default to WYSIWYG mode while allowing Markdown toggling.
    - Bind the existing `GitHubStorageService` to the editor's output for live publishing.
    - Bind the existing LocalStorage auto-save logic to the editor's change events.
- **Object-Oriented Refactor:**
    - Break `blog.js` into distinct ES Modules:
        - `BlogApp.js`: Coordinates the initialization and communication between controllers.
        - `SidebarController.js`: Manages Feed/Tree toggles, Drag & Drop, and Discovery UI.
        - `EditorController.js`: Encapsulates the Toast UI Editor initialization, layout toggling, and saving.
        - `NavigationController.js`: Handles URL parameters, browser history, and deep linking.

## Non-Functional Requirements
- **Stability:** The OO refactor must resolve all overlapping UI state bugs (e.g., hidden classes not applying correctly).
- **Aesthetic Integration:** The Toast UI Editor must be styled (or wrapped) to blend seamlessly with the "Cozy Night" dark theme when in view mode, and transition cleanly into the white "Centered Canvas" when in edit mode.

## Acceptance Criteria
- [ ] `blog.js` is replaced by modular classes.
- [ ] Clicking "Edit Page" initializes and reveals the Toast UI Editor.
- [ ] The editor natively supports tables, images, and headings without custom code insertion logic.
- [ ] Auto-save and GitHub publishing work seamlessly with the new editor instance.
- [ ] The Doc Tree and Feed navigation function flawlessly under the new `SidebarController`.
