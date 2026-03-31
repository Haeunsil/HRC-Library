from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from database import get_db_connection
import pyodbc
import time
import re
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from email.header import Header
from contextlib import asynccontextmanager
import traceback

# 문의/샘플추가 수신자 (쉼표로 구분 시 복수 수신, 동일 메일에 수신인 여러 명 표시)
_INQUIRY_RECIPIENT_RAW = os.getenv("INQUIRY_RECIPIENT", "hrc.esha@gmail.com,jychoihrc@gmail.com")
INQUIRY_RECIPIENTS = [r.strip() for r in _INQUIRY_RECIPIENT_RAW.split(",") if r.strip()] or ["hrc.esha@gmail.com"]
INQUIRY_RECIPIENT = ", ".join(INQUIRY_RECIPIENTS)  # To 헤더용
# 수신자 2명 이상일 때 sendmail(수신자목록)로 명시적 발송 (send_message는 일부 환경에서 첫 수신자만 처리하는 경우 있음)
print(f"[INFO] 문의/샘플추가 수신자: {INQUIRY_RECIPIENTS}")

SUMMARY_CACHE: Dict[str, Any] = {"data": None, "loaded_at": 0.0}
SUMMARY_TTL_SECONDS = 600  # 10분 (5분→10분으로 연장)


def _load_summary_into_cache():
    """summary 캐시 로드 (시작 시 프리로드용)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT QuestionQnum, QuestionTag, QuestionType
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionQnum IS NOT NULL
                ORDER BY QuestionQnum
            """)
            rows = cursor.fetchall()
            data = []
            for row in rows:
                try:
                    qnum = f"q{row.QuestionQnum}"
                    tag = row.QuestionTag or qnum
                    if tag and not str(tag).strip():
                        tag = qnum
                    data.append({
                        "qnum": qnum,
                        "questionTag": tag,
                        "questionType": clean_string(row.QuestionType)
                    })
                except Exception as e:
                    print(f"[WARNING] 캐시 프리로드 row 스킵 (qnum={getattr(row, 'QuestionQnum', '?')}): {e}")
            SUMMARY_CACHE["data"] = data
            SUMMARY_CACHE["loaded_at"] = time.time()
            print(f"[INFO] 캐시 프리로드 완료: {len(data)}건")
        finally:
            conn.close()
    except Exception as e:
        print(f"[WARNING] 캐시 프리로드 실패 (첫 요청 시 로드됨): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작 시 summary 캐시 프리로드 (첫 사용자 대기 시간 단축)"""
    import threading
    DETAIL_CACHE.clear()  # 구버전(regUserId 없는) 캐시 제거
    t = threading.Thread(target=_load_summary_into_cache, daemon=True)
    t.start()
    yield
    # shutdown 시 정리 (필요 시)


# FastAPI 인스턴스 생성
app = FastAPI(
    lifespan=lifespan,
    title="HRC 라이브러리 API",
    description="설문 조사 질문 라이브러리 관리를 위한 API 서버입니다.",
    version="1.0.0"
)

# 모든 예외를 잡아서 상세 에러 메시지를 반환하는 핸들러
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[ERROR] 500 at {request.url.path}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}", "type": str(type(exc))},
    )

# GZip 압축: JSON 응답 크기 축소로 실서버 전송 시간 단축 (클라이언트가 Accept-Encoding: gzip 보낼 때)
app.add_middleware(GZipMiddleware, minimum_size=500)

# 정적 파일 no-cache: 배포 후 항상 최신 코드 로드 (index.html, version.json, assets)
from starlette.middleware.base import BaseHTTPMiddleware


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """API가 아닌 정적 파일 응답에 Cache-Control no-cache 헤더 추가"""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.scope.get("path", "")
        if not path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)

# CORS (Cross-Origin Resource Sharing) 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # 모든 출처 허용
    allow_credentials=False,     # 쿠키/인증 미사용 (wildcard origins와 함께 사용 시 False여야 함)
    allow_methods=["*"],         # 모든 HTTP 메서드 허용
    allow_headers=["*"],         # 모든 HTTP 헤더 허용
)

def clean_string(val: Any) -> str:
    """
    데이터베이스에서 가져온 문자열 값을 정리합니다.
    NULL 값이거나 'NULL' 문자열인 경우 빈 문자열로 변환하고,
    그 외에는 앞뒤 공백을 제거합니다.
    """
    if val is None:
        return ""
    s = str(val)
    if not s or s == "NULL":
        return ""
    return s.strip()

class InquiryRequest(BaseModel):
    """문의하기 요청 본문"""
    email: str = ""
    message: str = ""


class AddQuestionRequest(BaseModel):
    """문항추가 요청 본문: 이메일/문항 설명/태그/코드/비고"""
    email: str = ""
    question_desc: str = ""   # 문항 설명
    tag: str = ""            # 태그 (적용되는 속성 e.g. 랜덤고정, 대분류제시 등)
    code: str = ""           # 코드
    remarks: Optional[str] = None  # 비고 (null 가능)


class RagChatRequest(BaseModel):
    """RAG 챗봇: 사용자 메시지"""
    message: str = ""


def _send_inquiry_email(subject: str, text: str, body_name: str, email_val: str) -> None:
    """공통 이메일 발송 로직 (문의/문항추가)"""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    if not (smtp_host and smtp_user and smtp_pass):
        print(f"[EMAIL] SMTP 미설정 - 메일 미발송. {subject}")
        raise HTTPException(
            status_code=503,
            detail="이메일 발송이 설정되지 않았습니다. 서버의 .env에 SMTP_HOST, SMTP_USER, SMTP_PASS를 설정해 주세요."
        )

    msg = MIMEMultipart()
    msg["Subject"] = Header(subject, "utf-8")
    fallback = os.getenv("FALLBACK_FROM_SMTP", "").lower() in ("1", "true", "yes")
    if not fallback:
        msg["From"] = formataddr((body_name or "문의자", email_val), charset="utf-8")
        msg["Reply-To"] = email_val
    else:
        msg["From"] = smtp_user or "noreply@hrc.co.kr"
        msg["Reply-To"] = formataddr((body_name or "문의자", email_val), charset="utf-8")
    msg["To"] = INQUIRY_RECIPIENT
    msg.attach(MIMEText(text, "plain", "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, INQUIRY_RECIPIENTS, msg.as_string())


@app.post("/api/inquiry")
def submit_inquiry(body: InquiryRequest):
    """
    문의하기: 작성 내용을 esha@hrc.co.kr로 이메일 전송
    SMTP 설정: INQUIRY_RECIPIENT, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (환경변수)
    """
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="문의 내용을 입력해 주세요.")

    email_val = (body.email or "").strip()
    if not email_val:
        raise HTTPException(status_code=400, detail="이메일을 입력해 주세요.")
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_pattern, email_val):
        raise HTTPException(status_code=400, detail="유효한 이메일 주소를 입력해 주세요.")

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    subject = f"[HRC Library 문의] {email_val}"
    text = f"""HRC Library 문의가 접수되었습니다.

이메일: {email_val}

문의 내용:
{body.message.strip()}
"""
    msg = MIMEMultipart()
    msg["Subject"] = Header(subject, "utf-8")
    fallback = os.getenv("FALLBACK_FROM_SMTP", "").lower() in ("1", "true", "yes")
    if not fallback:
        msg["From"] = formataddr(("문의자", email_val), charset="utf-8")
        msg["Reply-To"] = email_val
    else:
        msg["From"] = smtp_user or "noreply@hrc.co.kr"
        msg["Reply-To"] = formataddr(("문의자", email_val), charset="utf-8")
    msg["To"] = INQUIRY_RECIPIENT
    msg.attach(MIMEText(text, "plain", "utf-8"))

    if not (smtp_host and smtp_user and smtp_pass):
        print(f"[INQUIRY] SMTP 미설정 - 메일 미발송. {subject}")
        raise HTTPException(
            status_code=503,
            detail="이메일 발송이 설정되지 않았습니다. 서버의 .env에 SMTP_HOST, SMTP_USER, SMTP_PASS를 설정해 주세요."
        )

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, INQUIRY_RECIPIENTS, msg.as_string())
        print(f"[INQUIRY] 전송 완료: {subject}")
    except Exception as e:
        print(f"[INQUIRY] 전송 실패: {e}")
        raise HTTPException(status_code=500, detail=f"이메일 전송 실패: {str(e)}")

    return {"ok": True, "message": "문의가 접수되었습니다."}


@app.post("/api/add_question")
def submit_add_question(body: AddQuestionRequest):
    """
    문항추가: 이름/이메일/문항 설명/태그/코드/비고 형식으로 이메일 전송
    """
    if not body.question_desc or not body.question_desc.strip():
        raise HTTPException(status_code=400, detail="문항 설명을 입력해 주세요.")

    email_val = (body.email or "").strip()
    if not email_val:
        raise HTTPException(status_code=400, detail="이메일을 입력해 주세요.")
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_pattern, email_val):
        raise HTTPException(status_code=400, detail="유효한 이메일 주소를 입력해 주세요.")

    subject = f"[HRC Library 샘플 추가 요청] {email_val}"
    remarks_val = (body.remarks or "").strip() if body.remarks is not None else ""
    text = f"""HRC Library 샘플 추가 요청이 접수되었습니다.

이메일: {email_val}

문항 설명:
{body.question_desc.strip()}

태그 (적용되는 속성): {body.tag or '-'}

코드:
{body.code or '-'}

비고: {remarks_val or '(없음)'}
"""
    try:
        _send_inquiry_email(subject, text, "문의자", email_val)
        print(f"[ADD_QUESTION] 전송 완료: {subject}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADD_QUESTION] 전송 실패: {e}")
        raise HTTPException(status_code=500, detail=f"이메일 전송 실패: {str(e)}")

    return {"ok": True, "message": "문항 추가 요청이 접수되었습니다."}


@app.get("/api/db_status")
def db_status():
    """
    DB 연결 상태 진단. IM002 오류 시 32/64비트 불일치 확인용.
    """
    import sys
    info = {
        "python_bits": 64 if sys.maxsize > 2**32 else 32,
        "odbc_drivers": pyodbc.drivers(),
        "db_ok": False,
        "error": None,
    }
    try:
        conn = get_db_connection()
        conn.close()
        info["db_ok"] = True
    except Exception as e:
        info["error"] = str(e)
    return info


@app.get("/api/test_reguserid")
def test_reguserid(qnum: str = Query("1", description="테스트할 문항 (예: 1)")):
    """RegUserId 컬럼 읽기 테스트 (디버깅용). 성공 시 regUserId 값 반환."""
    raw = str(qnum).replace("q", "").replace("Q", "").strip() or "1"
    try:
        qnum_int = int(raw)
    except ValueError:
        qnum_int = 1
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT QuestionQnum, RegUserId FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum = ?",
            (qnum_int,)
        )
        row = cursor.fetchone()
        if not row:
            return {"ok": False, "error": "row not found", "qnum": qnum_int}
        # row[0]=QuestionQnum, row[1]=RegUserId
        reg_val = row[1] if len(row) > 1 else None
        return {
            "ok": True,
            "qnum": f"q{row[0]}",
            "regUserId": (reg_val or "").strip() if reg_val is not None else "",
            "raw": str(reg_val),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        conn.close()


@app.get("/api/get_data")
def get_data():
    """
    (이전 호환용) 라이브러리의 모든 질문 데이터를 가져옵니다.
    프런트엔드는 이제 /api/get_summary + /api/get_detail 를 사용하도록 변경되었습니다.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        query = """
            SELECT 
                QuestionQnum,
                CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM,
                CAST(PerlSourceQ AS NVARCHAR(MAX)) AS PerlSourceQ,
                CAST(PerlSourceC AS NVARCHAR(MAX)) AS PerlSourceC,
                QuestionTag,
                QuestionType
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum
        """
        cursor.execute(query)
        rows = cursor.fetchall()

        result = []
        for row in rows:
            try:
                qnum = f"q{row.QuestionQnum}"
                tag = row.QuestionTag
                if not tag or not tag.strip():
                    tag = qnum

                result.append({
                    "qnum": qnum,
                    "qmcode": clean_string(row.QuestionSourceQM),
                    "PerlSourceQ": clean_string(row.PerlSourceQ),
                    "PerlSourceC": clean_string(row.PerlSourceC),
                    "questionTag": tag,
                    "questionType": clean_string(row.QuestionType)
                })
            except Exception as e:
                qid = getattr(row, "QuestionQnum", "?")
                print(f"[WARNING] get_data row 스킵 (qnum={qid}): {e}")

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/get_init")
def get_init():
    """
    초기 로딩 최적화: summary + types를 한 번에 반환합니다.
    API 호출 2회 → 1회로 축소하여 실서버 지연을 줄입니다.
    """
    now = time.time()
    if SUMMARY_CACHE["data"] is not None and (now - SUMMARY_CACHE["loaded_at"]) < SUMMARY_TTL_SECONDS:
        data = SUMMARY_CACHE["data"]
    else:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            query = """
                SELECT QuestionQnum, QuestionTag, QuestionType
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionQnum IS NOT NULL
                ORDER BY QuestionQnum
            """
            cursor.execute(query)
            rows = cursor.fetchall()
            data = []
            for row in rows:
                try:
                    qnum = f"q{row.QuestionQnum}"
                    tag = row.QuestionTag
                    if not tag or not tag.strip():
                        tag = qnum
                    data.append({
                        "qnum": qnum,
                        "questionTag": tag,
                        "questionType": clean_string(row.QuestionType)
                    })
                except Exception as e:
                    print(f"[WARNING] get_init row 스킵 (qnum={getattr(row, 'QuestionQnum', '?')}): {e}")
            SUMMARY_CACHE["data"] = data
            SUMMARY_CACHE["loaded_at"] = now
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            conn.close()

    types = sorted({item.get("questionType") for item in data if item.get("questionType")})
    return {"summary": data, "types": types}


@app.get("/api/get_summary")
def get_summary():
    """
    초기 로딩 최적화를 위한 경량 요약 데이터.
    큰 텍스트(QM/Perl 소스)는 제외하고, 문항 번호/태그/유형만 반환합니다.
    결과는 서버 메모리에 캐시되어 반복 호출 시 DB 부하를 줄입니다.
    """
    now = time.time()
    if SUMMARY_CACHE["data"] is not None and (now - SUMMARY_CACHE["loaded_at"]) < SUMMARY_TTL_SECONDS:
        return SUMMARY_CACHE["data"]

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        query = """
            SELECT 
                QuestionQnum,
                QuestionTag,
                QuestionType
            FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum
        """
        cursor.execute(query)
        rows = cursor.fetchall()

        result = []
        for row in rows:
            try:
                qnum = f"q{row.QuestionQnum}"
                tag = row.QuestionTag
                if not tag or not tag.strip():
                    tag = qnum

                result.append({
                    "qnum": qnum,
                    "questionTag": tag,
                    "questionType": clean_string(row.QuestionType)
                })
            except Exception as e:
                print(f"[WARNING] get_summary row 스킵 (qnum={getattr(row, 'QuestionQnum', '?')}): {e}")

        SUMMARY_CACHE["data"] = result
        SUMMARY_CACHE["loaded_at"] = now
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


DETAIL_CACHE: Dict[str, Any] = {}
DETAIL_CACHE_MAX = 200  # 최근 200개 문항 캐시
DETAIL_TTL_SECONDS = 300  # 5분


@app.get("/api/get_detail")
def get_detail(qnum: str = Query(..., description="상세를 조회할 문항 번호 (예: q1 또는 1)")):
    """
    단일 문항의 상세(QM/Perl 소스 포함)를 가져옵니다.
    서버 메모리 캐시로 반복 조회 시 DB 부하를 줄입니다.
    """
    if not qnum:
        raise HTTPException(status_code=400, detail="qnum is required")

    raw = str(qnum).lower().strip()
    if raw.startswith("q"):
        raw = raw[1:]
    try:
        qnum_int = int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid qnum format")

    cache_key = f"v3_{qnum_int}"  # v3: questionUrlQM 포함 (14000~14999용)
    now = time.time()
    if cache_key in DETAIL_CACHE:
        entry = DETAIL_CACHE[cache_key]
        if (now - entry["loaded_at"]) < DETAIL_TTL_SECONDS:
            data = entry["data"]
            # regUserId가 없는 구캐시: 조회로 갱신
            if "regUserId" not in data:
                del DETAIL_CACHE[cache_key]
            else:
                return data

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        query = """
            SELECT 
                QuestionQnum,
                CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM,
                CAST(PerlSourceQ AS NVARCHAR(MAX)) AS PerlSourceQ,
                CAST(PerlSourceC AS NVARCHAR(MAX)) AS PerlSourceC,
                QuestionTag,
                QuestionType,
                ISNULL(RegUserId, '') AS RegUserId,
                CAST(QuestionUrlQM AS NVARCHAR(2000)) AS QuestionUrlQM
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum = ?
        """
        cursor.execute(query, (qnum_int,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found")

        qnum_str = f"q{row.QuestionQnum}"
        tag = row.QuestionTag
        if not tag or not tag.strip():
            tag = qnum_str

        # RegUserId: 별도 쿼리로 확실히 조회 (메인 쿼리 컬럼 순서 이슈 방지)
        reg_user = ''
        try:
            cursor.execute(
                "SELECT ISNULL(CAST(RegUserId AS NVARCHAR(200)), '') FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum = ?",
                (qnum_int,)
            )
            r = cursor.fetchone()
            if r is not None and len(r) > 0:
                reg_user = str(r[0]).strip() if r[0] is not None else ''
        except Exception:
            pass
        # QuestionUrlQM: 별도 쿼리로 조회 (pyodbc row 접근 이슈 및 컬럼 존재 여부 대응)
        question_url_qm = None
        try:
            cursor.execute(
                "SELECT CAST(QuestionUrlQM AS NVARCHAR(2000)) FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum = ?",
                (qnum_int,)
            )
            r = cursor.fetchone()
            if r is not None and len(r) > 0 and r[0] is not None:
                val = str(r[0]).strip()
                if val:
                    question_url_qm = val
        except Exception:
            pass
        result = {
            "qnum": qnum_str,
            "qmcode": clean_string(row.QuestionSourceQM),
            "PerlSourceQ": clean_string(row.PerlSourceQ),
            "PerlSourceC": clean_string(row.PerlSourceC),
            "questionTag": tag,
            "questionType": clean_string(row.QuestionType),
            "regUserId": reg_user,  # 항상 키 포함 (빈 문자열이어도)
            "questionUrlQM": question_url_qm
        }
        # 캐시 저장 (LRU 유사: 오래된 항목 제거)
        if len(DETAIL_CACHE) >= DETAIL_CACHE_MAX:
            oldest = min(DETAIL_CACHE.items(), key=lambda x: x[1]["loaded_at"])
            del DETAIL_CACHE[oldest[0]]
        DETAIL_CACHE[cache_key] = {"data": result, "loaded_at": now}
        return JSONResponse(content=result)  # regUserId 포함 명시적 반환
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/get_qnums")
def get_qnums():
    """
    등록된 모든 문항 번호 목록을 가져옵니다.
    검색 자동완성이나 필터링 목적으로 사용될 수 있습니다.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT DISTINCT QuestionQnum
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        return [f"q{row.QuestionQnum}" for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/get_question_types")
def get_question_types():
    """
    질문 유형(Type) 목록을 가져옵니다.
    유형별 필터링을 위해 사용됩니다.
    /api/get_summary 캐시가 있다면 그 데이터를 기반으로 즉시 계산합니다.
    """
    # 1차: summary 캐시에서 바로 계산
    if SUMMARY_CACHE["data"]:
        types = sorted(
            {item.get("questionType") for item in SUMMARY_CACHE["data"] if item.get("questionType")}
        )
        return types

    # 2차: 캐시가 아직 없으면 DB에서 직접 조회
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # QuestionType이 TEXT/NTEXT/NVARCHAR(MAX) 등일 수 있어 인덱스 키로 쓰기 어려운 경우가 있어,
        # DB에 추가된 계산 컬럼(QuestionType_Idx)을 우선 사용하고, 없으면 기존 컬럼으로 폴백합니다.
        try:
            query = """
                SELECT DISTINCT QuestionType_Idx AS QuestionType
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionType_Idx IS NOT NULL AND QuestionType_Idx <> ''
                ORDER BY QuestionType_Idx
            """
            cursor.execute(query)
            rows = cursor.fetchall()
        except Exception:
            query = """
                SELECT DISTINCT CONVERT(NVARCHAR(100), QuestionType) AS QuestionType
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionType IS NOT NULL AND CONVERT(NVARCHAR(100), QuestionType) <> ''
                ORDER BY CONVERT(NVARCHAR(100), QuestionType)
            """
            cursor.execute(query)
            rows = cursor.fetchall()

        result = []
        for row in rows:
            try:
                if row.QuestionType and str(row.QuestionType).strip():
                    result.append(str(row.QuestionType).strip())
            except Exception as e:
                print(f"[WARNING] get_question_types row 스킵: {e}")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/get_qnums_by_type")
def get_qnums_by_type(type: str = Query(..., description="필터링할 질문 유형")):
    """
    특정 유형(Type)에 해당하는 질문 목록을 가져옵니다.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # QuestionType 컬럼 타입 이슈를 고려해, QuestionType_Idx 또는 CONVERT를 사용합니다.
        try:
            query = """
                SELECT QuestionQnum, QuestionTag
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionType_Idx = ? AND QuestionQnum IS NOT NULL
                ORDER BY QuestionQnum
            """
            cursor.execute(query, (type,))
            rows = cursor.fetchall()
        except Exception:
            query = """
                SELECT QuestionQnum, QuestionTag
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE CONVERT(NVARCHAR(100), QuestionType) = ? AND QuestionQnum IS NOT NULL
                ORDER BY QuestionQnum
            """
            cursor.execute(query, (type,))
            rows = cursor.fetchall()
        
        result = []
        for row in rows:
            qnum = f"q{row.QuestionQnum}"
            tag = row.QuestionTag
            if not tag or not tag.strip():
                tag = qnum
            
            result.append({
                "value": qnum,
                "text": tag
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/search_questions")
def search_questions(q: str = Query(..., description="검색어")):
    """
    질문 태그(제목)를 기준으로 질문을 검색합니다.
    """
    if not q:
        return []
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT QuestionQnum, QuestionTag, QuestionType
            FROM [WEBDEMO].[dbo].[LibraryList]
            WHERE QuestionTag LIKE ? AND QuestionQnum IS NOT NULL
            ORDER BY QuestionQnum
        """
        search_pattern = f"%{q}%"
        cursor.execute(query, (search_pattern,))
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            qnum = f"q{row.QuestionQnum}"
            tag = row.QuestionTag
            if not tag or not tag.strip():
                tag = qnum
                
            question_type = row.QuestionType
            if not question_type or not question_type.strip():
                question_type = "unknown"
                
            result.append({
                "qnum": qnum,
                "questionTag": tag,
                "questionType": question_type
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


import rag_chat


def _rag_chat_enabled() -> bool:
    """ENABLE_RAG_CHAT=0|false|no|off 이면 비활성 (미설정 시 활성, 기존 배포와 동일)."""
    v = (os.getenv("ENABLE_RAG_CHAT") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


@app.post("/api/chat/rag")
def api_chat_rag(body: RagChatRequest):
    """RAG 테스트: client/docs/rag 매뉴얼 MD 기반 검색 + 선택적 OpenAI 답변."""
    if not _rag_chat_enabled():
        raise HTTPException(status_code=404, detail="RAG 챗봇이 비활성화되어 있습니다.")
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="message가 비었습니다.")
    rag_base = os.path.dirname(os.path.abspath(__file__))
    return rag_chat.rag_query(msg, rag_base)


# 배포 환경 설정: 정적 파일 서빙 (React 빌드 파일)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import sys

# 현재 실행 파일의 위치를 찾는 로직 (PyInstaller 호환)
if getattr(sys, 'frozen', False):
    # PyInstaller로 패키징된 실행 파일인 경우
    base_dir = os.path.dirname(sys.executable)
else:
    # 일반 Python 스크립트로 실행되는 경우
    base_dir = os.path.dirname(os.path.abspath(__file__))

# 예상되는 dist 경로 후보들
parent_dir = os.path.dirname(base_dir)
candidates = [
    base_dir,  # 플랫 구조: exe와 index.html, assets가 같은 폴더 (O:\...\HRClib\dist)
    os.path.join(base_dir, "dist"),
    os.path.join(base_dir, "client", "dist"),
    os.path.join(parent_dir, "client", "dist"),
    os.path.join(os.path.dirname(parent_dir), "client", "dist"),
]

dist_path = None
for path in candidates:
    if os.path.exists(path) and os.path.exists(os.path.join(path, "index.html")):
        dist_path = path
        break

if dist_path:
    print(f"[INFO] React 앱이 발견되었습니다: {dist_path}")
    # 1. /HRClib 경로로 접속 시 React 앱 제공
    app.mount("/HRClib", StaticFiles(directory=dist_path, html=True), name="static_hrclib")
    
    # 2. 루트(/) 접속 시 React 앱 제공
    # 주의: API 경로는 위에 정의되어 있으므로 먼저 매칭됩니다.
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static_root")

else:
    # dist 폴더가 없는 경우 -> Flat Structure (루트에 파일이 섞여 있는 경우)
    print(f"[INFO] 'dist' 폴더를 찾을 수 없습니다. 루트 디렉토리에서 플랫 구조를 확인합니다: {base_dir}")
    
    index_path = os.path.join(base_dir, "index.html")
    if os.path.exists(index_path):
        print(f"[INFO] 플랫 구조가 감지되었습니다 (루트에서 index.html 발견).")

        # 1. /assets 폴더 마운트 (React 빌드 결과물)
        assets_path = os.path.join(base_dir, "assets")
        if os.path.exists(assets_path):
            app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

        # 2. 보안을 위한 파일 서빙 핸들러
        # 루트에 실행 파일(.exe)이나 소스 코드(.py), 설정 파일(.env) 등이 같이 있으므로
        # 이를 직접 다운로드하지 못하도록 막아야 합니다.
        blocked_extensions = {".exe", ".py", ".bat", ".env", ".pem", ".spec", ".txt", ".md"}

        @app.get("/{full_path:path}")
        async def serve_file_or_fallback(full_path: str):
            # API 경로는 위에서 이미 처리됨 (FastAPI 순서 동작)
            
            # 1. 파일 경로 절대 경로로 변환
            file_path = os.path.join(base_dir, full_path)
            
            # 2. 파일 존재 여부 확인
            if os.path.exists(file_path) and os.path.isfile(file_path):
                # 3. 확장자 검사 (보안)
                _, ext = os.path.splitext(full_path)
                if ext.lower() in blocked_extensions:
                    print(f"[SECURITY] 중요 파일 접근이 차단되었습니다: {full_path}")
                    raise HTTPException(status_code=403, detail="Access denied")
                
                return FileResponse(file_path)
            
            # 3. 파일이 없으면 SPA 라우팅을 위해 index.html 반환
            # (단, 확장자가 있는 파일 요청인 경우 404가 맞을 수 있으나, SPA에서는 보통 index.html로 보냄)
            # 여기서는 명확한 파일 요청(예: 이미지)이 실패한 경우 404를 줄 수도 있지만,
            # React Router 처리를 위해 index.html을 반환합니다.
            return FileResponse(index_path)

    else:
        print(f"[INFO] React 앱(dist)을 찾을 수 없습니다. API 전용 모드(개발 환경)로 동작합니다.")
        print(f"[INFO] 프론트엔드를 실행하려면 별도의 터미널에서 'npm run dev'를 실행해주세요.")

if __name__ == "__main__":
    import uvicorn
    import os

    # SSL 인증서 파일 경로 설정
    cert_file = os.path.join(base_dir, "cert.pem")
    key_file = os.path.join(base_dir, "key.pem")

    if os.path.exists(cert_file) and os.path.exists(key_file):
        print(f"[INFO] SSL 인증서가 발견되었습니다. HTTPS 모드로 서버를 시작합니다.")
        print(f"[INFO] 인증서: {cert_file}")
        print(f"[INFO] 키: {key_file}")
        uvicorn.run(app, host="0.0.0.0", port=8000, ssl_certfile=cert_file, ssl_keyfile=key_file)
    else:
        print("[INFO] SSL 인증서를 찾을 수 없습니다. HTTP 모드로 서버를 시작합니다.")
        print("HTTPS를 사용하려면 실행 파일과 같은 폴더에 'cert.pem'과 'key.pem'을 두세요.")
        uvicorn.run(app, host="0.0.0.0", port=8000)
