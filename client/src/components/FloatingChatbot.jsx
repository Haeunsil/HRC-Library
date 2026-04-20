import React, { useState, useEffect, useRef } from 'react';
import { ragChat } from '../api';

let _msgId = 0;
const nextId = () => {
    _msgId += 1;
    return _msgId;
};

/**
 * 플로팅 챗봇 — RAG 매뉴얼 (/api/chat/rag)
 * @param {{ onNavigateToQnum?: (qnum: string) => void, comingSoon?: boolean }} props
 */
export default function FloatingChatbot({ onNavigateToQnum, comingSoon = false }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [messages, setMessages] = useState(() => [
        {
            id: nextId(),
            role: 'bot',
            text: '안녕하세요. HRC Library 이용을 도와드리는 챗봇입니다.\n화면 사용법, 검색, 사이드바 메뉴 등 궁금한 점을 편하게 물어보세요.\n (문항을 추천받고 싶으면 ~문항 추천해줘라고 입력해주세요.)',
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
        if (comingSoon) return;
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
            const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
            const hasRecs = recommendations.length > 0;
            const bodyText = (reply || '').trim();
            // 연관 문항이 있으면 본문은 버튼 위 안내 블록에서만 쓰고, 여기서는 번호가 섞이지 않게 비움
            const botText = hasRecs ? '' : bodyText || '응답이 비었습니다.';
            setMessages((m) => [
                ...m,
                {
                    id: nextId(),
                    role: 'bot',
                    text: botText,
                    recommendations,
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
                    aria-label={comingSoon ? '챗봇 안내' : '챗봇'}
                    className="w-[min(100vw-2rem,28rem)] sm:w-[34rem] lg:w-[38rem] max-h-[min(44rem,82dvh)] flex flex-col rounded-2xl bg-white shadow-2xl shadow-slate-900/15 border border-slate-200/90 overflow-hidden transition-all duration-200 ease-out"
                >
                    <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200/90">
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700"
                            aria-hidden
                        >
                            <span className="material-symbols-outlined text-[22px] leading-none">smart_toy</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[15px] font-semibold leading-tight text-slate-800">HRC Library</h2>
                            <p className="mt-0.5 text-xs leading-tight text-slate-500">
                                {comingSoon ? 'Chat Bot · 준비 중' : 'Chat Bot'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            aria-label="챗봇 닫기"
                        >
                            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
                        </button>
                    </header>

                    {comingSoon ? (
                        <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 bg-slate-50/80 text-center">
                            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                                <span className="material-symbols-outlined text-[32px]">schedule</span>
                            </span>
                            <div className="space-y-1.5">
                                <p className="text-[15px] font-semibold text-slate-800">곧 공개 예정입니다</p>
                                <p className="text-sm text-slate-600 leading-relaxed">
                                    챗봇 서비스를 준비하고 있습니다.
                                    <br />
                                    조금만 기다려 주세요.
                                </p>
                                <p className="pt-1 text-xs font-medium uppercase tracking-widest text-slate-400">
                                    Coming soon
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="mt-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                            >
                                확인
                            </button>
                        </div>
                    ) : (
                        <>
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
                                        max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm leading-relaxed text-slate-700
                                        ${
                                            msg.role === 'user'
                                                ? 'rounded-tr-md bg-red-700 text-white whitespace-pre-wrap break-words'
                                                : 'rounded-tl-md bg-white border border-slate-100'
                                        }
                                    `}
                                >
                                    {msg.role === 'user' ? (
                                        msg.text
                                    ) : (
                                        <>
                                            {msg.recommendations?.length > 0 ? (
                                                <div className="whitespace-pre-wrap break-words text-[13px] leading-snug text-slate-600">
                                                    연관 문항은 아래와 같습니다.
                                                    {'\n'}
                                                    항목을 누르면 해당 샘플로 이동합니다.
                                                </div>
                                            ) : msg.text ? (
                                                <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                                            ) : null}
                                            {msg.recommendations?.length > 0 && (
                                                <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
                                                    {onNavigateToQnum
                                                        ? msg.recommendations.map((r) => {
                                                              const label =
                                                                  (r.questionTag || '').trim() || '태그 없음';
                                                              return (
                                                                  <button
                                                                      key={r.qnum}
                                                                      type="button"
                                                                      onClick={() => {
                                                                          onNavigateToQnum(r.qnum);
                                                                          setOpen(false);
                                                                      }}
                                                                      className="flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-2 text-left text-xs transition-colors hover:border-red-300 hover:bg-red-100"
                                                                  >
                                                                      <span className="shrink-0 font-mono font-bold text-red-800">
                                                                          {r.qnum}
                                                                      </span>
                                                                      <span className="min-w-0 flex-1 break-words leading-snug text-slate-700">
                                                                          {label}
                                                                      </span>
                                                                  </button>
                                                              );
                                                          })
                                                        : msg.recommendations.map((r) => {
                                                              const label =
                                                                  (r.questionTag || '').trim() || '태그 없음';
                                                              return (
                                                                  <div
                                                                      key={r.qnum}
                                                                      className="flex w-full items-start gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs"
                                                                  >
                                                                      <span className="shrink-0 font-mono font-semibold text-slate-700">
                                                                          {r.qnum}
                                                                      </span>
                                                                      <span className="min-w-0 flex-1 break-words leading-snug text-slate-600">
                                                                          {label}
                                                                      </span>
                                                                  </div>
                                                              );
                                                          })}
                                                </div>
                                            )}
                                        </>
                                    )}
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
                           
                        </p>
                    </footer>
                        </>
                    )}
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
                aria-label={
                    open ? '챗봇 닫기' : comingSoon ? '챗봇 — 곧 공개 예정 안내' : '챗봇 열기'
                }
            >
                {open ? (
                    <span className="material-symbols-outlined text-[28px]">close</span>
                ) : (
                    <span className="material-symbols-outlined text-[28px] group-hover:animate-pulse">smart_toy</span>
                )}
            </button>
        </div>
    );
}
