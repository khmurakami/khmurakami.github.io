import os
import json
import math
from PIL import Image, ImageDraw

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, 'assets', 'production')
GEN_DIR = os.path.join(ASSETS_DIR, 'generated')
QA_DIR = os.path.join(ASSETS_DIR, 'qa_previews')

os.makedirs(GEN_DIR, exist_ok=True)
os.makedirs(QA_DIR, exist_ok=True)

manifest = []

# Palettes
HAIR = (20, 20, 30, 255)
HOODIE = (40, 45, 60, 255)
PANTS = (30, 30, 40, 255)
SNEAKERS = (230, 230, 235, 255)
SKIN = (220, 180, 150, 255)
WOOD = (100, 60, 40, 255)
WOOD_LIGHT = (120, 80, 50, 255)
WOOD_DARK = (80, 40, 20, 255)
MONITOR_FRAME = (30, 30, 30, 255)
CODE_GREEN = (0, 255, 0, 255)
CODE_BG = (10, 20, 10, 255)
MUG = (240, 240, 240, 255)
CAT_ORANGE = (200, 120, 40, 255)
CAT_DARK = (160, 90, 30, 255)
FIRE_1 = (255, 200, 0, 255)
FIRE_2 = (255, 100, 0, 255)
FIRE_3 = (200, 50, 0, 200)

def save_asset(asset_id, frames, fps, pivot_x, pivot_y):
    width, height = frames[0].size
    total_frames = len(frames)
    strip = Image.new("RGBA", (width * total_frames, height), (0,0,0,0))
    
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * width, 0))
        
    png_path = os.path.join(GEN_DIR, f"{asset_id}_strip.png")
    strip.save(png_path)
    
    qa_path = os.path.join(QA_DIR, f"{asset_id}_test.gif")
    gif_frames = []
    for frame in frames:
        bg = Image.new("RGBA", (width, height), (255, 0, 255, 255))
        bg.paste(frame, (0,0), frame)
        gif_frames.append(bg.convert("RGB"))
        
    gif_duration = int(1000 / fps)
    gif_frames[0].save(qa_path, save_all=True, append_images=gif_frames[1:], duration=gif_duration, loop=0)
    
    manifest.append({
        "asset_id": asset_id,
        "file_path": f"/assets/production/generated/{asset_id}_strip.png",
        "qa_path": f"/assets/production/qa_previews/{asset_id}_test.gif",
        "dimensions": { "frame_width": width, "frame_height": height },
        "animation": { "total_frames": total_frames, "fps": fps, "type": "horizontal_strip" },
        "physics": { "pivot_x": pivot_x, "pivot_y": pivot_y }
    })

def make_char_walk_downright():
    frames = []
    w, h = 64, 64
    for i in range(12):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        t = i / 12.0 * math.pi * 2
        leg_offset = int(math.sin(t) * 3)
        arm_offset = int(-math.sin(t) * 2)
        
        # Left Leg
        draw.rectangle([30-leg_offset, 48, 34-leg_offset, 58], fill=PANTS)
        draw.rectangle([30-leg_offset, 58, 36-leg_offset, 60], fill=SNEAKERS)
        
        # Right Leg
        draw.rectangle([36+leg_offset, 46, 40+leg_offset, 56], fill=PANTS)
        draw.rectangle([36+leg_offset, 56, 42+leg_offset, 58], fill=SNEAKERS)

        # Body
        draw.rectangle([28, 30, 42, 50], fill=HOODIE)
        
        # Arms
        draw.rectangle([26, 30, 30, 45+arm_offset], fill=HOODIE)
        draw.rectangle([40, 30, 44, 45-arm_offset], fill=HOODIE)
        
        # Head
        draw.rectangle([30, 16, 40, 28], fill=SKIN)
        draw.rectangle([28, 14, 42, 20], fill=HAIR)
        frames.append(img)
    return frames

def make_char_sit_type():
    frames = []
    w, h = 64, 64
    for i in range(8):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        t = i / 8.0 * math.pi * 2
        type_offset = int(math.sin(t*3) * 1)
        
        # Legs horizontal
        draw.rectangle([30, 48, 44, 52], fill=PANTS)
        draw.rectangle([44, 48, 48, 56], fill=PANTS)
        draw.rectangle([46, 54, 52, 58], fill=SNEAKERS)
        
        # Body
        draw.rectangle([28, 34, 40, 50], fill=HOODIE)
        
        # Arm typing
        draw.polygon([(34, 36), (44, 42+type_offset), (36, 46+type_offset)], fill=HOODIE)
        draw.rectangle([42, 42+type_offset, 46, 46+type_offset], fill=SKIN)
        
        # Head
        draw.rectangle([30, 22, 40, 34], fill=SKIN)
        draw.rectangle([28, 20, 42, 26], fill=HAIR)
        frames.append(img)
    return frames

def make_char_idle_breathe():
    frames = []
    w, h = 64, 64
    for i in range(4):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        breathe = 1 if i in [1, 2] else 0
        blink = 1 if i == 2 else 0

        # Legs
        draw.rectangle([30, 48, 34, 58], fill=PANTS)
        draw.rectangle([36, 46, 40, 56], fill=PANTS)
        draw.rectangle([30, 58, 36, 60], fill=SNEAKERS)
        draw.rectangle([36, 56, 42, 58], fill=SNEAKERS)
        
        # Body
        draw.rectangle([28, 30-breathe, 42, 50], fill=HOODIE)
        
        # Head
        draw.rectangle([30, 16-breathe, 40, 28-breathe], fill=SKIN)
        draw.rectangle([28, 14-breathe, 42, 20-breathe], fill=HAIR)
        
        # Blink
        if blink:
            draw.rectangle([36, 22-breathe, 38, 24-breathe], fill=HAIR)
        
        frames.append(img)
    return frames

def make_desk_monitors_active():
    frames = []
    w, h = 128, 128
    for i in range(4):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        
        # Desk surface
        draw.polygon([(64, 80), (32, 64), (64, 48), (96, 64)], fill=WOOD)
        draw.polygon([(64, 80), (32, 64), (32, 70), (64, 86)], fill=WOOD_DARK)
        draw.polygon([(64, 80), (96, 64), (96, 70), (64, 86)], fill=WOOD_LIGHT)
        
        # Monitor 1 (Left)
        draw.rectangle([40, 30, 56, 46], fill=CODE_BG)
        draw.rectangle([38, 28, 58, 48], outline=MONITOR_FRAME, width=2)
        
        # Monitor 2 (Right)
        draw.rectangle([60, 26, 76, 42], fill=CODE_BG)
        draw.rectangle([58, 24, 78, 44], outline=MONITOR_FRAME, width=2)
        
        # Code scrolling (shift upward by 1px per frame)
        offset = i
        for my in range(0, 16, 4):
            y1 = 30 + ((my - offset) % 16)
            y2 = 26 + ((my - offset) % 16)
            if 30 <= y1 < 46: draw.line([(42, y1), (54, y1)], fill=CODE_GREEN, width=1)
            if 26 <= y2 < 42: draw.line([(62, y2), (74, y2)], fill=CODE_GREEN, width=1)
            
        # Keyboard
        draw.polygon([(56, 60), (48, 56), (56, 52), (64, 56)], fill=(50,50,50,255))
        
        # Mug
        draw.rectangle([68, 58, 72, 64], fill=MUG)
        
        # Cables (strict 1px dropping off back)
        draw.line([(58, 48), (58, 56), (40, 64), (40, 90)], fill=(20, 20, 20, 255), width=1)

        frames.append(img)
    return frames

def make_cat_sleep_breathe():
    frames = []
    w, h = 64, 64
    for i in range(4):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        breathe = 2 if i in [1, 2] else 0
        
        # Torso
        draw.ellipse([24, 46-breathe, 40, 56], fill=CAT_ORANGE)
        
        # Head (static)
        draw.ellipse([34, 48, 44, 58], fill=CAT_DARK)
        
        # Ears
        draw.polygon([(36, 48), (38, 44), (40, 48)], fill=CAT_ORANGE)
        draw.polygon([(40, 48), (42, 44), (44, 48)], fill=CAT_ORANGE)
        
        # Tail (static)
        draw.ellipse([18, 52, 28, 56], fill=CAT_DARK)

        frames.append(img)
    return frames

def make_vfx_fire_flicker():
    frames = []
    w, h = 64, 64
    for i in range(8):
        img = Image.new("RGBA", (w, h), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        # Base glow
        glow_rad = 16 + int(math.sin(i)*2)
        draw.ellipse([32-glow_rad, 48-glow_rad, 32+glow_rad, 48+glow_rad], fill=(200, 100, 0, 80))
        
        # Fire body
        h1 = int(abs(math.sin(i*1.5)) * 10)
        h2 = int(abs(math.cos(i)) * 8)
        draw.polygon([(26, 52), (32, 28-h1), (38, 52)], fill=FIRE_2)
        draw.polygon([(28, 52), (32, 34-h2), (36, 52)], fill=FIRE_1)
        draw.ellipse([26, 48, 38, 56], fill=FIRE_3)

        frames.append(img)
    return frames

def generate_all():
    print("Generating char_walk_downright...")
    save_asset("char_walk_downright", make_char_walk_downright(), 12, 32, 60)
    
    print("Generating char_sit_type...")
    save_asset("char_sit_type", make_char_sit_type(), 8, 32, 60)
    
    print("Generating char_idle_breathe...")
    save_asset("char_idle_breathe", make_char_idle_breathe(), 4, 32, 60)
    
    print("Generating desk_monitors_active...")
    save_asset("desk_monitors_active", make_desk_monitors_active(), 4, 64, 96)
    
    print("Generating cat_sleep_breathe...")
    save_asset("cat_sleep_breathe", make_cat_sleep_breathe(), 4, 32, 60)
    
    print("Generating vfx_fire_flicker...")
    save_asset("vfx_fire_flicker", make_vfx_fire_flicker(), 8, 32, 60)
    
    with open(os.path.join(ASSETS_DIR, 'production_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print("Successfully generated all assets and manifest.")

if __name__ == "__main__":
    generate_all()
