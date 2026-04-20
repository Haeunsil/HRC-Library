/**
 * fetch 실패 시 폴백. 운영 반영은 public/content/sample-update-items.json + dist 복사 권장.
 */
export const sampleUpdateItems = [
    // { date: 'YYYY-MM-DD', title: '제목', desc: '설명', qnum: 'q3015' } — qnum 있으면 클릭 시 해당 문항 페이지로 이동

    /* 2026-03 */
    { date: '2026-03-18', title: 'q3015', desc: '[척도][CSS][카테고리][두줄선]', qnum: 'q3015' },
    { date: '2026-03-18', title: 'q13001~q13009', desc: '[CATI] 카테고리 추가', qnum: 'q13001' },
    { date: '2026-03-18', title: 'qc1~qc112', desc: '[QC] 카테고리 추가', qnum: 'qc1' },
    { date: '2026-03-18', title: 'q6007', desc: '[유튜브][시간제어]', qnum: 'q6007' },
    { date: '2026-03-18', title: 'q7005', desc: '[CSS][이미지][모달][팝업][새창보기]', qnum: 'q7005' },
    { date: '2026-03-18', title: 'q4019', desc: '[오픈][대분류분리][header분리][가로항목여러개][TH분리]', qnum: 'q4019' },
    { date: '2026-03-18', title: 'q3016', desc: '[척도][항목설명][텍스트모달][팝업]', qnum: 'q3016' },

    /* 2026-04 */
    { date: '2026-04-02', title: 'q12009', desc: '[exQuestion][시간제어][링크][유튜브연결]', qnum: 'q12009' },
    { date: '2026-04-02', title: 'q12010', desc: '[exQuestion][파일업로드][영어문구]', qnum: 'q12010' },
    { date: '2026-04-02', title: 'q12011', desc: '[exQuestion][안내문][시간][종료화면셋팅]', qnum: 'q12011' },
    { date: '2026-04-07', title: 'q12012', desc: '[exQuestion][Gang갱][STOP][대기][오픈][비밀번호]', qnum: 'q12012' },

    { date: '2026-04-13', title: 'q5007 (주소)', desc: '[팝업메뉴][시도/시군구/세부주소(오픈)][주소]', qnum: 'q5007' },
    { date: '2026-04-13', title: 'q5009 (주소)', desc: '[팝업메뉴][시도/시군구][3순위][주소]', qnum: 'q5009' },
    { date: '2026-04-13', title: 'q5010 (주소)', desc: '[팝업메뉴][시도/시군구/읍면동][행정동][주소]', qnum: 'q5010' },
    { date: '2026-04-13', title: 'q5011 (주소)', desc: '[팝업메뉴][시도/시군구/읍면동][법정동][주소]', qnum: 'q5011' },

];
