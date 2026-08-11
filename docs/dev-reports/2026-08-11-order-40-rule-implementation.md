# 주문 40% 규칙 이식 — 착수 전 검증 및 중단 보고

## 0. 2026-08-11 S2 재실측 정정 — 이 블록이 기존 본문보다 우선한다

> 재측정 시각: 2026-08-11 KST
> HEAD: `0f96558dd`
> 범위: 주문 경로만. 공유 DB 조회는 모두 `BEGIN; SET TRANSACTION READ ONLY; ... COMMIT;`으로 수행했다.
> 결론: **판정 불가 — 구현 중단.** S1 코드와 격리 검증은 존재하지만, 현재 공유 실행 환경에는 S1의 V38 백필이 적용되지 않아 실제 주문 조합을 안전하게 만들고 밟을 수 없다.

### 0.1 발화 조건 카운트

| 항목 | S1 격리 검증/코드 기준 | 현재 공유 DB 실측 | 판정 |
|---|---:|---:|---|
| 활성 품목 | 3,084 | 3,084 | 분모 일치 |
| 실외기 | 201 | 0 (V38 미적용) | 공유 환경 판정 불가 |
| 실내기 계열 | 516 (`INDOOR` 415 + `INDOOR_WALL` 40 + `INDOOR_CEILING` 61) | 0 (V38 미적용) | 공유 환경 판정 불가 |
| 미등록 | 2,126 | 0 (V38 미적용) | 공유 환경 판정 불가 |
| `has_variable_discount=true` | 803 | 803 | 통과 |
| `has_variable_discount=false` | 2,281 | 2,281 | 통과 |
| `has_variable_discount IS NULL` | 0 | 0 | 통과 |

공유 `product_db.flyway_schema_history`의 최대 성공 버전은 **V37**이다. 현재 활성 제품의 `category_id` 연결은 `ECOUNT_MIG2` 1,963건과 `INDOOR_WALL` 1,121건뿐이며, `OUTDOOR`, `INDOOR`, `INDOOR_CEILING`, `UNREGISTERED` 연결은 0건이다. 따라서 공유 DB에서 S1 카테고리 축을 기준으로 실외기·실내기·미등록을 세는 것은 불가능하다. 개발책임자가 제시한 212/417/2,126은 이 공유 DB의 실측값으로 사용하지 않는다.

### 0.2 실제 주문 경로 표본

공유 `partner_order_db`에는 활성 주문 4건, 활성 라인 8건만 있다. 라인 카테고리 키는 `homemulti` 6건, `singleSets` 2건이다. 기존 라인 중 이름상 실외기인 2라인도 공유 제품 DB에서는 `INDOOR_WALL`로 연결되어 있어 현재 카테고리 축을 신뢰할 수 없다. 이 표본으로는 다음의 발화 조합을 실제 주문 경로에서 판정할 수 없다.

```text
둘 다 없음+변동DC 대상 · 둘 다 없음+변동DC 비대상 · 미등록만 ·
미등록+변동DC · 미등록+실외기 · 전열교환기만 · 빈 주문
```

표본 0 또는 판정 불가를 결함 없음으로 세지 않는다. V38을 공유 DB에 적용하거나 관리자 화면에서 분류·주문을 생성하면 게이트를 진행할 수 있지만, 이 트랙의 **공유 DB write·배포 금지**와 충돌하므로 실행하지 않았다. DB 직접 INSERT도 하지 않았다.

### 0.3 현행 미적용 원문

현재 주문 가격 계산의 실제 입력과 분기에는 40% 또는 물리 제품구분 판정이 없다.

```text
services/dc-config-service/.../dto/PriceCalculationRequest.java
  Line: lineId, modelCode, listPrice, category, quantity, option flags,
        fixedDiscountRate, hasVariableDiscount
  → OUTDOOR / INDOOR / UNREGISTERED 필드 없음

services/dc-config-service/.../service/PriceCalculationService.java
  pickCategoryRate(...)
  → fixedDiscountRate 우선
  → hasVariableDiscount=false 이면 0
  → HOMEMULTI / COMMERCIAL_MULTI 전역율
  → 그 외 0
  → 40% 분기 없음

services/partner-order-service/.../PartnerOrderConfirmService.java:201-207
  → 위 PriceLine 을 만들 때 categoryKey와 hasVariableDiscount만 전달
  → S1 물리 제품구분 전달 없음
```

이는 RED-A의 “현행에서 둘 다 없음+변동DC 대상 주문에 40%가 적용되지 않는다”를 소스상 재현하는 원문이다. 다만 공유 실행 환경에서 해당 주문을 안전하게 생성할 제품분류 축이 V38 미적용 상태이므로, 이 시점에 RED-A를 실제 가격값으로 밟았다고 주장하지 않는다.

### 0.4 이번 재실측의 결론과 신규 파일

- **구현 중단:** 제품 마스터의 S1 물리 축이 공유 주문 경로에 실측 가능한 상태가 아니다.
- **견적 경로:** 코드·API·화면을 변경하지 않았다.
- **기존 할인 계산·정액DC:** 변경하지 않았다. `495,000 → 420,750` 계산도 변경하지 않았다.
- **라이브 Playwright:** 40% 적용/미적용 주문을 실제로 만들 수 없어 실행하지 않았다. 실패 원문이 아니라 **판정 불가 사유**를 기록한다.
- **신규 파일:** 없음. 이 기존 보고서만 재실측 정정 블록을 추가했다.

재개 조건은 (1) V38이 실제 제품 DB에 적용되어 S1 카테고리 분포가 복원되고, (2) 관리자 실 경로로 미등록·실외기·실내기·변동DC 조합을 만들 수 있으며, (3) 그 주문을 공유 DB에 남기지 않고 회수할 수 있는 QA 격리 경로가 확보되는 것이다. 그 뒤에만 단일 규칙 지점 설계와 구현 승인을 진행한다.

> 이하 기존 본문은 V38 적용 전 정찰 기록이다. 현재 재실측 결과와 충돌하는 수치는 이 0장 표를 정본으로 한다.

> 측정 일시: 2026-08-11 KST  
> 범위: 주문 경로만. 모든 DB 조회는 `BEGIN TRANSACTION READ ONLY`로 실행했다.  
> 결론: 개발책임자 지정 착수 전 확인 2·3이 불일치하므로 **구현하지 않고 중단**한다.

## 1. 결론

`products.has_variable_discount`는 실제로 채워져 있어 변동DC 대상 품목의 원천은 확정할 수 있다. 그러나 주문이 소비하는 데이터에는 실외기·실내기·전열교환기(ERV)를 판정할 정규 축이 없고, 후보로 제시된 `component_kind`는 세트 구성품 연결에만 존재한다. 레거시 문자열 집합과도 1:1 대응하지 않는다.

따라서 현재 상태에서 40% 규칙을 넣으면 다음 둘 중 하나가 된다.

1. 레거시 문자열 매칭을 주문 서버에 다시 도입한다. 개발책임자 지시(우리 축으로 정규화)에 위배한다.
2. 불완전한 `component_kind`만 사용한다. 실외기 194품목·실내기 347품목을 잘못 판정할 수 있어 정상 할인을 막는 위험이 있다.

두 선택 모두 금지 조건에 해당하므로 코드, 마이그레이션, 견적 경로는 수정하지 않았다.

## 2. 착수 전 확인 결과

| 확인 | 결과 | 실측 근거 | 판정 |
|---|---|---|---|
| 1. 변동DC 대상 품목 원천 | `product_db.products.has_variable_discount` | 활성 3,084건 중 `true` 803건, `false` 2,281건, `null` 0건 | 통과 |
| 2. 실외기 없음 AND 실내기 없음 정규 판정 | 주문 품목의 정규 축 없음 | `component_kind`는 `bundle_component`에만 존재하고, 주문 `ProductSummary`·`partner_order_lines`에는 없음. 레거시 집합과 불일치도 실측됨 | **중단** |
| 3. ERV 분모 제외 대응 | 대응 축 없음 | `ComponentKind` enum에 `ERV`가 없고, 주문 wire/저장 모델에도 ERV 필드가 없음 | **중단** |

### 2.1 변동DC 실데이터

```sql
SELECT count(*) AS active_products,
       count(*) FILTER (WHERE has_variable_discount IS TRUE) AS variable_discount_true,
       count(*) FILTER (WHERE has_variable_discount IS FALSE) AS variable_discount_false,
       count(*) FILTER (WHERE has_variable_discount IS NULL) AS variable_discount_null
FROM products
WHERE is_deleted=false AND deleted_at IS NULL;
```

| 활성 품목 | 변동DC 대상 | 비대상 | 공백 |
|---:|---:|---:|---:|
| 3,084 | 803 | 2,281 | 0 |

`has_variable_discount`는 이번 규칙의 대상 원천으로 사용할 수 있다. 다만 아래 장비 판정 축이 없으므로 이 값만으로는 규칙을 안전하게 발동할 수 없다.

## 3. 레거시 ↔ 우리 축 대응 대조

레거시 기준은 `품목명 + catM + catL`의 문자열에서 실외기/실내기/벽걸이/ERV를 판별한다. 비교를 위해 활성 제품 3,084건에서 같은 문자열 집합을 산출하고, 우리 데이터의 유일한 `component_kind` 후보와 `model_code = component_product_code`로 결합했다.

| 판정 대상 | 레거시 문자열 집합 | 우리 후보 축 | 우리 후보 실측 | 집합 불일치 |
|---|---|---|---:|---:|
| 실외기 | `실외기\|outdoor` | `bundle_component.component_kind=OUTDOOR` | 문자열 342건 / 축 158건 | 194건 |
| 실내기 | `실내기\|indoor\|벽걸이` (ERV 제외) | `bundle_component.component_kind=INDOOR` | 문자열 539건 / 축 192건 | 347건 |
| 전열교환기 | `전열교환기\|erv` | 없음 | 문자열 16건 / 축 0건 | 대응 불가 |

추가로 활성 품목 3,084건 중 **2,683건은 `bundle_component` 연결 자체가 없어** `component_kind`로 판정할 수 없다. 이는 `component_kind`가 제품 마스터의 본체 분류가 아니라 세트 구성품 관계의 속성이라는 뜻이다.

활성 `bundle_component` 행의 값도 다음 여섯 종류뿐이다.

| component_kind | 활성 연결 행 | 서로 다른 구성품 모델 |
|---|---:|---:|
| ACCESSORY | 81 | 21 |
| INDOOR | 271 | 192 |
| MATERIAL | 273 | 15 |
| OUTDOOR | 408 | 158 |
| PANEL | 250 | 16 |
| REMOTE | 315 | 12 |

`ERV`는 존재하지 않는다. `catL/catM/catS`는 제품에 연결돼 있지만 `classification` 테이블은 `id`, `cat_level`, `name` 중심의 자유 명칭 구조이며, 실외기·실내기·ERV를 의미하는 코드/enum 축은 제공하지 않는다. 이름을 다시 정규식으로 해석하는 방법은 레거시 문자열 매칭의 재도입이므로 채택하지 않았다.

## 4. 주문 경로에 실제로 전달되는 정보

`partner-order-service`가 사용하는 `ProductSummary` wire-format은 제품 식별·가격·`fixedDiscountRate`·`discountFlags`·`hasVariableDiscount`만 보낸다. `catL/catM/catS`, `componentKind`, ERV 판정값은 없다.

`partner_order_db.partner_order_lines`의 관련 열도 `product_id`, `product_name`뿐이며 component/discount 분류를 영속하지 않는다. 따라서 저장된 주문과 신규 주문 모두에서 장비 존재 여부를 결정할 서버 입력이 없다.

## 5. 규칙 단일화 지점

**없음 (중단).**

정규 장비 역할 축이 확정되기 전에는 40% 값을 어떤 계산 위치에도 추가하지 않는다. 같은 40%를 화면과 서버 양쪽에 넣어 분기시키지 않았고, 기존 할인 계산·정액DC 분류축(S>M>L)도 수정하지 않았다.

## 6. RED 원문 및 조합 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| RED-A: 둘 다 없음 + 변동DC 대상이면 40% | 미실행 | 장비 존재 여부를 안전하게 구성할 수 없어, 요구된 중단 조건 발동 |
| 실외기만 | 미실행 | OUTDOOR 축이 전 제품에 존재하지 않고 문자열 집합과 194건 불일치 |
| 실내기만 | 미실행 | INDOOR 축이 전 제품에 존재하지 않고 문자열 집합과 347건 불일치 |
| 실외기+실내기 | 미실행 | 위와 같음 |
| 둘 다 없음+변동DC | 미실행 | 위와 같음 |
| 둘 다 없음+변동DC 아님 | 미실행 | 위와 같음 |
| 전열교환기만 | 미실행 | ERV 정규 축 부재 |
| 전열교환기+변동DC 품목 | 미실행 | ERV 정규 축 부재 |
| 빈 주문 | 미실행 | 규칙 진입 자체를 구현하지 않음 |
| 정액DC 495,000 → 420,750 | 무변경 | 기존 정액DC 코드를 수정하지 않음 |
| 견적 경로 | 무변경 | `estimate` 코드·API·화면을 수정하지 않음 |

현행 재현도 같은 이유로 중단했다. 현재 주문 가격 요청에는 `hasVariableDiscount`는 있으나 실외기/실내기/ERV 정규 판정값이 없으므로, 실제 경로에서 조건을 정확히 충족하는 주문을 구성하거나 40% 미적용을 인과적으로 검증할 수 없다. 공유 DB 쓰기 금지 조건도 준수했다.

## 7. 실행한 검증

| 검증 | 결과 |
|---|---|
| `product_db` 읽기 전용 변동DC 분포 SQL | 성공: 3,084 / 803 / 2,281 / 0 |
| `product_db` 읽기 전용 레거시 문자열 ↔ component_kind 교차 대조 SQL | 성공: 실외기 불일치 194, 실내기 불일치 347, ERV 축 없음 |
| `partner_order_db` 읽기 전용 주문 라인 스키마 조회 | 성공: 장비 역할·ERV·할인 분류 영속 열 없음 |
| 코드 변경 후 단위/통합 테스트 | 해당 없음: 구현 중단으로 생산 코드 변경 0건 |

## 8. 재개에 필요한 결정

구현 재개 전, 제품 마스터에 주문용 **정규 장비 역할**을 어떤 방식으로 보존할지 결정이 필요하다. 최소한 `OUTDOOR`, `INDOOR`, `ERV`, `OTHER`를 구분하고, 주문 가격 계산에 그 역할과 `hasVariableDiscount`가 함께 전달돼야 한다. 이 결정과 기존 3,084품목에 대한 데이터 정합성 검증(문자열 집합 대비)을 마친 뒤에만 주문 전용 단일 규칙으로 40%를 구현할 수 있다.

견적 경로는 이 결정 및 후속 구현에서도 계속 범위 밖으로 유지한다.
