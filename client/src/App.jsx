import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FloatingChatbot from './components/FloatingChatbot';
import ViewPanel from './components/ViewPanel';
import CodePanel from './components/CodePanel';
import { getInitData, getQuestionDetail } from './api';
import { getCategoryLabel } from './data/koreanNames';
import { safeStorage } from './utils/safeStorage';

// 표시용 URL: 파라미터만 숨김. /dist/는 유지 (webdemotest에서 /HRClib/는 다른 앱 → 새로고침 시 /HRClib/dist/ 필요)
const getCleanDisplayUrl = () => {
  let path = window.location.pathname || '/';
  if (!path.endsWith('/')) path += '/';
  return path + (window.location.hash || '');
};

const isLocal = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/** 빌드 시 VITE_ENABLE_CHATBOT=0|false|no|off 이면 플로팅 챗봇 미표시 (미설정 시 표시). */
const isChatbotEnabled = () => {
  const v = String(import.meta.env.VITE_ENABLE_CHATBOT ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(v);
};

// usercode 검증: query 또는 storage (localStorage 우선 - 새로고침 시 복원)
const hasValidUsercode = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('usercode')) return true;
  if (getPersistItem('userLevel')) return true;
  return false;
};

// 새로고침 시 복원용: localStorage 우선 (userLevel 등. selectedQnum은 sessionStorage만)
function getPersistItem(key) {
  if (key === 'selectedQnum') {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    const val = localStorage.getItem('hrclib_' + key);
    if (val != null) return val;
  } catch {
    /* localStorage 차단 시 */
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function AbnormalAccessPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-4xl text-red-700">warning</span>
      </div>
      <h1 className="text-xl font-bold text-slate-800 mb-2">비정상적인 루트로 접근하셨습니다</h1>
      <p className="text-slate-600 text-sm max-w-md mb-6">
        정상적인 경로를 통해 접속해 주시기 바랍니다. 
      </p>
      <p className="text-[11px] text-slate-400">
        © Hankook Research. All rights reserved.
      </p>
    </div>
  );
}

function App() {
  const [selectedQnum, setSelectedQnum] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const qnumFromUrl = params.get('qnum');
    if (qnumFromUrl) {
      try {
        sessionStorage.setItem('selectedQnum', qnumFromUrl);
      } catch {
        /* 무시 */
      }
      return qnumFromUrl;
    }
    return getPersistItem('selectedQnum') || null;
  });
  const [fullQuestionData, setFullQuestionData] = useState(null);
  const [userLevel, setUserLevel] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('usercode');
    if (codeFromUrl) {
      const level = parseInt(codeFromUrl, 10);
      safeStorage.setItem('userLevel', level);
      return level;
    }
    const stored = getPersistItem('userLevel') || safeStorage.getItem('userLevel');
    return stored ? parseInt(stored, 10) : 1;
  });
  const [dbData, setDbData] = useState({});
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [apiError, setApiError] = useState(false);

  // URL 파라미터를 숨김: params → localStorage → clean URL로 replace (새로고침 시 복원)
  // selectedQnum: sessionStorage만 사용 (창 닫으면 선택 초기화)
  useEffect(() => {
    try {
      localStorage.removeItem('hrclib_selectedQnum');
    } catch {
      /* 무시 */
    }
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('usercode');
    const qnumFromUrl = params.get('qnum');

    if (codeFromUrl) {
      const level = parseInt(codeFromUrl, 10);
      safeStorage.setItem('userLevel', level);
      try {
        localStorage.setItem('hrclib_userLevel', String(level));
      } catch {
        /* 무시 */
      }
      setUserLevel(level);
    }
    if (qnumFromUrl) {
      try {
        sessionStorage.setItem('selectedQnum', qnumFromUrl);
      } catch {
        /* 무시 */
      }
      setSelectedQnum(qnumFromUrl);
    }

    // 사용자에게 파라미터·/dist/ 노출 방지
    const cleanUrl = getCleanDisplayUrl();
    const currentPath = window.location.pathname + (window.location.search || '') + (window.location.hash || '');
    if (currentPath !== cleanUrl) {
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  // userLevel 변경 시 세션 스토리지 업데이트
  const changeUserLevel = (level) => {
    setUserLevel(level);
    safeStorage.setItem('userLevel', level);
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('pc'); // pc, mobile, mobile-land

  // CodePanel State Lifted
  const [activeTab, setActiveTab] = useState('qm'); // 'qm' or 'perl'
  const [engine, setEngine] = useState('question'); // 'question' or 'condition' (for Perl)

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        // get_init: summary+types를 1회 호출로 받아 실서버 지연을 줄입니다.
        const { summary: all, types, apiError: err } = await getInitData();
        if (cancelled) return;

        // 서버 연결 실패: apiError 플래그 또는 summary+types 둘 다 비어있을 때 (실제 DB는 항상 데이터 있음)
        const isEmpty = (!all || all.length === 0) && (!types || types.length === 0);
        setApiError(!!err || isEmpty);

        const order = ['sample','single', 'multi', 'open', 'scale', 'grid', 'popupmenu', 'sum', 'search', 'agree', 'info', 'CSS', 'exQuestion', 'media', 'cati', 'QC'];
        const sorted = [
          ...order.filter(x => (types || []).includes(x)),
          ...(types || []).filter(x => !order.includes(x))
        ];
        setCategories(sorted);

        const map = {};
        all.forEach(q => { map[q.qnum] = q; });
        setDbData(map);

        const byCat = {};
        sorted.forEach(cat => {
          const normalizedCat = String(cat).toLowerCase().trim();
          byCat[cat] = all.filter(q => String(q.questionType || '').toLowerCase().trim() === normalizedCat);
        });
        setCategoryData(byCat);
      } catch (e) {
        console.error(e);
        if (!cancelled) setApiError(true);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // selectedQnum 변경 시: 이미 로드된 dbData에서 즉시 반영 (전체 재호출 금지)
  useEffect(() => {
    if (!selectedQnum) return;

    const summary = dbData[selectedQnum];
    if (summary) {
      setFullQuestionData(prev => ({ ...(prev || {}), ...summary }));
      if (summary.questionType) setSelectedCategory(summary.questionType);
    }

    let cancelled = false;
    const loadDetail = async () => {
      setIsDetailLoading(true);
      const detail = await getQuestionDetail(selectedQnum);
      if (!detail || cancelled) {
        setIsDetailLoading(false);
        return;
      }
      setFullQuestionData(detail);
      if (detail.questionType) setSelectedCategory(detail.questionType);
      setIsDetailLoading(false);
    };
    loadDetail();

    return () => { cancelled = true; setIsDetailLoading(false); };
  }, [selectedQnum, dbData]);

  const handleSelect = (partial) => {
    const qnum = partial.qnum || partial.value;
    setSelectedQnum(qnum);
    const data = dbData[qnum] || partial;
    setFullQuestionData(data);

    // Update Category from selection or data
    if (partial.category) {
      setSelectedCategory(partial.category);
    } else if (data.questionType) {
      setSelectedCategory(data.questionType);
    }

    // Update Session Storage (F5 시 복원)
    safeStorage.setItem('selectedQnum', qnum);

    // URL 파라미터·/dist/ 숨김: 깔끔한 경로만 표시
    const cleanUrl = getCleanDisplayUrl();
    const current = window.location.pathname + (window.location.search || '') + (window.location.hash || '');
    if (current !== cleanUrl) {
      window.history.replaceState({}, '', cleanUrl);
    }
  };

  // Helper for clipboard copy
  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    // Optional: Toast notification could go here
    alert('복사되었습니다');
  };

  const handleCopyCode = () => {
    if (!fullQuestionData) return;
    let text = '';
    if (activeTab === 'qm') {
      text = fullQuestionData.qmcode;
    } else {
      text = engine === 'condition' ? fullQuestionData.PerlSourceC : fullQuestionData.PerlSourceQ;
    }
    copyToClipboard(text);
  };

  /* Search State */
  const [searchTerm, setSearchTerm] = useState('');

  // Dynamic Breadcrumb State
  const [selectedCategory, setSelectedCategory] = useState('');

  // View Panel Control Logic
  const [viewTimestamp, setViewTimestamp] = useState(Date.now());

  const surveyURL = React.useMemo(() => {
    if (!selectedQnum) return '';
    const qType = String(fullQuestionData?.questionType || '').trim().toUpperCase();
    const customUrl = fullQuestionData?.questionUrlQM || fullQuestionData?.QuestionUrlQM;
    if (qType === 'QC' && customUrl) return String(customUrl).trim();
    return `https://rpssurvey.hrcglobal.com/?qn=HRClib&qnum=${selectedQnum}${userLevel === 1 ? '&test=1' : ''}&_t=${viewTimestamp}`;
  }, [selectedQnum, userLevel, viewTimestamp, fullQuestionData]);

  const handleRefreshView = () => {
    setViewTimestamp(Date.now());
  };

  const handleOpenNewWindow = () => {
    if (surveyURL) {
      window.open(surveyURL, '_blank');
    }
  };

  const handleReset = () => {
    // 선택 상태 초기화 후 강력 새로고침 → 카테고리 접힘 등 전체 초기화
    safeStorage.removeItem('selectedQnum');
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-dvh md:h-screen overflow-hidden bg-[#fcfcfc] font-sans text-slate-800">
      {/* 서버 연결 실패 안내 - 상단 고정 (실제 서버 포함 항상 표시) */}
      {apiError && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          <span className="material-symbols-outlined text-amber-600 shrink-0">error</span>
          <span>서버 연결에 실패했습니다. 잠시 후 새로고침하거나 관리자에게 문의해 주세요.</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto shrink-0 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-semibold transition-colors"
          >
            새로고침
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">

      {/* SIDEBAR */}
      <aside className={`
          border-r border-slate-200 flex flex-col h-full min-h-0 max-h-dvh bg-white shrink-0 z-50 transition-all duration-300 ease-in-out relative group overflow-hidden
          md:max-h-none
          ${isSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-none'}
      `}>
        <div className="px-4 md:px-6 py-4 md:py-6 flex items-center justify-between shrink-0">
          <div
            className="flex items-center gap-3 overflow-hidden cursor-pointer group"
            onClick={handleReset}
            title="Reset Application"
          >
            <div className="w-8 h-8 bg-red-700 rounded-lg flex items-center justify-center text-white shadow-md shadow-red-200 shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-lg">biotech</span>
            </div>
            <span className="font-bold text-lg tracking-tight text-red-700 whitespace-nowrap opacity-100 transition-opacity duration-300">HRC <span className="text-slate-900 font-black">Library</span></span>
          </div>
          <button
            aria-label="Toggle Sidebar"
            onClick={() => setIsSidebarOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-700 hover:bg-slate-50 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined">first_page</span>
          </button>
        </div>

        {/* Search Input Area */}
        <div className="px-4 md:px-6 mb-2 shrink-0">
          <div className="relative group/search">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within/search:text-red-700 transition-colors">search</span>
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/10 focus:border-red-700 transition-all text-sm placeholder:text-slate-400"
              placeholder="Find Sample..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Navigation / Categories */}
        <Sidebar
          onSelect={handleSelect}
          selectedQnum={selectedQnum}
          searchTerm={searchTerm}
          categories={categories}
          categoryData={categoryData}
        />


      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col p-4 md:p-6 pt-10 gap-6 overflow-y-auto lg:overflow-hidden bg-[#fcfcfc]">
        <div className={`lg:flex-1 grid gap-6 lg:overflow-hidden shrink-0 h-auto lg:h-full ${userLevel === 2 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-[500px] lg:min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white flex-wrap h-auto">
              <div className="flex items-center gap-4 flex-wrap">
                {!isSidebarOpen && (
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-1 px-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                    title="Open Sidebar"
                  >
                    <span className="material-symbols-outlined text-lg">menu</span>
                  </button>
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">desktop_windows</span>
                  Preview
                </span>
                <div className="h-4 w-px bg-slate-200"></div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('pc')}
                    className={`p-1 rounded transition-colors ${viewMode === 'pc' ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span className="material-symbols-outlined text-lg">desktop_mac</span>
                  </button>
                  <button
                    onClick={() => setViewMode('mobile')}
                    className={`p-1 rounded transition-colors ${viewMode === 'mobile' ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span className="material-symbols-outlined text-lg">smartphone</span>
                  </button>
                  <button
                    onClick={() => setViewMode('mobile-land')}
                    className={`p-1 rounded transition-colors ${viewMode === 'mobile-land' ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <span className="material-symbols-outlined text-lg rotate-90">smartphone</span>
                  </button>
                </div>
                <div className="hidden md:block h-4 w-px bg-slate-200"></div>
                <h1 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 w-full md:w-auto mt-2 md:mt-0 md:whitespace-nowrap md:overflow-hidden md:text-ellipsis max-w-none md:max-w-[400px] text-center md:text-left">
                  {selectedCategory && `[${getCategoryLabel(selectedCategory)}] `}
                  {fullQuestionData?.questionTag || selectedQnum || "Select a Question"}
                </h1>
              </div>
              <div className="flex items-center gap-2 md:self-center w-full justify-center md:w-auto md:justify-start">
                <button
                  onClick={handleRefreshView}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                  title="Refresh View"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
                <button
                  onClick={handleOpenNewWindow}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                  title="Open in New Tab"
                >
                  <span className="material-symbols-outlined text-lg">open_in_new</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#f8fafc] flex justify-center relative">
              <div className="w-full h-full bg-white shadow-xl shadow-slate-200/50 border border-slate-100 rounded-xl overflow-hidden flex flex-col relative">
                <ViewPanel
                  selectedQnum={selectedQnum}
                  viewMode={viewMode}
                  surveyURL={surveyURL}
                  refreshKey={viewTimestamp}
                  onOpenNewWindow={handleOpenNewWindow}
                />
                {userLevel === 2 && selectedQnum && (
                  <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedQnum);
                        alert('복사되었습니다');
                      }}
                      className="w-10 h-10 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-lg shadow-lg hover:bg-red-800 transition-colors shrink-0"
                      title="qnum 복사"
                    >
                      Q
                    </button>
                    <span className="text-[10px] text-slate-400">문항 정보 복사하여 제작자에게 전달</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {userLevel !== 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-[500px] lg:min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {selectedQnum || "Source"}
                </span>
                {isDetailLoading && (
                  <span className="text-[10px] font-semibold text-red-700 animate-pulse">
                    Loading detail...
                  </span>
                )}
              </div>
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveTab('qm')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-tight transition-colors ${activeTab === 'qm' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Q-M
                </button>
                <button
                  onClick={() => setActiveTab('perl')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-tight transition-colors ${activeTab === 'perl' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Perl
                </button>

              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-mono text-[13px] leading-6 bg-white">
              {selectedQnum ? (
                <CodePanel
                    data={fullQuestionData}
                    userLevel={userLevel}
                    selectedQnum={selectedQnum}
                    activeTab={activeTab} // Lifted State
                    engine={engine}       // Lifted State
                    setEngine={setEngine} // Lifted State
                    isLoading={isDetailLoading}
                  />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  왼쪽에서 문항을 선택하면 코드가 표시됩니다.
                </div>
              )}
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider shrink-0">
              <button
                onClick={handleCopyCode}
                className="hover:text-red-700 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
              </button>
              <span className="text-slate-500 ml-auto">
                {(fullQuestionData?.regUserId ?? fullQuestionData?.RegUserId ?? '-')}
              </span>
            </div>
          </div>
          )}
        </div >
        <footer className="flex items-center justify-between py-1 text-[10px] text-slate-300 uppercase tracking-widest font-bold shrink-0">
          <div>© Hankook Research. All rights reserved. | Website Manager: Solution Division 2 (esha / jychoi)</div>
        </footer>
      </main>
      </div>
      {isChatbotEnabled() ? <FloatingChatbot /> : null}
    </div>
  );
}

export default App;
