import axios from 'axios';

// 로컬 환경(FastAPI)과 배포 환경(IIS)을 구분합니다.
// - production: webdemo.hrcglobal.com → api_proxy.aspx 사용
// - 로컬: Vite 프록시(/api → 8000). hostname이 LAN IP(192.168.*)여도 vite dev면 import.meta.env.DEV 로 판별
const isProduction = /^webdemo(?:test)?\.hrcglobal\.com$/.test(window.location.hostname);
const isViteDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const isLocal =
    isViteDev ||
    (!isProduction &&
        (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port === '8000' ||
            window.location.port === '5173' ||
            window.location.port === '4173'));

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
/** api_proxy·FastAPI 4xx/5xx 본문에서 짧은 메시지 추출 */
function extractHttpErrorMessage(status, data) {
    if (data == null) return `요청 실패 (${status})`;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.startsWith('<!') || t.toLowerCase().startsWith('<html')) {
            return '서버가 HTML을 반환했습니다. API 경로·프록시를 확인하세요.';
        }
        try {
            return extractHttpErrorMessage(status, JSON.parse(t));
        } catch {
            return t.length > 400 ? `${t.slice(0, 400)}…` : t || `요청 실패 (${status})`;
        }
    }
    if (typeof data === 'object') {
        const d = data.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d) && d.length) {
            return d
                .map((x) => (typeof x === 'object' && x != null ? x.msg || JSON.stringify(x) : String(x)))
                .join('; ');
        }
        if (d && typeof d === 'object') return String(d.msg || d.message || JSON.stringify(d)).slice(0, 400);
        if (data.message) return String(data.message);
    }
    return `요청 실패 (${status})`;
}

async function apiWithFallback(path, timeoutMs = 30000, queryParams = null) {
    const extra =
        queryParams && typeof queryParams === 'object' && !Array.isArray(queryParams) ? queryParams : {};
    const candidates = _workingBasePath ? [_workingBasePath] : basePathCandidates;
    for (let i = 0; i < candidates.length; i++) {
        const base = `${candidates[i]}/api_proxy.aspx`;
        try {
            const res = await axios.get(base, {
                params: { _path: path, ...extra },
                timeout: timeoutMs,
                validateStatus: () => true, // 4xx/5xx도 resolve하도록 한 뒤 아래에서 throw
            });
            if (res.status >= 400) {
                throw new Error(extractHttpErrorMessage(res.status, res.data));
            }
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

/** 요약 행에 regUserId 키가 있는지(구버전 API·캐시 구분). 빈 배열이면 true. */
function summaryHasRegUserIdKey(summary) {
    if (!Array.isArray(summary) || summary.length === 0) return true;
    const row = summary[0];
    return !!(row && Object.prototype.hasOwnProperty.call(row, 'regUserId'));
}

/** 작성자 검색 등을 위해 최신 get_init 스키마로 다시 받을 때 사용 */
export function clearInitDataCache() {
    _initCache = null;
    _initPromise = null;
    _summaryCache = null;
}

/**
 * 초기 로딩용: summary + types를 한 번에 가져옵니다.
 * @param {string} path - API 경로
 * @param {{ timeout?: number }} options - timeout(ms) 등
 */
function prodGet(path, options = {}) {
    const { timeout: timeoutOpt, params, ...rest } = options;
    const timeout = timeoutOpt ?? 30000;
    if (isLocal) {
        return api.get(path, { timeout, params, ...rest });
    }
    return apiWithFallback(path, timeout, params);
}

function applyInitFromResponseData(d) {
    _summaryCache = d.summary;
    _questionTypesCache = d.types;
    _initCache = { summary: d.summary, types: d.types };
    return _initCache;
}

/** 네트워크에서 get_init. summary에 regUserId 키가 없으면 한 번 더 요청(구 prefetch/캐시 대응). */
async function fetchInitPayload() {
    const response = await prodGet('/api/get_init', { timeout: INIT_TIMEOUT_MS });
    const d = response?.data;
    if (!d || !Array.isArray(d.summary) || !Array.isArray(d.types)) {
        console.error('getInitData에서 예상치 못한 응답:', d);
        throw new Error('Invalid get_init response');
    }
    if (summaryHasRegUserIdKey(d.summary) || d.summary.length === 0) {
        return applyInitFromResponseData(d);
    }
    try {
        const response2 = await prodGet('/api/get_init', { timeout: INIT_TIMEOUT_MS });
        const d2 = response2?.data;
        if (d2 && Array.isArray(d2.summary) && Array.isArray(d2.types)) {
            return applyInitFromResponseData(d2);
        }
    } catch {
        /* 한 번 더 실패 시 아래에서 첫 응답 사용 */
    }
    return applyInitFromResponseData(d);
}

async function handleInitFallbackAfterError(err) {
    if (isNetworkError(err)) {
        console.warn('get_init 연결 실패 (서버 다운):', err?.message || err);
        _initCache = { summary: [], types: [], apiError: true };
        return _initCache;
    }
    console.warn('get_init 실패, 폴백 시도:', err?.message || err);
    try {
        const [summary, types] = await Promise.all([
            prodGet('/api/get_summary').then((r) => (Array.isArray(r?.data) ? r.data : [])),
            prodGet('/api/get_question_types').then((r) => (Array.isArray(r?.data) ? r.data : [])),
        ]);
        _summaryCache = summary;
        _questionTypesCache = types;
        _initCache = { summary, types };
        return _initCache;
    } catch (fallbackErr) {
        console.error('폴백 API도 실패:', fallbackErr);
        _initCache = { summary: [], types: [], apiError: true };
        return _initCache;
    }
}

export const getInitData = async () => {
    try {
        if (_initCache) return _initCache;
        const prefetch = typeof window !== 'undefined' && window.__INIT_PREFETCH__;
        if (prefetch && !_initPromise) {
            _initPromise = prefetch
                .then(async (data) => {
                    if (
                        data &&
                        Array.isArray(data.summary) &&
                        Array.isArray(data.types) &&
                        summaryHasRegUserIdKey(data.summary)
                    ) {
                        return applyInitFromResponseData(data);
                    }
                    return fetchInitPayload();
                })
                .catch(() => fetchInitPayload())
                .catch(async (err) => handleInitFallbackAfterError(err))
                .finally(() => {
                    _initPromise = null;
                });
        }
        if (!_initPromise) {
            _initPromise = fetchInitPayload()
                .catch(async (err) => handleInitFallbackAfterError(err))
                .finally(() => {
                    _initPromise = null;
                });
        }
        return await _initPromise;
    } catch (error) {
        console.error('초기 데이터 조회 중 오류:', error);
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
 * 검색어를 포함하는 질문을 서버에서 검색합니다 (태그·작성자·QM/Perl 소스).
 * @param {string} term - 검색어 (2글자 미만이면 빈 배열)
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

/** 로컬 개발: 프록시 실패 시 직접 호출할 FastAPI 베이스 (CORS는 서버에서 * 허용) */
function _devBackendBase() {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) {
        return String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, '');
    }
    return 'http://127.0.0.1:8000';
}

/**
 * 사이드바 Address 메뉴용 JSON (서버 캐시 /api/address/library).
 * @returns {Promise<{ title: string, subcategories: Array }>}
 */
export async function getAddressLibrary() {
    const validate = (d) => {
        if (!d || !Array.isArray(d.subcategories)) {
            throw new Error('Invalid /api/address/library response');
        }
        return d;
    };

    try {
        const res = await prodGet('/api/address/library', { timeout: 20000 });
        return validate(res?.data);
    } catch (firstErr) {
        if (!isLocal || isProduction) throw firstErr;
        try {
            const url = `${_devBackendBase()}/api/address/library`;
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const t = ctrl && setTimeout(() => ctrl.abort(), 20000);
            const r = await fetch(url, { signal: ctrl?.signal });
            if (t) clearTimeout(t);
            if (!r.ok) throw new Error(`direct ${r.status}`);
            const d = await r.json();
            return validate(d);
        } catch {
            throw firstErr;
        }
    }
}

function _filenameFromContentDisposition(cd) {
    if (!cd || !String(cd).includes('filename=')) return null;
    const m = String(cd).match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    return m ? m[1].trim() : null;
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.txt';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Address 탭 — 행정동·법정동 코드 파일 다운로드 (메인 Sample과 무관)
 * @param {'haengjeong'|'beobjeong'} kind
 */
export async function downloadAddressDistrictCode(kind) {
    const path = `/api/address/code/${kind}`;
    if (isLocal) {
        const res = await api.get(path, { responseType: 'blob', timeout: 120000 });
        const name = _filenameFromContentDisposition(res.headers?.['content-disposition']) || `address_${kind}.txt`;
        triggerBlobDownload(res.data, name);
        return;
    }
    let lastErr;
    const candidates = _workingBasePath
        ? [_workingBasePath.replace(/\/api_proxy\.aspx$/i, '')]
        : [];
    const bases = [...new Set([...candidates, ...basePathCandidates].filter(Boolean))];
    const tryBases = bases.length ? bases : basePathCandidates;
    for (let i = 0; i < tryBases.length; i++) {
        const proxy = `${tryBases[i]}/api_proxy.aspx`;
        try {
            const res = await axios.get(proxy, {
                params: { _path: path },
                responseType: 'blob',
                timeout: 120000,
                validateStatus: (s) => s >= 200 && s < 300,
            });
            if (res.status >= 200 && res.status < 300 && res.data instanceof Blob) {
                const name = _filenameFromContentDisposition(res.headers?.['content-disposition']) || `address_${kind}.txt`;
                triggerBlobDownload(res.data, name);
                return;
            }
            lastErr = new Error(`API ${res.status}`);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('다운로드에 실패했습니다.');
}

async function _detailFromErrorBlob(blob) {
    if (!(blob instanceof Blob)) return String(blob);
    const t = await blob.text();
    try {
        const j = JSON.parse(t);
        if (typeof j.detail === 'string') return j.detail;
        if (j.detail && typeof j.detail === 'object' && typeof j.detail.message === 'string') {
            return j.detail.message;
        }
        return t;
    } catch {
        return t || '요청 실패';
    }
}

/**
 * 테스트: 법정동/행정동 code|label TXT 다운로드 (실시간 조회, 최대 50건, UTF-8).
 * @param {'beopjeongdong'|'haengjeongdong'} kind
 * @param {{ sido?: string, sigungu?: string, eupmyeondong?: string, writeServer?: boolean }} [opts]
 * @returns {Promise<{ filename: string, rowCount: string | null, serverPath: string | null }>}
 */
export async function downloadDistrictCodeLabelMappingTest(kind, opts = {}) {
    const sido = opts.sido ?? '서울특별시';
    const sigungu = opts.sigungu ?? '종로구';
    const eupmyeondong = opts.eupmyeondong ?? '사직동';
    const writeServer = opts.writeServer === true;

    const sub = kind === 'beopjeongdong' ? 'beopjeongdong' : 'haengjeongdong';
    const apiPath = `/api/districts/test-mapping/${sub}`;
    const params = { sido, sigungu, eupmyeondong };
    if (writeServer) params.write_server = true;

    const defaultName =
        kind === 'beopjeongdong'
            ? 'beopjeongdong_code_label_test.txt'
            : 'haengjeongdong_code_label_test.txt';

    if (isLocal) {
        const res = await api.get(apiPath, {
            params,
            responseType: 'blob',
            timeout: 120000,
            validateStatus: () => true,
        });
        if (res.status >= 400) {
            throw new Error(await _detailFromErrorBlob(res.data));
        }
        const name = _filenameFromContentDisposition(res.headers?.['content-disposition']) || defaultName;
        triggerBlobDownload(res.data, name);
        return {
            filename: name,
            rowCount: res.headers['x-mapping-row-count'] ?? null,
            serverPath: res.headers['x-server-export-path'] ?? null,
        };
    }

    let lastErr;
    const candidates = _workingBasePath
        ? [_workingBasePath.replace(/\/api_proxy\.aspx$/i, '')]
        : [];
    const bases = [...new Set([...candidates, ...basePathCandidates].filter(Boolean))];
    const tryBases = bases.length ? bases : basePathCandidates;
    for (let i = 0; i < tryBases.length; i++) {
        const proxy = `${tryBases[i]}/api_proxy.aspx`;
        try {
            const res = await axios.get(proxy, {
                params: { _path: apiPath, ...params },
                responseType: 'blob',
                timeout: 120000,
                validateStatus: () => true,
            });
            if (res.status >= 400) {
                lastErr = new Error(await _detailFromErrorBlob(res.data));
                continue;
            }
            if (res.data instanceof Blob) {
                const name = _filenameFromContentDisposition(res.headers?.['content-disposition']) || defaultName;
                triggerBlobDownload(res.data, name);
                if (!_workingBasePath) _workingBasePath = tryBases[i];
                return {
                    filename: name,
                    rowCount: res.headers['x-mapping-row-count'] ?? null,
                    serverPath: res.headers['x-server-export-path'] ?? null,
                };
            }
            lastErr = new Error('잘못된 응답');
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('다운로드에 실패했습니다.');
}

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

/** 법정동 시도/시군구/읍면동 후보 (스냅샷 또는 실시간) */
export async function fetchLegalRegionOptions({ sido, sigungu, includeInactive = false } = {}) {
    const res = await prodGet('/api/districts/ui/legal-options', {
        timeout: 120000,
        params: {
            sido: sido || undefined,
            sigungu: sigungu || undefined,
            include_inactive: includeInactive,
        },
    });
    return res?.data;
}

/** 행정동 SGIS stage (parent_cd 없음 = 시도) */
export async function fetchAdminStage(parentCd) {
    const res = await prodGet('/api/districts/ui/admin-stage', {
        timeout: 90000,
        params: { parent_cd: parentCd || undefined },
    });
    return res?.data;
}

/** @param {'admin'|'legal'} kind */
export async function fetchDistrictDongItems(kind, { sido, sigungu, eupmyeondong }) {
    const sub = kind === 'admin' ? 'admin-dong' : 'legal-dong';
    const res = await prodGet(`/api/districts/${sub}`, {
        timeout: 120000,
        params: { sido, sigungu, eupmyeondong },
    });
    return res?.data;
}

/** FastAPI/프록시 JSON 오류 본문을 짧은 문장으로 */
function parseFetchErrorMessage(status, text) {
    const raw = (text || '').trim();
    try {
        const j = JSON.parse(raw);
        const d = j?.detail;
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object' && d.message) return String(d.message);
        if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg || x).join('; ');
    } catch {
        /* not JSON */
    }
    return raw || `HTTP ${status}`;
}

/**
 * 행정기관 odcloud UDDI (공공데이터). serviceKey는 서버 .env — 브라우저는 fetch로 우리 API만 호출.
 * @param {{ page?: number, perPage?: number }} [opts]
 * @returns {Promise<{ ok: boolean, source: string, currentCount?: number, page?: number, perPage?: number, items: Record<string, unknown>[] }>}
 */
export async function fetchOdCloudAdminRows(opts = {}) {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 1;
    const qs = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    const path = `/api/districts/odcloud/admin-rows?${qs.toString()}`;

    if (isLocal) {
        const res = await fetch(path, { credentials: 'same-origin' });
        const text = await res.text();
        if (!res.ok) throw new Error(parseFetchErrorMessage(res.status, text));
        if (text.trim().startsWith('<!') || text.trim().toLowerCase().startsWith('<html')) {
            throw new Error('API returned HTML');
        }
        return JSON.parse(text);
    }

    const candidates = _workingBasePath ? [_workingBasePath] : basePathCandidates;
    let lastErr;
    for (let i = 0; i < candidates.length; i++) {
        const base = `${candidates[i]}/api_proxy.aspx`;
        const u = new URL(base, window.location.origin);
        u.searchParams.set('_path', '/api/districts/odcloud/admin-rows');
        u.searchParams.set('page', String(page));
        u.searchParams.set('perPage', String(perPage));
        try {
            const res = await fetch(u.toString(), { credentials: 'same-origin' });
            const text = await res.text();
            if (!res.ok) {
                lastErr = new Error(parseFetchErrorMessage(res.status, text));
                continue;
            }
            if (text.trim().startsWith('<!') || text.trim().toLowerCase().startsWith('<html')) {
                lastErr = new Error('API returned HTML');
                continue;
            }
            if (!_workingBasePath) _workingBasePath = candidates[i];
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('fetchOdCloudAdminRows failed');
}

/** odcloud UDDI는 perPage가 크면 400/-999로 거부되는 사례가 있어 보수적으로 200 */
const ODCLOUD_CODEBOOK_PER_PAGE = 200;
/** 200 * 500 = 최대 10만 행까지 (상한만 조절하면 됨) */
const ODCLOUD_CODEBOOK_MAX_PAGES = 500;
/** 한 웨이브에 동시에 요청할 페이지 수 (순차 대비 체감 속도 향상) */
const ODCLOUD_CODEBOOK_CONCURRENCY = 8;

/**
 * odcloud 한 행을 CodeBook 표(행정기관코드·시도명·시군구명·읍면동명·기준연월)에 맞게 정규화.
 * 기준연월이 6자리(YYYYMM) 또는 8자리(YYYYMMDD) 숫자면 YYYY-MM 형태로 맞춤.
 * @param {Record<string, unknown>} row
 */
export function normalizeOdcloudRowForCodebook(row) {
    if (!row || typeof row !== 'object') {
        return {
            행정기관코드: '',
            시도명: '',
            시군구명: '',
            읍면동명: '',
            기준연월: '',
            code: '',
        };
    }
    const ymRaw = String(row.기준연월 ?? '').trim();
    let 기준연월 = ymRaw;
    if (/^\d{6}$/.test(ymRaw)) {
        기준연월 = `${ymRaw.slice(0, 4)}-${ymRaw.slice(4, 6)}`;
    } else if (/^\d{8}$/.test(ymRaw)) {
        기준연월 = `${ymRaw.slice(0, 4)}-${ymRaw.slice(4, 6)}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(ymRaw)) {
        const m = ymRaw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) 기준연월 = m[1];
    }
    const code = String(row.행정기관코드 ?? '').trim();
    return {
        행정기관코드: code,
        시도명: String(row.시도명 ?? '').trim(),
        시군구명: String(row.시군구명 ?? '').trim(),
        읍면동명: String(row.읍면동명 ?? '').trim(),
        기준연월,
        code,
    };
}

/** CodeBook 전량: 서버가 odcloud를 모아 한 번에 내려줌 — 브라우저는 이 경로만 호출 */
const ODCLOUD_CODEBOOK_BULK_TIMEOUT_MS = 600000;

/**
 * CodeBook 표시용: 서버 `GET /api/districts/odcloud/admin-rows/all` 한 번으로 전량 수신.
 * @param {{ perPage?: number, maxPages?: number, concurrency?: number, onProgress?: (info: { page: number, loaded: number, totalCount: number | null }) => void }} [opts]
 * @returns {Promise<{ ok: boolean, source: string, count: number, items: Record<string, string>[], currentCount: number | null, pagesFetched: number, perPageUsed: number, truncatedByMaxPages: boolean }>}
 */
export async function fetchOdCloudAdminRowsAllForCodebook(opts = {}) {
    const perPage = Math.min(1000, Math.max(1, opts.perPage ?? ODCLOUD_CODEBOOK_PER_PAGE));
    const maxPages = Math.min(ODCLOUD_CODEBOOK_MAX_PAGES, Math.max(1, opts.maxPages ?? ODCLOUD_CODEBOOK_MAX_PAGES));
    const concurrency = Math.min(
        20,
        Math.max(1, Math.floor(opts.concurrency ?? ODCLOUD_CODEBOOK_CONCURRENCY)),
    );
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    if (onProgress) onProgress({ page: 0, loaded: 0, totalCount: null });

    const qs = new URLSearchParams({
        perPage: String(perPage),
        maxPages: String(maxPages),
        concurrency: String(concurrency),
    });
    const path = `/api/districts/odcloud/admin-rows/all?${qs.toString()}`;

    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), ODCLOUD_CODEBOOK_BULK_TIMEOUT_MS);
    let text;
    let res;
    try {
        if (isLocal) {
            res = await fetch(path, { credentials: 'same-origin', signal: ac.signal });
            text = await res.text();
            if (!res.ok) throw new Error(parseFetchErrorMessage(res.status, text));
        } else {
            const candidates = _workingBasePath ? [_workingBasePath] : basePathCandidates;
            let lastErr;
            let got = false;
            for (let i = 0; i < candidates.length; i++) {
                const base = `${candidates[i]}/api_proxy.aspx`;
                const u = new URL(base, window.location.origin);
                u.searchParams.set('_path', '/api/districts/odcloud/admin-rows/all');
                u.searchParams.set('perPage', String(perPage));
                u.searchParams.set('maxPages', String(maxPages));
                u.searchParams.set('concurrency', String(concurrency));
                try {
                    res = await fetch(u.toString(), { credentials: 'same-origin', signal: ac.signal });
                    text = await res.text();
                    if (!res.ok) {
                        lastErr = new Error(parseFetchErrorMessage(res.status, text));
                        continue;
                    }
                    if (!_workingBasePath) _workingBasePath = candidates[i];
                    got = true;
                    break;
                } catch (e) {
                    lastErr = e;
                }
            }
            if (!got) throw lastErr || new Error('fetchOdCloudAdminRowsAllForCodebook failed');
        }
    } finally {
        clearTimeout(tid);
    }

    if (text.trim().startsWith('<!') || text.trim().toLowerCase().startsWith('<html')) {
        throw new Error('API returned HTML');
    }
    const data = JSON.parse(text);
    const raw = Array.isArray(data?.items) ? data.items : [];
    const items = raw.map((row) => normalizeOdcloudRowForCodebook(row));

    if (onProgress) {
        onProgress({
            page: typeof data.pagesFetched === 'number' ? data.pagesFetched : 0,
            loaded: items.length,
            totalCount: typeof data.currentCount === 'number' ? data.currentCount : null,
        });
    }

    return {
        ok: true,
        source: 'odcloud',
        count: items.length,
        items,
        currentCount: typeof data.currentCount === 'number' ? data.currentCount : null,
        pagesFetched: typeof data.pagesFetched === 'number' ? data.pagesFetched : 0,
        perPageUsed: typeof data.perPageUsed === 'number' ? data.perPageUsed : perPage,
        truncatedByMaxPages: Boolean(data.truncatedByMaxPages),
    };
}

/**
 * 행정동 CodeBook: 서버 SQLite odcloud 스냅샷만 조회 (클릭마다 odcloud 전량 호출 없음).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchAddressOdcloudCodebookFromSnapshot() {
    const res = await prodGet('/api/districts/snapshot/odcloud-codebook', { timeout: 120000 });
    let data = res?.data;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.startsWith('<!') || t.toLowerCase().startsWith('<html')) {
            throw new Error('코드북 API가 HTML을 반환했습니다. 프록시·경로를 확인하세요.');
        }
        try {
            data = JSON.parse(t);
        } catch {
            throw new Error('코드북 응답을 JSON으로 해석할 수 없습니다.');
        }
    }
    return data;
}

/**
 * 법정동 CodeBook: 서버 SQLite odcloud(15099158) 스냅샷만 조회.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchAddressOdcloudLegalCodebookFromSnapshot() {
    const res = await prodGet('/api/districts/snapshot/odcloud-codebook/legal', { timeout: 120000 });
    let data = res?.data;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.startsWith('<!') || t.toLowerCase().startsWith('<html')) {
            throw new Error('코드북 API가 HTML을 반환했습니다. 프록시·경로를 확인하세요.');
        }
        try {
            data = JSON.parse(t);
        } catch {
            throw new Error('코드북 응답을 JSON으로 해석할 수 없습니다.');
        }
    }
    return data;
}

/** 관리자 스냅샷 기반 코드북 — items: code·label·구역명 + 행정동 시 행정기관코드/법정 시 법정동코드·기준연월 등 */
export async function fetchAddressCodebook(kind) {
    const res = await prodGet('/api/address/codebook', {
        timeout: 120000,
        params: { kind },
    });
    let data = res?.data;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.startsWith('<!') || t.toLowerCase().startsWith('<html')) {
            throw new Error('코드북 API가 HTML을 반환했습니다. 프록시·경로를 확인하세요.');
        }
        try {
            data = JSON.parse(t);
        } catch {
            throw new Error('코드북 응답을 JSON으로 해석할 수 없습니다.');
        }
    }
    return data;
}

/**
 * RAG 챗봇 (매뉴얼 MD 테스트): { reply, sources, mode, manual_path?, error? }
 * @param {string} message
 */
export const ragChat = async (message) => {
    const res = await api.post('/api/chat/rag', { message });
    return res?.data;
};
