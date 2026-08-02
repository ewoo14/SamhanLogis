# PR #1046 / 이슈 #1000 — R5 보상 축 재수렴 보고서

## ① 원인

직전 fix는 `recallBatch`의 후보 조회를 `productId + outboundPartnerCode + SHIPPED` 우선으로 바꾸었다. 그러나 `unrecallBatch`와 `resellBatch`는 `recallSlipNo + productCode + RECALLED` 문자열 조회를 직접 호출하고 있었다.

실제 legacy 행은 저장된 `product_code=010001`, 호출·노출 키는 `AR05TXEAAWKNEU-01`이다. recall은 최신 `ProductSummary.id`로 이 2행을 찾지만 도메인 전이 뒤에도 `product_code`를 바꾸지 않는다. 따라서 보상은 같은 호출 키로 문자열 조회를 하며 0행을 반환하고, 예외 없이 `RECALLED`에 남길 수 있었다.

## ② RED

운영 코드 수정 전에 격리된 Postgres 통합 테스트에 실제 `stock_instances` 2행을 넣었다. 두 행 모두 최신 `productId`를 사용하고 저장 코드만 legacy `010001`로 두었다.

추가한 실패 테스트:

- `unrecallBatch_restoresLegacyProductCodeRowsByProductId`
- `resellBatch_restoresLegacyProductCodeRowsByProductId`

RED 실행 원문:

```text
StockInstanceOutboundIT > unrecall-batch: 최신 productId로 회수한 legacy product_code 2행도 전부 SHIPPED 복원 FAILED
    java.lang.AssertionError at StockInstanceOutboundIT.java:361

StockInstanceOutboundIT > resell-batch: 최신 productId로 회수한 legacy product_code 2행도 전부 AVAILABLE 복원 FAILED
    java.lang.AssertionError at StockInstanceOutboundIT.java:422

2 tests completed, 2 failed
Execution failed for task ':services:inventory-service:test'.
```

이는 테스트 오타가 아니라 회수 응답은 2행인데 보상 응답이 0행인 원인 결함을 재현한 것이다.

## ③ fix

- `StockInstanceRepository`에 `recallSlipNo + productId + status` 기준의 `FOR UPDATE` 조회 2종을 추가했다(전체 조회, 수량 제한 조회).
- `unrecallBatch`와 `resellBatch`가 공통 `findRecalledForUpdate` helper를 사용하도록 바꿨다.
- helper는 `productId` 조회 결과가 있으면 그 결과만 사용하고, 비어 있을 때만 기존 `productCode` 조회로 fallback한다.
- 전표 번호, 상태, row lock, 재판매 수량 제한 조건은 유지했다.
- `ProductSummary`가 없는 기존 단위 테스트/null 계약에서는 기존 productCode 경로를 유지한다.

GREEN 타깃 실행 원문:

```text
2 tests completed
BUILD SUCCESSFUL
```

## ④ GREEN

격리 Postgres 2행 재현에서 다음이 확인됐다.

| 경로 | 입력 저장 코드 | ID | 결과 행 | 최종 상태 |
|---|---|---|---:|---|
| recall → unrecall | `010001` | 최신 `productId` | 2 | `SHIPPED` |
| recall → resell | `010001` | 최신 `productId` | 2 | `AVAILABLE` |

두 회귀 테스트 모두 응답의 `productId`가 대상 `ProductSummary.id`와 같고, 저장 코드가 legacy `010001`인 2행 전부를 검증한다.

## ⑤ 불변식 1~4 실측

### 불변식 1 — 회수한 것은 되돌릴 수 있다

격리된 실제 Postgres 테스트 행 2개로 측정했다.

- recall 후보: 2행
- unrecall 보상: 2행 (`SHIPPED`)
- resell 보상: 2행 (`AVAILABLE`)
- 보상/회수 행 수 차이: 0행
- legacy 저장 코드 `010001` 유지 상태에서도 성립

공유 DB write 금지에 따라 운영 공유 DB에는 전이하지 않았고, 테스트가 사용하는 실제 DB 행으로 재현·검증했다.

### 불변식 2 — 같은 계열 전수 sweep

`stock_instances`를 코드 문자열로 조회하는 지점을 파일 단순 나열이 아니라 `productCode/product_code` 조건·repository 파생 메서드 기준으로 전수 확인했다.

- `StockInstanceRepository` 코드 문자열 조회 메서드 선언: **13개**
  - `findByProductCodeAndStatusOrderByReceivedAtAsc`
  - `findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc`
  - `findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate`
  - `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc`
  - `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate`
  - `countByOutboundPartnerCodeAndProductCodeAndStatus`
  - `countByProductCodeAndWarehouseIdAndStatus`
  - `findByOutboundSlipNoAndProductCodeAndStatus`
  - `countByOutboundSlipNoAndProductCodeAndStatus`
  - `findByRecallSlipNoAndProductCodeAndStatus`
  - `findByRecallSlipNoAndProductCodeAndStatusForUpdate` (전체)
  - `findByRecallSlipNoAndProductCodeAndStatusForUpdate` (Pageable)
  - `countByRecallSlipNoAndProductCodeAndStatus`
- `StockInstanceService`의 해당 repository 직접 호출 지점: **15개**
  - reserve: 가용 FIFO 문자열 fallback 1개
  - ship/release: 전표 문자열 fallback 및 legacy-null fallback 4개
  - recall: 회수 후보 문자열 fallback 1개
  - 회수 멱등/조회: count·조회 문자열 fallback 2개
  - unrecall/resell: 공통 보상 helper 내부 문자열 fallback 2개
  - 목록/역-FIFO read 경로: 2개
  - 그 외 동일 서비스의 전표·상태 보조 호출: 3개

모든 문자열 경로는 삭제하지 않고 `productId` 우선 후 빈 결과에만 fallback하도록 남겼다. 보상 두 경로도 이제 recall과 같은 축 대칭을 갖는다. `productCode`라는 변수 대입·검증·로그만 있고 `stock_instances` 조회가 아닌 ProductClient/domain assignment는 sweep 건수에서 제외했다.

### 불변식 3 — 닫힌 축 회귀 없음

R4 실데이터 재수렴 측정값을 기준으로 재확인했다.

- 3축 CONFLICT: **0/1,320**
- ID 우선 조회 오선택: **0행**
- 타 서비스 `/lookup-by-code` 직접 소비: **0곳**
- 이번 변경은 inventory 보상 조회와 통합 테스트만 수정했으며 product lookup 3축 로직은 변경하지 않았다.

### 불변식 4 — 잡히면 안 되는 행 0행

ID 조회는 productId만 단독으로 사용하지 않고 기존 범위를 함께 유지한다.

- unrecall: `recallSlipNo + productId + RECALLED`
- resell: `recallSlipNo + productId + RECALLED + Pageable(quantity)`
- recall: `outboundPartnerCode + productId + SHIPPED`
- reserve: `productId + warehouseId + AVAILABLE`
- ship/release: `outboundSlipNo + productId + status`

R4 실데이터의 다른 창고·상태·전표·거래처 오선택은 **0행**이었다. 이번 2행 회귀 테스트도 동일 productId이지만 legacy code인 대상만 2행을 반환하고, 응답 productId와 상태를 직접 검증했다.

## ⑥ 모듈 전체 테스트

타깃 테스트만이 아니라 변경 모듈 전체를 실행했다.

```text
services/inventory-service
544 tests completed, 0 failed, 1 skipped
BUILD SUCCESSFUL

services/product-service
626 tests completed, 0 failed, 0 skipped
BUILD SUCCESSFUL
```

inventory 기준 542에서 회귀 테스트 2개가 늘었으며 통과 수가 줄지 않았다. Docker 이미지 재빌드는 하지 않았다.

## ⑦ 파일별 `+N/-M`

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockInstanceRepository.java` | +34 | -0 |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java` | +32 | -4 |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/StockInstanceOutboundIT.java` | +52 | -3 |
| `docs/dev-reports/2026-08-02-1000-r5-compensation-axis-fix.md` | 새 보고서 | 새 보고서 |

코드·테스트 diff 합계는 **+118 / -7**이다. 새 보고서 경로는 다음과 같다.

```text
docs/dev-reports/2026-08-02-1000-r5-compensation-axis-fix.md
```
