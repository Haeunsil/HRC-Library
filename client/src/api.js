import axios from 'axios';

// 로컬 환경(FastAPI)과 배포 환경(IIS)을 구분합니다.
// - production: webdemo.hrcglobal.com → api_proxy.aspx 사용
// - 그 외 + localhost/127.0.0.1 또는 port 8000 → FastAPI(8000) 직접 호출 (로컬 개발)
const isProduction = /^webdemo(?:test)?\.hrcglobal\.com$/.test(window.location.hostname);
const isLocal = !isProduction && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port === '8000'  // FastAPI 개발 서버 포트
);

// 로컬: Vite 프록시(/api → 8000) 사용. 배포: 상대경로
const API_BASE = '';

// 초기 로딩 시점의 경로를 기준으로 Base URL 설정 (App.jsx가 URL을 변경하기 전)
const currentPath = window.location.pathname;
const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') || 1);
// api_proxy.aspx 후보: /HRClib/dist/ (배포 파일 모두 dist 내). dist 상위도 폴백
const basePathParent = currentPath.replace(/\/dist\/?.*$/, '') || basePath;
const basePathCandidates = [...new Set([basePathParent, basePath].filter(Boolean))];

const isHtmlResponse = (data) =>
    typeof data === 'string' && (data.trim().startsWith('<!') || data.trim().startsWith('<html'));

// API 클라이언트 인스턴스 생성
const api = axios.create({
    baseURL: isLocal ? API_BASE : `${basePathCandidates[0] || basePath}/api_proxy.aspx`,
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 300, // 4xx/5xx → reject (서버 다운 시 안내 표시)
});

// 배포 환경: HTML 응답 시 다른 basePath로 재시도
api.interceptors.response.use(
    (response) => {
        if (!isLocal && isHtmlResponse(response?.data)) {
            return Promise.reject(new Error('API returned HTML (wrong route)'));
        }
        return response;
    },
    (error) => Promise.reject(error)
);

// 요청 가로채기 (Interceptor)
api.interceptors.request.use((config) => {
    if (isLocal) return config;

    const originalPath = config.url;
    config.params = { _path: originalPath, ...config.params };
    config.url = '';
    return config;
}, (error) => Promise.reject(error));

// 초기 연결 감지용 짧은 타임아웃 (서버 다운 시 빠른 안내)
const INIT_TIMEOUT_MS = 8000;

// 네트워크/연결 오류 여부 (폴백 재시도 생략 → 빠른 실패)
const isNetworkError = (err) => {
    const code = err?.code || '';
    const msg = (err?.message || '').toLowerCase();
    return !!(code && (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ERR_NETWORK' || code === 'ENOTFOUND')) ||
        msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound');
};

// basePath 후보별로 API 요청 시도 (HTML 응답 시 다음 후보로 재시도)
let _workingBasePath = null;
async function apiWithFallback(path, timeoutMs = 30000) {
    const candidates = _workingBasePath ? [_workingBasePath] : basePathCandidates;
    for (let i = 0; i < candidates.length; i++) {
        const base = `${candidates[i]}/api_proxy.aspx`;
        try {
            const res = await axios.get(base, {
                params: { _path: path },
                timeout: timeoutMs,
                validateStatus: () => true, // 4xx/5xx도 resolve하도록 한 뒤 아래에서 throw
            });
            if (res.status >= 400) throw new Error(`API ${res.status}`);
            if (!isHtmlResponse(res?.data)) {
                if (!_workingBasePath) _workingBasePath = candidates[i];
                api.defaults.baseURL = base;
                return res;
            }
        } catch (e) {
            if (i === candidates.length - 1) throw e;
        }
    }
    throw new Error('API returned HTML for all paths');
}

// 중복 호출 방지용 간단 캐시 (한 화면에서 여러 컴포넌트가 동일 API를 동시에 호출함)
let _questionsPromise = null;
let _questionsCache = null;
let _summaryPromise = null;
let _summaryCache = null;
const _detailCache = new Map();
let _questionTypesPromise = null;
let _questionTypesCache = null;
let _initPromise = null;
let _initCache = null;
let _searchAbortController = null;

/**
 * 초기 로딩용: summary + types를 한 번에 가져옵니다.
 * @param {string} path - API 경로
 * @param {{ timeout?: number }} options - timeout(ms) 등
 */
function prodGet(path, options = {}) {
    const timeout = options.timeout ?? 30000;
    return isLocal ? api.get(path, { timeout }) : apiWithFallback(path, timeout);
}

export const getInitData = async () => {
    try {
        if (_initCache) return _initCache;
        // Edge 등: HTML에서 미리 시작한 prefetch 결과 사용 (병렬 로딩)
        const prefetch = typeof window !== 'undefined' && window.__INIT_PREFETCH__;
        if (prefetch && !_initPromise) {
            _initPromise = prefetch.then((data) => {
                if (data && Array.isArray(data.summary) && Array.isArray(data.types)) {
                    _summaryCache = data.summary;
                    _questionTypesCache = data.types;
                    _initCache = { summary: data.summary, types: data.types };
                    return _initCache;
                }
                return prodGet('/api/get_init', { timeout: INIT_TIMEOUT_MS }).then((response) => {
                    const d = response?.data;
                    if (d && Array.isArray(d.summary) && Array.isArray(d.types)) {
                        _summaryCache = d.summary;
                        _questionTypesCache = d.types;
                        _initCache = { summary: d.summary, types: d.types };
                        return _initCache;
                    }
                    console.error("getInitData에서 예상치 못한 응답:", d);
                    throw new Error("Invalid get_init response");
                }).catch(async (err) => {
                    if (isNetworkError(err)) {
                        console.warn("get_init 연결 실패 (서버 다운):", err?.message || err);
                        _initCache = { summary: [], types: [], apiError: true };
                        return _initCache;
                    }
                    console.warn("get_init 실패, 폴백 시도:", err?.message || err);
                    try {
                        const [summary, types] = await Promise.all([
                            prodGet('/api/get_summary').then(r => Array.isArray(r?.data) ? r.data : []),
                            prodGet('/api/get_question_types').then(r => Array.isArray(r?.data) ? r.data : [])
                        ]);
                        _summaryCache = summary;
                        _questionTypesCache = types;
                        _initCache = { summary, types };
                        return _initCache;
                    } catch (fallbackErr) {
                        console.error("폴백 API도 실패:", fallbackErr);
                        _initCache = { summary: [], types: [], apiError: true };
                        return _initCache;
                    }
                });
            }).finally(() => { _initPromise = null; });
        }
        if (!_initPromise) {
            _initPromise = prodGet('/api/get_init', { timeout: INIT_TIMEOUT_MS })
                .then((response) => {
                    const d = response?.data;
                    if (d && Array.isArray(d.summary) && Array.isArray(d.types)) {
                        _summaryCache = d.summary;
                        _questionTypesCache = d.types;
                        _initCache = { summary: d.summary, types: d.types };
                        return _initCache;
                    }
                    console.error("getInitData에서 예상치 못한 응답:", d);
                    throw new Error("Invalid get_init response");
                })
                .catch(async (err) => {
                    if (isNetworkError(err)) {
                        console.warn("get_init 연결 실패 (서버 다운):", err?.message || err);
                        _initCache = { summary: [], types: [], apiError: true };
                        return _initCache;
                    }
                    console.warn("get_init 실패, 폴백 시도:", err?.message || err);
                    try {
                        const [summary, types] = await Promise.all([
                            prodGet('/api/get_summary').then(r => Array.isArray(r?.data) ? r.data : []),
                            prodGet('/api/get_question_types').then(r => Array.isArray(r?.data) ? r.data : [])
                        ]);
                        _summaryCache = summary;
                        _questionTypesCache = types;
                        _initCache = { summary, types };
                        return _initCache;
                    } catch (fallbackErr) {
                        console.error("폴백 API도 실패:", fallbackErr);
                        _initCache = { summary: [], types: [], apiError: true };
                        return _initCache;
                    }
                })
                .finally(() => { _initPromise = null; });
        }
        return await _initPromise;
    } catch (error) {
        console.error("초기 데이터 조회 중 오류:", error);
        return { summary: [], types: [], apiError: true };
    }
};

/**
 * 모든 질문 데이터를 서버에서 가져옵니다.
 * @returns {Promise<Array>} 질문 객체들의 배열
 */
export const getQuestions = async () => {
    try {
        if (_questionsCache) return _questionsCache;
        if (!_questionsPromise) {
            _questionsPromise = api.get('/api/get_data')
                .then((response) => {
                    if (Array.isArray(response.data)) {
                        _questionsCache = response.data;
                        return _questionsCache;
                    }
                    console.error("getQuestions에서 예상치 못한 응답 형식:", response.data);
                    _questionsCache = [];
                    return _questionsCache;
                })
                .catch((error) => {
                    console.error("데이터 조회 중 오류 발생:", error);
                    _questionsCache = [];
                    return _questionsCache;
                })
                .finally(() => {
                    _questionsPromise = null;
                });
        }
        return await _questionsPromise;
    } catch (error) {
        console.error("데이터 조회 중 오류 발생:", error);
        return [];
    }
};

/**
 * 경량 요약 데이터(문항 번호/태그/유형)만 가져옵니다.
 * 초기 로딩에서 사용합니다.
 */
export const getQuestionsSummary = async () => {
    try {
        if (_summaryCache) return _summaryCache;
        if (!_summaryPromise) {
            _summaryPromise = api.get('/api/get_summary')
                .then((response) => {
                    if (Array.isArray(response.data)) {
                        _summaryCache = response.data;
                        return _summaryCache;
                    }
                    console.error("getQuestionsSummary에서 예상치 못한 응답 형식:", response.data);
                    _summaryCache = [];
                    return _summaryCache;
                })
                .catch((error) => {
                    console.error("요약 데이터 조회 중 오류 발생:", error);
                    _summaryCache = [];
                    return _summaryCache;
                })
                .finally(() => {
                    _summaryPromise = null;
                });
        }
        return await _summaryPromise;
    } catch (error) {
        console.error("요약 데이터 조회 중 오류 발생:", error);
        return [];
    }
};

/**
 * 검색어를 포함하는 질문을 서버에서 검색합니다.
 * @param {string} term - 검색할 문항 태그(제목)
 * @returns {Promise<Array>} 검색된 질문 객체 배열
 */
export const searchQuestions = async (term) => {
    try {
        if (!term || String(term).trim().length < 2) return [];
        if (_searchAbortController) _searchAbortController.abort();
        _searchAbortController = new AbortController();
        // 검색어를 쿼리 파라미터로 전달합니다.
        const response = await api.get(`/api/search_questions`, {
            params: { q: term },
            signal: _searchAbortController.signal,
        });
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            console.error("searchQuestions에서 예상치 못한 응답 형식:", response.data);
            return [];
        }
    } catch (error) {
        // 연속 입력 시 이전 요청은 의도적으로 취소될 수 있음
        if (error?.name !== 'CanceledError' && error?.name !== 'AbortError') {
            console.error("질문 검색 중 오류 발생:", error);
        }
        return [];
    }
};

/**
 * 사용 가능한 모든 질문 유형 목록을 가져옵니다.
 * 필터링 옵션을 생성할 때 사용됩니다.
 * @returns {Promise<Array<string>>} 질문 유형 문자열 배열
 */
export const getQuestionTypes = async () => {
    try {
        if (_questionTypesCache) return _questionTypesCache;
        if (!_questionTypesPromise) {
            _questionTypesPromise = api.get('/api/get_question_types')
                .then((response) => {
                    if (Array.isArray(response.data)) {
                        _questionTypesCache = response.data;
                        return _questionTypesCache;
                    }
                    console.error("getQuestionTypes에서 예상치 못한 응답 형식:", response.data);
                    _questionTypesCache = [];
                    return _questionTypesCache;
                })
                .catch((error) => {
                    console.error("질문 유형 조회 중 오류 발생:", error);
                    _questionTypesCache = [];
                    return _questionTypesCache;
                })
                .finally(() => {
                    _questionTypesPromise = null;
                });
        }
        return await _questionTypesPromise;
    } catch (error) {
        console.error("질문 유형 조회 중 오류 발생:", error);
        return [];
    }
};

/**
 * 특정 유형에 속하는 질문 목록을 가져옵니다.
 * @param {string} type - 조회할 질문 유형
 * @returns {Promise<Array>} 해당 유형의 질문 목록
 */
export const getQuestionsByType = async (type) => {
    try {
        const response = await api.get(`/api/get_qnums_by_type`, {
            params: { type: type }
        });
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            console.error("getQuestionsByType에서 예상치 못한 응답 형식:", response.data);
            return [];
        }
    } catch (error) {
        console.error("유형별 질문 조회 중 오류 발생:", error);
        return [];
    }
};

/**
 * 단일 문항의 상세(QM/Perl 소스 포함)를 가져옵니다.
 * @param {string} qnum - 예: "q1" 또는 "1"
 */
export const getQuestionDetail = async (qnum) => {
    if (!qnum) return null;
    const key = String(qnum).toLowerCase();
    const cached = _detailCache.get(key);
    // regUserId, questionUrlQM 키가 있는 새 형식만 캐시 사용 (구캐시 무효화)
    if (cached && 'regUserId' in cached && 'questionUrlQM' in cached) return cached;

    try {
        const response = await api.get('/api/get_detail', {
            params: { qnum },
        });
        if (response && response.data && response.data.qnum) {
            _detailCache.set(key, response.data);
            return response.data;
        }
        console.error("getQuestionDetail에서 예상치 못한 응답 형식:", response?.data);
        return null;
    } catch (error) {
        console.error("문항 상세 조회 중 오류 발생:", error);
        return null;
    }
};

/**
 * 문의하기: 작성 내용을 서버로 전송하여 이메일 발송
 * @param {{ email: string, message: string }} data
 */
export const submitInquiry = async (data) => {
    const res = await api.post('/api/inquiry', data);
    return res?.data;
};

/**
 * 문항추가: 이메일/문항 설명/태그/코드/비고 형식으로 서버 전송
 * @param {{ email: string, question_desc: string, tag?: string, code?: string, remarks?: string|null }} data
 */
export const submitAddQuestion = async (data) => {
    const res = await api.post('/api/add_question', data);
    return res?.data;
};

/**
 * RAG 챗봇 (매뉴얼 MD 테스트): { reply, sources, mode, manual_path?, error? }
 * @param {string} message
 */
export const ragChat = async (message) => {
    const res = await api.post('/api/chat/rag', { message });
    return res?.data;
};
