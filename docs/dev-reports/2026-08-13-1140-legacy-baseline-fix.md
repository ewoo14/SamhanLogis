# #1140 구형 baseline 복제 구현 보고서

## 1. 구형 품목 직접 실측

공유 DB 업무 데이터와 분리하기 위해 `products`와 `price_history`만 조회했다. 판매전표 `2026/08/13-*`, 입고전표, QA 창고 4건, 회계전표 2건, 거래처 `P-2026-0017`은 join하지 않았다.

실행 SQL:

```sql
BEGIN TRANSACTION READ ONLY;
WITH old AS (
  SELECT id, release_price, delivery_price
  FROM products
  WHERE is_deleted=false AND status='ACTIVE' AND product_category='OLD'
), baseline AS (
  SELECT product_id, release_price, delivery_price
  FROM price_history
  WHERE is_deleted=false AND effective_date=DATE '2000-01-01'
)
SELECT count(*) AS active_old,
       count(b.product_id) AS baseline_rows,
       count(*) FILTER (WHERE b.product_id IS NULL) AS baseline_missing,
       count(*) FILTER (WHERE b.product_id IS NOT NULL AND o.release_price=b.release_price)
         AS baseline_release_equal,
       count(*) FILTER (WHERE b.product_id IS NOT NULL AND o.delivery_price=b.delivery_price)
         AS baseline_delivery_equal,
       coalesce(sum(abs(o.release_price-b.release_price))
         FILTER (WHERE b.product_id IS NOT NULL),0) AS baseline_release_abs_diff,
       coalesce(sum(abs(o.delivery_price-b.delivery_price))
         FILTER (WHERE b.product_id IS NOT NULL),0) AS baseline_delivery_abs_diff
FROM old o LEFT JOIN baseline b ON b.product_id=o.id;
ROLLBACK;
```

출력 원문:

```text
product_db|off
BEGIN
 active_old | baseline_rows | baseline_missing | baseline_release_equal | baseline_delivery_equal | baseline_release_abs_diff | baseline_delivery_abs_diff
------------+---------------+------------------+-------------------------+--------------------------+----------------------------+-----------------------------
         37 |             0 |               37 |                       0 |                        0 |                          0 |                           0
(1 row)
ROLLBACK
```

현재가와 `2026-04-01` snapshot을 별도로 대조한 원문은 출고가·납품가 모두 `37/37`, 절대 차이 `0.00/0.00`이었다. 이 라운드에서는 공유 DB에 쓰지 않았으며, 실제 반영은 V43 migration이 담당한다.

## 2. RED 원문

시더 RED:

```text
PriceHistorySeederIT > run_seedsCurrentAndBaselinePriceHistoryForOldProductWithoutChangingPrices() FAILED
    java.lang.AssertionError at PriceHistorySeederIT.java:74
1 test completed, 1 failed
BUILD FAILED
```

이 실패는 구형 baseline을 의도적으로 건너뛰던 기존 코드가 `2행 + 현재가 동일` 계약을 만족하지 못한 것이다.

프런트 RED를 실행하기 전 워크트리에는 npm 의존성이 없어 다음 선행 실패도 확인됐다.

```text
desktop: Could not resolve 'vitest/config'
estimate-app: 'jest' is not recognized as an internal or external command
```

의존성을 복원한 뒤 새 테스트를 구현 전 상태와 대조할 수 있도록 oldProducts 토글을 제거한 상태에서 UI 계약은 `price-schedule-toggle-oldProducts` 미존재로 실패하는 테스트가 되도록 작성했다. no-op 계약의 최초 상태는 resolver 모듈 부재로 실패한다.

```text
Cannot find module '../public/js/legacy-price-toggle'
```

## 3. 선택한 수단과 이유

선택한 수단은 다음 세 가지의 additive 조합이다.

- `V43__legacy_old_product_baseline.sql`: 활성 OLD의 현재 `release_price`/`delivery_price`를 `2000-01-01` `price_history`에 insert한다.
- `PriceHistorySeeder`: dev fixture에서도 OLD baseline을 현재가 그대로 생성한다. 신형은 기존 0.9 fixture 규칙을 유지한다.
- Desktop 관리 화면과 estimate-app 구형 화면에 토글 표면을 추가하되, `resolveLegacyPriceVariant`는 토글 인자를 무시하고 현재 출고가·납품가를 그대로 반환한다.

이 수단은 기존 견적·전표 저장 행을 읽거나 update하지 않고 가격 이력만 additive로 채운다. 따라서 소급 계산을 만들지 않으며, 구형 토글의 존재와 금액 no-op을 서로 분리해 보증할 수 있다.

새 migration 번호 충돌 확인:

- 이 워크트리 product-service migration 마지막 번호: `V42`.
- GitHub API로 열린 PR 전체의 변경 파일에서 `V43__`, `V44__`~`V50__` 검색: 일치 0건.
- git 명령은 개발책임자 지시에 따라 실행하지 않았다.

## 4. GREEN 원문

구형 시더/가격 이력:

```text
BUILD SUCCESSFUL in 38s
PriceHistorySeederIT (selected): PASS
```

구형 no-op 양방향:

```text
PASS test/legacy-price-toggle.test.js
  구형 단가변동 토글 no-op 계약
    √ 토글 false 에서 출고가·납품가가 동일하다
    √ 토글 true 에서 출고가·납품가가 동일하다
Tests: 2 passed, 2 total
```

Desktop 구형 토글 표면:

```text
✓ EstimatePricingConfigPage.priceSchedule.test.tsx (7 tests)
Test Files 1 passed
Tests 7 passed
```

## 5. 불변식별 보증

| 불변식 | 보증 수단 |
|---|---|
| ① 구형 토글 표면 | Desktop `price-schedule-toggle-oldProducts` 렌더/저장 테스트, estimate-app `chkOldInc` 렌더 및 `PRICE_DEFAULT_VARIANT.oldProducts` 초기값 |
| ② 토글 no-op | `resolveLegacyPriceVariant(item, false/true)` 양방향 테스트. 실제 구형 `renderOld`/`sumOld`가 해당 resolver를 사용하며 두 상태에서 동일한 현재 단가를 선택 |
| ③ 출고가·납품가 0원 차이 | V43이 두 baseline 컬럼을 제품 현재 두 컬럼에서 직접 복제하고, OLD 시더 테스트가 두 금액을 현재가와 `isEqualByComparingTo`로 단언 |
| ④ 저장 금액 불변 | V43은 `products`, 견적, 전표를 update하지 않고 `price_history` INSERT만 수행. 기존 저장 금액을 읽어 재계산하는 경로가 없다 |
| ⑤ 신형 동작 불변 | 신형 시더의 기존 0.9 baseline 테스트 유지, Desktop 기존 3종 토글 테스트 유지, product-service/estimate-app/Desktop 전량 테스트 GREEN |

## 6. 변경 모듈 전량 테스트

명령과 결과:

```text
.\gradlew.bat :services:product-service:test --no-daemon
BUILD SUCCESSFUL in 3m 9s
```

```text
clients/web/estimate-app> npm test -- --runInBand
Test Suites: 15 passed, 15 total
Tests: 331 passed, 331 total
```

```text
clients/desktop> npm run build
build 성공

clients/desktop> npx vitest run --reporter=dot
Test Files 271 passed (271)
Tests 2341 passed | 2 skipped (2343)
```

Desktop의 2 skipped는 기존 전역 테스트 스킵이며, 새 테스트에는 Linux 스킵 가드가 필요한 Testcontainers 테스트를 추가하지 않았다. Testcontainers는 전 과정에서 병렬 실행하지 않았다.

## 7. 판단이 필요해 남긴 것 / 못 한 것

- 공유 DB에는 migration을 직접 적용하지 않았다. 따라서 이 라운드의 DB 실측은 읽기 전용이며, 운영/QA DB의 실제 V43 적용 후 `baseline_rows` 재확인은 PM/QA 적용 단계에서 필요하다.
- 기존 전표 저장 금액의 실데이터 snapshot을 이 라운드에서 변경·재계산하지 않았다. V43이 전표 테이블을 건드리지 않는 additive SQL이라는 코드 보증으로 범위를 제한했다.
- 명칭 전체 통일, `default_pre_change` 내부 명칭 반전, 신규 품목의 단가변동 정책 변경은 결정 B 범위가 아니므로 손대지 않았다.
