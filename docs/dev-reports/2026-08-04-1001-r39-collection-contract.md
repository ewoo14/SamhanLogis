# PR #1001 R39 수집·분류 계약 재설계

- 라운드: R39
- 작업 루트: `C:\dev\Samhan-Public\.claude\worktrees\t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 기준 HEAD: `0560d83847b294b7bfd16a5695e5f8bf8ba9c5b0`
- 시작 시각: 2026-08-04 (KST)
- 커밋/푸시: 수행하지 않음 (PM 대행)
- 컨테이너 조작: 수행하지 않음

## 1. 시작 기준

R38 진단 문서 `docs/dev-reports/2026-08-04-1001-r38-collection-stage-diagnosis.md`를 먼저 읽고 착수했다. 이번 라운드는 개별 조건 완화가 아니라 문서 단위 식별·중복제거·업무효과 분류 계약을 세우는 작업으로 진행한다.

## 2. 채택 설계 및 R38 대비 변경

채택한 흐름은 다음과 같다.

`journal/slip 원자 evidence → sourceKey 단위 bundle → PartnerLedgerCollectionContract 분류(DocumentType + Effect) → PartnerLedgerContract.fold → 집계·상세·인쇄·snapshot`

- 공통 모듈에 `PartnerLedgerCollectionContract`를 추가했다. 거래처+기간 boolean/계정 합계가 문서 분류를 결정하지 않는다.
- `PartnerLedgerContract.Entry`에 `Effect(SALE|PAYMENT|NONE)`를 추가하고 `fold`는 문서 타입이 아니라 효과만 합산한다. `JOURNAL_ONLY + PAYMENT`가 가능해져 D3를 표현한다.
- 기초도 `findPartnerLinesUpTo`의 동일 분류 결과를 fold한다. 기간은 `findPartnerLinesInRange`의 동일 분류 결과를 사용한다.
- `CASH_RECEIPT` journal은 기간 분류에서 제외하고 확정 `cash_receipts`만 정본으로 읽어 이중 계상을 막는다.
- R38의 “source key를 내부 API로 제공” 제안을 적용해 slip projection/client에 내부 `slipId`를 추가했다. 외부 사용자 화면 식별자는 기존 slipNo로 유지한다.
- R38가 제안한 별도 `source kind` enum 대신 기존 `JournalSourceType` 문자열과 `Evidence` factory를 사용했다. source kind를 한 번 더 복제하면 상태/직렬화 계약이 두 벌이 되므로 이번 범위에서는 최소 변경으로 제한했다.
- legacy 생성자 테스트 호환을 위해 line detail이 비어 있을 때만 aggregate evidence를 같은 collection contract에 넣는다. 정상 Spring 경로에서는 line 단위 분류가 우선한다. raw line 표시 fallback은 매출/수금 효과를 부여하지 않는 표시 전용 compatibility 경로로 남겼다.

## 3. RED 5개 원문

구현 전 추가한 `PartnerLedgerCollectionContractTest`의 원문 테스트명과 핵심 assertion이다.

```text
RED-A1  RED_A1_keepsJournalSaleWhenCanonicalSaleAlsoExists
        SALE(1,100) + SLIP journal(2,200) => Effect.SALE 2건, amount [1,100, 2,200]
RED-A2  RED_A2_limitsSaleSummaryToTheJournalOwnReceivableAmount
        SLIP journal 110 차변 3,300 + SYSTEM_SEED 7,700 => 첫 amount 3,300, seed Effect.NONE
RED-A3  RED_A3_classifiesNonCashReceivableCreditAsPayment
        MANUAL 102 차변 + 110 대변 7,600 => Effect.PAYMENT
RED-A4  RED_A4_partitioningEvidenceByDateProducesTheSameFoldAsOnePeriod
        전일 100 + 경계일 200을 합친 fold == 기초 fold 후 기간 fold
RED-B1  RED_B1_effectIsTheOnlySourceForClosingFormula
        opening 50 + sale 1,000 - payment 300 = closing 750
```

최초 RED 실행 원문:

```text
./gradlew :shared:common:test --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest --no-daemon
> Task :shared:common:compileTestJava FAILED
error: package PartnerLedgerCollectionContract does not exist
error: cannot find symbol PartnerLedgerContract.Effect
28 errors
BUILD FAILED
```

계약 구현 후 동일 5개 테스트 원문:

```text
./gradlew :shared:common:test --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest --no-daemon
> Task :shared:common:test
BUILD SUCCESSFUL in 10s
5 tests completed
```

## 4. 거래처별 금액 변화

실 DB를 이번 라운드에서 쓰거나 컨테이너를 조작하지 않았으므로 아래는 R38이 HEAD R36과 현재 cohort에서 계산한 현재→계약 후 예상치다. 계약 구현의 보정량 합계는 R38 예상치와 동일하다.

| 거래처 | 현재 | 변경 후 | 변화 | 원인 |
|---|---:|---:|---:|---|
| P-2026-0006 | 6,316,200 | 20,616,200 | +14,300,000 | orphan SALE_SUMMARY |
| P-2026-0007 | 17,209,500 | 50,209,500 | +33,000,000 | orphan SALE_SUMMARY |
| P-2026-0008 | 12,679,700 | 31,379,700 | +18,700,000 | orphan SALE_SUMMARY |
| P-2026-0009 | 4,683,800 | 9,083,800 | +4,400,000 | orphan SALE_SUMMARY |
| P-2026-0017 | 12,276,000 | 34,276,000 | +22,000,000 | orphan SALE_SUMMARY |
| P-2026-0018 | 24,646,600 | 32,346,600 | +7,700,000 | orphan SALE_SUMMARY |
| P-2026-0019 | 21,575,400 | 47,975,400 | +26,400,000 | orphan SALE_SUMMARY |
| P-2026-0026 | 5,656,200 | 30,956,200 | +25,300,000 | orphan SALE_SUMMARY |
| P-2026-0027 | 15,559,500 | 26,559,500 | +11,000,000 | orphan SALE_SUMMARY |
| P-2026-0028 | 30,567,900 | 60,267,900 | +29,700,000 | orphan SALE_SUMMARY; R13 금액 갱신 |
| P-2026-0029 | 23,122,000 | 38,522,000 | +15,400,000 | orphan SALE_SUMMARY |
| P-2026-0030 | 4,048,000 | 5,148,000 | +1,100,000 | orphan SALE_SUMMARY |
| P-2026-0001 | 22,000,000 | 19,800,000 | −2,200,000 | SYSTEM_SEED 분리 |
| P-2026-0002 | 9,020,000 | 5,500,000 | −3,520,000 | SYSTEM_SEED 분리 |
| P-2026-0003 | 26,180,000 | 24,200,000 | −1,980,000 | SYSTEM_SEED 분리 |
| P-2026-0032 | 기말 1,633,500 | 기말 933,500 | −700,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0033 | 기말 5,068,800 | 기말 4,268,800 | −800,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0035 | 기말 21,428,000 | 기말 20,428,000 | −1,000,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0036 | 기말 3,682,800 | 기말 2,582,800 | −1,100,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0037 | 기말 10,626,000 | 기말 9,426,000 | −1,200,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0038 | 기말 21,687,600 | 기말 20,387,600 | −1,300,000 | 비-CASH_RECEIPT 회수 |
| P-2026-0040 | 기말 19,415,000 | 기말 17,915,000 | −1,500,000 | 비-CASH_RECEIPT 회수 |
| **합계 보정** |  |  | **+193,700,000** | R38 예상치 `+209,000,000 − 7,700,000 − 7,600,000`와 일치 |

## 5. 4벌 규칙 전수 정리

전수 grep 원문:

```text
rg -n "salesSeen|journalReceivableDebit|journalPaymentTotal|aggregateAgingByAccount|journalDocuments\(|saleSummaryDocument\(|aggregatePostedByPartnerAccount\(|JournalLineRepository\.PartnerAccountTotal" services/accounting-service/src/main/java shared/common/src/main/java
```

결과 판정:

1. `PartnerLedgerReadModelService`: 활성 정본. 기간 journal은 `findPartnerLinesInRange` → `PartnerLedgerCollectionContract`, 기초는 `findPartnerLinesUpTo` → 같은 계약 → `fold`로 통일했다. `salesSeen`/`journalReceivableDebit`/`journalPaymentTotal`은 분류 판단에서 제거했다.
2. `SalesAggregateService`: 정상 Spring에서는 read-model에 위임한다. 생성자 호환 fallback은 기존 unit test와 legacy 호출자를 위해 남아 있으며, 다음 라운드에 제거할 수 있다. 다만 이번 fallback도 account 합계를 직접 fold하지 않고 read-model 계약을 우선한다는 경계를 유지했다.
3. `PartnerLedgerReadService`: 정상 Spring에서는 read-model 위임, null read-model의 legacy 상세 fallback은 유지했다. 이 경로는 `SALE`/`CASH_RECEIPT` 표시 compatibility만 제공하고 journal 매출·수금 효과를 새로 판정하지 않는다.
4. `LedgerImageService`/`/accounting/journals/ledger-data`: 구형 raw journal 원장이다. 신규 거래처 원장 집계·상세·인쇄·snapshot의 source로 사용하지 않고, 기존 endpoint 호환 때문에 이번 라운드에서 제거하지 않았다.

따라서 활성 거래처 원장의 문서 분류 규칙은 1벌이다. 남은 2~4번은 표시/생성자 호환 또는 별도 구형 raw endpoint이며, 새 collection effect를 재추론하지 않는다.

## 6. 종료조건 검증 원문

### 6.1 새 조합 열거

| 조합 | 처리 | 검증 |
|---|---|---|
| slip + SLIP journal, 서로 다른 sourceKey | 각각 SALE + SALE_SUMMARY | RED-A1 |
| slip + 동일 sourceRefId journal | journal bundle skip, slip만 SALE | 내부 slipId/sourceRefKey dedup 경로 |
| journal 110 차변 + SYSTEM_SEED 110 차변 | 업무 journal만 SALE_SUMMARY, seed NONE | RED-A2 |
| CASH_RECEIPT journal + 확정 cash_receipt | journal 제외, cash_receipt 1회 PAYMENT | 기존 `SalesAggregateServiceTest` 중복 방지 GREEN |
| 비-CASH_RECEIPT 102 차변 + 110 대변 | JOURNAL_ONLY + PAYMENT | RED-A3 |
| 기간 경계 당일 | `date < from` 기초, `from <= date <= to` 기간 | RED-A4 |
| 기초만 있는 거래처 | 기간 문서 0, opening fold로 행 유지 | 기존 `RED_A1_priorConfirmedSale...` GREEN |
| journal만 있고 master가 있는 거래처 | contract 문서로 행 생성 | 기존 `journalOnly...` GREEN |
| 무필터 정상 master | batch lookup 결과로 차단 없이 표시 | 기존 무필터 테스트 GREEN |

### 6.2 명령·출력 원문

```text
./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest --no-daemon
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 16s
29 tests completed
```

```text
./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.it.ApplicationContextLoadIT --no-daemon
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 32s
```

```text
./gradlew :services:accounting-service:compileJava :services:slip-service:compileJava --no-daemon
> Task :services:slip-service:compileJava
> Task :services:accounting-service:compileJava
BUILD SUCCESSFUL in 16s
```

## 7. 동시 GREEN

- `shared:common` 계약 테스트 5개 + 기존 `PartnerLedgerContractTest` GREEN.
- `PartnerLedgerReadModelServiceTest` 29개 및 `SalesAggregateServiceTest` 지정 범위 GREEN.
- accounting-service compile 및 slip-service compile GREEN.
- `ApplicationContextLoadIT` GREEN.
- 전체 Gradle suite, Docker, DB write, commit/push는 수행하지 않았다.

최종 최신 재검증 원문:

```text
./gradlew :shared:common:test :services:accounting-service:test --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest --no-daemon
BUILD SUCCESSFUL in 12s
23 actionable tasks: 1 executed, 22 up-to-date
```

```text
./gradlew :services:accounting-service:compileJava :services:slip-service:compileJava --no-daemon
BUILD SUCCESSFUL in 10s
8 actionable tasks: 8 up-to-date
```

```text
./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.it.ApplicationContextLoadIT --no-daemon
BUILD SUCCESSFUL in 32s
21 actionable tasks: 1 executed, 20 up-to-date
```

## 8. 변경 파일

### 신규

- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java`
- `shared/common/src/test/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContractTest.java`
- `docs/dev-reports/2026-08-04-1001-r39-collection-contract.md`

### 수정

- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/JournalLineRepository.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModel.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java`

### 미실행/미변경

- `git add`, `commit`, `push` 미실행.
- Docker 재빌드·컨테이너 조작·DB 직접 쓰기 미실행.
- R13 snapshot `LED-20260804-000001` 데이터 자체는 변경하지 않았다. 새 effect 필드는 구형 역직렬화 시 타입 기본값으로 보완된다.
- 시작 시점부터 존재하던 미추적 `clients/desktop/playwright/1001-r5-ledger-real-qa/`, `clients/desktop/playwright/1001-r6-ledger-real-qa/`, `docs/dev-reports/2026-08-04-1001-r37-sol-reconvergence.md`, `docs/dev-reports/2026-08-04-1001-r38-collection-stage-diagnosis.md`는 건드리지 않았다.
