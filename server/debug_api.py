import urllib.request
import json

try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/get_data') as response:
        data = json.loads(response.read().decode())
        
        # Check q10001 specifically
        target_q = 'q10001'
        found = False
        for item in data:
            if item.get('qnum') == target_q:
                found = True
                print(f"Found {target_q}:")
                print(f"QM Code Len: {len(item.get('qmcode', ''))}")
                print(f"Perl Q Code Len: {len(item.get('PerlSourceQ', ''))}")
                print(f"Perl C Code Len: {len(item.get('PerlSourceC', ''))}")
                break
        
        if not found:
            print(f"{target_q} NOT found in data.")
        
except Exception as e:
    print(f"Error: {e}")
