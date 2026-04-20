/**
 * Address 트리 데이터는 `useAddressLibrary` → 목/API(`addressLibrary.mock.js` 등)에서 로드.
 * 이 파일은 도메인 id·라벨 참고용(레거시 import 방지).
 */
/** 사이드바에 노출되는 Address 하위 id (시도/시군구/읍면동은 코드 다운로드 UI 안에서만 선택) */
export const ADDRESS_SUB_IDS = ['haengjeong', 'beobjeong', 'address_other'];
