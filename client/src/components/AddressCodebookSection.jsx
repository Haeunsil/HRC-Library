import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
    fetchAddressOdcloudCodebookFromSnapshot,
    fetchAddressOdcloudLegalCodebookFromSnapshot,
} from '../api';
import { parseAdminDistrictCode10 } from '../utils/parseAdminDistrictCode10';
import { referenceYmFromCodebookItems, ymFromCodebookRow } from '../utils/codebookReferenceYm';

/**
 * 주소 CodeBook 표 UI·엑셀 컬럼을 바꿀 때는 아래 문서의 체크리스트를 함께 갱신한다.
 * @see client/docs/address/admin-district-code-10.md — §「CodeBook UI·엑셀」·「문서·코드 동기화」
 * @see client/docs/address/codebook-display-code-system.md — 표시용 disp_* 규칙(ruleset v4)
 * @see client/src/utils/codebookDisplayCodesV2.js — v4 부여 로직(`enrichDisplayCodesV4FromSido`)
 * @see server/docs/codebook-odcloud-snapshot-architecture.md — 행정동 스냅샷과 프런트 연계
 *
 * 열 순서: raw 코드 → 표시용 시도·시군구·읍면동 코드(disp_*, 서버 `codebook_display_codes`)·명칭 열.
 * 통계용 10자리 분해(`parseAdminDistrictCode10`)는 표시용 코드 미부여 시 시·군구·읍면동 코드 폴백에만 사용(엑셀 다운로드에는 미포함).
 * 표시 데이터: 시도명·시군구명·읍면동리(표시) 명칭이 모두 같은 행은 코드가 달라도 동일 지역으로 보고 첫 행만 남긴다(`dedupeCodebookRowsByAdminPathNames`).
 * @typedef {'code' | 'sido2' | 'sido' | 'sigungu3' | 'sigungu' | 'eup3' | 'eup'} CodebookColKey
 */

const COL_KEYS = /** @type {const} */ (['code', 'sido2', 'sido', 'sigungu3', 'sigungu', 'eup3', 'eup']);

/** @param {CodebookColKey} col */
function isMonoStyledCol(col) {
    return col === 'code' || col === 'sido2' || col === 'sigungu3' || col === 'eup3';
}

/** CodeBook 본문·요약·헤더 폰트 크기 (테이블 `text-sm`과 동일) */
const CB_TEXT = 'text-sm';

/** 강조 텍스트 — index.css 의 var(--color-red-700) */
const CB_ACCENT = 'text-[color:var(--color-red-700)]';

const CODEBOOK_PAGE_SIZE = 250;

function errorMessage(e) {
    const d = e?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg || x).join('; ');
    if (d && typeof d === 'object') return String(d.message || JSON.stringify(d)).slice(0, 400);
    return e?.message || '코드북을 불러오지 못했습니다.';
}

function primaryCode(r, kind) {
    if (kind === 'admin') return String(r.행정기관코드 ?? r.code ?? '').trim();
    return String(r.법정동코드 ?? r.code ?? '').trim();
}

function sidoKr(r) {
    return String(r.시도명 ?? r.sido_name ?? '').trim();
}
function sigKr(r) {
    return String(r.시군구명 ?? r.sigungu_name ?? '').trim();
}
function eupKr(r) {
    return String(r.읍면동명 ?? r.eupmyeondong_name ?? '').trim();
}

/**
 * 숫자만인 문자열은 Number로, 아니면 locale 비교용 문자열로 비교.
 * @param {string} sa
 * @param {string} sb
 */
function cmpDispCodeStrings(sa, sb) {
    const a = String(sa ?? '');
    const b = String(sb ?? '');
    const da = a && /^\d+$/.test(a) ? Number(a) : null;
    const db = b && /^\d+$/.test(b) ? Number(b) : null;
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db != null) return 0;
    return a.localeCompare(b, 'ko', { numeric: true });
}

/**
 * 코드북 기본 정렬: 시도코드 → 시군구코드 → 읍면동코드(표시) → raw
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @param {'admin' | 'legal'} apiKind
 */
function compareCodebookRowsByDisplayOrder(a, b, apiKind) {
    let c = cmpDispCodeStrings(String(a?.disp_sido ?? '').trim(), String(b?.disp_sido ?? '').trim());
    if (c !== 0) return c;
    c = cmpDispCodeStrings(String(a?.disp_sigungu ?? '').trim(), String(b?.disp_sigungu ?? '').trim());
    if (c !== 0) return c;
    c = cmpDispCodeStrings(String(a?.disp_eup ?? '').trim(), String(b?.disp_eup ?? '').trim());
    if (c !== 0) return c;
    return primaryCode(a, apiKind).localeCompare(primaryCode(b, apiKind), 'ko', { numeric: true });
}

/**
 * 행정기관코드·법정동코드 등 코드가 달라도, 시도명·시군구명·읍면동리(표시) 명칭이 모두 같으면 동일 지역으로 간주해 한 행만 남긴다.
 * @param {Record<string, unknown>[]} rows 이미 표시 순으로 정렬된 배열
 */
function dedupeCodebookRowsByAdminPathNames(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const k = `${sidoKr(r)}\x1e${sigKr(r)}\x1e${eupKr(r)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
    }
    return out;
}

/**
 * 필터 패널 고유값 목록 정렬 (숫자 전용 문자열·일반 문자열 혼합 `cmpDispCodeStrings`)
 * @param {string[]} values
 * @param {CodebookColKey} col
 * @param {{ col: CodebookColKey, asc: boolean } | null} tableSortKey 표에 적용 중인 열 정렬(해당 열일 때만 방향 반영)
 */
function sortFilterUniqueValues(values, col, tableSortKey) {
    const arr = [...values];
    const asc = tableSortKey && tableSortKey.col === col ? tableSortKey.asc : true;
    arr.sort((x, y) => {
        const c = cmpDispCodeStrings(String(x ?? ''), String(y ?? ''));
        return asc ? c : -c;
    });
    return arr;
}

/**
 * @param {Record<string, unknown>} r
 * @param {'admin' | 'legal'} apiKind
 * @param {CodebookColKey} col
 */
function getCellValueForCol(r, apiKind, col) {
    switch (col) {
        case 'sido2': {
            const d = String(r.disp_sido ?? '').trim();
            if (d) return d;
            const parsed = parseAdminDistrictCode10(primaryCode(r, apiKind));
            return parsed.ok ? parsed.sidoCode2 : '';
        }
        case 'sigungu3': {
            const d = String(r.disp_sigungu ?? '').trim();
            if (d) return d;
            const parsed = parseAdminDistrictCode10(primaryCode(r, apiKind));
            return parsed.ok ? parsed.sigunguCode3 : '';
        }
        case 'eup3': {
            const d = String(r.disp_eup ?? '').trim();
            if (d) return d;
            const parsed = parseAdminDistrictCode10(primaryCode(r, apiKind));
            return parsed.ok ? parsed.eupmyeondongCode3 : '';
        }
        case 'code':
            return primaryCode(r, apiKind);
        case 'sido':
            return sidoKr(r);
        case 'sigungu':
            return sigKr(r);
        case 'eup':
            return eupKr(r);
        default:
            return '';
    }
}

/**
 * 전 행을 한 번만 순회해 열별 고유값을 수집한다(열당 전체 스캔 7회 → 1회).
 * @param {Record<string, unknown>[]} rows
 * @param {'admin' | 'legal'} apiKind
 * @returns {Record<CodebookColKey, string[]>}
 */
function buildUniquesByColOnePass(rows, apiKind) {
    const sets = {
        code: new Set(),
        sido2: new Set(),
        sido: new Set(),
        sigungu3: new Set(),
        sigungu: new Set(),
        eup3: new Set(),
        eup: new Set(),
    };
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        for (const col of COL_KEYS) {
            sets[col].add(getCellValueForCol(r, apiKind, col));
        }
    }
    /** @type {Record<CodebookColKey, string[]>} */
    const out = {
        code: [],
        sido2: [],
        sido: [],
        sigungu3: [],
        sigungu: [],
        eup3: [],
        eup: [],
    };
    for (const col of COL_KEYS) {
        const list = Array.from(sets[col]);
        list.sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true }));
        out[col] = list;
    }
    return out;
}

/**
 * 필터 초기 상태: null = 해당 열 값 전체 선택(대량 Set 복사 없음).
 * @param {Set<string> | null} draft
 * @param {string[]} uniques
 */
function isFilterDraftFullSelection(draft, uniques) {
    if (draft === null) return true;
    if (draft.size !== uniques.length) return false;
    for (const u of uniques) {
        if (!draft.has(u)) return false;
    }
    return true;
}

/** @param {Set<string>} a @param {Set<string>} b */
function setsEqualForFilter(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

/**
 * 페이징·열 필터와 무관하게 서버에서 받은 전체 행을 엑셀 한 시트로 직렬화.
 * @param {Record<string, unknown>[]} rows
 * @param {'admin' | 'legal'} apiKind
 */
function rowsToCodebookExportRows(rows, apiKind) {
    const codeKey = apiKind === 'admin' ? '행정기관코드' : '법정동코드';
    return rows.map((r) => {
        const pc = primaryCode(r, apiKind);
        const seg = parseAdminDistrictCode10(pc);
        const dispSido = String(r.disp_sido ?? '').trim();
        const dispSig = String(r.disp_sigungu ?? '').trim();
        const dispEup = String(r.disp_eup ?? '').trim();
        return {
            기준연월: ymFromCodebookRow(r) || '',
            [codeKey]: pc,
            시도코드: dispSido || (seg.ok ? seg.sidoCode2 : ''),
            시도명: sidoKr(r),
            시군구코드: dispSig || (seg.ok ? seg.sigunguCode3 : ''),
            시군구명: sigKr(r),
            읍면동코드: dispEup || (seg.ok ? seg.eupmyeondongCode3 : ''),
            '읍면동리 명': eupKr(r),
        };
    });
}

function rowMatchesExcelColumnSets(r, apiKind, applied) {
    for (const col of COL_KEYS) {
        const sel = applied[col];
        if (sel == null) continue;
        const raw = getCellValueForCol(r, apiKind, col);
        const key = raw === '' ? '' : raw;
        if (!sel.has(key)) return false;
    }
    return true;
}

/**
 * @param {Set<string> | null} applied
 * @param {string[]} allUniques
 */
function isColumnFiltered(applied, allUniques) {
    if (applied == null) return false;
    if (applied.size !== allUniques.length) return true;
    for (const u of allUniques) {
        if (!applied.has(u)) return true;
    }
    return false;
}

const EMPTY_APPLIED_SETS = /** @type {Record<CodebookColKey, Set<string> | null>} */ ({
    code: null,
    sido2: null,
    sido: null,
    sigungu3: null,
    sigungu: null,
    eup3: null,
    eup: null,
});

function CodebookSqliteEmptyHelp() {
    return (
        <div className={`${CB_TEXT} text-slate-600 space-y-3 leading-relaxed text-center`}>
            <p className="m-0 text-slate-700">
                DB는 연결되었지만 <strong>현재 유효 스냅샷 행(is_current=1)</strong>이 없습니다. 월 배치를 한 번 실행하면 이 표에
                데이터가 채워집니다.
            </p>
            <ol className="m-0 pl-0 list-decimal list-inside space-y-2.5 text-center">
                <li>
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>server/.env</code>에{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>DISTRICT_BATCH_SECRET</code>을
                    임의의 비밀 문자열로 넣습니다.
                </li>
                <li>
                    법정동 수집:{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>DATA_GO_KR_SERVICE_KEY</code> ·
                    행정동 수집:{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>SGIS_CONSUMER_KEY</code> /{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>SGIS_CONSUMER_SECRET</code>
                </li>
                <li>
                    HTTP로 실행:{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>POST /api/districts/snapshot/batch/monthly</code>
                    — 헤더{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>X-District-Batch-Secret</code>에
                    1번 값과 동일하게 넣습니다.
                </li>
                <li>
                    터미널: <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>server</code> 폴더로 이동한 뒤
                    실행합니다. (<code className={CB_TEXT}>main.py</code>와{' '}
                    <code className={CB_TEXT}>public_district_codes</code> 폴더가 보이는 위치){' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>python -m public_district_codes.batch_monthly</code>
                    · Windows는 같은 폴더의{' '}
                    <code className={`${CB_TEXT} bg-slate-100 px-1 py-0.5 rounded`}>run_district_batch.bat</code>
                </li>
            </ol>
        </div>
    );
}

/**
 * 엑셀 스타일 열 필터 패널 (포털로 표 스크롤 영역 밖에 표시)
 * @param {{
 *   open: boolean,
 *   anchorRect: { top: number, left: number, width: number, height: number } | null,
 *   columnLabel: string,
 *   columnKey: CodebookColKey,
 *   uniqueValues: string[],
 *   draft: Set<string> | null — null이면 uniqueValues 전체 선택(부모에서 대량 Set 생성 안 함)
 *   setDraft: (fn: (prev: Set<string> | null) => Set<string> | null) => void,
 *   tableSortKey: { col: CodebookColKey, asc: boolean } | null,
 *   onTableSortAsc: () => void,
 *   onTableSortDesc: () => void,
 *   onApply: () => void,
 *   onCancel: () => void,
 * }} props
 */
/** 필터 목록 한 줄(체크박스+라벨) 대략 높이 — 가상 스크롤용 */
const FILTER_LIST_ITEM_HEIGHT = 38;
const FILTER_LIST_OVERSCAN = 6;

function ExcelFilterPanel({
    open,
    anchorRect,
    columnLabel,
    columnKey,
    uniqueValues,
    draft,
    setDraft,
    tableSortKey,
    onTableSortAsc,
    onTableSortDesc,
    onApply,
    onCancel,
}) {
    const [listSearch, setListSearch] = useState('');
    const panelRef = useRef(null);
    const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [listScrollTop, setListScrollTop] = useState(0);
    const [listViewportH, setListViewportH] = useState(220);

    useEffect(() => {
        if (!open) setListSearch('');
    }, [open]);

    useEffect(() => {
        setListScrollTop(0);
        const el = listScrollRef.current;
        if (el) el.scrollTop = 0;
    }, [open, columnKey, listSearch]);

    const filteredUniques = useMemo(() => {
        const q = listSearch.trim().toLowerCase();
        if (!q) return uniqueValues;
        return uniqueValues.filter((v) => String(v).toLowerCase().includes(q));
    }, [uniqueValues, listSearch]);

    const sortedPanelUniques = useMemo(
        () => sortFilterUniqueValues(filteredUniques, columnKey, tableSortKey),
        [filteredUniques, columnKey, tableSortKey],
    );

    const sortActiveAsc = tableSortKey && tableSortKey.col === columnKey ? tableSortKey.asc : null;

    useLayoutEffect(() => {
        if (!open || !anchorRect) return;
        const el = panelRef.current;
        if (!el) return;
        const pad = 8;
        const rect = el.getBoundingClientRect();
        let top = anchorRect.top + (anchorRect.height || 0) + 4;
        let left = anchorRect.left;
        if (left + rect.width > window.innerWidth - pad) {
            left = Math.max(pad, window.innerWidth - rect.width - pad);
        }
        if (top + rect.height > window.innerHeight - pad) {
            top = Math.max(pad, anchorRect.top - rect.height - 4);
        }
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
    }, [open, anchorRect, sortedPanelUniques.length, listSearch]);

    useEffect(() => {
        if (!open) return;
        const sc = listScrollRef.current;
        if (!sc) return;
        const measure = () => setListViewportH(Math.max(120, sc.clientHeight || 220));
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(sc);
        return () => ro.disconnect();
    }, [open, sortedPanelUniques.length]);

    const { virtualStart, virtualEnd, padTop, padBottom } = useMemo(() => {
        const len = sortedPanelUniques.length;
        if (len === 0) {
            return { virtualStart: 0, virtualEnd: 0, padTop: 0, padBottom: 0 };
        }
        const start = Math.max(0, Math.floor(listScrollTop / FILTER_LIST_ITEM_HEIGHT) - FILTER_LIST_OVERSCAN);
        const end = Math.min(
            len,
            Math.ceil((listScrollTop + listViewportH) / FILTER_LIST_ITEM_HEIGHT) + FILTER_LIST_OVERSCAN,
        );
        const padTop = start * FILTER_LIST_ITEM_HEIGHT;
        const padBottom = (len - end) * FILTER_LIST_ITEM_HEIGHT;
        return { virtualStart: start, virtualEnd: end, padTop, padBottom };
    }, [sortedPanelUniques.length, listScrollTop, listViewportH]);

    useEffect(() => {
        if (!open) return;
        const onDocMouseDown = (e) => {
            const p = panelRef.current;
            if (p && p.contains(e.target)) return;
            onCancel();
        };
        const t = setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener('mousedown', onDocMouseDown);
        };
    }, [open, onCancel]);

    if (!open || !anchorRect) return null;

    const selectAllInList = () => {
        setDraft(null);
    };
    const clearAllInList = () => {
        setDraft(() => new Set());
    };
    const allInListSelected =
        sortedPanelUniques.length > 0 &&
        (draft === null || sortedPanelUniques.every((v) => draft.has(v)));
    const toggleVisibleAll = () => {
        if (allInListSelected) {
            setDraft((prev) => {
                if (prev === null) {
                    const n = new Set(uniqueValues);
                    for (const v of sortedPanelUniques) n.delete(v);
                    return n;
                }
                const n = new Set(prev);
                for (const v of sortedPanelUniques) n.delete(v);
                return n;
            });
        } else {
            setDraft((prev) => {
                if (prev === null) return null;
                const n = new Set(prev);
                for (const v of sortedPanelUniques) n.add(v);
                return n;
            });
        }
    };

    const panel = (
        <div
            ref={panelRef}
            role="dialog"
            aria-label={`${columnLabel} 필터`}
            className="fixed z-[9999] w-[min(100vw-16px,280px)] max-h-[min(72vh,320px)] flex flex-col rounded-lg border border-slate-200 bg-white py-2 shadow-lg ring-1 ring-black/5"
            style={{ top: -9999, left: -9999 }}
        >
            <div className={`px-2 pb-1.5 ${CB_TEXT} font-semibold text-slate-700 border-b border-slate-100 shrink-0`}>
                {columnLabel}
            </div>
            <div className="px-2 pt-2 shrink-0">
                <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="목록에서 검색"
                    className={`w-full rounded border border-slate-200 px-2 py-1.5 ${CB_TEXT} text-slate-800 placeholder:text-slate-400`}
                />
            </div>
            <div className={`px-2 pt-2 flex flex-wrap gap-1 shrink-0 ${CB_TEXT}`}>

                <button
                    type="button"
                    onClick={() => onTableSortAsc()}
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                        sortActiveAsc === true
                            ? 'border-slate-700 bg-slate-800 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    오름차순
                </button>
                <button
                    type="button"
                    onClick={() => onTableSortDesc()}
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                        sortActiveAsc === false
                            ? 'border-slate-700 bg-slate-800 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    내림차순
                </button>
            </div>
            <div className="px-2 pt-2 flex gap-1 flex-wrap shrink-0">
                <button
                    type="button"
                    onClick={toggleVisibleAll}
                    className={`rounded border border-slate-200 bg-slate-50 px-2 py-1 ${CB_TEXT} font-semibold text-slate-700 hover:bg-slate-100`}
                >
                    {allInListSelected ? '보이는 항목 해제' : '보이는 항목 선택'}
                </button>
                <button
                    type="button"
                    onClick={selectAllInList}
                    className={`rounded border border-slate-200 bg-white px-2 py-1 ${CB_TEXT} font-semibold text-slate-700 hover:bg-slate-50`}
                >
                    전체 선택
                </button>
                <button
                    type="button"
                    onClick={clearAllInList}
                    className={`rounded border border-slate-200 bg-white px-2 py-1 ${CB_TEXT} font-semibold text-slate-700 hover:bg-slate-50`}
                >
                    전체 해제
                </button>
            </div>
            <div
                ref={listScrollRef}
                className="mt-1 mx-2 flex-1 min-h-0 overflow-y-auto border border-slate-100 rounded-md bg-slate-50/50"
                onScroll={(e) => setListScrollTop(e.currentTarget.scrollTop)}
            >
                {sortedPanelUniques.length === 0 ? (
                    <p className={`px-2 py-3 text-center ${CB_TEXT} text-slate-500 m-0`}>일치하는 값이 없습니다.</p>
                ) : (
                    <ul className="m-0 p-0 list-none" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
                        {sortedPanelUniques.slice(virtualStart, virtualEnd).map((v) => {
                            const checked = draft === null || draft.has(v);
                            const label = v === '' ? '(빈 값)' : String(v);
                            return (
                                <li
                                    key={v === '' ? '__empty__' : v}
                                    className="border-b border-slate-100/80 last:border-0"
                                    style={{ minHeight: FILTER_LIST_ITEM_HEIGHT }}
                                >
                                    <label
                                        className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 text-left ${CB_TEXT} hover:bg-white/90`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                                setDraft((prev) => {
                                                    if (prev === null) {
                                                        const n = new Set(uniqueValues);
                                                        n.delete(v);
                                                        return n;
                                                    }
                                                    const n = new Set(prev);
                                                    if (n.has(v)) n.delete(v);
                                                    else n.add(v);
                                                    return n;
                                                });
                                            }}
                                            className="shrink-0 rounded border-slate-300"
                                        />
                                        <span className={`min-w-0 flex-1 break-all ${CB_TEXT} text-slate-800`}>{label}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            <div className="mt-2 px-2 flex justify-end gap-2 border-t border-slate-100 pt-2 shrink-0">
                <button
                    type="button"
                    onClick={onCancel}
                    className={`rounded-md border border-slate-200 bg-white px-3 py-1.5 ${CB_TEXT} font-semibold text-slate-700 hover:bg-slate-50`}
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={onApply}
                    className={`rounded-md bg-slate-800 px-3 py-1.5 ${CB_TEXT} font-semibold text-white hover:bg-slate-900`}
                >
                    확인
                </button>
            </div>
        </div>
    );

    return createPortal(panel, document.body);
}

/**
 * 행정동·법정동 CodeBook: 각각 odcloud 스냅샷(SQLite)만 조회 — 갱신은 배치/수동.
 * - 행정: 15097972 → `GET /api/districts/snapshot/odcloud-codebook`
 * - 법정: 15099158 → `GET /api/districts/snapshot/odcloud-codebook/legal`
 * @param {{ kind: 'admin' | 'legal' }} props
 */
export default function AddressCodebookSection({ kind }) {
    const apiKind = kind === 'admin' ? 'admin' : 'legal';

    const [sourceRows, setSourceRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState(null);
    const [loadMeta, setLoadMeta] = useState(null);
    /** @type {[Record<CodebookColKey, Set<string> | null>, React.Dispatch<React.SetStateAction<Record<CodebookColKey, Set<string> | null>>>]} */
    const [appliedSets, setAppliedSets] = useState(() => ({ ...EMPTY_APPLIED_SETS }));
    /** 열 필터 패널에서 오름/내림 선택 시 표·필터 목록에 즉시 적용(null이면 기본 표시코드 정렬) */
    /** @type {[{ col: CodebookColKey, asc: boolean } | null, React.Dispatch<React.SetStateAction<{ col: CodebookColKey, asc: boolean } | null>>]} */
    const [sortKey, setSortKey] = useState(null);
    /** @type {React.MutableRefObject<Partial<Record<CodebookColKey, HTMLButtonElement | null>>>} */
    const filterBtnRefs = useRef({});
    /** @type {[CodebookColKey | null, React.Dispatch<React.SetStateAction<CodebookColKey | null>>]} */
    const [openFilterCol, setOpenFilterCol] = useState(null);
    const [filterAnchorRect, setFilterAnchorRect] = useState(null);
    /** null = 열 전체 값 선택(고유값 수만큼 Set을 만들지 않음) */
    const [filterDraft, setFilterDraft] = useState(/** @type {Set<string> | null} */ (null));
    const [pageIndex, setPageIndex] = useState(0);
    /** 페이징 숫자 입력란(Enter·이동으로만 적용, blur 시 현재 페이지로 되돌림) */
    const [pageJumpDraft, setPageJumpDraft] = useState('1');

    const fetchGenRef = useRef(0);

    useEffect(() => {
        setAppliedSets({ ...EMPTY_APPLIED_SETS });
        setSortKey(null);
    }, [apiKind]);

    useEffect(() => {
        const myGen = ++fetchGenRef.current;
        setLoading(true);
        setErrMsg(null);
        setLoadMeta(null);
        setOpenFilterCol(null);
        setFilterAnchorRect(null);

        (async () => {
            try {
                if (apiKind === 'legal') {
                    const d = await fetchAddressOdcloudLegalCodebookFromSnapshot();
                    if (fetchGenRef.current !== myGen) return;
                    if (!d || typeof d !== 'object') {
                        setSourceRows([]);
                        setErrMsg('코드북 응답 형식이 올바르지 않습니다.');
                        return;
                    }
                    const items = Array.isArray(d.items)
                        ? d.items
                        : Array.isArray(d.data?.items)
                          ? d.data.items
                          : [];
                    setSourceRows(items);
                    setLoadMeta({
                        count: typeof d.count === 'number' ? d.count : items.length,
                        source: d.source != null ? String(d.source) : '',
                        refreshedAt: typeof d.refreshed_at === 'string' ? d.refreshed_at : '',
                        snapshotEmptyReason:
                            typeof d.snapshot_empty_reason === 'string' ? d.snapshot_empty_reason : '',
                        hint: typeof d.empty_hint === 'string' ? d.empty_hint : '',
                    });
                    if (items.length === 0 && d.detail != null && String(d.detail).trim() !== '') {
                        setErrMsg(String(d.detail));
                    }
                    return;
                }

                const d = await fetchAddressOdcloudCodebookFromSnapshot();
                if (fetchGenRef.current !== myGen) return;
                if (!d || typeof d !== 'object') {
                    setSourceRows([]);
                    setErrMsg('코드북 응답 형식이 올바르지 않습니다.');
                    return;
                }
                const items = Array.isArray(d.items)
                    ? d.items
                    : Array.isArray(d.data?.items)
                      ? d.data.items
                      : [];
                setSourceRows(items);
                setLoadMeta({
                    count: typeof d.count === 'number' ? d.count : items.length,
                    source: d.source != null ? String(d.source) : '',
                    refreshedAt: typeof d.refreshed_at === 'string' ? d.refreshed_at : '',
                    snapshotEmptyReason:
                        typeof d.snapshot_empty_reason === 'string' ? d.snapshot_empty_reason : '',
                    hint: typeof d.empty_hint === 'string' ? d.empty_hint : '',
                });
                if (items.length === 0 && d.detail != null && String(d.detail).trim() !== '') {
                    setErrMsg(String(d.detail));
                }
            } catch (e) {
                if (fetchGenRef.current !== myGen) return;
                setSourceRows([]);
                setLoadMeta(null);
                setErrMsg(errorMessage(e));
            } finally {
                if (fetchGenRef.current === myGen) {
                    setLoading(false);
                }
            }
        })();
    }, [apiKind]);

    const { sortedRows, mergedByNameCount } = useMemo(() => {
        const sorted = [...sourceRows].sort((a, b) => compareCodebookRowsByDisplayOrder(a, b, apiKind));
        const deduped = dedupeCodebookRowsByAdminPathNames(sorted);
        return {
            sortedRows: deduped,
            mergedByNameCount: sorted.length - deduped.length,
        };
    }, [sourceRows, apiKind]);

    const uniquesByCol = useMemo(
        () => buildUniquesByColOnePass(sortedRows, apiKind),
        [sortedRows, apiKind],
    );

    /** API `items` 순서의 첫 행 기준연월(행정·법정 동일). 정렬·명칭 병합과 무관 */
    const headerReferenceYm = useMemo(
        () => referenceYmFromCodebookItems(sourceRows),
        [sourceRows],
    );

    const exportFullCodebookExcel = useCallback(() => {
        if (!sortedRows.length) return;
        const exportRows = rowsToCodebookExportRows(sortedRows, apiKind);
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'CodeBook'.slice(0, 31));
        const ymRaw = (headerReferenceYm || '').trim();
        const ymFile =
            ymRaw && /^\d{4}-\d{2}(-\d{2})?$/.test(ymRaw)
                ? ymRaw.replace(/-/g, '').slice(0, 8)
                : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const kindKo = apiKind === 'admin' ? '행정동' : '법정동';
        XLSX.writeFile(wb, `CodeBook_${kindKo}_${ymFile}.xlsx`);
    }, [sortedRows, apiKind, headerReferenceYm]);

    const filteredRows = useMemo(
        () => sortedRows.filter((r) => rowMatchesExcelColumnSets(r, apiKind, appliedSets)),
        [sortedRows, apiKind, appliedSets],
    );

    const orderedFilteredRows = useMemo(() => {
        if (!sortKey) return filteredRows;
        const { col, asc } = sortKey;
        const mul = asc ? 1 : -1;
        return [...filteredRows].sort((a, b) => {
            const va = getCellValueForCol(a, apiKind, col);
            const vb = getCellValueForCol(b, apiKind, col);
            const c = mul * cmpDispCodeStrings(String(va ?? ''), String(vb ?? ''));
            if (c !== 0) return c;
            return compareCodebookRowsByDisplayOrder(a, b, apiKind);
        });
    }, [filteredRows, sortKey, apiKind]);

    useEffect(() => {
        setPageIndex(0);
    }, [apiKind, sourceRows, appliedSets, sortKey]);

    useEffect(() => {
        const total = orderedFilteredRows.length;
        if (total === 0) return;
        const pc = Math.ceil(total / CODEBOOK_PAGE_SIZE);
        const maxIdx = Math.max(0, pc - 1);
        if (pageIndex > maxIdx) setPageIndex(maxIdx);
    }, [orderedFilteredRows.length, pageIndex]);

    const pagination = useMemo(() => {
        const total = orderedFilteredRows.length;
        if (total === 0) {
            return { safePage: 0, pageRows: [], pageCount: 1, rangeFrom: 0, rangeTo: 0 };
        }
        const pageCount = Math.ceil(total / CODEBOOK_PAGE_SIZE);
        const safePage = Math.min(pageIndex, pageCount - 1);
        const start = safePage * CODEBOOK_PAGE_SIZE;
        const end = Math.min(start + CODEBOOK_PAGE_SIZE, total);
        return {
            safePage,
            pageRows: orderedFilteredRows.slice(start, start + CODEBOOK_PAGE_SIZE),
            pageCount,
            rangeFrom: start + 1,
            rangeTo: end,
        };
    }, [orderedFilteredRows, pageIndex]);

    useEffect(() => {
        setPageJumpDraft(String(pagination.safePage + 1));
    }, [pagination.safePage, pagination.pageCount]);

    const commitPageJump = useCallback(() => {
        const pc = Math.max(1, pagination.pageCount);
        const raw = pageJumpDraft.trim();
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || raw === '') {
            setPageJumpDraft(String(pagination.safePage + 1));
            return;
        }
        const clamped = Math.min(pc, Math.max(1, n));
        setPageIndex(clamped - 1);
    }, [pageJumpDraft, pagination.pageCount, pagination.safePage]);

    const revertPageJumpDraft = useCallback(() => {
        setPageJumpDraft(String(pagination.safePage + 1));
    }, [pagination.safePage]);

    const filtersActive = useMemo(
        () =>
            COL_KEYS.some((col) => isColumnFiltered(appliedSets[col], uniquesByCol[col])) || sortKey != null,
        [appliedSets, uniquesByCol, sortKey],
    );

    const openExcelFilter = useCallback(
        (col) => {
            const btn = filterBtnRefs.current[col];
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const applied = appliedSets[col];
            setFilterAnchorRect({ top: r.top, left: r.left, width: r.width, height: r.height });
            setOpenFilterCol(col);
            if (applied == null) {
                setFilterDraft(null);
            } else {
                setFilterDraft(new Set(applied));
            }
        },
        [appliedSets],
    );

    const closeExcelFilter = useCallback(() => {
        setOpenFilterCol(null);
        setFilterAnchorRect(null);
    }, []);

    const applyExcelFilter = useCallback(() => {
        const col = openFilterCol;
        if (!col) return;
        const uniques = uniquesByCol[col];
        const isFull = isFilterDraftFullSelection(filterDraft, uniques);
        setAppliedSets((prev) => ({
            ...prev,
            [col]: isFull ? null : new Set(/** @type {Set<string>} */ (filterDraft)),
        }));
        closeExcelFilter();
    }, [openFilterCol, uniquesByCol, filterDraft, closeExcelFilter]);

    const cancelExcelFilter = useCallback(() => {
        closeExcelFilter();
    }, [closeExcelFilter]);

    const handleFilterPanelSortAsc = useCallback(() => {
        if (openFilterCol) setSortKey({ col: openFilterCol, asc: true });
    }, [openFilterCol]);

    const handleFilterPanelSortDesc = useCallback(() => {
        if (openFilterCol) setSortKey({ col: openFilterCol, asc: false });
    }, [openFilterCol]);

    const colLabels = useMemo(
        () => ({
            code: kind === 'admin' ? '행정기관코드' : '법정동코드',
            sido2: '시도코드',
            sido: '시도명',
            sigungu3: '시군구코드',
            sigungu: '시군구명',
            eup3: '읍면동코드',
            eup: '읍면동리 명',
        }),
        [kind],
    );

    const colHeaderTitle = useMemo(
        () => ({
            sido2: '표시용 1–17(서버 disp_sido). 미부여 시 통계 10자리 앞 2자리로 폴백',
            sigungu3: '표시용 시군구 코드(ruleset v4, 시도×100+순번 3–4자리). 미부여 시 통계 구간 폴백',
            eup3: '표시용 읍면동 코드(ruleset v4, 시군구표시×100+순번 5–6자리·패딩 없음). 미부여 시 통계 구간 폴백',
        }),
        [],
    );

    /** @param {CodebookColKey} col */
    const renderFilterTh = (col) => (
        <th
            key={col}
            title={colHeaderTitle[col] || undefined}
            className="px-1 py-2 border-r border-slate-200 align-middle last:border-r-0"
        >
            <div className="flex flex-col items-center justify-center gap-1 min-w-0">
                <span className={`font-semibold text-slate-700 ${CB_TEXT} leading-tight px-0.5`}>{colLabels[col]}</span>
                <button
                    type="button"
                    ref={(el) => {
                        filterBtnRefs.current[col] = el;
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (openFilterCol === col) {
                            closeExcelFilter();
                        } else {
                            openExcelFilter(col);
                        }
                    }}
                    title="열 필터"
                    aria-expanded={openFilterCol === col}
                    aria-label={`${colLabels[col]} 열 필터`}
                    className={`
                        inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors
                        ${isColumnFiltered(appliedSets[col], uniquesByCol[col])
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'}
                    `}
                >
                    <span className="material-symbols-outlined text-[18px] leading-none">filter_alt</span>
                </button>
            </div>
        </th>
    );

    return (
        <div className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-2">
            {openFilterCol && (
                <ExcelFilterPanel
                    open
                    anchorRect={filterAnchorRect}
                    columnLabel={colLabels[openFilterCol]}
                    columnKey={openFilterCol}
                    uniqueValues={uniquesByCol[openFilterCol]}
                    draft={filterDraft}
                    setDraft={setFilterDraft}
                    tableSortKey={sortKey}
                    onTableSortAsc={handleFilterPanelSortAsc}
                    onTableSortDesc={handleFilterPanelSortDesc}
                    onApply={applyExcelFilter}
                    onCancel={cancelExcelFilter}
                />
            )}

            {errMsg && (
                <div className="rounded-md bg-red-50/90 ring-1 ring-red-100 px-3 py-2 text-sm text-red-800 text-center">
                    {errMsg}
                </div>
            )}

            {loading && (
                <div
                    className="space-y-2 py-4 min-h-[6rem] text-center"
                    aria-busy="true"
                    aria-label="코드북 불러오는 중"
                >
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-4/5 mx-auto" />
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-3/5 mx-auto" />
                    <p className={`${CB_TEXT} text-slate-500 m-0 pt-2`}>데이터를 불러오는 중입니다…</p>
                </div>
            )}

            {!loading && (
                <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    {sortedRows.length > 0 ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 sm:px-5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-xs font-medium text-slate-500">기준연월</span>
                                <span className="text-sm font-semibold tabular-nums text-red-700">
                                    {headerReferenceYm || '—'}
                                </span>
                                {mergedByNameCount > 0 ? (
                                    <span
                                        className="max-w-full text-[11px] font-medium leading-snug text-slate-500 sm:text-xs"
                                        title="시도명·시군구명·읍면동리 명이 모두 같은 다른 코드 행은 하나로 합쳐 표시합니다"
                                    >
                                        명칭 동일 {mergedByNameCount}건 병합
                                    </span>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={exportFullCodebookExcel}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 ${CB_TEXT} font-semibold text-slate-700 transition-colors hover:bg-slate-50`}
                                title="화면 페이징·열 필터와 무관, 표에 보이는 전체 행(명칭 동일 병합 반영)을 한 파일로 저장합니다"
                            >
                                <span className="material-symbols-outlined text-lg leading-none text-red-700">download</span>
                                엑셀 다운로드
                            </button>
                        </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto bg-white">
                        <table className="w-full max-w-full text-sm text-center border-collapse table-fixed">
                            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50">
                                <tr className="border-b border-slate-200">
                                    {COL_KEYS.map((col) => renderFilterTh(col))}
                                </tr>
                            </thead>
                            <tbody>
                                {!sortedRows.length ? (
                                    <tr>
                                        <td colSpan={COL_KEYS.length} className="px-4 py-8 bg-white align-middle">
                                            <div className={`w-full max-w-full mx-auto text-center text-slate-600 ${CB_TEXT} space-y-3`}>
                                                {errMsg ? (
                                                    <p className="m-0">조회에 실패해 목록을 표시할 수 없습니다.</p>
                                                ) : loadMeta ? (
                                                    <>
                                                        <p className="m-0 font-medium text-slate-800">
                                                            조회된 행이 없습니다. (서버: {loadMeta.count}건, source=
                                                            {loadMeta.source || '—'})
                                                        </p>
                                                        {loadMeta.source === 'sqlite_odcloud_codebook' ? (
                                                            <p className={`m-0 ${CB_TEXT} text-slate-600 mt-2 leading-relaxed`}>
                                                                스냅샷이 비어 있으면 서버에서 odcloud 갱신 배치를 실행해야 합니다. (
                                                                <code className={`${CB_TEXT} bg-slate-100 px-1 rounded`}>
                                                                    POST /api/districts/snapshot/odcloud-codebook/refresh
                                                                </code>
                                                                , 헤더{' '}
                                                                <code className={`${CB_TEXT} bg-slate-100 px-1 rounded`}>
                                                                    X-District-Batch-Secret
                                                                </code>
                                                                , 공공데이터 서비스 <strong>15097972</strong>)
                                                            </p>
                                                        ) : loadMeta.source === 'sqlite_odcloud_codebook_legal' ? (
                                                            <p className={`m-0 ${CB_TEXT} text-slate-600 mt-2 leading-relaxed`}>
                                                                스냅샷이 비어 있으면 서버에서 odcloud 갱신 배치를 실행해야 합니다. (
                                                                <code className={`${CB_TEXT} bg-slate-100 px-1 rounded`}>
                                                                    POST /api/districts/snapshot/odcloud-codebook/legal/refresh
                                                                </code>
                                                                , 헤더{' '}
                                                                <code className={`${CB_TEXT} bg-slate-100 px-1 rounded`}>
                                                                    X-District-Batch-Secret
                                                                </code>
                                                                , 공공데이터 서비스 <strong>15099158</strong>)
                                                            </p>
                                                        ) : loadMeta.source === 'odcloud' ? (
                                                            <p className={`m-0 ${CB_TEXT} text-slate-600 mt-2 leading-relaxed`}>
                                                                서버 <code className={`${CB_TEXT} bg-slate-100 px-1 rounded`}>.env</code>의
                                                                공공데이터 키·활용신청(서비스 15097972)을 확인한 뒤 새로고침해 보세요.
                                                            </p>
                                                        ) : null}
                                                        {loadMeta.hint ? (
                                                            <p
                                                                className={`m-0 ${CB_TEXT} leading-relaxed text-slate-600 border-t border-slate-100 pt-3`}
                                                            >
                                                                {loadMeta.hint}
                                                            </p>
                                                        ) : loadMeta.source === 'sqlite' &&
                                                          loadMeta.count === 0 &&
                                                          (loadMeta.snapshotEmptyReason === 'no_current_rows' ||
                                                              !loadMeta.snapshotEmptyReason) ? (
                                                            <div className="border-t border-slate-100 pt-4 mt-3">
                                                                <CodebookSqliteEmptyHelp />
                                                            </div>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <p className="m-0">등록된 코드북 데이터가 없습니다.</p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : !orderedFilteredRows.length ? (
                                    <tr>
                                        <td colSpan={COL_KEYS.length} className={`px-4 py-8 text-center text-slate-600 ${CB_TEXT}`}>
                                            <p className="m-0 font-medium text-slate-800">필터 조건에 맞는 행이 없습니다.</p>
                                            <p className={`m-0 mt-2 ${CB_TEXT} text-slate-500 tabular-nums`}>
                                                전체 {sortedRows.length}건 중 0건 표시
                                            </p>
                                            {filtersActive ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAppliedSets({ ...EMPTY_APPLIED_SETS });
                                                        setSortKey(null);
                                                    }}
                                                    className={`mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 ${CB_TEXT} font-semibold text-red-800 shadow-sm transition-colors hover:bg-red-100 hover:border-red-300`}
                                                >
                                                    필터 초기화
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ) : (
                                    pagination.pageRows.map((r, i) => (
                                        <tr
                                            key={`${primaryCode(r, apiKind)}|${sidoKr(r)}|${sigKr(r)}|${eupKr(r)}|${i}`}
                                            className="border-b border-slate-100 bg-white hover:bg-slate-50/80"
                                        >
                                            {COL_KEYS.map((col, ci) => {
                                                const v = getCellValueForCol(r, apiKind, col);
                                                const mono = isMonoStyledCol(col);
                                                return (
                                                    <td
                                                        key={col}
                                                        className={`px-2 py-2 ${CB_TEXT} align-middle text-center break-words border-slate-100 ${
                                                            mono
                                                                ? 'font-mono text-slate-900 break-all'
                                                                : 'text-slate-800'
                                                        } border-r ${ci === COL_KEYS.length - 1 ? 'border-r-0' : ''}`}
                                                    >
                                                        {v || '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!loading && orderedFilteredRows.length > 0 ? (
                        <div
                            className={`flex shrink-0 flex-col items-stretch justify-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${CB_TEXT} text-slate-600`}
                        >
                            <span className="tabular-nums text-center sm:text-left">
                                <span className="text-slate-500">
                                    {pagination.rangeFrom}–{pagination.rangeTo}
                                </span>
                                <span className="mx-1.5 text-slate-300">/</span>
                                <strong className={`font-semibold ${CB_ACCENT}`}>{orderedFilteredRows.length}</strong>건
                            </span>
                            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                                {filtersActive ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAppliedSets({ ...EMPTY_APPLIED_SETS });
                                            setSortKey(null);
                                        }}
                                        className={`rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 ${CB_TEXT} font-semibold text-red-800 shadow-sm transition-colors hover:bg-red-100 hover:border-red-300`}
                                    >
                                        필터 초기화
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    disabled={pagination.safePage <= 0}
                                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                                    className={`rounded-md border border-slate-200 bg-white px-3 py-1.5 ${CB_TEXT} font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40`}
                                >
                                    이전
                                </button>
                                <div className="flex flex-wrap items-center justify-center gap-1.5 tabular-nums">
                                    <label htmlFor="codebook-page-jump" className="sr-only">
                                        페이지 번호 입력 후 Enter 또는 이동
                                    </label>
                                    <input
                                        id="codebook-page-jump"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        title="숫자 입력 후 Enter 또는 이동 버튼으로 해당 페이지로 이동합니다"
                                        aria-label="이동할 페이지 번호"
                                        value={pageJumpDraft}
                                        onChange={(e) =>
                                            setPageJumpDraft(e.target.value.replace(/[^\d]/g, ''))
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                commitPageJump();
                                            }
                                        }}
                                        onBlur={revertPageJumpDraft}
                                        className={`w-11 rounded-md border border-slate-200 bg-white px-1 py-1 text-center font-semibold text-slate-800 shadow-sm outline-none ring-slate-200 focus:border-red-300 focus:ring-2 focus:ring-red-200/80 ${CB_TEXT}`}
                                    />
                                    <span className="font-medium text-slate-400">/</span>
                                    <span className="min-w-[1.5rem] px-0.5 text-center font-medium text-slate-700">
                                        {pagination.pageCount}
                                    </span>
                                    <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={commitPageJump}
                                        className={`rounded-md border border-slate-200 bg-white px-2 py-1 ${CB_TEXT} font-semibold text-slate-700 shadow-sm hover:bg-slate-50`}
                                    >
                                        이동
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    disabled={pagination.safePage >= pagination.pageCount - 1}
                                    onClick={() =>
                                        setPageIndex((p) => {
                                            const pc = Math.max(
                                                1,
                                                Math.ceil(orderedFilteredRows.length / CODEBOOK_PAGE_SIZE),
                                            );
                                            return Math.min(p + 1, Math.max(0, pc - 1));
                                        })
                                    }
                                    className={`rounded-md border border-slate-200 bg-white px-3 py-1.5 ${CB_TEXT} font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40`}
                                >
                                    다음
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
