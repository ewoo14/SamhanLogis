# PR #991 fix 라운드 r8 — `modelCode` 없음과 불일치 구분

## 작업 범위

- 대상: `modelCode`가 없는 정상 라인의 기존 확정 능력 회복
- 보존: `modelCode`가 존재하지만 다른 제품을 가리키는 rename 역회귀 방지
- 금지: B-08 되돌리기, B-05/B-06/B-07, R-03, 제품 `modelName` 변경 정책 수정

## RED 원문

재현 테스트를 추가한 뒤 다음 명령으로 실행했습니다.

```text
.\gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.modelCodeMissingLegacyLineKeepsLabelMatchConfirmation" --no-daemon
```

종료코드: `1`

실패 원문:

```text
DailyClosingDetailServiceTest > modelCode 없는 정상 레거시 라인은 라벨 매칭으로 확정한다 FAILED
    org.opentest4j.AssertionFailedError at DailyClosingDetailServiceTest.java:592

1 test completed, 1 failed
BUILD FAILED
```

## 변경 요지

`effectiveProductMatch`에서 `axis.modelToken() == null`이면 `byLabel`의 `MATCHED` 상태를 그대로 반환하도록 수정했습니다. 모델 토큰이 존재하는 경우에는 기존 exact `modelCode` 일치 조건과 rename 역회귀 차단을 그대로 유지했습니다.

## 실측

focused GREEN에서 다음 3개 테스트가 함께 통과했습니다.

```text
.\gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.modelCodeMissingLegacyLineKeepsLabelMatchConfirmation" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.mixedSalesSlipAllocationDoesNotFallbackToFirstProductWhenRenamedModelIsGone" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.renamedModelTokenReusedByAnotherProductDoesNotOverrideHistoricalLabelMatch" --no-daemon
```

종료코드: `0`

```text
BUILD SUCCESSFUL
3 tests completed, 0 failed
```

accounting 전체 테스트는 아래 명령으로 300초 제한에 도달해 미판정입니다.

```text
.\gradlew :services:accounting-service:test --no-daemon
```

종료코드: `124` (command timed out after 304032 milliseconds)

읽기 전용 DB 직접 조회 명령과 결과:

```text
docker exec samhan-postgres psql -U samhan -d partner_order_db -c "SELECT COUNT(*) AS nondeleted_lines, COUNT(*) FILTER (WHERE product_id IS NULL) AS no_authority_product, COUNT(*) FILTER (WHERE model_name IS NULL) AS no_model_name FROM partner_order_lines WHERE is_deleted=false;"
-- nondeleted_lines=2052, no_authority_product=0, no_model_name=0

docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS nondeleted_lines, COUNT(*) FILTER (WHERE product_id IS NULL) AS no_authority_product, COUNT(*) FILTER (WHERE model_name IS NULL) AS no_model_name FROM slip_lines WHERE is_deleted=false;"
-- nondeleted_lines=2791, no_authority_product=0, no_model_name=0

docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT COUNT(*) AS active_products, COUNT(*) FILTER (WHERE model_code IS NULL) AS active_without_model_code, COUNT(*) FILTER (WHERE model_code IS NOT NULL) AS active_with_model_code FROM products WHERE is_deleted=false;"
-- active_products=1220, active_without_model_code=100, active_with_model_code=1120

docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT COUNT(*) AS active_without_model_code FROM products WHERE is_deleted=false AND status='ACTIVE' AND model_code IS NULL;"
-- active_without_model_code=96
```

제품 UUID 집합은 product DB에서 읽고, 각 원천 라인의 `product_id`와 PowerShell 메모리에서 대조했습니다(모든 SQL은 `docker exec ... psql ... -c` 읽기 전용).

```text
partner-order: modelCode-null-product-lines=2048
slip:         modelCode-null-product-lines=2141
partner-order: modelCode-present-product-lines=2
slip:         modelCode-present-product-lines=4
```

따라서 r8의 구분 기준으로 직접 재집계한 정상 확정 후보는
`2,048 + 2,141 + 2 + 4 = 4,195라인`이다. r6의 약 4,200라인 수준으로 회복되며, `modelCode`가 없는 정상 라인 4,189건이 확정 후보에 남는다. 불변 코드가 존재하면서 다른 제품을 가리키는 방향은 기존 rename 반례 테스트에서 0건으로 차단된다.

## 테스트

### accounting focused

```text
.\gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.modelCodeMissingLegacyLineKeepsLabelMatchConfirmation" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.mixedSalesSlipAllocationDoesNotFallbackToFirstProductWhenRenamedModelIsGone" --tests "com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.renamedModelTokenReusedByAnotherProductDoesNotOverrideHistoricalLabelMatch" --no-daemon
```

종료코드: `0` — `BUILD SUCCESSFUL`, 3 tests completed, 0 failed.

### slip

```text
.\gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.client.ProductClientTest" --tests "com.samhanair.logis.slip.client.ProductClientLookupByModelTest" --no-daemon
```

종료코드: `0` — `BUILD SUCCESSFUL`. XML 기준 ProductClientTest 11건, 실패 0, 오류 0.

### partner-order

```text
.\gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.client.ProductClientTest" --no-daemon
```

종료코드: `0` — `BUILD SUCCESSFUL`. XML 기준 ProductClientTest 5건, 실패 0, 오류 0.

### common

```text
.\gradlew :shared:common:test --no-daemon
```

종료코드: `0` — `BUILD SUCCESSFUL`, 실패 0, 오류 0.

### 변경 검증

```text
git diff --check
```

종료코드: `0`.

## 이번에 안 본 것

- accounting 전체 테스트 결과는 300초 timeout으로 미판정이며, 전체 accounting suite 통과로 보고하지 않았다.
- 실제 일마감 API/브라우저 라이브 QA와 신규 스크린샷은 실행하지 않았다.
- 공유 DB에 INSERT/UPDATE/DELETE를 수행하지 않았다. Docker 재빌드·재기동 명령도 수행하지 않았다. 다만 accounting 전체 테스트가 Gradle Testcontainers 경로에 진입해 실행 중 테스트 컨테이너가 생성된 상태는 확인했다.
- B-08, B-05·B-06·B-07, R-03, B-01·B-02·B-09·B-10·R-01·R-02는 이번 라운드에서 재판정하지 않았다.
- 제품 `modelName` 변경 정책 자체는 보지 않았다.

## 신규·변경 파일 및 `git status --porcelain`

신규 파일:

- `docs/dev-reports/2026-08-01-991-r8-missing-vs-mismatch.md`

변경 파일:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java`

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
?? docs/dev-reports/2026-08-01-991-r8-missing-vs-mismatch.md
```
