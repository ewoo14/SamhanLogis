# #1001 R50 SOL 2차 적대 재수렴

- 검증일: 2026-08-05 (Asia/Seoul)
- 대상: PR #1061 / 이슈 #1001 / 브랜치 `feat/1001-ledger-spec-rest`
- 사용자 제공 HEAD: `28aab301b` (가드레일에 따라 git 명령으로 재확인하지 않음)
- 단일 질문: **실 사용자 경로로 재현 가능한 결함이 있는가**
- 답: **없다. 재현 가능한 결함 0건이며 머지를 권고한다.**

## 1. R47 도달 결함 2건의 폐쇄 대조

R47이 회사PC에서 인용한 `20260501-15`, `20260507-226`, `20260511-174`, `20260519-66`은 이 PC에 없다. 없는 전표를 실측 근거로 재사용하지 않았다. 이 PC의 활성 line에서도 `9049`, `9199`, `9549`는 모두 0건이다.

HEAD 계약은 다음처럼 닫혀 있다.

- `1089 D + 9049 C`: `SALE_SUMMARY / SALE`로 유지한다. 임대료 세금계산서 매출을 매출 합계에서 없애지 않는다.
- `1089 D + 9199 C`: `JOURNAL_ONLY / ADJUSTMENT(+금액)`로 분리한다. 매출 합계에서는 빠지지만 조정 합계와 기말에는 남는다.
- `9549 D + 1089 C`: `JOURNAL_ONLY / ADJUSTMENT(-금액)`로 분리한다. 수금 합계에서는 빠지지만 조정 합계와 기말에는 남는다.
- 공통 산식은 `기말 = 기초 + 매출 + 조정 - 수금`이다.

좌표는 `PartnerLedgerCollectionContract`의 `9049` 매출 인정 및 `adjustment(...)` 분기, `PartnerLedgerContract.fold()`의 adjustment 누적이다. 지정 계약 테스트에서 R47 표본 모형인 임대료·잡이익·잡손실·수수료 정산 양방향 사례가 통과했다.

따라서 R47 §4의 수입임대료·잡이익 동시 오분류는 `9049=매출`, `9199=조정`으로 분리됐고, §5의 잡손실 수금 오분류는 `9549=음수 조정`으로 분리됐다. 이 PC에는 해당 계정 표본이 없으므로 라이브 건수를 만들어 내지 않았다.

## 2. ADJUSTMENT 자기 표면

### 2.1 집계·상세·인쇄 일치

세 경로는 같은 `PartnerLedgerReadModelService.read()` 결과를 소비한다.

- 집계: `SalesAggregateService.aggregate()`가 partner의 `salesTotal`, `paymentTotal`, `adjustmentTotal`, `receivableBalance`를 그대로 `SalesAggregateRow`에 넣는다.
- 상세: `PartnerLedgerReadService.read()`가 같은 partner 합계와 document effect를 `PartnerLedgerResponse`로 옮긴다.
- 인쇄: `PartnerLedgerView`가 상세와 같은 `getLedgerData()`를 호출하고 line의 `effect`를 `매출/수금/조정`으로 표시한다.
- 화면 상세와 인쇄는 모두 `buildPartnerLedgerLines()`가 문서의 debit/credit를 누적한 같은 line 모델을 사용한다.

이 PC POSTED 분개의 R49 신규 조정 표면은 역분개 2건·629,999원이다.

| 실제 전표 | 분개 | R49 표시 | 금액 보존 |
|---|---|---|---:|
| `2026/07/26-2` | `110 C330,000 / 255 D30,000 / 401 D300,000` | 조정 | `-330,000` |
| `2026/07/27-4` | `110 C299,999 / 255 D27,272 / 401 D272,727` | 조정 | `-299,999` |

R49 전에는 임의 차변 때문에 수금으로 분류되던 두 역분개가 수금에서 빠졌지만, 조정 합계 `-629,999`와 기말에 전액 남는다. 집계에서 사라지는 금액 0원, 상세에서 사라지는 문서 0건, 인쇄에서 사라지는 line 0건이다.

### 2.2 변경 DTO의 다른 소비처 전수 검색

소스·테스트 확장자로 `LedgerSnapshotResponse`, `PartnerLedgerResponse`, `SalesAggregateRow`, `adjustmentTotal`, 관련 endpoint를 전수 검색했다.

- `LedgerSnapshotResponse`의 생산·소비는 accounting-service snapshot restore와 desktop 원장 API/화면에 한정된다.
- `PartnerLedgerResponse`의 생산·소비는 accounting-service 원장 read/capture/restore와 desktop 원장 상세·인쇄에 한정된다.
- `SalesAggregateRow`의 production 생성자는 `SalesAggregateService` 세 곳이며 모두 새 인자를 제공한다. production 주입 경로는 공통 read model 값을 사용하고, legacy fallback 두 곳은 조정 0을 명시한다.
- dashboard-service의 `/admin/dashboard/sales-aggregate`는 이름이 비슷한 별도 계약이며 이 DTO를 소비하지 않는다.
- desktop의 새 필드는 optional이며 구형 응답에는 `?? '0'` fallback이 적용된다.

다른 화면·다른 서비스에서 깨진 소비처는 0건이다.

### 2.3 기존 snapshot 무필드 복원

`accounting_db.tax_invoice_batches`의 활성 `PARTNER_LEDGER` snapshot 14건을 DB write 없이 gzip+base64 해제했다.

- legacy `lines` payload: 13건, `adjustmentTotal` 없음.
- `documents` payload: 1건(`LED-20260804-000001`), `adjustmentTotal`과 document `effect` 없음.

백엔드는 root에 `documents`가 있으면 `PartnerLedgerResponse`, 없으면 `LedgerImageResponse`로 복원한다. 각 response compact constructor가 누락된 `adjustmentTotal`을 0으로 보정하며, legacy `lines`는 그대로 보존한다. desktop도 `adjustmentTotal ?? '0'` 및 `documents`/`lines` fallback을 사용한다. 실제 14건에서 새 필드 부재 때문에 화면 행이 비는 대상은 0건이다.

## 3. 계정 리터럴과 이 PC 실데이터 분포

사용자 제공 환경 수치를 read-only SQL로 재확인했다.

```text
활성 journals 125건 (그중 POSTED 89건)
활성 line: 110=91, 102=49, 401=42, 220=34, 101=20, 103=10, 814=9, 255=7
1089=0, 4019=0, 2519=0, 9049=0, 9199=0, 9549=0
```

화면 read model이 실제 소비하는 POSTED·비-`CASH_RECEIPT` journal을 `110` 거래처 view 단위로 재분류한 결과다.

| R49 effect | view | 금액 |
|---|---:|---:|
| SALE | 29 | 453,860,000원 |
| PAYMENT | 6 | 6,600,000원 |
| ADJUSTMENT(음수) | 2 | -629,999원 |
| SYSTEM_SEED 제외 | 3 | 7,700,000원 |

리터럴 `102`가 잡은 실제 회수는 MANUAL 6건·6,600,000원이며 모두 `102 보통예금 D / 110 외상매출금 C`다. 활성 분포에는 `101 현금` 20라인과 `103 당좌예금` 10라인이 있지만, POSTED 전표에서 `110` 대변과 결합한 view는 각각 0건이다. 따라서 `102`만 인정한 변경 때문에 실재 수금이 조정으로 이동한 건수는 0건·0원이다.

`201 외상매입금`과 `110` 대변의 결합도 0건이고, `9049` 자체도 0건이다. 다른 실제 계정 때문에 새 축이 잘못 선택된 사례는 없다. `404` 상대의 `110` 차변 3 view·7,700,000원은 모두 기존 `SYSTEM_SEED` 제외 분기에 먼저 걸리며 R49 전후 변화가 0이다.

## 4. 첫 각도 고정 판정

- R49 때문에 새로 차단된 정상 문서: **0건**.
- R49 때문에 화면에서 사라진 금액: **0원**.
- 정상 수금 유지: MANUAL `102/110` **6건·6,600,000원**.
- 확정 입금보고서 유지: `cash_receipts` **3건·277,000원**. 자동분개 journal은 중복 제외되고 receipt 문서로 한 번만 들어간다.
- 역분개가 수금에서 조정으로 이동: **2건·629,999원**, 조정/기말에 전액 보존.
- `101/103`의 미인정으로 이동한 실수금: **0건·0원**.

## 5. 실행한 좁은 검증

```powershell
.\gradlew.bat :shared:common:test :services:accounting-service:test `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerCollectionContractTest `
  --tests com.samhanair.logis.common.ledger.PartnerLedgerContractTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest `
  --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest `
  --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest `
  --tests com.samhanair.logis.accounting.service.SalesAggregateServiceTest
```

결과: `BUILD SUCCESSFUL`, 대상 60 tests / failures 0 / errors 0 / skipped 0.

```powershell
npx vitest run `
  src/renderer/api/partnerLedgerApi.test.ts `
  src/renderer/routes/PartnerLedgerPage.print.test.tsx `
  src/renderer/print/PartnerLedgerView.test.tsx
```

결과: 3 files / 21 tests passed.

## 6. 보지 않은 범위

- Docker 재빌드·재배포·중지 및 DB write를 하지 않았다. 따라서 HEAD 배포본의 live 화면은 실행하지 않았다.
- R47 회사PC 전표와 회사PC 805개 거래처 전수 수치는 이 PC에 없어 재인용하지 않았다.
- 전체 Gradle suite, 전체 Playwright gate, 다른 트랙 PR의 기능은 보지 않았다.
- 거래처 원장 계약을 소비하지 않는 일반 회계 화면과 외부 import/reimport 미래 데이터는 판정하지 않았다.
- 개발책임자 결정으로 종결된 `SYSTEM_SEED` 제외 정책 자체는 재심하지 않았다.

## 7. 최종 판정

**재현 가능한 결함 0건. 머지를 권고한다.**

R47의 두 오분류는 `SALE / ADJUSTMENT / PAYMENT` 축으로 분리됐고, 홈PC 실데이터에서 R49가 실제로 바꾼 역분개 2건·629,999원은 조정 축과 기말에 보존된다. 실제 수금 6건·6,600,000원 및 확정 입금 3건·277,000원은 유지된다. 세 화면, 변경 DTO 소비처, 기존 snapshot 14건에서 사용자 도달 파손은 재현되지 않았다.

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-05-1001-r50-sol-reconvergence.md`
