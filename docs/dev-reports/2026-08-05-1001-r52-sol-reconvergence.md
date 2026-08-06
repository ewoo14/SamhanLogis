# #1001 R52 SOL 2차 적대 재수렴

- 검증일: 2026-08-05 (Asia/Seoul)
- 대상: PR #1061 / 이슈 #1001
- 사용자 제공 HEAD: `1c893a81a` (가드레일에 따라 git 명령으로 재확인하지 않음)
- 단일 질문: **실 사용자 경로로 재현 가능한 결함이 있는가**
- 답: **없다. 재현 가능한 결함 0건이며 머지를 권고한다.**

## 1. R51 결정 반영 — 실데이터 대조

read-only SQL로 두 역분개의 활성 POSTED 원문을 다시 읽었다.

| 전표 | 실 분개 | R51 분류 | 매출 축 | 조정 축 |
|---|---|---|---:|---:|
| `2026/07/26-2` | `110 C330,000 / 255 D30,000 / 401 D300,000` | `SALE_SUMMARY / SALE` | `-330,000` | `0` |
| `2026/07/27-4` | `110 C299,999 / 255 D27,272 / 401 D272,727` | `SALE_SUMMARY / SALE` | `-299,999` | `0` |

두 문서는 서로 다른 2개 거래처 원장 view에 귀속되고, 합계 `-629,999원`이 매출 축에 잡힌다. `PartnerLedgerCollectionContract`는 `110` 대변과 정본 매출계정 `401` 차변을 함께 확인한 뒤 채권 대변 VAT 포함액을 음수 매출로 만들며, `PartnerLedgerContract.direction()`은 음수 movement를 양수 대변 칸으로 투영한다.

이 PC의 활성 line에는 환경 고지와 동일하게 `9049`, `9199`, `9549`, `1089`, `4019`, `2519`가 모두 0건이다. 없는 잡이익·잡손실을 실측했다고 쓰지 않는다. 현재 실데이터의 조정 축은 0건·0원이고, 계약 테스트 표본에서는 `9199`만 양수 조정, `9549`만 음수 조정으로 남으며 역분개는 조정에서 제외된다. `9049`는 매출 예외로 유지된다.

실데이터의 비-입금보고서 POSTED 거래처 view 재분류 결과는 다음과 같다.

```text
양수 매출       29건   453,860,000원
역분개 매출      2건      -629,999원
매출 축 합계    31건   453,230,001원
정상 수금        6건     6,600,000원
조정             0건             0원
```

## 2. 첫 각도 고정 — 금액 소실·정상 경로 차단

- R51로 화면에서 사라진 문서: **0건**
- R51로 화면에서 사라진 금액: **0원**
- R51로 새로 차단된 정상 문서: **0건**
- 정상 `102 D / 110 C` 수금: **6건·6,600,000원 유지**
- 확정 입금보고서: **3건·277,000원 유지** (`BANK_LINKED` 2건·200,000원, `MANUAL_RECEIPT` 1건·77,000원)
- 취소·DRAFT 입금보고서는 정본 수금에서 계속 제외

축 이동 전후 전체 기간 증감은 확정 입금보고서까지 포함해 동일하다.

```text
R50: 매출 453,860,000 + 조정(-629,999) - 수금 6,877,000 = 446,353,001
R51: 매출 453,230,001 + 조정 0         - 수금 6,877,000 = 446,353,001
차이: 0원
```

따라서 같은 기초 잔액에 대한 기말 잔액도 원 단위로 불변이다.

## 3. R51 자기 표면 — 소비처 전수 검색

`PartnerLedgerContract.Effect.SALE`, `salesTotal`, `SALE_SUMMARY`, `LedgerSnapshotResponse`, `PartnerLedgerResponse`, `SalesAggregateRow`를 `shared/common`, `accounting-service`, desktop renderer의 Java/TypeScript/TSX 생산·소비처에서 전수 검색했다. `salesTotal`을 양수로 clamp하거나, 0 이하 행을 제거하거나, 절댓값으로 바꾸는 production 소비처는 0건이다.

- 공통 fold: signed `entry.amount()`를 그대로 `salesTotal`에 더하고 `매출 + 조정 - 수금`으로 기말을 계산한다.
- 집계: `SalesAggregateService`는 공통 read model의 signed `salesTotal`을 `SalesAggregateRow`에 그대로 전달한다.
- 상세: `SALE_SUMMARY`의 음수 amount는 양수 대변으로 line화되고 누적 잔액에서 차감된다. `fmtKrw`와 음수 색상 처리도 음수를 숨기지 않는다.
- CSV: signed 문자열을 그대로 내보낸다.
- 인쇄: 상세와 같은 documents/lines를 사용하며 `effect=SALE`을 `매출`로 표시하고 대변·잔액을 보존한다.
- snapshot: 음수 `BigDecimal`에 양수 validation이나 clamp가 없다. `SALE_SUMMARY`는 snapshot 행 수 1건으로 보존된다.
- 검색 중 나온 회계보고서의 동명 `salesTotal`과 dashboard의 별도 sales aggregate 계약은 거래처 원장 DTO 소비처가 아니므로 R51 자기 표면에서 분리했다.

제거·이동·개명한 public 식별자는 0건이다. R51 신규 내부 식별자 `recognizedRevenueDebit`은 분류기 내부에만 있으며 외부 응답·화면 식별자로 노출되지 않는다.

## 4. 기존 snapshot 14건 복원

`accounting_db.tax_invoice_batches`의 활성 `PARTNER_LEDGER` snapshot은 실제 14건이다. 원문을 read-only로 gzip+base64 해제한 결과 전부 유효 JSON이었다.

- 신형 `documents` payload: 1건, document 1행
- legacy `lines` payload: 13건, line 73행
- 기존 payload의 `adjustmentTotal`: 14건 모두 없음

실행 중 accounting-service의 사용자 조회 endpoint `GET /accounting/journals/ledger-history/{batchNo}/restore`를 `dev_accountant` 권한 경로로 14건 모두 호출했다. 결과는 **HTTP 성공 14/14, 실패 0, 총 74행 복원**이다. 신형 1건은 documents 경로, legacy 13건은 lines 경로로 복원됐다. DB write는 없었다.

HEAD 코드에서도 누락 `adjustmentTotal`은 backend compact constructor와 desktop `?? '0'` fallback으로 0 처리하며, documents/lines 분기는 기존 행을 유지한다.

## 5. 신선한 표적 검증

캐시 결과에 기대지 않도록 Gradle은 `--rerun-tasks`로 다시 실행했다.

```powershell
.\gradlew.bat :shared:common:test :services:accounting-service:test --rerun-tasks `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest `
  --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest `
  --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest
```

결과: `BUILD SUCCESSFUL`, **62 tests / failures 0 / errors 0 / skipped 0**.

```powershell
npx vitest run `
  src/renderer/api/partnerLedgerApi.test.ts `
  src/renderer/routes/PartnerLedgerPage.print.test.tsx `
  src/renderer/print/PartnerLedgerView.test.tsx
```

결과: **3 files / 21 tests passed**.

## 6. 보지 않은 범위

- Docker 재빌드·재배포·중지와 DB write를 하지 않았다. 따라서 HEAD R51 바이너리를 새로 배포한 GUI 클릭 검증은 하지 않았다.
- 이 PC에 0건인 `9049`, `9199`, `9549`, `1089`, `4019`, `2519`는 계약 테스트로만 확인했고 실데이터가 있다고 주장하지 않는다.
- 전체 Gradle suite, 전체 Playwright gate, 다른 회계 화면과 다른 트랙 PR 기능은 보지 않았다.
- `clients/desktop/playwright/1001-*` 미추적 파일은 열거나 변경하지 않았다.
- 개발책임자 결정으로 종결된 `SYSTEM_SEED` 정책 자체는 재심하지 않았다.

## 7. 최종 판정

**실 사용자 경로로 재현 가능한 결함 0건. 머지를 권고한다.**

R51은 실제 역분개 2건·629,999원을 조정이 아닌 음수 매출로 옮겼고, 정상 수금 6건·6,600,000원과 확정 입금 3건·277,000원을 건드리지 않았다. 축 이동 전후 기말 영향은 0원이며, 집계·상세·CSV·인쇄·snapshot 소비처와 기존 snapshot 14건에서 금액 소실 또는 차단은 재현되지 않았다.

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-05-1001-r52-sol-reconvergence.md`
