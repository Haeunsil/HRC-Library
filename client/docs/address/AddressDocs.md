# HRC Library — 주소(Address) 기능 설명

라이브러리 앱에서 **시·도 / 시·군·구 / 읍·면·동** 등 주소 관련 샘플 문항을 모아 보는 사이드바 블록, **행정동·법정동 코드 파일** 다운로드, 그리고 서버의 **공공데이터 기반 구역 코드 API**까지 한 흐름으로 정리한 문서입니다.

---

## 1. 무엇을 위한 기능인가

- **사이드바 Address 섹션**: 주소 입력·팝업 유형 문항을 카테고리별로 묶어 보여 줍니다. 데이터는 서버가 내려주는 JSON이며, API 실패 시 클라이언트 **목(mock) 데이터**로 동작합니다.
- **코드 파일 다운로드**: 행정동·법정동 **전체 코드 목록 TXT**(또는 운영에서 지정한 파일/URL 내용)를 브라우저로 내려받습니다. 메인 DB의 Sample 목록과는 별도입니다.
- **구역 코드 조회·테스트**: 행정안전부·통계청(SGIS) API를 감싼 **실시간 조회**와, SQLite 스냅샷 기반 **시점 조회·배치**가 서버에 있습니다. UI에서는 일부 **code|label 테스트 TXT** 생성 버튼으로 노출됩니다.

법정동·행정동 **공공 API 상세**와 REST 경로 예시는 서버 모듈 문서를 참고하세요.

- `server/public_district_codes/README.md`
- 운영·배치·캐시: `server/docs/district_codes_operations.md`

**행정구역(법정동) 10자리 숫자 코드**를 시도·시군구·읍면동·리로 나누는 규칙(행정안전부 행정표준코드 체계)과 클라이언트 분해 함수는 아래 문서를 참고하세요.

- [admin-district-code-10.md](./admin-district-code-10.md) — 자리 의미, 예외, `parseAdminDistrictCode10` 사용법, **CodeBook 표·엑셀 컬럼**, 코드·문서 동기화 체크리스트(§6–7)
- [codebook-display-code-system.md](./codebook-display-code-system.md) — **raw 유지 + 웹 전용 표시 코드**(시도 1–17 고정, 시군구·읍면동 재매핑, 매핑 테이블·호환성·세종 예외, 샘플)
- [codebook-legal-eup-ri-unified.md](./codebook-legal-eup-ri-unified.md) — 법정동만의 **읍면동+리 통합 표시**(리 단독 코드 없음, 00행 제거 규칙, 서버 구현 위치)

---

## 2. 화면(프런트엔드) 동작

| 구성요소 | 역할 |
|----------|------|
| `useAddressLibrary` (`client/src/hooks/useAddressLibrary.js`) | `GET /api/address/library` 호출. 실패 시 `addressLibrary.mock.js` 구조로 폴백. |
| `AddressBlock` (`client/src/components/AddressBlock.jsx`) | Address 섹션 UI. 서브카테고리 펼침, 검색 필터, 코드 다운로드·매핑 테스트 버튼. |
| `addressMenu.js` | 서브카테고리 id 참고용 (`sido`, `sigungu`, `eupmyeondong`, `haengjeong`, `beobjeong`, `address_other`). |

**문항 나열 순서**: Sample 중 태그에 `[주소]`가 있는 문항을 앞에 두고, 그다음에 라이브러리 JSON의 `items`를 이어 붙입니다(동일 `qnum`은 한 번만).

**로컬 개발**: Vite 프록시로 `/api`가 백엔드로 가지만, 실패 시 `VITE_BACKEND_URL`이 있으면 그 주소(기본 `http://127.0.0.1:8000`)로 직접 요청을 한 번 더 시도합니다 (`api.js`의 `_devBackendBase`).

**배포(IIS)**: `api_proxy.aspx`를 통해 동일 경로로 프록시됩니다. 코드 파일·매핑 테스트는 blob 응답으로 받아 브라우저 다운로드를 트리거합니다.

---

## 3. 서버 API 요약

### 3.1 Address 라이브러리·코드·동기화

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/address/library` | 사이드바용 JSON. `server/address_library_cache.json`이 있으면 검증 후 반환, 없으면 서버 내장 기본 구조. |
| GET | `/api/address/code/haengjeong` | 행정동 코드 파일(또는 스텁 안내). |
| GET | `/api/address/code/beobjeong` | 법정동 코드 파일(또는 스텁 안내). |
| POST | `/api/address/sync` | `ADDRESS_SYNC_URL`에서 JSON을 받아 캐시 갱신. 헤더 `X-Sync-Secret`이 `ADDRESS_SYNC_SECRET`과 일치할 때만 허용. 비밀번호 미설정 시 503. |

라이브러리 JSON 스키마 요약:

- 루트: `title`, `subcategories[]`
- 각 서브카테고리: `id`, `label`, `icon`, `items[]`, 선택 `downloadKind` (`haengjeong` | `beobjeong` → UI에 코드 다운로드 버튼)
- 각 `items[]` 항목: 최소 `qnum`, 그 외 `questionTag`, `questionType` 등

검증 로직: `server/address_library_service.py`의 `validate_address_library`.

### 3.2 구역 코드(districts) — 실시간·스냅샷·테스트

프리픽스는 공통으로 `/api/districts` 입니다.

- **실시간(외부 API)**: 예) `GET /api/districts/legal-dong`, `GET /api/districts/admin-dong`, `GET /api/districts/suggest-mapping` — 쿼리는 `sido`, `sigungu`, `eupmyeondong` 등 (`README.md` 표 참고).
- **스냅샷(SQLite)**: 예) `GET /api/districts/snapshot/legal-dong`, `.../admin-dong`, 시점 `as_of`, 이력 `.../legal-dong/{legal_code}/history`, 월 배치 `POST .../snapshot/batch/monthly` + `X-District-Batch-Secret`.
- **프런트 테스트용 TXT**: `GET /api/districts/test-mapping/beopjeongdong` / `haengjeongdong` — 실시간 조회 결과를 code|label 형태로 최대 50건까지 내려주며, `api.js`의 `downloadDistrictCodeLabelMappingTest`가 호출합니다.

---

## 4. 환경 변수(.env) 정리

### Address 라이브러리·코드 파일

| 변수 | 용도 |
|------|------|
| `ADDRESS_SYNC_URL` | 동기화 시 GET으로 받을 라이브러리 JSON URL. 없으면 기본 구조만 캐시에 씀. |
| `ADDRESS_SYNC_SECRET` | `POST /api/address/sync` 헤더 `X-Sync-Secret`과 비교. |
| `ADDRESS_SYNC_TIMEOUT` | 동기화 GET 타임아웃(초), 기본 120. |
| `ADDRESS_HAENGJEONG_CODE_PATH` / `ADDRESS_HAENGJEONG_CODE_URL` | 행정동 코드 파일(로컬 경로 우선, 없으면 URL). |
| `ADDRESS_BEOBJEONG_CODE_PATH` / `ADDRESS_BEOBJEONG_CODE_URL` | 법정동 코드 파일. |
| `ADDRESS_CODE_FETCH_TIMEOUT` | 코드 URL fetch 타임아웃(초), 기본 120. |

### 구역 API(실시간)

| 변수 | 용도 |
|------|------|
| `DATA_GO_KR_SERVICE_KEY` | 행정안전부 법정동 API |
| `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | SGIS 행정동 |
| `SGIS_API_BASE` | 선택, 기본 `https://sgisapi.mods.go.kr` |

### 스냅샷·배치

`DISTRICT_CODES_SQLITE_PATH`, `DISTRICT_BATCH_SECRET`, `LEGAL_BATCH_MAX_PAGES`, `SGIS_BATCH_SLEEP_SEC`, `DISTRICT_CACHE_REDIS_URL` 등 — 상세는 `server/docs/district_codes_operations.md`.

---

## 5. 운영·자동화 팁

- **캐시만 주기적으로 갱신**: 작업 스케줄러에서  
  `cd server` 후 `python scripts/sync_address_library.py`  
  (`ADDRESS_SYNC_URL`이 있으면 원격 JSON으로 `address_library_cache.json` 갱신, 없으면 기본 구조로 파일 생성.)
- **동기화 API**: 배포 서버에서 CI나 관리 스크립트가 `POST /api/address/sync` + `X-Sync-Secret`으로 호출할 수 있습니다.
- **코드 TXT**: 대용량 공공 파일은 서버 디스크에 두고 `*_CODE_PATH`로 연결하거나, 내부 정적 URL을 `*_CODE_URL`에 두는 방식이 안정적입니다.

---

## 6. 관련 소스 파일

| 영역 | 경로 |
|------|------|
| 라이브러리 로드·동기화 | `server/address_library_service.py` |
| 코드 파일 스트리밍 | `server/address_code_download.py` |
| 라우트 등록 | `server/main.py` (`/api/address/*`, 라우터 include) |
| 동기화 CLI | `server/scripts/sync_address_library.py` |
| 클라 API | `client/src/api.js` (`getAddressLibrary`, `downloadAddressDistrictCode`, `downloadDistrictCodeLabelMappingTest`) |
| 목 데이터 | `client/src/data/addressLibrary.mock.js` |
| 법정동형 10자리 분해 유틸 | `client/src/utils/parseAdminDistrictCode10.js` — 설명은 [admin-district-code-10.md](./admin-district-code-10.md) |
| 주소 CodeBook 표(행정·법정) | `client/src/components/AddressCodebookSection.jsx` — 구간코드 열·엑셀·필터; 변경 시 위 문서 §6–7·`server/docs/codebook-odcloud-snapshot-architecture.md` |

---

## 7. 자주 묻는 구분

- **`/api/address/*`**: 사이드바 메뉴 구조 + 사용자가 내려받는 **정적 코드 파일** 관리. DB 문항 목록과는 별도 계층입니다.
- **`/api/districts/*`**: **당장 조회·검증**용 공공 API 래퍼와 스냅샷·배치. 주소 문자열로 법정/행정 코드를 찾거나 운영 적재를 할 때 사용합니다.

이 문서는 구현 기준으로 작성되었으며, 배포 URL·방화벽·IIS rewrite 규칙은 `client/IIS_URL_REWRITE_설정.md` 등 배포 문서와 함께 보시면 됩니다.
