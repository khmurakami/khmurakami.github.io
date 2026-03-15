import os
import sys
from PIL import Image

def process(input_path, output_path):
    # Ensure output dir exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    img = Image.open(input_path).convert("RGBA")
    
    # Generative AI might have a solid white background, let's remove it
    data = img.getdata()
    new_data = []
    
    # We will grab the color of the top-left pixel to use as transparent key just in case
    bg_color = data[0]
    
    for item in data:
        # Distance to white
        dist_w = sum(abs(item[i]-255) for i in range(3))
        # Distance to top-left pixel
        dist_bg = sum(abs(item[i]-bg_color[i]) for i in range(3))
        
        if dist_w < 50 or dist_bg < 10:  # Tolerance
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    
    # Crop the image to nearest tight bounding box to find the actual character
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    # Now resize exactly to 128x64. We don't want to squish it weirdly.
    # Since it's an isometric grid of 4 32x64 frames, let's assume the sprite is basically a 4-frame strip.
    # We'll force it to 128x64 using nearest neighbor.
    img = img.resize((128, 64), Image.Resampling.NEAREST)
        
    img.save(output_path, "PNG")
    print(f"Saved optimized sprite to {output_path}")

    # Also make a QA magenta test image
    qa_path = output_path.replace("idle", "qa").replace(".png", "_magenta_test.png")
    os.makedirs(os.path.dirname(qa_path), exist_ok=True)
    qa_img = Image.new("RGBA", img.size, (255, 0, 255, 255))
    qa_img.paste(img, (0, 0), img)
    qa_img.save(qa_path, "PNG")
    print(f"Saved QA test to {qa_path}")

if __name__ == '__main__':
    process(sys.argv[1], sys.argv[2])
