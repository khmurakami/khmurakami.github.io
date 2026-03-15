import os
from google import genai
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure the Gemini API
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

print("Listing models:")
for model in client.models.list():
    print(f"Model: {model}")
