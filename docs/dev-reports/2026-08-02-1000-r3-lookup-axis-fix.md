# PR #1046 / 이슈 #1000 R3 — lookup 축 확장 BLOCKER fix

## 1. 원인

직전 fix는 `ProductSummaryResponse.productCode`를 올바르게 `model_name`으로 바꿨지만, `ProductService.lookupSummaryByProductCode`는 `product_code exact → alias_code exact`만 조회했다. 따라서 `SENT → ACCEPTED`의 `model_name`이 inventory-service의 `requireExistsByCode`에 들어간 뒤 `NOT_FOUND`가 됐다.

또한 product 조회를 통과시키더라도 inventory-service의 reserve/recall 후보 조회가 문자열 `stock_instances.product_code`만 사용했다. 실 legacy 행 3개는 `010001`을 저장하고 있어, 새 노출값으로는 같은 품목의 행을 찾지 못하는 두 번째 차단이 있었다.

## 2. RED 원문

### 2.1 product-service RED

추가한 `lookup_by_product_code_resolves_exposed_model_name`과 `lookup_by_product_code_rejects_ambiguous_code_across_products`를 수정 전에 실행했다.

```text
ProductServiceTest > lookup_by_product_code_rejects_ambiguous_code_across_products() FAILED
    java.lang.AssertionError at ProductServiceTest.java:179

ProductServiceTest > lookup_by_product_code_resolves_exposed_model_name() FAILED
    com.samhanair.logis.common.exception.BusinessException at ProductServiceTest.java:159

2 tests completed, 2 failed

FAILURE: Build failed with an exception.
> Task :services:product-service:test FAILED
BUILD FAILED
```

첫 실패는 product_code 우선 반환으로 모호성을 거부하지 않았고, 둘째는 model_name 조회축이 없어 NOT_FOUND가 난 것이다.

### 2.2 inventory-service RED

legacy 저장키 회귀 테스트를 수정 전에 실행했을 때, productId 조회 계약 자체가 없어 테스트 컴파일이 실패했다.

```text
StockInstanceServiceOutboundTest.java:122: error: cannot find symbol
  symbol:   method countByOutboundSlipNoAndProductIdAndStatus(String,UUID,StockInstanceStatus)
StockInstanceServiceOutboundTest.java:124: error: cannot find symbol
  symbol:   method findByProductIdAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(UUID,UUID,StockInstanceStatus,PageRequest)
StockInstanceServiceOutboundTest.java:127: error: cannot find symbol
  symbol:   method findByOutboundSlipNoAndProductIdAndStatus(String,UUID,StockInstanceStatus)

> Task :services:inventory-service:compileTestJava FAILED
BUILD FAILED
```

이 RED는 raw SQL로 만든 가짜 재고가 아니라, 실제 API가 만드는 `StockInstance` 상태를 사용한 테스트에서 필요한 repository 계약이 아직 없음을 보였다.

## 3. fix 설명

- product-service lookup을 `product_code exact`, `product_aliases.alias_code exact`, `model_name exact` 세 축 후보 수집으로 확장했다.
- 후보가 없으면 NOT_FOUND, 후보 UUID가 2개 이상이면 CONFLICT, 같은 UUID의 중복 축 매칭은 정상 단건으로 수렴한다. 따라서 조회축을 넓혀도 엉뚱한 품목을 임의 반환하지 않는다.
- inventory-service reserve/recall은 product-service가 반환한 `ProductSummary.id`를 우선 사용해 `stock_instances.product_id`로 조회한다. productId 결과가 없는 legacy/기존 fixture에는 기존 product_code 조회를 fallback으로 유지했다.
- ship/release도 동일한 ID 우선 조회를 사용해 reserve 후 complete 단계에서 legacy 키가 다시 막히지 않도록 했다.
- 마이그레이션은 추가하지 않았다. 기존 Flyway 파일도 수정하지 않았다.

## 4. GREEN 원문

### 4.1 product-service 신규 RED 대상 GREEN

```text
> Task :services:product-service:test

BUILD SUCCESSFUL in 26s
13 actionable tasks: 2 executed, 11 up-to-date
```

### 4.2 inventory-service legacy-key GREEN

```text
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 42s
18 actionable tasks: 4 executed, 14 up-to-date
```

## 5. 불변식 실측

모든 SQL은 `BEGIN TRANSACTION READ ONLY ... COMMIT`으로 실행했다. Docker 이미지 재빌드, DB write/DDL은 없었다.

1. 노출값 유지: `ProductSummaryResponse.productCode = model_name`을 유지했다. 실 DB 활성 품목은 `1,220`, nonblank model_name `1,220`, distinct model_name `1,220`이다.

2. 노출값 재조회: 활성 `model_name` exact 후보가 해소되지 않는 품목 `0/1,220`이다. 즉 `1,220/1,220` 재조회 가능이다. 기존 fix 전부터의 선재 결함 1,120건도 이번 lookup 축에 포함되어 이제 전건 해소된다.

3. 기존 동작 보존:
   - 변경 대상 SENT 출고전표 실측은 `19전표 / 29라인 / 수량 58`이다. 세 축 lookup이 모두 활성 품목 UUID로 해소되어 수락 단계의 새 lookup 차단은 `0전표 / 0라인 / 0수량`이다.
   - `stock_instances` 실측은 `3행 = AVAILABLE 1 + SHIPPED 2`, 저장키는 모두 옛 코드 `010001`, 노출값 키 일치 `0`이다. ID 우선 reserve 테스트가 이 legacy 행을 `RESERVED`로 전이했으며, recall은 같은 ID 축으로 SHIPPED 후보를 찾는다. 저장키 불일치로 인한 차단은 `0행`이다.

4. 옛 순번코드 조회: 활성 legacy `product_code` `100건`, exact 재조회 성공 `100/100`, 실패 `0건`이다. 활성 alias 행은 `0건`이므로 alias 실 행 성공 표본은 없지만, 기존 alias repository fallback 코드는 유지됐다.

5. 오조회 방지: 활성 model_name distinct `1,220`; 조회 후보가 서로 다른 UUID로 충돌하는 활성 model_name 값 `0`, 해소 불가 exposed 값 `0`이다. 코드상 충돌 후보는 CONFLICT로 거부하며 임의 품목 반환하지 않는다. 실측 엉뚱한 품목 반환 `0건`이다.

참고로 전체 SENT OUTBOUND는 `25전표 / 52라인 / 174수량`이고, 이 PR의 model_name 전환 대상 subset이 위의 `19/29/58`이다.

## 6. 변경 모듈 전체 테스트

- `.:\\gradlew.bat :services:product-service:test --no-daemon` → `BUILD SUCCESSFUL in 2m 58s`; XML 합계 `626 tests, skipped=0, failures=0, errors=0`.
- `.:\\gradlew.bat :services:inventory-service:test --no-daemon` → 최종 변경 후 `BUILD SUCCESSFUL in 2m 36s`; XML 합계 `542 tests, skipped=1, failures=0, errors=0`.
- inventory의 1 skip은 Testcontainers skip이 아니다. `Mig5StockTransferFixtureHeaderCrossCheckTest`가 저장소 밖 raw CSV(`docs/migration/ecount-data/raw/...`) 부재 assumption으로 skip됐다. Testcontainers 때문에 skip된 테스트는 `0건`이다.

## 7. 변경 파일별 diff (+N / −M)

추가분과 삭제분을 합산하지 않고 별도로 기록한다.

| 파일 | + | − |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` | 19 | 6 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` | 34 | 0 |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockInstanceRepository.java` | 48 | 0 |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java` | 81 | 22 |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockInstanceServiceOutboundTest.java` | 26 | 0 |

## 8. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1000-r3-lookup-axis-fix.md`

신규 migration 파일은 없다. commit/push/checkout/브랜치 조작도 수행하지 않았다.
