# 2026-08-04 LED-1001 R36 — 기초잔액·SALE_SUMMARY 결함 수정

## 1. 작업 기준

- 워크트리: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 시작 HEAD: `f3b71e2c072db079eaec8fe00160fdb5277cd128`
- fix 카운터: `3/3` (마지막 라운드)
- 개발책임자 확정 산식: `기말 = 기초 + 기간매출 - 기간수금`

## 2. RED 원문

### RED-A1 — 기간 이전 확정 판매의 기초 이월

명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --no-daemon
```

원문:

```text
PartnerLedgerReadModelServiceTest > RED_A1_priorConfirmedSaleBecomesOpeningBalanceWithoutPeriodDocument() FAILED
java.lang.AssertionError at PartnerLedgerReadModelServiceTest.java:184
10 tests completed, 3 failed
```

### RED-A2 — slip 없는 매출의 SALE_SUMMARY/VAT 포함 계약

명령:

```text
.\gradlew :shared:common:test --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest --no-daemon
```

원문:

```text
PartnerLedgerContractTest.java:54: error: cannot find symbol
List.of(PartnerLedgerContract.Entry.saleSummary(new BigDecimal("9900000")))
symbol: method saleSummary(BigDecimal)
BUILD FAILED
```

### RED-B1 — 기말 산식 강제

원문:

```text
기존 fold는 JOURNAL_ONLY.amount를 salesTotal에 더하고 debit-credit를 periodDelta로 사용했다.
따라서 salesTotal=9000000인데 closingBalance=0이 되는 결함을 재현하는 테스트가 실패했다.
```

### RED-B2 — 무필터 기초행/상태 집합 보존

원문:

```text
PartnerLedgerReadModelServiceTest > RED_B2_unfilteredPriorSaleKeepsNormalPartnerRowAndCanonicalStatusSet() FAILED
java.lang.AssertionError at PartnerLedgerReadModelServiceTest.java:212
10 tests completed, 3 failed
```

초기 RED 단계에서는 A1·A2·B1·B2를 모두 작성한 뒤, 공통 계약 컴파일 실패(A2/B1)와 accounting 서비스 실행 실패(A1/B2)를 확인했다.

## 3. 구현 및 종료조건 검증

확인 완료.

- 기간 전 판매: `LEDGER_SALES_EPOCH..from.minusDays(1)`로 조회해 opening에만 합산한다.
- 시작일 당일 판매: historical 종료일이 `from-1`이므로 opening에는 0, 기간매출에는 1회만 포함된다.
- 기초만 있는 거래처: period 문서가 없어도 historical sale이 그룹을 만들고 행/기초잔액을 보존한다.
- 기간 수금만 있는 거래처: confirmed cash receipt가 그룹을 만들고 `0 + 0 - 수금`으로 기말을 계산한다.
- slip 없는 매출: 401/110 journal 후보가 있고 slip이 없을 때 110 VAT 포함 금액의 `SALE_SUMMARY` 1건만 만든다.

## 4. 구형 snapshot 호환

확인 완료. `PartnerLedgerReadModel.DocumentType`의 기존 `JOURNAL_ONLY`와 `SALE_SUMMARY`를 모두 유지하고, 공통 계약 enum에 `SALE_SUMMARY`를 추가했다. 기존 snapshot의 `JOURNAL_ONLY`/`SALE_SUMMARY` 문자열은 계속 역직렬화 가능하며, `LedgerSnapshotServiceTest`와 관련 snapshot 테스트가 GREEN이다. slip-service는 공통 상태 집합을 계속 참조한다.

## 5. 명령·출력 원문

명령 및 원문:

```text
rg -n --hidden --glob '!node_modules' --glob '!build' "PartnerLedgerContract\.DocumentType|DocumentType\.SALE_SUMMARY|DocumentType\.JOURNAL_ONLY|PartnerLedgerReadModel\.DocumentType|openingBalances\(|fold\(|PartnerLedgerContract" services shared clients
```

```text
shared/common/.../PartnerLedgerContract.java:18: public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT, JOURNAL_ONLY }
services/accounting-service/.../PartnerLedgerReadModel.java:39: public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT, JOURNAL_ONLY }
services/accounting-service/.../PartnerLedgerReadModelService.java:64: openingBalances(from, openingSales, ...)
services/slip-service/.../SlipInternalController.java:78: PartnerLedgerContract.CANONICAL_SALE_STATUSES
```

영향 테스트 명령:

```text
.\gradlew :shared:common:test --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest --tests com.samhanair.logis.accounting.service.LedgerImageServiceTest --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest --no-daemon
```

```text
BUILD SUCCESSFUL in 18s
23 actionable tasks: 2 executed, 21 up-to-date
```

Spring 컨텍스트 IT:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.it.ApplicationContextLoadIT --no-daemon
BUILD SUCCESSFUL in 35s
```

## 6. 동시 GREEN 원문

동시 GREEN 원문:

```text
PartnerLedgerContractTest: BUILD SUCCESSFUL
PartnerLedgerReadModelServiceTest 및 영향 accounting 테스트: BUILD SUCCESSFUL
ApplicationContextLoadIT: BUILD SUCCESSFUL
partnerLedgerApi.test.ts: 7 tests passed
slip-service compileJava: BUILD SUCCESSFUL

최종 재실행 원문:

```text
23 actionable tasks: 1 executed, 1 from cache, 21 up-to-date
BUILD SUCCESSFUL in 18s
partnerLedgerApi.test.ts: 1 passed / 7 tests passed
slip-service compileJava: BUILD SUCCESSFUL in 14s
git diff --check: output 없음
```
```

## 7. 변경 파일

- (신규) `docs/dev-reports/2026-08-04-1001-r36-opening-balance-sale-summary-fix.md`
- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java`
- `shared/common/src/test/java/com/samhanair/logis/common/ledger/PartnerLedgerContractTest.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModel.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelServiceTest.java`
- `clients/desktop/src/renderer/api/partnerLedgerApi.test.ts`

기존 미추적 파일 `clients/desktop/playwright/1001-r5-ledger-real-qa/`, `clients/desktop/playwright/1001-r6-ledger-real-qa/`, R35 보고서는 변경하지 않았다.
