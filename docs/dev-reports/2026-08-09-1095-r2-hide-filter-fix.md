# PR #1133 / Issue #1095 — 단종·미판매 후보 필터 fix round 2

- 작업일: 2026-08-09 (KST)
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status`
- 기준 HEAD: `b7b621747`
- 커밋/push: 수행하지 않음

## 1. 전제 판정

셋째 가능성은 발견되지 않았다. 후보 생성 경로는 하나가 아니라 다음 네 소비 경계로 분리되어 있었다. 따라서 한 endpoint만 수정하지 않고 각 경계에 동일한 상태 축을 적용했다.

| 소비 경로 | 후보 생성/조회 경로 (파일:줄) | 이번 처리 |
|---|---|---|
| 종합견적서 웹 estimate-app | `services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:246-251` → `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:294` → `clients/web/estimate-app/lib/db-catalog.js:88,120,135` | DB 후보 query에서 `DISCONTINUED`, `NOT_FOR_SALE` 제외 |
| 데스크톱 견적 | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1112-1128`, autocomplete 연결 `:2207` | `ESTIMATE` 검색 + 상태 필터, 정확 lookup fallback도 상태 필터 |
| 데스크톱 주문/전표 | `clients/desktop/src/renderer/routes/SlipFormPage.tsx:2487`, `:2568` | `PARTNER_ORDER` 검색 결과에서 상태 필터 |
| 파트너 주문 웹 order-app | `clients/web/order-app/src/samhanApi.ts:407-416` → `/products` catalog | 응답의 상태 필터 후 legacy bootstrap 전달 |

참고로 desktop catalog 관리 화면도 같은 `/api/v1/products`를 사용하므로 backend catalog 전체 query를 좁히지 않았다. 관리 목록의 단종·미판매 품목까지 제거하지 않고, 실제 선택 UI 경계에서만 제거했다.

## 2. RED 원문 — 수정 전

SOL 실측 원문:

```sql
SELECT p.status, e.estimate_category, COUNT(*) AS count
FROM products p
JOIN product_estimate_exposure e
  ON e.product_id = p.id
 AND e.is_deleted = false
WHERE p.is_deleted = false
  AND p.usage_scope IN ('ESTIMATE', 'BOTH')
GROUP BY p.status, e.estimate_category
ORDER BY p.status, e.estimate_category;
```

```text
ACTIVE|COMMERCIAL_MULTI|382
ACTIVE|HOME_MULTI|107
ACTIVE|LEGACY|39
ACTIVE|SINGLE_SET|223
DISCONTINUED|COMMERCIAL_MULTI|24
DISCONTINUED|HOME_MULTI|14
DISCONTINUED|LEGACY|1
DISCONTINUED|SINGLE_SET|50
NOT_FOR_SALE|COMMERCIAL_MULTI|2
NOT_FOR_SALE|SINGLE_SET|12
OUT_OF_STOCK|SINGLE_SET|3
```

```text
RED-A: DISCONTINUED 89건 + NOT_FOR_SALE 14건 = 103건이 후보에 표시됨
RED-B: OUT_OF_STOCK 3건은 표시됨
RED-C: ACTIVE 751건은 모두 표시됨 (오차단 0)
RED-D: 상태 품목이 실제 선택된 기존 견적·주문 표본 0건 → 판정 불가
```

## 3. 변경 및 GREEN 원문

### 3.1 product-service estimate catalog

estimate 전용 `findExposedCatalog` 후보 query에 다음 조건을 추가했다. `searchByUsageScope`는 데스크톱 품목관리 목록과 공유하므로 SQL을 변경하지 않았다.

```sql
AND p.status NOT IN ('DISCONTINUED', 'NOT_FOR_SALE')
```

`OUT_OF_STOCK`은 조건에 포함하지 않아 계속 반환된다.

### 3.2 데스크톱/주문 웹

`ProductOption` 및 slip lookup 결과에 `status`를 전달하고, 후보 선택 경계에서 아래 규칙을 공통 적용했다.

```text
DISCONTINUED  → 제외
NOT_FOR_SALE  → 제외
OUT_OF_STOCK  → 유지 (기존 수량 잠금/'품절' 렌더러 보존)
ACTIVE        → 유지
```

정확 lookup fallback도 같은 검사를 통과하지 못하면 후보로 반환하지 않는다. 기존 문서 hydrate, 저장, 금액 계산 경로는 변경하지 않았다.

### 3.3 자동 검증 GREEN

신규 회귀 테스트를 먼저 실행했을 때 수정 전에는 다음 테스트가 실패했다.

```text
EstimateCatalogInternalControllerIT
  products_excludesDiscontinuedAndNotForSale_butKeepsOutOfStock() FAILED
  AssertionError at EstimateCatalogInternalControllerIT.java:119
```

수정 후:

```text
> Task :services:product-service:test
BUILD SUCCESSFUL
1 test completed, 0 failed
```

관련 product-service 범위 재실행:

```text
Tests:
  EstimateCatalogInternalControllerIT
  ProductCatalogControllerComponentCountTest
BUILD SUCCESSFUL
```

프론트 Vitest는 이 워크트리의 `clients/desktop/node_modules/vitest`와 `clients/web/order-app/node_modules/vitest`가 없어 실행하지 못했다. `npm exec vitest run src/renderer/api/productApi.search-modal.test.ts`는 `Could not resolve 'vitest/config'`로 종료했다.

## 4. RED-A~D 판정

| 항목 | r1 실측 RED | r2 코드/자동검증 판정 |
|---|---|---|
| RED-A | 단종·미판매 103건 노출 | GREEN 경로 추가. 실 GUI 재배포 전수 재측정은 못 함 |
| RED-B | 품절 3건 노출·잠금·텍스트 정상 | SQL 필터가 품절을 제외하지 않음. 기존 renderer 보존 |
| RED-C | ACTIVE 751건, 오차단 0 | ACTIVE를 제외하는 조건 없음. 상태 회귀 테스트에 ACTIVE 유지 경로 포함 |
| RED-D | 실제 기존 상태 라인 0건 | 판정 불가 유지. 기존 저장 문서 삭제/재계산 코드 변경 없음 |

시트 동기화 경로는 수정하지 않았다. 기존의 “표기 없는 품목은 상태를 덮어쓰지 않음” 동작을 보존한다.

## 5. 신규 생성 파일

```text
docs/dev-reports/2026-08-09-1095-r2-hide-filter-fix.md
```

QA 캡처 파일은 새로 생성하지 않았다. 실 GUI 재배포/캡처는 수행하지 못했다.

## 6. 못 한 것

- 로컬에 desktop/order-app Vitest 의존성이 없어 해당 프론트 테스트 및 typecheck를 실행하지 못함.
- product-service 관련 통합 테스트는 실행했으나, 수정 후 실제 product DB 857건 전수 SQL과 GUI 재캡처는 이 라운드에서 수행하지 못함.
- 기존 상태 품목이 실제 저장 문서에 없는 상태(0건)는 r1과 동일하게 금액 불변을 판정하지 않음.
