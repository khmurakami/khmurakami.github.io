# Track Specification: Professional Editor & Content Refinement

## Overview
This track elevates the built-in Confluence-style editor to professional standards. It focuses on a custom-built toolbar with advanced features like a visual table builder, deep typography controls, image handling, and enhanced Markdown capabilities to ensure a high-end blogging experience.

## User Stories
- As a creator, I want to visually select table dimensions (e.g., 3x3) to quickly insert professional tables into my posts.
- As a writer, I want to easily insert images into my blog posts via a URL prompt or standard Markdown snippet.
- As a writer, I want to adjust the typography (font, size, spacing) of my page in real-time to match different editorial styles.
- As a developer, I want my Markdown code to be syntax-highlighted while I type for better readability.
- As a power user, I want access to a Markdown help panel so I don't have to remember complex syntax.

## Functional Requirements
- **Visual Table Builder:** Implement a hover-grid selector in the toolbar that inserts the corresponding Markdown table structure.
- **Image Insertion:** A toolbar action that prompts the user for an Image URL and Alt Text, then inserts the correct `![alt](url)` Markdown snippet.
- **Typography Property Panel:**
    - **Font Selection:** Dropdown to switch between Serif (Literary), Sans-Serif (Modern), and Monospace (Technical).
    - **Size & Spacing:** Real-time controls for Base Font Size, Line Height, and Paragraph Spacing.
- **Enhanced Editor Engine:**
    - **Live Syntax Highlighting:** Integrate a lightweight highlighting layer (e.g., using `Prism.js` or a custom overlay) for Markdown syntax within the editor.
    - **Extended Markdown Support:** Support for Task Lists (`[x]`), Footnotes, and Tables in the `BlogRenderer`.
- **Markdown Help Panel:** A slide-out or modal "Cheatsheet" detailing standard and extended Markdown syntax.

## Non-Functional Requirements
- **Fluid Real-Time Preview:** The "View Page" mode must instantly reflect all typography and content changes.
- **Integrated Aesthetic:** The Typography Panel, Table Builder, and Image prompts must match the "Cozy Night" / Confluence hybrid visual style.
- **Reliability:** Ensure that complex Markdown elements (like tables and large images) don't break the layout of the centered page canvas. Images should be responsive (`max-width: 100%`).

## Acceptance Criteria
- [ ] Clicking the Table icon opens a grid selector; selecting 3x2 inserts a 3-column, 2-row Markdown table.
- [ ] Clicking the Image icon prompts for a URL and inserts the proper Markdown.
- [ ] Images render responsively within the "View Page" mode.
- [ ] Changing the font size or line height in the editor immediately updates the rendered page.
- [ ] Markdown syntax (e.g., #, **, `) is highlighted while typing in the editor.
- [ ] Task lists and tables render correctly in the "View Page" mode.
- [ ] The Markdown Help Panel is accessible and covers all implemented features.

## Out of Scope
- File-based image uploading (drag-and-drop local file upload to a backend server). We will rely on hotlinking URLs for now.
- Collaborative multi-user editing.
