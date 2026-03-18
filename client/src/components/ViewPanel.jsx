import React from 'react';

// rpssurvey CSP의 frame-ancestors에 localhost가 없어 로컬에서 iframe 차단됨
const isIframeBlocked = () =>
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const ViewPanel = ({ selectedQnum, viewMode = 'pc', surveyURL = '', refreshKey, onOpenNewWindow }) => {
    return (
        <div className="panel-body">
            {!selectedQnum ? (
                <div className="view-placeholder" id="view-placeholder">
                    <div className="placeholder-content">
                        <div className="placeholder-icon">👆</div>
                        <h3>문항을 선택해주세요.</h3>
                        <p>카테고리나 검색을 통해 문항을 선택하면 여기에 표시됩니다.</p>
                    </div>
                </div>
            ) : isIframeBlocked() ? (
                <div className="view-placeholder" id="view-placeholder">
                    <div className="placeholder-content">
                        <div className="placeholder-icon">🔗</div>
                        <h3>로컬 환경에서는 미리보기가 제한됩니다</h3>
                        <p>rpssurvey는 webdemo.hrcglobal.com에서만 iframe으로 표시됩니다.</p>
                        <button
                            type="button"
                            onClick={() => surveyURL && (onOpenNewWindow?.() || window.open(surveyURL, '_blank'))}
                            className="mt-4 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors text-sm font-semibold"
                        >
                            새 탭에서 열기
                        </button>
                    </div>
                </div>
            ) : (
                <div className="iframe-wrap" id="iframe-wrap">
                    <iframe
                        id="view-iframe"
                        src={surveyURL}
                        className={`device ${viewMode}`}
                        frameBorder="0"
                        key={`${refreshKey}-${surveyURL || ''}`}
                    />
                </div>
            )}
        </div>
    );
};

export default ViewPanel;
