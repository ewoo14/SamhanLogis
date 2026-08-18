# PR #1264 fix 라운드 1 보고서

## ① 결함2 — 11,000원과 10,000원 중 무엇이 맞는가

11,000원이 맞다. 원천 SlipLine은 VAT 포함 단가 10,000원과 별도로 VAT 포함 line total 11,000원을 갖고 있고, `VatCalculator`도 VAT 포함 단가를 받아 공급가 10,000원·부가세 1,000원·합계 11,000원으로 분리한다. 따라서 회계전표 line total, allocation, 일마감 표시, 저장 `total_amount`의 정본은 원천 line total 11,000원이다.

이전 결함은 생성 요청이 원천 `total`을 버리고 `quantity × unitPriceWithVat`를 allocation에 계산하던 데서 발생했다. 수정 후 요청 변환은 원천 `total`을 line VAT 포함 금액과 allocation 금액에 함께 사용한다.

## ② 네 자리 금액이 같아진 증거

- RED에서 매출·매입 모두 `Expected: "11000" / Received: "10000"`가 발생했다.
- GREEN 단위 테스트: `dailyClosingAccountingSlip.test.ts` 매출/매입 2건 모두 `line.unitPrice=11000`, `allocatedAmount=11000` 통과.
- 회계 계산 계약상 저장값은 해당 line total을 `recalcTotals()`가 합산하므로, 생성 요청의 line/배분 원천을 11,000원으로 통일했다.
- 실제 공유 DB write 금지 때문에 신규 생성 POST와 DB 저장 변경은 실행하지 않았다. 따라서 실제 신규 저장값의 라이브 확인은 미검증이다.

## ③ 결함1 — 무엇을 조회하고 있었는가

조회 자체는 `getDailyClosingRows(slipDate, 'INBOUND')`로 입고 원천을 조회하고 있었다. 그러나 화면 제목·날짜축·오류 문구가 하드코딩되어 `출고전표 원본행`/`출고일`로 표시됐다. 즉 조회 축은 입고였지만 사용자 의미 축이 출고로 오인되는 결함이었다.

수정 후 `INBOUND`는 `입고전표 원본행`/`입고일`, `OUTBOUND`는 `출고전표 원본행`/`출고일`을 사용한다.

## ④ RED 원문(양방향)

```text
dailyClosingAccountingSlip.test.ts (매출)
Expected: "11000"
Received: "10000"

dailyClosingAccountingSlip.test.ts (매입)
Expected: "11000"
Received: "10000"

dailyClosingLabels.test.ts (OUTBOUND, INBOUND)
TypeError: dailyClosingSourceTableLabels is not a function
```

RED는 구현 전에 실행했고, 수정 후 해당 2개 테스트 파일은 6/6 통과했다.

## ⑤ 잃으면 안 되는 것 3개 재현

- 재진입 후 생성 버튼·금액 잠금 해제: 기존 `DailyClosingPage.test.tsx` 서버 정본 재진입 테스트를 재실행했고 29/29 통과. 해당 회귀는 재현되지 않았다.
- 정상 미생성 경로: 기존 테스트의 미연결 원천행 생성 버튼 활성·금액 편집 가능 경로를 포함해 통과했다. 실제 라이브 캡처에서도 데이터가 있는 화면의 생성 전 상태를 조회했으며 POST는 호출하지 않았다.
- 이전 열 정합: `DAILY_CLOSING_HEADERS` 17열과 기존 열/필터/정렬 테스트를 그대로 재실행해 29/29 통과했다.

## ⑥ 계열 sweep

- `buildDailyClosingAccountingSlipRequest` 호출부는 Desktop의 `DailyClosingPage` 단일 생성 경로로 확인했다.
- 매출·매입 양쪽 모두 `SALES_SLIP`/`PURCHASE_SLIP` 분기에서 동일한 원천 total 계약을 사용하도록 테스트했다.
- `DailyClosingQueryService` 및 `DailyClosingRowResponse`를 확인해 INBOUND 조회가 실제 `SlipType.INBOUND` repository 경로를 타는 것을 확인했다.
- 일반 회계전표 allocation editor·매출/매입 API의 독립 allocation 계약은 별도 흐름이며 이번 일마감 변환 경로가 아니다. 변경하지 않았다.

## ⑦ 라이브QA 스크린샷 목록

실제 공유 gateway 조회와 현재 브랜치 Desktop Vite(5943)로 실행했다. 신규 회계전표 생성 클릭/POST와 공유 DB write는 0건이다. 각 캡처는 열어서 화면 제목·날짜축·데이터 존재를 확인했다.

| 파일 | 실제 API 행 수 | 화면 데이터행 수 | 확인 |
|---|---:|---:|---|
| `docs/qa/1264-fix-round1/screenshots/01-sales-before-existing-generation.png` | 13 | 1 | 매출, 생성 전 조회 상태 |
| `docs/qa/1264-fix-round1/screenshots/02-purchase-before-existing-generation.png` | 13 | 1 | 매입, `입고전표 원본행`/`입고일`, 생성 전 조회 상태 |
| `docs/qa/1264-fix-round1/screenshots/03-sales-after-existing-generation.png` | 13 | 1 | 매출, 기존 생성 후 조회 상태 |
| `docs/qa/1264-fix-round1/screenshots/04-purchase-after-existing-generation.png` | 13 | 1 | 매입, 기존 생성 후 조회 상태 |

화면 행 수가 API 행 수와 다른 것은 현재 화면의 전표 그룹/병합 렌더링에서 실제 표시 행 1개로 나타난 결과다. 0행 stub은 아니며 화면에 품목·수량·단가 11,000원이 실제 표시됐다.

## ⑧ 미검증 축

- 신규 생성 버튼 클릭부터 회계전표 POST 응답까지는 공유 DB write 금지로 미검증.
- 신규 저장 후 DB `total_amount` 및 allocation 합계의 라이브 read-back은 미검증. 단위 계약과 기존 백엔드 저장 경로로 검증했다.
- 현재 브랜치에는 백엔드 변경이 없어 별도 브랜치 JAR 기동 축은 해당 없음.
- 실서버 데이터의 최초 11,000→10,000 생성 경위는 미검증.

## ⑨ 변경 파일

- `clients/desktop/src/renderer/api/closingApi.ts`
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`
- `clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.ts`
- `clients/desktop/src/renderer/routes/dailyClosingAccountingSlip.test.ts`
- `clients/desktop/src/renderer/routes/dailyClosingLabels.test.ts`
- `docs/qa/1264-fix-round1/report.md`
- 라이브 스펙: `clients/desktop/playwright/1264-fix-round1-real-qa/1264-fix-round1-real-qa.spec.ts`

## ⑩ 프로세스 회수

- 이번 라운드 Vite 5943(PID 101736 및 부모 51880): 회수 완료, 포트 잔여 0.
- Playwright/node: 테스트 종료 후 잔여 0 확인.
- Java: 이번 라운드 기동 0, 잔여 0.
- 격리 컨테이너: 기동 0, 잔여 0.
- 공유 컨테이너: 중지·재시작·교체하지 않음. 24개 유지.
- `git add`/`commit`/`push`: 수행하지 않음.
