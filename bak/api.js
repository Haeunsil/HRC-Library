// ====== 뷰 모드 전환 (PC / 모바일 / 모바일 가로)
const modeBtns = document.querySelectorAll('.view-modes .chip');
function setMode(mode){
  modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode===mode)));
}
modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ====== 사용자 레벨별 UI 전환 함수
function switchUserLevel(level) {
  userCode = level;
  
  // 모든 레벨 버튼 비활성화
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 모든 패널과 버튼을 먼저 초기화
  document.getElementById('qm-panel').hidden = true;
  document.getElementById('perl-panel').hidden = true;
  document.getElementById('image-panel').hidden = true;
  document.getElementById('copyBtn').hidden = true;
  
  // 강제로 스타일도 적용
  document.getElementById('qm-panel').style.display = 'none';
  document.getElementById('perl-panel').style.display = 'none';
  document.getElementById('image-panel').style.display = 'none';
  document.getElementById('copyBtn').style.display = 'none';
  
  // 선택된 레벨에 따라 해당 영역만 표시
  switch(level) {
    case 1:
      // 코드 영역 표시
      document.getElementById('code-area').hidden = false;
      document.getElementById('qm-panel').hidden = false;
      document.getElementById('qm-panel').style.display = 'block';
      document.getElementById('perl-panel').hidden = true;
      document.getElementById('perl-panel').style.display = 'none';
      document.getElementById('image-panel').hidden = true;
      document.getElementById('image-panel').style.display = 'none';
      document.getElementById('code-title').textContent = '코드';
      document.getElementById('level-btn-' + level).classList.add('active');
      
      // 코드 복사 버튼 표시
      document.getElementById('copyBtn').hidden = false;
      document.getElementById('copyBtn').style.display = 'block';
      
      // Q-M과 Perl 탭 표시
      const tabsContainer1 = document.querySelector('.tabs');
      if (tabsContainer1) {
        tabsContainer1.style.display = 'flex';
      }
      
      // 오른쪽 패널 표시
      const rightPanel = document.querySelector('section[aria-labelledby="code-title"]');
      rightPanel.hidden = false;
      
      // 메인 레이아웃을 2열로 설정
      const main = document.getElementById('main');
      main.style.gridTemplateColumns = '1fr 1fr';
      break;
    case 2:
      // 이미지 영역 표시
      document.getElementById('code-area').hidden = false;
      document.getElementById('qm-panel').hidden = true;
      document.getElementById('qm-panel').style.display = 'none';
      document.getElementById('perl-panel').hidden = true;
      document.getElementById('perl-panel').style.display = 'none';
      document.getElementById('image-panel').hidden = false;
      document.getElementById('image-panel').style.display = 'block';
      document.getElementById('code-title').textContent = '설문지';
      document.getElementById('level-btn-' + level).classList.add('active');
      
      // 코드 복사 버튼 숨김
      document.getElementById('copyBtn').hidden = true;
      document.getElementById('copyBtn').style.display = 'none';
      
      // Q-M과 Perl 탭 숨김
      const tabsContainer = document.querySelector('.tabs');
      if (tabsContainer) {
        tabsContainer.style.display = 'none';
      }
      
      // 오른쪽 패널 표시
      const rightPanel2 = document.querySelector('section[aria-labelledby="code-title"]');
      rightPanel2.hidden = false;
      
      // 메인 레이아웃을 2열로 설정
      const main2 = document.getElementById('main');
      main2.style.gridTemplateColumns = '1fr 1fr';
      break;
    case 3:
      // 오른쪽 패널 전체 숨김
      const rightPanelHidden = document.querySelector('section[aria-labelledby="code-title"]');
      rightPanelHidden.hidden = true;
      
      // 메인 레이아웃을 1열로 설정
      const mainHidden = document.getElementById('main');
      mainHidden.style.gridTemplateColumns = '1fr';
      
      document.getElementById('level-btn-3').classList.add('active');
      break;
  }
}


// ====== 새 창으로 뷰 열기 함수
function PageOpen(surveyURL) {
  window.open(surveyURL, 'ViewQuestion', 'width=1000, height=800, scrollbars=no');
}

// ====== 뷰 버튼 상태 업데이트
function updateViewButton(qnum) {
  const viewBtn = document.getElementById('viewBtn');
  const viewInfo = document.querySelector('.view-info p');
  
  if (qnum && qnum.startsWith('q')) {
    currentQnum = qnum;
    viewBtn.disabled = false;
    
    // QuestionTag 찾기
    let questionTag = qnum; // 기본값은 qnum
    questionTypes.forEach(type => {
      const select = document.getElementById(type);
      if (select) {
        const option = Array.from(select.options).find(opt => opt.value === qnum);
        if (option && option.textContent !== type) {
          questionTag = option.textContent;
        }
      }

    });
    
    viewBtn.textContent = `${questionTag} 뷰 열기`;
    viewInfo.textContent = `${questionTag}을 선택했습니다. 뷰 버튼을 클릭하여 새 창에서 확인하세요.`;
  } else {
    currentQnum = null;
    viewBtn.disabled = true;
    viewBtn.textContent = '뷰 열기';
    viewInfo.textContent = 'Qnum을 선택하면 뷰를 열 수 있습니다.';
  }
}

// ====== 뷰 버튼 이벤트 리스너
document.getElementById('viewBtn').addEventListener('click', () => {
  if (currentQnum) {
    // 코드에서는 q1, q2... 형태이므로 숫자만 추출하여 URL에 전달
    const qnumNumber = currentQnum.replace('q', '');
    const surveyURL = `https://rpssurvey.hrcglobal.com/?qn=qesha&test=1&qnum=${qnumNumber}`;
    PageOpen(surveyURL);
  }
});



// ====== 탭 전환 (Q-M / Perl)
const tabQM = document.getElementById('tab-qm');
const tabPerl = document.getElementById('tab-perl');
const panelQM = document.getElementById('qm-panel');
const panelPerl = document.getElementById('perl-panel');
const codebar = document.querySelector('.codebar');

function openTab(which){
  const isQM = which==='qm';
  tabQM.setAttribute('aria-selected', isQM);
  tabPerl.setAttribute('aria-selected', !isQM);
  panelQM.hidden = !isQM;
  panelPerl.hidden = isQM;
   panelQM.style.display = isQM ? 'block' : 'none';
  panelPerl.style.display = isQM ? 'none'  : 'block';
  // 엔진 옵션은 Perl 탭에서만 보이기, 코드 복사 버튼은 항상 보이기
  const engineSelect = document.querySelector('#engine');
  const engineLabel = document.querySelector('label[for="engine"]');
  const copyBtn = document.getElementById('copyBtn');
  
  if (isQM) {
    engineSelect.style.display = 'none';
    engineLabel.style.display = 'none';
    copyBtn.style.display = 'block';
  } else {
    engineSelect.style.display = 'block';
    engineLabel.style.display = 'block';
    copyBtn.style.display = 'block';
  }
}
tabQM.addEventListener('click', () => openTab('qm'));
tabPerl.addEventListener('click', () => openTab('perl'));

// 초기 탭 상태 설정
openTab('qm');

// ====== 엔진 옵션에 따라 Perl 코드 블록 레이블 변경
const engineSel = document.getElementById('engine');
const perlCode = document.getElementById('perl-code');
let perlBase = perlCode.textContent;

engineSel.addEventListener('change', () => {
  const label = engineSel.value === 'question' ? 'question'
              : engineSel.value === 'condition' ? 'condition' : '기본';

  openTab('perl'); 

  // 현재 선택된 Qnum이 있으면 DB 데이터를 기반으로 업데이트
  let currentQnum = null;
  questionTypes.forEach(type => {
    const select = document.getElementById(type);
    if (select && select.value.startsWith('q')) {
      currentQnum = select.value;
    }
  });
  
  if (currentQnum && dbData[currentQnum]) {
    // DB에서 가져온 실제 Perl 코드 사용
    perlCode.textContent = dbData[currentQnum].perlcode || '# Perl 코드가 없습니다';
    perlBase = perlCode.textContent;
  }
  
  // 엔진 라벨 업데이트
  perlCode.textContent = perlBase.replace(/\(엔진: .*?\)/,'(엔진: '+label+')');
});

// ====== 코드 복사
document.getElementById('copyBtn').addEventListener('click', async () => {
  const qmCodeEl = document.getElementById('qm-code');
  const perlCodeEl = document.getElementById('perl-code');
  const qmPanel = document.getElementById('qm-panel');
  const perlPanel = document.getElementById('perl-panel');
  
  // 현재 활성화된 탭 확인 (HTML 태그 제거하고 순수 텍스트만 복사)
  const isQMActive = !qmPanel.hasAttribute('hidden');
  const active = isQMActive ? qmCodeEl.textContent : perlCodeEl.textContent;
  
  try{
    await navigator.clipboard.writeText(active);
    const btn = document.getElementById('copyBtn');
    const old = btn.textContent;
    btn.textContent = '복사됨!';
    setTimeout(()=>btn.textContent = old, 1200);
  }catch(e){ alert('복사에 실패했습니다: ' + e.message); }
});

// ====== 일련번호 복사
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('copy-serial-btn')) {
    const type = e.target.dataset.type;
    let serialElement;
    
    if (type === 'qnum') {
      // 코드 영역 상단 헤더의 qnum 복사
      serialElement = document.querySelector('.code-top-header .qnum-serial em');
    } else {
      // 기존 패널별 qnum 복사
      const panel = e.target.dataset.panel;
      serialElement = document.querySelector(`#${panel}-panel .qnum-serial em`);
    }
    
    if (serialElement) {
      try {
        await navigator.clipboard.writeText(serialElement.textContent);
        const btn = e.target;
        const old = btn.textContent;
        btn.textContent = '복사됨!';
        setTimeout(() => btn.textContent = old, 1200);
      } catch (error) {
        alert('복사에 실패했습니다: ' + error.message);
      }
    }
  }
});


// ====== 이미지 새로고침
document.getElementById('refreshImageBtn').addEventListener('click', () => {
  if (currentQnum) {
    // 이미지 새로고침을 위해 캐시 무효화
    const surveyImage = document.getElementById('survey-image');
    if (surveyImage.src) {
      const originalSrc = surveyImage.src;
      surveyImage.src = '';
      setTimeout(() => {
        surveyImage.src = originalSrc + '?t=' + Date.now();
      }, 10);
    }
    updateImageArea(currentQnum);
  }
});



// ====== DB 데이터 저장용 변수
let dbData = {};
let questionTypes = [];

// ====== 사용자 레벨 관리
let userCode = 1; // 기본값: 코드 영역 표시
let currentQnum = null;

// ====== 카테고리명 한글 매핑
const categoryNames = {
  'sample': '표준화',
  'single': '단수',
  'multi': '복수',
  'open': '오픈',
  'grid': '척도',
  'scale': '단일척도',
  'popupmenu': '팝업메뉴',
  'media': '미디어',
  'sum': '합계',
  'search': '검색',
};

// ====== 카테고리명 한글 변환 함수
function getKoreanCategoryName(englishName) {
  return categoryNames[englishName] || englishName;
}


// ====== QuestionType 동적 로드
async function loadQuestionTypes() {
  try {
    const response = await fetch('config.cgi?action=get_question_types');
    const types = await response.json();
    
    // 카테고리 정렬: 표준화, 단수, 복수, 오픈 순서로
    const categoryOrder = ['sample', 'single', 'multi', 'open'];
    const sortedTypes = [];
    
    // 우선순위 카테고리 먼저 추가
    categoryOrder.forEach(category => {
      if (types.includes(category)) {
        sortedTypes.push(category);
      }
    });
    
    // 나머지 카테고리 추가
    types.forEach(type => {
      if (!categoryOrder.includes(type)) {
        sortedTypes.push(type);
      }
    });
    
    questionTypes = sortedTypes;
    
    // filterRow에 QuestionType select들 동적 생성
    const filterRow = document.getElementById('filterRow');
    filterRow.innerHTML = ''; // 기존 내용 제거
    
    sortedTypes.forEach(type => {
      const filterItem = document.createElement('div');
      filterItem.className = 'filter-item';
      
      const select = document.createElement('select');
      select.id = type; // QuestionType 값이 id가 됨
      const koreanName = getKoreanCategoryName(type);
      select.innerHTML = `<option value="">${koreanName}</option>`;
      
      filterItem.appendChild(select);
      filterRow.appendChild(filterItem);
    });
    
    // 이벤트 리스너 추가
    addSelectEventListeners();
    
  } catch (error) {
    alert('QuestionType 로드 실패: ' + error.message);
  }
}

// ====== Select 이벤트 리스너 추가
function addSelectEventListeners() {
  questionTypes.forEach(type => {
    const select = document.getElementById(type);
    if (select) {
      select.addEventListener('change', function() {
        // 모든 select에서 selected 클래스 제거 및 스타일 초기화
        questionTypes.forEach(t => {
          const s = document.getElementById(t);
          if (s) {
            s.classList.remove('selected');
            s.style.backgroundColor = '';
            s.style.color = '';
            s.style.border = '';
          }
        });
        
        if (this.value.startsWith('q')) {
          // 선택된 select에 selected 클래스 추가
          this.classList.add('selected');
          // 직접 스타일도 적용
          this.style.backgroundColor = 'white';
          this.style.color = '';
          this.style.border = '3px solid #ca2d35';
          updateCode(this.value);
          updateViewButton(this.value);
          
          // 선택된 값 표시 영역에 QuestionTag 표시
          const selectedValueSpan = document.querySelector('.selected-value');
          if (selectedValueSpan) {
            const selectedOption = this.options[this.selectedIndex];
            selectedValueSpan.textContent = selectedOption.textContent;
          }
          
          // select는 항상 카테고리명으로 표시 (즉시 되돌리기)
          this.selectedIndex = 0;
        }
      });
    }
  });
}

// ====== 임시: 모든 Qnum을 모든 Select에 로드 (QuestionTag 포함)
async function fetchAllQnumsToAllSelects() {
  try {
    const response = await fetch('config.cgi?action=get_data');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const dbData = await response.json();
    
    // 모든 QuestionType select에 모든 qnum 옵션 추가
    questionTypes.forEach(type => {
      const select = document.getElementById(type);
      if (select) {
        // 기존 옵션들 제거 (첫 번째 옵션 제외)
        while (select.children.length > 1) {
          select.removeChild(select.lastChild);
        }
        
        // DB 데이터에서 qnum과 QuestionTag 매핑
        Object.keys(dbData).forEach(qnum => {
          const option = document.createElement('option');
          option.value = qnum;
          // QuestionTag가 있으면 사용, 없으면 qnum 사용
          option.textContent = dbData[qnum].questionTag || qnum;
          select.appendChild(option);
        });
        
      }
    });
    
  } catch (error) {
    alert('Qnum 목록을 불러오는데 실패했습니다: ' + error.message);
  }
}

let searchData = []; // 검색용 데이터

// ====== QuestionType별 Qnum 목록 가져오기
async function fetchQnumsByType() {
  try {
    // 각 QuestionType별로 해당하는 qnum들을 가져오기
    for (const type of questionTypes) {
      const url = `config.cgi?action=get_qnums_by_type&type=${encodeURIComponent(type)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        continue; // 다음 타입으로 계속 진행
      }
      
      const responseText = await response.text();
      
      let qnumsWithTags;
      try {
        qnumsWithTags = JSON.parse(responseText);
      } catch (parseError) {
        continue; // 다음 타입으로 계속 진행
      }
      
      const select = document.getElementById(type);
      if (select) {
        // 기존 옵션들 제거 (첫 번째 옵션 제외)
        while (select.children.length > 1) {
          select.removeChild(select.lastChild);
        }
        
        qnumsWithTags.forEach(item => {
          const option = document.createElement('option');
          option.value = item.value; // q1, q2, q3...
          option.textContent = item.text; // QuestionTag 값
          select.appendChild(option);
        });
        
      }
    }
    
  } catch (error) {
    // 오류가 발생해도 기본 qnum 로드 시도
    await fetchAllQnumsToAllSelects();
  }
}

// ====== DB 데이터 가져오기
async function fetchDBData() {
  try {
    const response = await fetch('config.cgi?action=get_data');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    let responseData = await response.json();
    
    
    // 에러 체크
    if (responseData.error) {
      throw new Error(responseData.error);
    }
    
    
    // 데이터가 배열인지 확인
    if (!Array.isArray(responseData)) {
      alert('DB 응답 형식이 올바르지 않습니다.');
      return;
    }
    
    // 데이터를 qnum을 키로 하는 객체로 변환
    dbData = {};
    searchData = []; // 검색 데이터 초기화
    
    responseData.forEach((item, index) => {
      // qnum이 있는지 확인
      if (!item.qnum) {
        return;
      }
      
      // DB에서 가져온 데이터를 저장 (q1, q2... 형태)
      dbData[item.qnum] = {
        qmcode: item.qmcode,
        perlcode: item.perlcode
      };
      
      
      // 검색용 데이터 추가
      searchData.push({
        qnum: item.qnum,
        title: item.qnum,
        desc: 'Q-M 코드',
        type: 'qm'
      });
      
      searchData.push({
        qnum: item.qnum,
        title: item.qnum,
        desc: 'Perl 코드',
        type: 'perl'
      });
    });
    
    
  } catch (error) {
    alert('DB 데이터를 불러오는데 실패했습니다: ' + error.message);
  }
}

// ====== 코드 업데이트 함수
function updateCode(qnum) {
  currentQnum = qnum;
  
  // 사용자 레벨에 따라 다른 동작
  if (userCode === 1) {
    updateCodeArea(qnum);
  } else if (userCode === 2) {
    updateImageArea(qnum);
  }
}

// ====== 코드 영역 업데이트 (Usercode=1)
function updateCodeArea(qnum) {
  const qmCodeEl = document.getElementById('qm-code');
  const perlCodeEl = document.getElementById('perl-code');
  
  // 일련번호 업데이트
  updateQnumSerial(qnum);
  
  console.log('dbData 확인:', dbData);
  console.log('dbData[' + qnum + ']:', dbData[qnum]);
  
  if (dbData[qnum]) {
    // DB에서 가져온 실제 코드 사용
    console.log('DB 데이터 사용');
    qmCodeEl.textContent = dbData[qnum].qmcode || '# Q-M 코드가 없습니다';
    perlCodeEl.textContent = dbData[qnum].perlcode || '# Perl 코드가 없습니다';
    
    // Perl 기본값 업데이트
    perlBase = perlCodeEl.textContent;
  } else {
    // 기본 예시 코드 (DB 데이터가 없을 때)
    console.log('기본 예시 코드 사용');
    qmCodeEl.textContent = '# Q-M 예시\n#question q100\n#title\n[단수][기타오픈]\n선문1. 현재 거주하고 있는 지역은 다음 중 어디인가요?\n#ex *single\n1:서울\n2:부산\n3:대구\n4:인천\n5:광주\n6:대전\n7:울산\n8:경기\n9:강원\n10:충북\n11:충남\n12:전북\n13:전남\n14:경북\n15:경남\n16:제주\n17:기타 *open[\'\',80,1,\'\'] *goto screenout';
    perlCodeEl.textContent = '# Perl 예시 (엔진: 기본)\nuse strict;\nuse warnings;\n\nmy @options = (\'A\',\'B\',\'C\');\nprint "가장 선호하는 항목을 선택하세요\\n";\nfor my $i (0..$#options){ print ($i+1).". $options[$i]\\n"; }\n\n# 응답 로직 (개념 예시)\nmy $ans = <STDIN>;\nchomp $ans;\nif ($options[$ans-1] eq \'C\'){\n  print "선호 이유를 입력해주세요:\\n";\n  my $reason = <STDIN>;\n  chomp $reason;\n}';
    
    // Perl 기본값 업데이트
    perlBase = perlCodeEl.textContent;
  }
}

// ====== 이미지 영역 업데이트 (Usercode=2)
function updateImageArea(qnum) {
  const surveyImage = document.getElementById('survey-image');
  const imagePlaceholder = document.getElementById('image-placeholder');
  
  // 일련번호 업데이트
  updateQnumSerial(qnum);
  
  if (qnum && qnum.startsWith('q')) {
    const qnumNumber = qnum.replace('q', '');
    
    // 실제 이미지 경로
    const imagePath = `https://rpssurvey.hrcglobal.com/Media/17375/${qnumNumber}.png`;
    
    // 이미지 로드 시도
    surveyImage.src = imagePath;
    surveyImage.onload = function() {
      // 이미지 로드 성공
      surveyImage.style.display = 'block';
      imagePlaceholder.style.display = 'none';
    };
    
    surveyImage.onerror = function() {
      // 이미지 로드 실패 시 플레이스홀더 표시
      surveyImage.style.display = 'none';
      imagePlaceholder.style.display = 'flex';
    };
    
  } else {
    surveyImage.style.display = 'none';
    imagePlaceholder.style.display = 'flex';
  }
}

// ====== 일련번호 업데이트 함수
function updateQnumSerial(qnum) {
  // 코드 영역 상단 헤더의 qnum (usercode=1일 때)
  const codeTopSerial = document.querySelector('.code-top-header .qnum-serial em');
  
  // 이미지 영역의 qnum (usercode=2일 때)
  const imageSerial = document.querySelector('#image-panel .qnum-serial em');
  
  if (qnum) {
    const displayQnum = `[${qnum}]`;
    if (codeTopSerial) codeTopSerial.textContent = displayQnum;
    if (imageSerial) imageSerial.textContent = displayQnum;
  } else {
    if (codeTopSerial) codeTopSerial.textContent = '[qnum]';
    if (imageSerial) imageSerial.textContent = '[qnum]';
  }
}

// ====== 카테고리 드롭다운 처리
const categorySelects = document.querySelectorAll('.filter-item select');
const selectedValueSpan = document.querySelector('.selected-value');

categorySelects.forEach(select => {
  select.addEventListener('change', function() {
    
    if (this.value === '') {
      return;
    }
    
    // 선택된 항목을 하나의 표시 영역에 표시 (카테고리 상관없이 1개만)
    const selectedOption = this.options[this.selectedIndex];
    if (selectedValueSpan) {
      // QuestionTag가 있으면 사용, 없으면 qnum 사용
      selectedValueSpan.textContent = selectedOption.text;
    }
    
    // 단수/복수 카테고리에서 선택된 경우 코드 업데이트 및 뷰 버튼 업데이트
    if (this.id === 'category1' && this.value.startsWith('q')) {
      updateCode(this.value);
      updateViewButton(this.value);
    }
    
    // select는 항상 카테고리명으로 표시 (즉시 되돌리기)
    this.selectedIndex = 0;
  });
  
  // 드롭다운 열릴 때 첫 번째 옵션(카테고리명)이 선택되지 않도록
  select.addEventListener('mousedown', function() {
    if (this.selectedIndex === 0) {
      this.selectedIndex = 1;
    }
  });
  
  // 드롭다운 닫힐 때도 카테고리명으로 표시 (selected 클래스는 유지)
  select.addEventListener('blur', function() {
    this.selectedIndex = 0;
    // selected 클래스는 유지하여 배경색 보존
    // blur 이벤트에서 selected 클래스가 제거되지 않도록 보호
    if (this.classList.contains('selected')) {
      setTimeout(() => {
        if (!this.classList.contains('selected')) {
          this.classList.add('selected');
        }
      }, 0);
    }
  });
});

// ====== 검색 기능
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');
const searchContainer = document.querySelector('.search-container');
let activeSearchIndex = -1;

function normalizeSearchText(text) {
  return (text || '').toLowerCase().trim();
}

async function renderSearchSuggestions(query) {
  if (!query || query.length < 1) {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = '';
    return;
  }
  
  try {
    const response = await fetch(`config.cgi?action=search_questions&q=${encodeURIComponent(query)}`);
    const results = await response.json();
    
    if (results.error) {
      searchSuggestions.innerHTML = '<div class="search-suggestion-item"><div class="search-suggestion-title">검색 중 오류가 발생했습니다</div></div>';
      searchSuggestions.hidden = false;
      return;
    }
    
    if (results.length === 0) {
      searchSuggestions.innerHTML = '<div class="search-suggestion-item"><div class="search-suggestion-title">검색 결과가 없습니다</div></div>';
      searchSuggestions.hidden = false;
      return;
    }
    
    // 최대 8개 결과로 제한
    const limitedResults = results.slice(0, 99);
    
    searchSuggestions.innerHTML = limitedResults.map((item, index) => 
      `<div class="search-suggestion-item" data-qnum="${item.qnum}" data-type="${item.questionType}" data-questiontag="${item.questionTag}" data-index="${index}">
        <div class="search-suggestion-title">${item.questionTag}</div>
        <div class="search-suggestion-desc">${item.qnum} (${getKoreanCategoryName(item.questionType)})</div>
      </div>`
    ).join('');
    
    searchSuggestions.hidden = false;
    activeSearchIndex = -1;
    
  } catch (error) {
    searchSuggestions.innerHTML = '<div class="search-suggestion-item"><div class="search-suggestion-title">검색 중 오류가 발생했습니다</div></div>';
    searchSuggestions.hidden = false;
  }
}

function selectSearchResult(qnum, type, questionTag) {
  
  // 모든 select에서 selected 클래스 제거 및 스타일 초기화
  questionTypes.forEach(t => {
    const s = document.getElementById(t);
    if (s) {
      s.classList.remove('selected');
      s.style.backgroundColor = '';
      s.style.color = '';
      s.style.border = '';
    }
  });
  
  // 해당하는 select에 selected 클래스 추가 및 스타일 적용
  if (type && questionTypes.includes(type)) {
    const select = document.getElementById(type);
    if (select) {
      select.classList.add('selected');
      select.style.backgroundColor = 'white';
      select.style.color = '';
      select.style.border = '3px solid #ca2d35';
    }
  }
  
  // 검색 결과 선택 시에는 select 값을 변경하지 않고 바로 코드 업데이트
  updateCode(qnum);
  updateViewButton(qnum);
  
  // 선택된 값 표시 영역 업데이트 (QuestionTag 사용)
  const selectedValueSpan = document.querySelector('.selected-value');
  if (selectedValueSpan) {
    // 검색 결과에서 받은 QuestionTag 사용, 없으면 select에서 찾기
    let displayTag = questionTag || qnum; // 기본값은 qnum
    
    if (!questionTag) {
      // QuestionTag가 없으면 select에서 찾기
      questionTypes.forEach(type => {
        const select = document.getElementById(type);
        if (select) {
          const option = Array.from(select.options).find(opt => opt.value === qnum);
          if (option && option.textContent !== type) {
            displayTag = option.textContent;
          }
        }
      });
    }
    
    selectedValueSpan.textContent = displayTag;
  }
  
  // 해당 QuestionType 탭으로 전환 (QuestionType이 있으면 해당 탭 활성화)
  if (type && questionTypes.includes(type)) {
    // QuestionType에 해당하는 탭이 있다면 활성화
  } else {
    // 기본적으로 Q-M 탭 활성화
    openTab('qm');
  }
  
  // 검색창 초기화
  searchInput.value = '';
  searchSuggestions.hidden = true;
  searchSuggestions.innerHTML = '';
}

// 검색 입력 이벤트 (debounce 적용)
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderSearchSuggestions(e.target.value);
  }, 300); // 300ms 지연
});

// 검색 제안 클릭 이벤트
searchSuggestions.addEventListener('click', (e) => {
  const item = e.target.closest('.search-suggestion-item');
  if (item) {
    const qnum = item.dataset.qnum;
    const type = item.dataset.type;
    const questionTag = item.dataset.questiontag;
    selectSearchResult(qnum, type, questionTag);
  }
});

// 키보드 네비게이션
searchInput.addEventListener('keydown', (e) => {
  const items = searchSuggestions.querySelectorAll('.search-suggestion-item');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSearchIndex = Math.min(activeSearchIndex + 1, items.length - 1);
    updateActiveSearchItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSearchIndex = Math.max(activeSearchIndex - 1, -1);
    updateActiveSearchItem(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSearchIndex >= 0 && items[activeSearchIndex]) {
      const item = items[activeSearchIndex];
      const qnum = item.dataset.qnum;
      const type = item.dataset.type;
      const questionTag = item.dataset.questiontag;
      selectSearchResult(qnum, type, questionTag);
    }
  } else if (e.key === 'Escape') {
    searchSuggestions.hidden = true;
    searchInput.blur();
  }
});

function updateActiveSearchItem(items) {
  items.forEach((item, index) => {
    item.style.backgroundColor = index === activeSearchIndex ? 'var(--surface)' : '';
  });
}

// 검색창 외부 클릭 시 제안 숨기기
document.addEventListener('click', (e) => {
  if (!searchContainer.contains(e.target)) {
    searchSuggestions.hidden = true;
  }
});

// ====== 사용자 레벨 감지 함수
async function detectUserLevel() {
  try {
    // 초기화: 모든 패널과 버튼을 기본 상태로 설정
    initializePanels();
    
    // URL 파라미터에서 usercode 읽기
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserCode = urlParams.get('usercode');
    
    if (urlUserCode) {
      userCode = parseInt(urlUserCode);
    }
    
    // 쿠키에서도 확인
    const cookieUserCode = getCookie('usercode');
    if (cookieUserCode) {
      userCode = parseInt(cookieUserCode);
    }
    
    // 기본값은 1 (코드 영역)
    if (!userCode || userCode < 1 || userCode > 3) {
      userCode = 1;
    }
    
    // UI 전환
    switchUserLevel(userCode);
    
  } catch (error) {
    userCode = 1;
    switchUserLevel(userCode);
  }
}

// ====== 패널 초기화 함수
function initializePanels() {
  // 모든 패널을 기본 상태로 설정
  document.getElementById('qm-panel').hidden = false;
  document.getElementById('perl-panel').hidden = true;
  document.getElementById('image-panel').hidden = true;
  document.getElementById('copyBtn').hidden = false;
}

// ====== 쿠키 읽기 함수
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

// ====== 사용자 레벨 변경 함수 (제거됨 - URL로만 제어)
// function setUserLevel(level) {
//   userCode = level;
//   switchUserLevel(userCode);
//   
//   // 현재 선택된 문항이 있으면 해당 레벨에 맞게 업데이트
//   if (currentQnum) {
//     updateCode(currentQnum);
//   }
// }

// 페이지 로드 시 DB 데이터와 QuestionType별 Qnum 목록 가져오기
window.addEventListener('DOMContentLoaded', async () => {
  await detectUserLevel();
  await loadQuestionTypes();
  await fetchQnumsByType();
  await fetchDBData();
});

// 초기 상태
setMode('pc');
