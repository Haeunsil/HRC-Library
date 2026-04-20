import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAddressOdcloudCodebookFromSnapshot, fetchAddressOdcloudLegalCodebookFromSnapshot } from '../api';
import {
    buildAttribExScriptFromCodebookItemsWithSidoRemap,
    buildOldToNewSidoMapFromDisplayOrder,
    sliceAttribExScriptForView,
} from '../utils/codebookAttribExScript';
import CodePanel from './CodePanel';
import {
    SIDO_CODE_DEFAULT_ORDER,
    SIDO_CUSTOM_ORDER_STORAGE_KEY,
    isValidSidoOrderPermutation,
    orderRowsFromOriginalCodes,
    parseSidoMappingPreviewText,
} from '../data/sidoCodeDefaultOrder';
import { referenceYmFromCodebookItems } from '../utils/codebookReferenceYm';

function cloneDefaultOrder() {
    return SIDO_CODE_DEFAULT_ORDER.map((r) => ({ ...r }));
}

function signatureFromOrder(rows) {
    return rows.map((r) => r.originalCode).join(',');
}

/** @returns {{ order: { originalCode: number, name: string }[], baselineSig: string }} */
function readStoredOrderState() {
    try {
        const raw = localStorage.getItem(SIDO_CUSTOM_ORDER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidSidoOrderPermutation(parsed)) {
                const rows = orderRowsFromOriginalCodes(parsed);
                return { order: rows, baselineSig: signatureFromOrder(rows) };
            }
        }
    } catch {
        /* 무시 */
    }
    const def = cloneDefaultOrder();
    return { order: def, baselineSig: signatureFromOrder(def) };
}

function buildPreviewText(rows) {
    return rows.map((r, i) => `${i + 1}:${r.name}`).join('\n');
}

/** @param {string | null} text */
function countTextLines(text) {
    if (text == null || text === '') return 0;
    return text.split(/\r\n|\r|\n/).length;
}

function downloadBlob(filename, mime, body) {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * 시도 17개 순서 커스터마이징 — 코드 재부여·미리보기·복사/다운로드·로컬 저장
 * @param {{ codebookKind?: 'admin' | 'legal' }} props — 사이드바 행정동/법정동 진입과 동일한 CodeBook 스냅샷
 */
export default function AddressSidoCustomDownloadPanel({ codebookKind: codebookKindProp = 'legal' }) {
    const kind = codebookKindProp === 'admin' ? 'admin' : 'legal';

    const initial = useMemo(() => readStoredOrderState(), []);
    const [order, setOrder] = useState(() => initial.order);
    const [baselineSig, setBaselineSig] = useState(() => initial.baselineSig);
    const [dragFromIndex, setDragFromIndex] = useState(/** @type {number | null} */ (null));
    const [saveBanner, setSaveBanner] = useState(false);
    const [copyAttribBanner, setCopyAttribBanner] = useState(false);
    const [mappingCopyPopupOpen, setMappingCopyPopupOpen] = useState(false);
    /** 편집 / 스크립트 — 한 화면에 집중할 수 있도록 분리 */
    const [mainTab, setMainTab] = useState(/** @type {'edit' | 'script'} */ ('edit'));
    const [mappingDraft, setMappingDraft] = useState(() => buildPreviewText(initial.order));

    const [codebookItems, setCodebookItems] = useState(/** @type {Record<string, unknown>[]} */ ([]));
    const [codebookLoading, setCodebookLoading] = useState(false);
    const [codebookError, setCodebookError] = useState(/** @type {string | null} */ (null));
    const [attribView, setAttribView] = useState(/** @type {'all' | 'sido' | 'sigungu' | 'eup'} */ ('all'));

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setCodebookLoading(true);
            setCodebookError(null);
            setCodebookItems([]);
            try {
                const d =
                    kind === 'admin'
                        ? await fetchAddressOdcloudCodebookFromSnapshot()
                        : await fetchAddressOdcloudLegalCodebookFromSnapshot();
                const items = Array.isArray(d?.items)
                    ? d.items
                    : Array.isArray(d?.data?.items)
                      ? d.data.items
                      : [];
                if (!cancelled) setCodebookItems(items);
            } catch (e) {
                const msg = e?.response?.data?.detail
                    ? typeof e.response.data.detail === 'string'
                        ? e.response.data.detail
                        : e.response.data.detail?.message || JSON.stringify(e.response.data.detail)
                    : e?.message || 'CodeBook을 불러오지 못했습니다.';
                if (!cancelled) {
                    setCodebookError(msg);
                    setCodebookItems([]);
                }
            } finally {
                if (!cancelled) setCodebookLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [kind]);

    useEffect(() => {
        setAttribView('all');
    }, [kind]);

    useEffect(() => {
        setMappingDraft(buildPreviewText(order));
    }, [order]);

    const currentSig = useMemo(() => signatureFromOrder(order), [order]);
    const isDirty = currentSig !== baselineSig;
    const defaultSig = useMemo(() => signatureFromOrder(cloneDefaultOrder()), []);

    const parsedMappingDraft = useMemo(() => parseSidoMappingPreviewText(mappingDraft), [mappingDraft]);
    const draftOrderSig = useMemo(() => {
        if (parsedMappingDraft.error || !parsedMappingDraft.order) return null;
        return signatureFromOrder(parsedMappingDraft.order);
    }, [parsedMappingDraft.error, parsedMappingDraft.order]);
    const effectiveDirty =
        draftOrderSig != null && draftOrderSig !== baselineSig && parsedMappingDraft.error === null;
    const draftMatchesOrder =
        draftOrderSig != null && parsedMappingDraft.error === null && draftOrderSig === currentSig;
    const exportActionsDisabled = !draftMatchesOrder;

    const previewText = useMemo(() => buildPreviewText(order), [order]);
    const lineCount = order.length;

    const oldToNewSido = useMemo(() => buildOldToNewSidoMapFromDisplayOrder(order), [order]);

    const attribRemap = useMemo(() => {
        if (!codebookItems.length) return { text: '', errors: [] };
        return buildAttribExScriptFromCodebookItemsWithSidoRemap(codebookItems, kind, oldToNewSido);
    }, [codebookItems, kind, oldToNewSido]);

    const attribText = attribRemap.text;
    const attribErrors = attribRemap.errors;

    const codebookRefYm = useMemo(() => referenceYmFromCodebookItems(codebookItems), [codebookItems]);

    const attribDisplayText = useMemo(() => {
        if (!attribText) return '';
        return sliceAttribExScriptForView(attribText, attribView);
    }, [attribText, attribView]);

    const attribPreviewLineCount = useMemo(
        () => countTextLines(attribDisplayText),
        [attribDisplayText],
    );

    const moveIndex = useCallback((from, to) => {
        if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
        setOrder((prev) => {
            const next = [...prev];
            const [row] = next.splice(from, 1);
            next.splice(to, 0, row);
            return next;
        });
    }, [order.length]);

    const handleReset = useCallback(() => {
        if (
            !window.confirm(
                '기본 순서(서울=1 … 세종=17)로 되돌리고, 이 브라우저에 저장된 커스텀 순서도 제거할까요?',
            )
        ) {
            return;
        }
        const def = cloneDefaultOrder();
        setOrder(def);
        try {
            localStorage.setItem(
                SIDO_CUSTOM_ORDER_STORAGE_KEY,
                JSON.stringify(def.map((r) => r.originalCode)),
            );
            setBaselineSig(signatureFromOrder(def));
        } catch {
            window.alert('기본 순서로는 되돌렸지만, 저장 공간에 쓰지 못했습니다.');
            setBaselineSig(signatureFromOrder(def));
        }
    }, []);

    const handleSave = useCallback(() => {
        const r = parseSidoMappingPreviewText(mappingDraft);
        if (r.error) {
            window.alert(r.error);
            return;
        }
        try {
            const codes = r.order.map((row) => row.originalCode);
            localStorage.setItem(SIDO_CUSTOM_ORDER_STORAGE_KEY, JSON.stringify(codes));
            setOrder(r.order);
            setBaselineSig(signatureFromOrder(r.order));
            setSaveBanner(true);
            window.setTimeout(() => setSaveBanner(false), 2500);
        } catch {
            window.alert('브라우저 저장 공간에 쓸 수 없습니다. 사이트 데이터 권한을 확인해 주세요.');
        }
    }, [mappingDraft, baselineSig]);

    const onMappingDraftBlur = useCallback(() => {
        const r = parseSidoMappingPreviewText(mappingDraft);
        if (!r.error && r.order) {
            setOrder(r.order);
        }
    }, [mappingDraft]);

    const requestScriptTab = useCallback(() => {
        if (mainTab === 'script') return;
        const r = parseSidoMappingPreviewText(mappingDraft);
        if (r.error !== null) {
            window.alert(`매핑 형식 오류로 이동할 수 없습니다.\n\n${r.error}`);
            return;
        }
        const nextSig = signatureFromOrder(r.order);
        const draftOutOfSync = nextSig !== currentSig;
        if (!isDirty && !draftOutOfSync) {
            setMainTab('script');
            return;
        }
        if (
            !window.confirm(
                '저장되지 않은 변경이 있습니다. 저장한 뒤 CodeBook 출력 탭으로 이동할까요?\n[확인] 저장 후 이동 · [취소] 머무르기',
            )
        ) {
            return;
        }
        const r2 = parseSidoMappingPreviewText(mappingDraft);
        if (r2.error) {
            window.alert(r2.error);
            return;
        }
        try {
            localStorage.setItem(
                SIDO_CUSTOM_ORDER_STORAGE_KEY,
                JSON.stringify(r2.order.map((row) => row.originalCode)),
            );
            setOrder(r2.order);
            setBaselineSig(signatureFromOrder(r2.order));
            setSaveBanner(true);
            window.setTimeout(() => setSaveBanner(false), 2500);
        } catch {
            window.alert('브라우저 저장 공간에 쓸 수 없습니다. 사이트 데이터 권한을 확인해 주세요.');
            return;
        }
        setMainTab('script');
    }, [mainTab, mappingDraft, currentSig, isDirty]);

    const handleCopyMapping = useCallback(() => {
        const t = previewText;
        if (!t) return;
        navigator.clipboard.writeText(t).then(
            () => {
                setMappingCopyPopupOpen(true);
                window.setTimeout(() => setMappingCopyPopupOpen(false), 2800);
            },
            () => window.alert('복사에 실패했습니다.'),
        );
    }, [previewText]);

    const handleCopyAttrib = useCallback(() => {
        const t = attribDisplayText ?? '';
        if (!t.trim()) return;
        navigator.clipboard.writeText(t).then(
            () => {
                setCopyAttribBanner(true);
                window.setTimeout(() => setCopyAttribBanner(false), 2000);
            },
            () => window.alert('복사에 실패했습니다.'),
        );
    }, [attribDisplayText]);

    const handleDownloadAttribTxt = useCallback(() => {
        const suffix = kind === 'admin' ? 'admin' : 'legal';
        downloadBlob(`attrib-ex-sido-remap-${suffix}.txt`, 'text/plain;charset=utf-8', attribText);
    }, [attribText, kind]);

    const onDragStart = (index) => (e) => {
        setDragFromIndex(index);
        try {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
        } catch {
            /* */
        }
    };

    const onDragEnd = () => setDragFromIndex(null);

    const onDragOver = (e) => {
        e.preventDefault();
        try {
            e.dataTransfer.dropEffect = 'move';
        } catch {
            /* */
        }
    };

    const onDrop = (toIndex) => (e) => {
        e.preventDefault();
        let from = dragFromIndex;
        try {
            const d = e.dataTransfer.getData('text/plain');
            if (d !== '') from = parseInt(d, 10);
        } catch {
            /* */
        }
        if (from == null || Number.isNaN(from)) return;
        moveIndex(from, toIndex);
        setDragFromIndex(null);
    };

    const isDefaultOrder = currentSig === defaultSig;

    const tabBtnBase =
        'rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700/30 sm:px-4 sm:text-[13px]';
    const tabBtnActive = `${tabBtnBase} border-red-200 bg-red-50/90 text-red-900 ring-1 ring-red-100`;
    const tabBtnIdle = `${tabBtnBase} border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`;

    const attribViewOptions = [
        { id: 'all', label: '전체' },
        { id: 'sido', label: '시도' },
        { id: 'sigungu', label: '시군구' },
        { id: 'eup', label: '읍면동' },
    ];

    const codePanelStaticText = useMemo(() => {
        if (codebookLoading) return '';
        if (codebookError) return '';
        if (!codebookItems.length) return '# CodeBook 스냅샷에 행이 없습니다. 서버 배치·스냅샷을 확인하세요.';
        return attribDisplayText ?? '';
    }, [codebookLoading, codebookError, codebookItems.length, attribDisplayText]);

    return (
        <div
            className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 pb-1 sm:gap-3"
            onClick={(e) => e.stopPropagation()}
        >
            {(saveBanner || copyAttribBanner) && (
                <div
                    className={`rounded-lg border px-3 py-2 text-sm font-medium sm:px-4 ${
                        saveBanner
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                    role="status"
                >
                    {saveBanner
                        ? '이 브라우저에 저장했습니다.'
                        : '*attrex 출력을 클립보드에 복사했습니다.'}
                </div>
            )}

            {mappingCopyPopupOpen ? (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mapping-copy-popup-title"
                    onClick={() => setMappingCopyPopupOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-center">
                            <span className="material-symbols-outlined text-4xl text-emerald-600">check_circle</span>
                        </div>
                        <p
                            id="mapping-copy-popup-title"
                            className="mt-3 text-center text-[15px] font-semibold leading-snug text-slate-900"
                        >
                            시도 매핑이 클립보드에 복사되었습니다.
                        </p>
                        <p className="mt-1.5 text-center text-[13px] text-slate-500">붙여넣기(Ctrl+V)로 사용할 수 있습니다.</p>
                        <button
                            type="button"
                            className="mt-5 w-full rounded-xl bg-red-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
                            onClick={() => setMappingCopyPopupOpen(false)}
                        >
                            확인
                        </button>
                    </div>
                </div>
            ) : null}

            {/* 상단: 배지 + 탭 + 도구줄 — 스크롤 시에도 잡히도록 sticky */}
            <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200/90 bg-[#fcfcfc] pb-2 pt-0.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-4">
                    <div
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                        role="tablist"
                        aria-label="화면 구분"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mainTab === 'edit'}
                            className={mainTab === 'edit' ? tabBtnActive : tabBtnIdle}
                            onClick={() => setMainTab('edit')}
                        >
                            <span className="hidden sm:inline">① </span>시도 순서
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mainTab === 'script'}
                            className={mainTab === 'script' ? tabBtnActive : tabBtnIdle}
                            onClick={requestScriptTab}
                        >
                            <span className="hidden sm:inline">② </span>CodeBook 출력
                        </button>
                    </div>
                    {mainTab === 'edit' ? (
                        <div className="ml-auto flex w-full min-w-0 shrink-0 flex-wrap items-end justify-end gap-x-3 gap-y-2 sm:w-auto">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={parsedMappingDraft.error !== null || !effectiveDirty}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[13px]"
                            >
                                <span className="material-symbols-outlined text-base">save</span>
                                저장
                            </button>
                            <div className="flex min-w-0 shrink-0 flex-col items-end gap-1.5">
                                {isDirty ? (
                                    <span className="inline-flex max-w-full shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80 sm:text-[11px]">
                                        변경됨
                                    </span>
                                ) : (
                                    <span className="inline-flex max-w-full shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80 sm:text-[11px]">
                                        저장됨
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    disabled={isDefaultOrder && !isDirty}
                                    className="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:justify-start sm:text-[13px]"
                                >
                                    <span className="material-symbols-outlined text-base">restart_alt</span>
                                    초기화
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 sm:px-3 sm:text-xs">
                                {kind === 'admin' ? '행정동 CodeBook' : '법정동 CodeBook'}
                            </span>
                            <button
                                type="button"
                                disabled={!(attribDisplayText ?? '').trim()}
                                onClick={handleCopyAttrib}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 sm:px-3 sm:text-xs"
                            >
                                <span className="material-symbols-outlined text-sm">content_copy</span>
                                출력 복사
                            </button>
                            <button
                                type="button"
                                disabled={!attribText}
                                onClick={handleDownloadAttribTxt}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 sm:px-3 sm:text-xs"
                            >
                                <span className="material-symbols-outlined text-sm">download</span>
                                TXT
                            </button>
                            {isDirty ? (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80 sm:text-[11px]">
                                    변경됨
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80 sm:text-[11px]">
                                    저장됨
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {mainTab === 'edit' ? (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-12 lg:items-stretch lg:gap-4">
                    {/* 시도 리스트 — 부모 높이에 맞춰 스크롤 */}
                    <section className="flex min-h-0 flex-col lg:col-span-7">
                        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 sm:mb-2">
                            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                시도 순서
                            </h2>
                            <span className="text-[10px] text-slate-400 sm:text-[11px]">
                                잡아 끌기 · <span className="hidden sm:inline">또는 </span>↑↓
                            </span>
                        </div>
                        <div className="flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
                            <ul
                                className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100"
                                aria-label="시도 순서 목록"
                            >
                                {order.map((row, index) => (
                                    <li
                                        key={row.originalCode}
                                        draggable
                                        onDragStart={onDragStart(index)}
                                        onDragEnd={onDragEnd}
                                        onDragOver={onDragOver}
                                        onDrop={onDrop(index)}
                                        className={`flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5 ${
                                            dragFromIndex === index ? 'bg-red-50' : 'bg-white hover:bg-slate-50/90'
                                        }`}
                                    >
                                        <span
                                            className="shrink-0 cursor-grab touch-manipulation select-none text-slate-400 active:cursor-grabbing"
                                            title="이 줄을 잡아 끌면 순서가 바뀝니다"
                                            aria-hidden
                                        >
                                            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">
                                                drag_indicator
                                            </span>
                                        </span>
                                        <div className="flex shrink-0 flex-col border-l border-slate-100 pl-1">
                                            <button
                                                type="button"
                                                disabled={index === 0}
                                                onClick={() => moveIndex(index, index - 1)}
                                                className="flex h-5 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-25"
                                                aria-label="위로"
                                            >
                                                <span className="material-symbols-outlined text-[18px] leading-none">
                                                    keyboard_arrow_up
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={index === order.length - 1}
                                                onClick={() => moveIndex(index, index + 1)}
                                                className="flex h-5 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-25"
                                                aria-label="아래로"
                                            >
                                                <span className="material-symbols-outlined text-[18px] leading-none">
                                                    keyboard_arrow_down
                                                </span>
                                            </button>
                                        </div>
                                        <span className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md bg-red-50 text-xs font-bold tabular-nums text-red-800 ring-1 ring-red-100/80 sm:h-7 sm:min-w-[2rem] sm:text-sm">
                                            {index + 1}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold leading-tight text-slate-800 sm:text-[13px]">
                                            {row.name}
                                        </span>
                                        <span
                                            className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/70 sm:text-[11px]"
                                            title="원래 시도 코드"
                                        >
                                            기준{String(row.originalCode).padStart(2, '0')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    <section className="flex min-h-0 flex-col lg:col-span-5">
                        <div className="mb-1.5 flex shrink-0 flex-wrap items-end justify-between gap-x-2 gap-y-1 sm:mb-2">
                            <h2 className="max-w-[min(100%,20rem)] text-[11px] font-bold uppercase leading-tight tracking-widest text-slate-500 sm:max-w-none sm:text-[12px]">
                                <span className="block sm:inline">매핑 미리보기</span>{' '}
                                <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-500 sm:inline sm:text-[11px]">
                                    (직접 수정 가능)
                                </span>
                            </h2>
                            <span className="shrink-0 text-[10px] font-medium text-slate-400 sm:text-[11px]">{lineCount}줄</span>
                        </div>
                        <div className="flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm ring-1 ring-slate-800/15 lg:min-h-0">
                            <div className="relative min-h-[12rem] flex-1 min-h-0 sm:min-h-[14rem]">
                                <textarea
                                    value={mappingDraft}
                                    onChange={(e) => setMappingDraft(e.target.value)}
                                    onBlur={onMappingDraftBlur}
                                    spellCheck={false}
                                    aria-label="시도 매핑 미리보기 편집"
                                    className="min-h-[12rem] h-full w-full resize-y overflow-auto border-0 bg-transparent p-3 pb-11 font-mono text-[13px] leading-relaxed text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:ring-0 sm:min-h-[14rem] sm:p-4 sm:pb-12 sm:text-[15px] sm:leading-relaxed lg:min-h-0"
                                />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-2 sm:p-2.5">
                                    <button
                                        type="button"
                                        onClick={handleCopyMapping}
                                        disabled={exportActionsDisabled}
                                        title={
                                            exportActionsDisabled
                                                ? '미리보기가 목록과 같을 때만 사용할 수 있습니다. 형식 오류를 고치거나 다른 칸을 눌러 반영하세요.'
                                                : '클립보드에 복사'
                                        }
                                        className="pointer-events-auto inline-flex items-center justify-center rounded-md border border-slate-600/80 bg-slate-800/95 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-100 shadow-sm ring-1 ring-black/20 hover:bg-slate-700/95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-[11px]"
                                    >
                                        COPY
                                    </button>
                                </div>
                            </div>
                            {parsedMappingDraft.error ? (
                                <div
                                    className="shrink-0 border-t border-red-800/60 bg-red-950/90 px-3 py-2 text-[13px] font-medium leading-snug text-red-100 sm:px-4 sm:text-[15px]"
                                    role="alert"
                                >
                                    {parsedMappingDraft.error}
                                </div>
                            ) : null}
                        </div>
                    </section>
                </div>
            ) : (
                <section className="flex min-h-0 flex-1 flex-col gap-2">
                    <p className="shrink-0 text-[12px] leading-snug text-slate-500 sm:text-[13px]">
                        아래는{' '}
                        <strong className="font-semibold text-slate-800">{kind === 'admin' ? '행정동' : '법정동'}</strong>{' '}
                        CodeBook 스냅샷을 읽어 온 뒤,{' '}
                        <strong className="font-semibold text-slate-700">시도 코드·*attribute 시도 자리만</strong>{' '}
                        바꾼 결과입니다. 이름·시군구·읍면동 코드는 원본과 동일합니다. 다른 구분은 사이드바에서 해당
                        메뉴의「코드 다운로드 (Custom)」로 다시 엽니다.
                    </p>
                    {attribErrors.length > 0 && (
                        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">오류·경고</p>
                            <ul className="mt-1 list-inside list-disc text-[13px] text-amber-950">
                                {attribErrors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="flex min-h-[18rem] flex-1 flex-col lg:min-h-0">
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                                <span className="text-xs font-medium text-slate-500">기준연월</span>
                                <span className="text-sm font-semibold tabular-nums text-red-700">
                                    {codebookLoading ? '…' : codebookRefYm || '—'}
                                </span>
                            </div>
                            <div className="px-4 pt-3 pb-2 border-b border-slate-100 shrink-0 bg-slate-50/90">
                                <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                                    {attribViewOptions.map(({ id, label }) => (
                                        <button
                                            key={id}
                                            type="button"
                                            disabled={codebookLoading || !attribText}
                                            className={`flex-1 rounded-md font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none py-2 text-xs ${
                                                attribView === id
                                                    ? 'bg-red-100 text-red-900 shadow-sm ring-1 ring-red-200/80'
                                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                            }`}
                                            onClick={() => setAttribView(id)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-white">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-red-700 text-lg shrink-0">
                                        article
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
                                        {kind === 'admin' ? '행정동' : '법정동'} CodeBook
                                    </span>
                                </div>
                                {codebookLoading && (
                                    <span className="text-[10px] font-semibold text-red-700 animate-pulse shrink-0">
                                        Loading…
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-6 font-mono text-[13px] leading-6 bg-white [&_.code-content]:min-h-0">
                                <CodePanel
                                    data={null}
                                    userLevel={1}
                                    selectedQnum={null}
                                    activeTab="script"
                                    engine="question"
                                    setEngine={() => {}}
                                    isLoading={false}
                                    staticScriptText={codePanelStaticText}
                                    staticScriptLoading={codebookLoading}
                                    staticScriptError={codebookError}
                                />
                            </div>
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                                <button
                                    type="button"
                                    onClick={handleCopyAttrib}
                                    disabled={!(attribDisplayText ?? '').trim()}
                                    className="hover:text-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none disabled:hover:text-slate-400"
                                >
                                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                    Copy
                                </button>
                                {attribPreviewLineCount > 0 ? (
                                    <span className="text-slate-500 font-semibold normal-case tabular-nums ml-auto">
                                        {attribPreviewLineCount}{' '}
                                        {attribPreviewLineCount === 1 ? 'line' : 'lines'}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <details className="mt-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm open:shadow-md sm:px-4">
                <summary className="cursor-pointer list-none font-semibold text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-slate-500">info</span>
                        주의사항
                    </span>
                </summary>
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-3 text-[13px] leading-relaxed text-slate-600">
                    <p>
                        <strong className="text-slate-800">시도 순서</strong> 탭에서 17개 시도를 드래그하거나 ↑↓로 옮기면, 위에서부터{' '}
                        <strong className="text-slate-800">새 코드 1~17</strong>이 부여됩니다. 오른쪽 미리보기는{' '}
                        <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">N:시도명</code> 형식으로 직접
                        고칠 수 있으며, 형식이 맞지 않으면 저장·복사가 되지 않습니다. 포커스를 벗어나면(다른
                        곳을 누르면) 올바른 내용이 왼쪽 목록에 반영됩니다.
                    </p>
                    <p>
                        <strong className="text-slate-800">CodeBook 출력</strong> 탭에서, 사이드바에서 연{' '}
                        <strong className="text-slate-800">{kind === 'admin' ? '행정동' : '법정동'}</strong>과 같은
                        CodeBook 스냅샷을 읽어 시도 코드만 치환한{' '}
                        <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">*attrex</code> 결과를
                        확인·복사합니다.
                    </p>
                    <p className="rounded-lg bg-amber-50/90 px-2 py-1.5 text-amber-950 ring-1 ring-amber-100">
                        공식 행정 코드와 다를 수 있으니 <strong>자체 규칙용</strong>으로만 사용하세요.
                    </p>
                </div>
            </details>
        </div>
    );
}
