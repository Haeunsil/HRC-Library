import urllib.request
import json

try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/get_data') as response:
        data = json.loads(response.read().decode())
        
        if data:
            print("First item keys:", list(data[0].keys()))
            print("First item Perl keys values:", 
                  data[0].get('perlcodeQ', 'Not Found'), 
                  data[0].get('PerlSourceQ', 'Not Found'))
        else:
            print("No data returned")
            
except Exception as e:
    print(f"Error: {e}")
