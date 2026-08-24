"""Composites a frame of the world, so composition can be looked at.

    python scripts/preview_scene.py --at 560
    python scripts/preview_scene.py --at 2380 --out tmp/greenhouse.png
    python scripts/preview_scene.py --strip

The world is authored in a manifest and only ever seen in a browser, which means
every judgement about COMPOSITION — is the centre empty, does the character read
against what is behind them, is the background too busy — has to be made by
running the site and squinting. That is a slow loop and a bad one: you cannot
diff a squint.

This draws the same frame the engine would, from the same manifest, with the
same parallax, depth scaling and plane order. It is not the engine: there is no
wind, no animation, and the lighting is approximated rather than dithered. What
it is exactly right about is WHERE EVERYTHING IS AND HOW BIG, which is the part
composition is made of.

`--strip` renders several points along the roof side by side, which is how you
see that one stretch of it is emptier than the rest.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

# The reference frame: a 1600x900 window at pixelScale 2.
VIEW_W = 800
VIEW_H = 450
DESIGN_H = 900
PIXEL_SCALE = 2


def read_world():
    """Everything needed to draw a frame, straight from the manifests."""
    script = r"""
    import { city } from './js/config/city.js';
    process.stdout.write(JSON.stringify({
        width: city.width,
        referenceHeight: city.referenceHeight,
        groundLine: city.groundLine,
        deck: city.deck,
        planes: city.planes,
        hazeColor: city.hazeColor || [0, 0, 0],
        groundTone: city.groundTone || '#141a3a',
        backdrops: city.backdrops || [],
        actorPlane: city.actorPlane,
        actor: city.actor,
        post: city.post,
        props: city.props.map(p => ({
            id: p.id, x: p.x, z: p.z ?? null, y: p.y ?? null,
            plane: p.plane, height: p.height, width: p.width ?? null,
            src: p.src ?? null, flip: !!p.flip, repeat: !!p.repeat,
            light: p.light ?? null, shadow: p.shadow !== false
        }))
    }));
    """
    node = "node.exe" if sys.platform == "win32" else "node"
    out = subprocess.run([node, "--input-type=module", "-e", script],
                         cwd=ROOT, capture_output=True, text=True,
                         encoding="utf-8", check=True).stdout
    return json.loads(out)


def load(src, cache):
    if src not in cache:
        path = ROOT / src.replace("./", "")
        cache[src] = Image.open(path).convert("RGBA") if path.exists() else None
    return cache[src]


def render(world, camera_x, cache, actor=None):
    unit = DESIGN_H / world["referenceHeight"] / PIXEL_SCALE
    deck = world["deck"]

    frame = Image.new("RGBA", (VIEW_W, VIEW_H),
                      tuple(int(world["groundTone"].lstrip("#")[i:i + 2], 16)
                            for i in (0, 2, 4)) + (255,))

    def depth_scale(z):
        return deck["frontScale"] + (deck["backScale"] - deck["frontScale"]) * z

    def ground_y(z):
        return (deck["frontY"] + (deck["backY"] - deck["frontY"]) * z) * VIEW_H

    def to_screen(x, parallax):
        # Whole-pixel camera, exactly as `Camera.toScreen` does it.
        return x / PIXEL_SCALE - round(camera_x * parallax / PIXEL_SCALE)

    lights = []

    for plane in world["planes"]:
        pid = plane["id"]
        is_floor = pid == world["actorPlane"]

        # ── Backdrops ────────────────────────────────────────────
        for b in world["backdrops"]:
            if b.get("plane") != pid:
                continue
            img = load(b["src"], cache)
            if img is None:
                continue
            draw_h = VIEW_H * b["heightFrac"] if b.get("heightFrac") else VIEW_H
            scale = draw_h / img.height
            w = int(img.width * scale)
            h = int(draw_h)
            y = int(VIEW_H - draw_h) if b.get("anchor") == "bottom" else 0
            band = img.resize((max(1, w), max(1, h)), Image.NEAREST)

            x = -(camera_x * plane["parallax"]) / PIXEL_SCALE
            if b.get("repeat"):
                x = x % w
                if x > 0:
                    x -= w
                while x < VIEW_W:
                    frame.alpha_composite(band, (int(x), y))
                    x += w
            else:
                frame.alpha_composite(band, (int(x), y))

        # ── Props ────────────────────────────────────────────────
        on_plane = [p for p in world["props"] if p["plane"] == pid]
        if is_floor and actor is not None:
            # The character depth-sorts among the props on the same terms, which
            # is the whole point of the deck being a floor rather than a line.
            on_plane = on_plane + [actor]
        if is_floor:
            on_plane.sort(key=lambda p: -(p["z"] if p["z"] is not None else 0.5))
        else:
            on_plane.sort(key=lambda p: (p["y"] or 0, p["height"]))

        for p in on_plane:
            img = load(p["src"], cache) if p["src"] else None
            if img is not None and p.get("frame"):
                # A sprite sheet: take the first frame of the idle row.
                img = img.crop((0, 0, p["frame"]["w"], p["frame"]["h"]))
            z = (p["z"] if p["z"] is not None else 0.5) if is_floor else None
            d = depth_scale(z) if is_floor else 1.0

            h = p["height"] * unit * d
            w = h * (img.width / img.height) if img else (p["width"] or p["height"]) * unit * d
            base_y = ground_y(z) if is_floor else VIEW_H * (p["y"] or 0.8)

            sx = to_screen(p["x"], plane["parallax"])

            if p["light"]:
                L = p["light"]
                lights.append({
                    "x": sx, "y": base_y - h + (L.get("oy") or h * 0.5),
                    "r": (L.get("radius") or 90) * unit,
                    "c": L.get("color") or [255, 200, 130],
                    "i": L.get("intensity", 1),
                    "pool": L.get("pool") is not False,
                    "baseY": base_y
                })

            if img is None:
                continue

            iw, ih = max(1, int(round(w))), max(1, int(round(h)))
            sprite = img.resize((iw, ih), Image.NEAREST)
            if p["flip"]:
                sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)

            if p["repeat"]:
                x = sx % iw
                if x > 0:
                    x -= iw
                while x < VIEW_W:
                    frame.alpha_composite(sprite, (int(x), int(base_y - ih)))
                    x += iw
            else:
                if sx + iw < -iw or sx - iw > VIEW_W + iw:
                    continue
                frame.alpha_composite(sprite, (int(sx - iw / 2), int(base_y - ih)))

        # ── Haze ─────────────────────────────────────────────────
        if plane.get("haze"):
            r, g, b = world["hazeColor"]
            wash = Image.new("RGBA", frame.size,
                             (r, g, b, int(255 * plane["haze"])))
            frame.alpha_composite(wash)

    return frame, lights


def add_lights(frame, lights):
    """An approximation of the engine's blooms and floor pools."""
    glow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow, "RGBA")

    for L in lights:
        r = max(4, L["r"])
        c = L["c"]
        for step in range(6, 0, -1):
            rr = r * step / 6
            a = int(26 * L["i"] * (1 - step / 7))
            d.ellipse([L["x"] - rr, L["y"] - rr, L["x"] + rr, L["y"] + rr],
                      fill=(c[0], c[1], c[2], a))
        if L["pool"]:
            rr = r * 1.5
            for step in range(5, 0, -1):
                sr = rr * step / 5
                a = int(16 * L["i"] * (1 - step / 6))
                d.ellipse([L["x"] - sr, L["baseY"] - sr * 0.22,
                           L["x"] + sr, L["baseY"] + sr * 0.22],
                          fill=(c[0], c[1], c[2], a))

    return Image.alpha_composite(frame, glow)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--at", type=float, default=None,
                        help="world x to centre the camera on")
    parser.add_argument("--character", type=float, default=None,
                        help="world x to stand the character at (defaults to --at)")
    parser.add_argument("--character-z", type=float, default=0.45)
    parser.add_argument("--strip", action="store_true",
                        help="several points along the roof, side by side")
    parser.add_argument("--out", default="tmp/preview.png")
    parser.add_argument("--scale", type=int, default=2)
    args = parser.parse_args(argv)

    world = read_world()
    cache = {}

    def standing_at(x, z):
        """The character as a prop, so the renderer can sort them with the rest."""
        a = world["actor"]
        c = a["content"]
        world_scale = a["place"]["height"] / (c["baseline"] - c["top"])
        return {
            "id": "character", "x": x, "z": z, "y": None,
            "plane": world["actorPlane"],
            "height": c["frameH"] * world_scale,
            "width": None, "src": a["src"], "flip": False, "repeat": False,
            "light": None, "shadow": True,
            "frame": {"w": c["frameW"], "h": c["frameH"]}
        }

    if args.strip:
        points = [400, 1400, 2400, 3100, 4200, 5400]
        shots = []
        for x in points:
            f, lights = render(world, max(0, x - 800), cache,
                               standing_at(x, args.character_z))
            shots.append((x, add_lights(f, lights)))

        sheet = Image.new("RGBA", (VIEW_W, (VIEW_H + 16) * len(shots)),
                          (10, 8, 20, 255))
        d = ImageDraw.Draw(sheet)
        for i, (x, shot) in enumerate(shots):
            sheet.alpha_composite(shot, (0, i * (VIEW_H + 16)))
            d.text((6, i * (VIEW_H + 16) + VIEW_H + 3), f"x {x}", fill=(160, 150, 190))
        out_img = sheet
    else:
        at = args.at if args.at is not None else world["actor"]["place"]["x"]
        cx = args.character if args.character is not None else at
        f, lights = render(world, max(0, at - 800), cache,
                           standing_at(cx, args.character_z))
        out_img = add_lights(f, lights)

    if args.scale != 1:
        out_img = out_img.resize(
            (out_img.width * args.scale, out_img.height * args.scale), Image.NEAREST)

    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out_img.convert("RGB").save(out)
    print(f"{out.relative_to(ROOT)}  ({out_img.width}x{out_img.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
