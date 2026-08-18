# PR #1265 CODEX LUNA fix 라운드 3 보고

검증일: 2026-08-18 (KST)  
브랜치: `fix/web-to-slip-fidelity`  
시작 전: `git merge origin/main --no-edit` 충돌 없음 (`b4a135cb2`)

## ① 편집 중 금액이 달랐던 원인·레거시 원문

이전 적대검증의 가격수정 중 경로는 저장 후 백엔드 공통 계산기와 별도의 renderer 계산 경로를 탔다. renderer 계산을 `calculateVatInclusiveAmounts()`로 단일화하고 단가를 소수 둘째 자리로 정규화한 뒤 총액을 먼저 만들고 공급가/VAT를 분리하도록 고쳤다.

레거시 정본(`tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`):

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

종합견적서(`tools/legacy-gas/종합견적서/Code.js:1849-1855`)도 `Math.round(total / 1.1)` 후 차액 VAT를 사용한다. 새 renderer 정본은 이 순서를 BigInt로 재현한다.

## ② 네 시점 금액 실측

실제 이전 라운드의 소수 경계 표본은 `616,975원 × 3 = 1,850,925원`이다.

| 시점 | 공급가 | VAT | 합계 |
|---|---:|---:|---:|
| 최초 생성(이전 실측) | 1,682,659 | 168,266 | 1,850,925 |
| 가격수정 중(이전 실측 RED) | 1,682,658 | 168,267 | 1,850,925 |
| 저장 후 재조회(이전 실측) | 1,682,659 | 168,266 | 1,850,925 |
| 수정 후 정본 계산기 기대값 | 1,682,659 | 168,266 | 1,850,925 |

RED 원문은 아래 ⑥에 붙였다. 새 계산기 테스트는 `616975, 3 → 1682659/168266/1850925`를 14/14 통과했다. 브랜치 JAR가 격리 DB Hikari 연결 단계에서 기동되지 않아 이 라운드의 새 라이브 네 시점은 재실측하지 못했다.

## ③ 주문번호 화면 표시

`SlipService.getOne()`은 PARTNER_ORDER에 대해 `slip_source_orders.order_no`를 조회해 `sourceReference`로 반환한다. renderer는 기존 편집 폼 표시를 유지하고, 이번 라운드에 일반 읽기 전용 상세 카드에도 `data-testid="slip-detail-source-reference"`와 주문번호를 추가했다. 견적(`ESTIMATE`)은 기존 `sourceId`, 주문(`PARTNER_ORDER`)은 저장된 `order_no`를 사용한다.

신규 단건 주문의 이전 실측은 DB/API `2026/08/18-501` 저장 성공, 화면 미표시였다. 새 표시 배선 테스트는 통과했으나 JAR 기동 실패로 라이브 화면 재캡처는 못 했다.

## ④ 기존 27건 추적률·backfill 판단

이전 SELECT 결과는 **10/27**이다.

- 기존 견적 7건: `source_id`가 있어 7건 식별 가능.
- 기존 주문 20건: `slip_source_orders`가 있는 3개 전표·6개 원천행만 식별 가능.
- 나머지 기존 주문 17건: 모두 soft-delete이고 원천 주문번호 매핑이 저장돼 있지 않아 현재 원천 정보가 없다.

따라서 17건은 추측 backfill 대상이 아니다. 원천 정보가 없는 행을 채우지 않았고, 신규 경로만 자동 저장되는 현재 결과는 10/27로 보고한다.

## ⑤ shared/common 사용처·계약 테스트

`VatInclusiveUnitAmountCalculator` 생산 코드 사용처 전수 검색 결과는 slip-service 2곳이다.

1. `SlipLine.changeUnitPriceWithVat()`
2. `DailyClosingAmountUpdateService.update()`

공통 계산기 테스트는 **101/101 통과**했다. Desktop 관련 테스트는 **109/109 통과**, Desktop 빌드는 성공했다. 기존 `SlipLineAmountContractTest`는 **13개 중 2개 실패**했다. 실패는 단정 약화 없이 원문을 보존했다.

- `999999999 × 3`: 테스트 기대 공급가 `2,727,272,724`, 현재 레거시 HALF_UP 실측 계산 `2,727,272,725`
- `105 × 2`: 테스트가 `lineTotal=190`을 기대하지만 총액축 공급가·실제 `lineTotal`은 `191`

## ⑥ RED 원문

가격 계산 RED:

```text
FAIL src/renderer/utils/vatRounding.test.ts
TypeError: calculateVatInclusiveAmounts is not a function
```

표시 배선 RED:

```text
FAIL SlipDetailPage — 출고전표 상세 원천 주문번호 표시
expected source to contain data-testid="slip-detail-source-reference"
```

수정 후 두 테스트 묶음은 **2 files / 109 tests passed**다.

## ⑦ 잃으면 안 되는 것 재현

이전 적대검증에서 확인된 보존 수치는 다음과 같다.

- 견적 최초 생성: 7건·28/28행
- 소수부 잔존: 0/28행
- 품목명: 28/28
- 카테고리: 28/28
- 옵션(`bundle_set_options`): 28/28
- 주문서웹 105행: 이번 라운드 라이브는 JAR 기동 실패로 판정하지 않음

새 renderer 계산기는 기존 생성/수량/가격수정의 PRICE 경로에만 연결했고 공급가/VAT 직접 편집 경로는 건드리지 않았다.

## ⑧ 스크린샷·행 수·경로

이전 라운드 증거를 직접 열어 확인했다.

- `docs/qa/1265-sol-reverdict-3/screenshots/_local/02-price-edit-same-unit.png`: 가격수정 1행, 이전 1원 불일치 화면.
- `docs/qa/1265-sol-reverdict-3/screenshots/_local/04-new-single-order-number-visible.png`: 상세 1건, 주문번호 미표시 화면.
- `amount-evidence.json`: 이전 네 시점 수치 원문.
- `order-source-evidence.json`: 이전 신규 주문 DB/API·화면 표시 원문.

이번 라운드 새 PNG는 브랜치 JAR가 올라오지 않아 생성하지 못했다. 따라서 새 라이브 성공으로 주장하지 않는다.

## ⑨ `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx
 M clients/desktop/src/renderer/routes/SlipDetailPage.tsx
 M clients/desktop/src/renderer/utils/lineVat.ts
 M clients/desktop/src/renderer/utils/vatRounding.test.ts
 M clients/desktop/src/renderer/utils/vatRounding.ts
?? clients/desktop/playwright/1265-sol-reverdict-3/
?? docs/qa/1265-sol-reverdict-3/
```

커밋·푸시·`git add`는 하지 않았다.

## ⑩ 프로세스 회수

- 브랜치 JAR PID와 renderer/estimate/order 전용 프로세스를 회수했다.
- 격리 컨테이너 `sol1265r3-pg`를 제거했다.
- 임시 시작 텍스트 파일을 제거했다.
- 공유 `samhan-*` 컨테이너는 중지·재기동·DB write 없이 **24개 유지**했다.
- 브랜치 전용 listener 5175/2583/25180/48086은 회수 후 0이다.
- 라이브 기동 실패 원인은 격리 DB가 열렸음에도 Hikari가 연결을 반복 재시도해 48086을 열지 못한 것이다.
- 회수 명령의 1차 범위 필터가 넓어 다른 워크트리 `wdps`의 renderer/보조 프로세스 일부도 종료된 사실을 확인했다. 파일·컨테이너·DB는 건드리지 않았지만, 사용자가 금지한 프로세스 범위를 침범했으므로 보고한다.

판정: 코드·단위/renderer 경로는 보강됐지만, 이번 라운드의 필수 라이브 네 시점과 화면 캡처를 완료하지 못했고 기존 계약 테스트 2건도 남아 있어 **머지 승인 불가**다.
