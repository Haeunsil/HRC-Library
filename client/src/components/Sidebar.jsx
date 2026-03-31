import React, { useState, useEffect } from 'react';
import { noticeItems } from '../data/noticeItems';
import { sampleUpdateItems } from '../data/sampleUpdateItems';
import { getCategoryLabel } from '../data/koreanNames';
import { submitInquiry, submitAddQuestion } from '../api';
import { MANUAL_OPEN_PATH } from '../config/manualOpenPath';

/** questionTag에서 [내용] 형태를 태그 배열로 분리 (나머지 문자열은 plain) */
function parseBracketTags(raw) {
    if (!raw || typeof raw !== 'string') return { tags: [], plain: '' };
    const tags = [];
    const re = /\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        const t = m[1].trim();
        if (t) tags.push(t);
    }
    const plain = raw.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    return { tags, plain };
}

/** Update 모달 등: [] 태그를 사이드바 카테고리 항목과 동일한 칩 스타일로 표시 */
function BracketTagContent({ value, variant = 'body' }) {
    const { tags, plain } = parseBracketTags(value || '');
    const hasBracketTags = tags.length > 0;
    const isTitle = variant === 'title';
    if (!hasBracketTags) {
        return (
            <div className={`text-sm leading-relaxed ${isTitle ? 'font-semibold text-slate-700' : 'text-slate-600'}`}>
                {value}
            </div>
        );
    }
    const plainCls = isTitle
        ? 'text-sm text-slate-700 font-semibold leading-snug break-words'
        : 'text-sm text-slate-700 font-medium leading-snug break-words';
    return (
        <div className="flex flex-col gap-1.5">
            {plain ? <span className={plainCls}>{plain}</span> : null}
            <div className="flex flex-wrap gap-1">
                {tags.map((t, i) => (
                    <span
                        key={i}
                        className="inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight break-words bg-slate-100 text-slate-600 ring-1 ring-slate-200/80"
                    >
                        {t}
                    </span>
                ))}
            </div>
        </div>
    );
}

const Sidebar = ({ onSelect, selectedQnum, searchTerm = '', categories = [], categoryData = {} }) => {
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

    // 선택한 문항의 카테고리만 펼침 (이전 카테고리는 모두 접힘)
    useEffect(() => {
        if (!selectedQnum || Object.keys(categoryData).length === 0) return;

        const cats = Object.keys(categoryData);
        for (let cat of cats) {
            const list = categoryData[cat];
            const found = list.find(q => q.qnum === selectedQnum);
            if (found) {
                setExpandedCategories({ [cat]: true });
                break;
            }
        }
    }, [selectedQnum, categoryData]);

    /** 한 번에 하나의 카테고리만 펼침 (다른 카테고리는 모두 접힘) */
    const toggleCategory = (cat) => {
        setExpandedCategories(prev => {
            if (prev[cat]) return { [cat]: false };
            return { [cat]: true };
        });
    };

    return (
        <nav className="flex flex-col flex-1 min-h-0 px-4 py-4">
            {/* 스크롤 영역: 공지·Update·Sample 목록 */}
            <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
            {/* 공지사항 - 클릭 시 모달 */}
            <div className="space-y-2">
                <div
                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                    onClick={() => { setNoticeOpen(true); if (noticeItems.length > 0) setNoticeRead(true); }}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className={`material-symbols-outlined text-xl ${noticeItems.length > 0 && !noticeRead ? 'text-red-600 animate-pulse' : 'text-red-700'}`}>campaign</span>
                            {noticeItems.length > 0 && !noticeRead && (
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
                    onClick={() => { setSampleUpdateOpen(true); if (sampleUpdateItems.length > 0) setSampleUpdateRead(true); }}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className={`material-symbols-outlined text-xl ${sampleUpdateItems.length > 0 && !sampleUpdateRead ? 'text-red-600 animate-pulse' : 'text-red-700'}`}>update</span>
                            {sampleUpdateItems.length > 0 && !sampleUpdateRead && (
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

            {/* Library - 공지사항과 동일 스타일, 접기/펼치기 */}
            <div className="space-y-2">
                <div
                    className="flex items-center justify-between px-3 py-1.5 text-slate-900 cursor-pointer hover:bg-slate-50 rounded-md transition-colors"
                    onClick={() => setLibraryExpanded(!libraryExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-700 text-xl">menu_book</span>
                        <span className="text-[14px] font-bold uppercase tracking-wider whitespace-nowrap">Sample</span>
                    </div>
                    <span className={`material-symbols-outlined text-slate-400 text-base transition-transform ${libraryExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
                {libraryExpanded && (
                <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 mt-1">
                    {categories.map(cat => {
                        let questions = categoryData[cat] || [];

                        // Search Filtering
                        if (searchTerm) {
                            const lowerTerm = searchTerm.toLowerCase();
                            questions = questions.filter(q =>
                                (q.qnum && q.qnum.toLowerCase().includes(lowerTerm)) ||
                                (q.questionTag && q.questionTag.toLowerCase().includes(lowerTerm)) ||
                                (q.questionType && q.questionType.toLowerCase().includes(lowerTerm))
                            );
                        }

                        // Skip empty categories if searching
                        if (searchTerm && questions.length === 0) return null;

                        const trimmedSearch = (searchTerm || '').trim();
                        // 검색 중: 매칭된 카테고리는 선택 없이도 모두 펼침 / 검색 없음: 기존처럼 선택·토글만 반영
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
                                        {questions.map(q => {
                                            const isSelected = q.qnum === selectedQnum;
                                            const raw = q.questionTag || '';
                                            const { tags: tagList, plain } = parseBracketTags(raw);
                                            const hasBracketTags = tagList.length > 0;
                                            return (
                                                <div
                                                    key={q.qnum}
                                                    onClick={() => onSelect({ value: q.qnum, category: cat })}
                                                    className={`
                                                        flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer text-[12px] relative overflow-hidden transition-colors
                                                        ${isSelected
                                                            ? 'bg-red-50 text-red-700'
                                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                                                    `}
                                                >
                                                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-700"></div>}
                                                    <span className={`material-symbols-outlined text-lg shrink-0 ${hasBracketTags ? 'mt-0.5' : ''}`}>
                                                        {isSelected ? 'task_alt' : 'description'}
                                                    </span>
                                                    {hasBracketTags ? (
                                                        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                                                            <span className={`font-semibold text-[12px] leading-snug break-words ${isSelected ? 'text-red-800' : 'text-slate-800'}`}>
                                                                {plain || q.qnum}
                                                            </span>
                                                            <div className="flex flex-wrap gap-1">
                                                                {tagList.map((t, i) => (
                                                                    <span
                                                                        key={i}
                                                                        className={`
                                                                            inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight break-words
                                                                            ${isSelected
                                                                                ? 'bg-red-100/90 text-red-900 ring-1 ring-red-200/60'
                                                                                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80'}
                                                                        `}
                                                                    >
                                                                        {t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="font-semibold whitespace-nowrap truncate min-w-0">{raw || q.qnum}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={() => setNoticeOpen(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">공지사항</h3>
                            <button onClick={() => setNoticeOpen(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="닫기">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-3 flex-1">
                            {noticeItems.length > 0 ? (
                                noticeItems.map((item, i) => (
                                    <div key={i} className="px-3 py-2 rounded-md bg-slate-50/80 text-sm">
                                        <div className="font-semibold text-slate-700 mb-0.5">{item.title}</div>
                                        <div className="text-xs text-slate-500 mb-1">{item.date}</div>
                                        <div className="text-slate-600 leading-relaxed">{item.desc}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="px-3 py-2 text-sm text-slate-400 italic">등록된 공지가 없습니다.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Update 모달 */}
            {sampleUpdateOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={() => setSampleUpdateOpen(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">Update</h3>
                            <button onClick={() => setSampleUpdateOpen(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="닫기">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-3 flex-1">
                            {sampleUpdateItems.length > 0 ? (
                                sampleUpdateItems.map((item, i) => {
                                    const hasTitleTags = parseBracketTags(item.title || '').tags.length > 0;
                                    return (
                                    <div
                                        key={i}
                                        onClick={() => { item.qnum && onSelect && onSelect({ value: item.qnum }); setSampleUpdateOpen(false); }}
                                        className={`px-3 py-2 rounded-md text-sm ${item.qnum ? 'bg-slate-50/80 hover:bg-red-50 hover:border-red-200 cursor-pointer border border-transparent transition-colors' : 'bg-slate-50/80'}`}
                                    >
                                        <div className="mb-0.5">
                                            {hasTitleTags ? (
                                                <BracketTagContent value={item.title} variant="title" />
                                            ) : (
                                                <div className="font-semibold text-slate-700">{item.title}</div>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 mb-1">{item.date}</div>
                                        <BracketTagContent value={item.desc} variant="body" />
                                    </div>
                                    );
                                })
                            ) : (
                                <div className="px-3 py-2 text-sm text-slate-400 italic">등록된 업데이트 내역이 없습니다.</div>
                            )}
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
                                placeholder="문의 내용"
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
