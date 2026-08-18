# PR #1265 fix 라운드 1 보고서

검증 기준: `fdf8a0d2c` 이후 `origin/main` 병합 완료, 브랜치 `fix/web-to-slip-fidelity`.

## ① 1원 회귀 원인과 레거시 원문 대조

원인은 `VatInclusiveUnitAmountCalculator`가 VAT 포함 총액을 먼저 계산한 뒤 `총액 / 1.1`을 분리하면서 가격수정·일마감의 기존 단가축 계약과 달라진 것이다. `105×2`에서 총액 분리는 공급가 191원이지만 기존 계약은 개당 `Math.round(105 / 1.1)=95`를 수량 곱해 공급가 190원/VAT 20원이다.

레거시 원문:

- `tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`: `total = priceVat * qty`, `sup = Math.round(total / 1.1)`, `vat = total - sup`, `priceEx = Math.round(priceVat / 1.1)`
- `tools/legacy-gas/종합견적서/Code.js:1849-1855`: 동일한 총액 분리와 개당 공급단가 계산

공통 계산기를 개당 공급가/VAT를 같은 단가축에서 수량 곱하도록 정렬했다.

## ② 경로별 금액 실측

| 경로 | 결과 |
|---|---:|
| 최초 생성 계산기 계약 | 기존 테스트 통과 |
| 가격수정/일마감 `SlipLine.changeUnitPriceWithVat` | **9/9 통과** |
| 가격수정 재조회 불변식 `105×2=190+20=210` | 통과 |

실제 웹에서 가격수정·일마감까지 태우는 새 라이브 실측은 미수행이다.

## ③ 원천 추적률 채움률 숫자

전표 상세에 `sourceReference`를 추가했다. 견적은 견적번호를 사용하고, 병합 주문은 `slip_source_orders.order_no`를 조회해 UUID가 아닌 주문번호를 반환한다. 데스크톱 상세 화면에 표시한다.

- 구현 기준: source reference 필드·조회·화면 표시 추가
- 새 라이브 전수 재집계: 미수행
- 따라서 이번 보고서에서 **27/27 채움 완료로 확정하지 않는다**.

## ④ 주문서웹 0행 원인

권한이나 프런트 조건이 아니라 bootstrap 데이터 판정 조건이었다. `materialPrices`만 비어 있지 않아도 `hasProductData=true`가 되어, 실제 상품 카탈로그 배열이 빈 payload를 캐시하고 V2 seed fallback을 가렸다.

`hasProductData` 판정에서 `materialPrices`를 제외하고 실제 상품/구성품 카탈로그만 사용하도록 수정했다. materialPrices 단독 상황의 seed 보존 회귀 테스트를 추가했다.

## ⑤ RED 원문

```text
SlipLineAmountContractTest: 9 tests completed, 5 failed
단가 105원, 수량 2: expected 190 but was 191
단가 105원, 수량 3: expected 285 but was 286
단가 999999999원, 수량 3: expected 2727272724 but was 2727272725
VAT포함_단가를_먼저_원단위_반올림한_뒤_수량을_곱한다: expected 190 but was 191
단가_변경도_저장_후_재조회할_금액을_같은_계약으로_계산한다: expected 190 but was 191
```

주문서웹 RED는 적대검증 라이브에서 인증 성공 후 `bootstrap payloads.homemulti/singleSets/...=[]`, 화면 0행으로 재현됐다.

## ⑥ 잃으면 안 되는 것 재현

기준선은 견적 웹 금액 **28/28**, 소수부 **0/28**, 품목·카테고리·옵션 **4/4**다. 이번 라운드 라이브 28행 재생성·PNG 재확인은 미수행이며 테스트를 새 동작에 맞춰 바꾸지 않았다.

## ⑦ 계열 sweep

가격 계산기·전표 생성·가격수정·일마감 및 주문서웹 bootstrap의 catalog/component/material/baseline/schedule 경로를 코드 sweep했다. 주문서웹 주문 생성→전표 변환 라이브 sweep은 0행 축 때문에 미검증이다.

## ⑧ 스크린샷(행 수·경로)

신규 PNG는 생성하지 못했다. 기존 적대검증 증거는 견적 웹 4행 `docs/qa/1265-sol-merge-verdict/screenshots/_local/01-web-estimate-upload-4rows.png`, 전표 4행 `.../02-created-slip-detail-4rows.png`, 인증 주문서웹 0행 `.../03-order-web-authenticated-0rows.png`이다.

## ⑨ 미검증 축

브랜치 JAR·격리 DB 실제 웹 생성/가격수정/일마감, 주문서웹 수정 후 인증 행 수, 주문→전표 W-01~W-03, 원천 추적 27건 전수 채움률은 미검증이다.

## 검증 결과

- `./gradlew :services:slip-service:test --tests '...SlipLineAmountContractTest'`: **BUILD SUCCESSFUL**, 9/9
- `./gradlew :services:partner-order-service:test --tests '...BootstrapServiceTest'`: **BUILD SUCCESSFUL**
- 데스크톱 Vitest 2 files / **12 tests passed**
- 병렬 Gradle 최초 실행은 shared 산출물 동시 갱신 오류였고 순차 재실행은 통과했다.

## 변경 파일

```text
clients/desktop/src/renderer/api/slip.ts
clients/desktop/src/renderer/routes/SlipDetailPage.tsx
services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java
services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmLineRequest.java
services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/BootstrapServiceTest.java
services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipDetailResponse.java
shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java
```

## ⑩ git status --porcelain 원문

```text
 M clients/desktop/src/renderer/api/slip.ts
 M clients/desktop/src/renderer/routes/SlipDetailPage.tsx
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmLineRequest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/BootstrapServiceTest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipDetailResponse.java
 M shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java
?? docs/qa/1265-fix-round1/
```

## ⑪ 프로세스 회수

이번 라운드에서 서버·브라우저·컨테이너를 새로 기동하지 않았다. 신규 `.pid/.log` 잔재가 없고 공유 컨테이너 24개와 다른 워크트리는 건드리지 않았다. `git add/commit/push`는 수행하지 않았다.
