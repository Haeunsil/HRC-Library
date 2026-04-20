import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fetchAddressOdcloudCodebookFromSnapshot,
    fetchAddressOdcloudLegalCodebookFromSnapshot,
} from '../api';
import {
    buildAttribExScriptFromCodebookItems,
    sliceAttribExScriptForView,
} from '../utils/codebookAttribExScript';
import { referenceYmFromCodebookItems } from '../utils/codebookReferenceYm';
import CodePanel from './CodePanel';

/** @param {string | null} text */
function countTextLines(text) {
    if (text == null || text === '') return 0;
    return text.split(/\r\n|\r|\n/).length;
}

/**
 * 주소 코드 다운로드 — CodeBook 기반 *attrex 스크립트 미리보기·복사
 * @param {'sidebar'|'main'} [variant='sidebar']
 * @param {'admin'|'legal'|null} [forcedKind]
 */
export default function AddressCodeDownloadPanel({ variant = 'sidebar', forcedKind = null }) {
    const isMain = variant === 'main';
    const kindLocked = forcedKind === 'admin' || forcedKind === 'legal';
    const isDownloadMainPage = kindLocked && isMain;

    const [kind, setKind] = useState(forcedKind === 'admin' ? 'admin' : forcedKind === 'legal' ? 'legal' : 'legal');
    /** CodeBook에서 받은 *attrex 전문 */
    const [attribFullText, setAttribFullText] = useState(/** @type {string | null} */ (null));
    const [attribView, setAttribView] = useState(/** @type {'all' | 'sido' | 'sigungu' | 'eup'} */ ('all'));
    const [attribPreviewLoading, setAttribPreviewLoading] = useState(false);
    const [attribPreviewError, setAttribPreviewError] = useState(/** @type {string | null} */ (null));
    const [codebookRefYm, setCodebookRefYm] = useState('');

    const attribDisplayText = useMemo(() => {
        if (attribFullText == null) return null;
        return sliceAttribExScriptForView(attribFullText, attribView);
    }, [attribFullText, attribView]);

    const attribPreviewLineCount = useMemo(
        () => countTextLines(attribDisplayText),
        [attribDisplayText],
    );

    useEffect(() => {
        if (forcedKind === 'admin') setKind('admin');
        else if (forcedKind === 'legal') setKind('legal');
    }, [forcedKind]);

    useEffect(() => {
        if (!isDownloadMainPage) return undefined;
        let cancelled = false;
        (async () => {
            setAttribPreviewLoading(true);
            setAttribPreviewError(null);
            setAttribFullText(null);
            setCodebookRefYm('');
            setAttribView('all');
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
                const text = buildAttribExScriptFromCodebookItems(
                    items,
                    kind === 'admin' ? 'admin' : 'legal',
                );
                if (!cancelled) {
                    setAttribFullText(
                        items.length ? text : '# CodeBook 스냅샷에 행이 없습니다. 서버 배치·스냅샷을 확인하세요.',
                    );
                    setCodebookRefYm(referenceYmFromCodebookItems(items));
                    setAttribView('all');
                }
            } catch (e) {
                const msg = e?.response?.data?.detail
                    ? typeof e.response.data.detail === 'string'
                        ? e.response.data.detail
                        : e.response.data.detail?.message || JSON.stringify(e.response.data.detail)
                    : e?.message || 'CodeBook 미리보기를 불러오지 못했습니다.';
                if (!cancelled) {
                    setAttribPreviewError(msg);
                    setAttribFullText(null);
                    setCodebookRefYm('');
                }
            } finally {
                if (!cancelled) setAttribPreviewLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isDownloadMainPage, kind]);

    const copyAttribPreview = useCallback(() => {
        const t = attribDisplayText ?? '';
        if (!t) return;
        navigator.clipboard.writeText(t);
        alert('복사되었습니다');
    }, [attribDisplayText]);

    const attribViewOptions = [
        { id: 'all', label: '전체' },
        { id: 'sido', label: '시도' },
        { id: 'sigungu', label: '시군구' },
        { id: 'eup', label: '읍면동' },
    ];

    return (
        <div
            className={`${
                isMain
                    ? isDownloadMainPage
                        ? 'flex min-h-0 flex-1 flex-col gap-5 py-1'
                        : 'space-y-5 py-1'
                    : 'space-y-3 border-b border-slate-100 px-2 pb-3 pt-1'
            }`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {!isMain && (
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-700 text-lg shrink-0">download</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        코드 다운로드 (기본)
                    </span>
                </div>
            )}

            {!kindLocked && (
                <div
                    className={`flex rounded-lg border border-slate-200 bg-slate-50/90 ${isMain ? 'p-1' : 'p-0.5'}`}
                >
                    <button
                        type="button"
                        className={`flex-1 rounded-md font-semibold transition-colors ${
                            isMain ? 'py-2 text-xs' : 'py-1.5 text-[10px]'
                        } ${
                            kind === 'admin'
                                ? 'bg-white text-red-800 shadow-sm ring-1 ring-red-100'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        onClick={() => setKind('admin')}
                    >
                        행정동
                    </button>
                    <button
                        type="button"
                        className={`flex-1 rounded-md font-semibold transition-colors ${
                            isMain ? 'py-2 text-xs' : 'py-1.5 text-[10px]'
                        } ${
                            kind === 'legal'
                                ? 'bg-white text-red-800 shadow-sm ring-1 ring-red-100'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        onClick={() => setKind('legal')}
                    >
                        법정동
                    </button>
                </div>
            )}

            {isDownloadMainPage && (
                <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                            <span className="text-xs font-medium text-slate-500">기준연월</span>
                            <span className="text-sm font-semibold tabular-nums text-red-700">
                                {attribPreviewLoading ? '…' : codebookRefYm || '—'}
                            </span>
                        </div>
                        <div className="px-4 pt-3 pb-2 border-b border-slate-100 shrink-0 bg-slate-50/90">
                            <div
                                className={`flex rounded-lg border border-slate-200 bg-white ${isMain ? 'p-1' : 'p-0.5'}`}
                            >
                                {attribViewOptions.map(({ id, label }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        disabled={attribPreviewLoading || attribFullText == null}
                                        className={`flex-1 rounded-md font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                                            isMain ? 'py-2 text-xs' : 'py-1.5 text-[10px]'
                                        } ${
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
                            {attribPreviewLoading && (
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
                                staticScriptText={attribDisplayText ?? ''}
                                staticScriptLoading={attribPreviewLoading}
                                staticScriptError={attribPreviewError}
                            />
                        </div>
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                            <button
                                type="button"
                                onClick={copyAttribPreview}
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
            )}

        </div>
    );
}
