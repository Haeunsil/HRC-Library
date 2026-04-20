import React, { useState, useEffect, useMemo } from 'react';
import { useSidebarFeed } from '../hooks/useSidebarFeed';
import { formatQnumDisplay } from '../utils/qnumDisplay';
import { parseBracketTags, isBareQnumTitle, hasBracketTag } from '../utils/bracketTags';
import { getCategoryLabel } from '../data/koreanNames';
import { submitInquiry, submitAddQuestion } from '../api';
import { MANUAL_OPEN_PATH } from '../config/manualOpenPath';
import SidebarQuestionRow from './SidebarQuestionRow';
import AddressBlock from './AddressBlock';
import { useAddressLibrary } from '../hooks/useAddressLibrary';

/**
 * “이번 달” 기준 — PC 타임존과 무관하게 한국(Asia/Seoul) 달력 연·월 사용.
 * (UTC만 쓰는 환경에서 4월 1일 새벽에도 3월로 남아 3월 데이터가 전부 ‘이번 달’로 잡히는 문제 방지)
 * @param {Date} [d]
 */
function computeVisitYmFromInstant(d = new Date()) {
    try {
        const str = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(d);
        const head = str.length >= 7 ? str.slice(0, 7) : '';
        if (/^\d{4}-\d{2}$/.test(head)) return head;
    } catch {
        /* noop */
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** JSON 행에서 날짜 표시·파싱용 문자열 (필드명 여러 가지, Date는 서울 기준 YYYY-MM-DD) */
function getFeedItemDateRaw(item) {
    if (!item || typeof item !== 'object') return '';
    const o = /** @type {Record<string, unknown>} */ (item);
    const v =
        o.date ??
        o.날짜 ??
        o.published_at ??
        o.publishedAt ??
        o.regDate ??
        o.reg_date ??
        '';
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        try {
            return new Intl.DateTimeFormat('sv-SE', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(v);
        } catch {
            return String(v);
        }
    }
    return String(v ?? '').trim();
}

/**
 * 공지·Update 날짜 → YYYY-MM (접속 달 비교용)
 * 지원: YYYY-MM-DD, YYYY-M-D, YYYY/MM/DD, ISO(…T…), Date 객체(서울 달 기준)
 * @param {unknown} dateStr
 * @returns {string|null}
 */
function parseFeedItemYearMonth(dateStr) {
    if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
        return computeVisitYmFromInstant(dateStr);
    }
    let s = String(dateStr ?? '').trim();
    if (!s) return null;
    const t = s.indexOf('T');
    if (t > 0) s = s.slice(0, t);
    const parts = s.split(/[-./]/).filter(Boolean);
    if (parts.length < 2 || !/^\d{4}$/.test(parts[0])) return null;
    const month = Number(parts[1]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;
    return `${parts[0]}-${String(month).padStart(2, '0')}`;
}

/** @param {string} ym */
function formatYmLabelKo(ym) {
    if (ym === '_invalid') return '날짜 없음';
    const parts = ym.split('-');
    if (parts.length < 2) return ym;
    const y = parts[0];
    const mo = Number(parts[1]);
    if (!y || !Number.isFinite(mo)) return ym;
    return `${y}년 ${mo}월`;
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {string} visitYm YYYY-MM (모달 기준 달 — 열 때마다 현재 달로 맞춤)
 */
function splitFeedItemsByVisitMonth(items, visitYm) {
    const thisMonth = [];
    /** @type {Map<string, typeof items>} */
    const otherByMonth = new Map();
    for (const item of items || []) {
        const ym = parseFeedItemYearMonth(getFeedItemDateRaw(item));
        if (ym === visitYm) thisMonth.push(item);
        else {
            const key = ym || '_invalid';
            if (!otherByMonth.has(key)) otherByMonth.set(key, []);
            otherByMonth.get(key).push(item);
        }
    }
    const pastSorted = [...otherByMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
    return { thisMonth, pastSorted, hasPast: pastSorted.length > 0 };
}

/** @param {[string, Record<string, unknown>[]][]} pastSorted */
function extractPastValidYms(pastSorted) {
    return (pastSorted || [])
        .map(([ym]) => ym)
        .filter((ym) => ym && ym !== '_invalid' && /^\d{4}-\d{2}$/.test(ym))
        .sort((a, b) => b.localeCompare(a));
}

/** @param {[string, Record<string, unknown>[]][]} pastSorted */
function pastRowsForYm(pastSorted, ym) {
    if (!ym || ym === '_invalid') return [];
    const hit = (pastSorted || []).find(([k]) => k === ym);
    return hit ? hit[1] : [];
}

/** @param {[string, Record<string, unknown>[]][]} pastSorted */
function pastInvalidRows(pastSorted) {
    const hit = (pastSorted || []).find(([k]) => k === '_invalid');
    return hit ? hit[1] : [];
}

/** 연도 셀렉트 — 날짜 없음 구간용 값(실제 연도와 겹치지 않음) */
const FEED_VIEW_INVALID_YEAR = '__invalid__';

/** @param {string} visitYm @param {string[]} pastValidYms */
function extractFeedViewYears(visitYm, pastValidYms) {
    const s = new Set();
    s.add(visitYm.slice(0, 4));
    for (const ym of pastValidYms || []) s.add(ym.slice(0, 4));
    return [...s].sort((a, b) => b.localeCompare(a));
}

/** @param {string} visitYm @param {string[]} pastValidYms @param {string} yearStr */
function monthsForFeedViewYear(visitYm, pastValidYms, yearStr) {
    const vy = visitYm.slice(0, 4);
    const vm = visitYm.slice(5, 7);
    const prefix = `${yearStr}-`;
    const months = new Set(
        (pastValidYms || []).filter((ym) => ym.startsWith(prefix)).map((ym) => ym.slice(5, 7)),
    );
    if (yearStr === vy) months.add(vm);
    return [...months].sort((a, b) => b.localeCompare(a));
}

const feedYmPartSelectCls =
    'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm min-w-[5.5rem]';

const feedModalStickyBarCls =
    'sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50 px-4 pb-3 pt-2 shadow-sm sm:-mx-5 sm:px-5';

/** Update 모달 등: [] 태그를 사이드바 카테고리 항목과 동일한 칩 스타일로 표시 */
function BracketTagContent({ value, variant = 'body' }) {
    const { tags, plain } = parseBracketTags(value || '');
    const hasBracketTags = tags.length > 0;
    const isTitle = variant === 'title';
    const isUpdateItem = variant === 'updateItem';
    if (!hasBracketTags) {
        const bare = isBareQnumTitle(value);
        if (bare) {
            return (
                <span className="text-[11px] font-medium text-red-700/90">{formatQnumDisplay(value)}</span>
            );
        }
        return (
            <div
                className={
                    isTitle
                        ? 'text-[13px] font-medium leading-snug tracking-tight text-slate-700'
                        : 'text-[13px] leading-relaxed text-slate-600'
                }
            >
                {value}
            </div>
        );
    }
    const plainCls = isTitle
        ? 'text-[13px] text-slate-700 font-medium leading-snug break-words tracking-tight'
        : 'text-[13px] text-slate-600 font-normal leading-relaxed break-words';
    const tagChipCls = isUpdateItem
        ? 'inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium leading-tight break-words bg-slate-50 text-slate-500 ring-1 ring-slate-200/70'
        : 'inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium leading-tight break-words bg-slate-50 text-slate-500 ring-1 ring-slate-200/70';
    return (
        <div className={`flex flex-col ${isUpdateItem ? 'gap-2' : 'gap-1.5'}`}>
            {plain ? <span className={plainCls}>{plain}</span> : null}
            <div className={`flex flex-wrap ${isUpdateItem ? 'gap-1.5' : 'gap-1'}`}>
                {tags.map((t, i) => (
                    <span key={i} className={tagChipCls}>
                        {t}
                    </span>
                ))}
            </div>
        </div>
    );
}

const Sidebar = ({
    onSelect,
    selectedQnum,
    searchTerm = '',
    searchHitQnums = null,
    categories = [],
    categoryData = {},
    /** VITE_ENABLE_ADDRESS off 시 false → Address 메뉴 숨김 (챗봇 플래그와 별도) */
    showAddressMenu = true,
    /** Sample(`sample`) 카테고리 하위 — 전체 스크립트 1파일 뷰 */
    onOpenSampleScript,
    onOpenAddressCodeDownload,
    onOpenAddressCodeDownloadCustom,
    onOpenAddressCodebook,
    addressCodeDownloadMainOpen = false,
    addressCodeDownloadCustomMainOpen = false,
    addressCodeDownloadCustomKind = null,
    addressDownloadKind = null,
    addressCodebookMainOpen = false,
    addressCodebookKind = null,
}) => {
    const [expandedCategories, setExpandedCategories] = useState({});
    const [noticeOpen, setNoticeOpen] = useState(false);
    const [sampleUpdateOpen, setSampleUpdateOpen] = useState(false);
    const [libraryExpanded, setLibraryExpanded] = useState(true);
    const [inquiryOpen, setInquiryOpen] = useState(false);
    const [inquiryForm, setInquiryForm] = useState({ email: '', message: '' });
    const [inquiryStatus, setInquiryStatus] = useState(null); // 'sending' | 'success' | 'error'
    const [inquiryError, setInquiryError] = useState('');
    const [addQuestionOpen, setAddQuestionOpen] = useState(false);
    const [addQuestionForm, setAddQuestionForm] = useState({ email: '', question_desc: '', tag: '', code: '', remarks: '' });
    const [addQuestionStatus, setAddQuestionStatus] = useState(null);
    const [addQuestionError, setAddQuestionError] = useState('');
    const [noticeRead, setNoticeRead] = useState(false);
    const [sampleUpdateRead, setSampleUpdateRead] = useState(false);
    const [addressSectionExpanded, setAddressSectionExpanded] = useState(false);
    const [addressSubExpanded, setAddressSubExpanded] = useState({
        sido: false,
        sigungu: false,
        eupmyeondong: false,
        haengjeong: false,
        beobjeong: false,
        address_other: false,
    });

    /** ADDRESS 블록을 펼칠 때 행정동·법정동 하위는 기본으로 펼침 (토글·문항 선택으로 섹션이 열릴 때 동일) */
    useEffect(() => {
        if (!addressSectionExpanded) return;
        setAddressSubExpanded((prev) => ({
            ...prev,
            haengjeong: true,
            beobjeong: true,
        }));
    }, [addressSectionExpanded]);

    const addressLib = useAddressLibrary(showAddressMenu);
    const { noticeItems, sampleUpdateItems, ready: sidebarFeedReady } = useSidebarFeed();

    /** 공지·Update 모달을 열 때마다 PC 달력 기준 현재 연·월로 갱신(탭 장시간 유지·월 바뀜 대응) */
    const [visitYm, setVisitYm] = useState(() => computeVisitYmFromInstant());
    /** 공지·Update 모달 — 상단 드롭다운 선택값: visitYm(이번 달), 과거 YYYY-MM, 또는 '_invalid' */
    const [noticeViewYm, setNoticeViewYm] = useState('');
    const [updateViewYm, setUpdateViewYm] = useState('');

    useEffect(() => {
        if (!noticeOpen && !sampleUpdateOpen) return;
        const next = computeVisitYmFromInstant();
        setVisitYm((prev) => (prev === next ? prev : next));
        if (noticeOpen) setNoticeViewYm(next);
        if (sampleUpdateOpen) setUpdateViewYm(next);
    }, [noticeOpen, sampleUpdateOpen]);

    const noticeSplit = useMemo(
        () => splitFeedItemsByVisitMonth(noticeItems, visitYm),
        [noticeItems, visitYm],
    );
    const updateSplit = useMemo(
        () => splitFeedItemsByVisitMonth(sampleUpdateItems, visitYm),
        [sampleUpdateItems, visitYm],
    );

    const noticePastValidYms = useMemo(
        () => extractPastValidYms(noticeSplit.pastSorted),
        [noticeSplit.pastSorted],
    );
    const updatePastValidYms = useMemo(
        () => extractPastValidYms(updateSplit.pastSorted),
        [updateSplit.pastSorted],
    );

    const noticeInvalidCount = pastInvalidRows(noticeSplit.pastSorted).length;
    const updateInvalidCount = pastInvalidRows(updateSplit.pastSorted).length;

    const noticeFeedYearOptions = useMemo(() => {
        const ys = extractFeedViewYears(visitYm, noticePastValidYms);
        if (noticeInvalidCount > 0) return [...ys, FEED_VIEW_INVALID_YEAR];
        return ys;
    }, [visitYm, noticePastValidYms, noticeInvalidCount]);

    const updateFeedYearOptions = useMemo(() => {
        const ys = extractFeedViewYears(visitYm, updatePastValidYms);
        if (updateInvalidCount > 0) return [...ys, FEED_VIEW_INVALID_YEAR];
        return ys;
    }, [visitYm, updatePastValidYms, updateInvalidCount]);

    const resolvedNoticeViewYm = useMemo(() => {
        const allowed = new Set([visitYm, ...noticePastValidYms]);
        if (noticeInvalidCount > 0) allowed.add('_invalid');
        if (allowed.has(noticeViewYm)) return noticeViewYm;
        return visitYm;
    }, [noticeViewYm, visitYm, noticePastValidYms, noticeInvalidCount]);

    const resolvedUpdateViewYm = useMemo(() => {
        const allowed = new Set([visitYm, ...updatePastValidYms]);
        if (updateInvalidCount > 0) allowed.add('_invalid');
        if (allowed.has(updateViewYm)) return updateViewYm;
        return visitYm;
    }, [updateViewYm, visitYm, updatePastValidYms, updateInvalidCount]);

    const noticeUiYear =
        resolvedNoticeViewYm === '_invalid' ? FEED_VIEW_INVALID_YEAR : resolvedNoticeViewYm.slice(0, 4);
    const noticeUiMonth =
        resolvedNoticeViewYm === '_invalid' ? '' : resolvedNoticeViewYm.slice(5, 7);

    const updateUiYear =
        resolvedUpdateViewYm === '_invalid' ? FEED_VIEW_INVALID_YEAR : resolvedUpdateViewYm.slice(0, 4);
    const updateUiMonth =
        resolvedUpdateViewYm === '_invalid' ? '' : resolvedUpdateViewYm.slice(5, 7);

    const noticeMonthsForUiYear = useMemo(() => {
        if (resolvedNoticeViewYm === '_invalid') return [];
        const y = resolvedNoticeViewYm.slice(0, 4);
        return monthsForFeedViewYear(visitYm, noticePastValidYms, y);
    }, [resolvedNoticeViewYm, visitYm, noticePastValidYms]);

    const updateMonthsForUiYear = useMemo(() => {
        if (resolvedUpdateViewYm === '_invalid') return [];
        const y = resolvedUpdateViewYm.slice(0, 4);
        return monthsForFeedViewYear(visitYm, updatePastValidYms, y);
    }, [resolvedUpdateViewYm, visitYm, updatePastValidYms]);

    /** Sample 전체에서 [주소] 태그 문항 — Address「주소 관련 문항」에만 추가 노출, Sample 탭 목록은 그대로 */
    const sampleAddressTaggedQuestions = useMemo(() => {
        const out = [];
        const seen = new Set();
        for (const cat of categories || []) {
            for (const q of categoryData[cat] || []) {
                if (!q?.qnum || !hasBracketTag(q.questionTag, '주소')) continue;
                if (seen.has(q.qnum)) continue;
                seen.add(q.qnum);
                out.push({ ...q, __sampleCategory: cat });
            }
        }
        return out;
    }, [categories, categoryData]);

    // 선택 문항: 메인 Sample 카테고리 펼침 + Address(시·도/시·군·구/읍·면·동/행정동/법정동/기타)에 포함된 하위는 모두 펼침
    useEffect(() => {
        if (!selectedQnum) return;

        const cats = Object.keys(categoryData || {});
        for (let cat of cats) {
            const list = categoryData[cat];
            const found = list.find((q) => q.qnum === selectedQnum);
            if (found) {
                setExpandedCategories({ [cat]: true });
                setLibraryExpanded(true);
                break;
            }
        }
        if (showAddressMenu && addressLib.data?.subcategories) {
            const subs = addressLib.data.subcategories;
            const matched = subs.filter((sub) =>
                (sub.items || []).some((q) => q.qnum === selectedQnum),
            );
            const inSampleAddressTag = sampleAddressTaggedQuestions.some((q) => q.qnum === selectedQnum);
            if (matched.length > 0 || inSampleAddressTag) {
                setAddressSectionExpanded(true);
                setAddressSubExpanded((prev) => {
                    const next = { ...prev };
                    for (const sub of matched) {
                        next[sub.id] = true;
                    }
                    if (inSampleAddressTag) next.address_other = true;
                    return next;
                });
            }
        }
    }, [selectedQnum, categoryData, showAddressMenu, addressLib.data, sampleAddressTaggedQuestions]);

    // 검색 중에는 (검색어로) Sample 본문이 열려 있어도, 검색어를 지우면 libraryExpanded만 남음 → 접혀 있으면 Script 버튼까지 사라짐
    useEffect(() => {
        if (!(searchTerm || '').trim()) {
            setLibraryExpanded(true);
        }
    }, [searchTerm]);

    /** 한 번에 하나의 카테고리만 펼침 (다른 카테고리는 모두 접힘) */
    const toggleCategory = (cat) => {
        setExpandedCategories(prev => {
            if (prev[cat]) return { [cat]: false };
            return { [cat]: true };
        });
    };

    const toggleAddressSub = (id) => {
        setAddressSubExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const trimmedSearch = (searchTerm || '').trim();
    const libraryContentOpen = Boolean(trimmedSearch) || libraryExpanded;
    const addressContentOpen = Boolean(trimmedSearch) || addressSectionExpanded;

    return (
        <nav className="flex flex-col flex-1 min-h-0 px-4 py-4">
            {/* 스크롤 영역: 공지·Update·(챗봇 on 시)Address·Sample 목록 */}
            <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
            {/* 공지사항 - 클릭 시 모달 */}
            <div className="space-y-2">
                <div
                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                    onClick={() => {
                        setNoticeOpen(true);
                        if (sidebarFeedReady && noticeItems.length > 0) setNoticeRead(true);
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span
                                className={`material-symbols-outlined text-xl ${
                                    sidebarFeedReady && noticeItems.length > 0 && !noticeRead
                                        ? 'text-red-600 animate-pulse'
                                        : 'text-red-700'
                                }`}
                            >
                                campaign
                            </span>
                            {sidebarFeedReady && noticeItems.length > 0 && !noticeRead && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                                </span>
                            )}
                        </div>
                        <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">공지사항</span>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 text-base">open_in_new</span>
                </div>
            </div>

            {/* SAMPLE 업데이트 내역 - 클릭 시 모달 */}
            <div className="space-y-2">
                <div
                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                    onClick={() => {
                        setSampleUpdateOpen(true);
                        if (sidebarFeedReady && sampleUpdateItems.length > 0) setSampleUpdateRead(true);
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span
                                className={`material-symbols-outlined text-xl ${
                                    sidebarFeedReady && sampleUpdateItems.length > 0 && !sampleUpdateRead
                                        ? 'text-red-600 animate-pulse'
                                        : 'text-red-700'
                                }`}
                            >
                                update
                            </span>
                            {sidebarFeedReady && sampleUpdateItems.length > 0 && !sampleUpdateRead && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                                </span>
                            )}
                        </div>
                        <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">Update</span>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 text-base">open_in_new</span>
                </div>
            </div>

            {/* Address — VITE_ENABLE_ADDRESS 활성일 때만. Sample 위 동일 레벨 */}
            {showAddressMenu && (
                <AddressBlock
                    title={addressLib.data?.title || 'Address'}
                    payload={addressLib.data}
                    status={addressLib.status}
                    error={addressLib.error}
                    refetch={addressLib.refetch}
                    addressContentOpen={addressContentOpen}
                    onToggleSection={() => setAddressSectionExpanded(!addressSectionExpanded)}
                    addressSubExpanded={addressSubExpanded}
                    onToggleSub={toggleAddressSub}
                    trimmedSearch={trimmedSearch}
                    searchTerm={searchTerm}
                    searchHitQnums={searchHitQnums}
                    selectedQnum={selectedQnum}
                    onSelect={onSelect}
                    sampleAddressTaggedQuestions={sampleAddressTaggedQuestions}
                    onOpenAddressCodeDownload={onOpenAddressCodeDownload}
                    onOpenAddressCodeDownloadCustom={onOpenAddressCodeDownloadCustom}
                    onOpenAddressCodebook={onOpenAddressCodebook}
                    addressCodeDownloadMainOpen={addressCodeDownloadMainOpen}
                    addressCodeDownloadCustomMainOpen={addressCodeDownloadCustomMainOpen}
                    addressCodeDownloadCustomKind={addressCodeDownloadCustomKind}
                    addressDownloadKind={addressDownloadKind}
                    addressCodebookMainOpen={addressCodebookMainOpen}
                    addressCodebookKind={addressCodebookKind}
                />
            )}

            {/* Library - Sample, 공지와 동일 스타일 접기/펼치기 */}
            <div className="space-y-2">
                <div
                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                    onClick={() => setLibraryExpanded(!libraryExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-700 text-xl">menu_book</span>
                        <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">Sample</span>
                    </div>
                    <span className={`material-symbols-outlined text-slate-400 text-base transition-transform ${libraryContentOpen ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
                {libraryContentOpen && (
                <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                    {typeof onOpenSampleScript === 'function' && !trimmedSearch && (
                        <div className="px-1 pb-1">
                            <button
                                type="button"
                                onClick={() => onOpenSampleScript()}
                                className={`
                                    flex w-full items-center gap-2 px-3 py-2 rounded-md text-left text-[12px] font-semibold transition-colors
                                    text-slate-600 hover:bg-red-50 hover:text-red-800 ring-1 ring-slate-200/80 hover:ring-red-200
                                `}
                            >
                                <span className="material-symbols-outlined text-red-700 text-lg shrink-0">article</span>
                                <span>전체 Script 확인</span>
                                <span className="material-symbols-outlined text-slate-400 text-base ml-auto shrink-0">chevron_right</span>
                            </button>
                        </div>
                    )}
                    {categories.map(cat => {
                        let questions = categoryData[cat] || [];

                        // Search Filtering
                        if (trimmedSearch) {
                            const lowerTerm = searchTerm.toLowerCase();
                            questions = questions.filter((q) => {
                                const regStr = String(
                                    q.regUserId ?? q.RegUserId ?? '',
                                ).toLowerCase();
                                const local =
                                    (q.qnum && q.qnum.toLowerCase().includes(lowerTerm)) ||
                                    (q.questionTag && q.questionTag.toLowerCase().includes(lowerTerm)) ||
                                    (q.questionType && q.questionType.toLowerCase().includes(lowerTerm)) ||
                                    (regStr && regStr.includes(lowerTerm));
                                const remote =
                                    trimmedSearch.length >= 2 &&
                                    searchHitQnums &&
                                    searchHitQnums.has(q.qnum);
                                return local || remote;
                            });
                        }

                        // Skip empty categories if searching
                        if (trimmedSearch && questions.length === 0) return null;

                        // 검색 중: 매칭된 카테고리만 렌더되며 본문(문항 목록) 자동 펼침 / 비검색: 토글·선택 반영
                        const isExpanded = trimmedSearch ? true : Boolean(expandedCategories[cat]);
                        const label = getCategoryLabel(cat);

                        return (
                            <div key={cat}>
                                <div
                                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                                    onClick={() => toggleCategory(cat)}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-red-700 text-xl">folder_open</span>
                                        <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">{label}</span>
                                    </div>
                                    <span className={`material-symbols-outlined text-slate-400 text-base transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                </div>

                                {isExpanded && (
                                    <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                                        {questions.map((q) => (
                                            <SidebarQuestionRow
                                                key={q.qnum}
                                                q={q}
                                                isSelected={q.qnum === selectedQnum}
                                                onClick={() => onSelect({ value: q.qnum, category: cat })}
                                            />
                                        ))}
                                        {questions.length === 0 && (
                                            <div className="px-3 py-2 text-xs text-slate-400 italic">No items</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
            </div>

            {/* 매뉴얼·샘플추가·문의하기 - 하단 고정 (스크롤 없이 항상 표시) */}
            <div className="shrink-0 flex-shrink-0 pt-4 mt-4 border-t border-slate-100 space-y-2 pb-4">
                <button
                    type="button"
                    onClick={async () => {
                        const p = (MANUAL_OPEN_PATH || '').trim();
                        if (!p) {
                            alert('매뉴얼 경로가 설정되지 않았습니다.\nclient/src/config/manualOpenPath.js 파일의 MANUAL_OPEN_PATH에 경로를 입력하세요.');
                            return;
                        }
                        try {
                            await navigator.clipboard.writeText(p);
                        } catch {
                            try {
                                const ta = document.createElement('textarea');
                                ta.value = p;
                                ta.setAttribute('readonly', '');
                                ta.style.position = 'fixed';
                                ta.style.left = '-9999px';
                                document.body.appendChild(ta);
                                ta.select();
                                document.execCommand('copy');
                                document.body.removeChild(ta);
                            } catch {
                                alert('복사에 실패했습니다. 브라우저에서 클립보드 권한을 허용해 주세요.');
                                return;
                            }
                        }
                        alert('경로가 복사되었습니다.\n파일 탐색기 주소창에 붙여넣기(Ctrl+V) 후 Enter로 폴더를 열 수 있습니다.');
                    }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-700 text-white text-[13px] font-semibold rounded-lg hover:bg-red-800 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">content_copy</span>
                    매뉴얼
                </button>
                <button
                    onClick={() => { setAddQuestionOpen(true); setAddQuestionStatus(null); setAddQuestionError(''); }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-700 text-white text-[13px] font-semibold rounded-lg hover:bg-red-800 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    샘플 추가
                </button>
                <button
                    onClick={() => { setInquiryOpen(true); setInquiryStatus(null); setInquiryError(''); }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-700 text-white text-[13px] font-semibold rounded-lg hover:bg-red-800 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">mail</span>
                    문의하기
                </button>
            </div>

            {/* 공지사항 모달 */}
            {noticeOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-[2px]"
                    onClick={() => setNoticeOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="notice-dialog-title"
                        className="flex w-full max-w-2xl max-h-[min(85vh,40rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/25 ring-1 ring-slate-200/90"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-1 shrink-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-500" />
                        <div className="flex items-start gap-4 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pt-5 pb-4 sm:px-6">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 ring-1 ring-red-100/80">
                                <span className="material-symbols-outlined text-[24px]" aria-hidden>
                                    campaign
                                </span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700/80">Notice</p>
       
                                <p className="mt-1 text-[13px] leading-snug text-slate-500">
                                    <span className="font-medium text-slate-600">{formatYmLabelKo(visitYm)}</span>에 등록된
                                    공지입니다. 다른 달은 상단에서 선택해 확인하세요.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setNoticeOpen(false)}
                                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                aria-label="닫기"
                            >
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-5 sm:py-5">
                            {noticeItems.length > 0 ? (
                                <>
                                    <div className={feedModalStickyBarCls}>
                                        <div className="flex flex-wrap items-center gap-2 gap-y-2">
                                            <span className="text-[11px] font-semibold text-slate-500 shrink-0">보기</span>
                                            <label htmlFor="notice-feed-year" className="sr-only">
                                                연도
                                            </label>
                                            <select
                                                id="notice-feed-year"
                                                className={feedYmPartSelectCls}
                                                value={noticeUiYear}
                                                onChange={(e) => {
                                                    const y = e.target.value;
                                                    if (y === FEED_VIEW_INVALID_YEAR) {
                                                        setNoticeViewYm('_invalid');
                                                        return;
                                                    }
                                                    if (y === visitYm.slice(0, 4)) {
                                                        setNoticeViewYm(visitYm);
                                                        return;
                                                    }
                                                    const ms = monthsForFeedViewYear(
                                                        visitYm,
                                                        noticePastValidYms,
                                                        y,
                                                    );
                                                    if (ms.length) setNoticeViewYm(`${y}-${ms[0]}`);
                                                }}
                                            >
                                                {noticeFeedYearOptions.map((y) => (
                                                    <option key={y} value={y}>
                                                        {y === FEED_VIEW_INVALID_YEAR ? '날짜 없음' : `${y}년`}
                                                    </option>
                                                ))}
                                            </select>
                                            {noticeUiYear !== FEED_VIEW_INVALID_YEAR ? (
                                                <>
                                                    <label htmlFor="notice-feed-month" className="sr-only">
                                                        월
                                                    </label>
                                                    <select
                                                        id="notice-feed-month"
                                                        className={feedYmPartSelectCls}
                                                        value={noticeUiMonth}
                                                        onChange={(e) => {
                                                            const m = e.target.value;
                                                            if (resolvedNoticeViewYm === '_invalid') return;
                                                            const y = resolvedNoticeViewYm.slice(0, 4);
                                                            const next = `${y}-${m}`;
                                                            setNoticeViewYm(next === visitYm ? visitYm : next);
                                                        }}
                                                    >
                                                        {noticeMonthsForUiYear.map((m) => (
                                                            <option key={m} value={m}>
                                                                {visitYm.slice(0, 4) === noticeUiYear &&
                                                                visitYm.slice(5, 7) === m
                                                                    ? `${Number(m)}월 (이번 달)`
                                                                    : `${Number(m)}월`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    {resolvedNoticeViewYm === visitYm ? (
                                        <>
                                            {noticeSplit.thisMonth.length > 0 ? (
                                                <ul className="flex flex-col gap-3">
                                                    {noticeSplit.thisMonth.map((item, i) => (
                                                        <li
                                                            key={`n-cur-${i}-${getFeedItemDateRaw(item)}-${item.title}`}
                                                            className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow duration-200 hover:border-slate-300/90 hover:shadow-md"
                                                        >
                                                            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                            <div className="pl-3">
                                                                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                        {getFeedItemDateRaw(item) || '—'}
                                                                    </span>
                                                                    <span className="text-[11px] font-medium text-red-700/90">
                                                                        {isBareQnumTitle(item.title)
                                                                            ? formatQnumDisplay(item.title)
                                                                            : item.title}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                    <BracketTagContent value={item.desc} variant="body" />
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center">
                                                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                                        <span className="material-symbols-outlined text-[26px]">event_busy</span>
                                                    </span>
                                                    <p className="text-sm font-medium text-slate-600">
                                                        {formatYmLabelKo(visitYm)} 등록된 공지가 없습니다
                                                    </p>
                                                    {noticeSplit.hasPast || noticeInvalidCount > 0 ? (
                                                        <p className="text-xs text-slate-400">
                                                            상단에서 다른 달이나 날짜 없음 항목을 선택해 확인하세요.
                                                        </p>
                                                    ) : null}
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                    {resolvedNoticeViewYm !== visitYm && resolvedNoticeViewYm !== '_invalid' ? (
                                        <>
                                            {noticeSplit.hasPast || noticePastValidYms.length > 0 ? (
                                                <>
                                                    {pastRowsForYm(noticeSplit.pastSorted, resolvedNoticeViewYm).length >
                                                    0 ? (
                                                        <ul className="flex flex-col gap-3">
                                                            {pastRowsForYm(
                                                                noticeSplit.pastSorted,
                                                                resolvedNoticeViewYm,
                                                            ).map((item, i) => (
                                                                <li
                                                                    key={`n-past-${resolvedNoticeViewYm}-${i}-${getFeedItemDateRaw(item)}-${item.title}`}
                                                                    className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow duration-200 hover:border-slate-300/90 hover:shadow-md"
                                                                >
                                                                    <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                                    <div className="pl-3">
                                                                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                                {getFeedItemDateRaw(item) || '—'}
                                                                            </span>
                                                                            <span className="text-[11px] font-medium text-red-700/90">
                                                                                {isBareQnumTitle(item.title)
                                                                                    ? formatQnumDisplay(item.title)
                                                                                    : item.title}
                                                                            </span>
                                                                        </div>
                                                                        <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                            <BracketTagContent value={item.desc} variant="body" />
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="rounded-lg bg-slate-100/90 px-4 py-3 text-center text-[13px] leading-relaxed text-slate-600">
                                                            {formatYmLabelKo(resolvedNoticeViewYm)}에 등록된 공지가 없습니다.
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="rounded-lg bg-slate-100/90 px-4 py-3 text-center text-[13px] leading-relaxed text-slate-600">
                                                    접속한 달({formatYmLabelKo(visitYm)})과{' '}
                                                    <span className="font-semibold text-slate-800">다른 달</span>에 등록된
                                                    공지가 없습니다. 등록된 내용은 위 목록이 전부입니다.
                                                </p>
                                            )}
                                        </>
                                    ) : null}
                                    {resolvedNoticeViewYm === '_invalid' && noticeInvalidCount > 0 ? (
                                        <div>
                                            <p className="mb-2 text-[11px] font-bold text-slate-600">날짜 없음</p>
                                            <ul className="flex flex-col gap-3">
                                                {pastInvalidRows(noticeSplit.pastSorted).map((item, i) => (
                                                    <li
                                                        key={`n-past-inv-${i}-${getFeedItemDateRaw(item)}-${item.title}`}
                                                        className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow duration-200 hover:border-slate-300/90 hover:shadow-md"
                                                    >
                                                        <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                        <div className="pl-3">
                                                            <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                    {getFeedItemDateRaw(item) || '—'}
                                                                </span>
                                                                <span className="text-[11px] font-medium text-red-700/90">
                                                                    {isBareQnumTitle(item.title)
                                                                        ? formatQnumDisplay(item.title)
                                                                        : item.title}
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                <BracketTagContent value={item.desc} variant="body" />
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <span className="material-symbols-outlined text-[28px]">notifications_off</span>
                                    </span>
                                    <p className="text-sm font-medium text-slate-600">등록된 공지가 없습니다</p>
                                    <p className="text-xs text-slate-400">새 소식이 있으면 이곳에 표시됩니다.</p>
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                            <button
                                type="button"
                                onClick={() => setNoticeOpen(false)}
                                className="w-full rounded-xl bg-[oklch(50.5%_0.213_27.518)] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[oklch(44%_0.213_27.518)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(50.5%_0.213_27.518_/_0.45)] focus-visible:ring-offset-2"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Update 모달 */}
            {sampleUpdateOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-[2px]"
                    onClick={() => setSampleUpdateOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="update-dialog-title"
                        className="flex w-full max-w-2xl max-h-[min(85vh,40rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/25 ring-1 ring-slate-200/90"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-1 shrink-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-500" />
                        <div className="flex items-start gap-4 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 pt-5 pb-4 sm:px-6">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 ring-1 ring-red-100/80">
                                <span className="material-symbols-outlined text-[24px]" aria-hidden>
                                    update
                                </span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700/80">Update</p>

                                <p className="mt-1 text-[13px] leading-snug text-slate-500">
                                    <span className="font-medium text-slate-600">{formatYmLabelKo(visitYm)}</span>에 반영된
                                    샘플 변경입니다. 항목을 누르면 해당 문항으로 이동합니다. 다른 달은 상단에서 선택해
                                    확인하세요.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSampleUpdateOpen(false)}
                                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                aria-label="닫기"
                            >
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-5 sm:py-5">
                            {sampleUpdateItems.length > 0 ? (
                                <>
                                    <div className={feedModalStickyBarCls}>
                                        <div className="flex flex-wrap items-center gap-2 gap-y-2">
                                            <span className="text-[11px] font-semibold text-slate-500 shrink-0">보기</span>
                                            <label htmlFor="update-feed-year" className="sr-only">
                                                연도
                                            </label>
                                            <select
                                                id="update-feed-year"
                                                className={feedYmPartSelectCls}
                                                value={updateUiYear}
                                                onChange={(e) => {
                                                    const y = e.target.value;
                                                    if (y === FEED_VIEW_INVALID_YEAR) {
                                                        setUpdateViewYm('_invalid');
                                                        return;
                                                    }
                                                    if (y === visitYm.slice(0, 4)) {
                                                        setUpdateViewYm(visitYm);
                                                        return;
                                                    }
                                                    const ms = monthsForFeedViewYear(
                                                        visitYm,
                                                        updatePastValidYms,
                                                        y,
                                                    );
                                                    if (ms.length) setUpdateViewYm(`${y}-${ms[0]}`);
                                                }}
                                            >
                                                {updateFeedYearOptions.map((y) => (
                                                    <option key={y} value={y}>
                                                        {y === FEED_VIEW_INVALID_YEAR ? '날짜 없음' : `${y}년`}
                                                    </option>
                                                ))}
                                            </select>
                                            {updateUiYear !== FEED_VIEW_INVALID_YEAR ? (
                                                <>
                                                    <label htmlFor="update-feed-month" className="sr-only">
                                                        월
                                                    </label>
                                                    <select
                                                        id="update-feed-month"
                                                        className={feedYmPartSelectCls}
                                                        value={updateUiMonth}
                                                        onChange={(e) => {
                                                            const m = e.target.value;
                                                            if (resolvedUpdateViewYm === '_invalid') return;
                                                            const y = resolvedUpdateViewYm.slice(0, 4);
                                                            const next = `${y}-${m}`;
                                                            setUpdateViewYm(next === visitYm ? visitYm : next);
                                                        }}
                                                    >
                                                        {updateMonthsForUiYear.map((m) => (
                                                            <option key={m} value={m}>
                                                                {visitYm.slice(0, 4) === updateUiYear &&
                                                                visitYm.slice(5, 7) === m
                                                                    ? `${Number(m)}월 (이번 달)`
                                                                    : `${Number(m)}월`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    {resolvedUpdateViewYm === visitYm ? (
                                        <>
                                            {updateSplit.thisMonth.length > 0 ? (
                                                <ul className="flex flex-col gap-3">
                                                    {updateSplit.thisMonth.map((item, i) => (
                                                        <li
                                                            key={`u-cur-${i}-${getFeedItemDateRaw(item)}-${item.qnum || item.title}`}
                                                            onClick={() => {
                                                                if (item.qnum && onSelect) onSelect({ value: item.qnum });
                                                                setSampleUpdateOpen(false);
                                                            }}
                                                            className={`group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300/90 hover:shadow-md ${
                                                                item.qnum
                                                                    ? 'cursor-pointer hover:border-red-200/90 hover:bg-red-50/20'
                                                                    : ''
                                                            }`}
                                                        >
                                                            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                            <div className="pl-3">
                                                                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                        {getFeedItemDateRaw(item) || '—'}
                                                                    </span>
                                                                    {item.qnum ? (
                                                                        <span className="text-[12px] font-semibold tabular-nums text-red-700/90">
                                                                            {formatQnumDisplay(item.qnum)}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                    <BracketTagContent value={item.desc} variant="updateItem" />
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center">
                                                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                                        <span className="material-symbols-outlined text-[26px]">event_busy</span>
                                                    </span>
                                                    <p className="text-sm font-medium text-slate-600">
                                                        {formatYmLabelKo(visitYm)} 등록된 업데이트가 없습니다
                                                    </p>
                                                    {updateSplit.hasPast || updateInvalidCount > 0 ? (
                                                        <p className="text-xs text-slate-400">
                                                            상단에서 다른 달이나 날짜 없음 항목을 선택해 확인하세요.
                                                        </p>
                                                    ) : null}
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                    {resolvedUpdateViewYm !== visitYm && resolvedUpdateViewYm !== '_invalid' ? (
                                        <>
                                            {updateSplit.hasPast || updatePastValidYms.length > 0 ? (
                                                <>
                                                    {pastRowsForYm(updateSplit.pastSorted, resolvedUpdateViewYm).length >
                                                    0 ? (
                                                        <ul className="flex flex-col gap-3">
                                                            {pastRowsForYm(
                                                                updateSplit.pastSorted,
                                                                resolvedUpdateViewYm,
                                                            ).map((item, i) => (
                                                                <li
                                                                    key={`u-past-${resolvedUpdateViewYm}-${i}-${getFeedItemDateRaw(item)}-${item.qnum || item.title}`}
                                                                    onClick={() => {
                                                                        if (item.qnum && onSelect) onSelect({ value: item.qnum });
                                                                        setSampleUpdateOpen(false);
                                                                    }}
                                                                    className={`group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300/90 hover:shadow-md ${
                                                                        item.qnum
                                                                            ? 'cursor-pointer hover:border-red-200/90 hover:bg-red-50/20'
                                                                            : ''
                                                                    }`}
                                                                >
                                                                    <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                                    <div className="pl-3">
                                                                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                                {getFeedItemDateRaw(item) || '—'}
                                                                            </span>
                                                                            {item.qnum ? (
                                                                                <span className="text-[12px] font-semibold tabular-nums text-red-700/90">
                                                                                    {formatQnumDisplay(item.qnum)}
                                                                                </span>
                                                                            ) : null}
                                                                        </div>
                                                                        <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                            <BracketTagContent value={item.desc} variant="updateItem" />
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="rounded-lg bg-slate-100/90 px-4 py-3 text-center text-[13px] leading-relaxed text-slate-600">
                                                            {formatYmLabelKo(resolvedUpdateViewYm)}에 등록된 업데이트가 없습니다.
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="rounded-lg bg-slate-100/90 px-4 py-3 text-center text-[13px] leading-relaxed text-slate-600">
                                                    접속한 달({formatYmLabelKo(visitYm)})과{' '}
                                                    <span className="font-semibold text-slate-800">다른 달</span>에 등록된
                                                    업데이트가 없습니다. 등록된 내용은 위 목록이 전부입니다.
                                                </p>
                                            )}
                                        </>
                                    ) : null}
                                    {resolvedUpdateViewYm === '_invalid' && updateInvalidCount > 0 ? (
                                        <div>
                                            <p className="mb-2 text-[11px] font-bold text-slate-600">날짜 없음</p>
                                            <ul className="flex flex-col gap-3">
                                                {pastInvalidRows(updateSplit.pastSorted).map((item, i) => (
                                                    <li
                                                        key={`u-past-inv-${i}-${getFeedItemDateRaw(item)}-${item.qnum || item.title}`}
                                                        onClick={() => {
                                                            if (item.qnum && onSelect) onSelect({ value: item.qnum });
                                                            setSampleUpdateOpen(false);
                                                        }}
                                                        className={`group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300/90 hover:shadow-md ${
                                                            item.qnum
                                                                ? 'cursor-pointer hover:border-red-200/90 hover:bg-red-50/20'
                                                                : ''
                                                        }`}
                                                    >
                                                        <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-red-600 to-red-500 opacity-90" />
                                                        <div className="pl-3">
                                                            <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                                                                    {getFeedItemDateRaw(item) || '—'}
                                                                </span>
                                                                {item.qnum ? (
                                                                    <span className="text-[12px] font-semibold tabular-nums text-red-700/90">
                                                                        {formatQnumDisplay(item.qnum)}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                                                                <BracketTagContent value={item.desc} variant="updateItem" />
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <span className="material-symbols-outlined text-[28px]">history</span>
                                    </span>
                                    <p className="text-sm font-medium text-slate-600">등록된 업데이트 내역이 없습니다</p>
                                    <p className="text-xs text-slate-400">새로 반영된 샘플이 있으면 이곳에 표시됩니다.</p>
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                            <button
                                type="button"
                                onClick={() => setSampleUpdateOpen(false)}
                                className="w-full rounded-xl bg-[oklch(50.5%_0.213_27.518)] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[oklch(44%_0.213_27.518)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(50.5%_0.213_27.518_/_0.45)] focus-visible:ring-offset-2"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 문의하기 팝업 */}
            {inquiryOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">문의하기</h3>
                            <button
                                onClick={() => {
                                    setInquiryOpen(false);
                                    setInquiryForm({ email: '', message: '' });
                                    setInquiryStatus(null);
                                    setInquiryError('');
                                }}
                                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                aria-label="닫기"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="email"
                                placeholder="답변 받으실 이메일을 적어주세요."
                                value={inquiryForm.email}
                                onChange={(e) => setInquiryForm(f => ({ ...f, email: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                            />
                            <textarea
                                placeholder="오류 제보, 건의사항, 다양한 아이디어 등 문의하실 내용을 자유롭게 작성해 주세요."
                                value={inquiryForm.message}
                                onChange={(e) => setInquiryForm(f => ({ ...f, message: e.target.value }))}
                                rows={12}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700 resize-none"
                            />
                            <button
                                onClick={async () => {
                                    if (!inquiryForm.message?.trim()) {
                                        setInquiryStatus('error');
                                        setInquiryError('문의 내용을 입력해 주세요.');
                                        return;
                                    }
                                    const email = (inquiryForm.email || '').trim();
                                    if (!email) {
                                        setInquiryStatus('error');
                                        setInquiryError('이메일을 입력해 주세요.');
                                        return;
                                    }
                                    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                                    if (!emailPattern.test(email)) {
                                        setInquiryStatus('error');
                                        setInquiryError('유효한 이메일 주소를 입력해 주세요.');
                                        return;
                                    }
                                    setInquiryStatus('sending');
                                    setInquiryError('');
                                    try {
                                        await submitInquiry(inquiryForm);
                                        setInquiryStatus('success');
                                        setInquiryForm({ email: '', message: '' });
                                    } catch (e) {
                                        setInquiryStatus('error');
                                        const msg = e?.response?.data?.detail;
                                        setInquiryError(Array.isArray(msg) ? msg[0] : msg || '전송에 실패했습니다.');
                                    }
                                }}
                                disabled={inquiryStatus === 'sending'}
                                className="w-full py-2.5 text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
                            >
                                {inquiryStatus === 'sending' ? '전송 중...' : '전송'}
                            </button>
                            {inquiryStatus === 'success' && (
                                <p className="text-sm text-green-600">문의가 접수되었습니다.<br />담당자가 확인 후 회신드릴 예정입니다.</p>
                            )}
                            {inquiryStatus === 'error' && (
                                <p className="text-sm text-red-600">{inquiryError || '전송에 실패했습니다. 다시 시도해 주세요.'}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 문항추가 팝업 */}
            {addQuestionOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 my-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">샘플 추가</h3>
                            <button
                                onClick={() => {
                                    setAddQuestionOpen(false);
                                    setAddQuestionForm({ email: '', question_desc: '', tag: '', code: '', remarks: '' });
                                    setAddQuestionStatus(null);
                                    setAddQuestionError('');
                                }}
                                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                aria-label="닫기"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="email"
                                placeholder="답변 받으실 이메일을 적어주세요."
                                value={addQuestionForm.email}
                                onChange={(e) => setAddQuestionForm(f => ({ ...f, email: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                            />
                            <textarea
                                placeholder="샘플에 대한 설명을 적어주세요
(어떤 상황에서 필요했으며, 어떤 방식으로 제작·활용하셨나요?)"

                                value={addQuestionForm.question_desc}
                                onChange={(e) => setAddQuestionForm(f => ({ ...f, question_desc: e.target.value }))}
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700 resize-none"
                            />
                            <input
                                type="text"
                                placeholder="태그 (적용되는 속성 모두 표기 e.g. 랜덤고정, 대분류제시 등)"
                                value={addQuestionForm.tag}
                                onChange={(e) => setAddQuestionForm(f => ({ ...f, tag: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                            />
                            <textarea
                                placeholder="코드
(정제하지 않고 그대로 붙여넣으셔도 됩니다.)"
                                value={addQuestionForm.code}
                                onChange={(e) => setAddQuestionForm(f => ({ ...f, code: e.target.value }))}
                                rows={12}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                            />
                            <input
                                type="text"
                                placeholder="비고 (선택사항)"
                                value={addQuestionForm.remarks ?? ''}
                                onChange={(e) => setAddQuestionForm(f => ({ ...f, remarks: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                            />
                            <button
                                onClick={async () => {
                                    if (!addQuestionForm.question_desc?.trim()) {
                                        setAddQuestionStatus('error');
                                        setAddQuestionError('문항 설명을 입력해 주세요.');
                                        return;
                                    }
                                    const email = (addQuestionForm.email || '').trim();
                                    if (!email) {
                                        setAddQuestionStatus('error');
                                        setAddQuestionError('이메일을 입력해 주세요.');
                                        return;
                                    }
                                    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                                    if (!emailPattern.test(email)) {
                                        setAddQuestionStatus('error');
                                        setAddQuestionError('유효한 이메일 주소를 입력해 주세요.');
                                        return;
                                    }
                                    setAddQuestionStatus('sending');
                                    setAddQuestionError('');
                                    try {
                                        const payload = { ...addQuestionForm };
                                        if (payload.remarks === '' || payload.remarks == null) payload.remarks = null;
                                        await submitAddQuestion(payload);
                                        setAddQuestionStatus('success');
                                        setAddQuestionForm({ email: '', question_desc: '', tag: '', code: '', remarks: '' });
                                    } catch (e) {
                                        setAddQuestionStatus('error');
                                        const msg = e?.response?.data?.detail;
                                        setAddQuestionError(Array.isArray(msg) ? msg[0] : msg || '전송에 실패했습니다.');
                                    }
                                }}
                                disabled={addQuestionStatus === 'sending'}
                                className="w-full py-2.5 text-sm font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
                            >
                                {addQuestionStatus === 'sending' ? '전송 중...' : '전송'}
                            </button>
                            {addQuestionStatus === 'success' && (
                                <p className="text-sm text-green-600">문항 추가 요청이 접수되었습니다.<br />담당자가 확인 후 샘플에 추가해드릴 예정입니다.</p>
                            )}
                            {addQuestionStatus === 'error' && (
                                <p className="text-sm text-red-600">{addQuestionError || '전송에 실패했습니다. 다시 시도해 주세요.'}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Sidebar;
