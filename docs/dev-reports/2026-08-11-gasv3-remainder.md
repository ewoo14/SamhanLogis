# GAS 전수조사 v3 — Critic 지적 분모 밖 잔여분

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 — 레거시 법칙 조사자  
> 범위: 읽기 전용 조사. 코드·스키마·Git 상태·`samhan-*`·공유 DB는 변경하지 않는다.

## 0. 완결성 집계

| 구분 | 배정 수 | business_rule | ui_only | infra_util | dead_code | 분류 완료 | 잔여 |
|---|---:|---:|---:|---:|---:|---:|---:|
| A. Critic 배정 실행 단위 | 799 | 16 | 758 | 25 | 0 | 799 | 0 |
| A. 순신규(중복 3 제거) | 796 | 13 | 758 | 25 | 0 | 796 | 0 |
| B. 71파일 밖 파일군 | 27파일 | 27 | 0 | 0 | 0 | 27 | 0 |
| C. 데드코드 기준 편차 | 8함수 | 0 | 0 | 0 | 8 | 8 | 0 |

### 0.1 A 배정 분해

| 구문군 | 배정 수 | v2 중복 | 순신규 | 분류 완료 | 잔여 |
|---|---:|---:|---:|---:|---:|
| 실제 메서드 누락 | 10 | 0 | 10 | 10 | 0 |
| IIFE | 19 | 3 | 16 | 19 | 0 |
| 조건부 함수 대입 | 10 | 0 | 10 | 10 | 0 |
| HTML/EJS 인라인 handler | 760 | 0 | 760 | 760 | 0 |
| **합계** | **799** | **3** | **796** | **799** | **0** |

## 1. 조사 기준과 재현 절차

1. v2 inventory의 71개 section에서 경로를 재추출했다(`FILES=71`).
2. JS/TS는 TypeScript AST로, HTML/EJS는 각 `script` block을 원래 offset과 함께 AST로 읽었다.
3. HTML handler는 `\b(on[a-z][\w:-]*)\s*=\s*(["'])([\s\S]*?)\2`로 전량 추출했다. 단순 호출의 재현식은 `^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^;{}]*\)\s*;?$`다.
4. 분류 단위는 A=실행 단위, B=파일, C=함수다. B 파일 안에 UI/인프라 코드가 함께 있어도 Critic이 지목한 이유인 업무 기대값·판단·DB 제약이 있으면 파일의 1차 성격을 `business_rule`로 판정했다.
5. read-only 대조에만 `git ls-files`와 `gh issue list --state all --limit 2000`을 사용했다. checkout/add/commit/push 등 Git 상태 변경은 하지 않았다.

### 1.1 Critic 수치와 맞추는 제외 규칙

- 메서드 AST 후보는 11개였으나 `clients/web/estimate-app/views/index.ejs:1267 get`은 v2 inventory에 `:1266 get`으로 이미 들어 있다. 줄 offset 1 오차이므로 신규에서 제외해 10개다.
- IIFE AST 후보는 21개다. Critic의 19는 에어디자이너 `Code.js:772 specCol`과 제이시스템 `Code.js:715 specCol`만 제외한 값이다. 그러나 inventory에는 `iDuct` 3개도 각각 `:1597`, `:1465`, `:1212` arrow로 이미 들어 있다. 따라서 Critic 배정 19는 모두 분류하되, **순신규 IIFE는 16개**다.
- 조건부 property 함수 대입 10개는 dialog polyfill 8개와 `mapObj.clear` wrapper 2개다. 조건부 DOM `onclick` property 대입은 HTML 속성 handler 760과 다른 script 실행 단위지만 Critic의 배정 10에는 포함되지 않았으므로 임의로 분모를 늘리지 않았다.

## 2. A — 분모 밖 실행 단위 799개 전량 분류

### 2.1 실제 메서드 10개

| 파일:줄 · 메서드 | 분류 | 근거 |
|---|---|---|
| `clients/web/estimate-app/lib/apps-script-shim.js:292 getName` | infra_util | `FakeSheet` 이름 접근자 |
| `.../apps-script-shim.js:336 getLastRow` | infra_util | 시트 shim row count |
| `.../apps-script-shim.js:347 getId` | infra_util | spreadsheet shim ID 접근자 |
| `.../apps-script-shim.js:442 getName` | infra_util | fake blob 이름 접근자 |
| `.../apps-script-shim.js:443 getMimeType` | infra_util | fake blob MIME 접근자 |
| `.../apps-script-shim.js:457 getName` | infra_util | fake file 이름 접근자 |
| `clients/web/order-app/src/main.ts:62 getQuantitySyncRules` | business_rule | 서버 규칙을 읽고 `selectSingleS03Rule`로 선택한 뒤 ready/error 상태를 결정 |
| `clients/web/order-app/src/samhanApi.ts:442 call` | infra_util | legacy RPC 이름→HTTP handler bridge |
| `.../samhanApi.ts:463 fetchBootstrap` | infra_util | bootstrap envelope 해제/HTTP 호출 |
| `.../samhanApi.ts:489 fetchQuantitySyncRules` | infra_util | 수량 규칙 HTTP adapter |

소계: business_rule 1 / ui_only 0 / infra_util 9 / dead_code 0 = 10.

### 2.2 IIFE 19개

| 파일:줄 | 범위/역할 | 분류 |
|---|---|---|
| `clients/web/estimate-app/lib/code.js:1597` | `덕트구경/덕트 구경` 열 선택 `iDuct` | business_rule (v2 중복) |
| `clients/web/estimate-app/views/index.ejs:1259` | `google.script.run` RPC shim 설치 | infra_util |
| `.../index.ejs:1299`, `:1318` | theme 초기화/토글 등록 | ui_only (2) |
| `.../index.ejs:2232` | dialog polyfill bootstrap | infra_util |
| `.../index.ejs:13881` | 할인율 분리 적용: `buildSendRows/openPreview` wrapper | business_rule |
| `clients/web/order-app/index.html:15` | Apps Script SSR bootstrap 호환층 | infra_util |
| `.../index.html:652`, `:665` | theme 초기화/토글 등록 | ui_only (2) |
| `.../index.html:1336` | dialog polyfill bootstrap | infra_util |
| `.../index.html:8047` | 할인율 분리 적용 wrapper | business_rule |
| `tools/legacy-gas/가입고처리/Index.html:912`, `:921` | 결과표 filter UI와 열별 closure | ui_only (2) |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1465` | `덕트구경` 열 선택 `iDuct` | business_rule (v2 중복) |
| `.../index.html:1298` | dialog polyfill bootstrap | infra_util |
| `.../index.html:7678` | 할인율 분리 적용 wrapper | business_rule |
| `tools/legacy-gas/종합견적서/Code.js:1212` | `덕트구경` 열 선택 `iDuct` | business_rule (v2 중복) |
| `.../index.html:2134` | dialog polyfill bootstrap | infra_util |
| `.../index.html:13294` | 할인율 분리 적용 wrapper | business_rule |

소계: business_rule 7 / ui_only 6 / infra_util 6 / dead_code 0 = 19.

### 2.3 조건부 함수 대입 10개

| 파일:줄 | 대입 | 분류 |
|---|---|---|
| `clients/web/estimate-app/views/index.ejs:2235`, `:2236` | `HTMLDialogElement.prototype.showModal/close` | infra_util (2) |
| `clients/web/order-app/index.html:1339`, `:1340` | 동일 dialog polyfill | infra_util (2) |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1301`, `:1302` | 동일 dialog polyfill | infra_util (2) |
| `tools/legacy-gas/종합견적서/index.html:2137`, `:2138` | 동일 dialog polyfill | infra_util (2) |
| `clients/web/estimate-app/views/index.ejs:4622` | `mapObj.clear`가 `ABSOLUTE_LOCK`도 해제하도록 wrapper | infra_util |
| `tools/legacy-gas/종합견적서/index.html:4196` | 위 wrapper 원본 | infra_util |

소계: business_rule 0 / ui_only 0 / infra_util 10 / dead_code 0 = 10.

### 2.4 HTML/EJS 인라인 handler 760개

속성별 `onclick 595 + onchange 90 + onfocus 40 + oninput 33 + onkeydown 2 = 760`이다. 파일별 합도 다음과 같이 정확히 760이다.

```text
종합견적서 111; 포팅 견적 EJS 109; 지방가배차 44;
DPS 입고 41; 일마감 41; 품목별 DPS 41; 내일전표 32; 가입고 31;
미배차 31; 전표정리 31; 배차문자 30; 알리고 30; 계산서 27;
운송사대조 27; 원장 26; 거래명세서 23; 가배차 20; 포팅 주문 18;
원본 주문 17; 영업수수료 14; 에어디자이너 8; 제이시스템 8.
```

단순 member/name 호출 680개는 속성 자체에 분기·상수·산식이 없는 UI wiring이므로 전부 `ui_only`다. 복합문 80개는 49개 고유 본문으로 묶어 전량 확인했다. 업무판단이 속성 안에 실제로 박힌 것은 아래 8개다.

| 위치 | 건수 | 속성 본문 | 분류·이유 |
|---|---:|---|---|
| 포팅 견적 `:18858` + 원본 견적 `:18120` | 2 | 숫자와 `-` 외 제거 후 `updateCustomSubtotal` | business_rule: 음수 허용 입력 계약 |
| 포팅 견적 `:18867` + 원본 견적 `:18129` | 2 | 숫자/`-` 외 제거, 천단위 포맷 후 소계 | business_rule: 음수·금액 정규화 계약 |
| 원장 `:1015` + 거래명세서 `:896` | 2 | `innerText`에서 숫자 외 제거 | business_rule: 수량/금액 입력 허용범위 |
| 내일전표 `:173`, `:176` | 2 | 눈 선택 시 비, 비 선택 시 눈을 강제 해제 | business_rule: 기상상태 상호배타 |

나머지 복합 72개는 active page 전환, DOM 값 복사, 모달 닫기, template 인자 주입, 파일/이력/인쇄 버튼 연결이다. 분기 자체가 화면 상태/DOM 존재 여부만 판단하며 금액·출고·회계·배차 결과를 정하지 않으므로 `ui_only`다. 따라서 handler 소계는 business_rule 8 / ui_only 752 / infra_util 0 / dead_code 0 = 760.

### 2.5 A 합계

Critic 배정은 `메서드(1/0/9/0) + IIFE(7/6/6/0) + 조건부 대입(0/0/10/0) + handler(8/752/0/0) = 16/758/25/0 = 799`다. 여기서 inventory 중복 `iDuct` business_rule 3개를 빼면 순신규는 `13/758/25/0 = 796`이다.

## 3. B — 71파일 밖 파일군 27개 전량 분류

27개 모두 파일의 1차 성격이 `business_rule`이다. fixture/oracle도 기대값과 허용 경계를 고정하므로 규칙 정본으로 포함했다.

| 범주 | 파일 | 규칙 증거 |
|---|---|---|
| golden | `clients/web/legacy-quantity-golden/fixtures.js` | `:183` 이후 S/C family·source quantity·option fixture |
| golden | `.../goldens.js` | `:58`, `:106` 견적/주문 option 기대값 |
| golden | `.../legacyQuantityBoundary.js` | `:87`, `:108` 앱별 quantity helper allowlist; `:493` boundary evaluator |
| golden | `.../priceParityS3Cases.js` | `:89-90` 실제 가격 snapshot과 S3 parity case |
| golden | `.../r23HomeMultiCatalog.js` | `:5-603` R23 홈멀티 catalog 기대 입력 정본 |
| 인쇄 | `clients/desktop/src/renderer/print/printAmounts.ts` | line total·공급단가·VAT 분해/반올림 |
| 인쇄 | `.../TaxInvoiceView.tsx` | 계산서 행 날짜·공급가·VAT·공급받는자 표시 계약 |
| 인쇄 | `.../StatementBatchView.tsx` | 거래명세서 행/합계와 공급자·공급받는자 snapshot |
| 인쇄 | `.../NextDaySlipView.tsx` | 내일자 수량·창고·전표 표시 계약 |
| 인쇄 | `.../PartnerLedgerView.tsx` | `:93` 정렬, `:250-252` 차변/대변/기말잔액 합산 |
| 서비스 | `.../PriceCalculationService.java` | DC 우선순위·정률/정액·반올림·유효일 계산 |
| 서비스 | `.../DcConfigService.java` | 거래처 DC fallback과 설정 갱신 계약 |
| 서비스 | `.../RegionClassifier.java` | 주소 keyword/우선순위 지역 분류 |
| 서비스 | `.../RegionalService.java` | 지방 배차 필터·정렬·표시주소 |
| 서비스 | `.../BundleExpander.java` | 구성품 전개·수량·가격 배분·반올림 |
| 서비스 | `.../DpsCompareService.java` | DPS match key와 LEFT/RIGHT/일치 판정 |
| migration | `arologis-service/.../V3__add_region_dispatch_classification.sql` | 지역 group·sort order·활성 분류 상태 |
| migration | `dc-config-service/.../V1__init_dc_config.sql` | `:53-64` DC/정액/round 기본과 `:90-107` rule priority/effective range |
| migration | `dc-config-service/.../V2__add_unit_processing_flag.sql` | `:15` 단위처리 기본 `FALSE` |
| migration | `dc-config-service/.../V4__add_estimate_config.sql` | 견적 global DC·round 설정 |
| migration | `dc-config-service/.../V5__add_estimate_option_defaults.sql` | 옵션별 기본 선택/할인 상태 |
| migration | `product-service/.../V3__migration_extension.sql` | bundle mode/qty mode/default, 가격이력, 추천/분기관 lookup 허용 상태 |
| migration | `product-service/.../V10__odu_indoor_capacity_nullable.sql` | null capacity의 unique/equality 의미 |
| migration | `product-service/.../V22__add_price_change_schedule.sql` | 가격 유효일 schedule |
| migration | `product-service/.../V23__add_price_change_schedule_default_variant.sql` | 기본 가격 variant |
| migration | `product-service/.../V24__quantity_sync_rule_schema.sql` | source/target/condition/수량 sync 규칙 계약 |
| migration | `product-service/.../V26__align_price_change_schedule_to_live_gas.sql` | live GAS와 가격 일정 정렬 |

소계: golden 5 + 인쇄 5 + 서비스 6 + migration 11 = business_rule 27파일.

## 4. C — 데드코드 기준 편차 정정

Critic이 지목한 8개는 모두 원본 `tools/legacy-gas/종합견적서/index.html`과 포팅 `clients/web/estimate-app/views/index.ejs` 양쪽에서 정의 외 token 참조가 0이다. manifest trigger, inline handler, `google.script.run`, timer 문자열에도 없다. 따라서 ⑤의 동일 기준, 즉 **dead_code 판정이 옳다**.

| 함수 | 원본 정의 | 포팅 정의 | 원본/포팅 token 수 | v2 ① 오분류 → 정정 |
|---|---:|---:|---:|---|
| `getRealSpec` | `:2383` | `:2680` | 1 / 1 | business_rule → dead_code |
| `openFinal` | `:8562` | `:9273` | 1 / 1 | ui_only → dead_code |
| `copyToClipboardImage` | `:10558` | `:11139` | 1 / 1 | ui_only → dead_code |
| `downloadFile` | `:10597` | `:11178` | 1 / 1 | ui_only → dead_code |
| `initValidationEvents` | `:14623` | `:15216` | 1 / 1 | ui_only → dead_code |
| `loadOrderData` | `:15276` | `:15875` | 1 / 1 | business_rule → dead_code |
| `fillCustomer` | `:15860` | `:16594` | 1 / 1 | ui_only → dead_code |
| `hideAllPages` | `:16956` | `:17704` | 1 / 1 | ui_only → dead_code |

C 합계: dead_code 8. 원본 파티션과 포팅 파티션에 서로 다른 root allowlist를 적용한 것이 편차의 원인이었다.

## 5. 원본에만 있는 업무규칙 이름 257개

### 5.1 집계

| 분류 | 수 | 판정 기준 |
|---|---:|---|
| 유실 | 22 | 이식할 업무 기능인데 production source에서 정확 심볼과 의미 대응 구현을 모두 찾지 못함 |
| 대체 | 109 | 이름은 달라도 현재 client/service의 구체 대응 함수·클래스가 있음 |
| 불필요 | 77 | GAS/Notion/Sheet/XLSX/DOM 직접 조작 adapter, 범용 표시 helper, 확정 dead, 또는 채택 금지 SHA-256 이관 |
| 판정보류 | 49 | 기능 존폐 결정, vendor 표본, 외부 Ecount 계약, partial parity 근거가 부족 |
| **합계** | **257** | **22+109+77+49=257** |

### 5.2 유실 22개 — 함수별 grep 증거

공통 grep 범위는 `clients services`, 제외는 `node_modules/build/out/dist/test/tests/__tests__`다. 정확 심볼 검사는 함수 정의형(`function NAME` 또는 `const|let|var NAME =`)으로 했고 22개 모두 0건이다. 의미 grep은 다음 다섯 개다.

```text
G-SALES    class/record/interface Commission, commission settlement, 수수료 정산,
           제경비율, 선지급 수수료                                  => 0건
G-LEDGER   production source의 9199|9549|1089                       => 0건
G-DISPATCH 야적미배차|지방미배차|회계방|단톡방 멘트 병합|하차일 parser => 0건
G-ALIGO    요일×지역 cohort|골프회|suppression registry             => 0건
G-VENDOR   에어디자이너/제이시스템 주문·OCR, special unit price,
           납기-출고 calendar, warehouse reason, OCR provenance     => 0건
```

`G-SALES`의 넓은 문자열 검색에서 product model code `영업수수료/판매수수료`만 나왔으나 정산 domain/service/entity가 아니어서 대응 구현에서 제외했다. `G-VENDOR`의 숫자 `45000` 검색도 mock/다른 금액만 나와 특가 규칙 증거가 아니었다.

| # | 원본 함수·정의 | 유실 기능 | grep 결과 |
|---:|---|---|---|
| 1 | `setPay` — 영업수수료 `Index.html:262` | 카드/현금에 따른 카드 3% 적용 상태 | 정확 정의 0 + G-SALES 0 |
| 2 | `setWht` — `:274` | 원천징수 3.3% 적용 상태 | 정확 정의 0 + G-SALES 0 |
| 3 | `setExp` — `:285` | 제경비 8%/수기율 모드 | 정확 정의 0 + G-SALES 0 |
| 4 | `getExpenseRate` — `:297` | 무제한 수기율 또는 8% 기본 | 정확 정의 0 + G-SALES 0 |
| 5 | `xround` — `:318` | 음수 대칭 원단위 반올림 | 정확 정의 0 + G-SALES 0 |
| 6 | `getValues` — `:323` | 카드·장비대·제경비·원천·설치·안전·선지급·VAT 전체 산식 | 함수 정의 0 (`Range.getValues` 동명이의어만 존재) + G-SALES 0 |
| 7 | `recalc` — `:359` | 정산 결과 재계산/동기화 | 정확 정의 0 + G-SALES 0 |
| 8 | `renderDoc` — `:382` | 지급품의서·매입계산서 정산 문서 | 정확 정의 0 + G-SALES 0 |
| 9 | `parseAccountLedger` — 원장 `Index.html:890` | 9199/9549/1089 차·대변 특례 fold | 정확 정의 0 + G-LEDGER 0 |
| 10 | `checkDuplicatesFor` — 배차문자 `Index.html:617` | 날짜+전표 중복/모호성 판정 | 정확 정의 0 + G-DISPATCH 0 |
| 11 | `getDeliveryInitialState` — 미배차 `Index.html:761` | 보류/해당없음/야적/지방/미배차 우선순위 | 정확 정의 0 + G-DISPATCH 0 |
| 12 | `executePromo` — 알리고 `Index.html:616` | 요일×지역 홍보 cohort | 정확 정의 0 + G-ALIGO 0 |
| 13 | `executeGolf` — `:681` | 골프회 별도 cohort/source | 정확 정의 0 + G-ALIGO 0 |
| 14 | `initDayMappingUI` — `:472` | 요일별 지역 mapping 정책 입력 | 정확 정의 0 + G-ALIGO 0 |
| 15 | `decideWarehouseFromItems_` — 에어디자이너 `Code.js:471` | 품목 keyword 기반 창고 결정 | 정확 정의 0 + G-VENDOR 0 |
| 16 | `detectWarehouseFromItems_` — 제이시스템 `Code.js:2490` | vendor별 창고 결정/이유 | 정확 정의 0 + G-VENDOR 0 |
| 17 | `overrideSpecialUnitPrice_` — 제이시스템 `Code.js:490` | 45,000원 특가 override | 정확 정의 0 + G-VENDOR 0 |
| 18 | `parseKoreanTimeWindow_` — `Code.js:1870` | 오전/오후/시간창 parser | 정확 정의 0 + G-VENDOR 0 |
| 19 | `parseOrderFromText_` — 에어디자이너 `Code.js:1331` | vendor 주문서 본문 parser | 정확 정의 0 + G-VENDOR 0 |
| 20 | `extractItemsVerticalList_` — 제이시스템 `Code.js:1703` | 세로 품목 목록 parser | 정확 정의 0 + G-VENDOR 0 |
| 21 | `extractItemsLooseRow_` — 제이시스템 `Code.js:1842` | 느슨한 행 품목 parser | 정확 정의 0 + G-VENDOR 0 |
| 22 | `processMemoAndCustomer_` — 에어디자이너 `Code.js:1594` | 메모 기반 고객/배송 계약 | 정확 정의 0 + G-VENDOR 0 |

### 5.3 대체 109개

전량 목록:

```text
buildSingleSetCompositionHtml_, canOpenBranch, canOpenBranchFromComm, extractIncreasePrices_,
extractSingleIncreasePrices_, fetchNotionDcConfig_, fetchOrderHistory, getActiveBizNosFromLog_,
getActiveBizNosFromShipping_, getCommIncreasePrices_, getHomeIncreasePrices_, getOrderHistory,
getOrderSnapshotHistory, getPriceIncData_, getQuoteHistory, getQuoteHistoryByCustomer,
getSingleIncreasePrices_, getSinglePartsIncreasePrices_, getSpecMap_, getTargetClients_,
isSoldOutByNote_, processLongTermUnusedClientsFast, saveOrderSnapshot, saveQuoteSnapshot, scanComm,
scanHome, scanSingle, setPreviewFoot, updateClientStatus_, applyExceptionRealtime, classifyComp,
clean_item_name_, cleanCustomerName, exportToExcel, extractDiscountNumbers, extractModelToken_,
isTargetModelCode_, loadPriceMap_, loadSingleSetCatalog, processDailyData, reclassifyTabs, addOrder,
applyPricing_, applyPricingWithDC_, applySingleSetDiscount_, build_classification_item,
buildSingleSetMap_, chowol_except_region, chowol_with_region, classify, clean_special_spec,
cleanModelName, cmp, downloadData, executeAllClients, expandSingleSetItems_, extract_item,
extract_yajek_item, extractNumbers, fetchExternalData, get_region_index, getCombinedLocalPhones,
getCustomerList_, getHomeModelOrder_, getHomeModelPriceMap_, getManagers_, getMasterModelOrder_,
getMasterSpecMap_, getPricingConfig_, getRegionCode, getRegionFromNotion,
getSingleSetDiscountTotal_, isHomeMultiCode_, isSingleCode_, keyG, keyHome, loadModelNameMaps_,
lookupCustomerMemos_, lookupEcount, makeOrderedFinalItems, mergeNotionIntoMatrix_, normalizePhoneJS,
normalizeSep_, normModel, parse_address, parseDcRate_, process_address_for_search,
process_address_for_search_local, process_pd_to_final, processManagerJS, pushGrouped, region_only,
roundToStep_, runClassification, sangil_chowol_except_region, sangil_chowol_with_region,
sangil_except_region, sangil_with_region, skip_warehouse_filter, sortData, syncServerData, takeOne,
yajeok_only, assembleMents, getForbiddenData, getChatMapData, rowTargetDay, processDispatchData,
driverPhone
```

대응 지목:

| 원본 이름군 | 우리 대응 |
|---|---|
| snapshot/history 8종 (`get/save*History/Snapshot`, `fetchOrderHistory`) | `QuoteSnapshotController/Repository`, `PartnerOrderHistoryService`, `PartnerOrderDraftService`, `samhanApi` bridge |
| price increase 7종 (`extract/get*IncreasePrices_`, `getPriceIncData_`) | 현재 `getPriceIncData_` bridge + product price change schedule V22/V23/V26 |
| DC/장기미발주 (`fetchNotionDcConfig_`, `getActive*`, `getTargetClients_`, `updateClientStatus_`, `processLongTerm...`) | `DcConfigService`; `PartnerApprovalService`/`PartnerActivityController` (활동 기준 semantic delta는 기존 기능 결함) |
| spec/표시 (`scanHome/Single/Comm`, `getSpecMap_`, `isSoldOutByNote_`) | `ProductSheetSyncService`, `ProductSpec`, `EstimateCatalogInternalController` |
| 세트/branch/preview client helper | 포팅 `index.ejs/index.html`의 동명 함수와 `BundleExpander` |
| 회계 12종 (`applyExceptionRealtime`~`reclassifyTabs`) | `HometaxExportService`, `DailyClosingService`, `LegacyModelKindClassifier`, `LegacySetMatcher` |
| 지역 분류 이름군 (`*_region`, `parse_address`, `sangil/chowol/yajeok`, `build_classification_item`) | `RegionClassifier`, `RegionalService`, `RegionImportService` |
| 가격·세트 이름군 (`applyPricing*`, `buildSingleSetMap_`, `expandSingleSetItems_`, catalog/order helpers) | `PriceCalculationService`, `DcConfigService`, `BundleExpander`, product catalog API |
| 거래처/알리고 이름군 (`executeAllClients`, phone/region/customer/manager/sync helpers) | `PartnerAligoExportService`, `AligoAddressBookSyncService`, `RestClientAligoCsvSourceClient`, partner APIs |
| DPS/비교 정규화 (`cleanModelName`, `cmp`, `sortData`) | `DpsExcelParser`, `DpsCompareService`, `DispatchReconcileService` |
| 배차문자 (`assembleMents`, `getForbiddenData`, `getChatMapData`, `rowTargetDay`, `processDispatchData`) | `DispatchMessageGroupComposer`, `BlockedPartnerLookupClient`, `ChatRoomMappingService`, `DispatchBatchPreviewService` |
| 기사 연락처 (`driverPhone`) | `DispatchBatchPreviewService.resolveDriverPhone`, `SlipClient` recipient/driver contact adapter |

### 5.4 불필요 77개

```text
comma, debugIndoorsScan, getRealSpec, loadOrderData, removeCustomRow,
setBranchTopButtonForBranch, drawImage, drawInvoiceCanvas, extractAndRenderDates,
extractReceiptData, extractSheetData, findCol, fmt, fmtAmt, formatDf, formatInput, formatNum,
formatReceipt, handleFile, markCompleted, names, normCode, normPhone, numToKorean, parseAnyDate,
parseDateCol, parseDateColReceipt, parseNoToDate, parseNum, processExcelData, processLocalData,
remarkCompleted, renderTable, renderTableData, resetForm, restoreState, runProcess, sStr,
setFilterToggle, setMultiToggle, toggleBeforeHike, toNum, unmarkCompleted, updateFooterSums,
updateMergedTextVal, updateVal, validateExcelFormat, money_to_int_, buildNotionDict_,
buildTargetLinks_, cleanupSeps_, fetchCsvData, fetchNotionPricingForCustomer_, fillMap, findIdx,
findRightmostHeaderIndex_, firstCodeToken_, formatPct_, formatPrefix, formatShortKrwMinus_,
generateFormatStr, handleExtract, hashPassword_, main, migratePasswordsToHash,
notion_extract_dc_, openEcountModal, processOne_, removeSegment_, sendFromPreview, sendNow,
startUpdateCore_, startUpdateFromExcel_, stripNotionSegments_, stripNotionSegmentsAll_,
syncEcountChunk, take
```

판정 이유: 앞의 dead 6종, 브라우저 DOM/canvas/render helper, 업로드 XLSX/CSV 열 탐색·날짜 포맷, Google Sheet/Notion 직접 갱신, 화면 modal/orchestrator다. `hashPassword_`/`migratePasswordsToHash`는 unsalted SHA-256을 신규 인증계약으로 이식하면 안 되므로 credential reset/modern hash 경로로 폐기한다.

### 5.5 판정보류 49개

| 보류 이유 | 이름 |
|---|---|
| 예측 기능 존폐 미결 | `analyzeFiltered`, `getChartData`, `processModelData`, `updateChart` |
| 교육 상태 domain 존폐 미결 | `checkAndUpdateNotion` |
| vendor OCR/세트/수량 parity 표본 부족 | `_coerceQtyToken_`, `aliasModelIfNeeded_`, `buildItemsInPreviewOrder_`, `buildOrderQtyMap_`, `capQtyToOrder_`, `detectOptionsFromRawName_`, `distributeSetPrice_`, `extractItemsFromTable_`, `fixLargeQty_`, `fmtMoney`, `getZeroOKeyCandidates_`, `groupRank_`, `isBolt`, `isLikelyCode_`, `mergeKeepLastScoped_`, `mergeSrcItemsByModel_`, `orderIndex_`, `parseShortDiscount_`, `pickQtyToken_`, `sortFinalItemsForSend_`, `sortItemsForSend_`, `squashConsecutiveSpecs_`, `squashPreviewSets_`, `tryMatch` |
| Ecount 구매/판매전표·가입고 외부계약 미확정 | `confirmEcount`, `proceedToDateModal`, `processData`, `processNextBatch`, `runMatching`, `sendOrderToEcount_`, `sendToEcountAPI` |
| 이름이 범용이고 legacy 특례를 현 service가 흡수했는지 fixture 대조 부족 | `checkDuplicates`, `extractNum`, `fmtMinusUnit`, `isExcludedByName`, `isExcludedByWord`, `recalcRow`, `boolKey`, `chk`, `norm`, `pct`, `resetCounters`, `sel`, `won` |
보류 합은 `4+1+24+7+13=49`이다.

## 6. Critic이 지적한 결정 목록 누락 2건

### 6.1 사전 대조 결과

- `git ls-files`에서 commission/수수료 이름의 구현 파일은 0건이었다. 원장 파일·`PartnerLedgerContract` 계열은 다수 존재한다.
- `gh issue list --state all --limit 2000`은 205건을 반환했다. 수수료 정산 전체 domain을 소유한 issue는 없다. #1144는 회계전표·세금계산서 연결 gate라 영업수수료 정산을 포함하지 않는다.
- 계정은 #1072 OPEN이 이미 **이카운트 계정과목 체계(1089·4019·2519)를 정본으로 결정**했다. 따라서 “1089를 정본으로 할까요?”는 다시 묻지 않는다. #1001/#1014는 원장 표시·문서 history로 CLOSED이며 9199/9549 특례 효과를 정하지 않았다.
- 집PC 실측 `9199/9549/1089 = 0건`은 개발책임자 제공값을 사용했다. 공유 DB 조회는 하지 않았다.

### 결정 1. 영업수수료 전체 정산 domain의 존폐와 계약

1. **무엇을 정해야 하나**: 단순 수기율 제한이 아니라 카드수수료·장비대·제경비·원천징수·설치비·안전관리비·선지급·VAT·지급품의서/매입계산서를 한 정산 단위로 이식할지 정해야 한다. 이미 확정된 “수수료 수기율 제한 없음”은 A/B 어느 안에서도 그대로 적용한다.
2. **레거시 현재 동작**:
   - `tools/legacy-gas/영업수수료 계산/Index.html:298-301` — `manual`이면 입력값 `/100`, 아니면 `0.08`.
   - `:318-319` — `return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));` (음수 대칭 반올림).
   - `:331-340` — 카드 `-total*0.03`, 영업수수료 `total-equip+card`, 원천 `-3.3%`, 설치 `-8%`, 선지급은 `payout`에서만 공제, 계산서 공급가/VAT는 `subtotal` 기준.
3. **후보안과 대가**:
   - A. versioned 수수료 계약 + settlement/entity + 지급품의/매입계산서 snapshot. 대가: 신규 domain·권한·감사·세금계산서 연결과 migration 필요.
   - B. 영속 정산 없이 read-only 계산/문서 report만 제공. 대가: 재현·감사·재발급·회계전표 연결이 약함.
   - C. 기능 폐기. 대가: 현재 수기/외부 계산으로 남고 22 유실 중 수수료 8개를 의도적 폐기로 돌려야 함.
4. **권고**: **A**. 금액 산식 전체가 production source와 issue 모두 0건이고, 수기율 한 항목만으로 축소할 수 없다.

### 결정 2. 원장 9199/9549/1089 특례 효과

1. **무엇을 정해야 하나**: #1072의 “1089 계정 정본” 결정을 유지하면서, 레거시의 `9199 대변→판매`, `9549 차변→수금`, `1089 차변→판매/대변→수금` 효과를 chart/effect mapping에 넣을지, 현재 0건을 근거로 의도적으로 폐기할지 정해야 한다.
2. **레거시 현재 동작**:
   - `tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:704` — `if (lr.account === '9199') sAmt = lr.credit;`
   - `:705` — `else if (lr.account === '9549') rAmt = lr.debit;`
   - `:706` — `else if (lr.account === '1089') { sAmt = lr.debit; rAmt = lr.credit; }`
   - 현재 계약은 `shared/common/.../PartnerLedgerContract.java:23`의 `SALE/PAYMENT/ADJUSTMENT/NONE`, `:107-119`의 effect fold이고 production source에 세 코드 literal은 0건이다.
3. **후보안과 대가**:
   - A. #1072 acceptance criterion에 effective-date account→effect/direction mapping을 추가. 대가: 계정 정본 전환 범위가 커지지만 미래 데이터도 재현 가능.
   - B. 집PC 0건을 근거로 9199/9549 특례는 폐기하고, 1089는 #1072 일반 정본 계정 효과만 사용. 대가: 과거/다른 PC에 해당 전표가 나오면 legacy 잔액과 달라질 수 있음.
   - C. 과거 import snapshot에만 특례를 적용하고 신규 분개는 #1072 정본 효과. 대가: import provenance/effective date가 필수.
4. **권고**: **C**, 단 현재 0건이므로 즉시 hard-code하지 않는다. 새 결정 issue를 만들기보다 **기존 #1072에 acceptance criterion으로 귀속**하고, 9199/9549/1089 행이 0이면 no-op, 나타나면 import provenance 기준으로만 적용한다. #1072가 이미 정한 1089 정본 여부는 다시 질문하지 않는다.

## 7. 미완료·한계

배정 수 기준 잔여는 0이다. 다만 판정보류 49개는 분류 자체가 완료된 것이며, 해소하려면 예측/교육/vendor/Ecount 정책 결정과 실제 표본이 필요하다. 본 보고서는 코드·스키마·Git 상태·공유 DB를 변경하지 않았다.
