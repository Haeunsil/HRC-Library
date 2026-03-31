import React, { useState, useEffect, useRef } from 'react';
import { ragChat } from '../api';

let _msgId = 0;
const nextId = () => {
    _msgId += 1;
    return _msgId;
};

/**
 * 플로팅 챗봇 — RAG 매뉴얼 테스트 (/api/chat/rag)
 */
export default function FloatingChatbot() {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [messages, setMessages] = useState(() => [
        {
            id: nextId(),
            role: 'bot',
            text: '안녕하세요. HRC Library 이용을 도와드리는 챗봇입니다.\n화면 사용법, 검색, 사이드바 메뉴 등 궁금한 점을 편하게 물어보세요.',
        },
    ]);
    const listRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    useEffect(() => {
        if (!open || !listRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, open, sending]);

    const send = async () => {
        const text = draft.trim();
        if (!text || sending) return;
        setDraft('');
        setSending(true);
        const userId = nextId();
        setMessages((m) => [...m, { id: userId, role: 'user', text }]);
        try {
            const data = await ragChat(text);
            const err = data?.error;
            let reply = data?.reply || '';
            if (data?.mode === 'error' && !reply) {
                reply = err || '요청에 실패했습니다.';
            }
            if (err && data?.mode !== 'error') {
                reply += `\n\n—\n_${err}_`;
            }
            setMessages((m) => [
                ...m,
                {
                    id: nextId(),
                    role: 'bot',
                    text: reply || '응답이 비었습니다.',
                },
            ]);
        } catch (e) {
            const msg =
                e?.response?.data?.detail ||
                e?.message ||
                '서버에 연결할 수 없습니다. FastAPI(8000)가 켜져 있는지 확인하세요.';
            setMessages((m) => [...m, { id: nextId(), role: 'bot', text: String(msg) }]);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed bottom-5 right-5 z-[110] flex flex-col items-end gap-3 pointer-events-none [&>*]:pointer-events-auto">
            {open && (
                <div
                    role="dialog"
                    aria-label="챗봇"
                    className="w-[min(100vw-2rem,28rem)] sm:w-[34rem] lg:w-[38rem] max-h-[min(44rem,82dvh)] flex flex-col rounded-2xl bg-white shadow-2xl shadow-slate-900/15 border border-slate-200/90 overflow-hidden transition-all duration-200 ease-out"
                >
                    <header className="shrink-0 flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-red-700 to-red-800 text-white">
                        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center ring-1 ring-white/20">
                            <span className="material-symbols-outlined text-[24px]">smart_toy</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-bold tracking-tight">HRC Library Bot</h2>
                            <p className="text-xs text-red-100/90 font-medium">RAG 매뉴얼 테스트</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="p-1.5 rounded-lg text-white/90 hover:bg-white/15 transition-colors"
                            aria-label="챗봇 닫기"
                        >
                            <span className="material-symbols-outlined text-xl">expand_more</span>
                        </button>
                    </header>

                    <div
                        ref={listRef}
                        className="flex-1 min-h-[16rem] max-h-[min(30rem,58dvh)] overflow-y-auto px-4 py-4 space-y-3.5 bg-slate-50/80"
                    >
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'bot' && (
                                    <div className="w-8 h-8 shrink-0 rounded-lg bg-red-100 flex items-center justify-center mt-0.5">
                                        <span className="material-symbols-outlined text-red-700 text-[18px]">smart_toy</span>
                                    </div>
                                )}
                                <div
                                    className={`
                                        max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap break-words
                                        ${
                                            msg.role === 'user'
                                                ? 'rounded-tr-md bg-red-700 text-white'
                                                : 'rounded-tl-md bg-white border border-slate-100 text-slate-700'
                                        }
                                    `}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {sending && (
                            <div className="flex gap-2 justify-start">
                                <div className="w-8 h-8 shrink-0 rounded-lg bg-red-100 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-red-700 text-[18px] animate-pulse">smart_toy</span>
                                </div>
                                <div className="rounded-2xl rounded-tl-md bg-white border border-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
                                    답변 생성 중…
                                </div>
                            </div>
                        )}
                    </div>

                    <footer className="shrink-0 p-4 border-t border-slate-100 bg-white">
                        <div className="flex gap-2.5 items-end">
                            <textarea
                                rows={2}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        send();
                                    }
                                }}
                                placeholder="메시지를 입력하세요…"
                                className="flex-1 min-h-[3rem] max-h-28 resize-none rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:opacity-50"
                                disabled={sending}
                            />
                            <button
                                type="button"
                                onClick={send}
                                disabled={sending || !draft.trim()}
                                className="shrink-0 w-11 h-11 rounded-xl bg-red-700 text-white flex items-center justify-center hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                aria-label="전송"
                            >
                                <span className="material-symbols-outlined text-[22px]">send</span>
                            </button>
                        </div>
                        <p className="mt-2.5 text-center text-[11px] text-slate-400">
                            Enter 전송 · Shift+Enter 줄바꿈 · 키 없으면 발췌만 · 있으면 Responses API(gpt-4o-mini)
                        </p>
                    </footer>
                </div>
            )}

            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`
                    group flex items-center justify-center w-16 h-16 rounded-full shadow-lg shadow-red-900/25
                    bg-gradient-to-br from-red-600 to-red-800 text-white ring-2 ring-white/90
                    hover:from-red-500 hover:to-red-700 hover:scale-105 active:scale-95 transition-all duration-200
                    ${open ? 'ring-red-200' : ''}
                `}
                aria-expanded={open}
                aria-label={open ? '챗봇 닫기' : '챗봇 열기'}
            >
                {open ? (
                    <span className="material-symbols-outlined text-[28px]">close</span>
                ) : (
                    <span className="material-symbols-outlined text-[28px] group-hover:animate-pulse">chat</span>
                )}
            </button>
        </div>
    );
}
