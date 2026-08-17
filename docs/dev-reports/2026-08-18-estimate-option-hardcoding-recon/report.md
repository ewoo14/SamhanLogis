# 2026-08-18 종합견적서 옵션·가격 경로 전수 정찰

## 0. 결론

개발책임자의 원 설계인 **“견적품목에 구성품 기본·옵션을 걸고, 바뀌는 부자재는 수량동기화로 연결한다”**를 저장할 토대는 상당 부분 이미 있다. 그러나 현재 종합견적서는 저장된 설정과 런타임 하드코딩을 섞어 쓴다. 특히 PR #1269의 19개 단가표는 설정값보다 먼저 반환하므로 설정 정본화를 역행한다.

【현황】 **런타임/운영 하드코딩 24곳 · 설정 기반 경로 9곳**  
【격차】 **서버 필드 최소 7개 · DB 설정 324건(단가 257행 + 수량규칙 67계열) · 웹 핵심 함수 9개**  
【3건 진단】 컬러유선=DB 설정 있음/웹 canonical 불일치, 360 할인=DB 설정 있음/웹 분류 미사용, 받침대=웹 단위 gate 오류 + 싱글 수량규칙 부재의 복합 원인  
【PM 권장】 **① 설정 정본 전환**. #1272 저장소 이전 → #1268 옵션·수량 실행층 → #1269를 별도 중복 PR이 아닌 **가격 정본 전환 트랙**으로 재범위화한다.

수 집계 기준: 같은 함수/상수 블록은 한 지점으로 세고, 그 안의 리터럴 개수는 별도로 적었다. 테스트 fixture·mock은 운영 하드코딩 수에서 제외했다. PR #1269 전용 행은 `c6583f83` 기준이며 현재 `main`에는 아직 없다.

## 1. 조사 기준

- 브랜치/HEAD: `main` / `ba1271b97af7fbd9d7590db2baba616193bbcc4a`
- PR head: #1268 `d4b3641f`, #1269 `c6583f83`, #1272 `b8bf8b16`
- DB: 공유 `samhan-postgres`의 `product_db`, SELECT만 수행
- 레거시 원문: `tools/legacy-gas/종합견적서/index.html`
- 공유 컨테이너: 시작 시 `samhan-*` 24개. stop/restart/config 변경 없음

## 2. 하드코딩 전수 — 24곳

### 2.1 웹 종합견적서 — 20곳

| ID | 파일:줄 | 종류 | 박힌 내용/영향 |
|---|---|---|---|
| H01 | `clients/web/estimate-app/views/index.ejs:2386-2426` | 모델 판정 | 모델코드 위치·정규식으로 할인/형태 flag 판정 |
| H02 | `:4087-4117` | 변형 판정 정규식 | PANEL/REMOTE/MATERIAL/FOOT를 kind 외 name/feat 정규식으로 재판정 |
| H03 | `:4121-4150` | 모델 ID | 상업 리모컨 옵션→`AR-EH05`, `AWR-WE13N`, `AWR-WG00N`; 컬러는 `:4134,4140` |
| H04 | `:4180-4223` | 모델 ID | 실내기명/HP/360 정규식으로 기본 리모컨·판넬 모델 선택 |
| H05 | `:4421-4457`(main) | 단가 | I자 호스 납품가 `8,000` 고정 |
| H06 | `:4423-4444`(#1269) | 모델→단가 | `LEGACY_COMPONENT_DELIVERY` 19개 표. 리모컨 3 + 판넬 16 |
| H07 | `:4445-4452`(#1269) | 우선순위 | `componentDeliveryPrice_()`가 H06을 설정/카탈로그 가격보다 먼저 반환 |
| H08 | `:5122-5157`(main), `:5154-5176`(#1269) | 변형 정규식/문자열 | PANEL/REMOTE 옵션을 kind·name·feat 정규식으로 찾고 컬러를 `컬러유선`으로 비교 |
| H09 | `:5178-5188`(#1269) | 옵션 문자열 | 선택값 `컬러유선리모컨`→DB variant `컬러유선`으로 중복 변환. 실제 DB 값은 `컬러` |
| H10 | `:5190-5192`(#1269) | 모델 ID 정규식 | 리모컨 변경 허용 기본 모델을 `AR-EH05/AR-EC05/AR-KH05`로 제한 |
| H11 | `:6111` | 옵션 목록 | 상업 판넬 `['','기본판넬','블랙판넬','승강판넬','공청판넬']` |
| H12 | `:6112`(main), `:6164`(#1269) | 옵션 목록 | 상업 리모컨 `['','유선리모컨','컬러유선리모컨']` |
| H13 | `:6672-6682`(main), `:6727`(#1269) | 옵션 목록 | 상업 화면 리모컨·판넬·형태·자재 선택값 박제 |
| H14 | `:7881-7894`(main), `:7904-7953`(#1268) | 옵션 목록 | 싱글 할인 6종과 리모컨·판넬·형태·자재 목록. #1268은 구성품 variant 동적화 일부 구현 |
| H15 | `:8040-8128` | 모델/단위 gate | 받침대 대상 정규식과 특수 모델 매핑, 세트 단위가 `SET/식`일 때만 토글 계산 |
| H16 | `:8293-8344`, `:8383`(#1269) | 모델 ID | 홈 리모컨을 `AWR-WE13N/AWR-WG00N/AR-CH01` exact match |
| H17 | `:8896-8978`, `:9011-9019`(#1269) | 모델 ID 표 | 상업 판넬 교체와 360 원형/사각×4옵션 `MAP360` |
| H18 | `:11279-11367`, `:11409`(#1269) | 표시 판정 정규식 | 구성품명으로 `컬러유선`, 판넬/자재/받침대 라벨 재판정 |
| H19 | `:3315-3340` | 할인 분기 | 액세서리 분류면 조기 반환; 저장된 할인 분류보다 화면 계산 순서가 우선 |
| H20 | `:6164`, `:6727`, `:7939`(#1269) | canonical 중복 | 같은 리모컨 도메인을 `컬러유선`, `컬러유선리모컨`, 빈값 포함 배열로 각각 표현 |

H06의 19개 값은 `AR-EH05=16,000`, `AWR-WE13N=56,000`, `AWR-WG00N=91,000`, `PC6NUNK1NW/PC6NUDK1NW=128,000`, `PC6NBNK1NW/PC6NBDK1NW=188,000`, `PC6EUCK1NW/PC6NUCK1NW=678,000`, `PC6EUXK1NW/PC6NUXK1NW=188,000`, `PC1NWSK3NW/PC1BWSK3NW=128,000`, `PC1BWCK3NW=388,000`, `PC1NWCK3NW=343,000`, `PC4NUFK1NW=128,000`, `PC4NBFK1NW/PC4NUXK1NW=188,000`, `PC4NUCK4NW=678,000`이다.

### 2.2 index.ejs 밖 — 4곳

| ID | 파일:줄 | 종류 | 내용 |
|---|---|---|---|
| H21 | `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:32-35` | 옵션 목록 | HOME 판넬, SINGLE 리모컨·형태·자재 배열 |
| H22 | `clients/desktop/src/renderer/utils/bundleOptionDomain.ts:7-15` | 옵션 목록 | SINGLE 판넬, PANEL `[기본,블랙,승강,공청]`, REMOTE `[기본,유선,컬러]`, 형태 배열. `ProductFormPage.tsx:891-995`, `EstimateItemsCatalogPage.tsx:957-962`가 소비 |
| H23 | `services/product-service/src/main/resources/db/migration/V44__legacy_component_fixed_allocation_amounts.sql:7-38` | 일회성 seed | 15개 모델→고정배분가 SQL 하드코딩 |
| H24 | `services/product-service/src/main/resources/db/migration/V45__bundle_component_context_prices.sql:18-39` | 일회성 seed | 같은 계열 모델→문맥 납품가 SQL 하드코딩 |

H23/H24는 런타임 코드 표가 아니라 DB 설정을 만드는 일회성 seed라는 차이가 있다. 서버 `lib/*.js`에서 별도 모델→단가표는 찾지 못했다. 데스크톱 `api/mock.ts`의 모델/옵션 fixture는 운영 경로가 아니므로 수에서 제외했다.

### 2.3 레거시 원문과의 대조

인용 없는 레거시 추정은 하지 않았다.

- 가격증가 기준값 bootstrap/조회: `tools/legacy-gas/종합견적서/index.html:2153-2166`
- 모델 위치 flag: `:2200-2226`
- 할인 계산과 액세서리 조기 반환: `:2992-3021`
- 상업 리모컨 모델 매핑: `:3674-3703`
- 구성품 가격: `:3973-3986` — `priceFrom_()` 후 `PRICE_INC.single.price`를 사용하며 PR #1269 같은 19개 런타임 표는 없음
- 옵션 구성품 검색: `:4665-4701`; 세트가 delta: `:4715-4738`
- 옵션 sweep 목록: `:5652-5661`; 상업 UI 목록: `:6197-6207`; 싱글 UI 목록: `:7407-7419`
- 받침대 `SET/식` gate: `:7538-7564`
- 홈 리모컨 exact ID: `:7822-7834`
- 상업 판넬/360 표: `:8228-8247`

즉 현재 웹의 다수 하드코딩은 레거시 이식 흔적이 맞지만, **PR #1269의 19개 런타임 단가표 우선은 레거시 원문의 동작 그대로가 아니라 새 보정**이다.

## 3. 설정 기반 경로 — 9곳

| ID | 파일:줄 | 실제 제공/소비 |
|---|---|---|
| S01 | `clients/web/estimate-app/lib/code.js:1847-1867` | 노출 품목·구성품·수량규칙·가격기준·기본 variant를 웹 bootstrap에 합성 |
| S02 | `clients/web/estimate-app/lib/db-catalog.js:165-182` | 구성품 kind/model/unit/납품가/출고가/name/variant/default/spec/defaultQty 전송 |
| S03 | `services/product-service/.../EstimateCatalogInternalController.java:292-370` | `contextDeliveryPrice` 우선, 없으면 구성품 product 납품가를 `deliveryPrice`로 해소 |
| S04 | `db-catalog.js:213-239` | `priceIncData()`가 가격기준 응답을 `{home,comm,single}`로 변환 |
| S05 | `db-catalog.js:252-260` | `PRICE_DEFAULT_VARIANT` 별도 map |
| S06 | `db-catalog.js:48-54`, `code.js:1859` | 수량동기화 rule/source/target bootstrap |
| S07 | `index.ejs:5171-5224` | `variantOf(p)`/구성품 행을 이용해 판넬·리모컨 delta와 세트가 계산 |
| S08 | `EstimateCatalogInternalController.java:407-443` | 가격이력 기준일·견적노출 카테고리별 baseline 제공 |
| S09 | DB `product_estimate_exposure`, `bundle_component` | 견적 카테고리 노출, 구성품 종류·variant·기본수량·배분·문맥가격 저장 |

## 4. 서버가 웹에 주는 구조

### 4.1 `priceIncData()` 전수

진입점은 `clients/web/estimate-app/lib/code.js:1861`, 구현은 `lib/db-catalog.js:213-239`이다.

```text
{
  home:   { [modelCode]: outboundPrice || releasePrice },
  comm:   { [modelCode]: outboundPrice || releasePrice },
  single: { [modelCode]: { list?: outboundPrice || releasePrice,
                            price?: deliveryPrice } }
}
```

- 입력 row: `modelCode`, `estimateCategory`, `releasePrice`, `deliveryPrice`, `outboundPrice` (`EstimateCatalogInternalController.java:232-235,407-443`).
- 의미: 2026-07-01 가격기준의 카테고리별 본품/옵션 보정 기준. HOME/COMM은 출고/리스트 scalar, SINGLE은 리스트와 납품가 object.
- **구성품 납품가 자체의 정본 저장소는 아니다.** 다만 별도 `components()` 응답의 `price`에는 구성품의 문맥 납품가가 실제로 들어온다. 따라서 “서버에 구성품 납품가가 전혀 없다”가 아니라, **`PRICE_INC`가 그 저장소가 아니며 `components[].price`가 맞는 경로**다.

### 4.2 구성품 응답

`db-catalog.js:165-182`가 웹에 주는 필드 전수:

| 필드 | 의미 |
|---|---|
| `setModel`, `refModel` | 부모 세트 모델 |
| `kind` | `component_kind` |
| `model` | 구성품 모델 |
| `unit` | 단위 |
| `price` | 서버가 해소한 문맥 납품가→기초품목 납품가 |
| `list` | 서버가 해소한 문맥 출고가→기초품목 출고가 |
| `name` | 구성품명 |
| `feat` | `component_variant` |
| `isDefault` | 기본 구성 여부 |
| `spec`, `specs` | 사양 텍스트/목록 |
| `qty` | 기본수량 |

서버 `ComponentRow`도 같은 12개 의미 필드다(`EstimateCatalogInternalController.java:220-229`). **넘어오는 것:** 구성품 납품가, kind, variant, 기본수량. **안 넘어오는 것:** `qty_mode`, `component_shape`, 배분 3필드, 표시순서, 반올림 단위/분류 설정. 수량동기화 규칙은 별도 응답으로 오지만 `db-catalog.js:48-54`가 호출한 카테고리 인자를 서버가 사실상 HOME_MULTI로 고정해 SINGLE/COMM은 웹에 오지 않는다(`EstimateCatalogInternalController.java:377-384`).

## 5. DB 실측

### 5.1 활성 행과 컬럼 전수

- `bundle_component`: **1,598행 / 23컬럼**
- `product_estimate_exposure`: **867행 / 12컬럼**
- `quantity_sync_rule/source/target`: **1 / 1 / 3행**

`bundle_component` 컬럼 전수와 비-null 채움률:

| 컬럼 | 채움 |
|---|---:|
| `id`, `bundle_product_id`, `component_product_code`, `default_qty`, `qty_mode`, `component_kind`, `is_default`, `created_at`, `created_by`, `is_deleted`, `allocation_mode` | 각 1,598/1,598 (100%) |
| `component_variant` | 1,448/1,598 (90.6%) |
| `spec_text` | 1,348/1,598 (84.4%) |
| `modified_at`, `modified_by` | 각 1,596/1,598 (99.9%) |
| `display_order` | 16/1,598 (1.0%) |
| `allocation_weight` | 542/1,598 (33.9%) |
| `fixed_allocation_amount` | 1,056/1,598 (66.1%) |
| `component_shape` | 70/1,598 (4.4%) |
| `context_release_price` | 0/1,598 (0%) |
| `context_delivery_price` | 308/1,598 (19.3%) |
| `deleted_at`, `deleted_by` | 활성 행이므로 0/1,598 |

`product_estimate_exposure` 12컬럼은 `id`, `product_id`, `estimate_category`, `display_order`, 7개 audit 컬럼, `is_deleted`이며 활성 행에서 삭제 2컬럼을 제외한 필수값은 **867/867**이다. 카테고리별 HOME_MULTI 123, SINGLE_SET 288, COMM_MULTI 416, LEGACY 40.

수량규칙 스키마는 `quantity_sync_rule` 18컬럼, `source` 11컬럼, `target` 15컬럼이다. rule은 key/category/name/enabled/aggregation/condition/inactive behavior/conflict/priority/legacy ref와 audit, source는 product/factor와 audit, target은 product/multiplier/rounding/displayOrder/variant/shape와 audit를 저장한다(`V24__create_quantity_sync_rules.sql:8-106`, `V41__add_quantity_sync_target_option_context.sql:3-9`). 활성 1규칙은 HOME_MULTI, 조건 `{}`, source 1, target 3뿐이다.

### 5.2 옵션 설정 실측

| kind/variant | 행 | 부모 세트 |
|---|---:|---:|
| REMOTE/기본 | 188 | 154 |
| REMOTE/유선 | 62 | 62 |
| REMOTE/**컬러** | **65** | **65** |
| PANEL/기본 | 58 | 58 |
| PANEL/블랙 | 57 | 57 |
| PANEL/승강 | 57 | 57 |
| PANEL/공청 | 68 | 68 |
| MATERIAL/자재 | 273 | 206 |

핵심: DB canonical은 **`컬러`**다. 컬러가 설정된 세트는 65개이며 기본+컬러도 65개, 기본 리모컨 모델 변경 조건까지 만족하는 것은 62개다. PR #1269 실화면 카탈로그가 실제 검사한 대상은 **59세트/59건 실패**였다. 따라서 컬러유선 문제는 설정 부재가 아니다.

## 6. 19개 단가표 제거 영향

활성 구성품과 19개 표를 모델코드로 대조한 결과:

- 표가 개입하는 구성품: **430행 / 65세트**
- DB 해소가격과 표가 같은 행: **173행**
- DB 해소가격과 표가 다른 행: **257행 / 65세트**
- 같은 173행은 `context_delivery_price`가 채워진 행과 일치
- 다른 257행은 문맥 납품가가 비어 기초품목 납품가로 떨어진다.

예: `AWR-WG00N`은 표 91,000원, 기초품목 납품가 75,625원이고 65행 모두 문맥가격이 비어 있다. 판넬도 `PC4NBFK1NW` 표 188,000원 대 기초 150,040원(37행), `PC4NUCK4NW` 678,000원 대 611,050원(37행)처럼 차이가 있다.

따라서 H06만 지우면 **65세트 모두 적어도 한 구성품 가격이 달라질 수 있다.** 안전한 제거 조건은 257행의 견적 문맥 납품가를 설정으로 먼저 채우고, 표와 설정을 golden comparison한 뒤 우선순위를 뒤집는 것이다.

## 7. 격차

### 7.1 서버가 추가로 보내야 할 최소 7필드

1. `qtyMode`
2. `componentShape`
3. `displayOrder`
4. `allocationMode`
5. `allocationWeight`
6. `fixedAllocationAmount`
7. 부모의 `allocationRoundUnit` 및 카테고리별 견적설정 context

`kind`, `variant`, 기본수량, 실제 해소 납품가는 이미 오므로 중복 추가하면 안 된다. 할인은 모델 정규식 대신 이미 product에 있는 `discountOption`/분류를 노출하거나 서버에서 계산 flag로 보내야 한다.

### 7.2 DB에 더 채울 설정 — 최소 324건

- **257 구성품 행:** 19개 표와 다른 `context_delivery_price`를 견적품목 설정으로 이전
- **67 수량규칙 계열:** 레거시 제품연동 68계열 중 현재 활성 1계열을 제외. 단, 기존 조사상 현 스키마로 직접 표현 가능한 것은 62/68이며 6계열은 DSL/adapter 확장이 먼저다(`docs/dev-reports/2026-08-17-qty-sync-recon/report.md:284-299`).
- 별도 선행 이전: #1272가 1,584 구성품 설정행/343세트를 새 카테고리별 저장소로 옮기며, setting-only pair 354건도 다룬다. 이는 위 324의 중복 합산 대상이 아니라 **저장소 이전 모수**다.

### 7.3 웹에서 고칠 핵심 함수 — 9개

1. `componentDeliveryPrice_`: 구성품 설정가격 우선, 19개 표 제거
2. `getOptionRemoteRow`/`resolveSingleRemoteRows_`: canonical `컬러` 단일화
3. `allowRemoteChange_`: 기본 모델 regex 대신 기본 variant/설정 관계 사용
4. `getOptionPanelRow`/`pickPanelRow`: variant+shape 설정 사용
5. `computeCommRemoteModelForIndoor_`: 옵션 구성품 row에서 모델 선택
6. `computeCommPanelModelForIndoor_`/`MAP360`: 설정된 구성품 row에서 선택
7. `getModelFlags`/`adjustSingleSetBasePrice`: 저장된 `discountOption`·분류 사용
8. `recomputeSingleBaseFoot`: `SET/식` gate 제거, qty rule/구성품 설정 사용
9. 렌더/sweep 옵션 생성부: HOME/SINGLE/COMM 모두 설정 variant의 정렬·canonical 사전으로 생성

## 8. 지금 안 되는 3건 진단

| 결함 | DB 실측 | 코드 증거 | 판정 |
|---|---|---|---|
| 컬러유선리모컨 미반영 | REMOTE/컬러 **65세트**, 화면 QA 59 대상 | #1269 `:5166-5188`은 `컬러유선`을 찾지만 DB는 `컬러`; `:4134,4140`, `:8383`은 모델 ID에도 의존 | **코드가 설정을 잘못 읽음. 설정 부재 아님.** 59/59 delta 0 |
| 360 할인 미반영 | `AC060CS6PBH1SY`: `discount_option=THREE_SIXTY`, `allocation_round_unit=1000`, 단위 EA | `:3315-3340`에서 액세서리 분류 조기 반환이 flag/할인 전에 발생; 모델 위치 flag도 병존 | **코드가 저장된 분류를 소비하지 않음. 설정 부재 아님.** QA 360 10세트 중 해당 1세트 실패 |
| 실외기 받침대 토글 무효 | SINGLE_SET 노출 **288/288 전부 unit=EA**. SINGLE 수량규칙 0 | `:8040-8128`은 `SET/식`만 통과 | **복합:** 코드 단위 gate가 직접 원인 + 설정 기반으로 대체할 SINGLE 수량규칙도 없음 |

## 9. 이미 만든 것과 중복 경계

- **#1272 OPEN:** 카테고리별 `BundleComponentEstimateSetting` 저장소와 V47을 만들고 1,584행/343세트를 이전한다. 저장 위치의 소유자다. 수량규칙 채움은 명시적으로 범위 밖이다.
- **#1268 OPEN:** CLOSED #1260을 재개해 옵션 목록을 구성품 variant로 만들고 수량규칙 실행/연결을 다룬다. 동적 옵션 UI와 조건 evaluator의 소유자다. 현재 DB 활성 규칙은 여전히 1건이라 데이터 완결은 안 됐다.
- **#1269 OPEN:** 판넬·리모컨·자재 차액 계산의 소유자지만, 19개 런타임 표를 키워 가격 정본을 우회했다. 기능 검증 자산은 재사용하되 표는 설정으로 이전해야 한다.

CLOSED도 확인했다.

- #896 CLOSED: 수량동기화 rule/source/target 스키마·관리 축은 구현됨. “규칙 데이터와 소비자 실행이 완결”을 뜻하지는 않는다.
- #1090 CLOSED: 정액할인을 모델명에서 품목 분류로 전환하기로 구현됨. 종합견적서의 모델 flag 잔존은 이 정본을 소비하지 못한 격차다.
- #1100 CLOSED: 세트 옵션 picker 복구.
- #1093/#1143 CLOSED: 구성품 가격모델·배분/반올림 데이터 축.
- #1260 CLOSED PR: 설정 기반 옵션 목록을 구현했으나 수량/연결 결함 때문에 #1268로 재개.

따라서 새 스키마·새 옵션 저장소·새 가격모델을 또 만들면 중복이다. 필요한 것은 기존 저장소를 웹 계약까지 관통시키는 cutover다.

## 10. 선택지

【선택지】

### ① 설정 정본 전환 — 권장

#1272를 저장소 선행으로 정리하고, #1268에서 옵션 canonical/수량 evaluator를 완결한 뒤, #1269를 가격 cutover로 재범위화한다. 257 문맥단가 행을 먼저 채우고 19개 표를 제거한다. 3건도 각각 설정 소비 경로에서 고친다.

- 장점: 개발책임자의 “하드코딩만 안 되면 된다 / 견적품목 옵션이 제대로 동작”을 충족
- 비용: 서버 7필드, DB 324건, 웹 9함수와 golden QA 필요
- 안전장치: 430행/65세트 가격을 표와 설정으로 양쪽 계산해 0차이 후 삭제

### ② 단계적 호환 전환

#1269 표를 즉시 삭제하지 않고 **설정 우선→누락 때만 경고와 legacy fallback**으로 뒤집는다. 257행을 채운 비율을 계측해 100%가 되면 fallback을 삭제한다. 컬러·360·받침대는 먼저 설정 소비 방식으로 수정한다.

- 장점: 현재 맞는 가격을 보존하며 점진 이행
- 단점: 전환 기간 하드코딩이 남고, 종료 조건을 지키지 않으면 영구 레거시화

### ③ 하지 않는다

가능한 이유는 #1269를 머지하지 않으면 main에 새 19개 표가 들어오지 않고 현재 가격 회귀를 피할 수 있기 때문이다. 그러나 컬러 59/59, 360 1건, 받침대 토글은 계속 실패하고 옵션 정본화도 달성하지 못한다. **개발책임자 지시를 만족하지 못하므로 권장하지 않는다.**

【PM 권장】 **①**. DB에 컬러·할인 설정이 이미 있는데 코드가 안 읽는 두 건은 설정 정본 전환으로 바로 해결되고, 받침대만 수량규칙 채움이 추가로 필요하다. ②는 단기 안전판으로만 허용하고 삭제 마감/계측을 PR acceptance에 넣는다.

【PR 배치】 이 일을 #1272나 #1268 안에 통째로 섞지 않는다. **#1272=저장소**, **#1268=옵션 목록·수량 규칙 실행층**, **재범위화한 #1269=구성품 가격 payload·웹 가격 함수·legacy 표 제거**로 소유권을 나눈다. 새 네 번째 가격 PR을 만들면 #1269와 중복이므로 만들지 않는다. 병합 순서는 #1272 → #1268 → #1269이며 각 head를 앞 단계에 rebase한다.

## 11. 프로세스·컨테이너 회수

- 본 정찰에서 기동한 장기 프로세스/서버/컨테이너: **0**
- 회수 대상/회수 수: **0 / 0**
- 본 작업 식별자 기준 잔여: **0**
- 공유 `samhan-*`: 시작 **24**, 종료 검증값은 아래 최종 게이트에 기록. stop/restart/config 변경 없음
- 공유 외 `sol1265r2-pg` 1개는 시작 전부터 존재한 타 작업 컨테이너로 조작하지 않음

## 12. 최종 `git status --porcelain` 원문

아래 블록은 보고서 작성 후 최종 게이트에서 채운다.

```text
?? .claude/docs/
?? .scratch/
?? clients/desktop/playwright.order-approval-real-qa.config.ts
?? clients/desktop/playwright/2026-08-17-1233-origin-real-qa/
?? clients/desktop/playwright/2026-08-17-category-settings-migration-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-daily-closing-parity-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-option-price-impact-real-qa/
?? clients/desktop/playwright/2026-08-17-price-variant-option-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-qty-sync-recon-real-qa/
?? clients/desktop/playwright/2026-08-17-three-pr-real-qa/
?? clients/desktop/playwright/order-approval-real-qa/
?? docs/dev-reports/2026-08-17-1233-daily-closing-origin/
?? docs/dev-reports/2026-08-17-1238-money-axis-recon/
?? docs/dev-reports/2026-08-17-category-settings-data-migration/
?? docs/dev-reports/2026-08-17-category-settings-migration-recon/
?? docs/dev-reports/2026-08-17-daily-closing-parity-recon/
?? docs/dev-reports/2026-08-17-devlead-decisions/
?? docs/dev-reports/2026-08-17-dps-inbound-compare-recon/
?? docs/dev-reports/2026-08-17-duplication-audit/
?? docs/dev-reports/2026-08-17-legacy-sheets-snapshot/
?? docs/dev-reports/2026-08-17-option-list-recon/
?? docs/dev-reports/2026-08-17-option-price-impact/
?? docs/dev-reports/2026-08-17-partner-importer-recon/
?? docs/dev-reports/2026-08-17-price-variant-option-recon/
?? docs/dev-reports/2026-08-17-qty-sync-6-series/
?? docs/dev-reports/2026-08-17-qty-sync-recon/
?? docs/dev-reports/2026-08-17-shared-stack-401/
?? docs/dev-reports/2026-08-17-uuid-exposure-recon/
?? docs/dev-reports/2026-08-17-web-to-slip-fidelity/
?? docs/dev-reports/2026-08-17-web-to-slip-recon/
?? docs/dev-reports/2026-08-18-estimate-option-hardcoding-recon/
?? docs/qa/2026-08-15-order-approval-real-qa/
?? docs/qa/2026-08-17-category-settings-migration-recon-real-qa/
?? docs/qa/2026-08-17-option-price-impact-real-qa/
?? docs/qa/2026-08-17-p1-02-real-qa/
?? docs/qa/2026-08-17-p1-03-real-qa/
?? docs/qa/2026-08-17-price-variant-option-recon-real-qa/
?? docs/qa/2026-08-17-qty-sync-recon-real-qa/
```
