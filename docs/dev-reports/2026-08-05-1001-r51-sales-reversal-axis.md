# #1001 R51 매출 취소 역분개 매출 축 fix

- 검증일: 2026-08-05 (Asia/Seoul)
- 대상: PR #1061 / 이슈 #1001 / `feat/1001-ledger-spec-rest`
- 범위: 거래처별 원장 공통 분류 계약과 그 참조 테스트만 수정
- 가드레일: git 명령, DB write, Docker 조작, 다른 트랙 파일 변경 없음

## 1. RED-first 원문과 fix 결과

### RED-A

추가한 `R51_RED_A_reversalSaleUsesNegativeSalesAxis`에서 현재 구현은 역분개를 매출로 투영하지 못했다.

```text
PartnerLedgerCollectionContractTest > R51_RED_A_reversalSaleUsesNegativeSalesAxis() FAILED
expected: SALE_SUMMARY
 but was: JOURNAL_ONLY
```

### RED-B

추가한 `R51_RED_B_keepsNonOperatingAdjustmentSeparateFromReversalSales`에서 같은 역분개 표본이 조정으로 남았다.

```text
PartnerLedgerCollectionContractTest > R51_RED_B_keepsNonOperatingAdjustmentSeparateFromReversalSales() FAILED
expected: SALE
 but was: ADJUSTMENT
```

처음 구성한 RED-B가 기본 overload의 레거시 상대 차변 의미와 충돌한 사실도 확인했다.

```text
expected: [ADJUSTMENT]
 but was: [ADJUSTMENT, PAYMENT]
```

이는 제품 결함이 아니라 정본 payable 계정 집합을 주입하지 않은 테스트 표본 문제였고, `Set.of("201", "2519")`를 주입해 표본을 교정했다.

### 원인과 fix

`PartnerLedgerCollectionContract.Bundle`가 채권 대변을 매출 계정 차변과 구분하지 않아 `110 C + 401 D`를 조정으로 보냈다. `recognizedRevenueDebit`를 별도로 누적하고, 채권 대변과 정본 매출 계정 차변이 동시에 있으면 채권 대변의 VAT 포함 금액을 음수 `SALE_SUMMARY / SALE`로 투영하도록 분기 순서를 수정했다.

| 표본 | 입력 | 기대/결과 |
|---|---|---|
| `2026/07/26-2` | `110 C330,000 / 255 D30,000 / 401 D300,000` | 매출 `-330,000`, 조정 아님 |
| `2026/07/27-4` | `110 C299,999 / 255 D27,272 / 401 D272,727` | 매출 `-299,999`, 조정 아님 |
| 잡이익 | `110 D67 / 9199 C67` | 조정 `+67` |
| 잡손실 | `9549 D842 / 110 C842` | 조정 `-842` |

매출 취소 합계는 `-629,999`이며 수금으로 이동하지 않는다. `9049` 매출, `102/110` 수금, `2519` 수수료 정산 분기는 기존 순서를 보존했다.

### GREEN

```text
BUILD SUCCESSFUL
:shared:common:test --tests ...PartnerLedgerCollectionContractTest
```

공통 계약 테스트 10건이 통과했다. 이어서 참조 계층 테스트도 통과했다.

## 2. 자기 표면 종료 조건

### 2.1 이번 fix로 새로 가능해진 계정·부호 조합과 각각의 결과

| 조합 | 분류 | 부호/산식 결과 |
|---|---|---|
| `110 C + 401 D` | `SALE_SUMMARY / SALE` | 채권 대변 VAT 포함액을 음수 매출로 기록 |
| `110 C + 401 D + 255 D` | `SALE_SUMMARY / SALE` | `-330,000`, `-299,999` 표본 모두 통과 |
| `110 D + 9199 C` | `JOURNAL_ONLY / ADJUSTMENT` | `+67`, 매출·수금 제외 |
| `9549 D + 110 C` | `JOURNAL_ONLY / ADJUSTMENT` | `-842`, 매출·수금 제외 |
| `110 C + 102 D` | `PAYMENT` | 기존 정상 수금 유지 |
| `110 C + 2519 D` | `PAYMENT` | 수수료 정산 유지 |
| `110 D + 9049 C` | `SALE_SUMMARY / SALE` | 임대료 매출 유지 |

`PartnerLedgerContract.fold()`의 불변식은 그대로 `기말 = 기초 + 매출 + 조정 − 수금`이다. 따라서 역분개 이동은 매출 합계만 음수로 바꾸며 기말 잔액은 동일하다.

R50의 read-only 실데이터 확인 기록과 이번 exact evidence 테스트를 대조했다. 지정된 두 전표의 계정 형태와 금액은 일치했고, 전제와 모순되는 실데이터 형태는 발견되지 않았다.

### 2.2 제거·이동·개명한 식별자 grep 전수 조사

제거·이동·개명한 기존 public 식별자는 **0건**이다. 기존 호환 식별자는 유지했다.

- 신규 내부 식별자: `recognizedRevenueDebit` 1개
- 유지 확인: `Effect.ADJUSTMENT`, `adjustmentTotal`, `SALE_SUMMARY`, `PartnerLedgerCollectionContract`
- grep 범위: `shared/common/src/main`, `shared/common/src/test`, `services/accounting-service/src/main`, `services/accounting-service/src/test`, 원장 desktop API/집계/상세/인쇄 테스트
- 역분개·조정·매출·수금 분기에서 제거된 리터럴 또는 소비처: 0건
- UUID 식별자 신규 노출: 0건

### 2.3 바꾼 파일을 참조하는 테스트 전부 실행

실행 범위는 변경 파일과 원장 세 경로의 직접 참조 테스트로 제한했다.

```text
.\gradlew.bat :shared:common:test :services:accounting-service:test `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest `
  --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest `
  --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest
→ BUILD SUCCESSFUL
```

```text
npx vitest run \
  src/renderer/api/partnerLedgerApi.test.ts \
  src/renderer/routes/PartnerLedgerPage.print.test.tsx \
  src/renderer/print/PartnerLedgerView.test.tsx
→ 3 files / 21 tests passed
```

세 경로가 동일한 공통 read model effect를 소비하는 기존 구조를 유지했으며, 집계·상세·인쇄 전용 분류 로직은 추가하지 않았다.

## 변경 파일 및 신규 파일

- `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java`
- `shared/common/src/test/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContractTest.java`
- 신규 보고서: `docs/dev-reports/2026-08-05-1001-r51-sales-reversal-axis.md`

Docker 재빌드·재배포, DB write, 전체 Gradle suite, 전체 Playwright gate는 수행하지 않았다.
