import React, { useEffect, useRef, useState } from 'react';
import CodePanel from './CodePanel';

/**
 * Sample 전체용 정적 스크립트 1파일 (public/scripts/library-script.txt) 읽기 전용 뷰.
 * @param {{ userLevel?: number; onClose?: () => void; sidebarCollapsed?: boolean; onOpenSidebar?: () => void }} props
 */
export default function SampleScriptViewerPanel({
    userLevel = 1,
    onClose,
    sidebarCollapsed = false,
    onOpenSidebar,
}) {
    const [text, setText] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const okRef = useRef(false);

    useEffect(() => {
        if (okRef.current) return;
        let cancel = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
                const res = await fetch(`${base}scripts/library-script.txt`, { cache: 'no-cache' });
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const t = await res.text();
                if (!cancel) {
                    setText(t);
                    okRef.current = true;
                }
            } catch (e) {
                if (!cancel) {
                    setError(e?.message || '파일을 불러오지 못했습니다.');
                    setText(null);
                }
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => {
            cancel = true;
        };
    }, []);

    const copy = () => {
        if (text == null || text === '') {
            alert('복사할 내용이 없습니다.');
            return;
        }
        navigator.clipboard.writeText(text);
        alert('복사되었습니다');
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white">
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
                {sidebarCollapsed && typeof onOpenSidebar === 'function' && (
                    <button
                        type="button"
                        onClick={onOpenSidebar}
                        className="p-1 px-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
                        title="Open Sidebar"
                    >
                        <span className="material-symbols-outlined text-lg">menu</span>
                    </button>
                )}
                <span className="material-symbols-outlined text-red-700 text-xl shrink-0">article</span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight m-0">Sample 전체 스크립트</h2>

                </div>
                <button
                    type="button"
                    onClick={copy}
                    disabled={loading || !text}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
                >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                    복사
                </button>
                {typeof onClose === 'function' && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">close</span>
                        닫기
                    </button>
                )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-6 font-mono text-[13px] leading-6 bg-white">
                <CodePanel
                    data={null}
                    userLevel={userLevel}
                    selectedQnum={null}
                    activeTab="script"
                    engine="question"
                    setEngine={() => {}}
                    isLoading={false}
                    staticScriptText={text}
                    staticScriptLoading={loading}
                    staticScriptError={error}
                />
            </div>
        </div>
    );
}
