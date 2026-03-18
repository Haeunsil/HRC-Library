import sys
from database import get_db_connection
import pyodbc

print("Testing database connection...")
try:
    conn = get_db_connection()
    print("SUCCESS: Connection established successfully!")
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    print(f"Server Version: {row[0]}")
    conn.close()
except Exception as e:
    print(f"FAILURE: {e}")
    sys.exit(1)
