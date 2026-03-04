from PIL import Image
import os
import sys

def split_sprite_sheet(image_path, output_dir, grid_size=(3, 3)):
    """Splits a sprite sheet into individual frames and saves them as PNGs."""
    try:
        img = Image.open(image_path)
    except Exception as e:
        print(f"Error opening image: {e}")
        return

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    img_width, img_height = img.size
    cols, rows = grid_size
    
    frame_width = img_width // cols
    frame_height = img_height // rows

    frame_count = 0
    frames = []

    for row in range(rows):
        for col in range(cols):
            # Calculate coordinates for the current frame
            left = col * frame_width
            top = row * frame_height
            right = left + frame_width
            bottom = top + frame_height

            # Crop the frame
            frame = img.crop((left, top, right, bottom))
            frames.append(frame)
            
            # Save individual frame
            frame_path = os.path.join(output_dir, f"frame_{frame_count:02d}.png")
            frame.save(frame_path, "PNG")
            print(f"Saved {frame_path}")
            
            frame_count += 1

    # Also save as an animated GIF
    try:
        gif_path = os.path.join(output_dir, "jumping.gif")
        frames[0].save(
            gif_path,
            save_all=True,
            append_images=frames[1:],
            duration=100, # 100ms per frame = 10fps
            loop=0        # 0 = infinite loop
        )
        print(f"Saved animated GIF to {gif_path}")
    except Exception as e:
        print(f"Error saving GIF: {e}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python split_sprites.py <input_image_path> <output_directory>")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    split_sprite_sheet(input_path, output_dir)
