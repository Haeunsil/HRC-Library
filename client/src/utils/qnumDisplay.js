/**
 * QuestionQnum 14000~14999 구간은 화면 표시용으로 qc0, qc1 … 형식으로 바꿉니다.
 * 내부 값(selectedQnum, API 키)은 그대로 q14001 등을 유지합니다.
 */
export function formatQnumDisplay(qnum) {
    if (qnum == null || qnum === '') return qnum;
    const s = String(qnum).trim();
    const m = /^q(\d+)$/i.exec(s);
    if (!m) return s;
    const n = parseInt(m[1], 10);
    if (n >= 14000 && n <= 14999) {
        return `qc${n - 14000}`;
    }
    return s;
}
