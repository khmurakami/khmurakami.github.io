# Track Specification: Confluence-Style Documentation Hub

## Overview
This track transforms the blog into a professional documentation hub. It introduces a dual-navigation system (Feed vs. Doc Tree), a centered "page canvas" visual style, and a live Markdown editor that saves changes directly to GitHub.

## User Stories
- As a creator, I want to write and edit my blog posts directly on the site using professional tools.
- As a reader, I want to browse content using a nested folder structure (Doc Tree) for better organization.
- As a visitor, I want a clean, "centered page" reading experience that feels like professional documentation.

## Functional Requirements
- **Centered Page Canvas:** Redesign the post detail view to feature a solid white/light "page" centered on a subtle, atmospheric background.
- **Dual-Navigation Sidebar:** Implement a left sidebar with two modes:
    - **Feed Mode:** The current chronological blog post list.
    - **Doc Tree Mode:** A nested, expandable folder structure based on categories and tags.
- **Live GitHub Editor:**
    - A WYSIWYG or high-end Markdown editor visible in "Edit Mode."
    - **GitHub API Integration:** Authenticate via a Personal Access Token (stored locally in browser) to commit changes directly to the repo.
- **Confluence-Style Toolbar:**
    - Formatting tools (Bold, Italic, H1/H2, Lists).
    - Media insertion (Images, Tables).
    - **Status Badges:** Customizable labels like "Draft," "In Progress," or "Verified."

## Non-Functional Requirements
- **Security:** Use secure browser storage for GitHub tokens.
- **Visual Consistency:** Ensure the "Centered Page" visual style feels like a high-end documentation platform while keeping the "cozy night" background as the surroundings.
- **Performance:** Ensure the nested tree and live editor are responsive.

## Acceptance Criteria
- [ ] Users can toggle between "Feed" and "Doc Tree" navigation in the sidebar.
- [ ] Posts are displayed on a centered white canvas that matches the reference design.
- [ ] Clicking "Edit" opens a toolbar and an editable area for the post.
- [ ] Saving changes successfully commits the updated Markdown file to the GitHub repository via API.
- [ ] Status badges are correctly rendered and editable.

## Out of Scope
- Multi-user collaboration.
- Real-time previews of multiple branch deployments.
