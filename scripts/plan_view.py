"""Draws the roof as a plan — looking down at it, not along it.

    python scripts/plan_view.py
    python scripts/plan_view.py --scene workshop --out tmp/plan.png

The world is authored in a side view, so that is the only way anyone ever looks
at it, and it is the wrong view for judging arrangement. From the side, depth
is a scale factor and a sort order; from above, it is a floor plan — and a floor
plan is where you can see whether a roof is a set of places somebody uses or a
strip of objects at even intervals.

What it shows:

  the walkable route      as a shaded band, so you can see where it narrows
  every prop              at its x and z, sized by how big it is drawn
  solid props             outlined, because those are the ones you walk around
  interactive props       marked, because those are the reasons to go anywhere
  the named zones         labelled along the top

Colour is by role rather than by asset, so a glance says what KIND of place
each stretch of roof is.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

BG = (18, 14, 32)
DECK = (34, 28, 58)
ROUTE = (52, 44, 84)
GRID = (28, 23, 48)

COLOURS = {
    "clutter": (96, 92, 126),
    "solid": (150, 138, 190),
    "interactive": (255, 176, 92),
    "door": (140, 236, 255),
    "light": (255, 214, 150),
    "backdrop": (60, 54, 92),
}

MARGIN = 40
LABEL_H = 26


def read_scene(scene_id):
    """The manifest, via Node — it is an ES module that computes its own props."""
    script = """
    import { scenes } from './js/config/scenes.js';
    import { Walkway } from './js/engine/Walkway.js';

    const out = [];
    for (const { id, manifest } of scenes) {
        const w = manifest.walkway ? new Walkway(manifest.walkway) : null;
        const route = [];
        if (w) {
            for (let x = w.from; x <= w.to; x += 20) {
                for (const b of w.bandsAt(x)) route.push({ x, near: b.near, far: b.far });
            }
        }
        out.push({
            id,
            width: manifest.width,
            actorPlane: manifest.actorPlane,
            spawn: manifest.actor ? manifest.actor.place.x : null,
            route,
            props: manifest.props.map(p => ({
                id: p.id, x: p.x, z: p.z ?? null, plane: p.plane,
                height: p.height,
                solid: !!p.solid,
                interact: !!p.interact,
                door: !!p.door,
                light: !!p.light,
                generated: /_\\d+$/.test(p.id)
            }))
        });
    }
    process.stdout.write(JSON.stringify(out));
    """
    node = "node.exe" if sys.platform == "win32" else "node"
    result = subprocess.run([node, "--input-type=module", "-e", script],
                            cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise RuntimeError(result.stderr)

    scenes = json.loads(result.stdout)
    for s in scenes:
        if s["id"] == scene_id:
            return s
    raise SystemExit(f"no scene called {scene_id}")


def role(prop):
    if prop["door"]:
        return "door"
    if prop["interact"]:
        return "interactive"
    if prop["solid"]:
        return "solid"
    if prop["light"]:
        return "light"
    return "clutter"


def draw(scene, out_path, scale, depth_px):
    width = int(scene["width"] * scale) + MARGIN * 2
    height = depth_px + MARGIN * 2 + LABEL_H

    plan = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(plan)

    def sx(x):
        return MARGIN + x * scale

    def sz(z):
        # z 0 is the front edge, nearest the camera — so it is the BOTTOM of a
        # plan, the way you would stand looking at the building.
        return MARGIN + LABEL_H + (1 - z) * depth_px

    # ── The deck, and the route across it ────────────────────────
    d.rectangle([MARGIN, MARGIN + LABEL_H, width - MARGIN,
                 MARGIN + LABEL_H + depth_px], fill=DECK)

    for band in scene["route"]:
        x0 = sx(band["x"])
        d.rectangle([x0, sz(band["far"]), x0 + 20 * scale, sz(band["near"])],
                    fill=ROUTE)

    # Every 500px, so distances are readable.
    for x in range(0, scene["width"] + 1, 500):
        d.line([sx(x), MARGIN + LABEL_H, sx(x), MARGIN + LABEL_H + depth_px], fill=GRID)
        d.text((sx(x) + 2, MARGIN + LABEL_H + depth_px + 4), str(x), fill=(90, 84, 120))

    # ── The props ────────────────────────────────────────────────
    for p in sorted(scene["props"], key=lambda p: p["height"], reverse=True):
        if p["plane"] != scene["actorPlane"] and p["z"] is None:
            continue
        z = p["z"] if p["z"] is not None else 0.5

        # Radius from the drawn height, so a water tower reads bigger than a weed.
        r = max(1.5, min(9.0, p["height"] * scale * 0.9))
        cx, cy = sx(p["x"]), sz(z)
        colour = COLOURS[role(p)]

        if p["generated"]:
            # Clutter is drawn as a dot; placed things get a disc, so the
            # balance between the two is visible at a glance.
            d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5],
                      fill=colour)
        else:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour,
                      outline=(230, 220, 255) if p["solid"] else None)

    # ── The spawn ────────────────────────────────────────────────
    if scene["spawn"] is not None:
        x = sx(scene["spawn"])
        d.line([x, MARGIN + LABEL_H, x, MARGIN + LABEL_H + depth_px],
               fill=(255, 120, 100))
        d.text((x + 3, MARGIN + 4), "you arrive", fill=(255, 120, 100))

    d.text((MARGIN, 8), f"{scene['id']} — plan view, back of the roof at the top",
           fill=(150, 140, 180))

    plan.save(out_path)
    return plan


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--scene", default="roof")
    parser.add_argument("--out", default="tmp/plan.png")
    parser.add_argument("--scale", type=float, default=0.26)
    parser.add_argument("--depth", type=int, default=300)
    args = parser.parse_args(argv)

    scene = read_scene(args.scene)
    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)

    plan = draw(scene, out, args.scale, args.depth)
    print(f"{len(scene['props'])} props -> {out.relative_to(ROOT)} "
          f"({plan.width}x{plan.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
