export const koreanNames = {
    'address': 'Address',
    'sample': '표준화', 'single': '단수', 'multi': '복수', 'open': '오픈',
    'grid': '척도', 'scale': '단일척도', 'popupmenu': '팝업메뉴',
    'media': '미디어', 'sum': '합계', 'search': '검색', 'QC' : '검증',
};

export const getCategoryLabel = (cat, fallback = '') => {
    if (!cat) return fallback;
    const lower = String(cat).toLowerCase();
    return koreanNames[lower] ?? koreanNames[cat] ?? cat;
};
