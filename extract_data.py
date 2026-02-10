import json
import re

def extract_election_data(file_path, output_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Look for the Drupal.settings object
    # It starts with jQuery.extend(Drupal.settings, { ...
    # We are interested in the "election2026" key inside it.
    
    # Let's try to extract the JSON object.
    # Since it's inside a script tag and might be messy, we can look for "election2026":
    
    match = re.search(r'"election2026":\s*({.*?})\s*,\s*"footer"', content, re.DOTALL)
    
    # If that precise match fails (due to footer key or whitespace), let's try a broader capture 
    # and then parse the JSON.
    
    # Method 2: partial JSON extraction
    # Find start of election2026
    start_marker = '"election2026":'
    start_index = content.find(start_marker)
    
    if start_index == -1:
        print("Error: Could not find 'election2026' in file.")
        return

    # Start reading from the brace after the marker
    json_start = content.find('{', start_index)
    
    # Simple brace counter to find the end of this JSON object
    open_braces = 0
    json_end = -1
    
    for i in range(json_start, len(content)):
        if content[i] == '{':
            open_braces += 1
        elif content[i] == '}':
            open_braces -= 1
            if open_braces == 0:
                json_end = i + 1
                break
    
    if json_end == -1:
        print("Error: Could not parse valid JSON object for election2026.")
        return

    json_str = content[json_start:json_end]
    
    try:
        data = json.loads(json_str)
        print(f"Successfully extracted data for {len(data.get('divisions', {}))} divisions.")
        
        # Save to file
        with open(output_path, 'w', encoding='utf-8') as out_f:
            json.dump(data, out_f, indent=2, ensure_ascii=False)
        print(f"Data saved to {output_path}")
        
    except json.JSONDecodeError as e:
        print(f"JSON Decode Error: {e}")
        # Debug: print a snippet
        print(f"Snippet: {json_str[:200]}...")

if __name__ == "__main__":
    extract_election_data(
        'c:/Users/Asus/Desktop/Bangladesh Election Map/Bangladesh/Code.txt',
        'c:/Users/Asus/Desktop/Bangladesh Election Map/Bangladesh/election_data.json'
    )
