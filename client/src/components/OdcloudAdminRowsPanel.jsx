import React, { useEffect, useState } from 'react';
import { fetchOdCloudAdminRows } from '../api';

/** 행정기관 odcloud UDDI 샘플 목록 (서버가 serviceKey 처리). 부모에서 마운트 시에만 조회 */
export default function OdcloudAdminRowsPanel() {
    const [state, setState] = useState({ status: 'idle', payload: null, message: '' });

    useEffect(() => {
        let cancelled = false;
        setState({ status: 'loading', payload: null, message: '' });
        (async () => {
            try {
                const data = await fetchOdCloudAdminRows({ page: 1, perPage: 200 });
                if (!cancelled) setState({ status: 'ok', payload: data, message: '' });
            } catch (e) {
                const msg = e?.message ? String(e.message) : '불러오기에 실패했습니다.';
                if (!cancelled) setState({ status: 'error', payload: null, message: msg });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.status === 'loading') {
        return (
            <div className="px-1 py-2 text-sm text-slate-500 flex items-center gap-2" aria-busy="true">
                <span className="material-symbols-outlined text-[22px] animate-spin">progress_activity</span>
                행정기관 데이터 불러오는 중…
            </div>
        );
    }
    if (state.status === 'error') {
        return (
            <div className="px-2 py-2 rounded-md bg-amber-50/90 text-sm text-amber-900 ring-1 ring-amber-100 leading-snug">
                <p className="m-0 font-medium text-amber-950">공공데이터(행정기관)를 불러오지 못했습니다.</p>
                <p className="mt-1 m-0 text-amber-900/95">
                    키가 비어 있지 않아도, 공공데이터포털에서{' '}
                    <strong className="font-semibold">이 API(서비스 15097972·odcloud UDDI) 활용신청·승인</strong>이 되어
                    있어야 합니다. 서버 <code className="text-xs bg-white/70 px-0.5 rounded">DATA_GO_KR_SERVICE_KEY</code>
                    또는 <code className="text-xs bg-white/70 px-0.5 rounded">ODCLOUD_SERVICE_KEY</code> 를 확인한 뒤
                    서버를 재시작하세요.
                </p>
                <div className="mt-1.5 text-amber-800/90 break-words border-t border-amber-200/60 pt-1.5">
                    {state.message}
                </div>
            </div>
        );
    }

    const items = Array.isArray(state.payload?.items) ? state.payload.items : [];
    if (items.length === 0) {
        return <div className="px-2 py-2 text-sm text-slate-500">조회된 행정기관 행이 없습니다.</div>;
    }

    return (
        <>
            <p className="px-1 mb-1.5 text-sm font-bold uppercase tracking-wider text-slate-400">행정기관 (공공데이터)</p>
            <ul className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                {items.map((row, idx) => {
                    const path = [row.시도명, row.시군구명, row.읍면동명].filter(Boolean).join(' ') || '(이름 없음)';
                    const code = row.행정기관코드;
                    const ym = row.기준연월;
                    return (
                        <li
                            key={code != null ? String(code) : `odc-${idx}`}
                            className="px-3 py-2 rounded-md bg-slate-50/90 text-sm text-slate-700 leading-snug ring-1 ring-slate-100/80"
                        >
                            <div className="font-medium text-slate-800">{path}</div>
                            <div className="text-slate-500 tabular-nums mt-0.5">
                                코드 {code ?? '-'}
                                {ym != null && ym !== '' ? ` · 기준 ${ym}` : ''}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
