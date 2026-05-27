import os
import time
import google.generativeai as genai
from pathlib import Path

# Setup Gemini API
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY environment variable not set.")
    exit(1)

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

base_dir = Path(__file__).parent.parent / "Great_Thinkers"

def process_file(filepath):
    print(f"Processing: {filepath.name}")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "## 8. Historical Connections" in content:
        print("Already processed. Skipping.")
        return

    prompt = f"""
You are a historian. Read the following profile of a historical thinker. 
Your task is to identify key historical figures (ideally among other world-renowned thinkers, scientists, artists, and leaders) who influenced them, and who they influenced.
Respond strictly with a Markdown formatted section starting with `## 8. Historical Connections` followed by two bulleted lists: `- **Influenced By:**` and `- **Influenced:**`. Keep it concise but accurate. Do not include any other text.

Profile:
{content}
"""
    try:
        response = model.generate_content(prompt)
        addition = response.text.strip()
        
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write("\n\n" + addition + "\n")
        print("Done.")
    except Exception as e:
        print(f"Error processing {filepath.name}: {e}")

count = 0
if not base_dir.exists():
    print(f"Directory {base_dir} not found.")
    exit(1)

for md_file in base_dir.rglob("*.md"):
    process_file(md_file)
    count += 1
    time.sleep(2) # Respect rate limits

print(f"Finished processing {count} files.")
