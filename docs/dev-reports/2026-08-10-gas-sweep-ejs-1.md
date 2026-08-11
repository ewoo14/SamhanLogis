# GAS 전수조사 — ejs-1: `clients/web/estimate-app/views/index.ejs` 1~3300행

> 조사 대상: `clients/web/estimate-app/views/index.ejs` 1~3300행 (원본 소스 라인 기준, GAS/JS 인라인 스크립트)
> 고정 분모: `docs/dev-reports/2026-08-10-gas-function-inventory.md`
> 조사 원칙: 코드·테스트·스키마·마이그레이션·git 변경 없이 레거시 법칙만 조사한다. 수량은 절대 이름/구성에서 추론하지 않는다 — 수량동기화 설정값만이 수량을 정한다(개발책임자 확정 규칙).

## 1. 완결성 집계

```text
배정 범위 항목 수      68        (인벤토리 원문 1262~3290행, 3300행 경계 직전까지)
분류한 항목 수         68        ← 배정 범위 항목 수와 일치
  ├ 업무규칙 (이식 대상)     27
  ├ UI·표시 전용             13
  ├ 인프라·유틸              21
  └ 데드코드(호출부 없음)     7      27+13+21+7 = 68
미분류 항목 수            0
```

인벤토리 원문에서 1~3300행 범위에 속하는 항목은 `1262:function makeRunner(){` 부터 `3290: const isAcc = ...`(adjustSingleSetBasePrice 내부)까지 총 68개다. 다음 항목인 `3317:function roundK(n){`는 3300행을 넘어가므로 배정 범위 밖(ejs-2 이후 담당)이다. 인벤토리가 최상위 `function` 선언뿐 아니라 그 안의 의미 있는 `const ... =>` 중첩 helper까지 함께 추출했으므로, 이 보고서도 68개 항목 전부(중첩 helper 포함)를 개별 분류했다 — 부모 함수만 세고 중첩을 누락하면 분모가 어긋난다.

## 2. 전수 분류표 (68/68)

| # | 줄 | 함수/항목 | 분류 | 비고 |
|---:|---:|---|---|---|
| 1 | 1262 | `makeRunner` | infra_util | google.script.run RPC shim (fetch 프록시) |
| 2 | 1264 | `target`(중첩) | infra_util | makeRunner 내부 Proxy target stub |
| 3 | 1289 | 익명 getter (`google.script.run`) | infra_util | RPC run getter 등록 |
| 4 | 1290 | `google.script.host` 스텁 | infra_util | GAS host API 무동작 스텁 |
| 5 | 1291 | `google.script.url` 스텁 | infra_util | GAS url API 무동작 스텁 |
| 6 | 1311 | `isSlipPublishSuccess` | infra_util | RPC 응답 shape 검증(ok===true && slipNo) |
| 7 | 2267 | `getBaseListPrice` | business_rule | §3-1 |
| 8 | 2282 | `J` | infra_util | JSON safe-parse 유틸 |
| 9 | 2291 | `catalogSpecialMetadata` | business_rule | §3-2 |
| 10 | 2300 | `catalogSpecialSource` | **dead_code** | §4-1 |
| 11 | 2368 | `getModelFlags` | business_rule | §3-3 (핵심) |
| 12 | 2398 | `getRealHomePrice` | business_rule | §3-4 |
| 13 | 2403 | `getRealCommPrice` | business_rule | §3-4 |
| 14 | 2408 | `getRealSinglePrice` | business_rule | §3-4 |
| 15 | 2414 | `getRealOldPrice` | business_rule | §3-4 |
| 16 | 2440 | `applyConfigFromServer` | **dead_code** | §4-2 |
| 17 | 2463 | `estimateConfigNumber` | infra_util | 범용 config 숫자 getter |
| 18 | 2468 | `getOldDiscountPercent` | business_rule | §3-5 |
| 19 | 2472 | `getCardFeeRate` | business_rule | §3-5 |
| 20 | 2476 | `getVatDivisor` | business_rule | §3-5 |
| 21 | 2480 | `escapeEstimateHtml` | infra_util | HTML escape |
| 22 | 2488 | `escapeEstimateAttr` | infra_util | HTML attr escape |
| 23 | 2491 | `safeEstimateImageSrc` | infra_util | XSS 방지 이미지 src 검증 |
| 24 | 2508 | `safeEstimateImageSrcAttr` | infra_util | 위 + attr escape |
| 25 | 2512 | `escapeEstimateJsString` | infra_util | JS 문자열 escape |
| 26 | 2520 | `estimateOptionHtml` | ui_only | `<option>` 태그 생성(콜백 참조로 사용, `.map(estimateOptionHtml)`) |
| 27 | 2524 | `estimateSpecValueHtml` | ui_only | 스펙 값 HTML 렌더 |
| 28 | 2527 | `sanitizeLegacyTableHtml` | infra_util | 레거시 붙여넣기 테이블 HTML 화이트리스트 sanitizer |
| 29 | 2558 | `getFooterNoticeHtml` | business_rule | §3-6 |
| 30 | 2567 | `applyEstimateTotalAdjustments` | business_rule | §3-7 |
| 31 | 2585 | `applyCustomerDiscounts` | business_rule | §3-8 (핵심) |
| 32 | 2587 | `numOr`(중첩) | infra_util | null-coalesce 헬퍼 |
| 33 | 2600 | `useIHose`(중첩) | infra_util | dc.showIHose 불리언 추출 |
| 34 | 2613 | `setField`(중첩) | ui_only | DOM 값 갱신 헬퍼 |
| 35 | 2619 | `setCheck`(중첩) | ui_only | DOM 체크박스 갱신 헬퍼 |
| 36 | 2646 | `getRealListPrice` | business_rule | §3-9 |
| 37 | 2675 | `getRealSpec` | **dead_code** | §4-3 |
| 38 | 2683 | `handleSpecInput` | ui_only | 규격 셀 편집 핸들러 |
| 39 | 2723 | `makeSpecInput` | ui_only | 규격 입력 HTML 생성 |
| 40 | 2743 | `handleListPriceInput` | ui_only | 출고가 셀 편집 핸들러 |
| 41 | 2834 | `makeListPriceInput` | ui_only | 출고가 입력 HTML 생성 |
| 42 | 2860 | `handlePriceInput` | ui_only | 납품가 셀 편집 핸들러 |
| 43 | 2964 | `makePriceInput` | ui_only | 납품가 입력 HTML 생성 |
| 44 | 2991 | `handleFreightInput` | business_rule | §3-10 |
| 45 | 3049 | `numInp` | business_rule | §3-11 |
| 46 | 3096 | `roundSel` | business_rule | §3-12 |
| 47 | 3126 | `parseFixedDc` | business_rule | §3-13 (핵심 — fixed_discount_rate 직결) |
| 48 | 3142 | `isWallMountName` | **dead_code** | §4-4 |
| 49 | 3148 | `getStockState_` | business_rule | §3-14 |
| 50 | 3174 | `modelExists` | **dead_code** | §4-5 |
| 51 | 3176 | `isPanelRow` | business_rule | §3-15 |
| 52 | 3177 | `s`(중첩) | infra_util | isPanelRow 내부 텍스트 결합 |
| 53 | 3181 | `inferOneWaySize` | business_rule | §3-16 |
| 54 | 3189 | `isRemoteRow` | business_rule | §3-15 |
| 55 | 3190 | `s`(중첩) | infra_util | isRemoteRow 내부 텍스트 결합 |
| 56 | 3193 | `clearAllPanels` | **dead_code** | §4-6 |
| 57 | 3196 | `clearAllRemotes` | **dead_code** | §4-7 |
| 58 | 3201 | `pickPanelBy` | business_rule | §3-17 (핵심 — 기본 판넬 선택) |
| 59 | 3202 | `has`(중첩) | infra_util | pickPanelBy 내부 정규식 매치 헬퍼 |
| 60 | 3204 | `text`(중첩) | infra_util | pickPanelBy 내부 텍스트 결합 |
| 61 | 3212 | `wantAir`(중첩) | business_rule | pickPanelBy — opt==='공청판넬' 판정, §3-17에 포함 |
| 62 | 3213 | `wantAI`(중첩) | business_rule | pickPanelBy — opt==='인피니트 공청+동작감지 AI' 판정, §3-17에 포함 |
| 63 | 3215 | `t`(중첩) | infra_util | prefer() 내부 이름 텍스트 참조 |
| 64 | 3242 | `cleanDisplayName` | ui_only | 표시명 특수문자/공백 정리 |
| 65 | 3250 | `stripCommKeywords` | ui_only | 상업 품목 표시명에서 분류 키워드 제거 |
| 66 | 3272 | `displayOverrides` | ui_only | 표시명 하드코딩 치환표 |
| 67 | 3284 | `adjustSingleSetBasePrice` | business_rule | §3-18 (핵심 — 타입별 할인 차감) |
| 68 | 3290 | `isAcc`(중첩) | business_rule | adjustSingleSetBasePrice — 부자재 제외 판정, §3-18에 포함 |

## 3. 업무규칙 상세 (27건)

### 3-1. `getBaseListPrice(type, model, defaultVal)` — L2267-2279
① 위치: `views/index.ejs:2267`
② 조건 → 결과

| type | 조건 | 결과 |
|---|---|---|
| home/HOME | `#chkHomeInc` 체크됨 AND `PRICE_INC.home[model]` 존재 | `PRICE_INC.home[model]` |
| comm/COMM | `#chkCommInc` 체크됨 AND `PRICE_INC.comm[model]` 존재 | `PRICE_INC.comm[model]` |
| single/SINGLE | `#chkSingleInc` 체크됨 AND `PRICE_INC.single[model].list` 존재 | 그 값 |
| 그 외 전부 | — | `defaultVal` (카탈로그 원본 출고가) |

③ 상수: 없음(리터럴 타입 문자열 `'home'/'HOME'/'comm'/'COMM'/'single'/'SINGLE'` 분기뿐)
④ 읽는 시트/속성: `PRICE_INC`(=`priceInc` 템플릿 변수, `lib/code.js:getPriceIncData_()`가 만드는 "가격인상" 시트 파생 테이블) · 체크박스 `chkHomeInc/chkCommInc/chkSingleInc`(가격인상 시행 여부 토글)
⑤ 스키마 대응: **[불가]** — "체크박스로 켜지는 가격인상 대체표"에 대응하는 컬럼이 제공된 스키마 목록에 없음. `lib/code.js`에 `priceChangeSchedule()`/`priceDefaultVariant()`(DB-backed로 보임)가 별도로 존재해 이미 일부 대체됐을 가능성이 있으나 `getPriceIncData_()`(구글시트 "가격인상" 탭 직접 읽기)와 동일 개념인지는 `code.js` 담당 조사 범위에서 교차 확인 필요.
⑥ 기본값: 🚩[결정 필요] — decisions_needed 참조(D9). 카탈로그 자체는 `release_price`/`delivery_price`를 `defaultVal`로 그대로 쓰면 되므로 이 기능이 폐지돼도 카탈로그 기본값에는 지장 없음.

### 3-2. `catalogSpecialMetadata(product)` / `catalogSpecialSource(product)`* — L2291-2302
*`catalogSpecialSource`는 §4-1에서 데드코드로 별도 판정. `catalogSpecialMetadata`만 업무규칙으로 유효.
① 위치: `views/index.ejs:2291`
② 조건 → 결과

| 조건 (product.kind + product.name 텍스트) | 결과 |
|---|---|
| `/절삭/i` 매치 | `{source:'CATALOG_SPECIAL', kind:'CUT'}` |
| `/운임/i` 매치(절삭 아님) | `{source:'CATALOG_SPECIAL', kind:'FREIGHT'}` |
| 매치 없음 | `null` |

③ 상수: 정규식 `/운임|절삭/i`, kind 리터럴 `'CUT'`/`'FREIGHT'`
④ 읽는 속성: `product.kind`(종류) · `product.name`(품명) — HOMEMULTI/SINGLE_SETS/COMMULTI/OLD_PRODUCTS 전체에 부트스트랩 시 1회 적용(L2333-2336)되어 이후 전 계산 단계는 이 metadata만 읽음("catalog boundary에서만 이름을 읽는다"는 주석 명시)
⑤ 스키마 대응: **[부분]** — `products.goods_type`이 이 "운임/절삭" 특수 행 구분을 담을 후보 컬럼. 단 실제로 이 enum 값이 이미 채워져 있는지는 미확인.
⑥ 기본값: 🚩[결정 필요](D2 인접) — `goods_type`에 FREIGHT/CUT 상당 값이 있는지 확인 후, 있으면 [자동] 그 값을 그대로 사용, 없으면 대상 행(추정 2건: "운임", "절삭" 리터럴 품목) 목록화 후 수동 지정.

### 3-3. `getModelFlags(model)` — L2368-2395 ★핵심★
① 위치: `views/index.ejs:2368`
② 조건 → 결과 (모델코드 `M` = `model.toUpperCase()`)

| 조건 | 플래그 |
|---|---|
| `M`이 `'AC'`로 시작, `length>=9`, `M[7]==='6'` and `M[8]==='P'` | `is360=true` |
| 〃, `M[7]==='4'` and `M[8]∈{'P','D'}` | `is4way=true` |
| 〃, `M[7]==='1'` and `M[8]∈{'P','D'}` | `is1way=true` |
| `M`이 `'AP'`로 시작, `length>=9`: `length>=11` and `M[10]==='C'` and `M[8]==='D'` | `isStand=true` |
| 〃(AP), 위 분기 아니고 `M[8]==='P'` | `isStand=true` |
| 〃(AP), `length>=11` and `M[8]==='D'` and `M[10]==='H'` | `isDeluxe=true` |
| `M`이 `'AP230'` 또는 `'AP290'`으로 시작 | `isStand=true` (강제), `isDeluxe=false` (강제 override) |
| (`M`이 `'AC'` 또는 `'AP'`로 시작) and `length>=9` and `M[8]==='F'` | `isGrade1=true` |

③ 상수 전부 열거: prefix `'AC'`, `'AP'`, `'AP230'`, `'AP290'` · 문자 위치 인덱스 `7,8,10`(0-based) · 위치별 리터럴 문자 `'6','4','1','P','D','C','F','H'` · 최소 길이 `9`, `11`
④ 읽는 속성: 모델코드 문자열(products.model_code) — 삼성 AC/AP 계열 모델코드의 특정 자리 문자로 360카세트/4way카세트/1way카세트/스탠드/디럭스/1등급 여부를 파싱
⑤ 스키마 대응: **[부분]** — `products.discount_flags` 컬럼이 정확히 이 6개 불리언(is360/is4way/is1way/isStand/isDeluxe/isGrade1)을 담기 위해 존재하는 것으로 보이나, 실측상 채워진 값 유무는 미확인(PM 실측표에 discount_flags 채움 비율 없음).
⑥ 기본값: **[자동]** — 이 알고리즘을 그대로 마이그레이션 변환식으로 재사용해 `products.discount_flags = {is360,is4way,is1way,isStand,isDeluxe,isGrade1}`를 model_code 기준 1회 계산해 채운다. 🚩[결정 필요](D2) — JSON 키 이름을 이 6개 그대로 쓸지, 정확한 스키마 확정만 필요.

### 3-4. `getRealHomePrice` / `getRealCommPrice` / `getRealSinglePrice` / `getRealOldPrice` — L2398-2437
① 위치: 2398/2403/2408/2414
② 조건 → 결과 (공통 패턴 — "수동입력 우선")

| 조건 | 결과 |
|---|---|
| `{home,comm,single,old}CustomPrices` Map에 키 존재 | Map에 저장된 수동 입력값 |
| 없음 | 계산값(`homeUnitPrice`/`commUnitPrice`/`calcSetUnitPrice`/할인계산, 모두 3300행 밖) |

`getRealOldPrice`만 추가 규칙 보유: `oldCustomListPrices`(수동 출고가) 우선 반영 → `item.isDisc===true`면 `p = round(출고가 × (1 - rateVal/100))`(rateVal = `#old_rate` input 또는 `getOldDiscountPercent()` 기본값) → `isDisc`가 아니면(그리고 수동출고가 아니면) `item.sheetPrice`(시트에 박제된 고정가)를 그대로 사용 → 최종 `roundByConfig(p,'old')`(3300행 밖, 단위처리 적용)로 마감.
③ 상수: 없음(전부 참조 config)
④ 읽는 속성: `OLD_PRODUCTS[].isDisc`(구형 품목의 "할인율 적용 대상" 플래그) · `OLD_PRODUCTS[].sheetPrice`(할인 미적용 시 고정 사용가) · `OLD_PRODUCTS[].price`(출고가)
⑤ 스키마 대응: **[불가/해당없음]** — `{home,comm,single,old}CustomPrices`는 브라우저 메모리 Map(견적 화면에서 라인별로 임시 덮어쓴 값)이라 카탈로그 스키마가 아니라 견적 라인(estimate_line) 편집 기능 개념. `OLD_PRODUCTS.isDisc`만 카탈로그 속성인데 대응 컬럼 없음.
⑥ 기본값: `getReal*Price` 자체는 [해당없음](견적 라인 편집 기능, 카탈로그 기본값 질문 아님). `isDisc` 플래그는 🚩[결정 필요](D8) — "구형(old)" 세그먼트가 새 스키마에 존속하는지부터 확인.

### 3-5. `getOldDiscountPercent` / `getCardFeeRate` / `getVatDivisor` — L2468-2478
① 위치: 2468/2472/2476
② 조건 → 결과: `round(CONFIG.oldDiscount*100)`(기본 50%) / `CONFIG.cardFeeRate`(기본 3%) / `1+CONFIG.vatRate`(기본 10% → divisor 1.1)
③ 상수: `oldDiscount` 기본 `0.5`, `cardFeeRate` 기본 `0.03`, `vatRate` 기본 `0.1`
④ 읽는 속성: `CONFIG.{oldDiscount,cardFeeRate,vatRate}` — 견적앱 전역설정(=서버 config, 거래처별 아님)
⑤ 스키마 대응: **[불가]** — 견적앱 전역설정(카드수수료율/VAT율/구형할인율 기본값) 테이블이 제공된 스키마 목록(products/classification/bundle_component/quantity_sync_*)에 없음. 카탈로그 품목 스키마가 아니라 견적앱 설정값이라 이 배정 범위(품목 기본값)의 결정 대상은 아니라고 판단.
⑥ 기본값: [해당없음] — 품목별 기본값이 아니라 앱 전역 설정값.

### 3-6. `getFooterNoticeHtml()` — L2558-2565
① 위치: 2558
② 조건 → 결과: `CONFIG.footerNotice`(거래처/서버 설정) 있으면 그 텍스트, 없으면 하드코딩 fallback 4줄 사용. 줄바꿈 분리 후 각 줄 escape, `<br>` join.
③ 상수(하드코딩 fallback 전문):
```
※ 분기관은 임의 산정입니다.
※ 견적 내용 확정 시 재고확인 요청 부탁드립니다.
※ 본 견적은 견적일로부터 30일 이내에만 유효합니다.
※ 공공기관 발주 현장의 경우 본 견적은 무효이며, 별도의 검토가 필요합니다.
```
④ 읽는 속성: `CONFIG.footerNotice`
⑤ 스키마 대응: **[해당없음]** — 견적서 템플릿 문구, 품목 카탈로그 스키마와 무관.
⑥ 기본값: [해당없음]. (참고로만 기록 — 견적서 템플릿 담당 조사 범위가 있다면 이 fallback 전문을 그대로 이관할 것을 권고.)

### 3-7. `applyEstimateTotalAdjustments(rows, opts)` — L2567-2582
① 위치: 2567
② 조건 → 결과: `opts.advance===true` AND `CONFIG.advanceDiscountRate>0`(기본 0) AND 기존 rows에 "선금할인" 행이 아직 없음 → `discount = -round(baseTotal × advanceRate)`; discount≠0이면 `{name:'선금할인', model:'선금할인', unit:'식', qty:1, price:discount, ...}` 합성 라인을 rows에 push. 반환값 `{total: baseTotal+adjustment, adjustment}`.
③ 상수: `advanceDiscountRate` 기본값 `0`(설정 없으면 발동 안 함)
④ 읽는 속성: `CONFIG.advanceDiscountRate` — 거래처/서버 선금할인율
⑤ 스키마 대응: **[해당없음]** — 견적 라인 자동생성 규칙(선금할인 합성 라인 주입), 품목 카탈로그 스키마와 무관.
⑥ 기본값: [해당없음].

### 3-8. `applyCustomerDiscounts(dc)` — L2585-2643 ★핵심★
① 위치: 2585
② 조건 → 결과: 거래처별 Notion DC 설정(`dc`)의 각 필드가 있으면 그 값, 없으면 `CONFIG` 전역 기본값으로 폴백 후 UI 필드에 즉시 반영.

| dc 필드 | 폴백 기본값 | 반영 대상 |
|---|---|---|
| `homeDiscount` | `CONFIG.homeDiscount`(기본 0.45=45%) | `#home_rate` (×100) |
| `commDiscount` | `CONFIG.commDiscount`(기본 0.45=45%) | `#comm_rate` (×100) |
| `discount360` | `0` | `#ss_disc_360` |
| `discount4way` | `0` | `#ss_disc_4way` |
| `discountStand` | `0` | `#ss_disc_stand` |
| `oneWayDiscount` | `0` | `#ss_disc_1way` |
| `deluxeDiscount` | `0` | `#ss_disc_deluxe` |
| `firstGradeDiscount` | `0` | `#ss_disc_grade1` |
| `unitRoundTo`/`unitRoundMode` | `0`/`'ROUND'` | `{home,comm,old}_round_unit`/`_round_mode` |
| `showIHose` | `false` | `#home_hose_i` 체크박스(홈멀티 유연호스 I형 전용 — 상업멀티는 오염 방지 위해 미반영) |

③ 상수: `homeDiscount`/`commDiscount` 기본 `0.45`, 6개 타입 할증금액 기본 `0`, `unitRoundTo` 기본 `0`, `unitRoundMode` 기본 `'ROUND'`
④ 읽는 속성: `dc.*`(거래처별 Notion DC 설정 레코드, `lib/code.js:initDcConfigFromNotion`/`getAllNotionDcConfigs_` 경유 — 이 파일 범위 밖) — `discount360~firstGradeDiscount` 6개는 §3-3 `getModelFlags`가 만드는 플래그와 1:1 대응하는 **거래처별** 할증금액.
⑤ 스키마 대응: **[불가]** — 거래처(파트너)별 할인설정 테이블이 제공된 스키마 목록에 없다(`products.fixed_discount_rate`/`classification.fixed_discount_rate`는 품목 레벨이지 거래처 레벨이 아님). `services/dc-config-service`(`DcConfig` 도메인, `PriceCalculationService`)가 이미 이 개념을 이관받았을 가능성이 repo에서 확인됨(grep 결과) — 단 이 조사 범위(ejs 1~3300)에서는 대응 여부를 확정할 수 없음.
⑥ 기본값: 🚩[결정 필요](D6) — dc-config-service가 `discount360~firstGradeDiscount` 6종 및 `homeDiscount`/`commDiscount`/`unitRoundTo`/`unitRoundMode`/`showIHose`를 전부 커버하는지 확인 필요. 커버한다면 이 GAS 로직은 이미 이관 완료로 간주 가능.

### 3-9. `getRealListPrice(type, model, defaultVal)` — L2646-2652
① 위치: 2646
② 조건 → 결과: `{home,comm,single,old}CustomListPrices` Map에 키 있으면 그 값, 없으면 `defaultVal`. (§3-4와 동일 패턴, "출고가"에 대한 버전)
③ 상수: 없음
④ 읽는 속성: 없음(브라우저 메모리 Map만)
⑤ 스키마 대응: **[해당없음]** — 견적 라인 편집 기능(수동 출고가 override), 카탈로그 기본값 질문 아님.
⑥ 기본값: [해당없음].

### 3-10. `handleFreightInput(e, isCut, priceMap, qtyMap, model, recomputeFunc)` — L2991-3046
① 위치: 2991
② 조건 → 결과

| 조건 | 결과 |
|---|---|
| `isCut===true` and `val!==0` | `val = -Math.abs(val)` (절삭은 항상 음수로 저장) |
| `val===0` | `priceMap.set(model,0)`, `qtyMap.set(model,0)`(잠금 해제) |
| `val≠0` | `priceMap.set(model,val)`, `qtyMap.set(model,1)`(수량 항상 1 고정 — 이름/구성에서 추론 안 함, 이 라인 자체가 수량동기화 대상이 아닌 수동 금액 라인) |

③ 상수: 없음(부호 반전 규칙만)
④ 읽는 속성: 없음(사용자 입력값)
⑤ 스키마 대응: **[부분]** — §3-2 `catalogSpecialMetadata`가 만드는 `SPECIAL_ROW_SOURCE.CATALOG_SPECIAL`(kind CUT/FREIGHT) 품목이 견적에 들어올 때의 처리 규칙. `products.goods_type`에 FREIGHT/CUT이 있다면 그 품목에 대해서만 "수량은 항상 1, 절삭은 항상 음수"라는 불변식이 적용됨을 문서화할 필요.
⑥ 기본값: **[자동]** — 이 두 불변식(qty=1 고정, isCut⇒음수)은 값이 아니라 계산 규칙이므로 품목 스키마에 저장할 기본값은 없음. 계산 로직으로 그대로 이식 권고.

### 3-11. `numInp(label, id, def, step, cls)` — L3049-3094
① 위치: 3049
② 조건 → 결과: DOM 위젯 생성 함수. `step===1000`인 입력 필드(할증금액 6종)에 한해 change 이벤트에서: `0 < v < 1000` 이면 `v = v*1000`(천원 단위 축약입력 자동 환산) / `v % 1000 !== 0` 이면 가장 가까운 1000 배수로 반올림.
③ 상수: 임계값 `1000` · 강조 대상 필드 ID 9종 리터럴 배열 `['home_rate','ss_disc_360','ss_disc_4way','ss_disc_stand','ss_disc_1way','ss_disc_deluxe','ss_disc_grade1','comm_rate','old_rate']`(견적앱 전체 할인/할증 설정 필드 전수 목록 — 교차 참조용)
④ 읽는 속성: 없음(호출부가 `def` 인자로 CONFIG/DISCOUNT 전역값 전달)
⑤ 스키마 대응: **[해당없음]** — UI 위젯이자 입력 축약 규칙, 거래처 설정값(§3-8)의 입력 편의 기능일 뿐 카탈로그 스키마와 무관.
⑥ 기본값: [해당없음].

### 3-12. `roundSel(prefix)` — L3096-3123
① 위치: 3096
② 조건 → 결과: 단위처리(반올림) 옵션 두 개 `<select>` 생성. 단위 옵션 `[0,10,100,1000]`(0='단위처리 없음', 나머지='N원'), 모드 옵션 `[['ROUND','반올림'],['FLOOR','내림'],['CEIL','올림']]`.
③ 상수: 단위 enum `{0,10,100,1000}`, 모드 enum `{ROUND,FLOOR,CEIL}`
④ 읽는 속성: 없음
⑤ 스키마 대응: **[해당없음]** — §3-8 `unitRoundTo`/`unitRoundMode`(거래처 설정)의 유효값 enum 정의일 뿐, 카탈로그 스키마 대상 아님.
⑥ 기본값: [해당없음]. (참고: 향후 `unitRoundMode`를 DB enum으로 못박을 일이 있다면 이 4값/3값 enum을 그대로 사용.)

### 3-13. `parseFixedDc(dc)` — L3126-3139 ★핵심★
① 위치: 3126
② 조건 → 결과

| 입력 형태 | 처리 |
|---|---|
| `null`/`''` | `null` 반환(고정DC 없음) |
| 숫자, `dc > 1` | `v = dc/100` (퍼센트로 간주) |
| 숫자, `dc <= 1` | `v = dc` (이미 비율) |
| 문자열, 숫자 토큰 없음 | `null` |
| 문자열, `%` 포함 또는 추출값 `>1` | `v = 추출값/100` |
| 문자열, 그 외 | `v = 추출값` |
| (공통) | `v = clamp(v, 0, 0.99)` |

③ 상수: 클램프 하한 `0`, **상한 `0.99`**(고정DC 최대 99%), 퍼센트 판정 임계 `>1`
④ 읽는 속성: "고정DC" 시트 컬럼 값(숫자 또는 "10%"/"0.1"/"10" 등 혼재 문자열)
⑤ 스키마 대응: **[표현 가능]** — `products.fixed_discount_rate` / `classification.fixed_discount_rate`에 정확히 대응.
⑥ 기본값: **[자동]** — 레거시 "고정DC" 컬럼을 이 알고리즘 그대로(숫자>1 또는 '%' 포함 시 /100, `[0,0.99]` 클램프, 빈값/미해석 시 NULL) 적용해 `fixed_discount_rate`를 채우는 마이그레이션 변환식으로 재사용 권고. 실측(품목 167건 fixed_discount_rate 보유, classification 0건)과 정합적 — 이미 이 규칙(또는 동등 규칙)으로 품목 167건이 채워졌을 가능성이 높다.

### 3-14. `getStockState_(note)` — L3148-3171
① 위치: 3148
② 조건 → 결과

| 조건(note, 공백 제거 후) | 결과 |
|---|---|
| `/품절/` 매치 | `{type:'SOLD'}` |
| `(\d{2})(\d{2})(\d{2})` 매치 & 파싱된 날짜(20YY-MM-DD)가 오늘보다 미래 | `{type:'FUTURE', label:'MM.DD 예정'}` |
| 그 외 | `{type:'OK'}` |

③ 상수: 정규식 `/품절/`, 날짜 패턴 `(\d{2})(\d{2})(\d{2})`, 연도 오프셋 `+2000`
④ 읽는 속성: HOMEMULTI/SINGLE_SETS/COMMULTI 행의 `note`(비고) 자유텍스트 컬럼
⑤ 스키마 대응: **[부분]** — `products.status`가 활성/비활성은 담당하지만 "SOLD(일시품절, 카탈로그엔 남아있음)" vs "FUTURE(출시예정일 있음)"라는 3단계 상태 및 예정일 값을 담을 컬럼이 없다.
⑥ 기본값: 🚩[결정 필요](D3) — `inventory_qty_mgmt`(재고수량관리)가 이 "품절" 텍스트 파싱을 이미 대체하는지, 아니면 별도 재고상태 필드/예정일 필드가 필요한지 확인.

### 3-15. `isPanelRow(r)` / `isRemoteRow(r)` — L3176-3192
① 위치: 3176 / 3189
② 조건 → 결과: `(name+' '+disp+' '+model).toLowerCase()`가 `/(판[넬널]|panel)/i`에 매치 → 판넬 행 / `/(리모컨|remote)/i`에 매치 → 리모컨 행.
③ 상수: 정규식 2종
④ 읽는 속성: HOMEMULTI 행의 `name`/`disp`/`model` 텍스트 전체
⑤ 스키마 대응: **[부분]** — `bundle_component.component_kind`가 정확히 이 "이 행이 판넬/리모컨류 구성품인가"를 담기 위한 컬럼으로 보인다.
⑥ 기본값: 🚩[결정 필요](D4) — `component_kind` enum에 PANEL/REMOTE 상당 값이 이미 있는지, 있다면 [자동]으로 완전 대체 가능. 이 함수는 §3-17 `pickPanelBy`의 후보 필터링과 `clearAllPanels`(데드코드)·recomputeHomeRemotes(3300행 밖)에서 사용됨.

### 3-16. `inferOneWaySize(nameLike)` — L3181-3188
① 위치: 3181
② 조건 → 결과: `/대형/` → `'b'` / `/중형/` → `'m'` / `/소형/` → `'s'` / 매치 없음 → **기본값 `'m'`(중형으로 간주)**
③ 상수: 리터럴 3분류 `대형/중형/소형` → `b/m/s`, 미매치 시 기본 `'m'`
④ 읽는 속성: 1-way 판넬 품목명 텍스트
⑤ 스키마 대응: **[부분]** — `products.pyong_size`가 후보이나, 원래 의미(평형=설치공간 면적, 예: 6평/10평)와 "1-way 판넬 물리 사이즈(대/중/소)"가 같은 개념인지 불확실.
⑥ 기본값: 🚩[결정 필요](D5) — `pyong_size` 재사용 여부 확인 필요. "매치 없으면 중형으로 간주"라는 암묵적 기본값도 개발책임자의 "추론 금지, 설정값만" 원칙과 같은 계열의 리스크(사이즈를 이름에서 추론) — 설정값 부재 시 자동 기본값을 둘지, 필수 입력으로 강제할지 결정 필요.

### 3-17. `pickPanelBy(kind, wifi, opt)` — L3201-3230 (+ 중첩 `wantAir`/`wantAI` L3212-3213) ★핵심★
① 위치: 3201
② 조건 → 결과 (3단계)

1단계 — 후보 필터 (`isPanelRow(r) && matchKind(r) && matchWifi(r)`):

| kind | matchKind 조건 |
|---|---|
| `'360'` | 텍스트에 `"360"` 포함 |
| `'4way'` | `/4\s*-?\s*way|4way/i` 포함 AND `"360"` 미포함 |
| `'1way'` | `/1\s*-?\s*way|1way/i` 포함 AND `4way`/`360` 미포함 |

| wifi | matchWifi 조건 |
|---|---|
| `true` | `/wi\s*[-\s]?fi|wifi/i` 매치 |
| `false` | `/미내장|non[-\s]?wifi|no[-\s]?wifi/i` 매치(명시적 "미내장" 라벨 필요, 단순 wifi 키워드 부재가 아님) |

2단계 — 후보 없으면 `null` 반환.

3단계 — 선호도 점수 오름차순 정렬(낮을수록 우선) 후 1위 선택:

| 조건 | 점수 |
|---|---|
| `opt==='인피니트 공청+동작감지 AI'` AND 이름이 `/ai|동작감지/i` 매치 | `-6` |
| 〃, 미매치 | `+3` |
| `opt==='공청판넬'` AND 이름이 `/공기청정|공청/i` 매치 | `-4` |
| 〃, 미매치 | `+2` |
| 이름이 `/기본/i` 매치 | `-2` (그 외 가산 없음, `0`) |
| 이름이 `/블랙|승강/i` 매치 | `+2` |
| 〃, 미매치 | `-1` |

③ 상수 전부 열거: 점수 가중치 `-6,+3,-4,+2,-2,0,+2,-1` · kind 리터럴 `'360'/'4way'/'1way'` · opt 리터럴 `'공청판넬'/'인피니트 공청+동작감지 AI'`
④ 읽는 속성: HOMEMULTI 행의 `name`/`disp`/`model` 전체 텍스트
⑤ 스키마 대응: **[불가]** — 이 스코어링 알고리즘 자체는 스키마로 표현할 수 없다. 개발책임자 확정 규칙("수량은 설정값만이 정한다")과 동일한 원칙이 **기본 구성품 선택**에도 적용돼야 한다고 판단 — `bundle_component.is_default`/`component_variant`가 정확히 이 문제(본체별 기본 판넬이 무엇인가)를 명시적 설정값으로 담기 위한 컬럼으로 보인다.
⑥ 기본값: 🚩🚩[결정 필요](D1, 최우선) — 이 알고리즘을 그대로 이식하지 말고, `(본체 model_code, kind, wifi, opt) → 기본 판넬 model_code` 구체적 매핑표로 환원해야 한다. **단, 이 표를 만들려면 실 카탈로그 데이터(HOMEMULTI 3,084건 활성 품목 중 홈멀티분)에 대해 이 알고리즘을 실제로 실행해 결과를 뽑아야 하는데, 본 조사는 읽기 전용 코드 조사 범위(git 조작·실행 금지 아님이지만 이 작업은 별도 스크립트 실행이 필요)라 이 보고서 안에서 구체적 트리플을 산출하지 못했다.** 후속 조치로 kind×wifi×opt = 3×2×3 = 18개 조합을 홈멀티 본체별로 이 함수를 그대로(read-only) 실행해 결과 모델코드를 뽑는 별도 라운드를 권고한다.

### 3-18. `adjustSingleSetBasePrice(s, base)` — L3284-3314 (+ 중첩 `isAcc` L3290) ★핵심★
① 위치: 3284
② 조건 → 결과

| 조건 | 결과 |
|---|---|
| `s.catL==='acc'` OR 이름이 `/리모컨\|리모콘\|자재\|부자재\|보드\|키트\|KIT\|중계기\|발통\|드레인펌프\|일자발\|분\s*기\s*관\|분기관/i` 매치 | `base` 그대로 반환(부자재는 타입할인 미적용) |
| 모델코드가 `/^(AC\|AP\|AR\|AF)/i`로 시작하지 않음 | `base` 그대로 반환 |
| 그 외(삼성 AC/AP/AR/AF 계열 본품) | `getModelFlags(model)`의 각 플래그가 true이고 해당 UI 설정값(`#ss_disc_360` 등)이 `>0`이면 `v = max(0, v - 설정값)`를 **플래그별로 순차 누적 차감**(여러 플래그가 동시에 true면 전부 차감) |

③ 상수 전부 열거: 부자재 제외 키워드 정규식(리모컨/리모콘/자재/부자재/보드/키트/KIT/중계기/발통/드레인펌프/일자발/분기관) · 모델 프리픽스 화이트리스트 `AC/AP/AR/AF` · 차감 하한 `0`
④ 읽는 속성: `s.catL`(대분류) · `s.nameRaw`/`s.name` · `s.model` · UI `#ss_disc_360/#ss_disc_4way/#ss_disc_stand/#ss_disc_1way/#ss_disc_deluxe/#ss_disc_grade1`(§3-8이 채우는 거래처별 할증금액)
⑤ 스키마 대응: **[부분]** — 플래그 판정 자체는 §3-3 `getModelFlags`→`products.discount_flags`로 표현 가능. 차감 금액은 §3-8과 동일하게 거래처별 설정(스키마 목록에 없음). 부자재 제외 판정(키워드 regex + 프리픽스 화이트리스트)에 대응하는 명시적 컬럼은 미확인 — `product_category`/`goods_type`이 후보.
⑥ 기본값: **[자동]** — discount_flags 부분은 §3-3과 동일 재사용. 🚩[결정 필요](D7) — 부자재 제외 판정을 `product_category`(예: `'부자재'`) 값으로 완전 대체 가능한지, AC/AP/AR/AF 프리픽스 화이트리스트가 이미 `goods_type`/`product_type=SINGLE`으로 갈음되는지 확인.

## 4. 데드코드 판정 (7건) — grep 전수 확인 근거

각 건에 대해 (a) `clients/web/estimate-app` 전체에서 함수명 bare 문자열 grep(괄호 유무 무관, 콜백 참조·HTML 인라인 속성·문자열 참조까지 포착) (b) 결과가 정의 라인 1건뿐임을 확인했다. 대조: `estimateOptionHtml`(§표 #26)은 처음엔 `함수명(` 형태 grep으로 0건이 나와 데드코드로 오판할 뻔했으나, `.map(estimateOptionHtml)` 콜백 참조 형태였음을 bare 문자열 grep으로 재확인해 업무규칙표 상 ui_only(생존)로 정정했다 — 아래 7건은 bare 문자열 grep까지 통과한 것만 데드코드로 판정했다.

### 4-1. `catalogSpecialSource` — L2300
```
grep -n "catalogSpecialSource" clients/web/estimate-app -r
→ clients\web\estimate-app\test\special-row-inheritance.test.js:49  (테스트 파일 자체 mock 재구현, ejs 함수 호출 아님)
→ clients\web\estimate-app\views\index.ejs:2300                     (정의 자체)
```
`index.ejs` 안에서 정의 외 호출 0건. 테스트 파일의 `catalogSpecialSource: (product) => ...`는 목(mock) 객체 리터럴 키이지 실제 함수를 호출하는 게 아니다. **호출부 없음 — 데드코드.** (내용 참고: `catalogSpecialMetadata(product)?.source`를 그대로 인라인해도 동일 — §3-2 참조.)

### 4-2. `applyConfigFromServer` — L2440
```
grep -n "applyConfigFromServer(" clients/web/estimate-app -r  → index.ejs:2440 (정의)만
grep -n "applyConfigFromServer"  clients/web/estimate-app -r  → index.ejs:2440 (정의)만
```
`estimate-app` 범위 밖(order-app, tools/legacy-gas, dc-config-service)에는 동명 함수/참조가 있으나 별개 앱의 별개 구현이다. **estimate-app 안에서 정의 외 호출 0건 — 데드코드.** (내용 참고: 이 함수가 CONFIG에 적용하던 필드 집합(`homeDiscount/commDiscount/discount360~firstGradeDiscount/unitRoundTo/unitRoundMode/showIHose`)은 §3-8 `applyCustomerDiscounts`(생존, 호출됨)가 동일하게 커버하므로 데드코드로 제거돼도 업무 손실 없음.)

### 4-3. `getRealSpec` — L2675
```
grep -n "getRealSpec" clients/web/estimate-app -r → index.ejs:2675 (정의)만
```
**호출부 없음 — 데드코드.** (§3-4의 `getRealListPrice`/`getReal*Price` 자매 함수들은 전부 생존, 이 함수만 규격(spec)에 대한 버전이 미사용으로 남음 — 규격 조회는 `getSpecMap_`/`getSpecDetailMap_`(code.js, 범위 밖) 경로로 이미 대체된 것으로 추정.)

### 4-4. `isWallMountName` — L3142
```
grep -n "isWallMountName" clients/web/estimate-app -r → index.ejs:3142 (정의)만
```
**호출부 없음 — 데드코드.**

### 4-5. `modelExists` — L3174
```
grep -n "modelExists" clients/web/estimate-app -r → index.ejs:3174 (정의)만
```
**호출부 없음 — 데드코드.**

### 4-6~4-7. `clearAllPanels` / `clearAllRemotes` — L3193/3196
```
grep -n "clearAllPanels|clearAllRemotes" clients/web/estimate-app -r → index.ejs:3193, index.ejs:3196 (각 정의)만
```
**둘 다 호출부 없음 — 데드코드.** (내부에서 쓰는 `isPanelRow`/`isRemoteRow`는 다른 생존 호출부(`pickPanelBy`, `recomputeHomeRemotes` 등, 3300행 밖)가 있어 그 자체는 업무규칙으로 유효함 — §3-15 참조.)

> 참고: 선행 산출물 `docs/dev-reports/2026-08-10-gas-sweep-A-estimate-1-10000.md`(1~10000행 광역 초안)가 동일 7건(2300/2440/2675/3142/3174/3193/3196)을 데드코드로 판정해둔 것을 이번 grep 재검증으로 교차 확인했다 — 단, 그 문서를 근거로 삼지 않고 본 조사에서 각각 독립적으로 grep 실행 후 일치를 확인한 것이다.

## 5. 결정 필요 사항 (decisions_needed) — 요약

기본값을 자동으로 정할 수 없는 9건. 상세 근거는 §3 각 절 참조.

| # | 요약 | 레거시 동작 | 후보 | 권장 |
|---|---|---|---|---|
| D1 | `pickPanelBy` 기본 판넬 선택 알고리즘 → 매핑표 전환 | 이름 정규식+가중치 스코어링으로 런타임 선택(§3-17) | (a) 알고리즘 그대로 이식 (b) 실 데이터에 알고리즘 실행 후 결과를 `bundle_component`에 고정 매핑표로 저장 | (b) — 개발책임자 "추론 금지, 설정값만" 원칙과 동일 계열. 실행 라운드 별도 필요 |
| D2 | `getModelFlags` → `discount_flags` JSON 키/채움 방식 확정 | 모델코드 위치파싱(§3-3) | (a) 런타임 파싱 유지 (b) 마이그레이션 시 1회 계산해 컬럼 채움 | (b), 키 이름 `is360/is4way/is1way/isStand/isDeluxe/isGrade1` 확정 요청 |
| D3 | `getStockState_`의 SOLD/FUTURE 상태 존속 여부 | note 텍스트에서 "품절"/YYMMDD 예정일 파싱(§3-14) | (a) `inventory_qty_mgmt`로 완전 대체 (b) 별도 재고상태+예정일 필드 신설 | 미결 — `inventory_qty_mgmt` 실제 커버리지 확인 후 결정 |
| D4 | `isPanelRow`/`isRemoteRow` → `component_kind` 완전 대체 가능 여부 | 이름 정규식(판넬/리모컨) 매치(§3-15) | `component_kind` enum에 PANEL/REMOTE 값 존재 여부 확인 | 존재하면 (a)자동 대체 권장 |
| D5 | `inferOneWaySize`(대/중/소) ↔ `pyong_size` 동일 개념 여부 | 이름 텍스트 매치, 미매치 시 '중형' 기본값(§3-16) | (a) `pyong_size` 재사용 (b) 별도 사이즈 필드 신설 | 미결 — 개념 확인 필요 |
| D6 | `applyCustomerDiscounts`의 6종 타입 할증금액 이관 여부 | 거래처별 Notion DC 설정(§3-8) | dc-config-service(`DcConfig`)가 이미 커버 vs 갭 존재 | 미결 — dc-config-service 필드셋 확인 필요(이 조사 범위 밖) |
| D7 | `adjustSingleSetBasePrice`의 부자재 제외 판정 대체 컬럼 | 키워드 정규식 + AC/AP/AR/AF 프리픽스(§3-18) | `product_category`/`goods_type` 값으로 대체 | 미결 — 해당 enum 값 존재 확인 필요 |
| D8 | `OLD_PRODUCTS.isDisc`(구형 할인대상 플래그) 존속 여부 | "구형" 세그먼트 전용 할인 적용 플래그(§3-4) | (a) 구형 세그먼트 폐지(이관 불필요) (b) 존속 시 대응 컬럼 신설 | 미결 — "구형" 카테고리가 새 서비스에서 계속 판매되는지 확인 |
| D9 | `getBaseListPrice`의 `PRICE_INC`(가격인상 체크박스 표) ↔ `price_change_schedule`/`price_default_variant` 동일 여부 | 체크박스 토글 시 별도 가격표로 스왑(§3-1) | (a) 이미 DB 이관 완료로 간주 (b) 별개 기능이라 갭 존재 | 미결 — `code.js` 담당 조사(다른 배정)와 교차 확인 권고 |

## 6. 특기사항 (notable)

- 배정 경계(1~3300행)가 마침 `adjustSingleSetBasePrice`(L3284) 함수 몸통 중간에서 끊긴다. 함수 시작 선언은 범위 안(L3284)이므로 §2 표에 포함해 전량 분류했고, 본문 로직(L3296 이하 `getModelFlags` 호출 및 차감 루프)까지 읽어 §3-18에 온전히 기술했다 — 다음 배정 담당(ejs-2, L3317 `roundK`부터)에 중복 없이 이어진다.
- 데드코드 7건 전부 "정의 1회, 호출 0회"를 **괄호 포함 grep + bare 문자열 grep 이중 확인**했다. 특히 `estimateOptionHtml`은 `.map(estimateOptionHtml)` 콜백 참조 형태라 괄호 포함 grep만으론 오판(데드코드로 오분류)할 뻔했다 — 이후 모든 판정에 bare 문자열 grep을 필수로 병행했다.
- `parseFixedDc`(§3-13)의 클램프 규칙(`[0,0.99]`, `>1`→퍼센트 간주)은 실측(품목 167건 `fixed_discount_rate` 보유, `classification` 0건)과 정합적이라 — 이미 동일/유사 규칙으로 마이그레이션된 정황으로 보이며, 스키마 이식이 사실상 완료됐을 가능성이 있다(재확인 권고 대상, 결정 항목엔 넣지 않음).
- `applyConfigFromServer`(데드코드, §4-2)가 다루던 CONFIG 필드 집합은 생존 함수 `applyCustomerDiscounts`(§3-8)가 완전히 포괄한다 — 데드코드 제거로 인한 업무규칙 유실 없음을 교차 확인했다.
- 선행 산출물 `docs/dev-reports/2026-08-10-gas-sweep-A-estimate-1-10000.md`(더 넓은 1~10000행 초안, 358개 항목 분류, 업무규칙 167건)가 존재한다. 본 보고서는 그 문서를 신뢰 근거로 삼지 않고 동일 범위(1~3300행, 68항목)를 독립적으로 재조사했으며, 데드코드 7건 판정은 두 문서가 일치했다(§4 하단 참고 각주). 두 산출물의 관계(구 광역 초안 vs 신 세부 분할) 정리는 PM 소관.

## 7. 스키마 대응 요약 (한눈에)

| 스키마 대상 | 채워질 값 | 근거 함수 |
|---|---|---|
| `products.fixed_discount_rate` | 레거시 "고정DC" 컬럼을 `[0,0.99]` 클램프+퍼센트 정규화 후 채움 | `parseFixedDc` §3-13 |
| `products.discount_flags` | `{is360,is4way,is1way,isStand,isDeluxe,isGrade1}` — model_code 위치파싱 1회 계산 | `getModelFlags` §3-3 |
| `products.goods_type`(추정) | "운임"/"절삭" 특수 행 kind 구분 | `catalogSpecialMetadata` §3-2 |
| `bundle_component`(component_kind/is_default/component_variant) | 판넬/리모컨 구성품 여부 및 **기본 판넬 선택 결과**(별도 실행 라운드 필요) | `isPanelRow`/`isRemoteRow` §3-15, `pickPanelBy` §3-17 |
| `products.pyong_size`(재확인 필요) | 1-way 판넬 대/중/소 사이즈(개념 일치 여부 미확정) | `inferOneWaySize` §3-16 |
| (스키마 목록 밖) 거래처별 할인 설정 | homeDiscount/commDiscount/6종 타입할증금액/단위처리 | `applyCustomerDiscounts` §3-8 (dc-config-service 이관 여부 확인 필요) |
