import React, { useState } from 'react';

const ImagePanel = ({ selectedQnum }) => {
    const qnumNumber = selectedQnum && selectedQnum.startsWith('q') ? selectedQnum.replace('q', '') : '';
    const imageURL = `https://rpssurvey.hrcglobal.com/Media/17375/${qnumNumber}.png`;
    const [key, setKey] = useState(0);

    return (
        <div id="image-panel" className="image-panel">
            <div className="image-controls">
                <button
                    id="refreshImageBtn"
                    className="btn-small"
                    onClick={() => setKey(k => k + 1)}
                >
                    새로고침
                </button>
            </div>
            <div className="image-container">
                {selectedQnum ? (
                    <img
                        key={key}
                        id="survey-image"
                        className="survey-image"
                        src={imageURL}
                        alt="설문지 이미지"
                        onError={(e) => { e.target.style.display = 'none'; document.getElementById('image-placeholder').hidden = false; }}
                        onLoad={() => { document.getElementById('image-placeholder').hidden = true; }}
                    />
                ) : null}

                <div className="image-placeholder" id="image-placeholder" hidden={!!selectedQnum}>
                    <div className="placeholder-content">
                        <div className="placeholder-icon">📋</div>
                        <h3>설문지 이미지</h3>
                        <p>문항을 선택하면 해당 설문지 이미지가 여기에 표시됩니다.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default ImagePanel;
