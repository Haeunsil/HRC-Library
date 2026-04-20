/**
 * CodeBook 표시용 코드 v4 — 클라이언트 참조·테스트용.
 * `disp_sido`는 서버와 동일하게 맞춘 뒤, 시군구·읍면동 표시 코드만 재현한다.
 *
 * 정렬: 시도 코드 → 시군구 라벨(ko) → 읍면동 라벨(ko) → raw(타이브레이커)
 *
 * - disp_sigungu: 3–4자리 가변 — `시도정수*100 + 시군구순번`(1–99). 예: 시도 1 → 101–199.
 * - disp_eup: 5–6자리 가변 — `Number(시군구표시코드)*100 + 읍면동순번`(1–99), 0 패딩 없음. 예: 101 → 10101–10199.
 *
 * @see client/docs/address/codebook-display-code-system.md — ruleset v4
 */

/** @param {string} s */
function norm(s) {
    return String(s ?? '')
        .trim()
        .normalize('NFKC');
}

/**
 * @param {string} a
 * @param {string} b
 * @param {string} [tieA]
 * @param {string} [tieB]
 */
export function compareKoreanLabel(a, b, tieA = '', tieB = '') {
    const c = norm(a).localeCompare(norm(b), 'ko', { numeric: true, sensitivity: 'variant' });
    if (c !== 0) return c;
    return String(tieA).localeCompare(String(tieB), 'ko', { numeric: true });
}

const SEJONG_PLACEHOLDER = '__SEJONG_SINGLE_SIGUNGU__';

/** @param {number} sido @param {number} ordSg 1..99 */
function sigunguDisplayCodeFromSidoOrdinal(sido, ordSg) {
    if (ordSg < 1 || ordSg > 99) {
        throw new Error(`[codebookDisplayCodesV4] 시군구 순번 1–99만 허용: ${ordSg}`);
    }
    if (sido < 1 || sido > 99) {
        throw new Error(`[codebookDisplayCodesV4] 지원하지 않는 disp_sido: ${sido}`);
    }
    return String(sido * 100 + ordSg);
}

/** @param {string} sigDigits 숫자만(가변 길이) @param {number} ordEu 1..99 */
function eupDisplayCodeFromSigunguCode(sigDigits, ordEu) {
    if (!sigDigits || !/^\d+$/.test(sigDigits)) {
        throw new Error(`[codebookDisplayCodesV4] 시군구 표시코드는 숫자만 허용: ${sigDigits}`);
    }
    if (ordEu < 1 || ordEu > 99) {
        throw new Error(`[codebookDisplayCodesV4] 읍면동 순번 1–99만 허용: ${ordEu}`);
    }
    return String(Number.parseInt(sigDigits, 10) * 100 + ordEu);
}

/** @param {string} sgKey */
function sigLabelForSort(sgKey) {
    if (sgKey === SEJONG_PLACEHOLDER) return '세종시';
    return norm(sgKey);
}

/**
 * ruleset v4 — 시군구·읍면동 표시코드 부여.
 * @param {Record<string, unknown>[]} items — 각 행에 `disp_sido` 필요
 * @param {string} [_kind]
 * @returns {Record<string, unknown>[]}
 */
export function enrichDisplayCodesV4FromSido(items, _kind = '') {
    if (!Array.isArray(items) || items.length === 0) return [];

    const rows = items.filter((x) => x && typeof x === 'object').map((it) => ({ ...it }));

    const primaryRaw = (r) =>
        String(r.행정기관코드 ?? r.법정동코드 ?? r.code ?? '').trim();
    const sigOf = (r) => String(r.시군구명 ?? r.sigungu_name ?? '').trim();
    const eupOf = (r) => String(r.읍면동명 ?? r.eupmyeondong_name ?? '').trim();

    /** @type {Map<string, Set<string>>} */
    const sigKeysBySido = new Map();
    for (const r of rows) {
        const ds = String(r.disp_sido ?? '').trim();
        if (!ds || !/^\d+$/.test(ds)) continue;
        let sgKey = sigOf(r);
        if (ds === '17' && !sgKey) sgKey = SEJONG_PLACEHOLDER;
        if (!sigKeysBySido.has(ds)) sigKeysBySido.set(ds, new Set());
        sigKeysBySido.get(ds).add(sgKey);
    }

    /** @type {Map<string, Map<string, string>>} */
    const sigMap = new Map();
    const sidoOrder = Array.from(sigKeysBySido.keys()).sort((a, b) => {
        const na = Number.parseInt(a, 10);
        const nb = Number.parseInt(b, 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) return na - nb;
        return a.localeCompare(b, 'ko', { numeric: true });
    });

    for (const ds of sidoOrder) {
        const sidoI = Number.parseInt(ds, 10);
        const keys = Array.from(sigKeysBySido.get(ds) ?? []).sort((x, y) =>
            compareKoreanLabel(sigLabelForSort(x), sigLabelForSort(y), x, y),
        );
        const m = new Map();
        for (let i = 0; i < keys.length; i++) {
            const ord = i + 1;
            if (ord > 99) {
                throw new Error(
                    `[codebookDisplayCodesV4] 시도 ${ds}: 시군구가 99개를 초과했습니다(순번 1–99).`,
                );
            }
            m.set(keys[i], sigunguDisplayCodeFromSidoOrdinal(sidoI, ord));
        }
        sigMap.set(ds, m);
    }

    /** @type {Map<string, Set<string>>} */
    const eupByBranch = new Map();
    for (const r of rows) {
        const ds = String(r.disp_sido ?? '').trim();
        if (!ds || !/^\d+$/.test(ds)) continue;
        let sgKey = sigOf(r);
        if (ds === '17' && !sgKey) sgKey = SEJONG_PLACEHOLDER;
        const sm = sigMap.get(ds);
        if (!sm || !sm.has(sgKey)) continue;
        const b = `${ds}\t${sgKey}`;
        if (!eupByBranch.has(b)) eupByBranch.set(b, new Set());
        eupByBranch.get(b).add(eupOf(r));
    }

    /** @type {Map<string, string>} */
    const eupMap = new Map();
    const branches = Array.from(eupByBranch.entries()).sort(([ka], [kb]) => ka.localeCompare(kb, 'ko'));
    for (const [branch, euSet] of branches) {
        const [ds, sgKey] = branch.split('\t');
        const sm = sigMap.get(ds);
        const sigStr = sm?.get(sgKey) ?? '';
        if (!sigStr) continue;
        const sortedEu = Array.from(euSet).sort((x, y) => compareKoreanLabel(x, y, x, y));
        for (let i = 0; i < sortedEu.length; i++) {
            const ordEu = i + 1;
            if (ordEu > 99) {
                throw new Error(
                    `[codebookDisplayCodesV4] 시도 ${ds} 시군구키 ${sgKey}: 읍면동이 99개를 초과했습니다(순번 1–99).`,
                );
            }
            eupMap.set(`${ds}\t${sgKey}\t${sortedEu[i]}`, eupDisplayCodeFromSigunguCode(sigStr, ordEu));
        }
    }

    const out = [];
    for (const r of rows) {
        const ds = String(r.disp_sido ?? '').trim();
        if (!ds || !/^\d+$/.test(ds)) {
            r.disp_sigungu = '';
            r.disp_eup = '';
            out.push(r);
            continue;
        }
        let sgKey = sigOf(r);
        if (ds === '17' && !sgKey) sgKey = SEJONG_PLACEHOLDER;
        const sm = sigMap.get(ds);
        const sgC = sm?.get(sgKey) ?? '';
        const eu = eupOf(r);
        const euC = sgC ? eupMap.get(`${ds}\t${sgKey}\t${eu}`) ?? '' : '';
        r.disp_sigungu = sgC;
        r.disp_eup = euC;
        out.push(r);
    }

    out.sort((ra, rb) => {
        const da = Number.parseInt(String(ra.disp_sido ?? '').trim(), 10);
        const db = Number.parseInt(String(rb.disp_sido ?? '').trim(), 10);
        const fa = Number.isFinite(da) && String(da) === String(ra.disp_sido ?? '').trim();
        const fb = Number.isFinite(db) && String(db) === String(rb.disp_sido ?? '').trim();
        if (fa && fb && da !== db) return da - db;
        if (fa !== fb) return fa ? -1 : 1;
        const c1 = compareKoreanLabel(sigOf(ra), sigOf(rb), primaryRaw(ra), primaryRaw(rb));
        if (c1 !== 0) return c1;
        const c2 = compareKoreanLabel(eupOf(ra), eupOf(rb), primaryRaw(ra), primaryRaw(rb));
        if (c2 !== 0) return c2;
        return primaryRaw(ra).localeCompare(primaryRaw(rb), 'ko', { numeric: true });
    });

    return out;
}

/** @deprecated ruleset v4와 동일 — 기존 import 호환 */
export const enrichDisplayCodesV3FromSido = enrichDisplayCodesV4FromSido;

/** @deprecated 파일명 호환용 별칭 */
export const enrichDisplayCodesV2FromSido = enrichDisplayCodesV4FromSido;
