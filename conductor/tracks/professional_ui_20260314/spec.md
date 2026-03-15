# Track Specification: Professional UI & Navigation Hub

## Overview
This track focuses on professionalizing the home page layout to make it feel like a fully-featured developer blog and portfolio. The goal is to fill out "empty" space with functional navigation elements like a persistent category sidebar, a featured content hero, and a modern command-palette search.

## User Stories
- As a visitor, I want to see categories (Tutorials, Finds, Projects) easily accessible in a sidebar.
- As a reader, I want to see the latest featured post at the top of the home page.
- As a professional recruiter, I want to quickly see a bio card with action buttons (Resume, Hire Me).
- As a power user, I want to press 'Cmd+K' to quickly search for blog posts or projects.

## Functional Requirements
- **Persistent Sidebar (Left):** Implement a glassmorphic sidebar on the left that contains blog categories, a tag cloud, and secondary navigation links.
- **Featured Content Hero (Top):** Create a professional banner at the very top of the home page (just below the brand header) to highlight the latest blog post.
- **Developer Intro Panel (Top-Right):** Add a sleek "Bio Card" with a summary, "Download Resume" CTA, and "Hire Me" button.
- **Command Palette Search (Cmd+K):** Develop a full-screen search overlay that activates with a keyboard shortcut and provides interactive results.

## Non-Functional Requirements
- **Layout Integrity:** The room image should remain centered and scale appropriately as the sidebar takes up space.
- **Visual Harmony:** All new UI elements must use the "cozy night" theme (glassmorphism, Inter font, creamy-yellow/coral accents).
- **Responsive Design:** Hide or collapse the sidebar into a menu icon on smaller screens to maintain usability.

## Acceptance Criteria
- [ ] The sidebar is persistent and correctly displays blog categories from `posts.js`.
- [ ] The featured banner displays the title and excerpt of the latest post.
- [ ] The intro panel bio and CTA buttons are visually balanced and clickable.
- [ ] Pressing `Cmd+K` opens the search overlay, and typing shows relevant results from the blog engine.
- [ ] The home page feels "full" and professional while keeping the isometric room as a focal point.

## Out of Scope
- Backend for newsletter signups (client-side only for now).
- Multi-language support.
