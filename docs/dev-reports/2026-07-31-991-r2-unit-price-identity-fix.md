# PR #991 R2 — 전표 단가 식별·견적 반올림 fix 보고서

- 검증일: 2026-07-31
- 작업 브랜치: `fix/monthend-detail-price-variant`
- 작업 시작 HEAD: `64946d67b600587da4bb8f73811733a0280c5e5c`
- 대상: R-01 전표 단가 식별성, R-02 견적·발행 전표 공급가/VAT 정합
- 제약: git 쓰기 없음, 공유 Docker 서비스 재기동·이미지 재빌드 없음, 공유 DB는 읽기 전용 SQL만 실행

## 판정 요약

R-01과 R-02를 각각 실패 테스트로 재현한 뒤 수정했다.

- R-01: 일마감 집계 키에 원천 한 라인의 VAT 포함 실제 단가를 포함했다. 같은 품목 축에 실제 단가가 여러 개이면 행을 나누며, 합계 금액÷합계 수량 가중평균을 `전표 단가`로 만들지 않는다.
- R-02: VAT 포함 합계에서 공급가액을 나눌 때 견적 원천과 같은 `HALF_UP`을 사용한다. 공급가액에서 VAT를 파생하는 기존 `fromSupply()`의 `DOWN`은 유지했다.
- 기존 데이터 영향: 현재 활성 VAT 포함 전표 라인 11건 중 새 규칙을 다시 적용하면 6라인·5전표의 공급가/VAT 구성 금액이 바뀐다. 공급가 합계 변화는 `+6원`, VAT 합계 변화는 `-6원`, 전표 합계 변화는 `0원`이다. 이 사실은 0으로 숨기지 않고 보고한다.
- 이번 fix가 공유 DB에 실제로 쓴 금액: 작업 HEAD 시각 이후 accounting·slip 금액 라인 수정 `0건 / 0원`이다. 기존 행을 재계산하거나 backfill하지 않았다.

## 1. R-01 — `전표 단가`는 실제 전표 단가만 제시한다

### RED 원문

실패 테스트를 먼저 추가하고 다음 명령을 캐시 없이 실행했다.

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailDoesNotAverageDifferentSlipUnitPrices --rerun-tasks --no-build-cache --no-daemon
```

실제 실패 원문:

```text
DailyClosingDetailServiceTest > 같은 축의 서로 다른 전표는 전표별 실제 단가를 각각 응답한다 FAILED
Expected size: 2 but was: 1 in:
[DailyProductLine[productName=동일모델, modelName=AM480AXVHJH1SY,
categoryKey=commercialMulti, quantity=2, supplyAmount=48988500.00,
actualUnitPrice=26943675.0000000000, ...]]

1 test completed, 1 failed
BUILD FAILED
```

이는 25,843,675원과 28,043,675원을 하나의 축으로 합친 뒤 26,943,675원을 만든다는 결함을 직접 잡은 RED다.

### 변경 요지

변경 파일: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java`

- 집계 키 `AxisKey`에 원천 한 라인의 `(공급가액+부가세)÷수량` 값을 추가했다.
- 실제 단가가 같은 라인은 기존처럼 수량·금액을 합산한다.
- 실제 단가가 다른 라인은 서로 다른 응답 행으로 분리한다.
- `ModelAccumulator.effectiveUnitPrice()`는 누적 합계로 다시 계산하지 않고, 해당 행을 만든 원천 단가를 반환한다.
- 수량이 0이면 실제 단가를 `null`로 유지한다.

실패 테스트를 수정 후 동일한 캐시 무력화 명령으로 다시 실행한 결과:

```text
BUILD SUCCESSFUL in 50s
21 actionable tasks: 21 executed
```

프론트엔드의 `전표 단가` 명칭은 그대로 두고 백엔드 응답 행을 실제 단가 변형별로 나누었으므로, 화면이 실재하지 않는 평균값을 전표 단가라고 부르는 표면을 제거했다.

### 실 데이터 측정 — 두 SQL 방식 교차 확인

공유 `accounting_db`에 `docker exec samhan-postgres psql ... -c "SELECT ..."` 형식의 읽기 전용 조회만 실행했다. 화면 도달 경계는 `tax_invoices.status='ISSUED'`, 양쪽 `is_deleted=FALSE`로 동일하게 고정했다.

방법 A: 품목 축별 합계 단가와 각 라인 단가를 직접 비교했다.

```text
visible_lines | displayed_rows | line_mismatches | absolute_gap
--------------+----------------+-----------------+-------------
           13 |             13 |               0 |            0
```

방법 B: 같은 표본에서 축별 `COUNT(DISTINCT 실제 단가)`를 별도로 계산했다.

```text
visible_lines | displayed_rows | multi_price_axes | extra_price_variants
--------------+----------------+------------------+---------------------
           13 |             13 |                0 |                    0
```

두 결과가 모두 `13라인 / 13행 / 불일치 0 / 다중 단가 축 0`으로 일치했다. 현재 공유 DB에는 R-01의 다중 단가 실데이터가 없으므로, 두 전표 사례는 RED 단위 테스트로 재현하고 코드 경로에 고정했다.

같은 읽기 전용 조회로 상태별 라인 수를 다시 세어 화면 경계를 확인했다.

```text
 status    | lines |   supply    |    vat     |   total
-----------+-------+-------------+------------+----------
 CANCELLED |     5 |  4600000.00 |  460000.00 | 5060000.00
 DRAFT     |     4 |   310000.00 |   31000.00 |  341000.00
 ISSUED    |    13 | 11172727.00 | 1117272.00 |12289999.00
```

따라서 이번 실측에서 일마감 응답 대상은 `ISSUED 13라인`이며, 취소·초안 9라인을 영향 건수에 포함하지 않았다.

## 2. R-02 — 견적 원천과 발행 전표의 공급가·VAT를 일치시킨다

### RED 원문

실패 테스트를 먼저 추가하고 다음 명령을 캐시 없이 실행했다.

```text
.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.domain.SlipLineAuthoritativeAmountsTest.splitsVatInclusivePriceWithQuoteRounding --rerun-tasks --no-build-cache --no-daemon
```

실제 실패 원문:

```text
전표 라인 권위 금액 팩토리 > 견적과 같은 VAT 포함 단가 110005는 공급가 100005·VAT 10000으로 분리한다 FAILED
expected: 100005
 but was: 100004

1 test completed, 1 failed
BUILD FAILED
```

생산 코드의 기존 계산은 `110005 ÷ 1.1`을 `DOWN`하여 공급가 100004원·VAT 10001원을 저장했다.

### 변경 요지

변경 파일:

- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java`
- `shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java`

`splitVatInclusive()`만 `RoundingMode.DOWN`에서 `RoundingMode.HALF_UP`으로 바꿨다. 견적 원천의 `Math.round(금액÷1.1)`와 같은 규칙이며, 공급가액에서 세액을 계산하는 `fromSupply()`는 기존 `DOWN`을 유지했다. 이미 발행된 전표의 금액은 다시 계산하지 않는다.

공개 견적·내부 견적·단일 주문·병합 주문 네 경로에 각각 `unitPriceVat=110005`, `quantity=1` 회귀를 추가했다. 네 경로 모두 저장 결과가 다음과 같은지 확인한다.

```text
공급가액 = 100005원
VAT     = 10000원
```

단위 테스트와 네 발행 경로 테스트는 모두 통과했다. 병합 전표 테스트는 라인 순서에 의존하지 않고 VAT 포함 단가 110005원인 라인을 선택한다.

### 실 데이터 영향 — 변경 전·후 금액

대상은 공유 `slip_db`의 활성 `unit_price_domain='VAT_INCLUSIVE'` 전표 라인이다. 기존 코드 산식은 `TRUNC(ROUND(unit_price_with_vat×quantity)/1.10)`, 새 산식은 `ROUND(ROUND(unit_price_with_vat×quantity)/1.10)`으로 재현했다. 두 SQL은 모두 읽기 전용이다.

방법 A: 라인별 기존·신규 공급가와 VAT를 CTE로 계산해 집계했다.

```text
 existing_lines | unchanged_lines | changed_lines | changed_slips | supply_delta | vat_delta | total_delta
----------------+-----------------+---------------+---------------+--------------+-----------+------------
             11 |               5 |             6 |             5 |            6 |        -6 |           0
```

방법 B: 같은 식을 파생 테이블의 조건부 합계로 다시 계산했다.

```text
 existing_lines | unchanged_lines | changed_lines | changed_slips | supply_delta | vat_delta | total_delta
----------------+-----------------+---------------+---------------+--------------+-----------+------------
             11 |               5 |             6 |             5 |            6 |        -6 |           0
```

교차 결과는 `기존 VAT 포함 라인 11건`, `불변 5건`, `재계산 시 변경 6라인·5전표`, `공급가 +6원`, `VAT -6원`, `합계 0원`이다. 변경 대상의 구성 금액 절대 변화 합계는 공급가 6원과 VAT 6원을 합친 **12원**이다. 기존에 맞던 값이 모두 불변이라고 보고하지 않으며, 이 6라인은 새 규칙 적용 시 차이가 난다는 사실을 PM 판단 대상으로 남긴다. 단, 이번 fix는 기존 행을 UPDATE하지 않았으므로 실제 저장 상태의 변화는 0건·0원이다.

변경된 6라인은 다음 세 계산 묶음으로 교차 확인됐다.

```text
old_supply | new_supply | old_vat | new_vat | lines
-----------+------------+---------+---------+------
    218181 |     218182 |   21819 |   21818 |     4
    401090 |     401091 |   40110 |   40109 |     1
    602363 |     602364 |   60237 |   60236 |     1
```

### 이번 fix의 공유 DB 금액 변화 0원 실측

작업 기준 HEAD 시각 `2026-07-31 21:19:46` 이후 `modified_at`을 기준으로 accounting과 slip의 금액 라인을 두 방식으로 조회했다.

방법 A:

```text
tax_invoice_lines              | 0건 | 0원
sales_accounting_slip_lines    | 0건 | 0원
purchase_accounting_slip_lines | 0건 | 0원
slip_lines                     | 0건 | 0원
```

방법 B는 같은 시간 창의 대상 행을 파생 테이블로 모아 집계했고, accounting과 slip 모두 결과가 `0행`이었다. 따라서 이번 작업에서 기존 금액을 바꾼 SQL·마이그레이션·backfill은 없었다.

## 3. 전체 테스트

모든 명령에 `--rerun-tasks --no-build-cache --no-daemon`을 사용했다. `UP-TO-DATE`와 `FROM-CACHE`에 의존하지 않았다.

### accounting-service

```text
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache --no-daemon
BUILD SUCCESSFUL in 8m 20s
21 actionable tasks: 21 executed
```

JUnit XML 재집계:

```text
test files 201
tests      1700
failures      0
errors        0
skipped      10
```

### slip-service

```text
.\gradlew :services:slip-service:test --rerun-tasks --no-build-cache --no-daemon
BUILD SUCCESSFUL in 6m 4s
18 actionable tasks: 18 executed
```

JUnit XML 재집계:

```text
test files 202
tests      1512
failures      0
errors        0
skipped       0
```

### shared common

```text
.\gradlew :shared:common:test --rerun-tasks --no-build-cache --no-daemon
BUILD SUCCESSFUL in 15s
3 actionable tasks: 3 executed
```

JUnit XML 재집계:

```text
test files 15
tests       52
failures     0
errors       0
skipped      0
```

## 4. 변경 파일과 신규 파일

### 신규 파일

- `docs/dev-reports/2026-07-31-991-r2-unit-price-identity-fix.md` — 본 보고서 1개

### 수정 파일

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java`
- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java`
- `shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAuthoritativeAmountsTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/InternalSlipPublishControllerIT.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java`

## 5. 이번에 안 본 것

- R-03의 선재 VAT 재가산 전표 19건은 backfill하지 않았다. 과거 회계 데이터 정정은 개발책임자 판단 대기이며, 공유 DB 쓰기를 하지 않았다.
- B-03, B-04, B-05, B-06, B-07 전체, B-08, B-09, B-10은 조사·수정하지 않았다. B-07은 이번 R-01의 `전표 단가` 명칭 교차점만 다뤘다.
- 프론트엔드 광범위 개편, 다른 회계 화면, CSV·인쇄 화면은 변경하지 않았다.
- 이미 적용된 Flyway 마이그레이션은 수정하지 않았고, 신규 `V` 마이그레이션도 만들지 않았다.
- Docker 이미지 재빌드·공유 백엔드 재기동·라이브 exact SHA QA는 하지 않았다.
- 수량 0/null/음수인 현재 공유 DB 실표본과, 현재 원천에서 대응할 수 없는 과거 라인의 금액 정합은 추가 조사하지 않았다.
- 이번 반올림 변경의 과거 전표 재작성은 하지 않았다. 위 실데이터 수치는 재계산 시 영향량을 읽기 전용으로 산출한 것이다.

## 6. 작업 트리 주의

`.vite/`는 기존 프론트엔드 빌드 산출물이며 커밋 대상이 아니다. git 쓰기 금지 지침에 따라 add·commit·push·checkout·stash는 실행하지 않았다.

### `git status --porcelain` 원문

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAuthoritativeAmountsTest.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/InternalSlipPublishControllerIT.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java
 M shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java
 M shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java
?? .vite/
?? docs/dev-reports/2026-07-31-991-r2-unit-price-identity-fix.md
```
