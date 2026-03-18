import os
import sys
import threading
import queue
import pyodbc
from dotenv import load_dotenv

# .env 파일 로드: exe 실행 시 exe와 같은 폴더에서 찾음
if getattr(sys, 'frozen', False):
    _env_path = os.path.join(os.path.dirname(sys.executable), '.env')
else:
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(_env_path)

# 데이터베이스 연결 정보 설정
# 환경 변수에서 가져오거나, 없을 경우 기본값을 사용합니다.
# 실제 운영 환경에서는 보안을 위해 반드시 환경 변수를 설정해야 합니다.
SERVER = os.getenv("DB_SERVER", "10.0.11.175,15000")  # DB 서버 주소 및 포트
DATABASE = os.getenv("DB_NAME", "WEBDEMO")          # 연결할 데이터베이스 이름
USERNAME = os.getenv("DB_USER", "esha")             # DB 접속 계정
PASSWORD = os.getenv("DB_PASSWORD", "ws5000997!")   # DB 접속 비밀번호

def _get_sql_server_drivers():
    """시스템에 설치된 SQL Server ODBC 드라이버 목록 반환 (우선순위 순)"""
    preferred = [
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "ODBC Driver 13 for SQL Server",
        "SQL Server Native Client 11.0",
        "SQL Server",
    ]
    installed = pyodbc.drivers()
    # 설치된 드라이버가 없으면 우선순위 목록 전체 시도 (IM002 시 32/64비트 불일치 가능)
    result = [d for d in preferred if d in installed]
    for d in installed:
        if d not in result and ("SQL Server" in d or "sql server" in d.lower()):
            result.append(d)
    drivers = [f"{{{d}}}" for d in result] if result else [f"{{{d}}}" for d in preferred]
    # 최초 1회만 설치된 드라이버 목록 로그
    if not hasattr(_get_sql_server_drivers, "_logged"):
        print(f"[INFO] 설치된 ODBC 드라이버: {installed}")
        print(f"[INFO] Python 비트: {64 if sys.maxsize > 2**32 else 32}bit")
        _get_sql_server_drivers._logged = True
    return drivers


def _create_connection():
    """새 DB 연결 생성 (풀에 없을 때만 호출)"""
    drivers = _get_sql_server_drivers()
    last_error = None
    for driver in drivers:
        try:
            extra = "TrustServerCertificate=yes;" if "ODBC Driver 1" in driver else ""
            cs = (
                f"DRIVER={driver};SERVER={SERVER};DATABASE={DATABASE};"
                f"UID={USERNAME};PWD={PASSWORD};{extra}"
            )
            return pyodbc.connect(cs)
        except pyodbc.Error as e:
            last_error = e
            if not hasattr(_create_connection, "_logged_driver"):
                print(f"[WARNING] Failed with {driver}: {e}")
            continue
    if last_error:
        raise last_error
    raise Exception("No suitable ODBC driver found.")


# 연결 풀: 요청마다 새 연결 생성 비용 절감 (최대 5개, 재사용)
_POOL: queue.Queue = queue.Queue(maxsize=5)
_POOL_LOCK = threading.Lock()


def get_db_connection():
    """
    DB 연결 반환. 풀에 여유 연결이 있으면 재사용, 없으면 새로 생성.
    conn.close() 시 풀에 반환됩니다.
    """
    conn = None
    try:
        conn = _POOL.get_nowait()
        # 연결 유효성 확인
        try:
            conn.cursor().execute("SELECT 1")
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            conn = _create_connection()
    except queue.Empty:
        conn = _create_connection()

    class _PooledConnection:
        def __init__(self, c):
            self._conn = c

        def __getattr__(self, name):
            return getattr(self._conn, name)

        def close(self):
            try:
                self._conn.cursor().execute("SELECT 1")
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass
                return  # 연결 끊김, 풀에 반환하지 않음
            try:
                _POOL.put_nowait(self._conn)
            except queue.Full:
                self._conn.close()

    return _PooledConnection(conn)
