# PR #991 R3 — 반올림 적용 범위 고정 보고서

## 작업 범위와 제약

이번 라운드는 R-02의 견적·발행 전표 구성 금액 일치와 기존 주문 경로 금액 불변을 동시에 만족시키는 것을 목표로 한다. R-01은 변경하지 않는다. R-03 및 B-03~B-10은 조사·수정하지 않는다.

- 브랜치: `fix/monthend-detail-price-variant`
- 기준 HEAD: `1b1e3e26d`
- git 쓰기, 커밋, Docker 재빌드·재기동, 공유 DB 쓰기: 하지 않음

## RED — 수정 전 실패 증거

추가한 회귀 테스트는 `PartnerOrderLineSupplyVatTest.preservesLegacyDiscountedTotalSplit`이다. 수정 전 실행 명령과 원문은 다음과 같다.

```text
.\gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.domain.PartnerOrderLineSupplyVatTest" --rerun-tasks --no-build-cache --no-daemon
종료코드=1

주문 품목행 공급가액·부가세 > 주문 라인은 공급가액과 부가세를 보유하고 VAT 포함 subtotal 항등식을 제공한다 FAILED
주문 품목행 공급가액·부가세 > 기존 주문의 DC 최종가 800000원은 공급가액 727272원을 보존한다 FAILED
주문 품목행 공급가액·부가세 > PRICE/SUPPLY/VAT/TOTAL 네 권위 경로가 같은 항등식을 보장한다 FAILED
3 tests completed, 3 failed
BUILD FAILED
```

RED 원인은 공유 계산기의 HALF_UP 기본값이었다. 110,005원은 100,005/10,000으로, 800,000원은 727,273/72,727로 계산되어 기존 주문 계약인 100,004/10,001 및 727,272/72,728과 달랐다.

## 변경 요지

공유 모듈의 기존 기본 반올림 계약을 `DOWN`으로 복원하고, `RoundingMode`를 받는 명시적 overload를 추가했다. `SlipLine`과 `EstimateLine`의 VAT 포함 생성 경로만 `HALF_UP`을 전달한다. partner-order의 PRICE/TOTAL 주문 생성 및 인쇄 fallback과 accounting의 `VatCalculator`는 기본 overload를 계속 사용한다. `fromSupply()`는 변경하지 않았다.

대표 금액 영향은 합계 영향 0원을 유지한다.

| 소비자 | 적용 모드 | 110,005원 공급가/VAT | 공급가 영향 | VAT 영향 | 합계 영향 |
|---|---|---:|---:|---:|---:|
| slip `EstimateLine` | HALF_UP | 100,005 / 10,000 | +1원 | -1원 | 0원 |
| slip `SlipLine` | HALF_UP | 100,005 / 10,000 | +1원 | -1원 | 0원 |
| accounting `VatCalculator` | 기존 DOWN | 100,004 / 10,001 | 0원 | 0원 | 0원 |
| partner-order `PartnerOrderLine` PRICE/TOTAL | 기존 DOWN | 100,004 / 10,001 | 0원 | 0원 | 0원 |
| partner-order `PartnerOrderPrintService` fallback | 기존 DOWN | 100,004 / 10,001 | 0원 | 0원 | 0원 |

## `VatAmountCalculator` 소비자 전수 목록과 영향액

수정 후 `rg -n "VatAmountCalculator\.(splitVatInclusive|fromSupply)" services shared --glob '*.java'`로 전수 확인했다.

### `splitVatInclusive` 소비자

- `services/slip-service/.../EstimateLine.java:193`: 발행 정합성용 HALF_UP. 대표 영향 `+1원/-1원/0원`.
- `services/slip-service/.../SlipLine.java:275`: 발행 정합성용 HALF_UP. 대표 영향 `+1원/-1원/0원`.
- `services/accounting-service/.../VatCalculator.java:28`: 기존 기본 DOWN. 영향 `0원/0원/0원`.
- `services/partner-order-service/.../PartnerOrderLine.java:183`: PRICE 권위 경로 기본 DOWN. 영향 `0원/0원/0원`.
- `services/partner-order-service/.../PartnerOrderLine.java:207`: TOTAL 권위 경로 기본 DOWN. 영향 `0원/0원/0원`.
- `services/partner-order-service/.../PartnerOrderPrintService.java:113`: legacy fallback 기본 DOWN. 영향 `0원/0원/0원`.

### `fromSupply` 소비자

`PartnerOrderLine` SUPPLY 경로, `TaxInvoiceLine`, `TaxInvoice` fallback, `JournalSeeder`, `SlipLine`, `EstimateLine`, `SlipRevisionService` 및 common 테스트를 전수 확인했다. 이번 변경은 `fromSupply()` 구현이나 호출 모드를 건드리지 않았으므로 각각 공급가/VAT/합계 영향은 `0원/0원/0원`이다.

이 영향 판정은 Linux에서도 참이다. 구현은 Java 표준 `BigDecimal.divide(..., RoundingMode)`만 사용하고 OS·locale·파일시스템 상태에 의존하지 않으며, 테스트는 순수 금액 단언이다. CI의 `ubuntu-latest`에서도 동일한 정수 결과를 낸다.

## 네 모듈 전체 테스트

모든 명령은 순차 실행했으며 Docker 재빌드·서비스 재기동·공유 DB write는 하지 않았다.

```text
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache --no-daemon
종료코드=0
BUILD SUCCESSFUL; 1,700 tests, 0 failures, 0 errors, 10 skipped

.\gradlew :services:slip-service:test --rerun-tasks --no-build-cache --no-daemon
종료코드=0
BUILD SUCCESSFUL; 1,512 tests, 0 failures, 0 errors, 0 skipped

.\gradlew :services:partner-order-service:test --rerun-tasks --no-build-cache --no-daemon
종료코드=0
BUILD SUCCESSFUL; 472 tests, 0 failures, 0 errors, 0 skipped

.\gradlew :shared:common:test --rerun-tasks --no-build-cache --no-daemon
종료코드=0
BUILD SUCCESSFUL; 53 tests, 0 failures, 0 errors, 0 skipped
```

네 모듈 합계는 3,737 tests, 0 failures, 0 errors, 10 skipped이다. partner-order 실행 종료 훅에서 기존 로컬 DB 포트 거부 로그가 있었으나 테스트 task 자체는 종료코드 0으로 완료되었고, 이 세션에서 DB를 재기동하거나 쓰지 않았다.

추가 타깃 GREEN 검증:

```text
.\gradlew :shared:common:test --tests "com.samhanair.logis.common.financial.VatAmountCalculatorTest" --rerun-tasks --no-build-cache --no-daemon
종료코드=0
.\gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.domain.PartnerOrderLineSupplyVatTest" --rerun-tasks --no-build-cache --no-daemon
종료코드=0
.\gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.domain.SlipLineAuthoritativeAmountsTest" --rerun-tasks --no-build-cache --no-daemon
종료코드=0
```

`git diff --check` 명령도 종료코드 0이다.

## 이번에 안 본 것

- R-03 선재 VAT 재가산 19건 backfill 및 모든 공유 DB 쓰기
- B-03~B-10
- Docker 재빌드·서비스 재기동·라이브 QA
- R-01 되돌리기 또는 범위 밖 UI 변경

## 신규 파일 및 상태

신규 파일은 다음 1개다. `.vite/`는 기존 빌드 산출물이라 제외했다.

- `docs/dev-reports/2026-07-31-991-r3-rounding-scope-fix.md`

요청한 `git status --porcelain` 원문:

```text
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLineSupplyVatTest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/EstimateLine.java
 M shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java
 M shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java
?? .vite/
?? docs/dev-reports/2026-07-31-991-r3-rounding-scope-fix.md
```
