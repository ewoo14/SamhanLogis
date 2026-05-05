# Phase 1 — Apps Script 분석: partner-order (거래처 주문서 Web App)

> 원본
> - `migration/source/scripts/partner-order/Code.js` (3303 lines)
> - `migration/source/scripts/partner-order/index.html` (9427 lines, 단일 SPA)
> - `appsscript.json` — timezone Asia/Seoul, V8, **webapp.access=ANYONE_ANONYMOUS / executeAs=USER_DEPLOYING**, advancedServices: Drive v3 + Gmail v1
> 분석 일자: 2026-05-04
> 원칙: 무손실 / 추측 금지 / 토큰 placeholder 유지 / 시트 검증 (workbook.json)

---

## §1. 함수 inventory (누락 0)

### Code.js — top-level 함수 81개 (라인 정렬)

| # | 함수 | 라인 | private | 카테고리 | 역할 요약 |
|---|---|---|---|---|---|
| 1 | `doGet` | 2 | No | Web App entry | HtmlService 템플릿 빌드 + 시트 데이터 9종 + logo + CONFIG 주입 → `index` 렌더 |
| 2 | `saveOrderSnapshot` | 79 | No | UI→Notion | 주문 입력 임시저장 → NOTION_DB_ID_SNAPSHOT 페이지 생성 (data + image base64 chunked) |
| 3 | `getOrderSnapshotHistory` | 143 | No | UI←Notion | bizNo+date 필터 → SNAPSHOT DB 조회, 페이지네이션 100/회 |
| 4 | `cachePutJSON_` | 231 | Yes | 캐시 | ScriptCache 90KB chunk 저장 (key#count + key#i) |
| 5 | `cacheGetJSON_` | 241 | Yes | 캐시 | chunk 조립 → JSON.parse |
| 6 | `getHomeIncreasePrices_` | 255 | Yes | 시트 | `홈멀티_단가인상` 시트 → {model: price} (TTL 600s) |
| 7 | `getCommIncreasePrices_` | 268 | Yes | 시트 | `상업멀티_단가인상` |
| 8 | `extractSingleIncreasePrices_` | 281 | Yes | 시트 헬퍼 | 헤더 자동탐지 (모델명+납품가) → 마지막 납품가 컬럼 |
| 9 | `getSingleIncreasePrices_` | 306 | Yes | 시트 | `싱글 세트_단가인상` |
| 10 | `getSinglePartsIncreasePrices_` | 319 | Yes | 시트 | `싱글 구성품_단가인상` |
| 11 | `extractIncreasePrices_` | 332 | Yes | 시트 헬퍼 | 헤더 후보 [출고가, LIST, 리스트, 정가, 소비자가] |
| 12 | `getGateImages` | 357 | No | Drive | folderId `1uGjGXP_2X_VJUP4bU2jCOvFrEeU-HGWT` 모든 이미지 → base64 배열 |
| 13 | `getLogoImage` | 385 | No | Drive | folderId `1zHDxAzCFgr6draLkohwNqgQ03ud5KfsN` 첫번째 이미지 |
| 14 | `normalizeSize_` | 428 | Yes | 유틸 | 평형 숫자만 추출 |
| 15 | `findIdx_` | 433 | Yes | 유틸 | 컬럼 헤더 후보 → idx |
| 16 | `parseKRNumber_` | 437 | Yes | 유틸 | 콤마/공백 제거 → Math.round |
| 17 | `parseKRFloat_` | 443 | Yes | 유틸 | 소수 허용 |
| 18 | `toYmd_` | 449 | Yes | 유틸 | yyyyMMdd 변환 |
| 19 | `toMmDd_` | 456 | Yes | 유틸 | MMdd |
| 20 | `normalizeTel_` | 463 | Yes | 유틸 | 010-XXXX-XXXX 정규화 |
| 21 | `todayYMD_` | 470 | Yes | 유틸 | 오늘 yyyyMMdd |
| 22 | `_normSpec_` | 471 | Yes | 유틸 | 공백제거+소문자 |
| 23 | `sanitizeKoreanParen_` | 474 | Yes | 표시명 | 비한글 괄호 제거 |
| 24 | `trimSymbols_` | 482 | Yes | 표시명 | 기호 → 공백 |
| 25 | `sanitizeDisp_` | 485 | Yes | 표시명 | 위 두 함수 합성 |
| 26 | `hpFromText_` | 488 | Yes | 분류 | "5HP/마력" 추출 |
| 27 | `isBlockedByNote_` | 498 | Yes | 분류 | `미판매|단종` 키워드 차단 |
| 28 | `isSoldOutByNote_` | 505 | Yes | 분류 | `품절` 표시 |
| 29 | `unifyCatL_` | 512 | Yes | 분류 | `부자재2` → `부자재` |
| 30 | `classifyHome_` | 515 | Yes | 분류 | 홈멀티 catL/M/S/disp 키워드 룰 (실외기/실내기/판넬/부자재…) |
| 31 | `getHomeMulti` | 605 | No | UI 데이터 | `홈멀티` 시트 → 행 객체 {name, model, price, list, useK2, fixDc, …} |
| 32 | `classifySingleSetLM_` | 687 | Yes | 분류 | 싱글세트 L/M (360/4w/1w/duct/ceiling/stand/wall/house/acc + prestige/premium/…) |
| 33 | `findHeaderIndex_` | 716 | Yes | 헤더 | 공백무시 정확매칭 |
| 34 | `getSingleSets` | 727 | No | UI 데이터 | `싱글 세트` 시트 → matKey D4/D7/D8 추출 + priceLeft/Right |
| 35 | `extractRowsFromFormula_` | 823 | Yes | 수식파싱 | `'싱글 세트'!$X$N` 정규식 행번호 추출 |
| 36 | `getSingleParts` | 833 | No | UI 데이터 | `싱글 구성품` 시트 → 세트모델별 구성품 |
| 37 | `getSingleMatPrices` | 889 | No | UI 데이터 | `싱글 자재가격` (name→price map) |
| 38 | `classifyCommercial_` | 900 | Yes | 분류 | 상업멀티 catL/M/S — 모델 정규식 (AM\d{3}AXV 등) + 키워드 |
| 39 | `getCommercialMulti` | 984 | No | UI 데이터 | `상업멀티` 시트 |
| 40 | `getCommercialParts` | 1076 | No | UI 데이터 | `상업멀티 구성` 시트 |
| 41 | `getSpecMap_` | 1159 | Yes | 사양맵 | 5개 시트 횡단 → {model: spec} (캐시 SPEC_MAP_V4) |
| 42 | `getSpecDetailMap_` | 1211 | Yes | 사양맵 | home/single/comm 별 상세사양 객체 (3 inner: scanHome/scanSingle/scanComm) |
| 43 | `getHomeDefaults` | 1580 | No | UI 기본값 | `홈멀티` A1:X2 → 유연호스 제외/분기관 제외/발통포함/리모컨/판넬변경 |
| 44 | `getSingleDefaults` | 1605 | No | UI 기본값 | `싱글 세트` A1:X2 → 유선리모컨/리모컨 제외/실외기 받침대/판넬변경/360판넬/할인/1WAY할인/자재 포함 여부 |
| 45 | `getCustomers_` | 1633 | Yes | 시트 | `거래처` 시트 → [{code, name, bizno, manager, managerTel, rep, addr, tel, note, group, singleDiscount}] |
| 46 | `searchCustomerByBizOrCode` | 1684 | No | 거래처 검색 | 사업자번호(10자리 숫자) 또는 거래처코드 매칭 |
| 47 | `getManagers_` | 1703 | Yes | 시트 | `담당자` 시트 → {담당자명, 담당자코드} |
| 48 | `searchManagersByName_` | 1736 | Yes | 담당자 | 부분일치 (소문자/공백제거) |
| 49 | `findManagerByNameExact_` | 1744 | Yes | 담당자 | 정확일치 → empCd |
| 50 | `getScriptCreds_` | 1753 | Yes | 이카운트 | ScriptProperties 우선 + 하드코딩 default (COM_CODE 174539, USER_ID 11840720103, API_CERT_KEY 117d…) |
| 51 | `callZoneApi` | 1767 | No | 이카운트 | `POST http://152.69.228.109:3000/proxy/ecount/zone` → ZONE |
| 52 | `getEcountSession` | 1780 | No | 이카운트 | zone+login 후 sessionId 캐시 (3000s) |
| 53 | `decideWarehouseCode_` | 1805 | Yes | 이카운트 | 품목 룰 → `'2'` (특정 모델) or `'00003'` (기본) — 두 개 inner: getOrigName_ / getSection_ |
| 54 | `formatWonDiscountLabel_` | 1848 | Yes | 표시 | -N만M천 라벨 |
| 55 | `formatPercentLabel_` | 1869 | Yes | 표시 | "45%" |
| 56 | `combineRemarks_` | 1876 | Yes | 표시 | 적요 ` / ` 결합 |
| 57 | `getOldProducts_` | 1885 | Yes | 시트 | `구형` 시트 → A:I + F열 수식 `$I$1` 포함 여부 (50% DC 마커) |
| 58 | `sendOrderFromUi` | 1928 | No | **메인 주문 전송** | items+order → 정제 → 이카운트 SaleOrder API + 메일발송 + Notion 저장 + 로그 (453 lines) |
| 59 | `detectHomeOrder` | 2381 | No | 분류 | order/items에서 HOME 여부 (모델 prefix AJ0/AJ1/AM0/AM1) |
| 60 | `buildDefaultDcConfig_` | 2401 | Yes | DC | 전역 상수 → DC config 객체 |
| 61 | `fetchNotionDcConfig_` | 2418 | Yes | Notion DC | NOTION_DB_ID 거래처별 DC 조회 (data_sources 2025-09-03 분기 + 2022-06-28 폴백) — `홈멀티DC/상업멀티DC/유연호스I형/360/4way/스탠드/1way/디럭스/1등급/단위처리` |
| 62 | `initDcConfigFromNotion` | 2606 | No | DC | default + Notion 병합 → log + return |
| 63 | `searchCustomerByBizno` | 2658 | No | 프론트 | 거래처 정보 축약 반환 |
| 64 | `getManagersForInput` | 2664 | No | 프론트 | 담당자 검색 결과 매핑 |
| 65 | `forceAuth` | 2677 | No | 권한 | `DriveApp.getRootFolder()` — 권한 강제 |
| 66 | `checkAuthStatus` | 2683 | No | **인증 게이트** | bizNo → status enum {NOT_FOUND_SYSTEM, NOT_FOUND_AUTH, LOCKED, LONG_UNUSED, ACCESS_DENIED, PENDING, NEED_PW_SET, PW_EXPIRED, NEED_PW_INPUT, ERROR} |
| 67 | `requestAuthApproval` | 2720 | No | 인증 | 미승인 거래처 → AUTH DB row 생성 (`승인상태=미승인`) |
| 68 | `setAuthPassword` | 2738 | No | 인증 | 신규 PW 설정 — SHA-256 해시 + 과거 5개 (pw1~pw5) 중복 검사 |
| 69 | `hashPassword_` | 2778 | Yes | 인증 | SHA-256 hex |
| 70 | `tryLogin` | 2785 | No | **로그인** | PW 검증 (hashed/plain/base64 호환) → DC config 동시 반환, 3회 오류 시 LOCKED 처리 |
| 71 | `queryAuthDb_` | 2860 | Yes | Notion AUTH | NOTION_DB_ID_AUTH 단일 거래처 조회 → {pageId, status, pw, retry, pw1~5, tutPc, tutMo, createdTime, tempAuthTime} |
| 72 | `getAccessExpiration` | 2902 | No | 만료일 | createdTime + 30일 vs LOG/SHIPPING DB 최신 시점 vs 임시승인 (다음 일요일) → max |
| 73 | `saveTutorialState` | 2981 | No | 인증 | PC/모바일 튜토리얼 체크박스 |
| 74 | `createAuthRow_` | 3004 | Yes | Notion AUTH | 거래처 신규 페이지 생성 |
| 75 | `updateAuthPage_` | 3028 | Yes | Notion AUTH | PATCH 페이지 |
| 76 | `_triggerAuth` | 3046 | No | 권한 | MailApp 잔여량 출력 (트리거 권한 강제) |
| 77 | `forceAuthCheck` | 3051 | No | 권한 | Gmail draft 생성/삭제 — Gmail 권한 강제 |
| 78 | `getOrderHistory` | 3058 | No | UI←Notion | NOTION_DB_ID_ORDER 거래처 주문이력 조회 + base64 품목데이터 디코딩 |
| 79 | `saveOrderToNotion` | 3196 | No | Notion ORDER | 주문 1건 → ORDER DB 페이지 (품목 base64 chunked) |
| 80 | `logActionToNotion` | 3254 | No | 로그 | NOTION_DB_ID_LOG 액션 로그 1행 |
| 81 | `logFrontEvent` | 3292 | No | 로그 | 프론트 이벤트 → logActionToNotion 위임 |

**Code.js 누락 0 확인** — grep `^function` 결과 81 entry / 모두 위 표 등재.

### index.html 인라인 함수 (Apps Script 호출 site만 inventory)

| google.script.run 호출 | 위치 (line) | 호출 컨텍스트 |
|---|---|---|
| `getGateImages` | 7244 | 게이트 진입 이미지 prefetch |
| `checkAuthStatus` | 7549 | 사업자번호 입력 → 상태 분기 |
| `requestAuthApproval` | 7711 | 미승인 → 승인 요청 버튼 |
| `setAuthPassword` | 7747 | 4자리 PW 설정 (확인 일치 + 과거 중복 검사) |
| `tryLogin` | 7791 | 로그인 (3회 오류 잠금) |
| `getAccessExpiration` | 7871 | 30분 폴링 (`startExpirationPolling`) |
| `getOrderHistory` | 8104 | 주문이력 페이지 (날짜+거래처) |
| `logFrontEvent` | 8252 | 프론트 액션 로그 중계 |
| `saveOrderSnapshot` | 8646 | 임시저장 (data+image base64) |
| `getOrderSnapshotHistory` | 8858 | 저장내역 조회 |
| `sendOrderFromUi` | 6074 | **최종 주문 전송** (모달 확인 후) |
| `saveTutorialState` | 9423 | 튜토리얼 완료 체크박스 |

총 12개 RPC. 화면 함수는 doGet 템플릿 변수 (homemulti, singleSets, singleParts, homeDefaults, singleDefaults, singleMatPrices, commercialMulti, commercialParts, oldProducts, homeInc, commInc, singleInc, singlePartsInc, specDetailMap, logoData, config) 16종 prefetch 후 SPA 가 클라이언트 사이드에서 분류/단가/렌더 처리.

---

## §2. 시트 read/write 매트릭스

소스: `SpreadsheetApp.openById('1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ')` (단일 워크북, workbook.json 27개 탭 중 11개만 사용)

| 시트명 | 함수 | 모드 | 사용 컬럼 (정규화) | workbook.json 매칭 |
|---|---|---|---|---|
| `홈멀티` (HOME_NAME) | `getHomeMulti`, `getSpecMap_`, `getSpecDetailMap_.scanHome`, `getHomeDefaults` | Read (display + formula) | 품명/모델명/단위/납품가(중복마지막)/출고가(LIST/리스트/정가/소비자가)/고정DC/규격/용량/배관경/냉방성능/소비전력/에너지소비효율/냉매가스/차단기/전원선/제품크기/제품중량/포장치수/포장중량/최대장배관/최대고저차/비고 + A1:X2 (유연호스 제외/분기관 제외/발통포함/리모컨/판넬변경) | OK |
| `홈멀티_단가인상` | `getHomeIncreasePrices_` | Read | 모델명/출고가(LIST/리스트) | OK |
| `싱글 세트` (SINGLE_NAME) | `getSingleSets`, `getSpecMap_`, `getSpecDetailMap_.scanSingle`, `getSingleDefaults` | Read (display + formula) | 품명/평형/모델명/단위/비고/납품가(좌·우)/등급/배관경/소비전력/성능(kW/kcal)/전원·차단/실내·외기 크기·중량·포장/배관길이·낙차/냉매가스 + A1:X2 defaults + matKey 추출 ($D$4/$D$7/$D$8 수식 검사) | OK |
| `싱글 세트_단가인상` | `getSingleIncreasePrices_` | Read | 모델명/납품가(우측 마지막) | OK |
| `싱글 구성품` (SINGLE_PARTS_NAME) | `getSingleParts`, `getSpecMap_` | Read | 품명/모델명/구분/단위/납품가/세트(setModel)/구성품특징/규격 | OK |
| `싱글 구성품_단가인상` | `getSinglePartsIncreasePrices_` | Read | 모델명/납품가 | OK |
| `상업멀티` (COMM_NAME) | `getCommercialMulti`, `getSpecMap_`, `getSpecDetailMap_.scanComm` | Read (display + formula) | 품명/모델명/단위/납품가/출고가/고정DC/규격/용량/대분류/배관경/덕트구경/냉방·난방성능 (다열 그룹: kcal/kW/터보·강·약 ERV layout3, 일반 layout2)/소비전력/소비효율등급/제품크기/중량/포장/최대장배관/최대고저차/비고 | OK |
| `상업멀티_단가인상` | `getCommIncreasePrices_` | Read | 모델명/출고가 | OK |
| `상업멀티 구성` (COMM_PARTS_NAME) | `getCommercialParts`, `getSpecMap_` | Read | 품명/모델명/구분/단위/세트/규격(또는 비고)/출고가/납품가 | OK |
| `싱글 자재가격` | `getSingleMatPrices` | Read | A:B (이름/가격) | OK |
| `구형` | `getOldProducts_` | Read (values + formulas) | A품명/B모델/C단위/D출고가/F납품가(수식 `$I$1` 포함 시 isDisc=true → 50% DC)/H비고/I규격 | OK |
| `거래처` (CUSTOMERS_NAME) | `getCustomers_` | Read | 거래처코드/거래처명/사업자등록번호/담당자명/담당자연락처/대표자명/주소/전화번호/특이사항/그룹/싱글 할인 | OK |
| `담당자` (MANAGERS_NAME) | `getManagers_` | Read | 담당자명/담당자코드 | OK |
| `장비스펙` | (참조 없음) | — | — | workbook.json 존재하나 사용 ⌀ — Notion DC 와 별개 사양 정보가 시트에 있음 (장비스펙 탭은 미사용, 모든 spec은 위 5개 탭에서 추출) |
| `부속품스펙` | 미사용 | — | — | 동일 |
| `종합견적서`, `전표업로드목록`, `전표생성폼`, `*_템플릿`, `분기계산`, `추천실외기` | 미사용 | — | — | partner-order 가 직접 참조하지 않음 (estimate 계열로 추정) |

**Write: 0건**. 모든 출력 sink 는 Notion DB + 이카운트 API + Gmail.

---

## §3. 외부 의존

### 3.1 Notion API — 5개 DB / 5개 토큰 (SECRETS-MAP §1 일치)

| 토큰 placeholder | DB ID | 용도 | 사용 함수 | 메서드 |
|---|---|---|---|---|
| `REDACTED_NOTION_TOKEN_002` | `193a1006d6588161a02cc8f196d7102b` | DC 설정 (거래처 마스터) | `fetchNotionDcConfig_` | GET /v1/databases/{id} (data_sources 탐색, 2025-09-03 분기) + POST /v1/data_sources/{id}/query 또는 POST /v1/databases/{id}/query 폴백 |
| `REDACTED_NOTION_TOKEN_AUTH_008` | `2dda1006d6588047b1bbc7c2660203c0` | 인증 (PW/상태/튜토리얼) | `queryAuthDb_`, `createAuthRow_`, `updateAuthPage_` | POST /v1/databases/{id}/query, POST /v1/pages, PATCH /v1/pages/{id} |
| `REDACTED_NOTION_TOKEN_ORDER_003` | `2eca1006d65880109d91c2e56fab28f4` | 주문이력 (전표번호+품목 base64) | `getOrderHistory`, `saveOrderToNotion` | POST /v1/databases/{id}/query, POST /v1/pages |
| `REDACTED_NOTION_TOKEN_SNAPSHOT_009` | `33aa1006d6588087810ffaa7dc7f315c` | 임시저장 스냅샷 (data + image base64) | `saveOrderSnapshot`, `getOrderSnapshotHistory` | POST /v1/pages, POST /v1/databases/{id}/query |
| `REDACTED_NOTION_TOKEN_LOG_007` | `2eda1006d65880d696b3da4a8d281ea2` | 액션 로그 | `logActionToNotion`, `getAccessExpiration` | POST /v1/pages, POST /v1/databases/{id}/query |
| `REDACTED_NOTION_TOKEN_SHIPPING_004` | `2f8a1006d658803face6fdfe2b175780` | 출고 DB 최신 시점 (만료일 계산) | `getAccessExpiration` 인라인 | POST /v1/databases/{id}/query |

Notion-Version: `2025-09-03` (NOTION_VER 상수, fetchNotionDcConfig_), 그 외는 `2022-06-28` 하드코딩.

### 3.2 이카운트 ERP (자체 호스팅 프록시)

| Endpoint | Method | 함수 | 용도 |
|---|---|---|---|
| `http://152.69.228.109:3000/proxy/ecount/zone` | POST | `callZoneApi` | ZONE 조회 |
| `http://152.69.228.109:3000/proxy/ecount/login` | POST | `getEcountSession` | sessionId 발급 (50분 캐시) |
| `http://152.69.228.109:3000/proxy/ecount/saleorder` | POST | `sendOrderFromUi` | 판매주문서 등록 (`SaleOrderList` BulkDatas) |

**자격증명 하드코딩** (`getScriptCreds_` line 1755-1763): COM_CODE=174539 / USER_ID=11840720103 / API_CERT_KEY=`117d1e405a25f4631a0aef44bee78dd857` / EMP_CD=250102. ScriptProperties 우선이나 default로 평문 노출. 마이그 시 Vault 이전 의무.

### 3.3 Google Apps Script services

| Service | 호출 위치 | 용도 |
|---|---|---|
| `HtmlService.createTemplateFromFile` | doGet | SPA 렌더 |
| `SpreadsheetApp.openById` | 13개 시트 함수 | display+formula 읽기 |
| `CacheService.getScriptCache` | cache 헬퍼 + getEcountSession | 90KB chunk 시드 + 세션 |
| `UrlFetchApp.fetch` | 모든 외부 API | Notion + 이카운트 |
| `MailApp.sendEmail` | sendOrderFromUi (line 2315) | 주문 성공 시 `samhan00@daum.net` HTML 메일 |
| `GmailApp.createDraft/deleteDraft` | forceAuthCheck | Gmail 권한 부여 |
| `DriveApp.getFolderById/getRootFolder` | getGateImages, getLogoImage, forceAuth | 이미지 base64 |
| `Utilities.formatDate / base64Encode/Decode / computeDigest / newBlob` | 다수 | 인코딩/해시 |
| `PropertiesService.getScriptProperties` | getScriptCreds_ | COM_CODE 등 우선읽기 |
| `Session.getScriptTimeZone` | sendOrderFromUi 등 | KST |
| `Logger.log` | 전반 | 디버그 |

LockService / ScriptApp / Calendar / Forms — **0건**.

---

## §4. HTML 트리거 / Web App UI

- 진입: `appsscript.json.webapp.access = ANYONE_ANONYMOUS` + `executeAs = USER_DEPLOYING` → 로그인 없이 URL 접근 가능 (인증은 Notion AUTH DB 의 사업자번호+PW 로 자체 처리)
- doGet (line 2-42) 가 16종 prefetch JSON 을 템플릿 변수로 주입 → `index.html` 단일 SPA 렌더 (9427 lines)
- google.script.run RPC 12 site (§1 표 참조)
- `ScriptApp.newTrigger(...)` 등록 **없음** — Time-driven 트리거 0건. partner-order 는 순수 사용자 인터랙티브 Web App
- 게이트(인증) 흐름 (index.html 7546–7793):
  1. 사업자번호 입력 → `checkAuthStatus(val)` → status enum 분기
  2. PENDING/NOT_FOUND_AUTH → `requestAuthApproval` 버튼
  3. NEED_PW_SET → 4자리 신규 PW (확인 일치 + 과거 중복 차단) → `setAuthPassword`
  4. NEED_PW_INPUT → `tryLogin` (3회 오류 시 LOCKED, 평문/base64 → SHA-256 자동 마이그)
  5. OK → `completeLogin` → DC config applyConfigFromServer + 화면 렌더 + `startExpirationPolling` (30분 주기 `getAccessExpiration`)
- 로그아웃/만료: 자동 로그아웃 타이머 `initAutoLogout` (line 8964) + `getAccessExpiration` 결과 폴링

---

## §5. 변동DC 감지 룰 (DOMAIN-EXTENSIONS §1)

partner-order 의 변동DC 감지 룰은 **시트 셀 수식의 절대주소 패턴 매칭** 으로 구현됨.

### 룰 1 — 홈/상업 멀티 `useK2` (변동 DC 적용 대상)
- 위치: `getHomeMulti` (Code.js line 658-659), `getCommercialMulti` (line 1051-1052)
- 패턴: `priceFormula = formula[r][idxPrice]` 가 **`$L$2`** 절대참조를 포함하면 `useK2 = true`
- 의미: 납품가 셀이 `=출고가 * (1 - $L$2)` 류 수식 → 사용자가 헤더 셀 K2/L2 의 **할인율** 을 변경하면 자동 재계산되는 행 = 변동DC 품목
- 정적 가격(상수) 행은 useK2=false → 시트 납품가 그대로 사용
- 클라이언트 사이드 단가 산정 (index.html 2415, 2529): `if (r.useK2 && currentListPrice > 0) computed = currentListPrice * (1 - useRate)` — useRate = `parseFixedDc(r['고정DC']) ?? globalRate` (CONFIG.homeDiscount/commDiscount)
- **고정DC 컬럼** (`고정DC` 헤더, idxFixDc): 행마다 별도 할인율 override (퍼센트 또는 0~1 소수). useK2 행에서 fixedDc 가 있으면 globalRate 대신 사용, useK2=false 행에서도 fixedDc 단독으로 적용 가능 (상업멀티 only, line 2532-2534)

### 룰 2 — 싱글 세트 `matKey` (자재 가격 키 결정)
- 위치: `getSingleSets` (line 780-783)
- 수식 `fr[r][idxPR]` 에 `$D$7` 포함 → matKey='D7', `$D$8` 포함 → 'D8', 그 외 'D4'
- 의미: 세트 납품가가 어떤 자재가격 행을 참조하는지 (싱글 자재가격 시트의 D4/D7/D8) → 자재 포함 여부 분기에서 사용 (별도 vs 포함 SET)

### 룰 3 — 구형 `isDisc` (50% 자동 할인 마커)
- 위치: `getOldProducts_` (line 1906-1909)
- 패턴: F열(인덱스 5) 수식에 `$I$1` 절대주소 포함 → `isDisc = true`
- 의미: 구형 시트 I1 셀의 0.5(50%) 할인율을 참조하는 행 → 클라이언트에서 `listPrice * 0.5` 로 강제 + 적요 `(50% DC)` 자동 부여 (index.html 5935-5937)

### Java 포팅 명세 (VariableDiscountDetector)
- ProductMaster 신규 컬럼 (Phase 4 Plan):
  - `hasVariableDiscount: boolean` (= useK2)
  - `fixedDiscountRate: BigDecimal nullable` (= 고정DC 컬럼; 0~0.99 클램프)
  - `setMaterialKey: enum {D4, D7, D8} nullable` (= matKey, 싱글 세트만)
  - `legacyDiscountFlag: boolean` (= isDisc, 구형만; 50% 고정)
- 시드 마이그 시점: 위 시트 수식을 1회 스캔 → boolean/enum 으로 사전 계산 후 PostgreSQL seed
- 신규 등록 endpoint: `VariableDiscountDetector.detect(productPayload)` 가 동일한 룰을 적용 (수식 입력 받지 않고 사용자 체크박스 + 입력값으로 판정)

---

## §6. 세트(Bundle) 품목 처리 (DOMAIN-EXTENSIONS §2)

partner-order 는 **세트 품목을 명시적으로 분리된 시트 + 행 메타** 로 관리.

### 6.1 데이터 구조 (시트)

| 시트 | 키 컬럼 | 역할 |
|---|---|---|
| `싱글 세트` | `모델명` (세트 SKU) | 세트 본체 — name, model, priceLeft, priceRight, matKey |
| `싱글 구성품` | `세트` 컬럼 (setModel = 싱글 세트의 모델명) + `모델명` (구성품 SKU) + `구분` + `구성품특징`(='기본' 마커) | 세트 ↔ 구성품 N:M (실제는 1:N). isDefault=`/기본/` |
| `상업멀티` | `단위`='SET' + `대분류`/'실외기' 검사 (index.html 5848-5850) | 실외기 SET 자동 분해 |
| `상업멀티 구성` | `세트` 컬럼 (setModel = 상업멀티 모델명) + `구분` ('기본' 마커) | 상업 실외기 세트 구성품 |

### 6.2 세트 처리 흐름

1. 시트 로드 시 (Code.js):
   - `getSingleParts` → `setKey: ''` (빈 문자열, 클라이언트가 setModel 로 결합), `setModel`, `kind`, `model`, `price`, `name`, `feat`, `isDefault`
   - `getCommercialParts` → `setKey: setModel` (직접 결합)
2. 클라이언트 (index.html):
   - `explodeCommSets_(setRow, setQty)` (line 4294) — 상업멀티 세트 본행을 구성품 라인으로 펼침
   - `explodeSendSets_(s, q)` (line 5352) — 싱글 세트를 구성품으로 펼침. 단, **`SEND_AS_SET_IDS.has(s.id)` or 부자재류 (catL='부자재'/'실외기 받침')** 이면 분해하지 않고 SET 단위로 전송 (예외 화이트리스트)
   - `analyzeSingleSetDiscountFlags` (line 1615) — 모델 prefix `AC/AP/AR/AF` + `getModelFlags` 결과 (is360/is4way/is1way/isStand/isDeluxe/isGrade1) 로 어떤 세트 DC 가 적용 가능한지 사전 판정
3. 전송 (sendOrderFromUi):
   - 라인 1939-1941: SET 단위 행 중 `sendAsSet !== true` 인 것만 cleaned 에서 제외 (분해본만 남김)
   - 라인 2070-2087: `it.isSetHead` (세트 첫 라인) 행에 세트별 DC 라벨 (`-3만`, `-1만5천` 등) 적요 자동 부착

### 6.3 모델명 prefix → 세트 DC 매트릭스 (getModelFlags, line 1292-1319)

| Prefix + 위치 char | flag | DC 키 | 비고 |
|---|---|---|---|
| `AC` len≥9, [7]='6' [8]='P' | is360 | discount360 | 360 CST |
| `AC` len≥9, [7]='4' [8]∈{P,D} | is4way | discount4way | 4-Way |
| `AC` len≥9, [7]='1' [8]∈{P,D} | is1way | oneWayDiscount | 1-Way |
| `AP` len≥9, [8]='P' (len<11 or [10]≠'C') | isStand | discountStand | 스탠드 |
| `AP` len≥11, [8]='D' [10]='C' | isStand | discountStand | 스탠드 변형 |
| `AP` len≥11, [8]='D' [10]='H' | isDeluxe | deluxeDiscount | 디럭스 |
| `AP` startsWith('AP230'/'AP290') | isStand=true, isDeluxe=false | — | 강제 override |
| `AC|AP` len≥9, [8]='F' | isGrade1 | firstGradeDiscount | 1등급 |

### 6.4 권장 옵션 — 옵션 A (단일 SKU + bundle 메타)
- 채택 사유:
  - 시트가 이미 setModel 외래키로 정규화 → A 매핑 자연스러움
  - 구성품 단가 차감/재고 추적 필요 (이카운트 saleorder 가 구성품 라인별 PROD_CD/QTY/PRICE 전송)
  - SEND_AS_SET_IDS 화이트리스트 = 옵션 B 인 (분해 안 하는) 품목 — `bundleMode: enum BUNDLE_EXPAND/BUNDLE_KEEP` 컬럼 1개로 표현 가능
- 명세 (Phase 4 매핑):
  - product.productType: enum SINGLE/BUNDLE
  - product.bundleMode: enum EXPAND/KEEP nullable (BUNDLE 인 경우만)
  - product.bundleComponents: List<{componentProductCode, qty, isDefault, kind, spec}> (싱글 구성품/상업멀티 구성)
  - product.discountFlags: bitset (is360/is4way/is1way/isStand/isDeluxe/isGrade1) — Phase 1 마이그 시점에 모델명 정규식으로 사전 계산

---

## §7. 핵심 비즈니스 흐름

### 7.1 거래처 주문 입력 → 승인 → 출고 라이프사이클

```
[1] Web App URL 접속 (anonymous)
  → doGet 이 16종 prefetch JSON 주입 → SPA 렌더 (인증 게이트만 표시)

[2] 사업자번호 입력
  → checkAuthStatus(val)
    ├─ NOT_FOUND_SYSTEM (거래처 미등록 + AUTH 미생성) → 차단
    ├─ NOT_FOUND_AUTH (거래처 등록됨 / AUTH row 없음) → "최초 승인 요청" 버튼
    │   → requestAuthApproval → createAuthRow_ (승인상태=미승인)
    ├─ PENDING (미승인 상태 대기) → "승인 후 이용 가능" 안내
    ├─ NEED_PW_SET / PW_EXPIRED → 4자리 신규 PW 입력
    │   → setAuthPassword → SHA-256 해시 저장 (과거 5개 중복 차단)
    ├─ NEED_PW_INPUT → 로그인
    │   → tryLogin → 3회 오류 LOCKED, 평문/base64 자동 마이그, 성공 시 DC config 동시 반환
    ├─ LOCKED / LONG_UNUSED / ACCESS_DENIED → 사무실 안내 (02-3465-1331)
    └─ ERROR → 일반 에러 모달

[3] 로그인 성공 → completeLogin
  → applyConfigFromServer(DC config) → window.DISCOUNT_RATE_HOME/COMM, discount360/4way/Stand/...
  → renderHome / renderSingle / renderComm / renderOld
  → playWelcomeAnimation (거래처명/대표자명 표시)
  → startExpirationPolling (30분마다 getAccessExpiration → 만료일 갱신)

[4] 주문 입력
  → 사용자가 수량 입력 (homeQty/singleQty/commQty/oldQty Map)
  → 단가는 클라이언트 사이드 산정 (homeUnitPrice/singleUnitPrice/commUnitPrice)
    - 변동DC (useK2) → list × (1 - rate)
    - 고정DC → list × (1 - fixedDc)
    - 모델 prefix 세트 DC (360/4way/Stand/1way/Deluxe/Grade1) → 차감
    - PRICE_INC_DATE 이후 → *_INC[model] 인상가 적용
    - I형 유연호스 → showIHose=false 시 7000원 강제
    - 구형 isDisc → 0.5 강제

[5] 임시저장 (선택)
  → handleSaveSnapshot(theme) → saveOrderSnapshot
  → 데이터 + 미리보기 이미지 (canvas → JPEG base64) → SNAPSHOT DB 페이지
  → goSnapshotPage / loadSnapshotHistory → getOrderSnapshotHistory
  → restoreSnapshot → applySnapshot (form/core/branch 복원)

[6] 최종 전송
  → "주문전송" 버튼 → buildSendRows() → 확인 모달
  → sendOrderFromUi(items, order)
    ├─ searchCustomerByBizOrCode (필수: 미등록 시 거부)
    ├─ getEcountSession (zone+login+session)
    ├─ decideWarehouseCode_ (WH_CD '2' or '00003') — 인피니트/360/1등급 등 키워드
    ├─ initDcConfigFromNotion (Notion DC 재조회)
    ├─ 라인별 SaleOrderList[].BulkDatas 조립:
    │     IO_DATE, CUST, CUST_DES, EMP_CD, WH_CD, U_TXT1(배송주소),
    │     ADD_TXT_01_T(감리주소), ADD_TXT_03_T(인수자번호), ADD_TXT_04_T(메모),
    │     ADD_TXT_05_T(입금예정MMDD), U_MEMO1~3(거래처 tel/addr/rep),
    │     PROD_CD, SIZE_DES (규격, prevSpecNorm 중복 시 zero-width-space ​),
    │     QTY, PRICE(VAT제외), USER_PRICE_VAT, SUPPLY_AMT, VAT_AMT,
    │     REMARKS (주소+전역DC+고정DC+세트DC 조합 — combineRemarks_ ' / ')
    ├─ POST /proxy/ecount/saleorder
    ├─ 성공 시:
    │     ├─ Body.Data.SlipNos[0] 에서 전표번호 추출 (split '-' 후 part[1])
    │     ├─ MailApp.sendEmail → samhan00@daum.net (주문서 HTML)
    │     ├─ saveOrderToNotion → ORDER DB 페이지 (품목 base64 chunked)
    │     └─ logActionToNotion → 주문 성공 로그 (전표번호, 금액합계 포함)
    └─ 실패 시: logActionToNotion 주문 실패 로그 (이카운트 거부 사유)

[7] 출고 (별도 long-pending / shipping 시스템에서 처리)
  → SHIPPING DB 가 출고 시점 기록 → getAccessExpiration 이 활동성 갱신
  → long-pending 배치 (다른 스크립트) 가 30일 무활동 거래처 자동 LONG_UNUSED 전환

[8] 주문이력 조회
  → getOrderHistory(bizNo, dateType, startDate, endDate) → ORDER DB 조회
  → 품목데이터 (base64 chunked) 디코딩 → mappedItems (역순 .reverse())
```

### 7.2 slip-service Slip 라이프사이클과 비교 (Java 도메인 포팅)

| Apps Script 단계 | 현 slip-service 도메인 (참고: README/플랜 기준) | 매핑 |
|---|---|---|
| Web App 사용자 주문 입력 (SaleOrder) | Slip (판매주문 전표) | partner-order → 신규 OrderRequest 도메인 (Slip 의 입력 buffer) |
| 이카운트 saleorder POST 응답 | Slip 전표번호 (ioNo) | ioNo 를 Slip.externalSlipNo 컬럼에 매핑 |
| ORDER DB 저장 | Slip + SlipLine | 신규 PartnerOrder + PartnerOrderLine entity (별도) — Slip 과 1:1 mirroring |
| SNAPSHOT DB | (현 미존재) | 신규 OrderDraft 도메인 (자동 폐기 30일) |
| AUTH DB 거래처 PW | (현 미존재 — 직원 인증만) | 신규 PartnerAuth 도메인 (PartnerCode + bcrypt) |
| LOG DB | audit-service 또는 slip HISTORY | Slip HISTORY 테이블에 통합 가능 (action, message, deviceTag) |

---

## §8. Java 포팅 권장 구조

### 권장: **신규 partner-order-service** (slip-service 확장 ❌)

#### 사유
1. **도메인 책임 분리** — slip-service 는 직원이 작성한 정식 전표 (회계 트랜잭션) 의 라이프사이클 (작성→승인→출고→정산) 만 담당. partner-order 는 **거래처 본인이 작성한 주문 요청** (외부 입력 buffer) 으로 책임 경계가 다름. 이카운트 saleorder POST 직후 slip-service 가 Slip 을 자동 생성하는 콜백 (event) 구조가 자연스러움.
2. **인증 도메인 분리 필요** — partner 주문은 거래처 사업자번호+자체 PW 인증 (PartnerAuth, SHA-256→bcrypt). slip-service 직원 인증과 동거 시 보안 단순화 손실.
3. **데이터 격리** — DOMAIN-EXTENSIONS §1/§2 (변동DC/Bundle) 는 product-service 컬럼 확장으로 처리. partner-order-service 는 product-service 의 read-only client 로 동작.
4. **Notion 의존 제거 매핑**:
   - NOTION_DB_ID (DC) → product-service / partner-service Partner.discountConfig (JSONB)
   - NOTION_DB_ID_AUTH → partner-order-service PartnerAuth
   - NOTION_DB_ID_ORDER → partner-order-service PartnerOrder + PartnerOrderLine
   - NOTION_DB_ID_SNAPSHOT → partner-order-service PartnerOrderDraft
   - NOTION_DB_ID_LOG → audit-service AuditLog (공용)
   - NOTION_DB_ID_SHIPPING → 기존 shipping/slip 도메인 (활동성 polling 만)

#### 권장 모듈 구조

```
services/partner-order-service/
├── domain/
│   ├── PartnerAuth                — bcrypt PW + status enum (APPROVED/PENDING/LOCKED/LONG_UNUSED/ACCESS_DENIED) + retry + pwHistory 5
│   ├── PartnerOrder               — header (bizNo, custCode, dueDate, payDate, addr, auditAddr, tel, memo, externalSlipNo, status)
│   ├── PartnerOrderLine           — productCode, qty, unitPriceVatIncl, supplyAmt, vatAmt, remarks, fixedDcRate, sizeDes
│   ├── PartnerOrderDraft          — JSON form + branchState + previewImageBase64 + theme + savedAt
│   ├── PartnerOrderActionLog      — bizCode, message, deviceTag, createdAt
│   └── DiscountResolver           — Partner.discountConfig + product.hasVariableDiscount/fixedDc → 단가
├── api/
│   ├── PartnerAuthController      — checkStatus / requestApproval / setPassword / login / setTutorial
│   ├── PartnerOrderController     — list (history) / create (sendOrder) / draft save+load+restore
│   └── PartnerCatalogController   — getHomeMulti / getSingleSets / getSingleParts / getCommercial* / getOldProducts (모두 product-service 위임)
├── client/
│   ├── ProductClient              — product-service catalog read (Feign)
│   ├── PartnerClient              — partner-service Partner read
│   ├── EcountClient               — 152.69.228.109:3000 proxy (zone/login/saleorder)
│   └── MailClient                 — Spring Mail (samhan00@daum.net)
└── event/
    └── PartnerOrderConfirmedEvent — slip-service 가 listen → Slip 자동 생성
```

#### 핵심 비대 함수 분해 (sendOrderFromUi 1928-2378, 453라인) → Service 메서드 분해 권장

| 책임 | 신규 메서드 |
|---|---|
| 거래처/담당자 검증 | `PartnerLookupService.resolve(bizNo)` |
| DC config 결합 | `DiscountConfigService.resolve(partnerId)` |
| 라인 정제 + 세트 분해 | `OrderLineBuilder.build(items, config)` |
| 단가/공급가/부가세 분리 | `LinePricingService.split(unitVat, qty)` |
| 규격/적요 조합 | `RemarkComposer.compose(line, ctx)` |
| 창고 코드 결정 | `WarehouseRouter.route(items)` |
| 이카운트 전송 | `EcountClient.postSaleOrder(payload)` |
| 메일 발송 | `OrderMailService.notifyConfirmed(order)` |
| 이력 저장 | `PartnerOrderRepository.save(order)` |
| 액션 로그 | `AuditLogClient.log(...)` (event publish) |

---

## §9. 누락/모호 항목

| # | 항목 | 상태 | 조치 |
|---|---|---|---|
| 1 | `장비스펙` / `부속품스펙` 시트 — workbook.json 에 존재하나 partner-order Code.js 에서 직접 참조 0건 | 모호 | estimate-service 분석 시 교차 확인 (해당 시트는 견적서 전용 가능성) |
| 2 | `SEND_AS_SET_IDS` 화이트리스트 정의 위치 | 미확인 (index.html 5359에서 참조) | index.html 전반 grep 필요 — 본 분석은 Code.js 위주, SPA 상수 추적은 Phase 4 Plan 시점 |
| 3 | `getCustomers_.그룹` (group) 컬럼 활용 | **거래처 권한 분기 단서지만 코드에서 사용 0건** | 시트 데이터로만 존재 — 거래처 그룹별 메뉴/단가 분기 룰은 향후 신규 기능 또는 product-service Partner.group 컬럼 시드용으로 보존 |
| 4 | `singleDiscount` (거래처 시트의 '싱글 할인') | 거래처 시트에서 읽으나 sendOrderFromUi 에서 사용 0건 | Notion DC config 으로 대체된 deprecated 컬럼 추정 — 마이그 시점 검증 |
| 5 | `getSingleParts` 의 `linkRows: []` 빈 배열 | 사용 0건 | `extractRowsFromFormula_` 가 정의되어 있으나 호출 0건. 구버전 잔재 |
| 6 | `extractRowsFromFormula_` (line 823) | dead code | 마이그 시 삭제 |
| 7 | `_triggerAuth`, `forceAuth`, `forceAuthCheck` | 권한 부여용 더미 함수 | 마이그 시 불요 |
| 8 | 이카운트 자격증명 평문 default (`getScriptCreds_` 1755-1763) | 보안 critical | Vault/AWS Secrets Manager 이전 의무 |
| 9 | NOTION_VER 분기 (2025-09-03 vs 2022-06-28) | fetchNotionDcConfig_ 만 신버전, 다른 Notion 호출은 모두 구버전 | Notion 의존 제거되므로 마이그 후 불요 |
| 10 | `userEmail samhan00@daum.net` 하드코딩 (sendOrderFromUi line 2225) | 마이그 시 환경변수화 | application.yml 등 |
| 11 | DC 코드 `homeRate` / `commRate` 가 order 객체에 직접 들어올 수 있음 (line 2027-2036) | 호출자가 override 하는 경로 미확인 | index.html 에서 order 빌드 검사 필요 |
| 12 | `combineRemarks_` 적요 결합 우선순위 (주소 → 전역DC → 고정DC → 세트DC) | 명시되어 있으나 중복 입력 시 idempotency 미보장 | Java 포팅 시 RemarkComposer 명세 표 의무 |

---

## §10. 회고 가드

- **DOMAIN-EXTENSIONS §1 (변동DC)** — 본 §5 에서 useK2/$L$2/$D$7/$D$8/$I$1 4종 룰 모두 inventory. ProductMaster 신규 컬럼 명세 완료.
- **DOMAIN-EXTENSIONS §2 (Bundle)** — 본 §6 에서 옵션 A 권장 + getModelFlags 7개 prefix 룰 표 완성. SEND_AS_SET_IDS 화이트리스트는 §9-2 누락 등재.
- **feedback_pm_integration_build_check (Layer 4 도메인 의미 정렬)** — Apps Script 함수명 ↔ Java 메서드명 매핑은 §8 표로 1:1 명세. QA 가 sendOrderFromUi 출력값 ↔ 신규 service 출력값 sample 30+ 거래처 대상 비교 필요.
- **feedback_function_documentation** — Java 포팅 시 한국어 Javadoc 의무 + Apps Script 함수명/라인 출처 주석 의무 + docs/dev-reports/partner-order.md 누적.
- **feedback_uuid_no_user_visibility** — 본 시스템은 사업자번호(10자리)+거래처코드 만 사용자 노출. UUID 노출 0건. partner-order-service 도 동일 원칙 유지.
- **feedback_korean_commits** — 본 분석은 Notion DB property 한국어 키 ('거래처코드', '승인상태', '현재PW' 등) 모두 보존. Java entity 컬럼명은 영문 + DB column name 한국어 alias 또는 별도 매핑 테이블.
- **무손실 의무** — Code.js 81 함수 + index.html 12 RPC site 모두 §1 표 등재. 추가 누락 발견 시 §9 추가 의무.
- **추측 금지** — `장비스펙` 시트 미사용 사유 / `그룹` 컬럼 활용 / SEND_AS_SET_IDS 정의는 §9 에 미확정 등재 (단정하지 않음).
- **시트 검증** — workbook.json 27개 탭 중 partner-order 가 사용하는 11개 모두 매칭 확인 (§2 OK 표시).
- **placeholder 보존** — 본 문서는 `REDACTED_NOTION_TOKEN_*` placeholder 형태만 사용. 실제 토큰 0건 노출.

---

## §11. 추가 의무 — partner-order 특화

### 11.1 거래처별 권한 분기 — 어떤 거래처가 어떤 메뉴 접근 가능한가

**현 partner-order 시스템에는 거래처별 메뉴 분기가 없음**. 모든 인증된 거래처는 동일한 SPA 메뉴를 받음:
- 홈멀티 / 싱글 세트 / 상업멀티 / 구형 — 4개 카테고리 모두 노출
- 주문이력 / 임시저장(스냅샷) — 모두 자기 사업자번호 데이터만
- 튜토리얼 — PC/모바일 1회씩

**분기되는 항목**: 메뉴가 아니라 **단가** 와 **활성화 상태**:
- DC 설정 (homeDiscount/commDiscount/360/4way/Stand/1way/Deluxe/1등급/유연호스I형) — Notion `홈멀티DC/상업멀티DC/...` 컬럼 거래처별 다름
- 단위처리 (반올림/올림/내림 + 1원/10원/100원 단위) — 거래처별 다름
- AUTH 상태 (승인/미승인/잠김/장기미사용/접근제한) — 4 상태 거래처는 화면 접근 자체 차단

**거래처 시트의 `그룹` 컬럼** (line 1652) — 코드에서 읽기만 하고 사용 0건. 향후 메뉴 분기 또는 단가 일괄 적용 후보 컬럼 (§9-3).

### 11.2 주문 → 승인 → 출고 라이프사이클 (Slip 비교)

| 단계 | partner-order 현행 | slip-service Slip (참조) | 매핑 권장 |
|---|---|---|---|
| 1. 작성 | PartnerOrderDraft (SNAPSHOT DB, 임시저장) | (없음) | 별도 도메인 |
| 2. 제출 | sendOrderFromUi → 이카운트 saleorder POST | Slip.create (직원 직접 입력) | PartnerOrderConfirmedEvent → slip-service 가 listen → Slip 자동 생성 |
| 3. 등록 | 이카운트 SlipNos[0] 응답 → ORDER DB 저장 + 메일 알림 | Slip.externalSlipNo + Slip.status='REGISTERED' | externalSlipNo 미러링 |
| 4. 승인 | (없음 — 이카운트 등록과 동시에 자동 승인) | Slip.approve (결재선) | PartnerOrder.status 단순 enum {DRAFT/SUBMITTED/REGISTERED/SHIPPED/CANCELED} |
| 5. 출고 | SHIPPING DB 별도 시스템 (현 partner-order 외부) | Slip.ship → 출고전표 생성 | shipping-service 도메인 (slip-service 의 일부 또는 분리) |
| 6. 정산 | (현 partner-order 무관) | Slip.settle → 회계 분개 | accounting-service 도메인 |

**핵심 차이**: partner-order 의 PartnerOrder 는 이카운트 SaleOrder 에 종속된 **외부 트리거 buffer**, slip-service Slip 은 회계 책임 entity. 따라서 Slip 의 결재선/HISTORY 라이프사이클을 PartnerOrder 에 강제할 수 없음. PartnerOrder 는 단순 status flow 로 충분.

### 11.3 Notion DB 저장 (NOTION_TOKEN_ORDER) vs 시트 저장 비교

| 항목 | Notion ORDER DB | Google Sheet | 현행 partner-order |
|---|---|---|---|
| 주문 데이터 | `saveOrderToNotion` 가 ORDER DB 페이지로 저장. 품목 배열은 JSON → base64 → 2000자 chunked rich_text | 시트 write **0건** (read-only) | **Notion only** |
| 임시저장 (Draft) | SNAPSHOT DB 페이지 (data + image base64) | 0건 | Notion only |
| 인증 (PW) | AUTH DB 페이지 | 0건 | Notion only |
| DC 설정 | DC DB 페이지 (거래처별) | 0건 | Notion only |
| 액션 로그 | LOG DB 페이지 | 0건 | Notion only |
| 출고 (시점만) | SHIPPING DB 조회 | 0건 | Notion only (read) |
| 마스터 데이터 (품목/거래처/담당자/사양) | 0건 | 시트 read (`SRC_SHEET_ID`) | **Sheet only** |

**구조 의미**:
- **마스터 (품목/거래처/사양/단가인상)** = Sheet — 사람이 직접 편집하는 ERP 기준 데이터, 버전 관리 X
- **트랜잭션 (주문/인증/로그/스냅샷)** = Notion — 동시 다발 발생, 페이지네이션/필터 필요, UI 편집 가능

**마이그 권장**:
- Sheet 마스터 → product-service / partner-service 시드 (1회 import 후 시트 폐기)
- Notion 트랜잭션 → partner-order-service PostgreSQL (PartnerOrder/PartnerAuth/PartnerOrderDraft/AuditLog) — Notion 의 페이지=row 모델은 PostgreSQL row 로 1:1 매핑 (rich_text base64 chunked 분할 → BYTEA/TEXT 단일 컬럼 으로 단순화)
- SHIPPING DB → 기존 shipping/slip 도메인 (별도 분석 대상)
- LOG DB → audit-service 공통 (slip HISTORY 와 통합 검토)

---

## 부록 — Code.js 함수 의존 그래프 핵심 경로

```
doGet
  ├─ getHomeMulti → cacheGetJSON_/cachePutJSON_ + classifyHome_ (sanitizeDisp_, hpFromText_, unifyCatL_)
  ├─ getSingleSets → classifySingleSetLM_ + sanitizeDisp_/normalizeSize_
  ├─ getSingleParts → sanitizeDisp_
  ├─ getHomeDefaults / getSingleDefaults / getSingleMatPrices
  ├─ getCommercialMulti → classifyCommercial_
  ├─ getCommercialParts
  ├─ getOldProducts_
  ├─ getHomeIncreasePrices_ / getCommIncreasePrices_ / getSingleIncreasePrices_ / getSinglePartsIncreasePrices_ → extract*IncreasePrices_
  ├─ getSpecDetailMap_ (scanHome+scanSingle+scanComm)
  └─ getLogoImage

sendOrderFromUi
  ├─ searchCustomerByBizOrCode → getCustomers_
  ├─ getEcountSession → getScriptCreds_, callZoneApi
  ├─ decideWarehouseCode_
  ├─ initDcConfigFromNotion → buildDefaultDcConfig_ + fetchNotionDcConfig_
  ├─ getSpecMap_, getSingleSets, getSingleParts (규격 매핑)
  ├─ findManagerByNameExact_ → getManagers_
  ├─ formatPercentLabel_ / formatWonDiscountLabel_ / combineRemarks_
  ├─ UrlFetchApp.fetch (이카운트 saleorder)
  ├─ MailApp.sendEmail
  ├─ saveOrderToNotion
  └─ logActionToNotion

checkAuthStatus
  ├─ fetchNotionDcConfig_
  ├─ searchCustomerByBizOrCode
  └─ queryAuthDb_

tryLogin / setAuthPassword / requestAuthApproval / saveTutorialState
  └─ queryAuthDb_, hashPassword_, updateAuthPage_, createAuthRow_, logActionToNotion
```

**경로 누락 0** — Code.js 81개 함수 모두 위 표 또는 §1 inventory 에 등재.
