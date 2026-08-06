# PR #1050 / 이슈 #1049 R10 — postfix 재수렴 리뷰

## 0. 결론

**PASS — 머지 차단 결함 0건.** 4종 × 4상황은 실제 BrowserRouter 화면에서 입력하고 후보를 선택·확정한 결과 16/16 PASS였다. 모달 후보 수도 현재 로컬 `[DEV-SEED]` DB의 검색 적중 수와 모두 같아 절단은 재현되지 않았다.

다만 R9의 **“FE 7개 호출 표면”은 누락은 없지만 집계 단위가 일관되지 않아 정확한 총괄 표현은 아니다.** 일관된 기준으로는 직접 HTTP 호출 함수 2곳, production UI 소비 표면 6곳이다. R9은 `productApi.searchProducts` 함수는 별도 표면으로 세면서 `productCatalogApi.searchProductSummaries` 함수는 `ProductFormPage`와 한 행으로 합쳤다. 따라서 “7”은 서로 다른 계층을 섞은 수치다.

비모달 상한 20의 반대급부도 실재한다. `[DEV-SEED]`에서 `AJ` 품목은 45건인데 안전재고 dropdown은 20건만 표시하여 25건이 넓은 검색어 결과에서 보이지 않는다. 다만 숨은 실제 품목 `AJ020FERPBC1`을 정확 코드로 다시 입력하면 후보를 선택할 수 있었다. 그리고 `main`도 같은 `size=20` 계약이므로 R9가 새로 만든 회귀는 아니며, 이 PR의 검색 모달 수정과 분리할 후속 UX 위험으로 판정했다.

검증 HEAD는 `0e5f3a42f81a8945f537b1377542b674ac060a30`이다. 코드 수정, git 조작, Docker 이미지 재빌드, 공유 DB write는 하지 않았다.

## 1. `/api/products` 독립 전수 목록과 R9 대조

### 1.1 조사 기준

R9 목록을 출발점으로 쓰지 않고 `clients/**` production 소스에서 정확한 `GET /api/products` 문자열, `searchProducts`, `searchProductSummaries`, 각 JSX 주입 지점을 다시 추적했다. 테스트, Playwright, mock handler, 캡처 스크립트, 문서, `POST /api/products/lookup`, `/api/products/{id}`, `/api/products/categories`, `/api/v1/products`는 production 검색 UI 소비 표면에서 제외했다.

### 1.2 직접 HTTP 호출 함수 — 2곳

| # | 직접 호출 위치 | 계약 | production 호출자 |
|---:|---|---|---|
| H1 | `clients/desktop/src/renderer/api/productApi.ts:47-60` `searchProducts` → `apiClient.get('/api/products')` | 기본 `size=20`; 호출자 override 가능 | U1~U5 |
| H2 | `clients/desktop/src/renderer/api/productCatalogApi.ts:426-435` `searchProductSummaries` → `apiClient.get('/api/products')` | 호출 인자 기본 `20` | U6 |

다른 production FE 직접 호출 함수는 발견되지 않았다.

### 1.3 실제 production UI 소비 표면 — 6곳

| # | 파일:줄 | 화면/용도 | H1/H2에 전달되는 상한 | 실제 사용자 검색 표면 |
|---:|---|---|---:|---|
| U1 | `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:726-727`, `:894-897` | 구성품 편집 `ProductAutocomplete` | 20 | 비모달 dropdown |
| U2 | `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:1470-1471`, `:1748-1752` | 기초품목 `ProductMultiSelectAutocomplete` | **10000** | 검색 결과 선택 모달 |
| U3 | `clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx:292-298` | 안전재고 품목 `ProductAutocomplete` | 20 | 비모달 dropdown |
| U4 | `clients/desktop/src/renderer/routes/SlipFormPage.tsx:1642-1645` | 전표 라인 품목 — 첫 responsive 렌더 분기 | 20 + `PARTNER_ORDER` | 비모달 dropdown |
| U5 | `clients/desktop/src/renderer/routes/SlipFormPage.tsx:1710-1713` | 전표 라인 품목 — 둘째 responsive 렌더 분기 | 20 + `PARTNER_ORDER` | 비모달 dropdown |
| U6 | `clients/desktop/src/renderer/routes/ProductFormPage.tsx:171-175` | 수정 화면 모델코드 내부 해소 | 20 | exact 중심 내부 조회 |

일관된 소비 UI 기준은 **6개 표면**이고 `size=10000`은 U2 한 곳뿐이다. 나머지 실제 UI 표면 5곳은 20이다.

### 1.4 R9의 7개 항목과 1:1 대조

| R9 항목 | 독립 대조 | 판정 |
|---|---|---|
| #1 `productApi.searchProducts` | H1 | 존재, 직접 HTTP 함수 |
| #2 구성품 | U1 | 존재 |
| #3 기초품목 모달 | U2 | 존재, 유일한 10000 |
| #4 안전재고 | U3 | 존재 |
| #5 전표 첫 분기 | U4 | 존재 |
| #6 전표 둘째 분기 | U5 | 존재 |
| 별도 행 `searchProductSummaries → ProductFormPage` | H2 + U6을 한 행으로 결합 | 존재 |

**빠진 production 소비 경로는 없다.** 그러나 H1은 별도로 세고 H2는 U6과 합쳤으므로 “7개 표면”이라는 총수는 균질하지 않다. 같은 계층으로 세면 HTTP 함수 2곳 또는 UI 표면 6곳이다. 함수와 UI 위치를 모두 코드 노드로 세면 8곳이다. 따라서 R9의 “7개가 실제 전수”라는 문장은 **항목 포괄성은 맞고 총수 표현은 부정확**하다.

## 2. 4종 × 4상황 실제 입력·선택

### 2.1 하네스와 데이터

- frontend: `vite.web.config.ts` BrowserRouter, `VITE_APP_VERSION=2026/08/03-1049`, `http://127.0.0.1:5204`
- API/DB: `http://127.0.0.1:8080`, 기존 `dev_master`, 로컬 `[DEV-SEED]`, GET 및 로그인만 사용
- browser driver: `clients/desktop/node_modules`의 로컬 Playwright Chromium, cwd `clients/desktop`
- design-system: 기존 junction과 현재 `dist`를 사용했다. junction/패키지 재설치나 소스 변경은 하지 않았다.
- 증거 기준: 아래 판정은 실제 input 입력, option/checkbox/radio 클릭, `선택 확정`, chip/controlled input 반영으로 정했다. API JSON이나 터미널 출력 자체를 화면 증거로 사용하지 않았다.

| 대상 | 상황 | 실제 입력 | 실제 선택 동작 | 선택 후 화면 결과 | 판정 |
|---|---|---|---|---|---|
| 품목 | 1건 | `030RXH` | 단일 후보 즉시 확정 | `실외기_3HP 다배관`, `1개 선택됨`, 입력 비움 | PASS |
| 품목 | 2건 이상 | `AJ` | modal checkbox 첫 2건 클릭 후 `선택 확정` | 후보 45건, `2개 선택됨`, modal 닫힘 | PASS |
| 품목 | 0건 | `1049-no-result` | 선택 대상 없음 확인 | `검색 결과 없음`, 칩 없음, 입력 유지 | PASS |
| 품목 | 정확 코드 | `AJ040RXH4BC1` | 단일 후보 즉시 확정 | `실외기_4HP 다배관`, `1개 선택됨`, 입력 비움 | PASS |
| 수신자 | 1건 | `김은지` | 실제 option `김은지/회계팀` 클릭 | `김은지 · 회계팀` 칩 1개 | PASS |
| 수신자 | 2건 이상 | `김` | modal checkbox 첫 2건 클릭 후 `선택 확정` | 후보 3건, 칩 2개 | PASS |
| 수신자 | 0건 | `1049-no-result` | 선택 대상 없음 확인 | `검색 결과 없음`, 칩 없음, 입력 유지 | PASS |
| 수신자 | 정확 코드 | `dev_accountant` | 실제 `[DEV-SEED] 개발회계` option 클릭 | `[DEV-SEED] 개발회계 · 회계팀` 칩 1개 | PASS |
| 거래처 | 1건 | `한울냉열시스템` | 실제 option 클릭 | controlled input `한울냉열시스템` | PASS |
| 거래처 | 2건 이상 | `010` | modal 첫 radio 클릭 후 `선택 확정` | 후보 5,606건, input `청담 동양파라곤 / 개인고객` | PASS |
| 거래처 | 0건 | `1049-no-result` | 선택 대상 없음 확인 | `검색 결과 없음`, 선택 없음, 입력 유지 | PASS |
| 거래처 | 정확 코드 | `010-2564-8488` | 실제 option 클릭 | controlled input `향남부평-(박동수)` | PASS |
| 담당자 | 1건 | `김은지` | 실제 option `김은지/회계팀` 클릭 | `김은지 (회계팀)` 칩 1개 | PASS |
| 담당자 | 2건 이상 | `김` | modal checkbox 첫 2건 클릭 후 `선택 확정` | 후보 3건, 칩 2개 | PASS |
| 담당자 | 0건 | `1049-no-result` | 선택 대상 없음 확인 | `검색 결과 없음`, 칩 없음, 입력 유지 | PASS |
| 담당자 | 정확 코드 | `dev_accountant` | 실제 `[DEV-SEED] 개발회계` option 클릭 | `[DEV-SEED] 개발회계 (회계팀)` 칩 1개 | PASS |

총 **16/16 PASS**다. “검색 중…” 행이나 단순 표시만 세지 않았으며, 1건/정확 코드에서도 실제 후보 선택 결과 또는 명시적인 단일 후보 즉시 확정을 확인했다.

## 3. 모달 경로 절단 0 유지

현재 화면 후보 수와 로컬 `[DEV-SEED]` DB의 동일 조건 적중 수를 읽기 전용으로 대조했다.

| 대상/입력 | modal UI 후보 | `[DEV-SEED]` DB 적중 | 차이 | 판정 |
|---|---:|---:|---:|---|
| 품목 `AJ` | 45 | 45 | 0 | PASS |
| 수신자 `김` | 3 | 3 | 0 | PASS |
| 거래처 `010`, ACTIVE | 5,606 | 5,606 | 0 | PASS |
| 담당자 `김` | 3 | 3 | 0 | PASS |

과거 R5~R7의 “5,612건”과 현재 거래처 수가 다른 것은 현재 `[DEV-SEED]` 적중 자체가 5,606건이기 때문이다. 현재 modal은 그 5,606개 radio를 전부 렌더했다. 따라서 현재 수치에서 6건 차이는 FE 절단이 아니다. 이 라운드는 DB write/audit 이력을 조사하지 않았으므로 과거 대비 6건 감소의 원인은 단정하지 않는다.

## 4. 비모달 `20` 복원의 반대급부

`[DEV-SEED]` 활성 품목에서 `AJ` 적중은 45건이고, 이 중 `PARTNER_ORDER|BOTH`도 45건이다. 안전재고 실제 화면에서 `AJ`를 입력했을 때 다음을 확인했다.

| 측정 | 결과 |
|---|---|
| 실제 요청 계약 | `size=20` |
| dropdown 실제 option | 20 |
| 검색 결과 선택 modal | 0 |
| DB 전체 적중 | 45 |
| 넓은 검색어에서 보이지 않는 수 | **25** |
| 숨은 품목 예 | `AJ020FERPBC1` — `AJ` 20개 option에는 없음 |
| 숨은 품목 정확 코드 재검색 | option 표시 후 클릭, input `AJ020FERPBC1` 반영 PASS |

따라서 **사용자가 `AJ` 같은 넓은 검색어만 알고 있으면 25건을 그 dropdown에서 발견하지 못한다.** 반면 모델코드나 더 좁은 문자열을 알면 해당 품목은 검색·선택할 수 있어 품목 자체가 완전히 도달 불가능한 것은 아니다.

이 상한은 R9가 새로 만든 동작이 아니다. `main`의 `productApi.searchProducts`도 `size:20`이며 R9는 PR 전 baseline을 복원했다. 구성품 U1, 안전재고 U3, 전표 U4/U5가 같은 H1 기본값을 사용한다. U6은 수정 route의 exact 모델코드 내부 해소라 넓은 후보 탐색 표면과 성격이 다르다. 결론적으로 이 25건은 **실재하는 기존 UX 한계이나 PR #1050의 머지 차단 회귀는 아니다.** 후속으로 pagination/“더 구체적으로 입력” 안내를 검토할 수 있다.

## 5. design-system 공용 변경의 PR 밖 영향

### 5.1 정적 소비 범위

이번 PR 대상 4화면(`EstimateItemsCatalogPage`, `MessengerPage`, `DepositorMappingPage`, `GroupwareApprovalCreatePage`)을 제외하고 production JSX를 다시 셌다.

| 공용 경로 | PR 밖 파일 | JSX 인스턴스 |
|---|---:|---:|
| `AsyncAutocomplete` 직접 | 1 | 1 |
| `MultiSelectAutocomplete` 직접 | 2 | 2 |
| 기존 단일 `ProductAutocomplete` | 2 | 3 |
| `PartnerAutocomplete` | 12 | 16 |
| 중복 파일 제거 합계 | **15** | **22** |

PR 밖 파일은 `JournalFormPage`, `ApprovalLineConfigPage`, `MergeConvertDialog`, `SafetyStockAlertsPage`, `SlipFormPage`, `BlockedPartnersPage`, `BankTransactionPage`, `CashReceiptFormPage`, `CollectionPlanPage`, `DailyClosingPage`, `EstimateFormPage`, `JournalStatusReportPage`, `NotesReceivablePage`, `SlipDetailPage`, `TaxInvoiceFormPage`다.

### 5.2 영향 판정

- 모달은 `resultSelectionMode` opt-in이라 위 기존 화면에 자동으로 켜지지 않는다.
- 그러나 `AsyncAutocomplete`의 draft 표시, focus/blur 정리, 검색 surface 종료 로직은 base 자체가 바뀌었으므로 **PR 밖 15개 화면도 코드 영향권**이다. “공용 컴포넌트 변경이 PR 밖에 영향 없음”이라고 표현하면 틀린다.
- PR 밖 실제 화면 표본인 안전재고에서 단일 dropdown 20건, modal 0, 정확 코드 선택을 확인했다.
- design-system 전체 Vitest는 **25 files / 171 tests PASS**였다. `productApi.search-modal.test.ts`도 **2/2 PASS**였다.
- 조사 중 홈멀티 `AJ` 입력에서 React `Maximum update depth exceeded` warning을 한 번 관찰했으나, 조건을 고정한 HOME_MULTI/SINGLE_SET 재실행에서는 각각 warning 0건으로 재현되지 않았다. 원인을 추측하거나 결함 수치로 확정하지 않는다.

즉, 공용 변경의 PR 밖 코드 영향은 **있다**. 다만 이번 라운드에서 확인한 unit 회귀와 안전재고 실 UI 표본에서는 차단 결함이 나오지 않았다.

## 6. 최종 판정

**PASS — 머지 차단 결함 0건.** 근거는 다음과 같다.

1. R9의 목록에는 production 소비 경로 누락이 없다. 단 “7개 표면”은 집계 계층을 섞은 부정확한 표현이며, 정확한 총수는 HTTP 함수 2곳 / UI 표면 6곳이다.
2. 4종 × 4상황의 실제 입력·선택·확정이 16/16 성립했다.
3. 현재 `[DEV-SEED]`에서 4개 modal 후보 수가 DB 적중 수와 동일해 절단 0이다.
4. 비모달 `AJ`는 45건 중 20건만 보여 25건이 넓은 검색에서 숨지만, 정확 코드로 선택 가능하고 `main`과 같은 기존 계약이다.
5. 공용 design-system 변경은 PR 밖 15개 화면/22인스턴스에 코드상 영향을 주지만, 전체 unit 171건과 안전재고 실 UI 표본은 통과했다.

R9 보고의 수치 표현과 비모달 20건 UX 한계는 본 보고서에서 숨기지 않았으며, 둘 다 현재 PR의 머지 차단 결함으로 판정하지 않았다.

## 7. 이 라운드가 보지 않은 것

- PR 밖 영향권 15개 화면 전부를 실제 UI로 순회하지 않았다. 안전재고를 대표 실측했고 나머지는 정적 소비 추적과 design-system 전체 unit으로 확인했다.
- 전표 U4/U5, 구성품 U1, ProductForm U6 각각에서 `size=20` 요청을 별도 UI 캡처하지 않았다. 동일 함수 인자와 호출부를 정적으로 추적했다.
- 전체 Desktop Vitest/Playwright, Electron HashRouter, Capacitor/mobile, 실제 Electron 패키지 화면은 실행하지 않았다.
- Docker 이미지를 재빌드하지 않았으며 backend 컨테이너가 HEAD Java source로 빌드됐다는 점은 검증하지 않았다.
- DB write가 필요한 메신저 발송, 입금자명 매핑 저장, 결재 생성, 품목 추가, 안전재고 저장은 하지 않았다.
- 5,606건 거래처 modal의 마지막 항목까지 스크롤하거나 마지막 항목을 선택하지 않았다. 다만 DOM radio 수와 DB 적중 수가 같고 첫 radio 선택·확정은 성립했다.
- 과거 5,612건에서 현재 5,606건으로 바뀐 원인과 DB audit 이력은 조사하지 않았다.
- 일회성 React warning의 root cause는 재현되지 않아 확정하지 않았다.
- 시각 회귀 전체, 모바일 반응형, 성능 장기 프로파일, 접근성 전체 감사는 조사하지 않았다.

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1049-r10-postfix-reconvergence.md`
