# Track Specification: Redesign to Personal Blog Integration

## Overview
This track involves redesigning the current isometric portfolio to incorporate a personal blog section. The isometric room remains the primary interactive home page, while the blog provides a space for "programming finds" and "tutorials."

## User Stories
- As a visitor, I want to explore the isometric room and discover the blog by clicking on relevant objects or using a navigation menu.
- As a reader, I want to view blog posts on a separate page with a clean layout.
- As a developer, I want to manage my blog posts using Markdown files for ease of authoring.
- As a visitor, I want to filter posts by category (e.g., "Tutorials") and search for specific topics.
- As a visitor, I want to see a "Recent Posts" widget on the home page to quickly access new content.

## Functional Requirements
- **Isometric Integration:** Add an interactive object (e.g., a laptop) in the room that links to the blog.
- **Navigation:** Implement a top or side navigation menu for quick access to the blog.
- **Blog Engine:** Develop a lightweight Markdown renderer (e.g., using `marked.js`) to convert `.md` files into HTML.
- **Blog Page:** Create a `blog.html` template for displaying the list of posts and individual post content.
- **Search & Filter:** Implement client-side searching and category filtering for the blog.
- **Recent Posts Widget:** Add a small UI component to the home page (index.html) that displays the 3 most recent blog post titles/links.

## Non-Functional Requirements
- **Performance:** Ensure Markdown rendering is fast and does not negatively impact page load.
- **Responsiveness:** The blog page must be fully responsive and work well on mobile devices.
- **Maintainability:** Post data (metadata like title, date, tags) should be stored in a central JSON/JS file for easy management.

## Acceptance Criteria
- [ ] Clicking the interactive object in the room navigates to the blog page.
- [ ] The navigation menu correctly links to the blog list.
- [ ] Markdown files are correctly rendered as blog posts on the separate page.
- [ ] Search and category filters accurately update the displayed post list.
- [ ] The "Recent Posts" widget displays the latest content on the home page.
- [ ] Code coverage for new JS modules is >80%.

## Out of Scope
- A full-featured CMS (content management system) or admin dashboard.
- Commenting system (e.g., Disqus).
- User authentication for reading posts.
