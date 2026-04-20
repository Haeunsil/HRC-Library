import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FloatingChatbot from './components/FloatingChatbot';
import ViewPanel from './components/ViewPanel';
import CodePanel from './components/CodePanel';
import AddressCodeDownloadPanel from './components/AddressCodeDownloadPanel';
import AddressSidoCustomDownloadPanel from './components/AddressSidoCustomDownloadPanel';
import AddressCodebookSection from './components/AddressCodebookSection';
import SampleScriptViewerPanel from './components/SampleScriptViewerPanel';
import { getInitData, getQuestionDetail, searchQuestions } from './api';
import { getCategoryLabel } from './data/koreanNames';
import { safeStorage } from './utils/safeStorage';
import { formatQnumDisplay } from './utils/qnumDisplay';

// 표시용 URL: 파라미터만 숨김. /dist/는 유지 (webdemotest에서 /HRClib/는 다른 앱 → 새로고침 시 /HRClib/dist/ 필요)
const getCleanDisplayUrl = () => {
  let path = window.location.pathname || '/';
  if (!path.endsWith('/')) path += '/';
  return path + (window.location.hash || '');
};

const isLocal = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/**
 * Vite 빌드 타임 플래그. 미설정 시 기본은 활성(true).
 * 비활성 값(대소문자 무시): 0, false, no, off
 */
const isViteFeatureOn = (key, defaultWhenUnset = true) => {
  const v = String(import.meta.env[key] ?? (defaultWhenUnset ? 'true' : 'false'))
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(v);
};

/** VITE_ENABLE_CHATBOT — off 시 아이콘만·곧 공개 예정 패널 */
const isChatbotEnabled = () => isViteFeatureOn('VITE_ENABLE_CHATBOT');

/** VITE_ENABLE_ADDRESS — off 시 사이드바 Address 메뉴 숨김 (챗봇과 독립) */
const isAddressMenuEnabled = () => isViteFeatureOn('VITE_ENABLE_ADDRESS');

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
  /** 사이드바「주소 코드 받기」→ 메인 전체 패널 */
  const [addressCodeDownloadMainOpen, setAddressCodeDownloadMainOpen] = useState(false);
  /** 시도 순서 Custom — 기존 코드 다운로드와 별도 전체 패널 */
  const [addressCodeDownloadCustomMainOpen, setAddressCodeDownloadCustomMainOpen] = useState(false);
  /** Custom 패널 CodeBook 구분 — 행정동 메뉴: admin, 법정동 메뉴: legal */
  const [addressCodeDownloadCustomKind, setAddressCodeDownloadCustomKind] = useState(/** @type {'admin' | 'legal' | null} */ (null));
  /** null: 행정/법정 둘 다 선택 가능 · 'admin'|'legal': 해당 카테고리만 */
  const [addressDownloadKind, setAddressDownloadKind] = useState(null);
  /** 행정동·법정동 하위「CodeBook」→ 메인 전용 패널 */
  const [addressCodebookMainOpen, setAddressCodebookMainOpen] = useState(false);
  const [addressCodebookKind, setAddressCodebookKind] = useState(null);
  /** Address 하위 탭 id (문항 클릭 시). address_other 만 Preview·Source 표시 */
  const [selectedAddressSub, setSelectedAddressSub] = useState(null);
  /** 사이드바 Sample 카테고리「Script 확인」→ 메인 전체 패널 (library-script.txt 1파일) */
  const [sampleScriptViewerOpen, setSampleScriptViewerOpen] = useState(false);

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
  const [activeTab, setActiveTab] = useState('qm'); // 'qm' | 'perl'
  const [engine, setEngine] = useState('question'); // 'question' or 'condition' (for Perl)

  const [searchTerm, setSearchTerm] = useState('');
  /** 검색어 2글자 이상: 서버에서 태그·작성자·코드(QM/Perl) 매칭 qnum 집합 */
  const [searchHitQnums, setSearchHitQnums] = useState(() => new Set());

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

  useEffect(() => {
    const t = (searchTerm || '').trim();
    if (t.length < 2) {
      setSearchHitQnums(new Set());
      return;
    }
    setSearchHitQnums(new Set());
    let cancelled = false;
    const timer = setTimeout(async () => {
      const rows = await searchQuestions(t);
      if (!cancelled && Array.isArray(rows)) {
        setSearchHitQnums(new Set(rows.map((r) => r.qnum)));
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // 검색 중에는 전체 Script 확인 패널 닫기 (사이드바 버튼도 숨김과 동일 동작)
  useEffect(() => {
    if ((searchTerm || '').trim()) setSampleScriptViewerOpen(false);
  }, [searchTerm]);

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
    setSampleScriptViewerOpen(false);
    const qnum = partial.qnum || partial.value;
    setSelectedQnum(qnum);
    const data = dbData[qnum] || partial;
    setFullQuestionData(data);

    if (partial.addressSub != null && partial.addressSub !== undefined) {
      setSelectedAddressSub(partial.addressSub);
    } else {
      setSelectedAddressSub(null);
    }
    if (qnum) {
      setAddressCodeDownloadMainOpen(false);
      setAddressDownloadKind(null);
      setAddressCodeDownloadCustomMainOpen(false);
      setAddressCodeDownloadCustomKind(null);
      setAddressCodebookMainOpen(false);
      setAddressCodebookKind(null);
    }

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

  const showQuestionPreviewAndSource =
    !addressCodeDownloadMainOpen &&
    !addressCodeDownloadCustomMainOpen &&
    !addressCodebookMainOpen &&
    !sampleScriptViewerOpen &&
    !(selectedAddressSub != null && selectedAddressSub !== 'address_other');

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
              placeholder="태그, 코드, 작성자 내용 검색…"
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
          searchHitQnums={searchHitQnums}
          categories={categories}
          categoryData={categoryData}
          showAddressMenu={isAddressMenuEnabled()}
          onOpenSampleScript={() => {
            setAddressCodeDownloadMainOpen(false);
            setAddressDownloadKind(null);
            setAddressCodeDownloadCustomMainOpen(false);
            setAddressCodeDownloadCustomKind(null);
            setAddressCodebookMainOpen(false);
            setAddressCodebookKind(null);
            setSampleScriptViewerOpen(true);
          }}
          onOpenAddressCodeDownload={(kind) => {
            setSampleScriptViewerOpen(false);
            setAddressCodeDownloadCustomMainOpen(false);
            setAddressCodeDownloadCustomKind(null);
            setAddressCodebookMainOpen(false);
            setAddressCodebookKind(null);
            if (addressCodeDownloadMainOpen) {
              if (kind === 'admin' || kind === 'legal') {
                if (addressDownloadKind === kind) {
                  return;
                }
                setAddressDownloadKind(kind);
                return;
              }
              return;
            }
            setAddressCodeDownloadMainOpen(true);
            setAddressDownloadKind(kind === 'admin' || kind === 'legal' ? kind : null);
          }}
          onOpenAddressCodebook={(kind) => {
            if (addressCodebookMainOpen && addressCodebookKind === kind) return;
            setSampleScriptViewerOpen(false);
            setAddressCodeDownloadMainOpen(false);
            setAddressDownloadKind(null);
            setAddressCodeDownloadCustomMainOpen(false);
            setAddressCodeDownloadCustomKind(null);
            setAddressCodebookMainOpen(true);
            setAddressCodebookKind(kind === 'admin' || kind === 'legal' ? kind : null);
          }}
          onOpenAddressCodeDownloadCustom={(kind) => {
            setSampleScriptViewerOpen(false);
            setAddressCodeDownloadMainOpen(false);
            setAddressDownloadKind(null);
            setAddressCodebookMainOpen(false);
            setAddressCodebookKind(null);
            const k = kind === 'admin' || kind === 'legal' ? kind : 'legal';
            if (addressCodeDownloadCustomMainOpen) {
              if (addressCodeDownloadCustomKind === k) return;
              setAddressCodeDownloadCustomKind(k);
              return;
            }
            setAddressCodeDownloadCustomKind(k);
            setAddressCodeDownloadCustomMainOpen(true);
          }}
          addressCodeDownloadMainOpen={addressCodeDownloadMainOpen}
          addressCodeDownloadCustomMainOpen={addressCodeDownloadCustomMainOpen}
          addressCodeDownloadCustomKind={addressCodeDownloadCustomKind}
          addressDownloadKind={addressDownloadKind}
          addressCodebookMainOpen={addressCodebookMainOpen}
          addressCodebookKind={addressCodebookKind}
        />


      </aside>

      {/* MAIN CONTENT */}
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto bg-[#fcfcfc] p-4 pt-10 md:p-6 lg:overflow-hidden">
        {sampleScriptViewerOpen ? (
          <div className="lg:flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[min(70vh,36rem)]">
            <SampleScriptViewerPanel
              userLevel={userLevel}
              onClose={() => setSampleScriptViewerOpen(false)}
              sidebarCollapsed={!isSidebarOpen}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
          </div>
        ) : addressCodeDownloadCustomMainOpen ? (
          <div className="lg:flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white flex-wrap">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1 px-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                  title="Open Sidebar"
                >
                  <span className="material-symbols-outlined text-lg">menu</span>
                </button>
              )}
              <span className="material-symbols-outlined text-red-700 text-xl shrink-0">tune</span>
              <div className="min-w-0 flex flex-col gap-0.5">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">코드 다운로드 (Custom)</h2>
                <span className="text-[11px] font-semibold text-slate-500">
                  {addressCodeDownloadCustomKind === 'admin' ? '행정동 CodeBook 기준' : '법정동 CodeBook 기준'}
                </span>
              </div>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => {
                  setAddressCodeDownloadCustomMainOpen(false);
                  setAddressCodeDownloadCustomKind(null);
                }}
              >
                <span className="material-symbols-outlined text-base">close</span>
                닫기
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfc] p-2 sm:p-3 md:p-4">
              <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
                <AddressSidoCustomDownloadPanel
                  codebookKind={addressCodeDownloadCustomKind === 'admin' ? 'admin' : 'legal'}
                />
              </div>
            </div>
          </div>
        ) : addressCodeDownloadMainOpen ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white flex-wrap">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1 px-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
                  title="Open Sidebar"
                >
                  <span className="material-symbols-outlined text-lg">menu</span>
                </button>
              )}
              <span className="material-symbols-outlined text-red-700 text-xl shrink-0">download</span>
              <div className="min-w-0 flex flex-col gap-0.5">
                <h2 className="text-sm font-bold tracking-tight text-slate-900">코드 다운로드 (Default)</h2>
                <span className="text-[11px] font-semibold text-slate-500">
                  {addressDownloadKind === 'admin'
                    ? '행정동 CodeBook 기준'
                    : addressDownloadKind === 'legal'
                      ? '법정동 CodeBook 기준'
                      : 'CodeBook 기준'}
                </span>
              </div>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => {
                  setAddressCodeDownloadMainOpen(false);
                  setAddressDownloadKind(null);
                }}
              >
                <span className="material-symbols-outlined text-base">close</span>
                닫기
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfc] p-4 md:p-8">
              <div className="mx-auto flex min-h-0 w-[70%] min-w-0 max-w-full flex-1 flex-col">
                <AddressCodeDownloadPanel variant="main" forcedKind={addressDownloadKind} />
              </div>
            </div>
          </div>
        ) : addressCodebookMainOpen && (addressCodebookKind === 'admin' || addressCodebookKind === 'legal') ? (
          <div className="lg:flex-1 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="rounded-md p-1 px-1.5 text-slate-500 transition-colors hover:bg-slate-100"
                  title="Open Sidebar"
                >
                  <span className="material-symbols-outlined text-lg">menu</span>
                </button>
              )}
              <span className="material-symbols-outlined shrink-0 text-xl text-red-700">menu_book</span>
              <h2 className="min-w-0 text-sm font-bold tracking-tight text-slate-900">
                {addressCodebookKind === 'admin' ? '행정동 CodeBook' : '법정동 CodeBook'}
              </h2>
              <button
                type="button"
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                onClick={() => {
                  setAddressCodebookMainOpen(false);
                  setAddressCodebookKind(null);
                }}
              >
                <span className="material-symbols-outlined text-base">close</span>
                닫기
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfc] p-4 md:p-8">
              <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
                <AddressCodebookSection kind={addressCodebookKind} />
              </div>
            </div>
          </div>
        ) : !showQuestionPreviewAndSource ? (
          <div className="lg:flex-1 flex flex-col items-center justify-center min-h-[min(70vh,36rem)] rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">map</span>
            <p className="text-sm text-slate-600 max-w-md leading-relaxed mb-6">
              Preview·소스는 <strong className="font-semibold text-slate-800">Sample</strong> 또는 Address{' '}
              <strong className="font-semibold text-slate-800">「주소 관련 문항」</strong>에서 문항을 선택할 때 표시됩니다.
              <br />
              주소 행정·법정 코드는 아래 버튼으로 받을 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setAddressCodeDownloadCustomMainOpen(false);
                setAddressCodeDownloadCustomKind(null);
                setAddressCodeDownloadMainOpen(true);
                setAddressDownloadKind(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">download</span>
              주소 코드 받기
            </button>
          </div>
        ) : (
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
                  {selectedQnum ? (
                    <span className="normal-case">{formatQnumDisplay(selectedQnum)}</span>
                  ) : (
                    'Source'
                  )}
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
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-6 font-mono text-[13px] leading-6 bg-white">
              {selectedQnum ? (
                <CodePanel
                  data={fullQuestionData}
                  userLevel={userLevel}
                  selectedQnum={selectedQnum}
                  activeTab={activeTab}
                  engine={engine}
                  setEngine={setEngine}
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
                type="button"
                onClick={handleCopyCode}
                disabled={
                  !fullQuestionData ||
                  (activeTab === 'qm' && !(fullQuestionData?.qmcode)) ||
                  (activeTab === 'perl' &&
                    !(engine === 'condition' ? fullQuestionData?.PerlSourceC : fullQuestionData?.PerlSourceQ))
                }
                className="hover:text-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none disabled:hover:text-slate-400"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
              </button>
              <span className="text-slate-500 ml-auto">
                {(fullQuestionData?.regUserId ?? fullQuestionData?.RegUserId ?? '-')}
              </span>
            </div>
          </div>
          )}
        </div>
        )}
        <footer className="flex items-center justify-between py-1 text-[10px] text-slate-300 uppercase tracking-widest font-bold shrink-0">
          <div>© Hankook Research. All rights reserved. | Website Manager: Solution Division 2 (esha / jychoi)</div>
        </footer>
      </main>
      </div>
      <FloatingChatbot
        comingSoon={!isChatbotEnabled()}
        onNavigateToQnum={(qnum) => {
          handleSelect({ value: qnum });
          setIsSidebarOpen(true);
        }}
      />
    </div>
  );
}

export default App;
