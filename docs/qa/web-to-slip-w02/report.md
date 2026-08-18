# 웹→전표 W-02 검증 보고서

## ① RED 원문

RED-first로 `VatInclusiveUnitAmountCalculatorTest`를 추가하고 기존 구현에 실행했다.

```text
VAT 포함 단가 총액 계산기 > 수량 합계를 먼저 VAT 분리해 전표 금액에 소수 단위를 만들지 않는다 FAILED
expected: 1819
but was: 1818
1 test completed, 1 failed
```

실제 재현 입력은 VAT 포함 단가 `1000.49`, 수량 `2`다. 기존 구현은 단가를 먼저 원 단위로 줄여 총액을 `2000`으로 만들었다.

## ② 계산 순서를 어떻게 바꿨나

단가를 개당 공급가액으로 먼저 나누지 않고, VAT 포함 단가×수량을 먼저 원 단위 `HALF_UP`으로 반올림한다. 그 라인 총액을 `VatAmountCalculator.splitVatInclusive()`에 넘겨 공급가액을 `Math.round(total / 1.1)`과 동일한 레거시 HALF_UP으로 계산하고 VAT는 차액으로 둔다.

입력 `1000.49 × 2`의 결과는 총액 `2001`, 공급가액 `1819`, VAT `182`이며 세 금액에 소수가 없다.

## ③ 서버 재계산 제거

이번 라운드에서는 기존 W-02 전표 생성의 권위 금액 경로를 변경하지 않았다. 이미 `SlipService`와 `EstimateToSlipConverter`가 완비된 `supplyAmount·vatAmount·lineTotalWithVat`를 권위 팩토리로 넘기고, 미완비 요청은 기존 계산 경로를 유지한다. 기존 회귀 테스트 `EstimateToSlipConverterAuthoritativeAmountsTest`도 통과했다.

## ④ GREEN

```text
./gradlew :shared:common:test --tests VatInclusiveUnitAmountCalculatorTest --tests VatAmountCalculatorTest
BUILD SUCCESSFUL

./gradlew :services:slip-service:test --tests EstimateToSlipConverterAuthoritativeAmountsTest
BUILD SUCCESSFUL
```

## ⑤ 활성 소수 행 20건 전수표(판단용 · 고치지 않음)

정찰 보고서 `docs/dev-reports/2026-08-17-web-to-slip-recon/report.md`가 이 워크트리에 존재하지 않아 20건의 식별자·금액 전수표를 읽을 수 없었다. DB 조회나 데이터 수정은 수행하지 않았으며, 활성 소수 행은 고치지 않았다. 개발책임자 판단용 전수표는 정찰 보고서 복원 후 첨부해야 한다.

## ⑥ 기존 저장 값 불변 확인

`VatAmountCalculatorTest.calculationDoesNotMutateStoredAmount`와 기존 권위 금액 변환 테스트를 통과했다. 계산기 변경은 신규 계산 결과에만 적용되며 기존 저장 행을 조회·재저장·재계산하지 않았다.

## ⑦ 라이브 캡처

백엔드 격리 스택은 기동하지 않았다. 따라서 웹에서 신규 전표를 만들거나 QA 캡처를 생성하지 않았으며, 공유 DB에도 전표를 만들지 않았다.

## ⑧ 프로세스 회수

이번 라운드에서 기동한 애플리케이션·Docker 격리 컨테이너는 없다. 잔여 애플리케이션 프로세스 `0`, 잔여 격리 컨테이너 `0`이다.

## 변경 파일

- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java`
- `shared/common/src/test/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculatorTest.java`

커밋·푸시는 수행하지 않았다.
