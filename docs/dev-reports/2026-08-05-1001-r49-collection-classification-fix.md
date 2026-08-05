# #1001 R49 거래처별 원장 분류 계약 fix

- 검증일: 2026-08-05 (Asia/Seoul)
- 대상: PR #1061 / 이슈 #1001 / 워크트리 `t1001b`
- 라이브 재현: **불가 — 표본 0건**

## 1. 결론

`PartnerLedgerCollectionContract`가 채권 차변을 상대 계정 확인 없이 `SALE_SUMMARY/SALE`로 만들고, 채권 대변과 임의의 차변을 모두 `PAYMENT`로 만들던 분류를 수정했다.

- `9049 수입임대료`: 레거시 매출장의 세금계산서 매출이라는 R48 근거에 따라 `SALE_SUMMARY / SALE` 유지
- `9199 잡이익`: 매출로 단정하지 않고 `JOURNAL_ONLY / ADJUSTMENT`
- `9549 잡손실`: 현금 회수가 아니므로 `JOURNAL_ONLY / ADJUSTMENT`
- `2519 외상매입금` 수수료 정산: `PAYMENT` 유지
- 기존 현금·예금 `102` 정산: `PAYMENT` 유지

조정 금액을 별도 축으로 보존했다. 공통 산식은 다음과 같다.

```text
기말 = 기초 + 매출 합계 + 조정 합계 - 수금 합계
```

따라서 잡이익·잡손실을 매출/수금에서 제외해도 기말 잔액 설명에서 사라지지 않는다. 집계에는 `조정 합계`, 상세와 인쇄에는 `구분=조정`을 추가했다. UUID는 새로 노출하지 않는다.

## 2. RED-first 원문과 GREEN 결과

### RED-A

추가 테스트: `PartnerLedgerCollectionContractTest.RED_A5_keepsRentAsSaleAndFeeSettlementAsPayment`

최초 RED 원문은 새 4인자 계약과 `ADJUSTMENT` 효과가 아직 없어 컴파일에서 실패했다.

```text
no suitable method found for classify(List<Evidence>,Set<String>,Set<String>,Set<String>)
cannot find symbol: variable ADJUSTMENT
```

수정 후 결과:

- `9049`가 포함된 임대료 `4,180,000` → `SALE_SUMMARY`, effect `SALE`
- `2519` 수수료 정산 `412,500` → effect `PAYMENT`
- 기말 산식은 기존 `sales - payment`에 조정 축만 추가하며 기존 매출/수금 값과 잔액은 보존

### RED-B

추가 테스트: `PartnerLedgerCollectionContractTest.RED_B2_excludesNonOperatingGainAndLossFromSalesAndPayments`

생산 코드 적용 직후 첫 실패는 의도한 분류 경계가 아직 반영되지 않은 상태였다.

```text
expected: SALE_SUMMARY
 but was: JOURNAL_ONLY

Expecting ArrayList: [ADJUSTMENT, NONE]
to contain only: [ADJUSTMENT]
```

수정 후 결과:

- `9199` 잡이익 `67` → `ADJUSTMENT`, 매출 합계 `0`
- `9549` 잡손실 `842` → `ADJUSTMENT`, 수금 합계 `0`
- 조정 합계 `67 - 842 = -775`
- 기초 `1,000`의 기말 `225` 유지

## 3. 구현 범위

- 공통 `Effect.ADJUSTMENT` 및 `Totals.adjustmentTotal` 추가
- `PartnerLedgerCollectionContract`에 payable/settlement 계정 의미를 전달하는 4인자 분류 overload 추가
- 상대 차변을 계정별로 판정해 payable `2519` 및 현금/예금 `102`만 PAYMENT로 인정
- `9049`를 명시적 매출 예외로 유지
- 그 외 채권 변동은 ADJUSTMENT로 분류하고 부호/차변·대변을 보존
- accounting read model, aggregate DTO, ledger response, snapshot response에 조정 합계/effect 전달
- desktop 집계·상세·인쇄가 동일 effect를 소비

## 4. 자기 표면 종료 조건

### 4.1 새로 가능해진 조합·부호 조합과 결과

| 조합 | 부호 | 결과 |
|---|---|---|
| `1089 D + 9049 C + 2559 C` | 채권 차변 양수 | SALE 유지, 임대료 `4,180,000` |
| `1089 D + 9199 C` | 채권 차변 양수 | ADJUSTMENT `+67`, 매출 제외 |
| `9549 D + 1089 C` | 채권 대변 양수 | ADJUSTMENT `-842`, 수금 제외 |
| `1089 C + 2519 D` | 채권 대변 양수 | PAYMENT `+412,500`, 수금 유지 |
| `1089 C + 102 D` | 채권 대변 양수 | PAYMENT, 기존 현금/예금 회수 회귀 없음 |
| ADJUSTMENT 양수/음수 혼합 | `+67`, `-842` | 조정 합계에 signed movement로 누적, 기말 산식 유지 |

실제 회사PC 분개는 이 워크트리에 없으므로 라이브 SQL/화면 재현은 수행하지 않았다. **라이브 재현 불가 — 표본 0건**이다.

### 4.2 제거·이동·개명 식별자 grep 전수 조사

제거하거나 개명한 public 식별자는 없다. 기존 `SALE_SUMMARY`, `JOURNAL_ONLY`, `매출 합계`, `수금 합계`는 호환성을 위해 유지했고, 새 식별자는 아래로 한정했다.

```text
Effect.ADJUSTMENT
Totals.adjustmentTotal
PartnerLedgerReadModel.Partner.adjustmentTotal
PartnerLedgerResponse.adjustmentTotal
LedgerSnapshotResponse.adjustmentTotal
SalesAggregateRow.adjustmentTotal
SalesAggregateRow.adjustmentTotal (FE)
LedgerLine.effect
PartnerLedgerSourceDocument.effect
```

grep 확인 범위:

- `shared/common/src/main/**`: `Effect`, `Totals`, collection 분류
- `services/accounting-service/src/main/**`: read model, service, response/snapshot/aggregate DTO
- `clients/desktop/src/renderer/**`: API mapping, aggregate table, detail table, print view
- 상세의 기존 `SALE_SUMMARY` 하드코딩 라벨은 제거했고 effect 기반 라벨로 이동했다.

### 4.3 변경 파일을 참조하는 테스트

실행한 좁은 테스트:

```text
./gradlew :shared:common:test \
  --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest \
  --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest
→ BUILD SUCCESSFUL

./gradlew :services:accounting-service:test \
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest \
  --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest \
  --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest
→ BUILD SUCCESSFUL

npx vitest run \
  src/renderer/api/partnerLedgerApi.test.ts \
  src/renderer/routes/PartnerLedgerPage.print.test.tsx \
  src/renderer/print/PartnerLedgerView.test.tsx
→ 3 files / 21 tests passed
```

전체 웹 타입체크는 실행했으나 이번 변경과 무관한 기존 `InventoryStockBalancePage.tsx`의 `copyValue` 3건 및 implicit-any 3건으로 실패했다. 해당 다른 트랙 파일은 수정하지 않았다. `npm test` wrapper도 오래된 design-system dist 신선도 가드에서 중단되어, 대상 Vitest를 직접 실행했다.

## 5. 검증 제한과 신규 파일

- Docker 재빌드·재배포·컨테이너 중지 없음
- DB write 및 라이브 QA 없음
- 전체 Gradle/Playwright 게이트 없음
- UUID 신규 노출 없음

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-05-1001-r49-collection-classification-fix.md`

