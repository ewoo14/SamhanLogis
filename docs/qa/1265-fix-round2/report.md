# PR #1265 fix 라운드 2 — CODEX LUNA 보고서

검증일: 2026-08-18 KST  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wslip`  
브랜치: `fix/web-to-slip-fidelity`  
시작 전 `git merge origin/main --no-edit`: 충돌 없이 완료, merge commit `71a3d9e9f`

## ① 단일 원천이 안 됐던 이유와 남은 계산 지점

지난 라운드가 계산기를 두 곳으로 모았다는 보고는 호출 지점만 통일한 것이었다. 공통 계산기 자체가 단가별로 `Math.round(unit / 1.1)`한 뒤 수량을 곱하는 단가축 알고리즘이었다. 따라서 최초 생성이 보존한 총액축 값과 가격수정·일마감 값이 달라졌다.

현재 생산 계산 지점 전수 검색 결과는 다음 2곳이다.

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:546-547` — 가격수정
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:88-89` — 일마감 저장

두 지점 모두 수정된 `VatInclusiveUnitAmountCalculator`를 거치며, 별도 `/1.1`·VAT 계산 생산 지점은 없다. 최초 생성은 웹 payload의 공급가/VAT를 `resolveLines`가 보존하고, 수정·일마감은 공통 계산기를 재계산한다.

이번 수정은 총액을 먼저 원 단위 반올림한 뒤 공급가를 분리하고 VAT를 차액으로 얻도록 바꿨다.

## ② 레거시 원문 인용

직접 확인한 `tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`:

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

직접 확인한 `tools/legacy-gas/종합견적서/Code.js:1849-1852`도 동일하게 `sup = Math.round(Math.abs(total) / 1.1)`, `vat = Math.abs(total) - sup` 순서다.

`1,850,925 / 1.1 = 1,682,659.0909…`이므로 공급가 `1,682,659`, VAT `1,850,925 - 1,682,659 = 168,266`이 정본이다.

## ③ 세 경로 금액 실측

RED 경계값 자동 테스트로 실제 값 `616,975 × 3 = 1,850,925`를 실행했다.

| 경로 | 공급가 | VAT | 합계 |
|---|---:|---:|---:|
| 최초 생성 계약값 | 1,682,659 | 168,266 | 1,850,925 |
| 가격수정 계산기 수정 후 기대값 | 1,682,659 | 168,266 | 1,850,925 |
| 일마감 계산기 수정 후 기대값 | 1,682,659 | 168,266 | 1,850,925 |

실제 라이브 재태우기는 지정 포트에 브랜치 웹/JAR가 기동되지 않아 완료하지 못했다. Playwright Chromium 실행 원문은 견적 웹 `127.0.0.1:2583` 및 주문서 웹 `127.0.0.1:25180` 각각 `net::ERR_CONNECTION_REFUSED`였다. 따라서 위 표를 라이브 성공으로 가장하지 않는다.

## ④ 원천 추적률과 미채움 사유

재판정 데이터 기준 기존 모집단은 견적 7건 + 주문 20건 = 27건이며, 기존 표시 가능은 10/27, 미채움은 17건이다.

- 견적 7/7: `source_id` 표시 경로가 존재한다.
- 기존 주문 3/20: 병합 전표의 `slip_source_orders` 6행만 복구됐다.
- 기존 주문 나머지 17건: 모두 soft-delete 상태이고, 단건 전환 경로가 원천 주문번호를 별도 행에 기록하지 않아 데이터 자체가 없다. 단순 조회 누락이 아니다.
- 신규 단건: producer payload에는 `orderNo`가 있었지만 `PublishFromPartnerOrderRequest`에 필드가 없어 역직렬화 시 폐기됐고, 단건 경로는 `slip_source_orders`를 저장하지 않았다.

이번 수정은 DTO에 nullable `orderNo`를 추가하고, 값이 있으면 단건도 `slip_source_orders`에 저장한다. 단건 주문번호가 화면의 원천 조회원이 되도록 연결했다. 새 단건 저장 회귀 테스트는 `SlipPublishControllerIT.publishFromPartnerOrder_persistsOrderNoForSourceDisplay`이며 `test-attestation` 주입 후 통과했다.

## ⑤ 주문번호 화면 표시

신규 단건 producer가 이미 보내던 `orderNo`를 slip DTO가 받고 `slip_source_orders.order_no`로 저장한다. 상세 조회의 기존 원천 주문 표시 경로가 이 테이블을 읽으므로, 신규 단건도 `orderNo` 표시 대상이 된다. UUID를 사용자 화면에 노출하지 않는다.

## ⑥ shared/common 파급과 계약 충돌 처리

저장소 전수 검색 결과 `VatInclusiveUnitAmountCalculator` 생산 사용처는 정확히 2곳이며 모두 `slip-service`다. `partner-order-service`와 `accounting-service`의 직접 사용처는 0곳이다. 다만 저장된 slip 금액은 accounting/inventory 등 소비 서비스로 파급된다.

지난 라운드 계약 충돌은 common 기존 테스트 `1000.49 × 2 → 1819/182/2001`과 slip 신규 단가축 테스트 `105 × 2 → 190/20/210`이 서로 달랐던 것이다. 레거시 총액축과 기존 common 테스트가 정본이므로, slip의 잘못된 단가축 기대를 `105 × 2 → 191/19/210`으로 정정하고 공통 계산기를 총액축으로 고쳤다. 관련 테스트 실행 결과 common 계산기 2건, slip 금액 계약, fingerprint, 단건 원천 저장 테스트가 통과했다.

## ⑦ RED 원문

수정 전 `./gradlew :shared:common:test --tests '*VatInclusiveUnitAmountCalculatorTest'`:

```text
2 tests completed, 2 failed
expected: 1682659
 but was: 1682658
expected: 1819
 but was: 1820
```

첫 실패는 `616975 × 3` 실제 경계값이고, 두 번째 실패는 기존 common 계약 `1000.49 × 2`다.

## ⑧ 잃으면 안 되는 것 재현

재판정 직전 기존 격리 라이브 증거 기준:

- 견적 생성: 28/28 라인
- 공급가/VAT/합계 소수부 잔존: 0/28
- `category_key`: 28/28
- `bundle_set_options`: 28/28
- 주문서웹 인증 후 홈멀티: 실제 105행

이번 라운드 코드 테스트에서 이 보존 로직을 변경하지 않았고, 공통 계산기·slip 통합 컴파일도 통과했다. 다만 라이브 재현은 포트 미기동으로 재검증하지 못했다.

## ⑨ 스크린샷과 행 수

기존 `resolveQaShotsDir()` 산출물은 `docs/qa/1265-sol-reverdict-2/screenshots/_local/`에 있다. PNG 4장을 직접 열어 확인했다.

- `01-initial-slip-source-and-4rows.png`: 전표 4품목 + 빈 입력행 1행, 원천 견적 문자열 표시
- `02-price-edit-same-unit-1won-flip.png`: 4품목, 기존 결함 `1,682,658/168,267` 증거
- `03-daily-closing-requery-1won-flip.png`: 4품목, 저장 후 기존 결함 증거
- `04-order-web-home-catalog-rows.png`: 인증된 홈멀티 첫 품목행 캡처, 기존 집계 105행

이번 수정 후 Playwright 재실행은 Chromium까지는 기동했으나 두 웹 포트가 닫혀 `ERR_CONNECTION_REFUSED`로 2건 실패했다. 새 성공 PNG를 생성했다고 보고하지 않는다.

## ⑩ `git status --porcelain` 원문

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAmountContractTest.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java
 M shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java
 M shared/common/src/test/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculatorTest.java
?? clients/desktop/playwright/1265-sol-reverdict-2/
?? docs/qa/1265-sol-reverdict-2/
```

커밋·push·`git add`는 수행하지 않았다. 단, 시작 지시로 수행한 main 병합 자체가 merge commit을 만들었다.

## ⑪ 프로세스 회수

- 이번 Gradle 전체 테스트 시간초과로 남은 wslip Gradle worker는 PID `10104`, wrapper `81060`을 확인 후 강제 종료했다.
- attestation 주입 단일 통합 테스트는 정상 종료했다.
- Playwright Chromium도 정상 종료했다.
- 이번 라운드에서 컨테이너를 기동·중지·재시작하지 않았다.
- 공유 DB write를 수행하지 않았다.
- 공유 컨테이너는 건드리지 않았다.
- `.pid`·`.log` 산출물을 생성하지 않았다.

## 결론

금액 결함의 원인은 공통 계산기의 단가축 반올림이었고, 총액축 레거시 계약으로 수정했다. 신규 단건 주문번호 폐기는 DTO와 단건 원천 저장으로 보완했다. 자동 계약·컴파일·단건 저장 테스트는 통과했지만, 브랜치 JAR와 웹 포트가 없는 상태에서 Playwright 라이브 세 경로를 끝까지 태우지 못했으므로 라이브 완료 판정은 보류한다.
