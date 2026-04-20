import { useEffect, useState } from 'react';

function normalizeItemArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
}

async function fetchFeedJson(name) {
    const base = import.meta.env.BASE_URL || './';
    const url = `${base}content/${name}.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return normalizeItemArray(await res.json());
}

/** JSON·폴백 동일 행 제거용 (JSON 우선: remote 먼저 넣고, 폴백은 키 없을 때만) */
function feedRowDedupeKey(row) {
    if (!row || typeof row !== 'object') return JSON.stringify(row);
    return [row.date, row.title, row.desc, row.qnum].map((x) => String(x ?? '')).join('\u0000');
}

/**
 * public JSON에는 최근 것만 두고, 과거 달은 번들 폴백에만 있는 경우가 많아 병합한다.
 * 동일 키(날짜·제목·설명·qnum)는 JSON(remote) 쪽이 우선.
 */
function mergeFeedRemoteWithFallback(remote, fallback) {
    const r = Array.isArray(remote) ? remote : [];
    const f = Array.isArray(fallback) ? fallback : [];
    if (!f.length) return r;
    const seen = new Set();
    const out = [];
    for (const row of r) {
        seen.add(feedRowDedupeKey(row));
        out.push(row);
    }
    for (const row of f) {
        const k = feedRowDedupeKey(row);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(row);
    }
    out.sort((a, b) => String(b?.date ?? '').localeCompare(String(a?.date ?? '')));
    return out;
}

/**
 * 공지·Sample Update: public/content/*.json 우선 + src/data 폴백 병행(과거 달 보강).
 * fetch 실패 시에는 폴백만 사용.
 */
export function useSidebarFeed() {
    const [noticeItems, setNoticeItems] = useState([]);
    const [sampleUpdateItems, setSampleUpdateItems] = useState([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [n, s, nMod, sMod] = await Promise.all([
                    fetchFeedJson('notice-items'),
                    fetchFeedJson('sample-update-items'),
                    import('../data/noticeItems'),
                    import('../data/sampleUpdateItems'),
                ]);
                if (!cancelled) {
                    setNoticeItems(mergeFeedRemoteWithFallback(n, nMod.noticeItems || []));
                    setSampleUpdateItems(mergeFeedRemoteWithFallback(s, sMod.sampleUpdateItems || []));
                }
            } catch {
                try {
                    const [nMod, sMod] = await Promise.all([
                        import('../data/noticeItems'),
                        import('../data/sampleUpdateItems'),
                    ]);
                    if (!cancelled) {
                        setNoticeItems(nMod.noticeItems || []);
                        setSampleUpdateItems(sMod.sampleUpdateItems || []);
                    }
                } catch {
                    if (!cancelled) {
                        setNoticeItems([]);
                        setSampleUpdateItems([]);
                    }
                }
            } finally {
                if (!cancelled) setReady(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return { noticeItems, sampleUpdateItems, ready };
}
