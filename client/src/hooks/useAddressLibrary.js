import { useCallback, useEffect, useState } from 'react';
import { MOCK_ADDRESS_LIBRARY } from '../data/addressLibrary.mock';
import { getAddressLibrary } from '../api';

/**
 * Address 사이드바 목록: GET /api/address/library, 실패 시 목(mock) 폴백.
 * @param {boolean} enabled — false면 요청 없음
 */
export function useAddressLibrary(enabled = true) {
    const [state, setState] = useState(() =>
        enabled
            ? { status: 'loading', data: null, error: null }
            : { status: 'idle', data: null, error: null },
    );

    const load = useCallback(async () => {
        if (!enabled) return;
        setState({ status: 'loading', data: null, error: null });
        try {
            const data = await getAddressLibrary();
            setState({ status: 'success', data, error: null });
        } catch (e) {
            const msg = e?.message ? String(e.message) : '';
            console.warn('[useAddressLibrary] API 실패, 목 데이터 사용:', msg);
            setState({
                status: 'success',
                data: MOCK_ADDRESS_LIBRARY,
                error: null,
            });
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setState({ status: 'idle', data: null, error: null });
            return;
        }
        load();
    }, [enabled, load]);

    const refetch = useCallback(() => {
        load();
    }, [load]);

    return { ...state, refetch };
}
