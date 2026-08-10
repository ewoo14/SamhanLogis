# 수량 동기화 target 분류축 정찰 보고서

> 조사일: 2026-08-10 KST  
> 작업 위치: `D:\dev\Samhan-Public\.claude\worktrees\wmain` / `main`  
> 조사 상태: **DONE_WITH_CONCERNS — 조사·읽기 전용 측정만 완료, 소스 구현 없음**

## 0. 결론 요약

개발책임자 전제는 맞다. 현재 `QuantitySyncRuleValidator`는 target에 대해 활성·노출·카테고리 노출·중복·순환·BUNDLE 경계만 검사하고, `부자재` 여부나 상품 역할을 검사하지 않는다. 근거는 `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:225-289`이다.

다만 저장소의 기존 축 중 **다섯 파생 계열을 현재 데이터 그대로 100% 부자재로 판정하는 축은 없다.** 가장 적합한 기존 축은 DB/API에 존재하고 주품목 라벨도 분리하는 `Classification.catL`이지만, 현재 실데이터에서 분기관 2개는 `실내기`, 에어콤보 리모컨 1개는 `전열교환기`로 분류되어 있다. `catL`만 즉시 allowlist로 쓰면 이 계열을 놓치며, `goods_type`을 함께 보지 않으면 visible NON_GOODS인 `운임`, `절삭`이 `부자재` 대분류를 타고 통과한다.

따라서 권장 방향은 다음이다.

> **권장 축: `Classification.catL`을 최종 역할축으로 채택하고, 다섯 계열의 대분류를 먼저 `부자재`로 정규화한다. `goods_type=GOODS`는 서비스/비상품을 제외하는 별도 안전 가드로 둔다.**

이는 이번 라운드의 구현 제안이 아니라, 서버 validator가 참조할 정본 축에 대한 조사 결론이다. 현재 데이터 정규화·API/validator 변경은 하지 않았다.

## 1. 측정 및 범위

### 1.1 읽기 전용 DB 측정

모든 SQL은 `docker exec samhan-postgres psql ... -c "BEGIN TRANSACTION READ ONLY; ... COMMIT;"`로 실행했다. DB write, Docker 재시작·재배포는 하지 않았다.

| 측정 ID | KST 시각 | 확인 내용 |
|---|---:|---|
| Q-142917 | 2026-08-10 14:29:17.846997 | products 기본 축, exposure, physical category |
| Q-142941 | 2026-08-10 14:29:41.370540 | catL/catM/catS, panel/remote |
| Q-143009 | 2026-08-10 14:30:09.367825 | bundle_component kind·해소·ECOUNT group |
| Q-143123 | 2026-08-10 14:31:23.159553 | 다섯 계열 broad 후보 집계 |
| Q-143143 | 2026-08-10 14:31:43.105607 | 다섯 계열 모델별 분류 |
| Q-143730 | 2026-08-10 14:37:30.239421 | `AUTO_HOME_MODELS` selector 재현 및 PANEL literal |
| Q-144253 | 2026-08-10 14:42:53.571092 | GOODS/NON_GOODS와 exposure 교차 |
| Q-144304 | 2026-08-10 14:43:04.345170 | NON_GOODS 모델 상세 |

현재 활성 품목은 `products.is_deleted=false` 기준 3,061건이고, 현재 status 값은 전건 `ACTIVE`였다. Product가 soft-delete를 전제로 하는 것은 `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:44-49`, status 필드는 `:88-90`이다.

### 1.2 코드 조사 범위

품목 엔티티·enum·분류/노출 API·bundle 구성품·수량 동기화 schema/validator/service/controller·관리자 검색기·estimate/order 프런트의 자동 파생 상수를 전수 검색했다. 추적 가능한 이슈 문서 중 `#1111` 관련 현재 보고서는 구성품 API/소관이 기초품목이고 견적품목 구성품 편집 진입점을 제거했다고 기록한다(`docs/dev-reports/2026-08-07-1111-s1-components-to-base-product.md:1-5`, `:84-87`). `#1089` 원문 자체는 저장소의 파일로 존재하지 않으며, 로컬 보고서에는 해당 전개 트랙이 조사 대상 밖이었다는 기록만 있다(`docs/dev-reports/2026-08-07-1111-s1-components-to-base-product.md:96`). 이 때문에 이슈 본문 자체의 세부 문구는 파일:줄 근거로 단정하지 않고, 현재 코드 경로의 충돌 여부만 판정했다.

## 2. 저장소가 가진 분류 축 전수

### 2.1 DB/API 축의 실데이터 분할

| 축 | 2026-08-10 실측 분할 | 부자재 판별력 | DB/API 여부 |
|---|---|---|---|
| `products.product_category` | `NULL 1,942`; `COMMERCIAL_MULTI 342`; `HOME_MULTI 119`; `OLD 37`; `SINGLE_PART 345`; `SINGLE_SET 276` | **없음**. 다섯 계열은 모두 `HOME_MULTI`; enum의 `MATERIAL` 활성 행은 0건 | DB 컬럼·catalog API. enum 의미는 `ProductCategory.java:3-15`, entity 매핑은 `Product.java:201-204`, 응답은 `ProductCatalogResponse.java:43-66` |
| `products.goods_type` | `GOODS 3,027`; `NON_GOODS 34` | **상품/비상품만 구분**. 다섯 계열 42개는 모두 GOODS라 부자재와 동치가 아니며, 주품목도 GOODS | DB/API. 비상품 의미는 `ProductGoodsType.java:3-13`, entity는 `Product.java:206-209` |
| `products.product_business_type` | `상품 2,979`; `무형상품 80`; `부재료 2` | 의미는 가장 가깝지만 **현재 2건뿐**. `부재료`는 호스 2개만 해당하고, 나머지 파생 계열은 `상품` | DB 컬럼. 이카운트 품목구분 필드라는 주석은 `Product.java:267-283`; 현재 catalog DTO에는 이 필드가 없다(`ProductCatalogResponse.java:43-66`) |
| `product_estimate_exposure.estimate_category` | 활성 exposure `COMMERCIAL_MULTI 416행/416품목`; `HOME_MULTI 119/119`; `LEGACY 40/40`; `SINGLE_SET 288/288`; `OTHER 0` | **없음**. 이것은 견적 화면 노출 위치이지 본체/부자재 역할이 아니다. 다섯 HOME 파생과 주품목이 같은 카탈로그에 있다 | DB/API. M:N·다중 노출 의미는 `ProductEstimateExposure.java:18-49`; validator가 읽는 현재 원천은 `QuantitySyncRuleService.java:437-459` |
| deprecated `products.estimate_category` | 활성 3,061건 전부 `NULL` | **사용 불가**. V18 이후 정본이 아니며 현재 실데이터도 비어 있다 | DB만 남은 deprecated 컬럼. `Product.java:216-223` |
| `products.product_type` / `bundle_mode` | `SINGLE 2,718`; `BUNDLE 343`. `bundle_mode`: `EXPAND 343`, 나머지 NULL | **없음**. 다섯 파생은 모두 SINGLE이고 주품목 SINGLE도 많다. BUNDLE은 세트 여부이지 부자재 여부가 아니다 | DB/API. `Product.java:103-111`, catalog 응답의 `productType`은 `ProductCatalogResponse.java:61-66` |
| `products.usage_scope` | `BOTH 774`; `NONE 2,287` | **없음**. 노출/사용처이며 역할이 아니다. 다섯 HOME 파생은 BOTH, 주품목도 BOTH | DB/API. `Product.java:211-214`; 검색 API의 usage 의미는 `ProductRepository.java:233-241` |
| `products.status` | 활성 행 전부 `ACTIVE` | **없음**. 상태는 연결 가능성이지 상품 역할이 아니다 | DB/API. validator snapshot 변환에서 status를 active boolean으로만 바꾼다(`QuantitySyncRuleService.java:469-478`) |
| `Classification.catL` | 24개 그룹. 핵심: `부자재 86`, `판넬 36`, `실내기 197`, `실외기 179`, `실외기 받침 2`, `실외기 받침대 2`, `전열교환기 3`; NULL 1,942. 나머지에는 가정용 에어컨 223, 냉난방/냉전 벽걸이·스탠드 등이 있다 | **부분적으로 가장 좋음**. `실내기`·`실외기`를 별도 라벨로 제외할 수 있지만, 다섯 계열 전체를 현재 값으로 포함하지 못한다 | DB/API. entity가 catL/M/S를 참조하는 것은 `Product.java:121-134`; 분류 master API는 `ClassificationController.java:27-41`; catalog 응답에는 catL/M/S가 있다(`ProductCatalogResponse.java:43-55`) |
| `Classification.catM` / `catS` | catM 57개 그룹, NULL 2,173; catM의 관련 값 `리모컨 6`, `분기관 13`, `원형발통 1`, `유연호스 3`. catS 12개 그룹, NULL 2,943 | **보조 신호뿐**. 명칭이 더 세분화되어 있지만 NULL이 많고 본체/부자재 최종 역할축으로 설계되어 있지 않다 | DB/API. `Product.java:121-134`, `Classification.java:21-66`, `ProductCatalogResponse.java:43-55` |
| physical `categories` | `ECOUNT_MIG2 1,941`; `INDOOR_WALL 1,119`; `PIPING 1`; `INDOOR_WALL`의 `serial_managed=true` 1,119 | **없음**. 현재 대부분이 ECOUNT_MIG2/INDOOR_WALL이며 accessories/piping 의미와 상품 역할이 일치하지 않는다 | DB/API 성격의 master. category tree와 serial 의미는 `Category.java:19-29`, `:56-62` |
| `panel_type` | NULL 3,000; `360 5`; `공청 16`; `블랙 6`; `승강 6`; `일반 28` | **판넬 속성만** 판별한다. 다섯 계열 전체에는 적용되지 않고 NULL도 많다 | DB 컬럼으로 확인. 현재 `ProductCatalogResponse` 필드에는 없다(`Product.java:181-187`, `ProductCatalogResponse.java:43-66`) |
| `remote_type` | NULL 3,044; `무선 14`; `유선 3` | **리모컨 속성만** 판별한다. 나머지 계열과 모든 리모컨을 포괄하지 않는다 | DB 컬럼으로 확인. 현재 `ProductCatalogResponse` 필드에는 없다(`Product.java:181-187`, `ProductCatalogResponse.java:43-66`) |
| `discount_flags` / `legacy_discount_flag` | `discount_flags`: `000000 3,053`, `100000 8`; legacy false 3,032, true 29 | **없음**. 6-bit 할인/가격 플래그이며 역할 분류 주석이 아니다 | DB/API. 할인 플래그 의미는 `Product.java:141-150`, 응답 노출은 `ProductCatalogResponse.java:61-66` |
| ECOUNT `product_group1/2`, `category_group` | group1/category_group NULL 3,011, `[DVMHOME] 홈멀티 46`, `[DACC] DVM용악세사리 2`, 기타 2; group2는 전건 NULL | **현재 사용 불가**. 값이 거의 비어 있고, group1의 악세사리 2건도 다섯 계열 전체를 대표하지 않는다 | DB만 확인. 필드 정의는 `Product.java:321-329`; catalog DTO에 없음(`ProductCatalogResponse.java:43-66`) |
| `bundle_component` 존재 여부 | 활성 링크 1,584개, 해소 1,584개. kind별: `INDOOR 271링크/191모델`, `OUTDOOR 408/158`, `PANEL 250/16`, `REMOTE 315/12`, `MATERIAL 273/15`, `ACCESSORY 67/8`; `FOOT` 0 | **존재 여부만으로는 없음**. INDOOR/OUTDOOR도 구성품이므로 membership을 부자재로 읽으면 본체를 포함한다. `component_kind`는 안전한 역할 후보지만 세트에 연결된 모델만 다룬다 | DB/API domain. kind enum과 본체/부자재 계열이 명시되어 있다(`BundleComponent.java:19-27`, `:35-52`, `:71-89`) |

`product_business_type`의 `부재료` 2행은 `FH-LFHLF`, `FH-LFHLN`이고 둘 다 catL `부자재`였다(Q-143233, 2026-08-10 14:32:33.150095). 이 필드는 의미는 좋지만 전체 계열을 덮지 못한다.

### 2.2 프런트 `AUTO_HOME_MODELS` / 이름 규칙

`clients/web/estimate-app/views/index.ejs:4512-4542`는 `HOMEMULTI.find(...)`로 호스·분기관·발통·리모컨을 이름/모델 정규식으로 하나씩 고르고, `PANEL_MODELS`에는 26개 모델코드를 literal로 둔다. `AUTO_HOME_MODELS`에 이들을 넣는 실제 호출은 `:4545-4549`이다. `SINGLE_SET`의 발통·유선보드·드레인펌프 등은 `AUTO_SINGLE_IDS`로 별도 표시된다(`index.ejs:4538-4543`). DB catalog를 `HOME_MULTI` endpoint에서 읽는 경로는 `clients/web/estimate-app/lib/code.js:1880-1888`이다.

현재 DB에서 그 selector를 `HOME_MULTI` exposure + 활성 product에 적용한 결과는 다음과 같다(Q-143730, 2026-08-10 14:37:30.239421).

| 계열 | 프런트가 현재 고른 `AUTO_HOME_MODELS` unique 모델 | broad DB 이름/모델 후보 | 현재 대표 분류 |
|---|---:|---:|---|
| 호스 | 3: `FH-LFHLF`, `FH-LFHLN`, `FH-LFHIF` | 3 | 모두 catL `부자재`; 그중 2건만 ECOUNT business type `부재료` |
| 판넬 | literal 26 | 29: literal 외 이름 매칭 3건 | literal 26 전부 catL `판넬` |
| 리모컨 | unique 5: `AR-EC05`, `AWR-WV00N`, `AR-CH01`, `AWR-WE13N`, `AIM-A01N` | 7: 추가 `AWR-WG00N`, `AR-KH05` | 6건은 catL `부자재`, `AWR-WV00N`은 `전열교환기` |
| 발통 | `발통세트` 1 | 1 | catL `실외기 받침대` |
| 분기관 | 2: `AXJ-YA1509N`, `AXJ-YA2512N` | 2 | 둘 다 catL `실내기` |
| 발통 SINGLE_SET | `SI-AL700a`는 `AUTO_HOME_MODELS`가 아니라 `AUTO_SINGLE_IDS` 경로 | 1 | `SINGLE_SET`, catL `실외기 받침` |

따라서 `AUTO_HOME_MODELS`는 사실상의 부자재 **목록 전체**가 아니다.

- 프런트 runtime Set이고 DB 컬럼·서버 API·validator snapshot 필드가 아니다(`index.ejs:4545-4549`, validator snapshot은 `QuantitySyncRuleValidator.java:154-159`).
- 현재 broad DB 후보 42개 중 일부만 자동 선택된다. 특히 리모컨 2개와 패널 이름 매칭 3개가 literal/selector 집합과 다르다(Q-143143, Q-143730).
- 발통의 `SI-AL700a`와 일부 single-set 파생은 별도 `AUTO_SINGLE_IDS`다(`index.ejs:4538-4548`).
- 실제 계산 trigger도 이름 기반이며 AUTO Set과 동일하지 않다. estimate-app의 trigger 함수는 `clients/web/estimate-app/views/index.ejs:8037-8047`, order-app의 함수는 `clients/web/order-app/index.html:5214-5221`이다.

### 2.3 다섯 계열의 공통 교집합과 차집합

Q-143143(2026-08-10 14:31:43.105607)의 모델별 결과에서 broad 후보 42개는 모두 `product_category=HOME_MULTI`, `goods_type=GOODS`, `product_type=SINGLE`, `usage_scope=BOTH`였다. 이는 catalog/exposure/product-kind 축이 다섯 계열을 가리지 못한다는 뜻이다.

축이 서로 다른 답을 내는 대표 모델은 다음과 같다.

| 모델 | catalog 축 | 역할/분류 축 | business type | bundle membership | 판정 차이 |
|---|---|---|---|---|---|
| `FH-LFHLF`, `FH-LFHLN`, `FH-LFHIF` | HOME_MULTI / GOODS / SINGLE | catL `부자재` | 2건 `부재료`, 1건 `상품` | 없음 | `product_business_type`는 두 건만 잡지만 catL은 셋을 잡는다 |
| `PC...` literal 26 | HOME_MULTI / GOODS / SINGLE | catL `판넬` | 상품 | PANEL은 8모델만 bundle에 연결 | bundle membership은 18개를 놓친다 |
| `AWR-WV00N` | HOME_MULTI / GOODS / SINGLE | catL `전열교환기` | 상품 | 없음 | 이름은 리모컨이지만 catL만으로는 부자재가 아니다 |
| `AXJ-YA1509N`, `AXJ-YA2512N` | HOME_MULTI / GOODS / SINGLE | catL `실내기` | 상품 | 없음 | 이름은 분기관이지만 catL은 주품목 라벨과 같다 |
| `발통세트` | HOME_MULTI / GOODS / SINGLE | catL `실외기 받침대` | 상품 | 없음 | catL allowlist에 받침대를 넣어야 한다 |
| `SI-AL700a` | SINGLE_SET / GOODS / SINGLE | catL `실외기 받침` | 상품 | 조사한 active bundle link 없음 | AUTO_HOME이 아니라 AUTO_SINGLE이다 |

주품목 기준을 현재 catL `실내기`·`실외기`로 잡으면 활성 주품목은 376건(실내기 197, 실외기 179)이다(Q-143746, 2026-08-10 14:37:46.792356). 이 376건은 전부 GOODS·상품이고, product_category는 HOME_MULTI 67, COMMERCIAL_MULTI 297, OLD 12이며, SINGLE 308·BUNDLE 68이다. 그러므로 GOODS/SINGLE/HOME_MULTI/exposure를 부자재 조건으로 쓰면 주품목을 대량 허용한다.

반대로 `bundle_component.component_kind`에서 INDOOR/OUTDOOR를 제외하고 PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT만 허용하면 구성품 역할은 구분할 수 있지만, 현재 다섯 계열 중 bundle에 연결된 모델은 PANEL 8·REMOTE 3뿐이다(Q-143824, 2026-08-10 14:38:24.454074). 호스·분기관·발통은 bundle membership으로 확인되지 않는다.

## 3. 현행 validator, API, UI

### 3.1 validator가 target에 거는 제약 전수

`QuantitySyncRuleValidator`의 현재 target 관련 검사는 아래뿐이다.

1. rule category는 `HOME_MULTI`, `SINGLE_SET`, `COMM_MULTI`만 허용한다(`QuantitySyncRuleValidator.java:29-33`, `:196-198`).
2. source/target이 비어 있지 않아야 하고, target product는 `active` 및 `visible`이어야 한다(`:212-232`, `:376-383`).
3. target multiplier, rounding(`NONE`/`FLOOR`), display order를 검사한다(`:229-237`).
4. source와 target은 문자열·productId 양쪽에서 같은 품목이면 안 된다(`:243-259`).
5. BUNDLE source의 구성품을 target으로 지정하면 안 된다. 이것은 **target이 부자재인지 검사하는 조건이 아니라, source가 BUNDLE일 때 자기 구성품을 target으로 삼는 경계**다(`:260-279`).
6. source와 target 모두 해당 rule category의 `product_estimate_exposure` 멤버여야 한다(`:280-289`).
7. 중복, REPLACE 충돌, cycle 및 S03 수량 계수 검사를 한다(`:293-318`, `:376-504`).

`ProductSnapshot` 자체에도 categories·active·visible·bundle·component set만 있고 productCategory, goodsType, catL, componentKind, AUTO 표식은 없다(`QuantitySyncRuleValidator.java:129-159`). 따라서 현재 validator에는 target 부자재 제약이 없다.

source에는 별도의 본체 제약도 없다. source도 같은 `validateProduct`와 factor 검사를 받고(`QuantitySyncRuleValidator.java:221-228`, `:376-383`), category membership·중복·BUNDLE 경계의 공통 검사만 받는다(`:243-289`). 즉 현재는 부자재를 source로 쓰는 방향도 서버가 거부하지 않는다.

DB schema도 target product FK만 있고 역할 FK/조건이 없다(`services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql:58-78`). V24에서 DB trigger를 제거하고 Java validator를 유일한 graph 강제 지점으로 남겼으며, 직접 SQL은 graph 불변식을 우회할 수 있다고 명시한다(`V24__quantity_sync_rule_schema.sql:108-127`).

### 3.2 관리자 UI의 target 검색

현재 추적된 client 코드에는 수량 동기화 **규칙 편집 화면**이 없다. order-app은 `/quantity-sync-rules`를 읽어 SINGLE_SET shadow 계산에 소비할 뿐이다(`clients/web/order-app/src/samhanApi.ts:188-190`, `clients/web/order-app/src/quantitySync.ts:1-16`, `clients/web/order-app/src/main.ts:57-78`). 서버 CRUD API도 목록/조회/POST/PUT/DELETE만 제공하며 target 역할 metadata를 반환하지 않는다(`services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:25-80`, `QuantitySyncRuleResponse.java:11-24`).

가장 가까운 관리자 품목 선택기는 `EstimateItemsCatalogPage.tsx`의 기초품목 autocomplete다.

- 검색 후보는 status가 선택 가능하고 `productCategory !== MATERIAL`인 것만 남긴다(`clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:98-109`).
- 이미 현재 견적 category에 노출된 품목만 제외한다(`:104-109`).
- 검색은 모델명/품목명이고(`:1231-1270`), 선택기는 `searchMasterProductOptions`를 사용한다(`:1060-1069`, `:1314-1328`).
- `goods_type=NON_GOODS`, `product_type=BUNDLE`, catL `실내기`/`실외기`, AUTO 파생 여부를 target 기준으로 필터링하지 않는다. add mutation도 MATERIAL과 이미 노출만 거부한다(`:897-915`).

따라서 현재 UI에서 “부자재만 target 검색”은 구현되어 있지 않다. 다만 이것은 현재 client에 rule editor가 없다는 뜻이므로, “UI로 이미 만들 수 있는 QSR 조합의 전수”는 **판정 불가**다. 인접한 master picker의 허용 범위만 보면 역할 제약이 열려 있다.

## 4. 저장 규칙과 제한 도입 시 처리

### 4.1 현재 표본

읽기 전용 count 결과는 2026-08-10 14:33:05.500422 KST 기준 `quantity_sync_rule` 전체 0행, active 0행, soft-deleted 0행이었다. 이 측정은 회사PC 표본 0이라는 handoff와 일치한다. 따라서 **주품목 target 저장 규칙의 실재 여부는 판정 불가**다.

schema에는 child source/target table과 target product FK가 있지만 seed INSERT는 없다고 적혀 있다(`V24__quantity_sync_rule_schema.sql:1-4`, `:58-78`).

### 4.2 validator 제한을 넣는 경우의 코드상 처리

| 상황 | 코드상 결과 |
|---|---|
| 신규 POST에서 target이 부자재 판정 실패 | `create`가 Product를 해소한 뒤 validator를 먼저 호출하고, 통과해야 rule을 save한다(`QuantitySyncRuleService.java:281-301`). 따라서 실패는 저장되지 않는다. validator의 `invalid`는 BusinessException으로 종료된다(`QuantitySyncRuleValidator.java:613-616`). |
| 기존 rule PUT/replace에서 target이 새 제한에 걸림 | validator가 child soft-delete와 재삽입보다 먼저 실행된다(`QuantitySyncRuleService.java:304-325`). 실패하면 기존 child를 삭제하는 코드까지 도달하지 않는다. |
| 이미 저장된 invalid rule의 목록/조회 | 자동 제외되지 않는다. list는 `is_deleted=false` rule을 읽어 response로 매핑할 뿐이다(`QuantitySyncRuleService.java:115-130`). `toResponse`도 source/target을 조회해 model code/name을 반환하고 역할 재검증을 하지 않는다(`:537-565`). |
| 이미 저장된 invalid rule이 있는 상태에서 다른 신규 rule 생성 | `activeRuleSnapshots`는 기존 active rule을 graph/충돌 snapshot으로 만들지만(`QuantitySyncRuleService.java:500-534`), 기존 target의 새 역할축을 소급 재검증하는 경로는 없다. |
| DB 직접 insert | V24 설명대로 Java validator를 거치지 않으므로 역할 제한도 우회한다(`V24__quantity_sync_rule_schema.sql:108-127`). |

현재 0행이므로 “기존 규칙을 조회에서 숨기기”의 즉시 비용은 없다. 그러나 향후 규칙이 생긴 뒤에는 신규/replace-only 정책이면 invalid legacy row가 목록에 남고, 소급 정책이면 별도 backfill/disable/delete 의사결정이 필요하다.

### 4.3 소급 적용 선택지

| 선택지 | 장점 | 대가/주의 |
|---|---|---|
| A. 신규 POST와 PUT만 제한(권장, 현재 0행 기준) | 현재 데이터 migration이 없고 즉시 저장 경계를 닫는다 | 기존 invalid 행이 있었다면 조회는 계속 되고, 수정 시에만 실패한다. 향후 audit query가 필요하다 |
| B. 기존 active rule까지 소급 검증 | 운영 graph가 곧바로 본체→부자재 불변식을 갖는다 | invalid 행의 disable/soft-delete/수정 중 하나를 정해야 하며, 현재 list/get 코드에는 자동 제외가 없다 |
| C. DB/직접 SQL까지 강제 | 우회 저장도 막는다 | V24가 의도적으로 DB trigger를 제거한 이유(품목·sync 다중 쓰기 경로 재수렴 부담)가 다시 생긴다(`V24__quantity_sync_rule_schema.sql:108-127`) |

현재 표본 0만 놓고 보면 A와 B의 기존 규칙 처리 결과는 같다. B/C는 향후 데이터와 운영 write path를 포함한 별도 결정이다.

## 5. 이 제한이 깨뜨릴 수 있는 것

### 5.1 현재 데이터에서 확인된 조합

#### 부자재끼리 source/target

현재 validator는 source 역할을 제한하지 않으므로 부자재를 source로 지정하는 요청도 통과 가능하다(`QuantitySyncRuleValidator.java:221-289`). 그러나 실제 QSR 편집 UI가 없으므로 “현재 UI로 만들 수 있는 조합”이라고 실증할 수는 없다. target 제한을 넣으면 부자재→부자재 규칙은 target 자체가 부자재이면 남지만, “source는 반드시 본체”까지 함께 제한하면 차단된다. 후자는 이번 요청의 target 제한보다 넓은 변경이다.

#### 세트 구성품 target

`bundle_component`의 kind은 INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT 전체를 포함한다(`BundleComponent.java:35-52`). membership 자체를 부자재로 취급하면 INDOOR 191모델·OUTDOOR 158모델을 포함하므로 주품목을 다시 허용한다(Q-143009). 반대로 PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT만 허용하면 역할 의미는 맞지만, 현재 다섯 파생에서 bundle link가 확인되는 것은 PANEL 8모델과 REMOTE 3모델뿐이다(Q-143824).

또한 구성품은 세트 전개에 쓰인다는 이유만으로 rule target이 되지 않는다. 현재 구성품 축에서 usage BOTH이면서 exposure가 있는 모델은 PANEL 8, REMOTE 4, OUTDOOR 43이고, INDOOR 191·MATERIAL 15·ACCESSORY 8·OUTDOOR 일부는 usage NONE 또는 exposure 없음이다(Q-143542, 2026-08-10 14:35:42.065898). validator는 target에도 visible과 rule-category exposure를 요구한다(`QuantitySyncRuleValidator.java:280-289`, `:376-383`). 따라서 `#1111`의 구성품 편집 가능성과 QSR target 가능성은 별개다.

#### 비상품 target

현재 active NON_GOODS는 34건이다. 그중 visible/exposed한 `운임`, `절삭` 2건은 catL `부자재`, usage BOTH이며 모든 estimate exposure가 있다(Q-144304). validator와 가까운 master picker는 NON_GOODS를 별도로 거부하지 않는다(`EstimateItemsCatalogPage.tsx:98-109`, `:897-915`; validator snapshot에도 goodsType이 없다(`QuantitySyncRuleValidator.java:129-159`)).

즉 catL만 `부자재`로 allowlist하면 이 두 서비스 품목이 target 후보에 섞인다. 개발책임자가 말한 호스·판넬·리모컨·발통·분기관을 “재고 상품 부자재”로 뜻한다면 `goods_type=GOODS` 가드는 필요하다. `goods_type` 자체만으로 부자재를 정의할 수는 없다는 결론과 구분해야 한다.

### 5.2 #1089 및 #1111과의 관계

- **#1089**: 현재 저장소에 이슈 원문 파일이 없어 원문의 세부 정책을 파일:줄로 재현할 수 없다. 코드상 세트 구성품에는 `is_default`와 `component_kind`가 있고(`BundleComponent.java:71-97`), QSR response에는 sources/targets만 있다(`QuantitySyncRuleResponse.java:11-24`). 따라서 target 역할 제한 자체가 세트 전개 default 선택 로직을 직접 바꾸는 경로는 확인되지 않았다. 다만 비기본 PANEL/REMOTE/MATERIAL을 QSR target으로 쓰는 업무가 있다면, “기본 구성품만 전개”와는 별개인 수량 rule 설정 범위가 줄어들 수 있으므로 개발책임자 확인이 필요하다.
- **#1111**: 구성품 schema·API는 products/bundle_component 관할이고, 현재 보고서도 기초품목 구성품 CRUD와 견적품목 편집 진입점 제거를 기록한다(`docs/dev-reports/2026-08-07-1111-s1-components-to-base-product.md:1-5`, `:84-87`). QSR target allowlist가 bundle membership 자체를 부자재로 해석하면 INDOOR/OUTDOOR 구성품까지 허용하게 되어 #1111의 `component_kind` 의미를 훼손한다. `component_kind`별로 principal을 제외하더라도, 구성품 편집 CRUD를 막는 직접 충돌은 없고, 일부 구성품의 QSR target 선택 가능성만 줄어든다.

## 6. 권장 축과 개발책임자 확인 사항

### 6.1 권장 축

**`Classification.catL`을 최종 역할축으로 권장한다.** 이유는 다음 네 가지다.

1. DB에 실제 값이 있고 `실내기`·`실외기`라는 negative class도 같은 축에 있다(`Product.java:121-134`; Q-142941).
2. catalog API와 classification master API로 서버/관리자 모두 접근 가능하다(`ProductCatalogResponse.java:43-55`, `ClassificationController.java:27-41`).
3. `product_category`/estimate exposure는 catalog 위치를 나타내어 다섯 계열과 주품목이 섞이며, `product_business_type`은 현재 2행뿐이다(Q-142917, Q-143233).
4. bundle membership보다 범용적이다. 다섯 계열은 독립 product로도 존재하고, bundle link가 없는 호스·분기관·발통을 놓치지 않는다(Q-143824).

단, **현행 catL 값을 그대로 validator allowlist로 쓰면 안 된다.** 먼저 분기관 2개(`실내기`), `AWR-WV00N`(`전열교환기`), 발통·판넬의 현재 분류 정책을 정해야 다섯 계열 전부를 표현할 수 있다. 그리고 `운임`·`절삭` 때문에 `goods_type=GOODS` 가드를 함께 두어야 한다(Q-144304). 이 두 가지는 catL 축의 결함이 아니라 “현재 분류 데이터가 부자재 역할축으로 정규화되어 있지 않다”는 조사 결과다.

### 6.2 개발책임자 확인이 필요한 선택지

1. **역할 분류를 어떻게 정규화할지**
   - **A (권장)**: 다섯 파생 계열을 `catL=부자재`로 통일하고, 상세 구분은 catM/catS로 보존한다. 장점은 서버/API 단일 축과 본체 negative class다. 대가는 분기관·에어콤보 리모컨·발통 등 기존 분류를 재분류해야 한다.
   - **B**: 현재 catL allowlist(`부자재`, `판넬`, `실외기 받침`, `실외기 받침대`)만 허용한다. 변경량은 작지만 분기관 2개와 `AWR-WV00N`을 target에서 놓친다.
   - **C**: `SUBMATERIAL/MAIN/SERVICE` 역할 컬럼 또는 전용 master를 신설한다. 의미가 가장 명시적이지만 migration·sync·API·관리 UI backfill이 필요하다.

2. **NON_GOODS 처리**
   - **A (권장)**: `catL` 역할축은 유지하되 target은 `goods_type=GOODS`만 허용한다. 운임·절삭의 오허용을 막는다. 비상품의 향후 수량 rule 필요성은 포기한다.
   - **B**: NON_GOODS도 role만 `부자재`면 허용한다. 서비스/재고상품 수량 의미가 섞이는 대가가 있다.

3. **기존 규칙 소급**
   - **A (권장, 현재 0행)**: 신규/replace부터만 제한하고, 별도 read-only audit로 legacy를 감시한다. 현재 migration 비용이 없다.
   - **B**: 기존 active rule도 즉시 검증해 disable/soft-delete/수정한다. 운영 graph는 깨끗해지지만, 기존 규칙 처리 정책과 사용자 확인이 필요하다.

4. **세트 구성품의 target 허용 범위**
   - **A (권장)**: `component_kind=PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT`인 구성품은 역할축과 exposure 조건을 모두 만족할 때 허용한다. 구성품 자체의 편집 소관과 QSR target 자격을 분리한다.
   - **B**: bundle 구성품이면 모두 허용한다. INDOOR/OUTDOOR까지 target이 되어 본체→부자재 방향을 다시 열 수 있다.
   - **C**: bundle 구성품은 전부 금지한다. 안전하지만 #1111에서 관리하는 정당한 PANEL/REMOTE 구성품의 수량 sync 가능성을 잃는다.

이 확인이 끝나기 전에는 validator 구현을 시작하지 않는 것이 안전하다. 이번 보고서에서는 요청대로 조사만 수행했다.
