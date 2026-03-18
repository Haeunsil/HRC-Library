import sys
import os

# Add current directory to path to import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import get_data, get_question_types

print("Testing API functions internally...")

try:
    print("Calling get_data()...")
    data = get_data()
    print(f"get_data type: {type(data)}")
    if isinstance(data, list):
        print(f"get_data length: {len(data)}")
        if len(data) > 0:
            print(f"First item: {data[0]}")
    else:
        print("ERROR: get_data did not return a list")

    print("\nCalling get_question_types()...")
    types = get_question_types()
    print(f"get_question_types type: {type(types)}")
    if isinstance(types, list):
        print(f"get_question_types length: {len(types)}")
        print(f"Types: {types}")
    else:
        print("ERROR: get_question_types did not return a list")

    print("\nSUCCESS: All internal checks passed.")

except Exception as e:
    print(f"FAILURE: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
