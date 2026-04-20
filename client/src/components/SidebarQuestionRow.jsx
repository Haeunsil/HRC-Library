import React from 'react';
import { parseBracketTags } from '../utils/bracketTags';
import { formatQnumDisplay } from '../utils/qnumDisplay';

/**
 * Sample·Address 공통 문항 행 (사이드바)
 */
export default function SidebarQuestionRow({ q, isSelected, onClick }) {
    const raw = q.questionTag || '';
    const { tags: tagList, plain } = parseBracketTags(raw);
    const hasBracketTags = tagList.length > 0;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={`
                flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer text-[12px] relative overflow-hidden transition-colors min-h-[44px]
                ${isSelected
                    ? 'bg-red-50 text-red-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
            `}
        >
            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-700" />}
            <span className={`material-symbols-outlined text-lg shrink-0 ${hasBracketTags ? 'mt-0.5' : ''}`}>
                {isSelected ? 'task_alt' : 'description'}
            </span>
            {hasBracketTags ? (
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <span
                        className={`font-semibold text-[12px] leading-snug break-words ${isSelected ? 'text-red-800' : 'text-slate-800'}`}
                    >
                        {plain || formatQnumDisplay(q.qnum)}
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
                <span className="font-semibold whitespace-nowrap truncate min-w-0">{raw || formatQnumDisplay(q.qnum)}</span>
            )}
        </div>
    );
}
