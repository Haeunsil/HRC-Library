import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Code, FileText, CheckCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';

/**
 * 코드를 보여주기 위한 재사용 가능한 UI 블록 컴포넌트
 * @param {string} title - 블록 제목
 * @param {string} code - 표시할 소스 코드 내용
 * @param {Icon} icon - 제목 옆에 표시할 아이콘
 */
const CodeBlock = ({ title, code, icon: Icon, language = 'perl' }) => (
    <div className="mb-6 last:mb-0">
        <div className="flex items-center gap-2 mb-2 text-red-700/80">
            {Icon && <Icon size={18} />}
            <h3 className="text-sm font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        <div className="rounded-lg overflow-hidden border border-white/5 shadow-inner bg-[#1e1e1e] h-[300px]">
            {code ? (
                <Editor
                    height="100%"
                    defaultLanguage={language}
                    value={code}
                    theme="vs-dark"
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        automaticLayout: true,
                        padding: { top: 16, bottom: 16 },
                        fontFamily: '"JetBrains Mono", monospace'
                    }}
                />
            ) : (
                <div className="p-4 text-gray-500 italic font-mono text-sm">내용 없음</div>
            )}
        </div>
    </div>
);

/**
 * 문항의 상세 정보를 보여주는 모달 컴포넌트
 * Framer Motion을 사용하여 등장/퇴장 애니메이션을 적용했습니다.
 * 
 * @param {Object} question - 표시할 질문 데이터 객체
 * @param {boolean} isOpen - 모달 표시 여부
 * @param {Function} onClose - 모달 닫기 핸들러
 */
const QuestionDetail = ({ question, isOpen, onClose }) => {
    // 질문 데이터가 없으면 아무것도 렌더링하지 않음
    if (!question) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* 배경 (Backdrop): 클릭 시 모달 닫힘 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    />

                    {/* 모달 컨텐츠 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        {/* 
                            이벤트 전파 중단(stopPropagation)을 통해
                            모달 내부 클릭 시 배경 클릭 이벤트(닫기)가 발생하지 않도록 함
                        */}
                        <div className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
                            {/* 헤더 영역: 제목 및 닫기 버튼 */}
                            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/5">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-700/20 text-red-700 border border-red-700/20">
                                            {question.qnum}
                                        </span>
                                        <h2 className="text-xl font-bold text-white leading-tight">
                                            {question.questionTag}
                                        </h2>
                                    </div>
                                    <p className="text-sm text-gray-400 mt-1">
                                        문항 상세 정보 및 소스 코드
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* 컨텐츠 영역: 스크롤 가능 */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                                {/* QM 소스 코드 */}
                                <CodeBlock
                                    title="QM Source"
                                    code={question.qmcode}
                                    icon={Code}
                                    language="perl"
                                />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <CodeBlock
                                        title="Perl Question Logic"
                                        code={question.PerlSourceQ}
                                        icon={FileText}
                                        language="perl"
                                    />
                                    <CodeBlock
                                        title="Perl Check Logic"
                                        code={question.PerlSourceC}
                                        icon={CheckCircle}
                                        language="perl"
                                    />
                                </div>
                            </div>

                            {/* 푸터 영역: 닫기 버튼 등 */}
                            <div className="p-4 border-t border-white/10 bg-black/20 text-right">
                                <button
                                    onClick={onClose}
                                    className="glass-button text-sm"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default QuestionDetail;
