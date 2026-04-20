import React from 'react';
import SidebarQuestionRow from './SidebarQuestionRow';

/** API 목록에서 숨김: 계층 선택은 메인「주소 코드」패널에서만 */
const SIDEBAR_HIDDEN_SUB_IDS = new Set(['sido', 'sigungu', 'eupmyeondong']);

/** Sample [주소] 태그 문항을 앞에 두고, 라이브러리 전용 문항만 뒤에 이어 붙임 (qnum 중복 제거) */
function mergeAddressOtherItems(libraryItems, sampleTagged) {
    const seen = new Set();
    const out = [];
    for (const q of sampleTagged || []) {
        if (!q?.qnum || seen.has(q.qnum)) continue;
        seen.add(q.qnum);
        out.push(q);
    }
    for (const q of libraryItems || []) {
        if (!q?.qnum || seen.has(q.qnum)) continue;
        seen.add(q.qnum);
        out.push(q);
    }
    return out;
}

function AddressLoadSkeleton() {
    return (
        <div className="ml-3 pl-3 border-l border-slate-100 space-y-2 py-2 mt-1" aria-busy="true" aria-label="Address 목록 로딩">
            <div className="h-2.5 bg-slate-100 rounded animate-pulse w-[72%]" />
            <div className="h-2.5 bg-slate-100 rounded animate-pulse w-[55%]" />
            <div className="h-2.5 bg-slate-100 rounded animate-pulse w-[64%]" />
        </div>
    );
}

/**
 * Address 사이드바 블록 (데이터는 useAddressLibrary 등에서 주입)
 */
export default function AddressBlock({
    title = 'Address',
    payload,
    status,
    error,
    refetch,
    addressContentOpen,
    onToggleSection,
    addressSubExpanded,
    onToggleSub,
    trimmedSearch,
    searchTerm,
    searchHitQnums,
    selectedQnum,
    onSelect,
    /** Sidebar에서 수집: Sample에만 있고 태그에 [주소]가 있는 문항 */
    sampleAddressTaggedQuestions = [],
    onOpenAddressCodeDownload,
    onOpenAddressCodeDownloadCustom,
    onOpenAddressCodebook,
    addressCodeDownloadMainOpen = false,
    addressCodeDownloadCustomMainOpen = false,
    addressCodeDownloadCustomKind = null,
    addressDownloadKind = null,
    addressCodebookMainOpen = false,
    addressCodebookKind = null,
}) {
    const filterItems = (items) => {
        if (!trimmedSearch) return items || [];
        const lowerTerm = searchTerm.toLowerCase();
        return (items || []).filter((q) => {
            const regStr = String(q.regUserId ?? q.RegUserId ?? '').toLowerCase();
            const local =
                (q.qnum && q.qnum.toLowerCase().includes(lowerTerm)) ||
                (q.questionTag && q.questionTag.toLowerCase().includes(lowerTerm)) ||
                (q.questionType && q.questionType.toLowerCase().includes(lowerTerm)) ||
                (regStr && regStr.includes(lowerTerm));
            const remote =
                trimmedSearch.length >= 2 && searchHitQnums && searchHitQnums.has(q.qnum);
            return local || remote;
        });
    };

    const subcategories = (payload?.subcategories || []).filter((sub) => !SIDEBAR_HIDDEN_SUB_IDS.has(sub.id));

    return (
        <div className="space-y-2">
            <div
                className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                onClick={onToggleSection}
            >
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-red-700 text-xl">map</span>
                    <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">{title}</span>
                </div>
                <span
                    className={`material-symbols-outlined text-slate-400 text-base transition-transform ${addressContentOpen ? 'rotate-180' : ''}`}
                >
                    expand_more
                </span>
            </div>

            {addressContentOpen && (
                <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                    {status === 'loading' && <AddressLoadSkeleton />}

                    {status === 'error' && (
                        <div className="px-3 py-2 rounded-md bg-red-50/80 ring-1 ring-red-100 text-xs text-red-800 space-y-2">
                            <p>{error || '목록을 불러오지 못했습니다.'}</p>
                            {refetch ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        refetch();
                                    }}
                                    className="text-[11px] font-semibold text-red-700 underline-offset-2 hover:underline"
                                >
                                    다시 시도
                                </button>
                            ) : null}
                        </div>
                    )}

                    {status === 'success' && (
                        <>
                        {subcategories.map((sub) => {
                            if (sub.id === 'haengjeong' || sub.id === 'beobjeong') {
                                const openKind = sub.id === 'haengjeong' ? 'admin' : 'legal';
                                const downloadActive =
                                    addressCodeDownloadMainOpen && addressDownloadKind === openKind;
                                const customDownloadActive =
                                    addressCodeDownloadCustomMainOpen && addressCodeDownloadCustomKind === openKind;
                                const codebookActive =
                                    addressCodebookMainOpen && addressCodebookKind === openKind;
                                const searchHay =
                                    `${sub.label} 코드 다운로드 default custom 코드북 codebook 시도`.toLowerCase();
                                if (trimmedSearch && !searchHay.includes(searchTerm.toLowerCase())) {
                                    return null;
                                }
                                const subOpen = trimmedSearch ? true : Boolean(addressSubExpanded[sub.id]);
                                return (
                                    <div key={sub.id}>
                                        <div
                                            className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                                            onClick={() => onToggleSub(sub.id)}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="material-symbols-outlined text-red-700 text-lg shrink-0">
                                                    {sub.icon}
                                                </span>
                                                <span className="text-[13px] font-bold tracking-wide text-slate-800 truncate">
                                                    {sub.label}
                                                </span>
                                            </div>
                                            <span
                                                className={`material-symbols-outlined text-slate-400 text-base transition-transform shrink-0 ${subOpen ? 'rotate-180' : ''}`}
                                            >
                                                expand_more
                                            </span>
                                        </div>
                                        {subOpen && (
                                            <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                                                <button
                                                    type="button"
                                                    disabled={downloadActive}
                                                    title={
                                                        downloadActive
                                                            ? '현재 메인에서 이 화면이 열려 있습니다'
                                                            : '메인에서 코드 파일 다운로드'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (typeof onOpenAddressCodeDownload === 'function') {
                                                            onOpenAddressCodeDownload(openKind);
                                                        }
                                                    }}
                                                    className={`
                                                        flex w-full items-start gap-3 px-3 py-2 rounded-md text-left text-[12px] min-h-[44px] transition-colors relative overflow-hidden
                                                        disabled:cursor-not-allowed
                                                        ${downloadActive
                                                            ? 'bg-red-50 text-red-800'
                                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer'}
                                                    `}
                                                >
                                                    {downloadActive && (
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 w-1 bg-red-700"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    <span
                                                        className={`material-symbols-outlined text-lg shrink-0 ${downloadActive ? 'text-red-700 mt-0.5' : ''}`}
                                                    >
                                                        {downloadActive ? 'task_alt' : 'download'}
                                                    </span>
                                                    <span
                                                        className={`font-semibold leading-snug ${downloadActive ? 'text-red-800' : 'text-slate-800'}`}
                                                    >
                                                        코드 다운로드 (기본)
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={customDownloadActive}
                                                    title={
                                                        customDownloadActive
                                                            ? '현재 메인에서 이 화면이 열려 있습니다'
                                                            : '메인에서 시도 코드 순서 커스터마이징'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (typeof onOpenAddressCodeDownloadCustom === 'function') {
                                                            onOpenAddressCodeDownloadCustom(openKind);
                                                        }
                                                    }}
                                                    className={`
                                                        flex w-full items-start gap-3 px-3 py-2 rounded-md text-left text-[12px] min-h-[44px] transition-colors relative overflow-hidden
                                                        disabled:cursor-not-allowed
                                                        ${customDownloadActive
                                                            ? 'bg-red-50 text-red-800'
                                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer'}
                                                    `}
                                                >
                                                    {customDownloadActive && (
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 w-1 bg-red-700"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    <span
                                                        className={`material-symbols-outlined text-lg shrink-0 ${customDownloadActive ? 'text-red-700 mt-0.5' : ''}`}
                                                    >
                                                        {customDownloadActive ? 'task_alt' : 'tune'}
                                                    </span>
                                                    <span
                                                        className={`font-semibold leading-snug ${customDownloadActive ? 'text-red-800' : 'text-slate-800'}`}
                                                    >
                                                        코드 다운로드 (커스텀)
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={codebookActive}
                                                    title={
                                                        codebookActive
                                                            ? '현재 메인에서 CodeBook이 열려 있습니다'
                                                            : '메인에서 CodeBook 열기'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (typeof onOpenAddressCodebook === 'function') {
                                                            onOpenAddressCodebook(openKind);
                                                        }
                                                    }}
                                                    className={`
                                                        flex w-full items-start gap-3 px-3 py-2 rounded-md text-left text-[12px] min-h-[44px] transition-colors relative overflow-hidden
                                                        disabled:cursor-not-allowed
                                                        ${codebookActive
                                                            ? 'bg-red-50 text-red-800'
                                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer'}
                                                    `}
                                                >
                                                    {codebookActive && (
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 w-1 bg-red-700"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    <span
                                                        className={`material-symbols-outlined text-lg shrink-0 ${codebookActive ? 'text-red-700 mt-0.5' : ''}`}
                                                    >
                                                        {codebookActive ? 'task_alt' : 'menu_book'}
                                                    </span>
                                                    <span
                                                        className={`font-semibold leading-snug ${codebookActive ? 'text-red-800' : 'text-slate-800'}`}
                                                    >
                                                        CodeBook
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            const rawItems =
                                sub.id === 'address_other'
                                    ? mergeAddressOtherItems(sub.items, sampleAddressTaggedQuestions)
                                    : sub.items;
                            let subItems = filterItems(rawItems);
                            if (trimmedSearch && subItems.length === 0) return null;

                            const subOpen = trimmedSearch ? true : Boolean(addressSubExpanded[sub.id]);

                            return (
                                <div key={sub.id}>
                                    <div
                                        className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                                        onClick={() => onToggleSub(sub.id)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="material-symbols-outlined text-red-700 text-lg shrink-0">
                                                {sub.icon}
                                            </span>
                                            <span className="text-[13px] font-bold tracking-wide text-slate-800 truncate">
                                                {sub.label}
                                            </span>
                                        </div>
                                        <span
                                            className={`material-symbols-outlined text-slate-400 text-base transition-transform shrink-0 ${subOpen ? 'rotate-180' : ''}`}
                                        >
                                            expand_more
                                        </span>
                                    </div>
                                    {subOpen && (
                                        <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                                            {subItems.map((q) => (
                                                <SidebarQuestionRow
                                                    key={q.qnum}
                                                    q={q}
                                                    isSelected={q.qnum === selectedQnum}
                                                    onClick={() =>
                                                        onSelect({
                                                            value: q.qnum,
                                                            category: q.__sampleCategory || 'address',
                                                            addressSub: sub.id,
                                                        })
                                                    }
                                                />
                                            ))}
                                            {subItems.length === 0 && (
                                                <div className="px-3 py-2 text-xs text-slate-400">
                                                    연결된 항목이 없습니다.{' '}
                                                    <span className="text-slate-300">(API 연동 시 자동 반영)</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
