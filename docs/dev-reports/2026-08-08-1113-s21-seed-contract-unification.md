# PR #1119 / Issue #1113 — S21 seed contract unification

## 결론

S20의 “product UUID가 랜덤일 수 있다”는 가설은 현재 HEAD의 코드와 맞지 않는다.

- `services/product-service/src/main/java/com/samhanair/logis/product/seed/HvacProductSeeder.java:150`은 `deterministicId("product", row.modelName())`을 사용한다.
- 같은 파일 `:411-413`은 `UUID.nameUUIDFromBytes(("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8))`를 사용한다.
- 따라서 product UUID는 `samhan-seed:product:<modelName>`의 Type-3 UUID이며, `StockBalanceSeeder`의 규칙과 동일하다.

실제 원인은 두 서비스가 서로 다른 실행 계약을 가진 것이었다.

- product-service의 `HvacProductSeeder`는 `@Profile("dev")`, `@ConditionalOnProperty("app.product.seed-test-data")`, `@Order(100)`이었다.
- inventory-service의 `StockBalanceSeeder`는 `@Profile("dev")`, `@ConditionalOnProperty("app.inventory.seed-test-data")`, `@Order(10)`이었다.
- 서비스가 분리되어 있으므로 한쪽 환경변수만 켜도 한쪽 시더만 실행될 수 있었다. `@Order`는 서비스 간 실행 순서를 보장하지 않는다.
- inventory 내부에서도 `StockInstanceSeeder`와 `InventoryAuditSeeder`가 inventory 전용 toggle을 사용하고 있었다.

## 적용한 계약

product/inventory seed 실행 조건을 `app.seed-test-data=true` 하나로 통일했다.

- 환경변수: `SAMHAN_SEED_TEST_DATA`
- product-service: `HvacProductSeeder`, `PriceHistorySeeder`
- inventory-service: `StockBalanceSeeder`, `StockInstanceSeeder`, `InventoryAuditSeeder`
- 기존 product/inventory 전용 property는 애플리케이션 설정과 `@ConditionalOnProperty`에서 제거했다.

재고 시드 직전에 `ProductSeedIntegrityValidator`가 100개 modelName의 deterministic UUID를 계산하고 product-service internal batch lookup을 호출한다. product-service의 lookup은 soft-deleted 행을 활성 product로 반환하지 않는다.

검사 실패 메시지는 다음 정보를 포함한다.

- 누락 개수
- 누락 modelName 목록
- product-service를 먼저 공통 seed toggle로 기동해야 한다는 조치
- 검사가 실패하면 기존 `stock_balances`를 변경하지 않았다는 사실

일반 업무용 `ProductClient.lookup()`의 부분 응답 예외 계약은 유지하고, seed 검사에는
`lookupForSeedIntegrity()`를 사용한다. 이 seed 전용 경로는 부분 응답을 그대로 받아 validator가
누락 개수와 modelName 목록을 계산하게 한다.

검증 실패 또는 product-service 연결/응답 실패 시 `StockBalanceSeeder`는 `insertIfAbsent`에 진입하지 않고 `IllegalStateException`으로 기동을 중단한다. 따라서 재고 INSERT 일부만 먼저 실행되는 경로가 없다.

## 재실행 시 데이터 영향

🚨 이번 라운드에는 DB SELECT, 재시드, DB 쓰기, 공유 Docker 재기동을 실행하지 않았다. 아래는 코드와 S20 SELECT 결과에 따른 재실행 판정이다.

### 정상적으로 동일 세대의 활성 product가 있는 경우

- product는 같은 `samhan-seed:product:<modelName>` UUID를 다시 계산한다.
- `HvacProductSeeder`는 `existsByModelNameAndIsDeletedFalse`에 걸려 기존 활성 product를 skip한다.
- inventory는 같은 `samhan-seed:stock-balance:<warehouseCode>:<productCode>` id를 계산한다.
- `insertIfAbsent`의 `SELECT COUNT(*) FROM stock_balances WHERE id = ?`가 기존 행을 찾으면 skip한다.
- 기존 재고 200행의 `available_qty`, `reserved_qty`, `total_qty`, `version`은 UPDATE하지 않는다.
- 새 UUID로 재고 200행을 다시 깔지 않는다.
- 기존 재고 수량 데이터는 사라지지 않는다.

### S20에서 확인된 현재 데이터 상태로 즉시 재실행하는 경우

S20 SELECT 결과는 다음과 같다.

```text
all_products=3221 · active_products=3083 · deleted_products=138
active_exact_candidates=0 · deleted_exact_candidates=100
active_normalized_candidates=0 · deleted_normalized_candidates=100
```

현재 100개 deterministic product UUID는 `products.is_deleted=true` 과거 행으로 존재한다. 따라서:

1. product 시더의 active modelName 검사는 통과하지 않는다.
2. product 시더는 동일 deterministic PK로 INSERT를 시도하지만 기존 soft-deleted PK와 충돌하고, 현재 구현은 해당 row의 예외를 로그로 남기고 계속한다. 이 동작은 soft-deleted 행을 활성화하지 않는다.
3. inventory 시더의 활성 product batch 검증은 100개 중 누락된 modelName과 개수를 보고 fail-fast 한다.
4. validator가 `StockBalanceSeeder.insertIfAbsent`보다 먼저 실행되므로 새 재고 200행은 생성되지 않는다.
5. 기존 재고 200행의 수량 데이터는 삭제·UPDATE되지 않는다. **수량 데이터는 사라지지 않는다.**

따라서 현재 데이터에서 실행해도 “새 UUID로 재고 200행을 다시 설치”하지 않는다. 먼저 product의 soft-deleted 과거 행을 어떻게 취급할지 별도 운영 결정을 내려야 한다. 이번 라운드에서는 그 데이터를 건드리지 않았다.

## 회귀 울타리

신규 `ProductSeedIntegrityValidator`와 테스트를 추가했다.

- 재고 시드 대상 modelName의 UUID와 product-service 응답 UUID를 비교한다.
- soft-deleted product가 응답에서 빠지면 누락 modelName을 포함해 fail-fast 한다.
- validator 테스트는 누락 1개, modelName 출력, product-service 선기동 안내, 공통 seed toggle 안내를 검증한다.
- product-service의 기존 `HvacProductSeederTest.deterministicUuidMatchesInventorySeederNamespace`가 product/inventory UUID namespace 일치를 계속 검증한다.

## 검증

```text
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.seed.HvacProductSeederTest
BUILD SUCCESSFUL

.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.seed.ProductSeedIntegrityValidatorTest
BUILD SUCCESSFUL

git diff --check
exit 0
```

## 신규 파일 목록

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/seed/ProductSeedIntegrityValidator.java`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/seed/ProductSeedIntegrityValidatorTest.java`
- `docs/dev-reports/2026-08-08-1113-s21-seed-contract-unification.md`

## diff 통계

`git diff --stat` 기준 기존 추적 파일 변경은 8개, `17 deletions(-)`이다. 신규 파일은 아직 untracked이므로 기본 `git diff --stat`에는 포함되지 않는다.

커밋·push는 하지 않았다.
