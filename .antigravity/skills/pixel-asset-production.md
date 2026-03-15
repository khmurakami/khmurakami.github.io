---
name: isometric-pixel-art-generator
description: >
  Generate professional 2:1 isometric pixel art game assets with animation strips,
  transparent backgrounds, and QA validation. Use this skill whenever the user wants
  to create cozy room assets, pixel art sprites, animated objects, isometric furniture,
  plants, decorations, or any game-ready pixel art — even if they just say "make me
  a pixel art lamp" or "draw a cozy desk". Always trigger for requests involving
  pixel art, isometric assets, sprite sheets, or cozy room decoration items.
---

# Isometric Pixel Art Production Pipeline

## Mission

Generate 2:1 isometric, game-ready pixel art assets optimized for a **cozy room scene**.
Every asset must: follow strict grid alignment, use hue-shifted color ramps (no flat black),
include a transparent background, and optionally produce an animation strip.

---

## PHASE 1 — Lock Spatial Rules Before Generating

Tell Imagen exactly:

- **Projection:** Strict 2:1 isometric (26.565° angle). Every diagonal line = 2px right / 1px down.
- **Base grid:** 16×16 pixel unit snap. All objects anchor to this grid.
- **Canvas size per frame:** 128×128 px (larger objects: 256×256 px).
- **Light source:** Top-left. Three visible planes: Top (lightest), Left (mid), Right (darkest).

---

## PHASE 2 — Color Science (Hue-Shifted Ramps, Never Flat Black)

| Zone       | Rule                                                                  |
| ---------- | --------------------------------------------------------------------- |
| Highlight  | Brighter + less saturated + warm hue shift (amber/cream)              |
| Midtone    | Base color — extracted from reference palette                         |
| Shadow     | Darker + more saturated + cool hue shift (violet/navy)                |
| Outline    | Deep desaturated version of the object's dominant hue. Never #000000. |
| Background | 100% transparent alpha (PNG). Zero baked-in shadows on canvas.        |

**Palette target:** Max 32 indexed colors per asset. Keep silhouette readable on dark backgrounds.

---

## PHASE 3 — Cozy Room Asset Vocabulary

The following objects are pre-approved for this scene. Use these descriptors verbatim in prompts:

### Furniture

- `isometric pixel art wooden desk, top-left lighting, 128x128, transparent bg`
- `isometric pixel art bookshelf full of books, warm wood tones, 128x128, transparent bg`
- `isometric pixel art cozy armchair with cushion, 128x128, transparent bg`
- `isometric pixel art bed with blanket and pillow, 128x128, transparent bg`
- `isometric pixel art small coffee table, 128x128, transparent bg`

### Decorations / Plants

- `isometric pixel art monstera plant in terracotta pot, 128x128, transparent bg` _(match the uploaded reference)_
- `isometric pixel art small succulent in pot, 64x64, transparent bg`
- `isometric pixel art framed picture on wall, 64x64, transparent bg`
- `isometric pixel art fairy lights string, 128x64, transparent bg`

### Lighting

- `isometric pixel art glowing desk lamp, warm amber light bloom, 64x64, transparent bg`
- `isometric pixel art floor lamp with soft glow, 128x128, transparent bg`

### Tech / Clutter

- `isometric pixel art laptop open on desk, 64x64, transparent bg`
- `isometric pixel art stack of books, 64x64, transparent bg`
- `isometric pixel art mug of coffee with steam, 32x32, transparent bg`

---

## PHASE 4 — Animation Strip Spec (Optional but Recommended)

When animating, generate a **1D horizontal sprite strip** (all frames side-by-side, zero padding).

| Asset Type          | Frames | FPS | Animation Type                |
| ------------------- | ------ | --- | ----------------------------- |
| Plant (idle sway)   | 4      | 6   | Subtle leaf oscillation       |
| Lamp (flicker/glow) | 4      | 8   | Light pulse / brightness wave |
| Mug (steam)         | 4      | 6   | Rising steam loop             |
| Fairy lights        | 6      | 12  | Twinkling on/off pattern      |
| Static furniture    | 1      | —   | No animation needed           |

**Strip format rule:** Frame width × frame count = total strip width. Height = single frame height.
Example: 4-frame plant at 128×128 → output PNG is **512×128 px**.

**Pivot anchor:** The base/bottom-center of the object must sit at the same X/Y across ALL frames.
If the anchor drifts even 1px, the animation will jitter in-engine.

---

## PHASE 5 — Imagen Prompt Formula

Use this exact formula for every asset request:

```
[style] [object name], [isometric angle], [lighting], [color mood],
[frame count if animated], [canvas size], transparent background,
no anti-aliasing blur, pixel-perfect edges, game asset, sprite sheet
```

### Example Prompts

**Static monstera (matching uploaded reference):**

```
2:1 isometric pixel art monstera plant in terracotta pot,
top-left lighting, deep green leaves with fenestration cutouts,
warm terracotta pot with soil texture, hue-shifted shadows (violet),
hue-shifted highlights (amber), 128x128 canvas, transparent background,
no blur, pixel-perfect, game asset
```

**Animated desk lamp (4-frame glow pulse):**

```
2:1 isometric pixel art glowing desk lamp, 4-frame horizontal sprite strip,
amber warm light bloom animation, top-left lighting, dark metal base,
each frame 64x64, total strip 256x64, transparent background,
pixel-perfect edges, cozy room game asset, no anti-aliasing blur
```

**Animated fairy lights (6-frame twinkle):**

```
2:1 isometric pixel art string of fairy lights draped in arc,
6-frame horizontal sprite strip, twinkling on/off light animation,
warm yellow and white bulbs, each frame 128x64, total strip 768x64,
transparent background, pixel-perfect, cozy game asset
```

---

## PHASE 6 — Background Removal & Validation Checklist

After Imagen generates the asset, run this QA checklist:

### Background Removal

- [ ] Export as PNG with alpha channel
- [ ] If background is not transparent: use `rembg` or manual masking on the bounding silhouette
- [ ] **Magenta Test:** Temporarily fill background with `#FF00FF`. Any color bleed or fringe = fail. Re-mask.
- [ ] Check corners and leaf edges — these are highest-risk areas for alpha bleed

### Pixel Integrity

- [ ] Zoom to 400%: No jaggies (stair-step artifacts on diagonals)
- [ ] No orphan pixels (isolated 1px dots disconnected from the shape)
- [ ] Outlines are 1px wide and use hue-shifted dark (not #000000)
- [ ] Shading uses clusters/dithering — no straight banding lines

### Animation Validation (if animated)

- [ ] Frame count matches spec
- [ ] Strip width = frame_width × frame_count exactly
- [ ] Pivot anchor (base of object) is identical pixel coordinate in every frame
- [ ] Frame [last] transitions cleanly back to Frame [1]
- [ ] Preview as GIF at target FPS — no jitter, no ghost pixels

### Isometric Grid Check

- [ ] All diagonal edges follow 2:1 ratio (2px across, 1px down)
- [ ] Object fits within 16px base grid — no overhangs that break tile snapping

---

## PHASE 7 — Output Manifest

For every asset generated, record this JSON block:

```json
{
  "asset_id": "monstera_plant",
  "file": "monstera_plant_strip.png",
  "frame_width": 128,
  "frame_height": 128,
  "total_frames": 4,
  "strip_width": 512,
  "fps": 6,
  "pivot_x": 64,
  "pivot_y": 120,
  "background": "transparent",
  "qa_magenta_test": "pass",
  "notes": "Matches uploaded isometric_monstera_plant.png reference"
}
```

---

## Quick-Start: Full Cozy Room Asset List

Generate these in order (largest → smallest to establish scale reference):

1. Floor / room base tile (256×128)
2. Bookshelf (128×128)
3. Desk (128×128)
4. Armchair (128×128)
5. Bed (256×128)
6. Floor lamp — animated 4fr (128×128 strip: 512×128)
7. Desk lamp — animated 4fr (64×64 strip: 256×64)
8. Monstera plant — animated 4fr (128×128 strip: 512×128)
9. Small succulent (64×64)
10. Fairy lights — animated 6fr (128×64 strip: 768×64)
11. Laptop (64×64)
12. Coffee mug with steam — animated 4fr (32×32 strip: 128×32)
13. Stack of books (64×64)
14. Framed picture (64×64)
