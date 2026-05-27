import sys
import os
import google.generativeai as genai
from pathlib import Path

if len(sys.argv) < 3:
    print("Usage: python debate_simulator.py <path_to_thinker1.md> <path_to_thinker2.md> [optional: topic]")
    sys.exit(1)

file1 = Path(sys.argv[1])
file2 = Path(sys.argv[2])
topic = sys.argv[3] if len(sys.argv) > 3 else "the fundamental nature of reality and human purpose"

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY environment variable not set.")
    sys.exit(1)

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-pro')

with open(file1, 'r', encoding='utf-8') as f:
    t1_content = f.read()

with open(file2, 'r', encoding='utf-8') as f:
    t2_content = f.read()

prompt = f"""
You are a master playwright and historian. Your task is to write a dynamic, intellectually rigorous, and highly in-character debate between the two thinkers provided below.

The topic of their debate is: {topic}

Here is the profile for Thinker 1:
{t1_content}

Here is the profile for Thinker 2:
{t2_content}

Instructions:
1. Closely follow their 'Persona & Communication Style' (tone, vocabulary, debate style).
2. The debate should be deeply philosophical but accessible.
3. Include subtle stage directions in brackets (e.g., [paces thoughtfully], [adjusts spectacles]).
4. Format the output as a Markdown script, e.g., `**Socrates:** ...`
5. Do not write a summary at the end; let the debate speak for itself.
"""

print(f"Simulating debate between {file1.stem} and {file2.stem} on the topic of {topic}...\n")

try:
    response = model.generate_content(prompt)
    out_dir = Path(__file__).parent.parent / "Debates"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{file1.stem}_vs_{file2.stem}.md"
    
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f"# Debate: {file1.stem.replace('_', ' ')} vs {file2.stem.replace('_', ' ')}\n")
        f.write(f"**Topic:** {topic}\n\n")
        f.write(response.text)
        
    print(f"Debate successfully generated and saved to {out_file}")
except Exception as e:
    print(f"Error generating debate: {e}")
