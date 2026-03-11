# Implementation Plan: Improve Character Sprite Quality and Animations

## Phase 1: Setup & API Integration
- [x] Task: Verify Gemini API key in `.env` and setup local environment for AI generation. 8b6f2ba
- [ ] Task: Create a prototype Python script to generate character sprites using Gemini AI prompts.
- [ ] Task: Conductor - User Manual Verification 'Setup & API Integration' (Protocol in workflow.md)

## Phase 2: Asset Pipeline Refinement
- [ ] Task: Consolidate `remove_bg.py` and `split_sprites.py` into a unified `asset_processor.py`.
    - [ ] Write Tests: Create unit tests for background removal and sprite splitting logic.
    - [ ] Implement: Refactor existing scripts into a modular Python tool.
- [ ] Task: Implement automated sprite sheet generation from individual AI-generated frames.
- [ ] Task: Conductor - User Manual Verification 'Asset Pipeline Refinement' (Protocol in workflow.md)

## Phase 3: Character Enhancement (TDD)
- [ ] Task: Generate and process high-quality **Idle** animation frames.
- [ ] Task: Generate and process high-quality **Walk** animation frames.
- [ ] Task: Generate and process high-quality **Jump** animation frames.
- [ ] Task: Conductor - User Manual Verification 'Character Enhancement' (Protocol in workflow.md)

## Phase 4: Engine Integration & Validation
- [ ] Task: Update `Sprite.js` to support new animation metadata and frame sizes.
    - [ ] Write Tests: Create unit tests for the updated `Sprite` class.
    - [ ] Implement: Add support for dynamic frame sizes and new animation states.
- [ ] Task: Integrate new sprite sheets into `main.js` and verify rendering in the game loop.
- [ ] Task: Final verification of animations (Idle, Walk, Jump) on desktop and mobile.
- [ ] Task: Conductor - User Manual Verification 'Engine Integration & Validation' (Protocol in workflow.md)
