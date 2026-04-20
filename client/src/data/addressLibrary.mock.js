/**
 * Address 라이브러리 목 데이터 (GET /api/address/library 로 교체 가능).
 * @typedef {{ qnum: string, questionTag?: string, questionType?: string, regUserId?: string, meta?: object }} AddressMenuItem
 * @typedef {{ id: string, label: string, icon: string, items: AddressMenuItem[], downloadKind?: 'haengjeong'|'beobjeong' }} AddressSubcategory
 */

/** 시·도·시군구 등 (시도/시군구/3순위 유형) — 메인 Sample과 별도, Address 기타 */
const OTHER_ADDRESS_ITEMS = [
    {
        qnum: 'q5007',
        questionTag: '[팝업메뉴][시도/시군구/세부주소(오픈)][주소]',
        questionType: 'address',
    },
    {
        qnum: 'q5009',
        questionTag: '[팝업메뉴][시도/시군구][3순위][주소]',
        questionType: 'address',
    },
];

/** @type {{ title: string, subcategories: AddressSubcategory[] }} */
export const MOCK_ADDRESS_LIBRARY = {
    title: 'Address',
    subcategories: [
        { id: 'sido', label: '시·도', icon: 'travel_explore', items: [] },
        { id: 'sigungu', label: '시·군·구', icon: 'location_city', items: [] },
        { id: 'eupmyeondong', label: '읍·면·동', icon: 'pin_drop', items: [] },
        {
            id: 'haengjeong',
            label: '행정동',
            icon: 'account_balance',
            downloadKind: 'haengjeong',
            items: [],
        },
        {
            id: 'beobjeong',
            label: '법정동',
            icon: 'gavel',
            downloadKind: 'beobjeong',
            items: [],
        },
        {
            id: 'address_other',
            label: '주소 관련 문항',
            icon: 'map_search',
            items: [...OTHER_ADDRESS_ITEMS],
        },
    ],
};
