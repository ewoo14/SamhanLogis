# 주문서웹(order-app) 하드코딩 전수 정찰

- 정찰일: 2026-08-18 (KST)
- 기준: `main` / `ba1271b97`
- 주 대상: `clients/web/order-app/`
- 비교 대상: `clients/web/estimate-app/`
- 서버 대상: `services/partner-order-service/`, 주문서 bootstrap이 호출하는 product-service 내부 API
- 방식: 소스 정적 전수 검색, GitHub REST/CLI 조회, 공유 PostgreSQL **READ ONLY 트랜잭션 후 ROLLBACK** 실측
- 금지사항 준수: 코드 수정·`git add/commit/push` 없음, 지정 워크트리 미접촉, 공유 DB 쓰기 없음, 공유 컨테이너 중지/변경 없음

## 0. 결론

주문서웹은 아직 설정 기반이 아니다. 사용자 옵션 목록 9개, 모델/품번 선택표 29블록, 금액 상수 10블록, 정규식 판정 31블록, 카테고리/품목구분 계약 12블록, 창고 코드 1블록, 합계 **92개 독립 하드코딩 블록**이 운영 경로에 남아 있다.

계수 기준은 문자열 출현 횟수가 아니라 **독립적으로 바뀔 수 있는 규칙·표·선택 지점 1개를 1블록**으로 잡았다. 같은 표를 여러 곳에 복제한 것은 복제 지점마다 1블록이고, 한 표 안의 여러 모델은 1블록이다. 서로 다른 분류에 중복 계수하지 않았다.

- 현행 DB/설정 컬럼으로 대체 가능하거나, 이미 존재하는 구성품 관계를 bootstrap에 전달하면 되는 것: **87블록**
- 현행 설정만으로는 대체 불가: **5블록**
  - 비선형 수량 규칙 H-07, C-09: 2블록
  - 외부 bootstrap/시트 포맷의 고정 키·탭 계약: 2블록
  - ECOUNT 창고 코드 `2`, `00003`: 1블록
- 단, “대체 가능 87”은 즉시 삭제 가능하다는 뜻이 아니다. 활성 DB에는 싱글 옵션 관계가 상당 부분 있으나 HOME/COMMERCIAL 옵션 관계와 수량규칙이 비어 있어, **#1272 데이터 이전 → #1268 런타임 소비 전환** 순서가 선행돼야 한다.

## 1. 【현황】 분류별 개수

| 분류 | 운영 하드코딩 블록 | 현행 설정으로 대체 가능 | 현행 설정만으로 대체 불가 |
|---|---:|---:|---:|
| a 모델 ID·품번 | 29 | 29 | 0 |
| b 단가·금액 상수 | 10 | 10 | 0 |
| c 옵션 목록 문자열 배열 | 9 | 9 | 0 |
| d 분류·판정 정규식/수량 규칙 | 31 | 29 | 2 |
| e 카테고리·품목구분 리터럴 | 12 | 10 | 2 |
| f 거래처·창고·계정 코드 | 1 | 0 | 1 |
| **합계** | **92** | **87** | **5** |

기술 상수(HTTP timeout, DOM index, 퍼센트 표시용 100, 날짜 포맷), API 경로, 테스트 데이터는 위 운영 계수에서 제외했다. 테스트/fixture는 §3에 별도 집계했다.

## 2. 운영 하드코딩 전수 목록과 대체 판정

### 2.1 a — 모델 ID·품번 29블록

| # | 파일:줄 | 내용 | 대체 판정과 설정 출처 |
|---:|---|---|---|
| A01 | `clients/web/order-app/index.html:1490-1491` | `AY047BA1SBA`, `PC1DWSK1` 할인 예외 | 가능 — `products.discount_option`, `has_variable_discount`, `fixed_discount_rate` |
| A02 | `index.html:1513-1522` | `AP230/AP290` 모델 prefix 판정 | 가능 — `products.cat_l_id/cat_m_id`, `product_category` |
| A03 | `index.html:2476-2497` | 상업 리모컨 `AWR-VH12N/AWR-WG00N/AWR-WE13N/AR-CH01/AR-EH05` 선택 | 가능 — `bundle_component(component_kind=REMOTE, component_variant, is_default)` |
| A04 | `index.html:2541-2547` | 받침대/GHP `SI-AL600a/SI-AL700a/ACL-KORGHP07` | 가능 — `bundle_component(component_kind=FOOT/ACCESSORY)` |
| A05 | `index.html:2606-2609` | `RENEW_FILTER_MAP`의 `AF-R09A/AF-R12A → AM...` | 가능 — `quantity_sync_rule/source/target` |
| A06 | `index.html:2638-2646` | HOME 분기관·리모컨·받침대 모델 탐색 | 가능 — 구성품 종류/변형 + 수량동기화 대상 |
| A07 | `index.html:2653` | `ADP-F075SP` 드레인펌프 | 가능 — `quantity_sync_target.target_product_id` |
| A08 | `index.html:2897` | `ADP-` 표시 판정 | 가능 — `component_kind`, 품목분류 |
| A09 | `index.html:2908-2925` | 분기관·호스·받침대·리모컨 자동 모델 탐색 | 가능 — 구성품 관계/종류/변형 |
| A10 | `index.html:2927-2931` | `PANEL_MODELS` 판넬 모델 표 | 가능 — PANEL 구성품 관계/변형/형상 |
| A11 | `index.html:2933-2936` | `AIM-A01N`, 펌프, 받침대 단품 ID | 가능 — 구성품 관계/수량 규칙 |
| A12 | `index.html:5204` | AP230/AP290 평받침대 특례 | 가능 — 해당 세트의 FOOT 기본 구성품 |
| A13 | `index.html:5208` | `SI-AL700a` fallback | 가능 — FOOT 구성품 |
| A14 | `index.html:5222` | `AIM-A01N` fallback | 가능 — REMOTE/ACCESSORY 구성품 |
| A15 | `index.html:5229` | `ADP-F075SP` fallback | 가능 — 수량동기화 대상 |
| A16 | `index.html:5259-5271` | HOME 판넬 swap/인피니트 모델 표 | 가능 — PANEL 변형/기본값 |
| A17 | `index.html:5382-5385` | 판넬 fallback 모델 | 가능 — PANEL 구성품 |
| A18 | `index.html:5415-5440` | 판넬 모델표 복제 | 가능 — PANEL 구성품 |
| A19 | `index.html:5489-5509` | HOME 리모컨 탐색/fallback | 가능 — REMOTE 변형/기본값 |
| A20 | `index.html:5563-5691` | HOME 분기관·호스 대상 모델표 | 가능 — 수량동기화 source/target |
| A21 | `index.html:5768` | 상업 호스 fallback | 가능 — 구성품 관계 |
| A22 | `index.html:5786-5793` | `PUMP_MAP` | 가능 — 수량동기화 source/target |
| A23 | `index.html:5855` | `AXJ-TA3419M` 분기관 | 가능 — 수량동기화 대상 |
| A24 | `index.html:5947-6005` | 상업 판넬 변환표/`MAP360` | 가능 — PANEL 변형/형상 |
| A25 | `index.html:7836-7842` | 용량별 분기관 모델 선택 | 가능 — 수량 규칙 source/target/condition |
| A26 | `index.html:7900-7913` | 분기관 badge 모델표 | 가능 — 수량 규칙 결과 메타데이터 |
| A27 | `index.html:10045-10078` | 튜토리얼 9개 모델 ID | 가능 — 튜토리얼을 현재 카탈로그의 분류/구성품으로 선택 |
| A28 | `services/partner-order-service/.../PartnerOrderConfirmService.java:69-76` | 분류 차이 감시용 32모델 집합 | 가능 — DB 분류 정합성 조회로 대체; 현재는 로그 분기만 함 |
| A29 | `services/partner-order-service/.../LegacyWarehouseExceptions.java:18-50` | 모델→창고 예외 32행 | 가능 — 상품별 warehouse routing 설정 또는 분류 데이터 보정 |

### 2.2 b — 단가·금액 상수 10블록

| # | 파일:줄 | 내용 | 대체 판정과 설정 출처 |
|---:|---|---|---|
| B01 | `index.html:1476-1488` | HOME/COMM 할인율 fallback `0.45` | 가능 — `estimate_configs.common_*_discount_rate` 및 bootstrap `config` |
| B02 | `index.html:1769-1772` | 배분 반올림 단위 `1000` | 가능 — `products.allocation_round_unit` |
| B03 | `index.html:1829-1839` | 금액 분할 시 고정 `1000` 단위 | 가능 — 같은 `allocation_round_unit` |
| B04 | `index.html:2732` | I형 호스 `8,000원` | 가능 — 구성품 `delivery_price/context_delivery_price` |
| B05 | `index.html:2771` | I형 호스 `8,000원` 복제 | 가능 — 동일 |
| B06 | `index.html:2814` | I형 호스 `8,000원` 복제 | 가능 — 동일 |
| B07 | `index.html:2860` | I형 호스 `8,000원` 복제 | 가능 — 동일 |
| B08 | `index.html:3327` | I형 호스 `8,000원` 복제 | 가능 — 동일 |
| B09 | `index.html:3433-3434` | 세트금액 실내:실외 배분 HOME `6:4`, 기타 `4:6` | 가능 — `allocation_mode/weight/fixed_allocation_amount` |
| B10 | `index.html:8180-8212` | 10/30/50/100m 구간, 1~4%, 기준 45%, 상한 48% | 가능 — 할인 정책 설정 테이블/컬럼. 현재 최종 서버 가격 권위와 별개로 화면/비고 계산을 변경함 |

### 2.3 c — 옵션 목록 문자열 배열 9블록

| # | 파일:줄 | 현재 배열 | 대체 설정 |
|---:|---|---|---|
| C01 | `index.html:4348` | 상업 판넬 6종 | PANEL 구성품의 `component_variant`, `is_default`, `display_order` |
| C02 | `index.html:4349` | `원형/사각` | `component_shape` |
| C03 | `index.html:4350` | `제외/무선/유선/컬러유선` | REMOTE 구성품 변형 + 제외 가능 정책 |
| C04 | `index.html:5154` | HOME `기본/유선/컬러/제외` | REMOTE 구성품 변형/기본값 |
| C05 | `index.html:5155` | HOME 판넬 5종 | PANEL 구성품 변형/기본값 |
| C06 | `index.html:5164` | SINGLE 리모컨 3종 | REMOTE 구성품 변형/기본값 |
| C07 | `index.html:5167` | SINGLE 판넬 5종 | PANEL 구성품 변형/기본값 |
| C08 | `index.html:5168` | `원형/사각` | `component_shape`; 기본은 `estimate_configs.single_panel_shape` |
| C09 | `index.html:5169` | `포함/별도` | MATERIAL 구성품 및 `single_material_inclusion` |

9개 모두 동적 대체 가능하다. 그러나 bootstrap에 옵션 정의/순서/제외 가능 여부가 없고 HOME/COMMERCIAL 구성품 관계가 비어 있어 현재 즉시 제거하면 안 된다.

### 2.4 d — 분류·판정 정규식/수량 규칙 31블록

#### 수량동기화 20개 규칙군

| 규칙군 | 주문서웹 위치 | 내용 | 판정 |
|---|---|---|---|
| H-01~H-03 | `index.html:5259-5440` | HOME 판넬 기본/교체/수동잠금 | 현행 rule + variant/shape로 가능 |
| H-04~H-06 | `index.html:5457-5509` | HOME 리모컨 기본/유선/컬러 선택 | 현행 rule + variant로 가능 |
| H-07 | `index.html:5513-5565` | 분기관 차감·clamp·gate | **현행 스키마 불가** — 차감식/조건식 확장 필요 |
| H-08 | `index.html:5185-5208` | 받침대 | 현행 구성품/수량 규칙으로 가능 |
| S-01~S-03 | `index.html:5196-5229` | SINGLE 받침대/유선보드/드레인펌프 | 현행 rule로 가능 |
| C-01~C-04 | `index.html:5719-5847` | 상업 리모컨/호스/펌프/받침대 | 현행 rule로 가능 |
| C-05~C-08 | `index.html:5848-6007` | 상업 판넬/SET/형상/연결 | 현행 rule로 가능(C-08은 C-05 관계 중복) |
| C-09 | `index.html:7826-7915` | 분기관 보드 순서·누적용량·마지막 강제·수동잠금 | **현행 스키마 불가** — 순서/누적 상태 연산 확장 필요 |

#### 추가 판정 11블록

| # | 파일:줄 | 판정 | 대체 설정 |
|---:|---|---|---|
| D21 | `index.html:1443-1453` | 전개 제외 모델/행 | 구성품 종류·전개 정책 |
| D22 | `index.html:1496-1522` | 모델문자 기반 할인 flag | 상품 할인 컬럼 |
| D23 | `index.html:1634-1688` | 판넬/크기/리모컨 판정·선택 | kind/variant/shape |
| D24 | `index.html:1704-1734` | 품명 키워드 제거/표시명 판정 | 상품 표시명/분류 |
| D25 | `index.html:1743-1747,1853-1857` | 할인 부자재·적용대상 판정 | 상품 할인 정책 |
| D26 | `index.html:1795-1815` | 실내기/실외기 판정 | `component_kind` |
| D27 | `index.html:1968-1986,4234-4280` | SINGLE 구성품 kind fallback | `component_kind` |
| D28 | `index.html:2410-2464` | 상업 실내/실외/판넬/호스/리모컨/펌프 판정 | kind/분류 |
| D29 | `index.html:2635-2648` | HOME 카테고리 정규식 | product 분류/kind |
| D30 | `index.html:2650-2695` | SINGLE 카테고리 정규식 | product 분류/kind |
| D31 | `index.html:4307-4462` | 상업 분류 보정·whitelist·표시 판정 | product 분류/kind/노출 설정 |

현행 스키마 기준 D 31블록 중 29개는 대체 가능, H-07/C-09 2개는 규칙 엔진 확장 없이는 대체 불가다.

### 2.5 e — 카테고리·품목구분 리터럴 12블록

| # | 파일:줄 | 내용 | 판정 |
|---:|---|---|---|
| E01 | `index.html:1885-1901` | 명세 허용 카테고리 집합 | 가능 — cat L/M/S 및 노출 설정 |
| E02 | `index.html:1927-2209` | 카테고리별 명세 렌더 분기 | 가능 — 분류/표시 메타데이터 |
| E03 | `index.html:2617-2624` | 카테고리별 색상, `부자재2→부자재` | 가능 — 분류 표시명/색상 설정 |
| E04 | `index.html:3222-3244` | catL별 금액 배분 | 가능 — allocation 설정 |
| E05 | `index.html:3521,3617-3824` | 운임/절삭/특례 카테고리 | 가능 — 상품 분류·정책 |
| E06 | `index.html:3882-4510` | 섹션별 정렬/필터/whitelist | 가능 — exposure/display_order/classification |
| E07 | `index.html:4630-4684` | 표시 카테고리 분기 | 가능 — 표시명/분류 |
| E08 | `index.html:4775,4844-4925` | SET/OLD 품목구분 | 가능 — product_category/goods_type |
| E09 | `clients/web/order-app/src/samhanApi.ts:207-212` | 화면 section→확정 category 매핑 | 가능 — bootstrap이 category key를 함께 제공 |
| E10 | `BootstrapService.java:61-79,257-345` | 18개 bootstrap key와 4개 catalog category 계약 | **불가(현행 외부 포맷)** — 양쪽 API 계약을 버전업해야 함 |
| E11 | `OrderWarehouseByClassification.java:12-19` | HOME/SINGLE 창고 판정 분류 집합 | 가능 — warehouse routing 설정 |
| E12 | `ProductCatalogLookupClient.java:32-37` | 레거시 Google Sheet 탭명·열 위치 | **불가(외부 시트 포맷)** — 공급 포맷 변경 없이는 고정 계약 |

### 2.6 f — 거래처·창고·계정 코드 1블록

| # | 파일:줄 | 내용 | 판정 |
|---:|---|---|---|
| F01 | `OrderWarehouseByClassification.java:9-10`, `LegacyWarehouseExceptions.java:19-50` | ECOUNT 창고 코드 상일 `2`, 초월 `00003` | 현행 외부 계약상 불가. 화면 설정으로 임의 변경하면 전표 창고가 달라짐. 장기적으로 별도 warehouse mapping 설정 테이블은 가능 |

실제 거래처 코드·계정 코드를 값으로 박은 운영 코드는 발견하지 못했다. `partnerCode`, `bizCode`, HTTP header 이름은 값이 아니라 API 필드 계약이므로 제외했다.

## 3. 테스트·fixture 하드코딩 별도 집계

운영 계수에는 포함하지 않았다. 모델/옵션/금액 검색식에 걸린 테스트·fixture는 **15파일, 493회 매치**다.

| 파일 | 매치 수 | 성격 |
|---|---:|---|
| `src/__tests__/fixtures/commercialMultiBootstrap.fixture.json` | 360 | 카탈로그 golden snapshot |
| `src/__tests__/legacy-quantity-golden.test.ts` | 41 | 레거시 동작 회귀 기준 |
| `src/__tests__/catalogMissingSignal.test.ts` | 18 | 모델 누락 신호 fixture |
| `src/__tests__/quantitySyncS03.test.ts` | 16 | S-03 규칙 fixture |
| `src/__tests__/commManualLockRestore.test.ts` | 11 | 상업 수동잠금 회귀 |
| `src/__tests__/homeOptionAndZeroLockRestore.test.ts` | 7 | HOME 옵션/0 잠금 회귀 |
| `src/__tests__/fixtures/singleSetsBootstrap.fixture.json` | 7 | SINGLE catalog fixture |
| `src/__tests__/priceChangeSchedule.test.ts` | 6 | 가격 변경 경계값 |
| `src/__tests__/priceParityS3.test.ts` | 6 | 두 웹 가격 parity |
| `src/__tests__/serverPriceAuthority.test.ts` | 6 | 서버 가격 권위 fixture |
| `src/__tests__/homeManualLockRestore.test.ts` | 4 | HOME 잠금 회귀 |
| `src/__tests__/sol2QuantityFix.test.ts` | 4 | 기존 수량 결함 회귀 |
| `src/__tests__/legacyPreexistingFix.test.ts` | 3 | 기존 옵션 결함 회귀 |
| `src/__tests__/legacyConfigMapping.test.ts` | 3 | config 변환 fixture |
| `src/__tests__/samhanApi.test.ts` | 1 | timeout 계약 |

판정: golden/fixture의 고정값은 허용 가능하다. 다만 런타임을 동적 설정으로 바꿀 때는 “특정 모델이 반드시 선택된다” 테스트를 “DB가 준 variant/kind/shape가 선택된다” 계약 테스트로 바꾸고, 레거시 parity용 golden만 별도 유지해야 한다.

## 4. 서버가 주문서웹에 실제로 주는 것

### 4.1 endpoint와 envelope

- `PartnerOrderBootstrapController.java`: `GET /api/v1/partner-orders/bootstrap`
- 응답: 공통 `ApiResponse<BootstrapResponse>`
- `BootstrapResponse.java:20`: `payloads: Map<String,Object>` 단일 map
- order-app `samhanApi.ts`: gateway base에 `/partner-orders/bootstrap` 요청

공유 스택에서 HTTP 실호출은 503이었다. 원인은 현재 공유 24개 서비스에 `partner-order-service`가 기동돼 있지 않기 때문이다. 따라서 라이브 envelope 값은 미측정이고, 아래는 main 코드와 DB cache를 대조한 확정 계약이다.

### 4.2 bootstrap 18키

`BootstrapService.java:61-79`의 순서/키:

1. `homemulti` — HOME_MULTI/PARTNER_ORDER 노출 상품
2. `singleSets` — SINGLE_SET/PARTNER_ORDER 노출 상품
3. `singleParts` — SINGLE_SET 구성품
4. `homeDefaults` — 구형 cache 기본값
5. `singleDefaults` — 구형 cache 기본값
6. `singleMatPrices` — 자재명→가격
7. `commercialMulti` — COMMERCIAL_MULTI/PARTNER_ORDER 노출 상품
8. `commercialParts` — COMMERCIAL_MULTI 구성품
9. `oldProducts` — LEGACY/PARTNER_ORDER 상품
10. `homeInc` — HOME 모델→기준가격
11. `commInc` — COMMERCIAL 모델→기준가격
12. `singleInc` — SINGLE_SET 모델→기준가격
13. `singlePartsInc` — SINGLE 구성품 모델→기준가격
14. `commPartsInc` — COMMERCIAL 구성품 모델→기준가격
15. `specDetailMap` — 구형 명세 map
16. `config` — 견적/주문 설정
17. `logoData` — 로고
18. `priceChangeSchedule` — 카테고리별 가격 변경일

### 4.3 행별 필드

| payload | 필드 | 의미/원천 |
|---|---|---|
| `homemulti`, `commercialMulti` | `name, model, unit, price, list, useK2, 고정DC, capacity, spec, catL, catM, catS, disp, note` | `model=modelCode`, `price=deliveryPrice`, `list=releasePrice`, 할인/분류/표시 필드 |
| `singleSets` | `id, name, model, unit, price, priceRaw, priceRight, matKey, catL, catM, note` | 세트 납품가와 분류. `id=name+rowIndex` |
| `oldProducts` | `name, model, unit, price, sheetPrice, isDisc, remarks, spec` | `price=releasePrice`, `sheetPrice=deliveryPrice` |
| `singleParts`, `commercialParts` | `setModel, model, name, unit, price, kind, isDefault, qty, feat, spec` | 구성품 관계. `kind=componentKind`, `feat=componentVariant`, `qty=defaultQty` 정수화. 상업 가격은 출고가 우선/납품가 fallback, 싱글은 납품가 |
| `singleMatPrices` | `{name: price}` | 자재 납품가 map |
| `*Inc` | `{model: price}` | price baseline |

### 4.4 필요한데 안 넘어오는 필드

| 누락 | DB에는 있는가 | 결과 |
|---|---|---|
| `componentShape` | 있음. PANEL 250행 중 70행 채움 | 원형/사각 배열·정규식 유지 원인 |
| 구성품별 `contextDeliveryPrice` | 있음. PANEL 250행 중 58행 채움 | 구성품 납품가 대신 전역 상품가/fallback 사용. `componentRows`가 이 필드를 버림 |
| 옵션 표시명/활성/순서/제외 가능 여부 | 전용 option 정의는 없음; `variant/isDefault/displayOrder` 일부 존재 | 9개 배열 유지 원인 |
| 상품 `panelType`, `remoteType` | `products`에 있음 | bootstrap 상품행이 버림; 이름/모델 정규식 유지 원인 |
| 수량동기화 rule/source/target | 별도 API에는 있으나 bootstrap 18키에는 없음 | 최초 bootstrap만으로 규칙 실행 불가 |
| rule target의 `componentVariant`, `componentShape` | 스키마에는 있음 | 실데이터 0/3, 0/3 채움이라 옵션 축 연결 불가 |

중요한 클라이언트 결함:

- `src/samhanApi.ts:193-196`는 수량규칙 API를 `estimateCategory=HOME_MULTI`로만 조회한다.
- `src/quantitySync.ts:10,118-135`는 `SINGLE_S03_CEILING_DRAIN_PUMP` 및 `estimateCategory=SINGLE_SET`만 선택한다.
- 올바르게 필터링하는 서버라면 HOME_MULTI 응답에서 SINGLE_SET S-03을 받을 수 없으므로 준비상태가 될 수 없다.
- `src/main.ts`는 규칙 상태를 저장하지만 실제 사용자 수량 계산은 여전히 `index.html`의 레거시 함수가 수행한다.

## 5. 【두 웹 대조】 옵션 축별 estimate-app ↔ order-app

| 옵션 축 | 종합견적서 main | 주문서웹 main | 판정 |
|---|---|---|---|
| 상업 판넬 | `estimate index.ejs:6673` 6종 | `order index.html:4348` 동일 6종 | 목록 동일, 둘 다 하드코딩 |
| 상업 판넬 형상 | `6674` 원형/사각 | `4349` 원형/사각 | 동일, 둘 다 DB shape 미사용 |
| 상업 리모컨 | `6675` 제외/무선/유선/컬러유선 | `4350` 동일 | 목록 동일, 모델 선택도 양쪽 하드코딩 |
| HOME 리모컨 | `7845` 기본/유선/컬러/제외 | `5154` 동일 | 목록 동일 |
| HOME 판넬 | `7846` 5종 | `5155` 동일 | 목록 동일 |
| SINGLE 리모컨 | `7887` 3종 | `5164` 동일 | 목록 동일 |
| SINGLE 판넬 | `7890` 5종 | `5167` 동일 | 목록 동일 |
| SINGLE 형상 | `7891`: `SINGLE_DEFAULTS['360판넬'] || '원형'` | `5168`: 무조건 `원형` | **기본값 불일치 결함**. DB `single_panel_shape=원형`인 현재는 결과가 우연히 같지만 설정 변경 시 주문서만 불변 |
| SINGLE 자재 | `7892` 포함/별도 | `5169` 동일 | 목록 동일 |
| I형 호스 | 견적 `6677,7848`: 견적 건별 checkbox | 주문: `window.SHOW_I_HOSE` 거래처 설정 중심 | 동작 축 다름. 직원용/거래처용 의도인지 명시 필요; 가격 8,000원은 주문서 코드에 5회 고정 |
| 모델→단가 | estimate는 `PRICE_INC.single[model].price` (`4430,4443,5180`) | 주문은 bootstrap 가격 + 최종 `pricePreview` 서버 권위 | 최종 단가 권위는 주문서가 서버이나, 구성/수량/사전표시가 하드코딩이라 같은 옵션이 다른 모델로 해석될 수 있음 |

공통 위험: 두 웹이 같은 배열을 복사했으므로 지금은 같아 보여도 DB 설정 변경이 어느 쪽에도 반영되지 않는다. PR #1269의 `LEGACY_COMPONENT_DELIVERY`처럼 설정값보다 코드표를 우선하는 회귀를 주문서 main에서 새로 발견하지는 않았지만, 기존 모델표가 이미 같은 역할을 한다.

## 6. 레거시 원문 근거

“레거시가 이렇다”는 추정이 아니라 아래 원문과 현재 주문서 코드가 대응한다.

| 기능 | 레거시 주문서 원문 | 현재 주문서 |
|---|---|---|
| 상업 리모컨 모델 선택 | `tools/legacy-gas/거래처 발송 주문서/index.html:2206-2222` | `order-app/index.html:2476-2497` |
| `RENEW_FILTER_MAP` | 레거시 `:2332` | 현재 `:2606-2609` |
| 상업 옵션 배열 | 레거시 `:4050-4053` | 현재 `:4348-4350` |
| HOME 옵션 배열 | 레거시 `:4726-4727` | 현재 `:5154-5155` |
| SINGLE 옵션 배열 | 레거시 `:4736,4739` | 현재 `:5164,5167-5169` |
| HOME 리모컨 lookup | 레거시 `:5036-5037` | 현재 `:5489-5509` |
| `PUMP_MAP` | 레거시 `:5217-5223` | 현재 `:5786-5793` |
| 분기관 선택 | 레거시 `:5278` | 현재 `:5855` 및 `:7836-7842` |
| 판넬 모델표 | 레거시 `:5368-5422` | 현재 `:5947-6005` |

종합견적서도 동일 계보를 가진다: `tools/legacy-gas/종합견적서/index.html:3687-3703`(리모컨), `:6198-6203`(상업 옵션), `:7372-7375`(HOME), `:7413,7416`(SINGLE), `:7822-7823`(리모컨), `:8024-8030`(펌프), `:8186-8240`(판넬).

따라서 “레거시 호환”은 모델표를 영구 유지할 근거가 아니다. 레거시 결과를 golden으로 보존하면서 데이터 관계로 같은 결과를 내야 한다.

## 7. 실데이터 실측

### 7.1 노출 상품과 가격 채움

활성(`status=ACTIVE`, soft-delete 제외) product_db:

| 카테고리/용도 | 상품 수 | release/delivery 둘 다 채움 | panel_type 채움 | remote_type 채움 |
|---|---:|---:|---:|---:|
| COMMERCIAL_MULTI / BOTH | 321 | 321 | 12 | 1 |
| HOME_MULTI / BOTH | 106 | 106 | 30 | 7 |
| OLD / BOTH | 37 | 37 | 8 | 0 |
| SINGLE_PART / NONE | 346 | 346 | 8 | 8 |
| SINGLE_SET / BOTH | 209 | 209 | 0 | 1 |

PARTNER_ORDER 노출 행: COMMERCIAL_MULTI 416, HOME_MULTI 123, LEGACY 40, SINGLE_SET 288.

### 7.2 구성품 종류·변형·납품가 채움

| 영역/종류 | 행 | 세트 | variant 채움 | shape 채움 | context delivery 채움 |
|---|---:|---:|---:|---:|---:|
| COMMERCIAL_MULTI OUTDOOR | 137 | 72 | 1 | 0 | 0 |
| SINGLE ACCESSORY | 67 | 67 | 67 | 0 | 0 |
| SINGLE INDOOR | 271 | 271 | 271 | 0 | 0 |
| SINGLE MATERIAL | 273 | 206 | 273 | 0 | 0 |
| SINGLE OUTDOOR | 271 | 271 | 271 | 0 | 0 |
| SINGLE PANEL | 250 | 58 | 250 | 70 | 58 |
| SINGLE REMOTE | 315 | 154 | 315 | 0 | 250 |

활성 상품으로 제한한 옵션 영향:

| 옵션 | 전체 행/세트 | 활성 세트 |
|---|---:|---:|
| PANEL 기본 | 68 / 58 | 58 |
| PANEL 공청 | 68 / 58 | 58 |
| PANEL 블랙 | 57 / 47 | 47 |
| PANEL 승강 | 57 / 47 | 47 |
| REMOTE 기본 | 188 / 154 | 127 |
| REMOTE 유선 | 62 / 62 | 59 |
| **REMOTE 컬러** | **65 / 65** | **62** |
| MATERIAL 자재 | 273 / 206 | 142 |
| PANEL/REMOTE/MATERIAL 중 하나 이상 | — | **204세트** |

질문의 핵심인 “컬러유선 같은 변형이 DB에 있는가”에 대한 답은 **있다: `component_variant='컬러'` 65행·65세트, 활성 62세트, 구성품 모델 1종 `AWR-WG00N`**이다. 다만 `products.remote_type`에는 `AWR-WG00N`이 `무선`으로 잘못 분류돼 있어 variant를 우선해야 한다.

HOME에는 bundle component가 0건이고, COMMERCIAL에는 OUTDOOR 137행만 있으며 PANEL/REMOTE 연결은 0건이다. 그러므로 HOME/COMMERCIAL 하드코딩을 먼저 걷으면 기능이 사라진다.

### 7.3 수량동기화 설정 채움률

활성 규칙은 단 1개:

| rule_key | category | source | target | condition | target variant | target shape |
|---|---|---:|---:|---|---:|---:|
| `UI_HOME_MULTI_AM052BN6PBH1` | HOME_MULTI | 1 | 3 | `{}` | 0/3 | 0/3 |

주문서의 20개 수량 규칙군과 비교하면 규칙 수 기준 1/20(5%)이며, 현재 1개도 옵션 축 연결은 0%다. `quantitySync.ts`가 요구하는 SINGLE S-03은 DB에 없다.

### 7.4 기본값 설정

`dc_config_db.estimate_configs` 활성 1행:

- `home_default_panel`, `single_default_wired_remote`, `single_default_panel`: 0/1 채움
- `single_panel_shape='원형'`, `single_material_inclusion='별도'`: 1/1 채움
- 주문서 bootstrap cache의 `homeDefaults`, `singleDefaults`는 둘 다 `{}`

따라서 주문서 `index.html:5168`의 원형 기본값은 DB와 현재 값만 같을 뿐 DB를 읽은 결과가 아니다.

### 7.5 실제 주문 영향

`partner_order_db` soft-delete 제외 실측:

- 주문 5건, 주문라인 11건
- 옵션성 품명(리모컨/판넬/분기관/호스/받침/발통/드레인펌프) 5라인·3주문
- 서버 warehouse 예외 32모델 중 실제 주문 1라인·1주문

하드코딩 제거는 단순 미사용 코드 정리가 아니며 현존 주문 재현에도 영향을 준다.

## 8. 【격차】 더 보내야 할 필드·더 채워야 할 설정·고쳐야 할 함수

### 8.1 서버가 더 보내야 할 필드

1. `componentRows()`에 `componentShape`, `contextDeliveryPrice`, `displayOrder` 추가
2. 상품행에 `panelType`, `remoteType`, 안정된 product/category code 추가
3. bootstrap에 옵션 정의 축 추가: `kind, variant, shape, label, active, isDefault, displayOrder, allowExclude`
4. bootstrap 또는 같은 초기화 묶음에 quantity rule/source/target 포함
5. config DB 기본값을 `homeDefaults/singleDefaults`의 실제 소비 키로 명시 변환

### 8.2 DB에 더 채워야 할 설정

- HOME 구성품 관계: 현재 0건 — #1272 이전 결과로 채워야 함
- COMMERCIAL PANEL/REMOTE/HOSE/PUMP/FOOT 관계: 현재 OUTDOOR 외 0건
- 수량 규칙: 20규칙군 대비 활성 1개, 즉 최소 **19규칙군 부족**. 기존 1개도 옵션 메타 0/3
- 기본 옵션: panel/remote 기본값 3컬럼 모두 빈 값
- SINGLE `컬러` 65세트는 이미 존재하므로 삭제 전에 bootstrap 소비만 연결하면 됨
- `AWR-WG00N.remote_type='무선'` 분류 오염 1모델 보정

### 8.3 고쳐야 할 함수/지점

- 서버: `BootstrapService.componentRows()` 및 multi/single row 변환
- 클라이언트 API: `samhanApi.fetchQuantitySyncRules()`의 HOME_MULTI 고정 필터 제거
- 규칙 선택: `quantitySync.selectSingleS03Rule()` 단일 규칙 전용을 일반화
- 실제 계산: `index.html`의 HOME/SINGLE/COMMERCIAL 재계산 함수가 rule 결과를 소비하도록 전환
- 옵션 UI: `renderCommercialSpecSection_()`, `renderSpecPanel_()` 주변 9개 배열을 서버 옵션 축으로 렌더
- 가격: I형 호스 5개 상수와 배분/할인 상수를 상품·정책 설정으로 전환
- 두 웹 공통: 같은 option DTO/consumer를 공유해 배열 복제를 없앰

## 9. 이미 만들어진 것과 중복 방지

GitHub에서 OPEN/CLOSED를 모두 검색하고 PR REST 메타/변경파일을 확인했다.

| 항목 | 상태 | 정찰 판정 |
|---|---|---|
| Issue #896 | CLOSED | 수량동기화 설정화 명분은 구현됐지만 main 사용자 경로는 shadow 저장에 그침. CLOSED를 완료로 간주하면 안 되는 반례 |
| PR #1272 | OPEN, `feat/category-settings-migration` | V47과 1,584행/343세트 이전 계획. 옵션 데이터의 선행 소유자 |
| PR #1268 | OPEN, `feat/option-naming-unify` | 수량규칙+옵션 연결 트랙. 일부 배열 유도 코드는 있으나 모델표/정규식·형상/자재 배열이 남고, 현재 DB 규칙 1개만으로는 완결 불가 |
| PR #1265 | OPEN, `fix/web-to-slip-fidelity` | 웹 행을 전표로 그대로 보내는 payload/BootstrapService 트랙. 옵션 목록 생성의 소유자는 아님 |
| PR #1269 | 별도 브랜치 | main에 없는 `LEGACY_COMPONENT_DELIVERY`를 설정보다 우선시킨 회귀. 주문서 정리 시 같은 우선순위 금지 |
| Issue #1089/#1100/#1114/#1140/#1143 | CLOSED | 기존 결정·명칭·구성품/가격 작업. 회귀 기준으로 참조하되 “운영 소비 완료” 증거로 보지 않음 |

## 10. 걷어낼 때 깨질 수 있는 것

| 제거 대상 | 즉시 삭제 시 영향 |
|---|---|
| 9개 옵션 배열 | SINGLE은 활성 204 옵션 세트의 선택 UI를 재구성할 계약이 없어짐. HOME/COMM은 DB 관계가 0이라 옵션 자체 소실 |
| 컬러 리모컨 모델표 | DB에는 65세트(활성 62)가 있으나 bootstrap 옵션축을 만들지 않으면 `컬러` 선택이 모델로 연결되지 않음 |
| HOME/COMM 정규식 | HOME 106 활성 상품, COMM 321 활성 상품의 부자재 자동구성이 중단될 수 있음 |
| 수량규칙 20군 | DB 활성 1군뿐이며 그것도 실제 consumer 불일치. 나머지 자동수량 소실 |
| I형 호스 8,000원 | 구성품 context 가격이 전달되지 않아 화면 금액 0/fallback 가능 |
| warehouse 예외표 | 실제 주문 1라인·1주문이 현재 예외 대상. 분류 보정 전 삭제 시 창고가 바뀔 수 있음 |
| tutorial 모델 9개 | 카탈로그 교체 시 튜토리얼이 품목을 찾지 못함; 동적 selector로 먼저 교체 필요 |

## 11. 【선택지】

### ① 단계적 설정 전환 — 권장

1. #1272를 데이터/분류/구성품 관계의 선행 PR로 완결한다. HOME/COMM 옵션 관계와 SINGLE 기존 65 컬러 세트를 보존 검증한다.
2. #1268을 #1272 위로 rebase하고 두 웹 공통 옵션 DTO + bootstrap 필드 + 규칙 consumer를 한 트랙에서 완결한다. 9개 배열, 29 모델표, 현행 표현 가능한 18 수량규칙군을 DB 소비 후 제거한다.
3. H-07/C-09 비선형 규칙과 warehouse 외부계약은 새 후속 트랙으로 분리한다.
4. #1265는 웹→전표 fidelity 책임만 유지하고 옵션 생성 로직을 중복 구현하지 않는다.

장점: DB 채움 확인 뒤 코드 제거가 가능하고, 현재 204 활성 옵션 세트 및 실제 주문을 보호한다. 단점: PR 순서 의존이 생긴다.

### ② 새 통합 PR이 #1272/#1268을 대체

V47 데이터 이전, bootstrap option contract, 두 웹 UI, quantity consumer, 회귀 QA를 하나의 새 PR로 묶고 기존 두 PR을 종료한다.

장점: 최종 계약이 한 번에 보인다. 단점: 1,584행 데이터 이전과 2개 대형 웹 회귀 범위가 합쳐져 리뷰·rollback 위험이 가장 크다.

### ③ 하지 않는다

단기 운영 동결만 목적이라면 현재 결과를 유지할 수 있다. 서버 최종 가격 권위가 있어 주문 합계의 일부 위험은 줄어든다.

그러나 개발책임자의 “하드코딩만 안 되면 돼”, “견적품목 옵션이 제대로 동작” 요구에는 부합하지 않는다. DB 변경이 9개 옵션 배열과 20개 수량규칙군에 반영되지 않고, 두 웹 기본값도 갈라질 수 있으므로 **지속 운영 선택지로는 정당화되지 않는다**.

## 12. 【PM 권장】 및 【PR 배치】

**PM 권장: 선택지 ①.** 근거는 세 가지다.

1. 옵션 데이터는 전무하지 않다. SINGLE 컬러 65세트 등 이미 설정된 값을 살려야 하므로 새 모델표를 만들 이유가 없다.
2. 반대로 HOME/COMM 및 규칙 데이터는 부족하다. 코드부터 지우면 실제 기능이 사라진다.
3. #1272가 데이터 소유권, #1268이 옵션/수량 consumer 소유권을 이미 갖는다. 새 중복 구현보다 두 PR을 순서대로 정상화하는 편이 안전하다.

PR 배치:

- **#1272 안**: 카테고리별 설정/구성품 관계 이전, variant/kind/shape/default/order 데이터 완결, `AWR-WG00N` 분류 보정
- **#1268 안**: bootstrap option/rule 필드, 두 웹 공통 동적 옵션 렌더, 표현 가능한 수량규칙 consumer, 배열·모델표 제거
- **#1265 유지**: 선택 결과/라인을 전표로 그대로 보존하는 계약만 담당
- **새 후속 트랙**: H-07/C-09 규칙 DSL 확장, warehouse 외부 코드 설정화/분류 예외 제거, tutorial selector 동적화

## 13. 정찰 한계와 미조사

- 공유 partner-order-service가 미기동이라 실제 HTTP 200 bootstrap 본문은 **미조사**다. main 변환 코드와 cache DB로 계약을 확정했다.
- PR #1268/#1272 브랜치의 전체 브라우저 QA는 **미조사**다. REST 메타·본문·diff만 확인했다.
- 외부 Google Sheet 원본의 현재 값과 ECOUNT 창고 마스터는 **미조사**다. 코드상의 외부 포맷/코드 계약만 판정했다.
- 다른 정찰이 맡은 estimate-app 자체 전수 하드코딩 수는 **미조사**다. 주문서와 같은 옵션 축 및 지시된 모델/가격 지점만 대조했다.

## 14. 프로세스·컨테이너 회수

- 이 정찰에서 기동한 장기 프로세스: 0
- 회수 대상/회수 완료: 0/0
- 잔여 정찰 프로세스: 0
- 공유 컨테이너: 시작 24개, 종료 **24개**. 중지·재시작·설정 변경 없음
- 별도 정찰 소유 컨테이너는 최종 재확인 시 `sol1265r2-pg` 1개였다. 시작 시 있던 `sol1266-reverdict2-cutoff-pg`와 게시 직후 잠시 보인 `hardcore_tu`/`testcontainers-ryuk-...`는 각 소유 라운드가 회수했다. 모두 미접촉

## 15. 최종 `git status --porcelain` 원문

```text
 M docs/qa/coedit-s3-1-partner-order/step5-01-partner-orders-list.png
 M docs/qa/coedit-s3-1-partner-order/step5-02-partner-order-detail-top.png
 M docs/qa/coedit-s3-1-partner-order/step5-03-partner-order-collab-panel.png
 M docs/qa/coedit-s3-1-partner-order/step5-04-partner-order-full-page.png
 M docs/qa/coedit-s3-1-partner-order/step5-05-new-order-no-collab-panel.png
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
?? clients/desktop/scripts/.s10-junction-5kYKeH/
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
?? docs/dev-reports/2026-08-18-order-app-hardcoding-recon/
?? docs/qa/2026-08-15-order-approval-real-qa/
?? docs/qa/2026-08-17-category-settings-migration-recon-real-qa/
?? docs/qa/2026-08-17-option-price-impact-real-qa/
?? docs/qa/2026-08-17-p1-02-real-qa/
?? docs/qa/2026-08-17-p1-03-real-qa/
?? docs/qa/2026-08-17-price-variant-option-recon-real-qa/
?? docs/qa/2026-08-17-qty-sync-recon-real-qa/
```
