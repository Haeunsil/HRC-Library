/** questionTag에서 [내용] 형태를 태그 배열로 분리 (나머지 문자열은 plain) */
export function parseBracketTags(raw) {
    if (!raw || typeof raw !== 'string') return { tags: [], plain: '' };
    const tags = [];
    const re = /\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        const t = m[1].trim();
        if (t) tags.push(t);
    }
    const plain = raw.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    return { tags, plain };
}

/** questionTag의 [대괄호] 태그 중 정확히 일치하는 항목이 있는지 (예: '주소' → [주소]) */
export function hasBracketTag(raw, tagText) {
    if (!tagText) return false;
    return parseBracketTags(raw || '').tags.includes(String(tagText).trim());
}

/** 제목이 q12010·qc1처럼 문항 번호만 있는 경우 */
export function isBareQnumTitle(s) {
    return /^(q|qc)\d+$/i.test(String(s || '').trim());
}
