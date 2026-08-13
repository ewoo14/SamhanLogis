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
| 미분류 | 2,126 | 0 (V38 미적용) | 공유 환경 판정 불가 |
| `has_variable_discount=true` | 803 | 803 | 통과 |
| `has_variable_discount=false` | 2,281 | 2,281 | 통과 |
| `has_variable_discount IS NULL` | 0 | 0 | 통과 |

공유 `product_db.flyway_schema_history`의 최대 성공 버전은 **V37**이다. 현재 활성 제품의 `category_id` 연결은 `ECOUNT_MIG2` 1,963건과 `INDOOR_WALL` 1,121건뿐이며, `OUTDOOR`, `INDOOR`, `INDOOR_CEILING`, `UNCLASSIFIED` 연결은 0건이다. 따라서 공유 DB에서 S1 카테고리 축을 기준으로 실외기·실내기·미분류를 세는 것은 불가능하다. 개발책임자가 제시한 212/417/2,126은 이 공유 DB의 실측값으로 사용하지 않는다.

### 0.2 실제 주문 경로 표본

공유 `partner_order_db`에는 활성 주문 4건, 활성 라인 8건만 있다. 라인 카테고리 키는 `homemulti` 6건, `singleSets` 2건이다. 기존 라인 중 이름상 실외기인 2라인도 공유 제품 DB에서는 `INDOOR_WALL`로 연결되어 있어 현재 카테고리 축을 신뢰할 수 없다. 이 표본으로는 다음의 발화 조합을 실제 주문 경로에서 판정할 수 없다.

```text
둘 다 없음+변동DC 대상 · 둘 다 없음+변동DC 비대상 · 미분류만 ·
미분류+변동DC · 미분류+실외기 · 전열교환기만 · 빈 주문
```

표본 0 또는 판정 불가를 결함 없음으로 세지 않는다. V38을 공유 DB에 적용하거나 관리자 화면에서 분류·주문을 생성하면 게이트를 진행할 수 있지만, 이 트랙의 **공유 DB write·배포 금지**와 충돌하므로 실행하지 않았다. DB 직접 INSERT도 하지 않았다.

### 0.3 현행 미적용 원문

현재 주문 가격 계산의 실제 입력과 분기에는 40% 또는 물리 제품구분 판정이 없다.

```text
services/dc-config-service/.../dto/PriceCalculationRequest.java
  Line: lineId, modelCode, listPrice, category, quantity, option flags,
        fixedDiscountRate, hasVariableDiscount
  → OUTDOOR / INDOOR / UNCLASSIFIED 필드 없음

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

재개 조건은 (1) V38이 실제 제품 DB에 적용되어 S1 카테고리 분포가 복원되고, (2) 관리자 실 경로로 미분류·실외기·실내기·변동DC 조합을 만들 수 있으며, (3) 그 주문을 공유 DB에 남기지 않고 회수할 수 있는 QA 격리 경로가 확보되는 것이다. 그 뒤에만 단일 규칙 지점 설계와 구현 승인을 진행한다.

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

---

## 2026-08-11 S2 재개 구현·격리 검증 — 최신 추가

> 작업 기준: PR #1166, 개발책임자가 지정한 HEAD `92d9eb8e7`.
> 이 절은 위의 중단 기록에 이어지는 S2 실행 결과이며, 기존 중단 사유를 삭제하지 않는다.

### 9. 결론

S2를 구현했다. 주문 가격 계산의 단일 지점에서만 다음 규칙을 판정한다.

```text
(OUTDOOR 없음 AND INDOOR 계열 없음)
AND 모든 주문 라인이 미분류/미지 코드가 아님
AND 변동DC 대상 라인
→ 해당 변동DC 대상 라인에만 40%
```

실외기·실내기가 하나라도 있거나, 미분류·미지 코드가 한 라인이라도 섞이면 40% 규칙 전체를 차단하고 기존 할인율을 사용한다. 고정 DC는 40%보다 우선한다. 빈 주문은 규칙을 발화시키지 않는다.

견적 코드·API·화면은 수정하지 않았다. 공유 DB에 V38을 적용하지 않았고, 공유 DB에 표본 주문을 생성하지 않았으며, 배포도 하지 않았다.

### 10. 격리 환경과 V38 적용 원문

#### 10.1 환경

- `product-service`: `AbstractPostgresIT`의 Testcontainers `postgres:16-alpine`, 테스트 전용 `product_db`, 동적 host port.
- `partner-order-service`: 별도 `AbstractPostgresIT` Testcontainers PostgreSQL, 테스트 전용 `partner_order_db`, 동적 host port.
- Eureka/공유 서비스 의존성은 테스트 설정에서 비활성화하고 외부 client는 `@MockBean`으로 격리했다.
- 호스트의 공유 `product_db`/`partner_order_db`에는 연결하지 않았다.

실행 원문:

```powershell
.\gradlew.bat :services:product-service:test --tests 'db.migration.V38__ProductCategoryBackfillTest'
```

핵심 로그와 결과:

```text
Successfully validated 38 migrations
Migrating schema "public" to version "38 - ProductCategoryBackfill"
Successfully applied 38 migrations ... now at version v38
tests=6 skipped=0 failures=0 errors=0
```

#### 10.2 V38 원문

이 PR의 product-service migration 최대 번호는 V37이므로 V38이 적용 대상이다. V38은 SQL 파일이 아니라 다음 Java migration 원문이다.

```java
public class V38__ProductCategoryBackfill extends BaseJavaMigration {
    static final String MIGRATION_KEY = "V38-PRODUCT-CATEGORY-BACKFILL";

    @Override
    public void migrate(Context context) throws Exception {
        apply(context.getConnection());
    }

    static void apply(Connection connection) throws SQLException {
        createAuditTable(connection);
        ensureUnregisteredRoot(connection);
        Map<String, UUID> categoryIds = loadCategoryIds(connection);
        List<Candidate> candidates = loadCandidates(connection);
        insertAudits(connection, candidates, categoryIds);
        applyAuditedChanges(connection);
    }
}
```

실제 파일은 `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java`이다. 감사 테이블을 먼저 만들고 `UNCLASSIFIED` 루트를 보장한 뒤 `ProductNameCategoryClassifier`로 분류한다. 수동 분류(`classification_manual`) 품목은 제외하고, 변경 전·후 category를 감사행으로 남긴 뒤 적용한다. 따라서 이번 S2는 V38을 새로 만들거나 V39를 추가하지 않았다.

### 11. 현행 미적용 원문과 구현 위치

재개 전 현행은 다음과 같았다.

```text
PriceCalculationRequest.Line
  → fixedDiscountRate, hasVariableDiscount만 존재

PriceCalculationService.pickCategoryRate(...)
  → fixedDiscountRate 우선
  → hasVariableDiscount=false 이면 0
  → HOMEMULTI / COMMERCIAL_MULTI 전역율
  → 40% 분기 없음

PartnerOrderConfirmService
  → ProductSummary에서 categoryKey와 기존 할인 필드만 DcConfigClient.PriceLine에 전달
  → 물리 category code 전달 없음
```

구현은 다음 단일 흐름으로 연결했다.

```text
product ProductSummaryResponse.physicalCategoryCode
  → partner-order ProductSummary
  → PartnerOrderConfirmService
  → DcConfigClient.PriceLine.physicalCategoryCode
  → dc-config PriceCalculationRequest.Line
  → PriceCalculationService의 단일 40% 판정
```

40% 상수는 `new BigDecimal("0.40")`이다. `double`은 사용하지 않았다. 허용된 물리 코드 목록 밖의 값, null, blank, `UNCLASSIFIED`는 모두 판정 불가로 취급해 규칙을 차단한다. 실외기 코드는 `OUTDOOR`, 실내기 계열은 `INDOOR`, `INDOOR_WALL`, `INDOOR_CEILING`으로 차단한다. `HVAC`(전열교환기)는 실외기·실내기 계열이 아니므로 변동DC 대상이면 40% 대상이 된다.

판정 지점은 `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java` 한 곳이다. 화면에 40을 별도로 넣지 않았다. 견적 caller가 물리 코드 없이 이 공통 DTO를 호출하더라도 미지/미분류로 차단되며, 견적 코드 자체에는 변경이 없다.

### 12. 실 주문 경로 표본 생성 원문

표본은 격리 `partner-order-service`의 실제 HTTP route로 만들었다. DB 직접 INSERT는 하지 않았다.

1. 임시저장 생성:

```http
POST /api/v1/partner-orders/drafts
X-Partner-Code: P-S2-HTTP
X-User-Id: s2-api-master
X-User-Role: MASTER
X-Is-System-Master: true
Content-Type: application/json

{"label":"S2 격리 API 표본","payloadJson":"{}"}
```

2. 주문 확정:

```http
POST /api/v1/partner-orders/{draftId}/confirm
X-Partner-Code: P-S2-HTTP
X-Biz-Code: 1234567890
X-User-Id: s2-api-master
X-User-Name: S2 격리 테스트
X-User-Role: MASTER
X-Is-System-Master: true
Content-Type: application/json

{"lines":[{"productId":"<isolated-product-id>","categoryKey":"commercialParts","quantity":1,"remark":null}]}
```

실행 테스트는 `PartnerOrderConfirmServiceIT.confirm_api_creates_isolated_order_through_the_real_order_route`이다. API가 실제 draft를 만들고 confirm service를 호출했으며, confirm service가 `DcConfigClient.PriceLine.physicalCategoryCode=HVAC`를 단일 가격 계산 경로로 전달한 것을 캡처했다. 외부 product/dc-config HTTP 서버는 격리 테스트에서 mock으로 대체했으므로 공유 서비스에 요청하지 않았다. 가격 수치 자체는 아래 dc-config 계산 테스트에서 실제 `PriceCalculationService`를 실행해 검증했다.

### 13. 조합별 실제 할인율

계산 테스트 설정은 `homeDiscountRate=0.0700`, rounding 0원, 변동DC 대상 line의 list price 1,000,000원이다. 기존 7% 결과는 930,000원, 새 40% 결과는 600,000원이다.

| 조합 | 물리 코드 / 변동DC | 실제 적용률 | 결과 |
|---|---|---:|---:|
| 실외기만 | `OUTDOOR` / true | 7.00% | 930,000원 |
| 실내기만 | `INDOOR_WALL` / true | 7.00% | 930,000원 |
| 실외기+실내기 | `OUTDOOR` + `INDOOR` / true | 7.00% | 930,000원 |
| 둘 다 없음 + 변동DC | `HVAC` / true | **40.00%** | **600,000원** |
| 둘 다 없음 + 변동DC 아님 | `PIPING` / false | 0.00% | 1,000,000원 |
| 미분류만 | `UNCLASSIFIED` / true | 7.00% | 930,000원 |
| 미분류+변동DC | `UNCLASSIFIED` + `HVAC` / true | 7.00% | 930,000원 |
| 미분류+실외기 | `UNCLASSIFIED` + `OUTDOOR` / true | 7.00% | 930,000원 |
| 전열교환기만 | `HVAC` / true | **40.00%** | **600,000원** |
| 빈 주문 | line 없음 | 발화 안 함 | 총 할인 0원 |

추가 표적 검증:

- 고정 DC 25% + `HVAC`/true → 25.00%, 750,000원. 40%가 고정 DC를 덮지 않는다.
- `UNCLASSIFIED`가 섞인 주문의 모든 line → 기존 7%/기존 0%만 적용되며 40%는 없다.
- 알 수 없는 미래 코드 → 기존 7%로 fail-safe, 40% 없음.
- 정상 변동DC 대상이 아닌 line → 0%, 40% 없음.

### 14. RED-B 및 회귀 결과

| 불변식 | 결과 |
|---|---|
| 실외기가 있는 주문의 할인율 불변 | 통과: 7.00% |
| 실내기가 있는 주문의 할인율 불변 | 통과: 7.00% |
| 변동DC 대상이 아닌 품목에 40% 금지 | 통과: 0.00% |
| 미분류만/미분류 혼합 주문 차단 | 통과: 기존율, 40% 없음 |
| 정상 할인 전체 차단 금지 | 통과: 기존 branch 및 전체 module test green |
| 견적 경로 무변경 | 통과: estimate 소스/API/화면 변경 없음 |
| 정액DC 495,000 → 420,750 | 통과: 해당 S=15% 경로를 수정하지 않았고 기존 회귀 유지 |
| S1 product-service 781 | 통과 |
| S1 Desktop 152 | 이번 변경에서 Desktop 소스 미수정; 기존 회귀 범위 유지 |
| S1 미분류 필터 3,084 → 2,126 → 해제 후 3,084 | product 분류/필터 코드를 수정하지 않았고 V38 격리 migration 회귀 통과 |

### 15. 실행한 검증과 결과

```text
:services:dc-config-service:test       77 tests, skipped=0, failures=0, errors=0
:services:partner-order-service:test  520 tests, skipped=0, failures=0, errors=0
:services:product-service:test         781 tests, skipped=0, failures=0, errors=0
```

세 모듈 합계 **1,378 tests**, skipped/failures/errors 모두 0이다. 추가 표적 결과는 V38 migration 6건, product internal lookup 10건, order confirm IT 15건, product/dc client wire test 13건, price calculation 16건이다. Gradle은 성공 종료했으며, partner-order 테스트 종료 시 일부 metrics/Hikari shutdown 로그가 출력되지만 테스트 XML 결과는 실패 0건이다.

### 16. 공유 DB 라이브 QA 보류

공유 DB 라이브 QA는 실행하지 않았다. 공유 DB에 V38을 올리지 않았고, 공유 DB에 표본 주문을 만들거나 삭제하지 않았으며, 배포하지 않았다.

**공유 DB 라이브 QA는 머지 후 배포하고 확인한다.**
