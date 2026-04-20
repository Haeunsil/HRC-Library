/**
 * 표준 시도 코드 1~17 (행정구역 단위 고정 목록)
 * @typedef {{ originalCode: number, name: string }} SidoRow
 */

/** @type {readonly SidoRow[]} */
export const SIDO_CODE_DEFAULT_ORDER = Object.freeze([
    { originalCode: 1, name: '서울특별시' },
    { originalCode: 2, name: '부산광역시' },
    { originalCode: 3, name: '대구광역시' },
    { originalCode: 4, name: '인천광역시' },
    { originalCode: 5, name: '광주광역시' },
    { originalCode: 6, name: '대전광역시' },
    { originalCode: 7, name: '울산광역시' },
    { originalCode: 8, name: '경기도' },
    { originalCode: 9, name: '강원특별자치도' },
    { originalCode: 10, name: '충청북도' },
    { originalCode: 11, name: '충청남도' },
    { originalCode: 12, name: '전북특별자치도' },
    { originalCode: 13, name: '전라남도' },
    { originalCode: 14, name: '경상북도' },
    { originalCode: 15, name: '경상남도' },
    { originalCode: 16, name: '제주특별자치도' },
    { originalCode: 17, name: '세종특별자치시' },
]);

export const SIDO_CUSTOM_ORDER_STORAGE_KEY = 'hrclib_sido_custom_order';

/** @param {number[]} codes */
export function isValidSidoOrderPermutation(codes) {
    if (!Array.isArray(codes) || codes.length !== 17) return false;
    const set = new Set(codes);
    if (set.size !== 17) return false;
    for (let i = 1; i <= 17; i += 1) {
        if (!set.has(i)) return false;
    }
    return true;
}

/** @param {number[]} originalCodesInOrder */
export function orderRowsFromOriginalCodes(originalCodesInOrder) {
    const byCode = new Map(SIDO_CODE_DEFAULT_ORDER.map((r) => [r.originalCode, r]));
    return originalCodesInOrder.map((c) => {
        const row = byCode.get(c);
        return row ? { ...row } : { originalCode: c, name: `코드 ${c}` };
    });
}

/** @typedef {{ error: string | null, order: { originalCode: number, name: string }[] | null }} ParseMappingResult */

/**
 * 매핑 미리보기 텍스트 `1:시도명` … 17줄 파싱
 * @param {string} text
 * @returns {ParseMappingResult}
 */
export function parseSidoMappingPreviewText(text) {
    const rawLines = String(text ?? '').split(/\r\n|\r|\n/);
    const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length !== 17) {
        return {
            error: `정확히 17줄이어야 합니다. (현재 ${lines.length}줄)`,
            order: null,
        };
    }
    const byName = new Map(SIDO_CODE_DEFAULT_ORDER.map((r) => [r.name.normalize('NFC'), r]));
    const used = new Set();
    /** @type {{ originalCode: number, name: string }[]} */
    const out = [];
    for (let i = 0; i < 17; i += 1) {
        const line = lines[i];
        const m = line.match(/^(\d+)\s*:\s*(.+)$/);
        if (!m) {
            return { error: `${i + 1}번째 줄: '새코드:시도명' 형식이어야 합니다.`, order: null };
        }
        const idx = parseInt(m[1], 10);
        if (!Number.isFinite(idx) || idx !== i + 1) {
            return {
                error: `${i + 1}번째 줄: 왼쪽 숫자는 ${i + 1}이어야 합니다. (입력: ${m[1]})`,
                order: null,
            };
        }
        const name = m[2].trim().normalize('NFC');
        const row = byName.get(name);
        if (!row) {
            return { error: `${i + 1}번째 줄: 등록되지 않은 시도명「${m[2].trim()}」`, order: null };
        }
        if (used.has(name)) {
            return { error: `${i + 1}번째 줄: 시도명「${row.name}」이(가) 중복되었습니다.`, order: null };
        }
        used.add(name);
        out.push({ originalCode: row.originalCode, name: row.name });
    }
    return { error: null, order: out };
}
