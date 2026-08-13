# GAS 전수조사 v2 — 포팅 주문서 본체 + 견적 라이브러리

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 · 레거시 법칙 조사자  
> 범위: `ORDER-APP` · `ESTIMATE-LIB` · `ORDER-SRC` · `MOBILE`  
> 변경: 이 보고서만 작성. 코드·스키마·마이그레이션·git·컨테이너·공유 DB 무변경.

## 1. 완결성 선언

**배정 615 / 분류 615 / 4분류 합계 230 + 153 + 203 + 29 = 615**

| 고정 inventory 그룹 | 배정 | 업무규칙 | UI·표시 | 인프라·유틸 | dead_code | 분류 |
|---|---:|---:|---:|---:|---:|---:|
| `ORDER-APP` | 358 | 170 | 151 | 37 | 0 | 358 |
| `ESTIMATE-LIB` | 204 | 57 | 0 | 122 | 25 | 204 |
| `ORDER-SRC` | 29 | 3 | 2 | 24 | 0 | 29 |
| `MOBILE` | 24 | 0 | 0 | 20 | 4 | 24 |
| **합계** | **615** | **230** | **153** | **203** | **29** | **615** |

분모는 `docs/dev-reports/2026-08-11-gas-function-inventory-v2.md`의 네 그룹을 그대로 사용했다. 현재 소스에 inventory 이후 추가된 함수가 보이더라도 분모에 더하지 않았고, inventory에 든 중첩 arrow/method/window 함수는 부모 함수에 흡수하지 않고 각각 한 건으로 분류했다. “주요 함수” 표본화가 아니라 §8 원장에 615건 전부를 남긴다.

## 2. 판정 방법과 dead_code 감사

- **업무규칙**: 금액·할인·수량·출고품목·분류·기본값·검증·전송 payload 중 하나를 바꾸는 함수. 단순 API getter라도 legacy shape에 업무 기본값을 넣거나 필드를 번역하면 업무규칙이다.
- **UI·표시**: DOM 렌더, 모달, 필터, 테이블 배치, 표시 문자열만 바꾸는 함수.
- **인프라·유틸**: HTTP·인증·캐시·시트 adapter·escape·날짜·범용 파싱·PWA/RPC 배관.
- **dead_code**: 정의/테스트 외 런타임 호출이 없고, 인라인 `onclick/onchange/oninput`, 문자열 리터럴, `google.script.run` 동적 property, `window.<name>`/`window[...]`, module import/export 소비처까지 없음을 확인한 경우만 사용했다. 애매한 함수는 본문 성격에 따라 업무규칙/UI/인프라로 보존했다.

dead 29건의 근거는 다음과 같다.

| 묶음 | 건수 | 근거 |
|---|---:|---|
| `estimate-app/lib/code.js` | 14 | `toYmd_`, `toMmDd_`, `normalizeTel_`, `todayYMD_`, `_normSpec_`, `isSoldOutByNote_`, `findHeaderIndex_`+`norm`, `extractRowsFromFormula_`, 할인표시 3함수, `getSpecMap_`+`scan`; 런타임 호출 0, 대체 함수 존재. 테스트 호출만 있는 것도 dead로 판정 |
| `quoteSnapshotContract.js` | 3 | 파일명·세 export를 repo 전역 검색했으나 `test/quote-snapshot-contract.test.js` 외 소비처 0 |
| lib `version-check.js` | 7 | 런타임 route는 `resolveBuildAppVersion`만 import. 나머지 7개는 테스트만 사용. 페이지는 `public/version-gate.js`를 로드하며 lib 모듈을 로드하지 않음 |
| lib `version-gate.js` | 1 | `createVersionReloadGuard`는 테스트만 사용; 실제 페이지는 별도 `public/version-gate.js` |
| mobile 4파일 | 4 | `validate*AppUrl` 2개와 미소비 export `set*AuthScript` 2개. 반면 생성 문자열이 `window.__SAMHAN_BRIDGE__`에 설치하는 `setAuth/handle/log` 6개는 문자열·`window` 동적 접근 가능성을 인정해 인프라로 보존 |

`order-app/index.html`은 인라인 이벤트와 전역 재정의가 많아 dead를 0으로 두었다. 원본 주문서의 302개 함수도 같은 기준에서 dead 0이었고, 포팅 전용 함수 역시 직접 호출·이벤트·동적 bridge 중 하나가 확인되었다.

## 3. 최우선 결론 — 원본 GAS와 다른 금액·수량·출고품목

| 우선 | 축 | 포팅본 | 원본 GAS | 영향 |
|---:|---|---|---|---|
| 1 | **금액·기준일 방향** | `order-app:index.html:1447-1450`은 `due < effectiveDate`일 때 `*_INC`를 사용 | 원본 주문 `index.html:1341-1342,2462-2466,2490-2493,2510-2513,2582-2585`는 고정일 `2026-07-01`에 `due >= PRICE_INC_DATE`일 때 `*_INC` 사용 | 같은 `*_INC` map을 연결하면 기준일 전후 단가가 **반대로 선택**됨. 포팅 주석은 `*_INC=인상 전`, 원본은 `*_INC=인상가` 의미 |
| 2 | **금액·상업 받침대** | 포팅 `commUnitPrice:2825-2866`은 받침대도 일반 DC 계산으로 진입 | 원본 `commUnitPrice:2569-2573`은 `방진가대|받침대|발통세트|SI-AL600a|SI-AL700a`면 시트 납품가를 즉시 반환 | 포팅 금액이 거래처 DC/고정DC만큼 달라질 수 있음 |
| 3 | **금액·고정DC 0** | 포팅 `commUnitPrice:2858`은 `fixedDc != null`이면 0도 “0% 고정DC”로 처리해 출고가를 반환 | 원본 `:2594`는 `fixedDc > 0`만 적용하고 0은 납품가 fallback | `fixed_discount_rate=0` 품목의 단가가 출고가/납품가 중 서로 달라짐 |
| 4 | **금액·상업 구성품** | 포팅 전용 `commPartUnitPrice:2762-2767`이 `COMM_PARTS_INC`와 동적 기준일을 4개 소비처에 적용 | 원본에는 `COMM_PARTS_INC`/동명 함수가 없고 구성품 가격을 기존 `commUnitPrice` 또는 구성품 base로 처리 | 상업 BUNDLE 폭발 후 구성품 단가·합계·전표 금액이 달라질 수 있음 |
| 5 | **수량** | 포팅 `MANUAL_QTY_LOCKS` 계열(`:2278-2378`, `:3006-3027`, `:5042-5119`)은 사용자가 파생수량을 명시적으로 0 포함 수정하면 이후 자동계산이 덮어쓰지 않음 | 원본 주문서에는 이 잠금 레지스트리가 없음 | 동일 입력 뒤 옵션 변경/재계산 시 파생 부자재 수량과 최종 출고품목이 달라짐 |
| 6 | **수량·설정 권위** | `quantitySync.ts` 계산은 존재하지만 `index.html:5545-5555,8548-8570`이 “사용자 계산은 legacy 수식 유지”라고 명시 | 원본은 이름·HP 하드코딩 계산만 사용 | 현재 사용자 결과는 대체로 원본과 같고 `quantity_sync_*` 설정은 **authoritative가 아님** |
| 7 | **수량 검증** | `order-app/src/samhanApi.ts:224-227`은 수량이 정수이고 1 이상이 아니면 주문 전체를 거부 | 원본 GAS 전송은 화면에서 양수를 고르지만 서버 경계에서 동일한 `Number.isInteger` 계약은 없음 | 조작/복원 데이터의 소수·0 수량은 포팅에서 전송 실패 |
| 8 | **추천 출고품목** | `db-catalog.js:191-193`은 schema가 확장형을 구분하지 못해 `homeEx = home.slice()` | 원본 `추천실외기` 시트는 home/homeEx 축을 별도로 읽음 | 확장형 추천 실외기 모델이 일반형과 같아질 수 있음 |
| 9 | **표시·상태** | DB adapter `statusNote:68-72`가 `DISCONTINUED/NOT_FOR_SALE/OUT_OF_STOCK`를 `단종/미판매/품절`로 만들되 `remark`가 있으면 `remark || statusNote`로 상태를 숨김 | 원본은 시트 비고 문자열 자체가 상태 신호 | remark가 있는 품절/단종 품목의 표시·노출이 달라질 수 있음 |

## 4. 스키마 번역 핵심

`db-catalog.js`는 이번 배정에서 가장 직접적인 legacy→schema 번역층이다.

| legacy 필드/법칙 | 포팅 좌표 | schema 입력 | 판정·기본값 |
|---|---|---|---|
| `useK2` | `multiCatalog:90` | `products.has_variable_discount` | **[자동]** boolean 그대로. 원본의 납품가 수식 `$L$2` 탐지 결과와 같은 의미 |
| `고정DC` | `multiCatalog:95` | `products.fixed_discount_rate` | **[자동]** null은 `''`, 나머지는 문자열. 퍼센트 scale 해석은 계산 함수가 수행 |
| `matKey` | `singleSets:125` | `products.set_material_key` | **[자동]** 값 그대로, null은 `'D4'`. 원본 `$D$7/$D$8`, 기본 D4와 동일 |
| `isDisc` | `oldProducts:142` | legacy 응답 `legacyDiscountFlag` | **[부분]** PM 제시 schema에는 별도 `legacy_discount_flag`가 없으므로 `discount_flags` key 결정 필요(§9 D-13) |
| 구성품 수량 | `components:164` | `bundle_component.default_qty` | **[자동]** 명시값 그대로 문자열화, null만 `'1'`; 이름·HP 추론 금지 |
| 구성품 기본 | `components:161` | `bundle_component.is_default` | **[자동]** boolean 그대로 |
| 구성품 종류/variant | `components:154,160` | `component_kind/component_variant` | **[자동]** 값 그대로, null은 빈 문자열 |
| 가격 | `multiCatalog:87-88`, `singleSets:111-124`, `oldProducts:140-141`, `components:157-158` | `delivery_price/release_price` | **[자동]** `Number(v)||0`; 0=무료/미정은 결정 필요 |
| 분류 | `multiCatalog:82-94`, `singleSets:109-127` | raw name/model을 `code.js` classifier에 재투입 | **[부분]** DB `cat_l/m/s_id`가 있는데도 이름 파서를 다시 실행. `classification_manual`을 권위로 쓰지 않음 |
| 상태 | `statusNote:68-72` | `products.status` | **[자동]** 3 enum만 note로 번역. `remark` 우선이라 상태 소실 가능 |
| 용량/최대연결 | `multiCatalog:91,97` | API `capacity/maxIndoor` | **[부분]** `numOrNull` 이름과 달리 null/빈값을 0으로 바꿈. PM 제시 products 컬럼에는 둘 다 없으며 §9 D-12 결정 필요 |

## 5. 업무규칙 상세 규칙군

§6의 230개 업무규칙 함수 레지스터는 아래 R01~R10 중 하나를 참조한다. 각 규칙군이 공통 조건표·리터럴·읽는 속성·스키마·기본값·원본 대조를 제공하고, 함수별 위치와 예외축은 §6에서 다시 고정한다.

### R01. 품목 분류·노출·상태·표시 identity

① 함수군은 `classify*`, `normalize*Category`, `getStockState_`, `is*Row`, `statusNote`, catalog loader의 분류 callback이다(개별 위치 §6). ② 조건→결과:

| 조건 | 결과 |
|---|---|
| 비고/DB status가 `미판매|단종` / `NOT_FOR_SALE|DISCONTINUED` | 미판매/단종 note 또는 카탈로그 제외 신호 |
| `품절` / `OUT_OF_STOCK` | `품절` 표시 |
| 비고가 미래 `YYMMDD` | `MM.DD 예정` |
| 이름·모델이 실내기/실외기/판넬/리모컨/호스/분기관/받침대/펌프 패턴 | L/M/S와 역할 판정 |
| 상업 모델 `AM...N` / `AM...X` | 실내기 / 실외기 |
| `부자재2` | `부자재` 통합 |

③ 리터럴: `미판매`, `단종`, `품절`, `DISCONTINUED`, `NOT_FOR_SALE`, `OUT_OF_STOCK`, `SOLD`, `FUTURE`, `OK`, `HOME_MULTI`, `SINGLE_SET`, `COMMERCIAL_MULTI`, `LEGACY`, `부자재2`, `부자재`, `기타`, `실내기`, `실외기`, `판넬|패널`, `리모컨|리모콘`, `유연호스`, `분기관`, `받침대|발통|방진가대`, `드레인펌프`, `AM`, `N`, `X`, 모델 문자 위치 5·6·7·8·10, 길이 7·9·10·11, 연도 `2000+YY`. ④ 읽는 축: `name/model_code/remark/status/catL/M/S/pyong_size/spec`, DB `hasVariableDiscount/fixedDiscountRate`. ⑤ [있음] `products.status`, `cat_l/m/s_id`, `product_category`, `estimate_category`, `panel_type`, `remote_type`, `pyong_size`, `classification_manual`; [부분] 런타임 name regex provenance. ⑥ **[자동]** 명시 schema 값 우선, regex는 1회 seed 후보만. 충돌/무매칭은 🚩결정 필요. ⑦ 원본 동명 classifier와 대부분 같다. 차이는 DB adapter가 status enum을 note로 새로 합성하고, schema 분류가 있어도 포팅본이 이름 classifier를 다시 실행한다는 점이다.

### R02. 가격·DC·기준일·반올림·VAT

① `incActive`, `home/part/single/commUnitPrice`, `commPartUnitPrice`, `parseFixedDc`, `splitIndoorOutdoorToK`, config normalize/total adjustment 함수군. ② 조건→결과:

| 조건 | 결과 |
|---|---|
| 포팅 `due < priceChangeSchedule[category]` | `*_INC` 사용(주석상 인상 전 가격) |
| 원본 `due >= '2026-07-01'` | `*_INC` 사용(원본 주석상 인상 가격) |
| `useK2=true` 또는 고정DC 적용 | `round(list × (1-rate))` |
| fixed DC 입력 >1 또는 `%` | `/100`; `parseFixedDc`는 음수 0, 상한 0.99 |
| I형 호스 + `SHOW_I_HOSE=false` | 강제 8,000원 |
| 싱글 flags 360/4way/stand/1way/deluxe/grade1 | 정액 또는 1 미만 비율을 순차 적용, 각 단계 `max(0, …)` |
| VAT 포함 | `supply=round(abs(total)/1.1)`, `vat=abs(total)-supply` 계열 |
| 단위처리 | `ROUND/CEIL/FLOOR`, `unitRoundTo=0`이면 무처리 |

③ 리터럴: `0`, `0.1`, `1.1`, `11`, `0.03`, `0.45`, `0.5`, `0.99`, `100`, `1000`, `8000`, `2026-07-01`, `ROUND`, `CEIL`, `FLOOR`, `homemulti`, `singleSets`, `commercialMulti`, `price/list/unitPrice/priceRight/priceLeft/listLeft/releasePrice/deliveryPrice`, 6개 할인 key `discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount`. ④ 읽는 축: 출고가·납품가·고정DC·수식 `$L$2/$I$1`, `has_variable_discount`, 거래처 DC, 납기일, price baseline/schedule. ⑤ [있음] `products.release_price/delivery_price/fixed_discount_rate/fixed_discount_manual/has_variable_discount`, `classification.fixed_discount_rate`; [부분] `discount_flags`; [불가] 가격 이력·기준일 variant·거래처 DC·단위처리·총액 adjustment. ⑥ 품목 가격/DC는 **[자동]** 명시값 그대로. 공란 가격을 0으로 두는 것, 거래처 45%, 구형 50%, 8,000원 강제단가는 🚩결정 필요. ⑦ 원본과 다른 축은 §3의 기준일 방향, 상업 받침대 bypass 삭제, fixedDC 0 의미, 상업 구성품 price schedule 추가다. 금액 동일이라고 단정할 수 없다.

### R03. BUNDLE 구성·기본 구성품·옵션 치환·세트 폭발

① `partsFor*`, `explode*`, `components`, `singleSets`, `pickPanel*`, `calcSetUnitPrice` 함수군. ② 조건→결과:

| 조건 | 결과 |
|---|---|
| component가 부모 set model에 연결 | 주문/미리보기 구성품 행으로 전개 |
| `isDefault=true`/특징 `기본` | 기본 구성품 포함 |
| defaultQty 존재 | `setQty × defaultQty`; null은 1 |
| 판넬/리모컨 `제외` | 기본 구성품 차감 또는 전개 제외 |
| 상업 SET | 본체 header 대신 구성품으로 전송 |
| 구성품 0건 | 포팅 주문은 빈 전개 또는 경고 경로; 세트별 함수에 따라 header 보존 여부가 다름 |

③ 리터럴: `SET`, `EA`, `기본`, `포함`, `별도`, `판넬제외`, `공청판넬`, `블랙판넬`, `승강판넬`, `원형`, `사각`, `유선리모컨`, `컬러유선리모컨`, `Q`, `D4`, `D7`, `D8`, 배분비 4:6/6:4, 수량 fallback 1. ④ 읽는 축: set model, component model/name/kind/unit/variant/isDefault/specs/defaultQty, 세트 material key, 가격. ⑤ [있음] `products.product_type/bundle_mode/set_material_key`, `bundle_component.*`; [부분] 옵션별 전개 조건은 `component_variant`만으로 우선순위·제외를 모두 표현하기 어려움. ⑥ **[자동]** 시트/API의 명시 component tuple과 defaultQty만 저장. 이름·괄호·HP로 수량을 만들지 않는다. 기본구성 0건 BUNDLE 72개는 🚩결정 필요. ⑦ 원본 구성 shape를 유지하지만 포팅은 DB `components` adapter를 사용하고, `commPartUnitPrice`가 전개 구성품 금액을 새로 바꾼다.

### R04. 파생 수량·수량동기화·수동 잠금

① `recompute*`, `setDerivedQty`, manual lock, `select/evaluateSingleS03Rule`, panel/remote/pump/branch target 함수군. ② 조건→결과:

| 조건 | 결과 |
|---|---|
| source 수량 × factor × target multiplier | target 수량; `FLOOR`면 내림, 아니면 그대로 |
| S-03 rule이 정확히 1개·enabled·`SINGLE_SET/SUM/ZERO` | 선택 가능 |
| `when/conditionJson`이 비어 있지 않음 | 포팅 evaluator가 거부 |
| factor·multiplier 곱이 1에서 `1e-9` 초과 | 거부 |
| 사용자가 파생행에 빈칸이 아닌 값(0 포함) 입력 | manual lock, 후속 자동계산이 덮어쓰지 않음 |
| 옵션 변경 | 해당 scope/계열 lock 해제 후 재계산 |
| target catalog row 없음 | 홈은 fallback key를 state에 기록+경고, 싱글/상업은 실제 행 미반영+경고 |

③ 리터럴: `SINGLE_S03_CEILING_DRAIN_PUMP`, `S-03`, `SINGLE_SET`, `SUM`, `ZERO`, `NONE`, `FLOOR`, `1e-9`, 0, 1, `ADP-F075SP`, `AIM-A01N`, `AXJ-YA1509N`, `AXJ-YA2512N`, `AJ060MXHNBC1`, panel/remote/pump target 전량은 §7.1 설정표에 열거한다. ④ 읽는 축: `ruleKey/legacyRef/estimateCategory/enabled/aggregation/when/conditionJson/inactiveBehavior/sources.productCode/factor/targets.productCode/multiplier/roundingMode`, catalog model/id/name, 화면 수량·옵션. ⑤ [있음] `quantity_sync_rule/source/target`, `products.model_code`; [부분] `condition_json`은 DB에 있으나 소비 코드가 조건을 거부; [불가] 현 evaluator의 1:1 곱 강제, 음수 factor, ROUND/CEIL, clamp, MAX/REPLACE. ⑥ **[자동]** source/target model_code와 명시 수량 tuple만. 이름·HP 파서는 이식 금지. target 미확정은 🚩결정 필요. ⑦ 원본은 전부 이름/HP 하드코딩이며 manual lock이 없다. 포팅 설정 evaluator는 shadow라 사용자 수량은 여전히 원본식이고, manual lock 때문에 재계산 시점 결과는 원본과 달라질 수 있다.

### R05. 용량·조합률·분기관·추천실외기

① `getCapacity`, ratio/branch code/recommend adapter 함수군. ② 조건→결과: 실내기 누적용량÷실외기용량×100으로 조합률, 홈 130 초과 경고, 상업 103/120 경계, 누적용량 또는 outdoor HP 구간으로 분기관 코드, 추천 table의 HOME/MULTI 유형으로 실외기 HP를 고른다. ③ 리터럴: `100`, `103`, `120`, `130`, 분기관 `AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M`, 유형 `HOME_MULTI`, `MULTI_HEATING_COOLING`; 확장형 `homeEx`. ④ 읽는 축: capacity, maxIndoor, outdoorHp, indoorCapacity/count, model code/HP, 선택 수량. ⑤ [부분] target model은 `quantity_sync_*`; [불가] PM 제시 schema에 capacity range·max connection·recommendation variant가 없음. ⑥ 단순 model tuple은 **[자동]**, 임계구간·확장형·null을 0으로 치환하는 것은 🚩결정 필요(D-07, D-12). ⑦ 원본 추천 시트는 home/homeEx를 구분하지만 포팅 `db-catalog:191-193`은 둘을 동일 배열로 만든다.

### R06. 주문/견적 행·합계·전송품목·검증

① `sum*`, `buildSendRows`, `aggregateSendRows`, `confirmLines`, UI state→행 변환 함수군. ② 조건→결과:

| 조건 | 결과 |
|---|---|
| 수량 0/음수 또는 운임·절삭 제외 경로 | 전송행 제외(문맥별 예외) |
| 같은 model/spec/price/remarks | 전송행 병합, 수량 합산 |
| section `HOME/COMM/SINGLE/OLD` | `homemulti/commercialMulti/singleSets/oldProducts` |
| model 공백, category 불명, quantity 비정수·1 미만 | 포팅 REST confirm 거부 |
| BUNDLE이고 send-as-set 아님 | 구성품 전개 후 전송 |

③ 리터럴: `HOME`, `COMM`, `SINGLE`, `OLD`, `SET`, `EA`, `homemulti`, `commercialMulti`, `singleSets`, `oldProducts`, 0, 1, `999999`, `운임`, `절삭`. ④ 읽는 축: section/model/qty/remarks/name/spec/unit price/set component, DOM `data-unitraw`와 qty maps. ⑤ 제품/구성은 [있음], 주문 line/snapshot은 제시 schema 밖 [불가]. ⑥ 품목 기본값은 product/bundle에서 자동; 수동 행 값은 제품 기본값으로 승격하지 않는다. ⑦ 원본 전송행 계산은 대체로 유지되나 포팅 `confirmLines`가 정수·최소 1을 서버 직전 강제한다.

### R07. 창고·전표 bridge·출고 payload

① `decideWarehouseCode_`, `sendOrderFromUi`, `buildSlipRequest`, 창고/name/section helper. ② 조건→결과: 특정 이름/section이면 warehouse `2`, 그 외 `00003`; legacy SaleList의 `PROD_CD/QTY/PRICE/USER_PRICE_VAT/SUPPLY_AMT/VAT_AMT/REMARKS`를 slip line으로 옮긴다. estimateNumber가 없으면 `WEB-{IO_DATE|NA}-{Date.now()}`, IO_TYPE 기본 `'10'`, lineNo는 1부터다. ③ 리터럴: `2`, `00003`, `10`, `WEB-`, `NA`, endpoint `/internal/slips/from-estimate`, header `X-Internal-Token`, `X-Caller=estimate-app`; warehouse 판정 이름 집합은 함수 레지스터 R07 행에 보존. ④ 읽는 축: section/name/model, header `IO_DATE/TIME_DATE/CUST/EMP_CD/WH_CD/U_TXT1/ADD_TXT_*/U_MEMO*`, line `PROD_*`, qty/amount/VAT. ⑤ product schema로는 [불가]; order warehouse policy와 slip line schema가 필요. ⑥ model→warehouse 명시 mapping만 자동 가능, 이름 추론 금지. 금액·수량 누락 기본은 🚩결정 필요(D-14). ⑦ 원본은 e-Count proxy SaleList POST, 포팅은 slip-service request로 번역한다. 금액 필드는 그대로 숫자화하지만 missing/NaN을 0으로 바꾸고 estimateNumber를 새로 합성한다.

### R08. snapshot·이력·manual state 복원

① branch snapshot/history 및 manual lock serialize/restore 함수군. ② 저장된 manual lock이 있으면 복원하고, 구 R2 key는 `home|comm|single` 접두로 호환; 자동 계산값과 snapshot 값이 다르면 manual로 승격한다. ③ 리터럴: `manualQtyLocks`, 정규식 `^(home|comm|single)Manual`, scope `home/commercial/single`, history page size 20. ④ 읽는 축: 수량 map, lock set, branch state, draft/history payload. ⑤ 제시 product schema 밖 [불가]. ⑥ 제품 기본값이 아니며 snapshot override로 유지. ⑦ 원본 주문 snapshot은 값만 복원했고 포팅은 수동잠금 상태까지 보존하므로 후속 재계산 수량이 달라질 수 있다.

### R09. 거래처 DC·directory shape·견적 기본 설정

① `getAllNotionDcConfigs_`, customer/DC merge, `fetchPartners/fetchManagers`, default option 함수군. ② 조건→결과: bizno/code 정규화 후 DC 매칭; nested `dc.*Rate/*Amount`를 legacy key로 변환; directory partner는 manager/managerTel 빈값, `singleDiscount=0`; options 기본은 상업 panel=`기본판넬`, 360=`원형`, remote=`무선`, unit mode=`ROUND`. ③ 리터럴: `0.45`, 0, `ROUND`, `기본`, `기본판넬`, `원형`, `무선`, page limit 5000, max pages 20, manager limit 500. ④ 읽는 축: partnerCode/name/bizNo/representative/address/phone/note/group, fullName/ecountCode, 거래처 DC 6종/rounding. ⑤ product schema 밖 [불가]; `classification.fixed_discount_rate`는 거래처 override가 아니다. ⑥ 명시된 거래처 값만 자동 이식; 누락을 영구 45%/0으로 저장하지 않고 정책 fallback으로 둔다. ⑦ 원본 Google Sheet/Notion directory에서 service API로 원천이 바뀌었다. 포팅 `fetchPartners`는 원본 manager와 single discount를 빈값/0으로 버린다.

### R10. 재고/날짜/업무 게이트 중 product 기본값이 아닌 규칙

① `detectHomeOrder`, `isValidTel`, order readiness, tier adjustment, 주소/배송 조건 등 나머지 업무 helper. ② 홈/상업/싱글/구형 선택 여부, 전화번호 형식, 메인장비 유무, 45% 기준 bonus/penalty, 배송/주소 조건이 결과 행 또는 할인율을 제어한다. ③ 리터럴: 전화 숫자 9~11자리, 기준율 `0.45±0.001`, bonus `0.01/0.02/0.03/0.04`, 포팅 상한 `0.48`, 구간 `1,000,000/3,000,000/5,000,000/100,000,000`, `경동`, `지방/`, `야적`. ④ 읽는 축: 선택 수량, section 합계, 주소/전화/배송일, product name/category. ⑤ 대체로 product schema 밖 [불가]. ⑥ 제품 기본값으로 저장하지 않는다. ⑦ 원본과 포팅의 45→40 판정 대상이 이미 견적/주문 간 달랐고, 포팅 주문은 원본 주문식에 0.48 clamp를 유지한다.

## 6. 업무규칙 함수 레지스터 — 230건

표기 `함수:줄`은 해당 파일 내부 좌표다. 중첩 arrow도 고정 inventory 한 건으로 그대로 센다.

### 6.1 `clients/web/order-app/index.html` — 업무규칙 170

| 규칙 | 함수:줄(전량) | 원본 대조 요약 |
|---|---|---|
| R01 (18) | `isExpansionModel:1420`, `getModelFlags:1473`, `isWallMountName:1577`, `getStockState_:1583`, `isPanelRow:1611`, `inferOneWaySize:1616`, `isRemoteRow:1624`, `isCommIndoorRow:2388`, `isCommOutdoorRow:2395`, `commIndoorKind:2410`, `isCommPanelRow:2420`, `isCommHoseRow:2426`, `isCommRemoteRow:2432`, `isCommPumpRow:2438`, `normalizeHomeCategory:2612`, `classifySingleSetFixed:2627`, `normalizeCommCategory:4273`, `fixCommMidCategory:4281` | 원본 주문의 분류·이름 파서 계승. 호출이 없는 경계 helper도 dead로 단정하지 않고 업무규칙으로 보존 |
| R02 (22) | `incActive:1447`, `normalizeDcRate:1507`, `normalizePartnerConfig:1513`, `applyConfigFromServer:1533`, `parseFixedDc:1556`, `adjustSingleSetBasePrice:1715`, `roundK:1746`, `roundByConfig:1752`, `splitIndoorOutdoorToK:1796`, `analyzeSingleSetDiscountFlags:1826`, `applyHomeMultiPriceVat:2604`, `priceFrom:2679`, `homeUnitPrice:2697`, `partUnitPrice:2745`, `commPartUnitPrice:2762`, `setBasePriceLeft:2770`, `singleUnitPrice:2779`, `calc:2812`, `commUnitPrice:2825`, `setBasePriceRightFirst:3283`, `sumOld:4889`, `getSetUnitNowById:6036` | `incActive/normalize*/commPartUnitPrice`는 포팅 전용. 기준일 방향·받침대·fixedDC 0 차이 있음; 반올림·화면 단가 조회도 전송 금액에 유입 |
| R03 (12) | `pickPanelBy:1636`, `materialsSumForSet:3243`, `getOptionRemoteRow:3249`, `getBasePanelRow:3265`, `pickPanelRow:3266`, `calcSetUnitPrice:3296`, `partsForSetStrict_:3326`, `explodeSetParts:3332`, `partsForCommSet_:3473`, `explodeCommPreviewParts:4733`, `explodeCommSets_:4752`, `explodeSendSets_:6050` | 원본 동명. 포팅 구성품 가격은 R02의 새 helper로 달라질 수 있음 |
| R04 원본계승 (29) | `computeCommRemoteModelForIndoor_:2444`, `pickHoseModel:2477`, `pickCommPanelModel:2485`, `hasExactHP:2491`, `parseSetHPs:2497`, `chooseBaseModel:2504`, `basesForSetPiecesByExistingRule_:2549`, `countBranchForSet:2574`, `bindQty:2975`, `bindCommQtyEvents:3031`, `inferStandCountForOutdoor_:3485`, `recalcCommAccessories:3492`, `onHomeQtyInput:5056`, `onSingleQtyInput:5088`, `recomputeFootAll:5159`, `recomputeSingleBaseFoot:5168`, `recomputeSingleExtras:5184`, `findHomePanelModel:5248`, `pickInfinitePanelModel:5263`, `inferInfiniteSize:5278`, `recomputeHomePanels:5287`, `recomputeHomeRemotes:5431`, `recomputeHomeBranches:5487`, `recomputeHomeDerived:5621`, `recomputeCommDerived:5687`, `computeCommPanelModelForIndoor_:5892`, `syncCommQtyFromDOM:7361`, `setCommBranchQtyByLike:7764`, `pushBranchPartsToCommFromBadges:7773` | 원본 이름/HP 파서와 수량 입력 제약 유지. 이식은 §7.1 tuple만 허용 |
| R04 포팅전용 (37) | `lockScope_:2289`, `targetScope_:2290`, `registerDerivedQty:2291`, `isManualQtyLocked:2295`, `setManualQtyLock:2296`, `clearManualQtyLocks:2302`, `owns:2314`, `setDerivedQty:2335`, `seedDerivedQty:2340`, `serializeManualQtyLocks:2341`, `hasSnapshotManualQtyLocks:2344`, `restoreSnapshotManualQtyLocks:2349`, `restore:2351`, `restoreLegacyDerivedQty:2369`, `clearHomeManualLocks:2923`, `clearCommManualLocks:2930`, `isCommDerivedRow:3006`, `commManualSetForRow:3018`, `applyCommManualLock:3021`, `isCommManualLocked:3027`, `onCommOptionChange:4303`, `isHomeManualLocked:5042`, `isHomeDerivedRow:5045`, `isSingleDerivedRow:5079`, `isSingleManualLocked:5083`, `applySingleManualLock:5084`, `onHomeOptionChange:5116`, `recomputeSingleDerived:5206`, `setP:5289`, `setR:5433`, `setB:5489`, `loadSingleS03QuantitySync_:5545`, `setHomeDerivedQty_:5568`, `setSingleDerivedQty_:5584`, `setH:5623`, `setRequiredH:5624`, `requireCommCatalogRow_:5699` | 원본에 없음. manual lock은 수량/출고품목 차이, S-03 설정은 shadow, missing catalog는 표시 차이 |
| R05 (10) | `getCapacity:3154`, `updateHomeRatio:3161`, `updateCommRatio:3190`, `capFromModel:7105`, `pickSelectedOutdoors:7111`, `pickSelectedIndoorsExpanded:7137`, `codeByCumulativeSum:7169`, `codeByOutdoorHP:7179`, `recomputeBranchCodes:7195`, `updateBranchRatios:7720` | 원본 동명. 임계/코드 mapping 유지 |
| R06 (28) | `modelExists:1609`, `clearAllPanels:1628`, `clearAllRemotes:1631`, `isIndoorUnitPart:1772`, `isOutdoorUnitPart:1785`, `modelByNameLike:2561`, `markAutoHome:2915`, `markAutoSingle:2916`, `sumHome:2936`, `sumSingles:2937`, `sumComm:2938`, `allowRemoteChange_:3256`, `is1WaySet_:3260`, `buildCommSetIndex:4662`, `isCommSetRow:4747`, `isHomeCalcTriggerModel:5214`, `isSingleCalcTriggerId:5223`, `pickModel:5362`, `checkOrderReady:6408`, `aggregateSendRows:6425`, `buildSendRows:6542`, `limitByOutdoor:7701`, `sumCapsIn:7704`, `firstBranchByOutdoorCap:7710`, `saveBranchState:7813`, `loadBranchState:7820`, `applyBranchState:7831`, `buildSendRows:8210` | 원본 동명. 두 `buildSendRows`는 일반/전역 wrapper로 모두 살아 있음 |
| R08 (1) | `snapshotBranchState:7796` | 원본 동명. 포팅은 manual lock snapshot이 추가됨 |
| R10 표시 identity (4) | `stripCommKeywords:1681`, `displayOverrides:1703`, `singleDispNameTrimmed:2870`, `buildDisplayNameComm:4604` | 표시명이나 전송 productName에 반영되므로 UI가 아닌 업무규칙. 원본 동명 |
| R02 bonus (4) | `isNoMainUnit:8054`, `getTierBonusRate:8093`, `isStandard45:8102`, `runWithAdjustedRates:8107` | 원본 주문식 유지. 45%·구간 bonus·0.48 clamp |
| R09 (4) | `getDefaultRemoteRows:3248`, `renderCommOptions:4312`, `renderHomeOptions:5124`, `renderSingleOptions:5135` | 원본 기본 구성 선택과 포팅 화면의 panel/remote/discount 기본값 주입. 렌더 함수지만 실제 선택 상태를 설정하므로 업무규칙 |
| R10 validation (1) | `isValidTel:6369` | 원본 동명; 숫자 9~11자리 gate |

### 6.2 `clients/web/estimate-app/lib/**` — 업무규칙 57

| 파일·규칙 | 함수:줄(전량) | 원본 대조·schema 판정 |
|---|---|---|
| `code.js` R01/R10 (11) | `normalizeSize_:221`, `sanitizeKoreanParen_:278`, `trimSymbols_:287`, `sanitizeDisp_:291`, `hpFromText_:296`, `isBlockedByNote_:306`, `unifyCatL_:319`, `classifyHome_:509`, `classifySingleSetLM_:602`, `classifyCommercial_:634`, `classifyCommercialDisp_:721` | 원본 견적 Code.js 동명. 분류/상태/표시 seed. HP 파싱은 수량 이식에 사용 금지 |
| `code.js` R06 (2) | `detectHomeOrder:380`, `U:387` | 원본 동명. HOME 주문 포함 여부 판정 |
| `code.js` R02 (8) | `normalizeEstimateConfig_:399`, `num:401`, `bool:406`, `str:413`, `amount:414`, `buildDefaultDcConfig_:444`, `splitVatAmount_:461`, `applyEstimateTotalAdjustments_:471` | 일부 포팅 전용 config normalization. 45%·50%·VAT·카드/선금/절삭 정책은 product schema 밖 |
| `code.js` R01/R02/R03 loaders (7) | `getHomeMulti:744`, `getSingleSets:827`, `getSingleParts:919`, `getSingleMatPrices:989`, `getCommercialMulti:1007`, `getCommercialParts:1097`, `getOldProducts_:1176` | 원본 동명 sheet loader. 포팅은 DB 우선/sheet fallback |
| `code.js` R09 defaults (4) | `getHomeDefaults:1215`, `pick:1233`, `getSingleDefaults:1256`, `pick:1277` | 원본 동명. 시트 1~2행 옵션 기본 |
| `code.js` R05 (1) | `getRecommendOduData:1303` | 원본 동명. 추천실외기 시트 fallback |
| `code.js` R10 spec (4) | `getSpecDetailMap_:1381`, `normH:1389`, `findHeaderRow:1390`, `idx:1397` | 원본 동명. 열 위치/별칭을 상세 spec shape로 번역 |
| `code.js` R09 partner DC (5) | `getAllNotionDcConfigs_:1987`, `getCustomerDataAsync:2037`, `pickDc:2043`, `searchCustomerByBizOrCode:2067`, `initDcConfigFromNotion:2127` | 원본 Notion/Sheet 의미를 service/cache로 이관. product 기본값 아님 |
| `code.js` R07/R06 (4) | `decideWarehouseCode_:2244`, `getOrigName_:2248`, `getSection_:2254`, `sendOrderFromUi:2292` | 원본 동명. 창고·SaleList 조립은 유지, 실제 전송은 slip bridge로 변경 |
| `db-catalog.js` R01 (2) | `statusNote:68`, `multiCatalog:79` | 포팅 전용. status enum·`has_variable_discount→useK2`·고정DC·가격 translation |
| `db-catalog.js` R03 (4) | `singleSets:106`, `oldProducts:134`, `components:149`, `materialPrices:169` | 포팅 전용 adapter. `matKey`, `isDisc`, component qty/default/variant 번역 |
| `db-catalog.js` R05/R02 (2) | `recommendOduData:180`, `priceIncData:197` | 원본 시트 getter 대체. `homeEx=home` 차이, baseline shape 번역 |
| `directory.js` R09 (2) | `fetchPartners:56`, `fetchManagers:88` | 포팅 전용. partner/user service → legacy shape; manager 빈값·singleDiscount 0 기본 |
| `slip-bridge.js` R07 (1) | `buildSlipRequest:93` | 원본 `sendOrderFromUi` SaleList → slip-service request. estimateNumber/lineNo/default 필드가 포팅에만 추가 |

`db-catalog.js`의 `priceChangeSchedule`, `priceDefaultVariant`, `specDetailMap`, `estimateConfig`는 업무 데이터 자체를 반환하지만 함수 본문은 status 200을 확인하고 응답을 그대로 반환하는 HTTP adapter이므로 인프라로 분류했다. 반대로 위 8개는 필드명·기본값·분기·배열 shape를 바꾸므로 업무규칙이다.

좌표 주의: 고정 inventory가 만들어진 뒤 현 소스 `db-catalog.js:52`에 `quantitySyncRules`가 추가되어 이후 함수가 8줄 밀렸다. 이 함수는 고정 분모 16개에 없으므로 이번 615건에는 넣지 않았다. §6.2는 **현 소스 좌표**, §8.2 원장은 **고정 inventory 좌표**를 사용한다.

### 6.3 `clients/web/order-app/src/*.ts` — 업무규칙 3

| 함수 | 위치 | 조건→결과·리터럴·schema·기본값·원본 대조 |
|---|---|---|
| `selectSingleS03Rule` | `quantitySync.ts:97` | R04. `SINGLE_S03_CEILING_DRAIN_PUMP/S-03`, enabled, `SINGLE_SET`, `SUM`, `ZERO`, 무조건 rule, source≥1, target=1, catalog 존재, factor×multiplier≈1을 모두 강제. [부분] quantity schema는 표현하나 `condition_json`을 거부. 포팅 전용 shadow selector |
| `evaluateSingleS03Rule` | `quantitySync.ts:174` | R04. `Σ(source qty×factor)×multiplier`, `FLOOR|NONE`, target 한 개. [있음] source/target/factor/multiplier/rounding. 기본 tuple은 자동 확정 불가. 원본은 실링 이름 합산으로 펌프를 계산 |
| `confirmLines` | `samhanApi.ts:207` | R06. section 4종→categoryKey, model 필수, 수량 정수≥1, remark trim/null. product model은 [있음], 주문 line schema는 범위 밖. 원본 서버 경계에는 동일 정수 gate 없음 |

### 6.4 `MOBILE` — 업무규칙 0

네 파일은 URL 선택·WebView fetch header 주입·RN postMessage 배관뿐이며 가격·수량·출고품목·분류·기본값을 계산하지 않는다.

## 7. 수량 설정값 환원·원본/포팅 전용 규칙

### 7.1 이름·HP 파싱을 폐기하고 저장할 `(본체, 부자재, 수량)`

다음은 코드가 source와 target을 모두 명시한 확정 tuple이다. 각 행은 `factor=1`, `multiplier=1`, `rounding_mode=NONE`; source 한 대당 target 한 대다.

| rule_key | 본체 source model_code | 부자재 target model_code | 수량 |
|---|---|---|---:|
| COMM_PUMP_01 | AM052DNLDBH1 | MDP-Z075SZED | 1 |
| COMM_PUMP_02 | AM072DNLDBH1 | MDP-Z075SZED | 1 |
| COMM_PUMP_03 | AM100FNLDBH1 | ADP-E075SEK3D | 1 |
| COMM_PUMP_04 | AM130DNMDBH1 | MDP-M075SGK2D | 1 |
| COMM_PUMP_05 | AM145DNMDBH1 | MDP-M075SGK2D | 1 |
| COMM_PUMP_06 | AM083DNMDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_07 | AM100DNMDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_08 | AM110DNMDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_09 | AM052ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_10 | AM060ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_11 | AM072ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_12 | AM083ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_13 | AM100ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_14 | AM110ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_15 | AM130ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_16 | AM145ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_17 | AM230ANHDBH1 | ADP-G075SPK1D | 1 |
| COMM_PUMP_18 | AM290HNHDBH1 | ADP-N047SNK1D | 1 |
| COMM_PUMP_19 | AM072TNCDBH1 | ADP-F075SP | 1 |
| COMM_PUMP_20 | AM110TNCDBH1 | ADP-F075SP | 1 |
| COMM_PUMP_21 | AM130TNCDBH1 | ADP-F075SP | 1 |
| COMM_PUMP_22 | AM145TNCDBH1 | ADP-F075SP | 1 |
| COMM_FILTER_09_01 | AM035FXMRHC1 | AF-R09A | 1 |
| COMM_FILTER_09_02 | AM050MXMRBC1 | AF-R09A | 1 |
| COMM_FILTER_09_03 | AM050FXMRHC1 | AF-R09A | 1 |
| COMM_FILTER_12_01 | AM075FXMRHC1 | AF-R12A | 1 |
| HOME_BRANCH_6HP | AJ060MXHNBC1 | AXJ-YA2512N | 1 |

다음은 target은 확정됐지만 source model_code 전량을 현재 코드가 이름/속성으로 찾는 규칙이다. **아래 조건을 runtime parser로 이식하지 않는다.** `products`의 정규화 속성으로 source model_code를 먼저 확정한 뒤 source별 행을 만든다.

| source 정규화 속성 | target | 수량 | condition_json 후보 |
|---|---|---:|---|
| HOME 1way WIFI 소/중/대 | PC1MWSK3NW / PC1NWSK3NW / PC1BWSK3NW | 1 | `panel=DEFAULT` |
| HOME 1way 미내장 소/중/대 | PC1MWSK3N / PC1NWSK3N / PC1BWSK3N | 1 | `panel=DEFAULT` |
| 위 source, 공청 | PC1MWCK3N(W) / PC1NWCK3N(W) / PC1BWCK3N(W) | 1 | `panel=AIR_CLEAN` |
| HOME 인피니트 중/대 | PC1YNWK1NW·PC1YNRK1NW / PC1ZNSK1NW·PC1ZNWK1NW·PC1ZNRK1NW | 1 | panel variant |
| HOME 4way WIFI/미내장 | PC4NUFK1NW / PC4NUFK1N | 1 | `panel=DEFAULT` |
| HOME 4way 공청 | PC4NUCK4NW / PC4NUCK1N | 1 | `panel=AIR_CLEAN` |
| HOME 360 WIFI/미내장 | PC6NUNK1NW·PC6NUDK1NW / PC4NUNK1N·PC4NUDK1N | 1 | `shape=ROUND|SQUARE` |
| HOME/COMM 1way·2way | 확정된 L/I형 1way hose model | 1 | `hose=DEFAULT|I` |
| HOME/COMM 4way·360 | 확정된 4way hose model | 1 | `hose!=EXCLUDED` |
| HOME 360 / 인피니트 / 일반 실내기 | AR-KH05(포팅 주문) 또는 AR-EC05(원본 탐색) / AR-CH01 / 무선 remote model | 1 | `remote=DEFAULT` |
| COMM 전열/덕트/UV·인피니트/기타 실내기 | AWR-VH12N / AWR-WE13N·AWR-WG00N / AR-CH01 / AR-EH05 | 1 | remote variant |
| SINGLE 실링 세트 | ADP-F075SP | 1 | pump enabled |
| SINGLE 1way 세트 | AIM-A01N | 1 | wired remote enabled |
| AP230DAPDHH1S / AP290DAPDHH1S | SI-AL700a | 1 | base enabled |

`parseSetHPs`, `hasExactHP`, `chooseBaseModel`, `countBranchForSet`, `recomputeHomeBranches`, panel/remote classifier는 이식 대상이 아니라 **tuple 생성 전 조사 근거**다. source model_code가 확정되지 않은 행은 활성 rule을 만들지 않는다.

### 7.2 `condition_json`과 소비 코드의 정확한 간극

`clients/web/order-app/src/quantitySync.ts:126-129` 원문:

```ts
const when = rule.when ?? rule.conditionJson ?? {}
if (!when || typeof when !== 'object' || Array.isArray(when) || Object.keys(when).length > 0) {
  return selectionError('S-03 규칙은 조건 없는 설정만 지원합니다.')
}
```

즉 DB의 `quantity_sync_rule.condition_json`은 조건 저장을 허용하지만, 소비자는 **빈 plain object만 허용**한다. `null`, 배열, primitive, key가 하나라도 있는 object는 모두 거부한다. 옵션별 panel/remote/hose/base rule을 §7.1처럼 `condition_json`에 저장해도 현재 주문앱은 선택하지 못한다. 더구나 `index.html:5545-5555`는 선택에 성공해도 shadow log만 남기므로, 이 간극을 해소하지 않으면 schema 설정값이 사용자 수량을 결정하지 않는다.

### 7.3 원본에는 있는데 포팅본에 없는 것

원본 보고서의 이미 완료된 이름/adapter 대조를 재사용했다(원본 GAS 재조사 없음).

| 원본 업무함수 | 원본 위치 | 포팅 판정 |
|---|---|---|
| `saveOrderSnapshot`, `getOrderSnapshotHistory` | 주문 Code.js:105,169 | 동명은 없지만 order draft/snapshot REST adapter로 대체; manual lock까지 추가돼 의미는 확장 |
| `getHomeIncreasePrices_`, `getCommIncreasePrices_`, `extractSingleIncreasePrices_`, `getSingleIncreasePrices_`, `getSinglePartsIncreasePrices_`, `extractIncreasePrices_` | 주문 Code.js:281-358 | `dbCatalog.priceIncData/getPriceIncData_` 및 bootstrap price maps로 통합. **기준일 방향은 동일하지 않음** |
| `getOrderHistory` | 주문 Code.js:3084 | 포팅 `samhanApi` history API와 `fetchOrderHistory`로 대체 |
| `processLongTermUnusedClientsFast`, `getActiveBizNosFromLog_`, `getActiveBizNosFromShipping_`, `getTargetClients_`, `updateClientStatus_` | 장기미발주 Code.js:12-214 | **포팅 대체 없음 확정**. 30일·월요일 partner 상태 workflow 유실 |

원본 주문 index의 주소검색/초기화 helper 14개 이름도 포팅에 없지만, 출고품목·금액·수량 업무규칙은 아니며 주소 UI/API 교체로 본다.

### 7.4 포팅본에만 있는 업무규칙

| 포팅 전용 묶음 | 함수/위치 | 다른 축 |
|---|---|---|
| 동적 가격 기준일 | `incActive:1447`, `commPartUnitPrice:2762`, config normalize `:1507-1529` | **금액**: 고정일 `>=`에서 category schedule `<`로 의미 반전, 상업 구성품 baseline 추가 |
| manual derived lock | §6.1 R04 포팅전용 37개 | **수량·출고품목**: 명시적 0 포함 사용자 override를 재계산보다 우선 |
| catalog missing warning | `note*/render*CatalogWarnings:5560-5699` 중 계산 gate/helper | 표시+출고: 누락 target을 조용히 버리지 않고 경고; 홈/싱글/상업 반영 방식이 서로 다름 |
| DB catalog translation | `db-catalog.js` 업무 8개 | schema→legacy: useK2/matKey/isDisc/defaultQty/status/price/recommend variant |
| service directory translation | `directory.js:56,88` | 원본 Sheet/Notion을 service로 교체하며 manager/DC 일부를 빈값/0으로 기본화 |
| slip request translation | `slip-bridge.js:93` | 출고 payload: ECOUNT SaleList를 slip request로 승격, estimateNumber/lineNo 생성 |
| REST confirm validation | `samhanApi.ts:207` | 수량: 서버 직전 정수≥1 강제 |

## 8. 전체 함수 분류 원장 — 615건

### 8.1 `ORDER-APP` — 358

- 업무규칙 170: §6.1에 함수:줄 전량 수록.
- UI·표시 151:

```text
__SAMHAN_RENDER_BOOTSTRAP_FATAL__:27, toggleTheme:666, optionHtml_:1405, specValueHtml_:1417,
cleanDisplayName:1672, closeSpecModal:1855, openSpecModalByItem:1859, renderHomeSpec_:1904,
renderSingleSpec_:1941, renderCommSpec_:2033, renderErvSpec_:2137, renderPanelSpecCommon_:2177,
buildTripleSpecRows_:2189, specTableWithTriple_:2204, specTable_:2256,
syncCommTotals:2943, setFootSum:2952, bindCommQtyArrowNav:3130, setPreviewFoot:3229,
escapeFilterRe_:3521, applyHomeFilter:3525, applySingleFilter:3544, applyCommFilter:3562,
updateHomeFilterOptions:3582, updateSingleFilterOptions:3644, updateCommFilterOptions:3693,
initFilters:3803, renderHome:3856, renderSingle:4036, buildSingleSetCompositionHtml_:4208,
syncCommManualUI:4288, getCommFilterRows_:4336, renderComm:4399,
displayNameForRow:4643, findCommSetAnchor_:4687, findCommSetPartRows_:4692,
findCoveringCommGroupCell_:4697, adjustCommSetGroupRowSpans_:4712, removeCommSetParts:4722,
renderCommSetParts:4770, renderOld:4811, syncOldTotals:4910, initMobileUI:4926,
showMobileGate:4944, hideMobileGate:4952, onViewportChange:4960, enterMobile:4988,
updateTopControls:5012,
noteHomeCatalogMissing_:5560, noteSingleCatalogMissing_:5576, renderCatalogWarnings_:5592,
renderHomeCatalogWarnings:5612, renderSingleCatalogWarnings:5616, renderCommCatalogWarnings:5683,
noteCommCatalogMissing_:5692, syncHomeUIFromState:5979, syncSingleUIFromState:5995,
syncHomeTotals:6008, refreshSelectedBadge:6014, openPreview:6079,
ensureKakaoPostcode:6219, mountAddrSheet:6229, fit:6276, openPostcode:6298, oncomplete:6349,
onresize:6352, syncAuditFromShip_:6373, toggleSameAddr_:6380, hideBranchPageForCategory:6466,
showSector:6471, initGate:6482, forceOrderTitle:6661, initEvents:6671, bindOrderHotkeys:6783,
run:6784, applyDateChange:6792, updateInlineTotals:6851, fixFootersForMobile:6869,
fitTableWrap:6924, fitAllTables:6956, goHome:6973, goSingle:6983, goComm:6993, goOld:7009,
bindViewSwitchButtons:7036, canOpenBranch:7271, refreshBranchButton:7284,
ensureBranchScaffold:7311, goBranchPage:7371, backToComm:7386, updateBranchTopButton:7407,
handleBranchToggleClick:7417, setBranchTopButtonForBranch:7426, renderBranchTable:7442,
makeCapsule:7491, fixBranchDOM:7503, wireBranchDnD:7513, packOutColumn:7591, repackLeft:7619,
pushBackToLeft:7643, buildBranchView:7658, packAllOutColumns:7694, canOpenBranchFromComm:7879,
refreshBranchOpenButton:7894, prepareGateImages:7958, isGateVisible:7968,
showGateImageModal:7977, updateImgSlide:8039, openPreview:8184, onAuthStatus:8260,
getRpcFailureMessage:8353, showAuthModal:8366, completeLogin:8538, fetchExpirationDate:8598,
startExpirationPolling:8614, playWelcomeAnimation:8619, showLoadingGate:8676,
enforceDateLimit:8756, renderHistory:8850, openDetail:8897, ymd:8901, comma:8902,
logActionToNotion:8947, sendLog:8961, relocateUI:8981, updateTopControls:9103,
toggleDrawer:9124, handleResize:9138, takeSnapshot:9147, updateTopControls:9192,
handleSaveSnapshot:9219, showCustNameModal:9366, applySnapshot:9439, goSnapshotPage:9520,
closeSnapshotPage:9549, loadSnapshotHistory:9557, renderSnapshotTable:9592,
restoreSnapshot:9628, showSnapshotPreview:9634, initAutoLogout:9700, updateTimerDisplay:9705,
resetTimer:9728, closeAllTutDrawers:9830, openTutDrawer:9840, setTutBlockers:9888,
hideTutBlockers:9914, checkAndStartTutorial:9921, runTutStep:9939, trackTarget:10037,
updateArrow:10084, endTut:10131
```

- 인프라·유틸 37:

```text
escapeHtml:16, markBootstrapFatal:22, J:1377, escapeLegacyHtml:1378, attrSafe_:1383,
safeLegacyImageSrc:1384, safeLegacyImageSrcAttr:1401, jsStringSafe_:1409, configNumber:1502,
has:1637, join_:2147, rawNameOf:2383, rgbForMid:2591, first:2681, syncIcon:3817,
syncIcon:3831, syncIcon:3847, normKey:4656, isMobileNow:4918, apply:4927, chk:5122,
sel:5123, has:5249, has_:5891, swap:5914, call:6964, setText:6966, fmtOrRaw:6968,
valuesOf:6970, debugIndoorsScan:7398, fetchOrderHistory:8832, toYMD:9184, res:9466,
decodeBase64:9691, getTarget:10003, getEvtTarget:10059, handler:10117
```

- dead_code 0.

### 8.2 `ESTIMATE-LIB` — 204

| 파일 | 업무규칙 | UI | 인프라 | dead | 계 |
|---|---:|---:|---:|---:|---:|
| `apps-script-shim.js` | 0 | 0 | 35 | 0 | 35 |
| `auth-context.js` | 0 | 0 | 5 | 0 | 5 |
| `code.js` | 46 | 0 | 62 | 14 | 122 |
| `db-catalog.js` | 8 | 0 | 8 | 0 | 16 |
| `directory.js` | 2 | 0 | 3 | 0 | 5 |
| `google-sheets-client.js` | 0 | 0 | 6 | 0 | 6 |
| `quoteSnapshotContract.js` | 0 | 0 | 0 | 3 | 3 |
| `slip-bridge.js` | 1 | 0 | 2 | 0 | 3 |
| `version-check.js` | 0 | 0 | 1 | 7 | 8 |
| `version-gate.js` | 0 | 0 | 0 | 1 | 1 |
| **합계** | **57** | **0** | **122** | **25** | **204** |

업무규칙 57건은 §6.2에 전량 수록했다. 나머지 원장은 다음과 같다.

- `apps-script-shim.js` 인프라 35:

```text
formatDate:72, base64Encode:88, base64Decode:93, getActiveUser:102, getScriptTimeZone:105,
_cacheNow:115, get:120, put:129, remove:135, getProperty:150, getProperties:153,
setProperty:156, _isExternalDeprecated:179, _doFetch:194, _wrapResponse:229,
constructor:279, getDataRange:293, getRange:312, getLastColumn:337, constructor:343,
getSheetByName:348, openById:364, preloadSheet:380, preloadSheets:398, clearSheetCache:412,
injectSheet:421, constructor:437, getBlob:444, constructor:453, getFiles:458,
getFolderById:468, getRootFolder:472, createTemplateFromFile:483, evaluate:487,
createHtmlOutputFromFile:496
```

- `auth-context.js` 인프라 5: `sign:10`, `serialize:14`, `deserialize:19`, `readCookie:32`, `cookieHeader:38`.
- `code.js` 인프라 62:

```text
_msGet:96, _msPost:110, cachePutJSON_:182, cacheGetJSON_:193, cacheRemoveJSON_:206,
findIdx_:227, parseKRNumber_:232, parseKRFloat_:239, findContains:1404, scanHome:1411,
scanSingle:1493, splitBar:1521, splitSlash:1526, scanComm:1570, iDuct:1597,
joinCols:1630, getPriceIncData_:1745, readSheetTab:1753, getLogoImage:1812,
getGateImages:1820, bootstrap:1842, preloadDirectoryCache_:1946, clearSheetCache:1970,
num:2006, getCustomers_:2059, searchCustomerByBizno:2085, getManagers_:2092,
getAllManagers:2096, searchManagersByName_:2101, findManagerByNameExact_:2108,
getManagersForInput:2116, num:2152, fetchNotionDcConfig_:2195, getScriptCreds_:2204,
callZoneApi:2214, getEcountSession:2219, getInventoryTableHtml:2224, getInventoryTable:2229,
safeNum:2300, toYmd:2302, saveOrderToNotion:2429, getNotionHistory:2442,
unwrapList:2460, saveQuoteSnapshot:2471, getQuoteHistory:2495,
getQuoteHistoryByCustomer:2512, searchNaverAddress:2530, pushUnique:2547,
buildAddressRequests_:2566, parseJusoResponse_:2622, cleanBdNm_:2643, escapeRegex_:2655,
stripTrailingName_:2660, parseNaverLocalResponse_:2669, strip:2673,
parseNaverGeocodeResponse_:2687, pickBuilding:2692, checkUserAuth:2724, forceAuth:2752,
logFrontEvent:2761, include:2788, doGet:2796
```

- `code.js` dead 14: `toYmd_:246`, `toMmDd_:254`, `normalizeTel_:262`, `todayYMD_:270`, `_normSpec_:274`, `isSoldOutByNote_:313`, `findHeaderIndex_:325`, `norm:326`, `extractRowsFromFormula_:336`, `formatWonDiscountLabel_:346`, `formatPercentLabel_:367`, `combineRemarks_:373`, `getSpecMap_:1325`, `scan:1334`.
- `db-catalog.js` 인프라 8: `get:38`, `getDcConfig:48`, `num:58`, `numOrNull:59`, `priceChangeSchedule:215`, `priceDefaultVariant:226`, `specDetailMap:237`, `estimateConfig:243`.
- `directory.js` 인프라 3: `digits:30`, `str:34`, `getDirectory:38`.
- `google-sheets-client.js` 인프라 6: `_getAuth:49`, `_getSheets:74`, `readSheet:87`, `readSheetGrid:120`, `clearCache:168`, `healthz:177`.
- `quoteSnapshotContract.js` dead 3: `calculateQuoteTotals:2`, `isMeaningfulCustomRow:12`, `normalizeCustomRows:17`.
- `slip-bridge.js` 인프라 2: `postSlackAlert:58`, `postSlip:150`.
- `version-check.js`: 인프라 1 `resolveBuildAppVersion:10`; dead 7 `buildVersionCheckUrl:22`, `fetchWebVersionStatus:32`, `normalizeVersionInfo:50`, `asRecord:64`, `resolveVersionPromptState:69`, `get:70`, `hasUnsavedFormInput:86`.
- `version-gate.js` dead 1: `createVersionReloadGuard:4`.

### 8.3 `ORDER-SRC` — 29

| 파일 | 업무규칙 | UI | 인프라 | dead | 전량 원장 |
|---|---:|---:|---:|---:|---|
| `legacyShim.ts` | 0 | 1 | 6 | 0 | 인프라 `buildGoogleScriptRun:56`, `get:58`, `get:64`, `buildUrlFetchAppNoop:114`, `fetch:116`, `installLegacyShim:133`; UI `setLogo:149` |
| `main.ts` | 0 | 0 | 3 | 0 | `getState:80`, `onOfflineReady:116`, `onNeedRefresh:119` 모두 state/PWA 배관 |
| `quantitySync.ts` | 2 | 0 | 6 | 0 | 업무 §6.3; 인프라 `text:57`, `positiveNumber:61`, `rowsForProductCode:69`, `sourceRows:73`, `errorResult:77`, `selectionError:87` |
| `samhanApi.ts` | 1 | 1 | 9 | 0 | 업무 §6.3; UI `apiErrorMessage:237`; 인프라 `toIsoDateParam:67`, `toIsoDateTimeParam:85`, `draftHistoryParams:91`, `unwrapApiResponse:97`, `nonNegativeInteger:121`, `decodeCollectionResponse:125`, `fetchAllPages:159`, `fetchQuantitySyncRules:189`, `confirmHeaders:254` |
| **합계** | **3** | **2** | **24** | **0** | **29** |

### 8.4 `MOBILE` — 24

| 파일 | 인프라·유틸 | dead_code | 원장 |
|---|---:|---:|---|
| `mobile-staff/.../legacyEstimateShim.ts` | 7 | 1 | 인프라 `getInjectedEstimateShim:53`, `postToRN:73`, `setAuth:83`, `handle:87`, `log:88`, `fetch:97`, `buildShim:195`; dead `setEstimateAuthScript:170` |
| `mobile-staff/.../legacyEstimateSource.ts` | 3 | 1 | 인프라 `resolveBaseUrl:42`, `getLegacyEstimateUri:59`, `getEstimateAppUrl:73`; dead `validateEstimateAppUrl:89` |
| `mobile/.../legacyOrderShim.ts` | 7 | 1 | 인프라 `getInjectedOrderShim:51`, `postToRN:69`, `setAuth:79`, `handle:83`, `log:84`, `fetch:94`, `buildOrderShim:191`; dead `setOrderAuthScript:167` |
| `mobile/.../legacyOrderSource.ts` | 3 | 1 | 인프라 `resolveBaseUrl:59`, `getLegacyOrderUri:75`, `getOrderAppUrl:84`; dead `validateOrderAppUrl:99` |
| **합계** | **20** | **4** | **24** |

## 9. 🚩 개발책임자 결정 필요 목록

### D-01. `*_INC`가 인상 전 가격인지 인상 후 가격인지

1. **결정**: category별 effective date 전후 어느 쪽에 `*_INC` map을 적용할지 정해야 한다.
2. **레거시/현재**: 원본 `거래처 발송 주문서/index.html:1341-1342`는 “`이 날짜부터 인상단가 적용`”, `:2463`은 `if (due >= PRICE_INC_DATE && HOME_INC[model])`; 포팅 `order-app/index.html:1446-1450`은 “`due<변동일→*_INC(인상전)`”, `return due < String(effectiveDate);`로 반대다.
3. **후보/대가**: A 원본 `>=` 유지—과거 동작 보존, 현재 DB baseline 의미와 충돌 가능. B 포팅 `<` 유지—price baseline/current 모델과 일치, 원본 주문 금액 변경. C map을 `BEFORE/AFTER` 두 variant로 명시—안전하지만 가격 이력 계약 필요.
4. **권고**: **C**. 결정 전에는 같은 fixture의 기준일 전날/당일/다음날 금액을 확정할 수 없다.

### D-02. 상업 받침대와 `fixedDC=0`의 단가 의미

1. **결정**: 받침대를 납품가 고정으로 둘지, 일반 DC 대상인지와 0% 고정DC의 의미를 정해야 한다.
2. **레거시/현재**: 원본 `:2569-2573`은 “`받침대 부자재는 납품가 고정`” 후 즉시 반환하고 `:2594`는 `fixedDc > 0`; 포팅 `:2837-2863`은 받침대 예외가 없고 `fixedDc != null`이다.
3. **후보/대가**: A 원본 복원—기존 계약가 보존, schema 고정DC 0의 명시 override 기능 없음. B 포팅 유지—정책 일관, 받침대 금액 회귀. C `fixed_discount_manual`과 별도 `price_policy=DELIVERY_FIXED`로 명시—가장 정확, 정책 컬럼/테이블 필요.
4. **권고**: **C**, 신설 전에는 A.

### D-03. 사용자 수량의 권위를 legacy 계산과 `quantity_sync_*` 중 어디에 둘지

1. **결정**: 설정 evaluator를 실제 사용자 주문 수량에 적용할지 정해야 한다.
2. **레거시/현재**: `order-app/src/quantitySync.ts:4-5`는 “`사용자 주문 경로는 이 모듈의 evaluator를 호출하지 않고 legacy 계산을 유지`”; `index.html:5553`도 “`사용자 계산은 legacy 수식을 유지`”라고 한다.
3. **후보/대가**: A shadow 유지—금액 회귀 적음, 개발책임자 확정 원칙 미충족. B S-03부터 authoritative—점진적, legacy/설정 이중 결과 관리 필요. C 모든 tuple 일괄 전환—원칙 충족, QA 범위 가장 큼.
4. **권고**: **B**, source/target 전량 확정과 shadow diff 0 이후 계열별 전환.

### D-04. `condition_json`을 실제로 허용할 범위

1. **결정**: panel/remote/hose/base 옵션 조건을 consumer가 실행하도록 허용할지 정해야 한다.
2. **레거시/현재**: `quantitySync.ts:126-129`는 key가 하나라도 있으면 “`S-03 규칙은 조건 없는 설정만 지원합니다.`”로 거부한다.
3. **후보/대가**: A 조건 금지—단순, 옵션별 target 표현 불가. B 허용 key whitelist—안전/검증 가능, evaluator 확장 필요. C 임의 JSON expression—유연, 보안·검증·운영 난도 큼.
4. **권고**: **B** (`panel`, `remote`, `hose`, `base`, `shape` enum부터).

### D-05. manual derived lock을 정식 업무규칙으로 유지할지

1. **결정**: 사용자가 파생 부자재 수량을 0 포함 수정하면 설정 자동수량보다 계속 우선할지 정해야 한다.
2. **레거시/현재**: 포팅 `index.html:2335-2338`은 `if(!isManualQtyLocked(...)) state.set(...)`; 원본에는 lock registry가 없다.
3. **후보/대가**: A 포팅 유지—현 사용자의 수동 보정 보존, 설정이 권위가 아님. B 항상 설정 우선—원칙 단순, 수동 예외 불가. C rule별 `manual_override_allowed`—정확, schema/UX 필요.
4. **권고**: **C**; 안전품목은 false, 운영상 보정 허용 품목만 true.

### D-06. 리모컨/호스/받침대의 source·target model_code 미확정 행

1. **결정**: §7.1의 “정규화된 target” 행과 360 기본 리모컨 `AR-EC05` 대 `AR-KH05` 중 정본을 확정해야 한다.
2. **레거시/현재**: 포팅 `index.html:2897`은 `AR-KH05`, `:5471` fallback도 `AR-KH05`; 기존 원본 조사 tuple은 360 default를 `AR-EC05` 탐색으로 기록했다.
3. **후보/대가**: A 포팅 주문 정본—현재 화면 일치, 견적과 차이 가능. B 원본 GAS 정본—역사 보존, 현 주문 변경. C category별 target—정확하지만 규칙 행 증가.
4. **권고**: **C**, 모델별 tuple을 활성화하기 전 실제 catalog 구성과 견적/주문 정본을 나란히 승인.

### D-07. 추천실외기 `homeEx`를 별도 정책으로 보존할지

1. **결정**: 확장형 추천을 일반형과 분리할 schema를 추가할지 정해야 한다.
2. **레거시/현재**: `db-catalog.js:191-193`은 “`현 OduRecommendationLookup 이 미분리`”라며 `homeEx: home.slice()`를 반환한다. 원본 추천 시트는 별도 축이다.
3. **후보/대가**: A 동일 배열 유지—간단, 추천 모델 오선택 가능. B recommendation variant 추가—정확, schema/API 변경. C 확장형 추천 비활성—오추천 방지, 기능 축소.
4. **권고**: **B**; 구현 전에는 C.

### D-08. DB 분류/status와 legacy 이름·remark 중 어느 것이 권위인지

1. **결정**: schema 분류와 status enum을 우선할지, legacy classifier/remark를 계속 우선할지 정해야 한다.
2. **레거시/현재**: `db-catalog.js:11-13`은 “`분류 로직은 ... code.js의 단일 진실원`”; `:96`은 `note: r.remark || statusNote(r.status)`라 remark가 status를 숨긴다.
3. **후보/대가**: A legacy 우선—화면 연속성, 정규화 schema가 권위가 아님. B schema 우선—이식 목적 충족, 기존 분류/표시 변동. C `classification_manual=true`만 schema 우선—안전, 미검수 행은 이중체계 유지.
4. **권고**: **C**로 전환 후 검수율 100%에서 B.

### D-09. 0원과 기본구성품 0건의 판매 가능성

1. **결정**: 가격 0과 기본구성품 없는 BUNDLE 72개를 견적/주문에 노출할지 정해야 한다.
2. **레거시/현재**: `db-catalog.js:66-67`의 `Number(v)||0`, `components:164`의 null qty→1, 원본/포팅 폭발 함수는 구성 0건에서 빈 배열 경로가 있다.
3. **후보/대가**: A 그대로 노출—원본 유사, 0원/불완전 출고 위험. B 전부 차단—안전, 실제 무료품/세트 판매 중단. C `price_zero_allowed`+구성 검수 상태—정확, schema/데이터 정제 필요.
4. **권고**: **C**, 컬럼 전에는 B.

### D-10. 창고코드 이름 추론을 model 설정으로 바꿀지

1. **결정**: warehouse `2/00003`을 model별 설정으로 환원할지 정해야 한다.
2. **레거시/현재**: `code.js:2244-2288 decideWarehouseCode_`가 item section/name keyword로 주문 전체 창고를 고른다.
3. **후보/대가**: A model→warehouse 명시—안전, 초기 매핑 필요. B classification fallback—관리 적음, 예외 오배정. C 사용자 선택—자동오류 감소, 운영 부담.
4. **권고**: **A**, fallback 없이 미설정 주문을 차단/확인.

### D-11. partner directory에서 버리는 manager·single discount

1. **결정**: 원본 거래처 row의 담당자/싱글할인을 새 directory 계약에 포함할지 정해야 한다.
2. **레거시/현재**: `directory.js:73-85`는 `manager: ''`, `managerTel: ''`, `singleDiscount: 0`으로 고정한다.
3. **후보/대가**: A 현행 유지—단순, 원본 거래처별 값 소실. B partner/DC API에서 실제값 제공—정확, service 계약 변경. C 필드 제거—잘못된 0 사용 방지, legacy consumer 수정 필요.
4. **권고**: **B**; 실제 소비가 없음을 확인한 필드는 C.

### D-12. 미입력 `capacity/maxIndoor`를 0으로 볼지 미상으로 볼지

1. **결정**: 용량·최대연결수가 null/빈값일 때 0으로 계산할지, 미상으로 막을지 정해야 한다.
2. **레거시/현재**: 포팅 `db-catalog.js:67`은 이름이 `numOrNull`이지만 `v == null || v === '' ? 0`이고, `:91,97`에서 `capacity/maxIndoor`에 적용한다. 원본 시트의 공란은 값 부재였으나 포팅 shape에서는 실제 0과 구별되지 않는다.
3. **후보/대가**: A 0 유지—호환 단순, 조합률·최대연결 판정에서 0 나눗셈/오판 가능. B null 보존—의미 정확, legacy 계산기 null 대응 필요. C 미입력 품목 선택 차단—안전, catalog 정제 전 판매 중단 가능.
4. **권고**: **B**로 보존하고, 조합률·분기관 계산 진입 시에는 C 방식으로 명시 오류를 낸다.

### D-13. 구형 품목 `isDisc`의 schema 정본

1. **결정**: 원본 `legacyDiscountFlag`를 `products.discount_flags`의 어떤 key/값으로 저장할지 정해야 한다.
2. **레거시/현재**: 포팅 `db-catalog.js:142`는 `isDisc: r.legacyDiscountFlag === true`를 읽지만 PM 실측 products에는 해당 독립 컬럼이 없고 `discount_flags`만 있다. 이 값은 구형 50% 할인 적용 여부를 바꾼다.
3. **후보/대가**: A `discount_flags.legacy50=true`—현 schema 활용, JSON key 계약 필요. B 독립 boolean 컬럼—조회·검증 명확, schema 변경. C 분류별 정책으로 환원—중복 감소, 품목별 예외 손실.
4. **권고**: **A**를 명시 계약으로 정하고 `classification_manual` 품목 override를 우선한다. key 확정 전 자동 기본 false 금지.

### D-14. slip bridge의 누락 수량·금액·견적번호 기본

1. **결정**: 전표 변환 시 누락/NaN 수량·금액을 0으로 전송하고 견적번호를 즉석 생성할지, 오류로 막을지 정해야 한다.
2. **레거시/현재**: `slip-bridge.js:99-102`는 없으면 `WEB-{IO_DATE|NA}-{Date.now()}`를 만들고, `:132-136`은 `QTY/PRICE/USER_PRICE_VAT/SUPPLY_AMT/VAT_AMT`의 누락·NaN을 모두 0으로 치환한다.
3. **후보/대가**: A 현행—전송 성공률 높음, 0수량·0원 전표와 재시도 중복 위험. B 하나라도 누락이면 전체 거부—정합성 높음, 부분 데이터 복구 불가. C 필수 `QTY/PRICE/SUPPLY/VAT` 엄격 검증+공식 idempotency key 발급—가장 안전, service 계약 필요.
4. **권고**: **C**. 계약 전에는 B로 fail closed하고 즉석 `Date.now()` 식별자는 운영 정본으로 쓰지 않는다.

## 10. 최종 검증

| 검증축 | 관측값 | 결과 |
|---|---|---|
| 고정 inventory 직접 재계수 | ORDER 358 + ESTIMATE-LIB 204 + ORDER-SRC 29 + MOBILE 24 = 615 | PASS |
| 함수 key 대조 | 네 그룹 모두 `expected=actual`, duplicate 0, missing 0, extra 0 | PASS |
| ORDER 분류 원장 | 170 + 151 + 37 + 0 = 358 | PASS |
| ESTIMATE-LIB 분류 원장 | 57 + 0 + 122 + 25 = 204 | PASS |
| ORDER-SRC 분류 원장 | 3 + 2 + 24 + 0 = 29 | PASS |
| MOBILE 분류 원장 | 0 + 0 + 20 + 4 = 24 | PASS |
| 4분류 합계 | 업무 230 + UI 153 + 인프라 203 + dead 29 = 615 | PASS |
| dead 동적 접근 감사 | HTML dead 0; mobile bridge 공개 method 6개를 dead에서 인프라로 환원 | PASS |
| 수량 설정 간극 | `quantitySync.ts:126-129` 원문과 `condition_json` 불일치 기록 | PASS |
| 원본 대조 | 금액·수량·출고품목 차이 우선표, 원본-only·포팅-only 별도 절 존재 | PASS |
| 결정 필요 형식 | D-01~D-14 모두 결정/인용/후보·대가/권고 4필드 | PASS |
| Markdown 구조 | code fence 짝수, 상세표·전체 원장·결정 목록 종료 확인 | PASS |

최종 미분류 0건, 미기록 0건이다. 검증은 코드 실행 결과를 검증한 것이 아니라 **고정 함수 분모와 정적 분류·대조 보고서의 완결성**을 검증한 것이다.
