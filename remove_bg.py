from PIL import Image
import sys

def remove_background(input_path, output_path):
    # Open the image and convert to RGBA
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    # Get the background color from the top-left pixel
    bg_color = datas[0]
    
    newData = []
    threshold = 30 # Tolerance for background color

    for item in datas:
        # If the pixel is close to the background color, make it transparent
        if abs(item[0] - bg_color[0]) < threshold and \
           abs(item[1] - bg_color[1]) < threshold and \
           abs(item[2] - bg_color[2]) < threshold:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Saved new transparent image to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python remove_bg.py <input> <output>")
        sys.exit(1)
    
    remove_background(sys.argv[1], sys.argv[2])
