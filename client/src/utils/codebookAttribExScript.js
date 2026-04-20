/**
 * CodeBook 스냅샷 행 → *attrex / *attribute 계층 스크립트 텍스트.
 * 명세: 시도·시군구·읍면동을 각각 별도 블록, 중복 제거, 상위 코드로 부모 연결.
 * @see AddressCodebookSection rowsToCodebookExportRows — 표시용 disp_*·10자리 폴백 동일
 */
import { parseAdminDistrictCode10 } from './parseAdminDistrictCode10';
import { enrichDisplayCodesV4FromSido } from './codebookDisplayCodesV2';

export const ATTRIB_EX_HEADER_1 = '#ex *attrex *attribute[1]';
export const ATTRIB_EX_HEADER_2 = '#ex *attrex *attribute[2]';
export const ATTRIB_EX_HEADER_3 = '#ex *attrex *attribute[3]';

/** @typedef {'all' | 'sido' | 'sigungu' | 'eup'} AttribExViewMode */

/**
 * buildAttribExScriptFromCodebookItems 결과 문자열에서 구간만 잘라 미리보기용으로 쓴다.
 * @param {string} fullText
 * @param {AttribExViewMode} view
 * @returns {string}
 */
export function sliceAttribExScriptForView(fullText, view) {
    if (fullText == null || fullText === '') return '';
    if (view === 'all') return fullText;

    const i1 = fullText.indexOf(ATTRIB_EX_HEADER_1);
    const i2 = fullText.indexOf(ATTRIB_EX_HEADER_2);
    const i3 = fullText.indexOf(ATTRIB_EX_HEADER_3);
    if (i1 < 0) return '';

    if (view === 'sido') {
        if (i2 < 0) {
            const after = fullText.slice(i1);
            const j = after.indexOf('\n#javascript');
            return (j >= 0 ? after.slice(0, j) : after).trimEnd();
        }
        return fullText.slice(i1, i2).trimEnd();
    }
    if (view === 'sigungu') {
        if (i2 < 0) return '';
        if (i3 < 0) {
            const after = fullText.slice(i2);
            const j = after.indexOf('\n#javascript');
            return (j >= 0 ? after.slice(0, j) : after).trimEnd();
        }
        return fullText.slice(i2, i3).trimEnd();
    }
    if (view === 'eup') {
        if (i3 < 0) return '';
        const after = fullText.slice(i3);
        const j = after.indexOf('\n#javascript');
        return (j >= 0 ? after.slice(0, j) : after).trimEnd();
    }
    return fullText;
}

/**
 * @param {Record<string, unknown>} r
 * @param {'admin' | 'legal'} kind
 */
function primaryCode(r, kind) {
    if (kind === 'admin') return String(r.행정기관코드 ?? r.code ?? '').trim();
    return String(r.법정동코드 ?? r.code ?? '').trim();
}

/**
 * @param {Record<string, unknown>} r
 * @param {'admin' | 'legal'} kind
 * @returns {{ 시도코드: string, 시도명: string, 시군구코드: string, 시군구명: string, 읍면동코드: string, 읍면동명: string }}
 */
export function flatCodebookRowForAttrib(r, kind) {
    const pc = primaryCode(r, kind);
    const seg = parseAdminDistrictCode10(pc);
    const dispSido = String(r.disp_sido ?? '').trim();
    const dispSig = String(r.disp_sigungu ?? '').trim();
    const dispEup = String(r.disp_eup ?? '').trim();
    return {
        시도코드: dispSido || (seg.ok ? seg.sidoCode2 : ''),
        시도명: String(r.시도명 ?? r.sido_name ?? '').trim(),
        시군구코드: dispSig || (seg.ok ? seg.sigunguCode3 : ''),
        시군구명: String(r.시군구명 ?? r.sigungu_name ?? '').trim(),
        읍면동코드: dispEup || (seg.ok ? seg.eupmyeondongCode3 : ''),
        읍면동명: String(r.읍면동명 ?? r.eupmyeondong_name ?? '').trim(),
    };
}

function cmpDispCodeStrings(sa, sb) {
    const a = String(sa ?? '');
    const b = String(sb ?? '');
    const da = a && /^\d+$/.test(a) ? Number(a) : null;
    const db = b && /^\d+$/.test(b) ? Number(b) : null;
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db != null) return 0;
    return a.localeCompare(b, 'ko', { numeric: true });
}

function compareFlat(a, b) {
    let c = cmpDispCodeStrings(a.시도코드, b.시도코드);
    if (c !== 0) return c;
    c = cmpDispCodeStrings(a.시군구코드, b.시군구코드);
    if (c !== 0) return c;
    return cmpDispCodeStrings(a.읍면동코드, b.읍면동코드);
}

/**
 * CodeBook items 배열을 *attrex 스크립트 텍스트로 변환한다.
 * @param {Record<string, unknown>[]} items
 * @param {'admin' | 'legal'} kind
 * @returns {string} UTF-8 텍스트(파일 저장용)
 */
export function buildAttribExScriptFromCodebookItems(items, kind) {
    const flats = [];
    for (const r of items || []) {
        if (!r || typeof r !== 'object') continue;
        const f = flatCodebookRowForAttrib(r, kind);
        if (!f.시도코드 || !f.시도명) continue;
        flats.push(f);
    }

    /** @type {Map<string, string>} */
    const sidoByCode = new Map();
    /** @type {Map<string, { 시도코드: string, 시군구코드: string, 시군구명: string }>} */
    const sigByKey = new Map();
    /** @type {Map<string, { 시도코드: string, 시군구코드: string, 읍면동코드: string, 읍면동명: string }>} */
    const eupByKey = new Map();

    for (const f of flats) {
        sidoByCode.set(f.시도코드, f.시도명);
        if (f.시군구코드 && f.시군구명) {
            const k = `${f.시도코드}\t${f.시군구코드}`;
            if (!sigByKey.has(k)) {
                sigByKey.set(k, {
                    시도코드: f.시도코드,
                    시군구코드: f.시군구코드,
                    시군구명: f.시군구명,
                });
            }
        }
        if (f.시군구코드 && f.시군구명 && f.읍면동코드 && f.읍면동명) {
            const k = `${f.시도코드}\t${f.시군구코드}\t${f.읍면동코드}`;
            if (!eupByKey.has(k)) {
                eupByKey.set(k, {
                    시도코드: f.시도코드,
                    시군구코드: f.시군구코드,
                    읍면동코드: f.읍면동코드,
                    읍면동명: f.읍면동명,
                });
            }
        }
    }

    const sidosSorted = [...sidoByCode.entries()].sort((a, b) => cmpDispCodeStrings(a[0], b[0]));
    const sigsSorted = [...sigByKey.values()].sort(compareFlat);
    const eupsSorted = [...eupByKey.values()].sort(compareFlat);

    const lines = [];

    lines.push(ATTRIB_EX_HEADER_1);
    for (const [code, name] of sidosSorted) {
        lines.push(`${code}:${name}`);
    }
    lines.push('');
    lines.push(ATTRIB_EX_HEADER_2);
    for (const s of sigsSorted) {
        lines.push(`${s.시군구코드}:${s.시군구명} *attribute[${s.시도코드}]`);
    }
    lines.push('');
    lines.push(ATTRIB_EX_HEADER_3);
    for (const e of eupsSorted) {
        lines.push(`${e.읍면동코드}:${e.읍면동명} *attribute[${e.시도코드}\\${e.시군구코드}]`);
    }

    /** chained 등 연동용 — 다운로드 TXT 맨 아래 고정 워딩 */
    const footer = [
        '',
        '#javascript',
        '$(document).ready(function () {',
        '    $("#q100_2").chained("#q100_1");',
        '    $("#q100_3").chained("#q100_1,#q100_2");',
        '});',
        '',
        '#CSS',
        '.grade_table_none th { width:34%; }',
        '',
    ].join('\n');

    return `${lines.join('\n')}\n${footer}`;
}

/**
 * CodeBook `disp_sido` 등 시도코드 문자열 → 표준 시도 순번 1~17 (해당할 때만)
 * @param {string | number | null | undefined} codeStr
 * @returns {number | null}
 */
export function canonSidoCodeFromDisp(codeStr) {
    const s = String(codeStr ?? '').trim();
    if (!s || !/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1 || n > 17) return null;
    return n;
}

/**
 * UI 시도 순서(위에서부터 새 코드 1…) → 기준 시도코드(1~17) → 새 코드 Map
 * @param {{ originalCode: number }[]} orderRows
 * @returns {Map<number, number>}
 */
export function buildOldToNewSidoMapFromDisplayOrder(orderRows) {
    /** @type {Map<number, number>} */
    const m = new Map();
    if (!Array.isArray(orderRows)) return m;
    for (let i = 0; i < orderRows.length; i += 1) {
        const old = orderRows[i]?.originalCode;
        if (typeof old !== 'number' || old < 1 || old > 17) continue;
        m.set(old, i + 1);
    }
    return m;
}

/**
 * @param {Map<number, number>} oldToNew
 * @returns {string[]}
 */
export function validateSidoRemapInjective(oldToNew) {
    const errors = [];
    if (!(oldToNew instanceof Map)) return errors;
    /** @type {Map<number, number>} */
    const newToOld = new Map();
    for (const [oldC, newC] of oldToNew) {
        if (typeof oldC !== 'number' || typeof newC !== 'number') continue;
        if (newToOld.has(newC) && newToOld.get(newC) !== oldC) {
            errors.push(
                `새 시도코드 ${newC}이(가) 기준 코드 ${newToOld.get(newC)}와 ${oldC}에 동시에 매핑되어 중복입니다.`,
            );
        } else {
            newToOld.set(newC, oldC);
        }
    }
    return errors;
}

/**
 * @param {Map<number, number>} map
 */
function isIdentitySidoRemap(map) {
    if (!(map instanceof Map) || map.size === 0) return true;
    for (const [k, v] of map) {
        if (k !== v) return false;
    }
    return true;
}

/**
 * 원본 CODEBOOK 행은 읽기만 하고, 얕은 복사본에서 `disp_sido`만 `oldToNew`로 바꾼 뒤
 * CodeBook과 동일한 ruleset v4(`enrichDisplayCodesV4FromSido`)로 시군구·읍면동 표시코드를 재부여한 결과로 *attrex 3단을 만든다.
 * 원본 `items` 배열·객체는 변경하지 않는다.
 * @param {Record<string, unknown>[]} items
 * @param {'admin' | 'legal'} kind
 * @param {Map<number, number>} oldToNew — 기준 1~17 → 새 1~17
 * @returns {{ text: string, errors: string[] }}
 */
export function buildAttribExScriptFromCodebookItemsWithSidoRemap(items, kind, oldToNew) {
    const map = oldToNew instanceof Map ? oldToNew : new Map();
    const errors = [...validateSidoRemapInjective(map)];

    const source = items || [];
    /** @type {Record<string, unknown>[]} */
    let workingRows = source;

    if (!isIdentitySidoRemap(map)) {
        const cloned = source.map((r) => {
            if (!r || typeof r !== 'object') return r;
            const copy = { ...r };
            const f = flatCodebookRowForAttrib(copy, kind);
            const canon = canonSidoCodeFromDisp(f.시도코드);
            if (canon === 17) {
                const sgNm = String(copy.시군구명 ?? copy.sigungu_name ?? '').trim();
                if (!sgNm) {
                    copy.시군구명 = '세종시';
                    copy.sigungu_name = '세종시';
                }
            }
            if (canon != null && map.has(canon)) {
                copy.disp_sido = String(map.get(canon));
                copy.disp_sigungu = '';
                copy.disp_eup = '';
            }
            return copy;
        });
        try {
            workingRows = enrichDisplayCodesV4FromSido(cloned.filter((x) => x && typeof x === 'object'));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(
                `표시코드 재계산(ruleset v4)에 실패했습니다: ${msg}. 시도·시군구·읍면동은 원본 CodeBook 표시코드 기준으로 출력합니다.`,
            );
            workingRows = source;
        }
    }

    const flats = [];
    for (const r of workingRows) {
        if (!r || typeof r !== 'object') continue;
        const f = flatCodebookRowForAttrib(r, kind);
        if (!f.시도코드 || !f.시도명) continue;
        flats.push(f);
    }

    /** 시도·시군구·읍면동 표시코드를 v4로 이미 재계산한 경우(원본 배열과 참조 분리됨) */
    const recomputedForCustom = !isIdentitySidoRemap(map) && workingRows !== source;

    /** @param {string} sidoCodeStr */
    const remapSido = (sidoCodeStr) => {
        const c = canonSidoCodeFromDisp(sidoCodeStr);
        if (c != null && map.has(c)) return String(map.get(c));
        return String(sidoCodeStr ?? '').trim();
    };

    /** *attribute[…] 안의 시도 자리: 재계산된 행이면 이미 최종 코드이므로 그대로 둔다. */
    const sidoPathForAttribute = (sidoCodeStr) =>
        recomputedForCustom ? String(sidoCodeStr ?? '').trim() : remapSido(sidoCodeStr);

    /** @type {Map<string, { name: string, canon: number | null }>} */
    const sidoByCode = new Map();
    for (const f of flats) {
        const canon = canonSidoCodeFromDisp(f.시도코드);
        sidoByCode.set(f.시도코드, { name: f.시도명, canon });
    }

    /** @type {{ codeStr: string, name: string, canon: number | null, outLeft: string }[]} */
    const sidoRows = [...sidoByCode.entries()].map(([codeStr, meta]) => ({
        codeStr,
        name: meta.name,
        canon: meta.canon,
        outLeft: recomputedForCustom ? codeStr : remapSido(codeStr),
    }));

    if (!recomputedForCustom) {
        /** 출력 시도 블록 좌측 코드 중복 (서로 다른 원본 키가 같은 새 코드로 수렴) */
        const seenNew = new Map();
        for (const row of sidoRows) {
            if (row.canon == null || !map.has(row.canon)) continue;
            const prev = seenNew.get(row.outLeft);
            if (prev != null && prev !== row.codeStr) {
                errors.push(
                    `시도 출력 코드 "${row.outLeft}" 충돌: CodeBook 키 "${prev}"와 "${row.codeStr}"가 동일한 새 코드로 치환됩니다.`,
                );
            } else {
                seenNew.set(row.outLeft, row.codeStr);
            }
        }
    }

    /** @type {{ codeStr: string, name: string, canon: number | null, outLeft: string }[]} */
    let sidoSorted;
    if (recomputedForCustom) {
        sidoSorted = [...sidoRows].sort((a, b) => {
            const na = parseInt(a.outLeft, 10);
            const nb = parseInt(b.outLeft, 10);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            return a.name.localeCompare(b.name, 'ko', { numeric: true });
        });
    } else {
        const mapped = sidoRows.filter((r) => r.canon != null && map.has(r.canon));
        const unmapped = sidoRows.filter((r) => r.canon == null || !map.has(r.canon));
        mapped.sort((a, b) => {
            const na = parseInt(a.outLeft, 10);
            const nb = parseInt(b.outLeft, 10);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            return cmpDispCodeStrings(a.codeStr, b.codeStr);
        });
        unmapped.sort((a, b) => cmpDispCodeStrings(a.codeStr, b.codeStr));
        sidoSorted = [...mapped, ...unmapped];
    }

    /** @type {Map<string, { 시도코드: string, 시군구코드: string, 시군구명: string }>} */
    const sigByKey = new Map();
    /** @type {Map<string, { 시도코드: string, 시군구코드: string, 읍면동코드: string, 읍면동명: string }>} */
    const eupByKey = new Map();

    for (const f of flats) {
        if (f.시군구코드 && f.시군구명) {
            const k = `${f.시도코드}\t${f.시군구코드}`;
            if (!sigByKey.has(k)) {
                sigByKey.set(k, {
                    시도코드: f.시도코드,
                    시군구코드: f.시군구코드,
                    시군구명: f.시군구명,
                });
            }
        }
        if (f.시군구코드 && f.시군구명 && f.읍면동코드 && f.읍면동명) {
            const k = `${f.시도코드}\t${f.시군구코드}\t${f.읍면동코드}`;
            if (!eupByKey.has(k)) {
                eupByKey.set(k, {
                    시도코드: f.시도코드,
                    시군구코드: f.시군구코드,
                    읍면동코드: f.읍면동코드,
                    읍면동명: f.읍면동명,
                });
            }
        }
    }

    const sigsSorted = [...sigByKey.values()].sort(compareFlat);
    const eupsSorted = [...eupByKey.values()].sort(compareFlat);

    const lines = [];
    lines.push(ATTRIB_EX_HEADER_1);
    for (const row of sidoSorted) {
        lines.push(`${row.outLeft}:${row.name}`);
    }
    lines.push('');
    lines.push(ATTRIB_EX_HEADER_2);
    for (const s of sigsSorted) {
        lines.push(`${s.시군구코드}:${s.시군구명} *attribute[${sidoPathForAttribute(s.시도코드)}]`);
    }
    lines.push('');
    lines.push(ATTRIB_EX_HEADER_3);
    for (const e of eupsSorted) {
        lines.push(`${e.읍면동코드}:${e.읍면동명} *attribute[${sidoPathForAttribute(e.시도코드)}\\${e.시군구코드}]`);
    }

    return { text: lines.join('\n'), errors };
}
