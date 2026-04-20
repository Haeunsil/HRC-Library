/**
 * 행정구역(법정동) 10자리 숫자 코드 분해 — 통계·행정표준코드 체계
 *
 * ## 행정안전부 행정표준코드(법정동코드) 10자리 구조
 * - 관리: 행정안전부 **행정표준코드관리시스템** (https://www.code.go.kr) 등에서 정의·배포
 * - 10자리 = **시도(2)** + **시군구(3)** + **읍면동(3)** + **리(2)**
 * - 도심의 **동** 단위에서는 리가 없는 경우가 많아 **마지막 2자리가 `00`**인 경우가 흔함
 *
 * ## 예시 (사용자 제공)
 * - `1111051500` → 11 | 110 | 515 | 00 → 서울(11) + 종로구(110) + 청운효자동(515) + 리없음(00)
 * - `1111053000` → 11 | 110 | 530 | 00 → … 사직동
 *
 * ## 항상 동일한가 / 예외
 * - **이 10자리 패턴 자체**는 법정동·통계용 행정구역코드에 대해 공식적으로 고정된 규칙이다.
 * - 다만 **데이터 소스**가 “법정동 10자리”가 아니라 다른 내부코드(7자리 등)를 쓰면 이 함수를 쓰면 안 된다.
 * - **행정기관코드**(행정동 단위)가 법정동코드와 **항상 동일하지는 않을 수 있다**(행정동 통·폐합, 1:N 매핑). odcloud 등에서 10자리가 법정동과 동일 체계로 내려오는지 스키마·메타를 확인할 것.
 * - **폐지·통합** 시 코드가 바뀌거나 막단 자리가 `00`이 아닌 리 단위로 내려가는 등 **값은 변동**한다(자리 의미는 동일).
 *
 * @module parseAdminDistrictCode10
 * @see client/docs/address/admin-district-code-10.md — 규칙·예외·CodeBook 표(§6)·동기화 체크리스트(§7)
 */

export const ADMIN_DISTRICT_CODE_LENGTH = 10;

/**
 * 10자리 행정구역(법정동형) 코드를 시도·시군구·읍면동·리 단위로 분리한다.
 *
 * @param {string | number} code - 숫자 10자리(앞 0 유지 문자열 권장)
 * @param {{ strict?: boolean }} [options] - `strict: true`이면 정확히 10자리 숫자만 허용
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   raw: string,
 *   sidoCode2: string,
 *   sigunguCode3: string,
 *   sigunguCode5: string,
 *   eupmyeondongCode3: string,
 *   eupmyeondongCode8: string,
 *   riCode2: string,
 * }}
 */
export function parseAdminDistrictCode10(code, options = {}) {
    const strict = options.strict === true;
    const raw = String(code ?? '').trim().replace(/\s/g, '');
    const digits = raw.replace(/\D/g, '');

    if (digits.length === 0) {
        return { ok: false, error: 'empty', raw: '', ...emptyParts() };
    }
    if (strict && !/^\d{10}$/.test(raw)) {
        return { ok: false, error: 'strict_requires_exact_10_digit_string', raw: digits, ...emptyParts() };
    }
    if (digits.length > ADMIN_DISTRICT_CODE_LENGTH) {
        return { ok: false, error: 'too_many_digits', raw: digits, ...emptyParts() };
    }
    const normalized = digits.padStart(ADMIN_DISTRICT_CODE_LENGTH, '0');
    if (normalized.length !== ADMIN_DISTRICT_CODE_LENGTH) {
        return { ok: false, error: 'invalid_length', raw: normalized, ...emptyParts() };
    }

    const sidoCode2 = normalized.slice(0, 2);
    const sigunguCode3 = normalized.slice(2, 5);
    const eupmyeondongCode3 = normalized.slice(5, 8);
    const riCode2 = normalized.slice(8, 10);
    const sigunguCode5 = normalized.slice(0, 5);
    const eupmyeondongCode8 = normalized.slice(0, 8);

    return {
        ok: true,
        raw: normalized,
        sidoCode2,
        sigunguCode3,
        sigunguCode5,
        eupmyeondongCode3,
        eupmyeondongCode8,
        riCode2,
    };
}

function emptyParts() {
    return {
        sidoCode2: '',
        sigunguCode3: '',
        sigunguCode5: '',
        eupmyeondongCode3: '',
        eupmyeondongCode8: '',
        riCode2: '',
    };
}
