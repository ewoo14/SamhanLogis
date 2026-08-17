# dev-report — migration-fe-google-sheets-data-source

- 작성일: 2026-05-05
- 슬라이스: estimate-app v2 + order-app v4 의 품목 데이터 출처를 Samhan Public backend → Google Sheets 직접으로 환원
- 브랜치: `feature/migration-fe-google-sheets-data-source`
- 관련 PR: 본 PR (FE) + 별도 spawn `feature/migration-be-product-google-sheets-sync` (BE 옵션 C-2 cron 동기화)

## 1. 배경 (개발책임자 결정 2026-05-05)

> "견적서와 주문서의 경우에만 기존 구글 스크립트처럼 구글 스프레드 시트에서 그대로 가져오는 것으로 하자"

기존 estimate-app v2 (PR #58) + order-app v4 (PR #50/#53) 의 품목 데이터:
- estimate-app v2: legacy estimate Code.js 1:1 port + `lib/apps-script-shim.js` 의 `SpreadsheetApp` 가 Samhan Public backend (product-service) 위임
- order-app v4: shim `src/samhanApi.ts` 의 `getProducts/fetchBootstrap/getGateImages` 등이 Samhan Public backend 호출

본 작업은 그 출처를 **Google Sheets 직접 read** 로 환원한다.

## 2. 채택 옵션 (옵션 C)

| 옵션 | 변경 위치 | 변경량 | 채택 |
|---|---|---|---|
| A. FE 가 모두 시트 직접 read | estimate-app + order-app 양쪽 | 큼 | × |
| B. FE 는 backend 호출 유지, backend 가 시트 read on demand | backend 1곳 | 중간 | × (실시간 비용) |
| **C. FE 중 estimate-app 만 시트 직접 read, order-app 은 backend 가 cron 으로 시트 → DB sync** | estimate-app 정정 + backend 신규 | 작음 | **○** |

옵션 C 는 두 모드를 동시에 만족:
- estimate-app v2: legacy 와 동일한 즉시 시트 read (단일 사용자 / 데스크톱 환경)
- order-app v4: 거래처 다수 동시 호출 → backend 캐시 (DB) 가 시트 읽기 부담 흡수

## 3. 변경 매트릭스

### 3.1 estimate-app v2 (frontend, 본 PR)

| 영역 | 위치 | 변경 |
|---|---|---|
| 신규 | `clients/web/estimate-app/lib/google-sheets-client.js` | googleapis SDK + Service Account JWT + in-memory cache (TTL 5분) |
| 정정 | `clients/web/estimate-app/lib/apps-script-shim.js` | `SpreadsheetApp` 가 google-sheets-client 위임 + `preloadSheet` / `preloadSheets` / `clearSheetCache` 노출 + `FakeSheet.getDisplayValues()` 추가 |
| 정정 | `clients/web/estimate-app/lib/code.js` | §3 부트스트랩 + §5 거래처/담당자 getter 들이 `_msGet(PRODUCT_BASE/...)` → `SpreadsheetApp.openById(SRC_SHEET_ID)` 직접 read 로 환원. parsing logic 은 estimate-legacy/lib/code.js (PR #67) 1:1 포팅. `bootstrap()` 가 `preloadSheets(SRC_SHEET_ID, sheetsToPreload)` 사전 호출 |
| 정정 | `clients/web/estimate-app/package.json` | `googleapis@^144.0.0` 의존성 추가 |
| 정정 | `clients/web/estimate-app/.env.example` | `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_SA_KEY_JSON_BASE64` / `SHEET_CACHE_TTL_SEC` / `SRC_SHEET_ID` placeholder 추가 |
| 정정 | `clients/web/estimate-app/test/code.test.js` | `classifyHome_` / `classifySingleSetLM_` 테스트 시그니처 legacy 1:1 로 정렬 (`{catL, catM, catS, disp}` / `{L, M}`) |

### 3.2 order-app v4 (frontend, **변경 0**)

옵션 C-2 효과로 frontend RPC 시그니처 그대로 유지:

| RPC | endpoint | 변경 |
|---|---|---|
| `getProducts(category)` | `GET /products?usageScope=PARTNER_ORDER&category=...` | 0 (BE 가 시트 → DB sync) |
| `fetchBootstrap()` | `GET /partner-orders/bootstrap` | 0 (BE 가 시트 → DB sync) |
| `getGateImages()` | `GET /partner-orders/gate-images` | 0 |
| 그 외 12 RPC | 인증 / snapshot / draft / 발송 등 | 0 (시트 데이터 아님) |

검증: `npm run build` PASS (60 modules, 354ms, dist/index.html 351KB).

### 3.3 dev-reports

- 신규: `docs/dev-reports/migration-fe-google-sheets-data-source.md` (본 문서)

## 4. 핵심 호환 결정

### 4.1 비동기 처리 — preloadSheets

Apps Script `SpreadsheetApp.openById(...).getSheetByName(...).getDataRange().getValues()` 는 동기. Node.js 에서는 sheet read 가 비동기.

**해결**: `bootstrap(userEmail)` 가 16개 탭을 `preloadSheets()` 로 병렬 prefetch → in-memory FakeSpreadsheet 채움 → 이후 동기 getter 호출 가능.

```javascript
const sheetsToPreload = [
  HOME_NAME, SINGLE_NAME, SINGLE_PARTS_NAME, COMM_NAME, COMM_PARTS_NAME,
  CUSTOMERS_NAME, MANAGERS_NAME,
  '싱글 자재가격', '구형', '추천실외기',
  '홈멀티', '상업멀티', '상업멀티 구성', '싱글 세트', '싱글 구성품',
];
await preloadSheets(SRC_SHEET_ID, sheetsToPreload);
```

### 4.2 graceful 빈 카탈로그

Service Account 키 미설정 또는 sheet read 실패 시:
- `preloadSheets` 가 `Promise.allSettled` 로 처리 → 실패 sheet 만 빈 sheet 로 남고 나머지는 정상
- 동기 getter 가 빈 시트에서 헤더 미발견 → `[]` / `{}` 반환
- bootstrap 의 try/catch 가 모든 getter 를 wrap → JSON.stringify 결과는 항상 valid

검증 결과 (Service Account 미설정):
```
[shim] preloadSheet 실패 sheet=홈멀티_단가인상 error=[google-sheets-client] Service Account 키 미설정
[shim] SpreadsheetApp.getSheetByName(홈멀티_단가인상) → not preloaded, returning empty sheet
bootstrap OK keys: 16
homemulti: []
singleSets: []
```

→ 화면 진입은 가능, 카탈로그는 비어있음 (legacy 동작과 동등 graceful).

### 4.3 캐시 TTL 5분

- `lib/google-sheets-client.js` 의 in-memory Map (key=`${spreadsheetId}!${range}`, value=`{values, expireAt}`)
- `SHEET_CACHE_TTL_SEC` env (기본 300 = 5분)
- 카페24 1G RAM 한도 안전 (시트 27탭 * 평균 1MB ≈ 30MB)
- 무효화: `clearSheetCache()` (RPC `POST /rpc/clearSheetCache` — 추후 라우팅 보강 가능)

### 4.4 parsing logic 1:1 포팅 출처

본 PR 의 §3 / §5 parser 들은 모두 `clients/web/estimate-legacy/lib/code.js` (PR #67) 의 동명 함수와 **1:1 동등**. 단, estimate-legacy 가 `getDisplayValues` 를 사용하는 부분에 대해 estimate-app v2 의 FakeSheet 가 동일 메서드를 추가 노출하도록 보강.

| getter | estimate-legacy line | 본 PR 위치 |
|---|---|---|
| `getHomeMulti` | 408 | `lib/code.js` 새 §3 |
| `getSingleSets` | 532 | `lib/code.js` 새 §3 |
| `getSingleParts` | 644 | `lib/code.js` 새 §3 |
| `getSingleMatPrices` | 717 | `lib/code.js` 새 §3 |
| `getCommercialMulti` | 812 | `lib/code.js` 새 §3 |
| `getCommercialParts` | 907 | `lib/code.js` 새 §3 |
| `getOldProducts_` | 1753 | `lib/code.js` 새 §3 |
| `getHomeDefaults` | 1401 | `lib/code.js` 새 §3 |
| `getSingleDefaults` | 1426 | `lib/code.js` 새 §3 |
| `getRecommendOduData` | 1644 | `lib/code.js` 새 §3 |
| `getSpecMap_` | 989 | `lib/code.js` 새 §3 |
| `getPriceIncData_` | 2803 | `lib/code.js` 새 §3 |
| `getCustomers_` / `searchCustomerByBizOrCode` | 1463 / 1514 | `lib/code.js` 새 §5 |
| `getManagers_` / `searchManagersByName_` / `findManagerByNameExact_` | 1533 / 1566 / 1574 | `lib/code.js` 새 §5 |

`getSpecDetailMap_` 는 estimate-legacy 의 1100라인 scanHome/scanSingle/scanComm 중 핵심 골격만 (모델 키 + 슬롯 보장) 컴팩트 포팅. 상세 spec 필드 전체 매핑은 후속 PR.

### 4.5 Samhan Public MS 위임 잔존 부분

본 PR 은 **시트 데이터만 직접 read**. 다음은 그대로 Samhan Public MS 위임 유지:

| 함수 | endpoint | 비고 |
|---|---|---|
| `checkUserAuth(email)` | `GET /api/v1/auth/me` | 인증 |
| `forceAuth()` | noop | Drive 권한 폐기 |
| `logFrontEvent(...)` | `POST /api/v1/audit-logs/front` | 감사 로그 |
| `saveQuoteSnapshot(payload)` | `POST /api/v1/estimates/snapshots` | 견적 임시저장 |
| `getQuoteHistory(...)` | `GET /api/v1/estimates/snapshots` | 견적 이력 |
| `getNotionHistory(...)` | `GET /api/v1/partner-orders` | 출고 이력 |
| `initDcConfigFromNotion(bizno)` | `GET /api/v1/partners/{bizno}/dc-config` | DC 메타 (시트 외) |
| `sendOrderFromUi(data)` | slip-bridge.postSlip → `POST /api/v1/slips` | 출고전표 발송 |
| `getLogoImage` / `getGateImages` | (Drive 폐기 → 빈 string/배열) | 본 PR scope 외 — 후속 PR 에서 drive-client 또는 public/assets 로 대체 |

### 4.6 mock fallback 잔존

`USE_MOCK_FALLBACK=true` (기본값) 시 Samhan Public MS 미가동 환경에서 인증/snapshot/감사로그/slip 발송 mock 응답으로 진입 가능 (legacy 동작 유지). mock 제거는 별도 PR (`feedback_integrated_pr_pattern.md` 일관).

## 5. 검증

### 5.1 syntax / require / 부트스트랩

```bash
$ cd clients/web/estimate-app && npm install
added 381 packages, audited 382 packages

$ node --check lib/google-sheets-client.js && \
  node --check lib/apps-script-shim.js && \
  node --check lib/code.js && \
  node --check lib/slip-bridge.js
ALL OK

$ node -e "const c = require('./lib/code'); console.log(Object.keys(c).length, typeof c.bootstrap, c._constants.SRC_SHEET_ID);"
73 function <SHEET_ID>

$ PORT=15183 node server.js & sleep 3 && curl -s http://localhost:15183/healthz
{"ok":true,"app":"estimate-app","version":"2.0.0"}
```

### 5.2 jest 테스트 (estimate-app v2)

```
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
```

`classifyHome_` / `classifySingleSetLM_` 시그니처를 legacy 1:1 (`{catL, catM, catS, disp}` / `{L, M}`) 로 정렬한 후 모두 PASS.

### 5.3 order-app v4 — 변경 0 검증

```bash
$ cd clients/web/order-app && npm run build
✓ 60 modules transformed.
✓ built in 354ms
PWA v0.20.5 — precache 6 entries (422.73 KiB)
```

## 6. legacy 보존 검증

- ✓ 시트 ID `<SHEET_ID>` 그대로 (lib/code.js §0 SRC_SHEET_ID + .env.example)
- ✓ legacy 16종 bootstrap 항목 (homemulti / singleSets / singleParts / homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts / oldProducts / recommendData / specDetailMap / priceInc / logoData / config / userEmail / authData) 그대로 EJS render context 에 전달
- ✓ `sendOrderFromUi` → slip-bridge.postSlip 흐름 그대로 (e-Count proxy 폐기, slip-service POST 로 대체)
- ✓ legacy 시트 탭 이름 그대로 (HOME_NAME / SINGLE_NAME / SINGLE_PARTS_NAME / COMM_NAME / COMM_PARTS_NAME / CUSTOMERS_NAME / MANAGERS_NAME / 싱글 자재가격 / 구형 / 추천실외기 / 홈멀티 / 상업멀티 / 상업멀티 구성 / 싱글 세트 / 싱글 구성품)
- ✓ 모바일 반응형 legacy `@media (max-width:1280px)` + `body.mobile-mode` 그대로 (index.ejs 무수정)

## 7. BE 후속 PR 의존성

`feature/migration-be-product-google-sheets-sync` 별도 spawn (옵션 C-2):
- product-service 가 cron 으로 SRC_SHEET_ID 시트 → product DB sync
- order-app v4 의 `GET /products` / `GET /partner-orders/bootstrap` endpoint 가 동기화된 DB 에서 응답
- 통합 시점: BE PR 머지 후 order-app v4 mobile/desktop 회귀 캡처 1회

## 8. 회고 가드 (memory)

- ✓ 한국어 commit / PR / dev-reports (`feedback_korean_commits.md`)
- ✓ role 풀네임 사용 (`feedback_role_naming_full.md`)
- ✓ 시크릿 (Service Account JSON) placeholder 만 — 실 값은 사용자 SSH 직접 (.env.example `GOOGLE_SERVICE_ACCOUNT_KEY=/etc/samhan/sa-key.json`)
- ✓ legacy 시트 ID + 16종 bootstrap + sendOrderFromUi 발송 그대로
- ✓ order-app v4 변경 0 — frontend RPC 시그니처 그대로 (옵션 C-2 backend 가 시트 → DB sync)
- 후속 PR: BE product-service spawn (`feature/migration-be-product-google-sheets-sync`), mock fallback 제거 (별도 PR), drive-client (logo/gate 이미지) 보강
- 모호 / 미결: `getSpecDetailMap_` 의 상세 spec 필드 전체 매핑 (1100라인 scanHome/scanSingle/scanComm) 은 후속 PR. 본 PR 은 모델 키 + 기본 슬롯 (pipeDia/gas/breaker/...) 만 보장.

## 9. TM 승인 흐름 (plan §12)

1. PM (Claude) 가 본 PR 발행 + CI watch
2. TL (FE 책임) 1차 리뷰 → 승인
3. PM (Claude) 통합 검토 → 개발책임자 머지 요청
4. 개발책임자 머지 (Squash) → 연관 issue 자동 close (없음 — feature 단독)
