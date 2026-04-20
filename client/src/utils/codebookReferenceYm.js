/**
 * 표시용: 연월·일자 문자열을 가능한 한 정규화(전체 일자는 그대로 유지).
 * @param {string} raw
 * @returns {string}
 */
function toDisplayYm(raw) {
    const t = String(raw ?? '').trim();
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    if (/^\d{4}-\d{2}$/.test(t)) return t;
    if (/^\d{6}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}`;
    if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    return t;
}

/**
 * CodeBook 행에서 기준연월 표시값 (행정동·법정동 공통). 가능하면 YYYY-MM 또는 YYYY-MM-DD 로 통일.
 * @param {Record<string, unknown> | null | undefined} r
 * @returns {string}
 */
export function ymFromCodebookRow(r) {
    if (!r || typeof r !== 'object') return '';
    const y = r.기준연월;
    if (y != null && String(y).trim() !== '') {
        const raw = String(y).trim();
        return toDisplayYm(raw) || raw;
    }
    const ef = String(r.effective_from || '').trim();
    if (ef.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(ef)) {
        const day = ef.slice(0, 10);
        return toDisplayYm(day) || day;
    }
    if (ef.length >= 7 && ef[4] === '-') {
        const head = ef.slice(0, 7);
        return toDisplayYm(head) || head;
    }
    return '';
}

/**
 * API가 내려준 `items` 배열의 **첫 행** `기준연월`(없으면 effective_from)만 사용합니다.
 * 행정동·법정동 동일.
 * @param {Record<string, unknown>[]} items
 * @returns {string}
 */
export function referenceYmFromCodebookItems(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return ymFromCodebookRow(items[0]) || '';
}
