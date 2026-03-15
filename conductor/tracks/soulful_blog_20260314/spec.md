# Track Specification: Soulful Blog & Visual Harmony

## Overview
This track executes a total visual and behavioral overhaul of the blog experience. It aims to eliminate the "weird" overlapping posts bug and bring the entire page into 100% visual harmony with the isometric cozy night aesthetic. The result will be a professional, focused, and "soulful" blogging environment.

## User Stories
- As a visitor, I want the blog to feel like an extension of the cozy room, not a different site.
- As a reader, I want a clean, isolated view of a single post without any "ghost" content from the feed.
- As a creator, I want a publishing flow that feels premium, smooth, and deliberate.

## Functional Requirements
- **Atmospheric Visual Identity:** Replace the centered white canvas with a high-end "Grounded Glass" theme that matches the isometric room's night palette (deep blues, warm glows, creamy text).
- **Cinematic View Switching:** Implement a state-driven transition system that ensures the Post Feed and Post Detail are mutually exclusive and animate smoothly.
- **Floating Action Center:** A refined, translucent "Command Bar" that docks navigation, edit, and publish tools in a unified, Apple-standard UI.
- **Soulful Publish Modal:** A focused, high-contrast modal for GitHub authentication and commit messages that feels like a native system alert.

## Non-Functional Requirements
- **Zero-Ghosting Logic:** Ensure the feed container is 100% hidden and its space reclaimed when viewing a single post.
- **Motion Polish:** Use high-end easing functions (e.g., Apple's cubic-bezier) for all UI transitions.
- **Typography Excellence:** Standardize on 'Inter' and 'Courier New' with perfect line heights and character spacing.

## Acceptance Criteria
- [ ] No residual post content is visible at the top when viewing a single post.
- [ ] The blog's visual style is identical to the home page's "cozy night" theme.
- [ ] The publish flow uses an integrated, beautiful modal instead of browser prompts.
- [ ] Every button and transition feels intentional and smooth.
