import React, { useState, useEffect, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import ViewPanel from './components/ViewPanel';
const CodePanelLazy = React.lazy(() => import('./components/CodePanel'));
import { getQuestionsSummary, getQuestionTypes, getQuestionDetail } from './api';

function App() {
  const [selectedQnum, setSelectedQnum] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const qnumFromUrl = params.get('qnum');
    if (qnumFromUrl) return qnumFromUrl;
    return sessionStorage.getItem('selectedQnum') || null;
  });
  const [fullQuestionData, setFullQuestionData] = useState(null);
  const [userLevel, setUserLevel] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('usercode');
    if (codeFromUrl) return parseInt(codeFromUrl, 10);
    const stored = sessionStorage.getItem('userLevel');
    return stored ? parseInt(stored, 10) : 1;
  });
  const [dbData, setDbData] = useState({});
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('usercode');
    const qnumFromUrl = params.get('qnum');

    if (codeFromUrl) {
      const level = parseInt(codeFromUrl, 10);
      sessionStorage.setItem('userLevel', level);
      setUserLevel(level);
    } else {
      const storedLevel = sessionStorage.getItem('userLevel');
      if (storedLevel && !codeFromUrl) {
        params.set('usercode', storedLevel);
      }
    }

    if (qnumFromUrl) {
      sessionStorage.setItem('selectedQnum', qnumFromUrl);
      setSelectedQnum(qnumFromUrl);
    } else {
      const storedQnum = sessionStorage.getItem('selectedQnum');
      if (storedQnum) {
         params.set('qnum', storedQnum);
      }
    }

    const newSearch = params.toString();
    const currentPath = window.location.pathname;

    const newUrl = currentPath + (newSearch ? '?' + newSearch : '') + window.location.hash;
    
    // Replace state with the reconstructed URL so F5 / hard reload will maintain the state.
    if (window.location.search !== (newSearch ? `?${newSearch}` : '')) {
        window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // userLevel 변경 시 세션 스토리지 업데이트
  const changeUserLevel = (level) => {
    setUserLevel(level);
    sessionStorage.setItem('userLevel', level);
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
        const [types, all] = await Promise.all([getQuestionTypes(), getQuestionsSummary()]);
        if (cancelled) return;

        const order = ['sample', 'single', 'multi', 'open'];
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
      } catch (e) { console.error(e); }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

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

    // Update Session Storage
    sessionStorage.setItem('selectedQnum', qnum);

    // Update URL to include qnum so F5 refresh retains it
    const params = new URLSearchParams(window.location.search);
    params.set('qnum', qnum);
    const newUrl = window.location.pathname + '?' + params.toString();
    window.history.pushState({}, '', newUrl);
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

  const koreanNames = {
    'sample': '표준화', 'single': '단수', 'multi': '복수', 'open': '오픈',
    'grid': '척도', 'scale': '단일척도', 'popupmenu': '팝업메뉴',
    'media': '미디어', 'sum': '합계', 'search': '검색',
  };

  const getCategoryLabel = (cat) => {
    if (!cat) return 'Category';
    const lower = cat.toLowerCase();
    return koreanNames[lower] || cat;
  };

  // View Panel Control Logic
  const [viewTimestamp, setViewTimestamp] = useState(Date.now());

  const surveyURL = React.useMemo(() => {
    if (!selectedQnum) return '';
    return `https://rpssurvey.hrcglobal.com/?qn=HRClib&qnum=${selectedQnum}${userLevel === 1 ? '&test=1' : ''}&_t=${viewTimestamp}`;
  }, [selectedQnum, userLevel, viewTimestamp]);

  const handleRefreshView = () => {
    setViewTimestamp(Date.now());
  };

  const handleOpenNewWindow = () => {
    if (surveyURL) {
      window.open(surveyURL, '_blank');
    }
  };

  const handleReset = () => {
    setSelectedQnum(null);
    sessionStorage.removeItem('selectedQnum');
    setFullQuestionData(null);
    setSelectedCategory('');
    setSearchTerm('');
    setActiveTab('qm');
    setEngine('question');

    // Reset URL to base path but keep usercode without reloading
    const params = new URLSearchParams(window.location.search);
    params.delete('qnum');
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.pushState({}, '', newUrl);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#fcfcfc] font-sans text-slate-800">

      {/* SIDEBAR */}
      <aside className={`
          border-r border-slate-200 flex flex-col h-screen bg-white shrink-0 z-50 transition-all duration-300 ease-in-out relative group overflow-hidden
          ${isSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-none'}
      `}>
        <div className="px-6 py-6 flex items-center justify-between">
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
        <div className="px-6 mb-2">
          <div className="relative group/search">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within/search:text-red-700 transition-colors">search</span>
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-700/10 focus:border-red-700 transition-all text-sm placeholder:text-slate-400"
              placeholder="Find Question..."
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
        <div className="lg:flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:overflow-hidden shrink-0 h-auto lg:h-full">
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
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#f8fafc] flex justify-center">
              <div className="w-full h-full bg-white shadow-xl shadow-slate-200/50 border border-slate-100 rounded-xl overflow-hidden flex flex-col">
                <ViewPanel
                  selectedQnum={selectedQnum}
                  userLevel={userLevel}
                  viewMode={viewMode}
                  surveyURL={surveyURL} // Pass pre-calculated URL
                  refreshKey={viewTimestamp} // Force re-render if needed
                />
              </div>
            </div>
          </div>
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
                <Suspense fallback={
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    코드 패널 로딩 중...
                  </div>
                }>
                  <CodePanelLazy
                    data={fullQuestionData}
                    userLevel={userLevel}
                    selectedQnum={selectedQnum}
                    activeTab={activeTab} // Lifted State
                    engine={engine}       // Lifted State
                    setEngine={setEngine} // Lifted State
                    isLoading={isDetailLoading}
                  />
                </Suspense>
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
            </div>
          </div>
        </div >
        <footer className="flex items-center justify-between py-1 text-[10px] text-slate-300 uppercase tracking-widest font-bold shrink-0">
          <div>© Hankook Research. All rights reserved. | Website Manager: Solution Division 2 (esha@hrc.co.kr / jychoi@hrc.co.kr)</div>
        </footer>
      </main >
    </div >
  );
}

export default App;
