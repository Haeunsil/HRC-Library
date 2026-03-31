"""
RAG 테스트용: Markdown 매뉴얼을 ## 단위로 청크 → 키워드 매칭으로 검색 →
OPENAI_API_KEY 있으면 OpenAI 답변, 없으면 검색된 본문 발췌만 반환.
DB LibraryList의 태그·유형과 질문·매뉴얼 토큰을 겹쳐 연관 문항을 추천(기본 on, RAG_TAG_RECOMMEND=off 로 끔).

문서는 `매뉴얼_템플릿.md` 한 파일 또는 동일 폴더의 여러 `*.md`(카테고리별)로 둘 수 있음.
"""
from __future__ import annotations

import glob
import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Set, Tuple

_RAG_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
_MANUAL_FILENAME = "매뉴얼_템플릿.md"


def _resolve_openai_api_key() -> str:
    """
    프로세스 환경 변수 → server/.env → 저장소 루트 .env 순으로 OPENAI_API_KEY 조회.
    (database.load_dotenv가 먼저 실행돼도, 일부 실행 방식에서 .env가 비어 있으면 여기서 보완)
    """
    k = (os.getenv("OPENAI_API_KEY") or "").strip()
    if k:
        return k
    try:
        from dotenv import dotenv_values
    except ImportError:
        return ""
    for rel in (".env", os.path.join("..", ".env")):
        p = os.path.abspath(os.path.join(_RAG_MODULE_DIR, rel))
        if not os.path.isfile(p):
            continue
        raw = (dotenv_values(p).get("OPENAI_API_KEY") or "").strip()
        if raw:
            return raw
    return ""


def _iter_manual_candidate_paths(base_dir: str) -> List[str]:
    """rag_chat.py·main.py·cwd·환경변수 기준으로 후보 경로를 순서대로 나열 (중복 제거 전)."""
    name = _MANUAL_FILENAME
    raw: List[str] = []

    ef = os.environ.get("RAG_MANUAL_FILE", "").strip()
    if ef:
        raw.append(ef)

    ep = os.environ.get("RAG_MANUAL_PATH", "").strip()
    if ep:
        if ep.lower().endswith(".md"):
            raw.append(ep)
        else:
            raw.append(os.path.join(ep, name))

    # 배포 시 client 폴더 없음: server/rag_docs/ 복사본 (저장소에 동봉)
    raw.append(os.path.join(_RAG_MODULE_DIR, "rag_docs", name))

    # rag_chat.py가 server/에 있으면 ../client/docs/rag/
    raw.append(os.path.join(_RAG_MODULE_DIR, "..", "client", "docs", "rag", name))

    bd = os.path.abspath(base_dir) if base_dir else ""
    if bd:
        parent = os.path.dirname(bd)
        grand = os.path.dirname(parent)
        raw.extend(
            [
                os.path.join(bd, "..", "client", "docs", "rag", name),
                os.path.join(parent, "client", "docs", "rag", name),
                os.path.join(bd, "client", "docs", "rag", name),
                os.path.join(grand, "client", "docs", "rag", name),
                os.path.join(parent, "docs", "rag", name),
            ]
        )

    cw = os.getcwd()
    raw.extend(
        [
            os.path.join(cw, "client", "docs", "rag", name),
            os.path.join(cw, "docs", "rag", name),
            os.path.join(cw, "..", "client", "docs", "rag", name),
            os.path.join(cw, "..", "..", "client", "docs", "rag", name),
        ]
    )

    out: List[str] = []
    seen = set()
    for p in raw:
        if not p:
            continue
        ap = os.path.abspath(os.path.normpath(p))
        if ap in seen:
            continue
        seen.add(ap)
        out.append(ap)
    return out


def _strip_frontmatter(md: str) -> str:
    if not md.startswith("---"):
        return md
    end = md.find("\n---", 3)
    if end == -1:
        return md
    return md[end + 4 :].lstrip()


def split_markdown_chunks(md: str) -> List[Dict[str, str]]:
    body = _strip_frontmatter(md)
    # <!-- ... --> 블록은 검색 노이즈 감소를 위해 제거하지 않음(주석에 규칙이 있을 수 있음)
    parts = re.split(r"(?m)^(?=## )", body)
    chunks: List[Dict[str, str]] = []
    for raw in parts:
        s = raw.strip()
        if not s:
            continue
        if s.startswith("##"):
            line, _, rest = s.partition("\n")
            title = line.replace("##", "", 1).strip() or "(제목 없음)"
            chunk_body = rest.strip() if rest else ""
        else:
            title = "개요"
            chunk_body = s
        text = f"## {title}\n{chunk_body}" if title != "개요" else chunk_body
        chunks.append({"title": title, "body": chunk_body, "text": text})
    if not chunks:
        chunks.append({"title": "문서", "body": body.strip(), "text": body.strip()})
    return chunks


def _chunks_from_file(path: str) -> List[Dict[str, str]]:
    """파일 하나를 청크로 쪼개고, 제목에 파일 stem(카테고리 구분)을 붙임."""
    stem = os.path.splitext(os.path.basename(path))[0]
    with open(path, "r", encoding="utf-8") as f:
        md = f.read()
    chunks = split_markdown_chunks(md)
    for c in chunks:
        t = c["title"]
        c["title"] = f"{stem} · {t}" if t != "개요" else f"{stem} · 개요"
        c["text"] = f"## {c['title']}\n{c['body']}"
    return chunks


def _tokenize_query(q: str) -> List[str]:
    q = q.lower().strip()
    toks = re.findall(r"[가-힣a-z0-9]{2,}", q)
    seen = set()
    out = []
    for t in toks:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _score_chunk(tokens: List[str], chunk: Dict[str, str]) -> int:
    hay = (chunk["title"] + "\n" + chunk["body"]).lower()
    return sum(1 for t in tokens if t in hay)


def retrieve(message: str, chunks: List[Dict[str, str]], top_k: int = 4) -> List[Dict[str, Any]]:
    tokens = _tokenize_query(message)
    scored: List[Tuple[int, int, Dict[str, str]]] = []
    for i, c in enumerate(chunks):
        s = _score_chunk(tokens, c) if tokens else 0
        scored.append((s, i, c))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if tokens and scored[0][0] == 0:
        return [{"title": c["title"], "body": c["body"], "text": c["text"], "score": 0} for c in chunks[:top_k]]
    out: List[Dict[str, Any]] = []
    for s, _, c in scored:
        if len(out) >= top_k:
            break
        if tokens and s == 0:
            continue
        out.append({"title": c["title"], "body": c["body"], "text": c["text"], "score": s})
    if not out:
        out = [{"title": c["title"], "body": c["body"], "text": c["text"], "score": 0} for c in chunks[:top_k]]
    return out


# 문항 목록(태그 추천용) 짧은 TTL 캐시 — 챗봇마다 DB 전체 조회 방지
_LIBRARY_ROWS_CACHE: Dict[str, Any] = {"at": 0.0, "rows": None}
_LIBRARY_ROWS_TTL = 60.0


def _tag_recommend_enabled() -> bool:
    v = (os.getenv("RAG_TAG_RECOMMEND") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _clean_db_str(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    return "" if not s or s.upper() == "NULL" else s


def _fetch_library_summary_rows() -> List[Dict[str, str]]:
    """LibraryList에서 qnum / QuestionTag / QuestionType만 조회."""
    now = time.time()
    if (
        _LIBRARY_ROWS_CACHE["rows"] is not None
        and now - float(_LIBRARY_ROWS_CACHE["at"]) < _LIBRARY_ROWS_TTL
    ):
        return _LIBRARY_ROWS_CACHE["rows"]
    try:
        from database import get_db_connection
    except Exception:
        return []

    rows_out: List[Dict[str, str]] = []
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT QuestionQnum, QuestionTag, QuestionType
                FROM [WEBDEMO].[dbo].[LibraryList] WITH (NOLOCK)
                WHERE QuestionQnum IS NOT NULL
                ORDER BY QuestionQnum
                """
            )
            for row in cur.fetchall():
                qn = row.QuestionQnum
                tag = _clean_db_str(getattr(row, "QuestionTag", None))
                qtype = _clean_db_str(getattr(row, "QuestionType", None))
                qnum = f"q{qn}"
                if not tag:
                    tag = qnum
                rows_out.append({"qnum": qnum, "questionTag": tag, "questionType": qtype})
        finally:
            conn.close()
    except Exception:
        return []

    _LIBRARY_ROWS_CACHE["at"] = now
    _LIBRARY_ROWS_CACHE["rows"] = rows_out
    return rows_out


def _token_set_from_text(*parts: str) -> Set[str]:
    return set(_tokenize_query(" ".join(p for p in parts if p)))


def _recommend_related_questions(
    message: str,
    manual_sources: List[Dict[str, Any]],
    library_rows: List[Dict[str, str]],
    limit: int = 6,
    seed_count: int = 3,
) -> List[Dict[str, str]]:
    """
    사용자 질문 + RAG로 가져온 매뉴얼 조각 토큰으로 문항을 고르고,
    그 문항들의 태그·유형 토큰과 겹치는 다른 문항을 추천한다.
    """
    if not library_rows:
        return []

    query_tokens = _token_set_from_text(message)
    for s in manual_sources:
        query_tokens |= _token_set_from_text(
            str(s.get("title") or ""), str(s.get("body") or "")[:400]
        )

    def direct_score(r: Dict[str, str]) -> int:
        hay = f"{r['questionTag']} {r['questionType']} {r['qnum']}".lower()
        return sum(1 for t in query_tokens if len(t) >= 2 and t in hay)

    ranked = sorted(library_rows, key=lambda r: (-direct_score(r), r["qnum"]))
    seeds = [r for r in ranked[: max(seed_count, 1)] if direct_score(r) > 0]
    if not seeds:
        return []

    seed_union: Set[str] = set()
    for r in seeds:
        seed_union |= _token_set_from_text(r["questionTag"], r["questionType"], r["qnum"])

    seed_qnums = {r["qnum"] for r in seeds}
    related: List[Tuple[int, Dict[str, str]]] = []
    for r in library_rows:
        if r["qnum"] in seed_qnums:
            continue
        row_toks = _token_set_from_text(r["questionTag"], r["questionType"], r["qnum"])
        overlap_seed = len(seed_union & row_toks)
        overlap_query = len(query_tokens & row_toks)
        score = overlap_seed * 4 + overlap_query
        if score > 0:
            related.append((score, r))

    related.sort(key=lambda x: (-x[0], x[1]["qnum"]))
    return [r for _, r in related[:limit]]


def _format_recommendation_line(recs: List[Dict[str, str]], max_label: int = 52) -> str:
    parts: List[str] = []
    for r in recs:
        label = (r.get("questionTag") or r.get("qnum") or "").replace("\n", " ").strip()
        if len(label) > max_label:
            label = label[: max_label - 1] + "…"
        parts.append(f"{r['qnum']} ({label})")
    return "연관 문항(태그·유형 기준): " + " · ".join(parts)


def _build_context(sources: List[Dict[str, Any]], max_chars: int = 12000) -> str:
    parts = []
    n = 0
    for s in sources:
        block = f"### {s['title']}\n{s['body']}"
        if n + len(block) > max_chars:
            block = block[: max_chars - n] + "\n...(생략)"
        parts.append(block)
        n += len(block)
        if n >= max_chars:
            break
    return "\n\n---\n\n".join(parts)


def _extract_responses_output_text(data: Dict[str, Any]) -> str:
    """OpenAI Responses API 본문에서 어시스턴트 텍스트만 추출."""
    ot = data.get("output_text")
    if ot is not None and str(ot).strip():
        return str(ot).strip()
    output = data.get("output") or []
    messages = [x for x in output if x.get("type") == "message"]
    final_msgs = [m for m in messages if m.get("phase") == "final_answer"]
    use_msgs = final_msgs if final_msgs else messages
    parts: List[str] = []
    for item in use_msgs:
        for block in item.get("content") or []:
            bt = block.get("type")
            if bt == "output_text" and block.get("text"):
                parts.append(str(block["text"]))
            elif bt == "refusal" and block.get("refusal"):
                parts.append(str(block["refusal"]))
    if parts:
        return "\n".join(parts).strip()
    for item in output:
        for block in item.get("content") or []:
            if block.get("type") == "output_text" and block.get("text"):
                parts.append(str(block["text"]))
    return "\n".join(parts).strip()


def _rag_instructions_and_input(context: str, user_message: str) -> Tuple[str, str]:
    instructions = (
        "당신은 HRC Library를 안내하는 친절한 도우미입니다. 항상 정중한 존댓말과 부드러운 말투로 응답하세요. "
        "사용자 메시지와 함께 주어진 [참고 문서]에 적힌 내용만 근거로 삼아 한국어로 설명하세요. "
        "이해하기 쉽게 필요하면 순서를 나누어(먼저, 그다음, 마지막으로 등) 단계별로 풀어 주고, "
        "메뉴 이름·버튼·영역 이름은 문서에 나온 대로 구체적으로 짚어 주세요. "
        "문서에 없는 내용은 추측하지 말고, 잘 모르겠다고 솔직히 말한 뒤 문서에 있는 범위에서 도울 수 있는 것을 제안하세요. "
        "채팅 창에 그대로 보이므로 마크다운은 쓰지 마세요. "
        "굵게(**), 제목 기호(#), 코드블록(```), 링크 문법 없이 일반 문장만 쓰세요."
    )
    user_input = f"[참고 문서]\n{context}\n\n[사용자 질문]\n{user_message}"
    return instructions, user_input


def _openai_post_json(url: str, api_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        raise RuntimeError(f"HTTP {e.code}: {body[:1500]}") from e


def _openai_responses_try_payloads(
    api_key: str, model: str, instructions: str, user_input: str
) -> str:
    """Responses API: 일부 모델은 temperature 등을 거부하므로 점진적으로 파라미터 축소."""
    bases: List[Dict[str, Any]] = [
        {
            "model": model,
            "instructions": instructions,
            "input": user_input,
            "temperature": 0.35,
            "max_output_tokens": 2048,
        },
        {
            "model": model,
            "instructions": instructions,
            "input": user_input,
            "max_output_tokens": 2048,
        },
        {"model": model, "instructions": instructions, "input": user_input},
    ]
    last_err: Optional[RuntimeError] = None
    for payload in bases:
        try:
            data = _openai_post_json("https://api.openai.com/v1/responses", api_key, payload)
            err = data.get("error")
            if err:
                raise RuntimeError(err if isinstance(err, str) else json.dumps(err, ensure_ascii=False))
            status = (data.get("status") or "").lower()
            if status in ("failed", "cancelled", "expired"):
                raise RuntimeError(f"response status: {data.get('status')}")
            text = _extract_responses_output_text(data)
            if text:
                return text
            raise RuntimeError(
                "모델 응답 본문이 비었습니다. output 키: "
                + json.dumps(list(data.keys()), ensure_ascii=False)
            )
        except RuntimeError as e:
            last_err = e
            err_s = str(e).lower()
            if "400" in str(e) or "unsupported" in err_s or "temperature" in err_s or "max_output" in err_s:
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError("Responses API 호출 실패")


def _openai_chat_completions(api_key: str, model: str, instructions: str, user_input: str) -> str:
    """Chat Completions — Responses 미지원·거부 모델용."""
    msgs: List[Dict[str, str]] = [
        {"role": "system", "content": instructions},
        {"role": "user", "content": user_input},
    ]
    attempts: List[Dict[str, Any]] = [
        {"model": model, "messages": msgs, "temperature": 0.35, "max_tokens": 2048},
        {"model": model, "messages": msgs, "max_completion_tokens": 2048},
        {"model": model, "messages": msgs},
    ]
    last_err: Optional[RuntimeError] = None
    for payload in attempts:
        try:
            data = _openai_post_json("https://api.openai.com/v1/chat/completions", api_key, payload)
            err = data.get("error")
            if err:
                raise RuntimeError(err if isinstance(err, str) else json.dumps(err, ensure_ascii=False))
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("choices 비어 있음")
            msg = choices[0].get("message") or {}
            content = (msg.get("content") or "").strip()
            if not content:
                raise RuntimeError("message.content 비어 있음")
            return content
        except RuntimeError as e:
            last_err = e
            es = str(e).lower()
            if "max_tokens" in es or "max_completion" in es or "temperature" in es or "unsupported" in es:
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError("chat/completions 호출 실패")


def _openai_rag_reply(context: str, user_message: str, api_key: str) -> Tuple[str, str]:
    """
    (reply_text, mode) — mode는 'responses' | 'chat'.
    OPENAI_API_MODE: auto(기본) | responses | chat
    """
    model = (os.getenv("OPENAI_CHAT_MODEL") or "gpt-4o-mini").strip()
    instructions, user_input = _rag_instructions_and_input(context, user_message)
    mode_pref = (os.getenv("OPENAI_API_MODE") or "auto").strip().lower()

    if mode_pref == "chat":
        return _openai_chat_completions(api_key, model, instructions, user_input), "chat"

    if mode_pref == "responses":
        return _openai_responses_try_payloads(api_key, model, instructions, user_input), "responses"

    try:
        return _openai_responses_try_payloads(api_key, model, instructions, user_input), "responses"
    except (RuntimeError, urllib.error.URLError) as e:
        try:
            return _openai_chat_completions(api_key, model, instructions, user_input), "chat"
        except RuntimeError as e2:
            raise RuntimeError(
                f"Responses 실패: {e} | Chat Completions 재시도 실패: {e2}"
            ) from e2


def _fallback_reply(sources: List[Dict[str, Any]], *, reason: str = "no_key") -> str:
    if reason == "api_error":
        header = "*(OpenAI API 호출에 실패해 매뉴얼 발췌만 표시합니다. 아래 오류 메시지와 모델명·키 권한을 확인하세요.)*"
    else:
        header = (
            "*(OpenAI API 키가 서버에서 읽히지 않아 매뉴얼 발췌만 표시합니다. "
            "`server/.env`에 `OPENAI_API_KEY=sk-...` 한 줄을 넣고 서버를 재시작하세요.)*"
        )
    lines = [header, ""]
    for s in sources:
        snippet = s["body"][:1200] + ("…" if len(s["body"]) > 1200 else "")
        lines.append(f"**{s['title']}**\n{snippet}\n")
    return "\n".join(lines).strip()


def resolve_manual_path(base_dir: str) -> Tuple[Optional[str], List[str]]:
    """(찾은 절대경로, 시도한 절대경로 목록). 없으면 (None, tried)."""
    tried: List[str] = []
    for ap in _iter_manual_candidate_paths(base_dir):
        tried.append(ap)
        if os.path.isfile(ap):
            return ap, tried
    return None, tried


_chunks_cache: Dict[str, Any] = {"key": None, "chunks": None}


def _cache_key_single(path: str) -> Tuple[str, str, float]:
    ap = os.path.abspath(path)
    return ("single", ap, os.path.getmtime(ap))


def _cache_key_multi(paths: List[str]) -> Tuple[str, Tuple[Tuple[str, float], ...]]:
    items: List[Tuple[str, float]] = []
    for p in sorted(os.path.abspath(x) for x in paths):
        items.append((p, os.path.getmtime(p)))
    return ("multi", tuple(items))


def _discover_multi_md_paths(base_dir: str) -> Optional[List[str]]:
    """
    단일 `매뉴얼_템플릿.md`가 없을 때: 같은 우선순위로 후보 폴더를 보며 *.md 전부 사용.
    RAG_MANUAL_PATH가 디렉터리이면 그 안의 *.md만 우선(환경에 디렉터리로만 준 경우).
    """
    ep = os.environ.get("RAG_MANUAL_PATH", "").strip()
    if ep and not ep.lower().endswith(".md"):
        d = os.path.abspath(os.path.normpath(ep))
        if os.path.isdir(d):
            files = sorted(glob.glob(os.path.join(d, "*.md")))
            if files:
                return files

    seen_dir: set[str] = set()
    for ap in _iter_manual_candidate_paths(base_dir):
        d = os.path.abspath(os.path.dirname(ap))
        if d in seen_dir:
            continue
        seen_dir.add(d)
        if not os.path.isdir(d):
            continue
        files = sorted(glob.glob(os.path.join(d, "*.md")))
        if files:
            return files
    return None


def load_chunks(base_dir: str) -> Tuple[Optional[List[Dict[str, str]]], Optional[str], Optional[str]]:
    """(chunks, error_message, resolved_manual_path 또는 다중 파일 요약 문자열)"""
    md_dir = os.environ.get("RAG_MANUAL_DIR", "").strip()
    if md_dir:
        d = os.path.abspath(os.path.normpath(md_dir))
        if not os.path.isdir(d):
            return None, f"RAG_MANUAL_DIR이(가) 유효한 폴더가 아닙니다: {d}", None
        paths = sorted(glob.glob(os.path.join(d, "*.md")))
        if not paths:
            return None, f"RAG_MANUAL_DIR에 .md 파일이 없습니다: {d}", None
        key = _cache_key_multi(paths)
        if _chunks_cache["key"] == key and _chunks_cache["chunks"]:
            return _chunks_cache["chunks"], None, " | ".join(paths)
        chunks: List[Dict[str, str]] = []
        for p in paths:
            chunks.extend(_chunks_from_file(p))
        _chunks_cache.update({"key": key, "chunks": chunks})
        return chunks, None, " | ".join(paths)

    path, tried = resolve_manual_path(base_dir)
    if path:
        try:
            key = _cache_key_single(path)
        except OSError as e:
            return None, str(e), None
        if _chunks_cache["key"] == key and _chunks_cache["chunks"]:
            return _chunks_cache["chunks"], None, path
        with open(path, "r", encoding="utf-8") as f:
            md = f.read()
        chunks = split_markdown_chunks(md)
        _chunks_cache.update({"key": key, "chunks": chunks})
        return chunks, None, path

    multi_paths = _discover_multi_md_paths(base_dir)
    if multi_paths:
        try:
            key = _cache_key_multi(multi_paths)
        except OSError as e:
            return None, str(e), None
        if _chunks_cache["key"] == key and _chunks_cache["chunks"]:
            return _chunks_cache["chunks"], None, " | ".join(multi_paths)
        chunks = []
        for p in multi_paths:
            chunks.extend(_chunks_from_file(p))
        _chunks_cache.update({"key": key, "chunks": chunks})
        return chunks, None, " | ".join(multi_paths)

    preview = "\n".join(f"  • {p}" for p in tried[:12])
    more = f"\n  … 외 {len(tried) - 12}곳" if len(tried) > 12 else ""
    msg = (
        "매뉴얼 파일을 찾을 수 없습니다.\n"
        "시도한 경로:\n"
        f"{preview}{more}\n\n"
        "해결: 한 파일이면 `매뉴얼_템플릿.md` 또는 $env:RAG_MANUAL_FILE=...\n"
        "카테고리별 여러 파일이면 같은 폴더에 `*.md`만 두거나(단일 템플릿 없이), "
        "$env:RAG_MANUAL_DIR=\"경로\" 로 폴더를 지정하세요."
    )
    return None, msg, None


def rag_query(message: str, base_dir: str) -> Dict[str, Any]:
    chunks, err, path = load_chunks(base_dir)
    if err:
        return {"reply": "", "sources": [], "mode": "error", "error": err, "recommendations": []}
    sources = retrieve(message, chunks)
    api_key = _resolve_openai_api_key()
    context = _build_context(sources)
    src_out = [{"title": s["title"], "snippet": s["body"][:400]} for s in sources]

    recs: List[Dict[str, str]] = []
    if _tag_recommend_enabled():
        lib = _fetch_library_summary_rows()
        if lib:
            recs = _recommend_related_questions(message, sources, lib, limit=6)
    rec_out = [
        {
            "qnum": r["qnum"],
            "questionTag": r["questionTag"],
            "questionType": r.get("questionType") or "",
        }
        for r in recs
    ]
    rec_line = "\n\n" + _format_recommendation_line(recs) if recs else ""

    if api_key:
        try:
            reply, omode = _openai_rag_reply(context, message, api_key)
            return {
                "reply": reply + rec_line,
                "sources": src_out,
                "mode": omode,
                "manual_path": path,
                "recommendations": rec_out,
            }
        except Exception as e:
            return {
                "reply": _fallback_reply(sources, reason="api_error") + rec_line,
                "sources": src_out,
                "mode": "fallback",
                "error": str(e),
                "manual_path": path,
                "recommendations": rec_out,
            }

    return {
        "reply": _fallback_reply(sources) + rec_line,
        "sources": src_out,
        "mode": "fallback",
        "manual_path": path,
        "recommendations": rec_out,
    }
