---
name: isometric-pixel-art-generator
description: >
  Generate professional 2:1 isometric pixel art game assets with animation strips,
  transparent backgrounds, character sprites, and QA validation. Use this skill
  whenever the user wants pixel art assets, character animations, cozy room props,
  sprite sheets, or game-ready isometric art — even if they just say "make me a
  character" or "draw a cozy room thing". Always trigger for pixel art, sprites,
  isometric assets, or anything going into a game or GitHub Pages scene.
---

# Isometric Pixel Art Production Pipeline

## Core Rules — Never Break These

1. **Style reference is law.** Always attach `C:\Users\khmur\projects\khmurakami.github.io\assets\generated\isometric_dual_desk.png` before generating anything. Every output must match its style.
2. **Transparent background always.** No white, no grey, no checkerboard. PNG alpha only.
3. **No gradients. No blur. No flat black.** Flat indexed colors, hue-shifted outlines only.
4. **One asset at a time.** Generate → QA → approve → next. Never batch.
5. **Character design is locked after first approval.** Never change face, hoodie, shoes, or hair across any animation.

---

## PHASE 1 — Spatial Rules (Lock Before Every Session)

- **Projection:** 2:1 isometric (26.565°). Every diagonal = 2px right / 1px down. No exceptions.
- **Grid:** 16×16 pixel base unit. All objects snap to this grid.
- **Light source:** Top-left always. Three planes: Top = lightest, Left = mid, Right = darkest.
- **Character scale:** 64×128px per frame. Never smaller — expressions won't read.
- **Prop scale:** 128×128px standard. 256×128px for wide furniture. 64×64px for small clutter.

---

## PHASE 2 — Color Rules

| Zone       | Rule                                                              |
| ---------- | ----------------------------------------------------------------- |
| Highlight  | Brighter + less saturated + warm hue shift (amber/cream)          |
| Midtone    | Base color from reference palette                                 |
| Shadow     | Darker + more saturated + cool hue shift (violet/navy)            |
| Outline    | Deep desaturated version of object's dominant hue. Never #000000. |
| Background | 100% transparent alpha. Zero baked-in floor shadows on canvas.    |

Max 32 indexed colors per asset. Silhouette must read clearly on dark backgrounds.

---

## PHASE 3 — Style Reference (Attach Every Time)

**Path:** `C:\Users\khmur\projects\khmurakami.github.io\assets\generated\isometric_dual_desk.png`

Instruct the model verbatim:

> "Match this image's pixel art style exactly:
>
> - Same pixel density and chunky pixel size
> - Same 2:1 isometric angle — NOT front-facing, NOT 3/4 perspective
> - Same 1px hue-shifted outlines, never flat black
> - Same flat color planes — no gradients, no blur, no soft edges
> - Same level of detail — do not simplify or over-detail
> - Extract and match the color palette mood from this image"

### Hard Rejection Criteria — Regenerate Immediately If:

- Output is front-facing or wrong perspective
- Any gradient, glow, or soft edge is visible
- Outlines are flat black (#000000)
- Character has white or colored background (not transparent)
- Shapes are blobs or ovals instead of pixel clusters
- Character design changed from approved master (wrong hair, outfit, shoes)
- Canvas size is wrong

---

## PHASE 4 — Character System

### Design Lock (establish on first generation, never change)

- Black hoodie, dark messy hair, pale skin, white sneakers
- 64×128px per frame
- Must be readable at 1x — face, outfit, shoes all distinguishable

### Animation Library

| File                  | Frames | Size   | Strip Total | FPS | Description                                           |
| --------------------- | ------ | ------ | ----------- | --- | ----------------------------------------------------- |
| `char_idle_down.png`  | 4      | 64×128 | 256×128     | 6   | Breathing, facing camera                              |
| `char_idle_up.png`    | 4      | 64×128 | 256×128     | 6   | Breathing, facing away                                |
| `char_idle_left.png`  | 4      | 64×128 | 256×128     | 6   | Breathing, facing left                                |
| `char_idle_right.png` | 4      | 64×128 | 256×128     | 6   | Breathing, facing right                               |
| `char_walk_down.png`  | 8      | 64×128 | 512×128     | 10  | Walk toward camera                                    |
| `char_walk_up.png`    | 8      | 64×128 | 512×128     | 10  | Walk away from camera                                 |
| `char_walk_left.png`  | 8      | 64×128 | 512×128     | 10  | Walk left                                             |
| `char_walk_right.png` | 8      | 64×128 | 512×128     | 10  | Walk right                                            |
| `char_wave.png`       | 6      | 64×128 | 384×128     | 8   | Hover reaction — arm raises, small "hi!" bubble fr3-5 |
| `char_surprised.png`  | 4      | 64×128 | 256×128     | 10  | Click reaction — jump 2px, "!" bubble fr1-2, settle   |
| `char_sit.png`        | 2      | 64×96  | 128×96      | 6   | Seated idle, slight lean                              |
| `char_yawn.png`       | 4      | 64×128 | 256×128     | 6   | Arm to mouth, eyes close, "z" floats fr4              |
| `char_shadow.png`     | 1      | 64×16  | 64×16       | —   | Dark ellipse, 40% opacity, renders under character    |

### Generation Order (strict)

1. `char_idle_down.png` — get approval, lock design
2. All other idles (reuse design exactly)
3. Walk cycles (all 4 directions)
4. Reactions (wave, surprised, sit, yawn)
5. Shadow last

### Character Prompt Formula

```
Match the pixel art style of the attached reference image exactly.
Isometric pixel art character: black hoodie, dark messy hair, pale skin, white sneakers.
[animation description], [N]-frame horizontal sprite strip,
each frame 64x128px, total strip [N*64]x128px,
2:1 isometric view, flat indexed colors, hue-shifted outlines (never #000000),
no gradients, no blur, transparent background, zero padding between frames,
pivot anchor at feet — same pixel every frame
```

---

## PHASE 5 — Room & Props

### Room Background

Generate as a single composite image — not individual props.

```
room_background.png — 800x500px
Cozy night cabin, isometric view, crescent moon through large window,
lit fireplace, dark wood bookshelf, green couch, loft bed with stairs,
fairy lights strung overhead, warm amber lighting, deep violet/navy shadows,
pixel art style matching reference, NO character, NO foreground furniture
```

### Foreground Layer (renders in front of character)

```
room_foreground.png — 800x500px, transparent everywhere except overlap objects
Couch front edge, table edge, stair railing — anything character walks behind
```

### Animated Props

| File                          | Frames | Size    | Strip Total | FPS | Animation                                |
| ----------------------------- | ------ | ------- | ----------- | --- | ---------------------------------------- |
| `anim_fireplace_strip.png`    | 6      | 64×64   | 384×64      | 10  | Flickering flame, orange/amber/red shift |
| `anim_fairy_lights_strip.png` | 6      | 128×32  | 768×32      | 8   | Bulbs twinkle on/off staggered           |
| `anim_floor_lamp_strip.png`   | 4      | 128×128 | 512×128     | 6   | Amber glow pulse                         |
| `anim_plant_sway_strip.png`   | 4      | 128×128 | 512×128     | 6   | Leaves drift 1-2px left/right            |

### Prop Prompt Formula

```
Match the pixel art style of the attached reference image exactly.
Isometric pixel art [object name], top-left lighting,
hue-shifted shadows (violet/navy), hue-shifted highlights (amber/cream),
no gradients, no blur, no anti-aliasing, flat indexed colors only,
1px hue-shifted outlines (never #000000),
[W]x[H]px canvas, transparent background, game asset
```

---

## PHASE 6 — QA Checklist (Run After Every Single Generation)

### Background

- [ ] Background is 100% transparent
- [ ] Magenta Test: Fill bg with #FF00FF — zero color fringe or bleed anywhere
- [ ] Re-mask and regenerate if fringe exists — do not deliver with white edges

### Pixel Quality

- [ ] Zoom 400%: No jaggies on diagonals
- [ ] No orphan pixels (stray dots disconnected from shape)
- [ ] Outlines are 1px hue-shifted dark, never #000000
- [ ] No gradient banding — shading uses dithering/clusters only

### Animation

- [ ] Frame count matches spec exactly
- [ ] Strip width = frame_width x frame_count (no rounding)
- [ ] Pivot anchor identical pixel in every frame — check feet/base
- [ ] Last frame loops cleanly back to frame 1
- [ ] Export QA gif at target FPS and verify no jitter

### Character Consistency

- [ ] Same hoodie color, hair shape, skin tone, shoes as char_idle_down master
- [ ] Face readable at 1x scale
- [ ] Shadow ellipse present and correctly positioned

---

## PHASE 7 — File Output

### Folder Structure

```
assets/
├── character/
│   ├── idle/
│   ├── walk/
│   ├── react/
│   └── shadow/
├── room/
│   ├── room_background.png
│   ├── room_foreground.png
│   └── room_floor_bounds.json
├── animated/
└── qa/
```

### Manifest Entry (write one per asset)

```json
{
  "asset_id": "",
  "file_path": "assets/[folder]/[filename].png",
  "frame_width": 0,
  "frame_height": 0,
  "total_frames": 0,
  "strip_width": 0,
  "fps": 0,
  "pivot_x": 0,
  "pivot_y": 0,
  "background": "transparent",
  "qa_magenta_test": "pass",
  "character_design_match": "pass"
}
```

---

## PHASE 8 — Browser Build Order (after all assets approved)

1. room_background.png as CSS background
2. Walkable bounds from room_floor_bounds.json
3. Character + shadow rendered on canvas layer
4. room_foreground.png layered on top
5. Walk cycle wired to autonomous pathfinding
6. Hover → char_wave, click → char_surprised
7. 5s idle timeout → random char_sit or char_yawn
8. Animated props injected as canvas overlays at correct room coordinates
