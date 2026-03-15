import os
from google import genai
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure the Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not found in .env file")

client = genai.Client(api_key=api_key)

def generate_sprite(prompt, output_path="generated_sprite.png"):
    """
    Prototype function to generate a sprite using Gemini (Nano Banana).
    """
    print(f"Generating sprite for prompt: {prompt}")
    
    try:
        # Use the Nano Banana model (gemini-2.5-flash-image)
        # Note: We need to check if it returns an image directly in the response
        response = client.models.generate_content(
            model='gemini-2.5-flash-image',
            contents=prompt
        )
        
        # Check if the response contains image data
        # Based on typical multimodal responses, it might be in candidates[0].content.parts[0].inline_data
        # But for image generation models, it might be different.
        
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    with open(output_path, "wb") as f:
                        f.write(part.inline_data.data)
                    print(f"Successfully generated and saved sprite to {output_path}")
                    return True
        
        print("API Response did not contain image data.")
        print("Response Text (if any):", response.text)
        return False
    except Exception as e:
        print(f"Error generating sprite: {e}")
        return False

if __name__ == "__main__":
    test_prompt = "A simple highly aesthetic minimal pixel art 2d sprite of a human indie developer wearing a hoodie, standing, isometric angle. The background MUST BE PURE SOLID WHITE (#FFFFFF)."
    generate_sprite(test_prompt)
