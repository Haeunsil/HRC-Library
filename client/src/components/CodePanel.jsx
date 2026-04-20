import React from 'react';
import ImagePanel from './ImagePanel';
import Editor from '@monaco-editor/react';
import CustomSelect from './CustomSelect';

const CodePanel = ({
    data,
    userLevel,
    selectedQnum,
    activeTab = 'qm',
    engine = 'question',
    setEngine,
    isLoading = false,
    /** Script 탭: public/scripts/library-script.txt 등 fetch 결과 */
    staticScriptText = null,
    staticScriptLoading = false,
    staticScriptError = null,
}) => {
    // 탭 상태 및 복사 로직 상위 컴포넌트(App.jsx)로 이동 완료.
    // 여기서는 props로 전달받은 activeTab, engine 등을 사용해 코드만 렌더링.

    // 레벨 3: 문항 Q-M/Perl은 준비 중 — Sample 전체 스크립트(script)는 예외로 표시
    if (userLevel === 3 && activeTab !== 'script') {
        return <div style={{ padding: 20, textAlign: 'center' }}>연구원 (준비중)</div>;
    }

    // 코드 데이터 가져오기 (단순 표시용)
    const getCodeContent = () => {
        if (activeTab === 'script') {
            if (staticScriptLoading) return '# 스크립트 파일을 불러오는 중…';
            if (staticScriptError) return `# 불러오기 실패: ${staticScriptError}`;
            if (staticScriptText != null && staticScriptText !== '') return staticScriptText;
            return '# 스크립트 내용이 없습니다. public/scripts/library-script.txt 를 확인하세요.';
        }
        if (!data) return '# 문항을 선택해주세요.';

        if (activeTab === 'qm') {
            return data.qmcode || '# Q-M 코드가 없습니다.';
        } else {
            const code = engine === 'condition' ? data.PerlSourceC : data.PerlSourceQ;
            return code || '# 본 문항은 Perl 코드가 없습니다.';
        }
    };

    const codeContent = getCodeContent();
    // Q-M·Perl·전체 스크립트 모두 Sample Source와 동일하게 python 문법 강조(모노카 기본 팔레트)
    const language = 'python';

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden font-sans">
            {/* Header Removed as per new design request */}

            {/* 3. Content */}
            <div className="code-content">
                {userLevel === 1 || activeTab === 'script' ? (
                    <>
                        {activeTab === 'perl' && (
                            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'white' }}>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-2">Engine:</label>
                                <div style={{ display: 'inline-block', width: '100px' }}>
                                    <CustomSelect
                                        value={engine}
                                        options={[
                                            { value: 'question', label: 'question' },
                                            { value: 'condition', label: 'condition' }
                                        ]}
                                        onChange={(e) => setEngine && setEngine(e.target.value)}
                                        placeholder="Engine"
                                        size="small"
                                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
                                    />
                                </div>
                            </div>
                        )}

                        <div
                            className="syntax-wrapper relative"
                            style={{
                                height: activeTab === 'perl' ? 'calc(100% - 45px)' : '100%',
                                minHeight: 0,
                            }}
                        >
                            <Editor
                                height="100%"
                                language={language}
                                defaultLanguage={language}
                                value={codeContent}
                                options={{
                                    readOnly: true,
                                    /** Find 바 min-width·높이는 index.css — 오버레이 잘림 방지 */
                                    fixedOverflowWidgets: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 13,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    automaticLayout: true,
                                    padding: { top: 16, bottom: 16 }
                                }}
                            />
                            {(isLoading || (activeTab === 'script' && staticScriptLoading)) && (
                                <div className="absolute inset-0 bg-white/60 flex items-center justify-center pointer-events-none">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                                        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                                        <span>{activeTab === 'script' ? '스크립트 불러오는 중…' : '코드 불러오는 중...'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <ImagePanel selectedQnum={selectedQnum} />
                )}
            </div>
        </div>
    );
};

export default CodePanel;
