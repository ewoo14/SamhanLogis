# R65 — #874 전표 저장 경로 DC 반영 구현 보고서

- 일자: 2026-08-06 (KST)
- PR/이슈: #1057 / #874
- 작업 HEAD: `266395411`
- 범위: `slip-service` 신규 OUTBOUND 전표 저장 시 거래처 전역DC와 품목 고정DC를 가격계산 API에 연결
- 가드레일: git 명령 미사용, Docker 조작 없음, DB 쓰기 없음, 지정 Playwright 파일 미수정

## 1. 실측 근거

### 1.1 `dc_configs` 스키마와 거래처 `4348703365`

R64 진단에서 수행한 읽기 SQL 원문:

```sql
SELECT p.partner_code, p.name, dc.id AS dc_config_id,
       dc.home_discount_rate, dc.commercial_discount_rate, dc.is_deleted
FROM partners p
LEFT JOIN dc_configs dc
  ON dc.partner_id=p.id AND dc.is_deleted=false
WHERE p.partner_code='4348703365';
```

```text
partner_code | name                         | dc_config_id                          | home_discount_rate | commercial_discount_rate | is_deleted
-------------+------------------------------+---------------------------------------+--------------------+--------------------------+-----------
4348703365   | 주식회사 엠엠시스템에어(고영현) | b0e2c70e-3221-44b0-8014-0b0ec22ccaa5  | 0.4800             | 0.4900                   | f
```

실제 DDL(`dc-config-service` V1)에서 확인한 `dc_configs` 필드:

- 거래처 FK: `partner_id` (active unique)
- 전역DC: `home_discount_rate`, `commercial_discount_rate` (`0.4800` = 48%)
- 옵션 정액: `discount_360_amount`, `discount_4way_amount`, `discount_1way_amount`, `discount_stand_amount`, `discount_deluxe_amount`, `discount_first_grade_amount`
- 반올림: `unit_round_to`, `unit_round_mode` (`ROUND`/`FLOOR`/`CEIL`)
- soft delete: `is_deleted`

품목 읽기 조회 원문과 결과도 R64에 남아 있다.

```sql
SELECT model_name, model_code, selling_price, fixed_discount_rate,
       fixed_discount_manual, is_deleted
FROM products
WHERE model_name IN ('AR09TXEAAWKNEU-04','MCU-S6NDB1N');
```

```text
AR09TXEAAWKNEU-04 | selling_price 1080000.00 | fixed_discount_rate NULL | is_deleted f
MCU-S6NDB1N        | selling_price 1617000.00 | fixed_discount_rate 40.00 | is_deleted f
```

### 1.2 옵션 정액과 반올림

`PriceCalculationService` 코드에서 확인했다.

- 할인율 적용: `listPrice * (1 - appliedRate)`
- 옵션 정액 6종: `OTHER` 계열에서 선택된 옵션 금액을 합산해 차감한다.
- `HOMEMULTI`와 `COMMERCIAL_MULTI`는 코드 주석 및 분기상 6종 정액을 차감하지 않는다.
- 반올림: `unitRoundTo`가 null/0이면 1원 단위 `HALF_UP`; 값이 있으면 `ROUND=HALF_UP`, `FLOOR=FLOOR`, `CEIL=CEILING`으로 해당 단위에 맞춘다.

따라서 slip-service는 옵션 정액·반올림을 재구현하지 않고 기존 `POST /internal/price-calculations`에 위임했다. 이 라운드에서 확인 불가한 계산 규칙은 없다.

### 1.3 세트 DC 기준

전표 경로는 부모 BUNDLE의 단가를 `productClient.expand(..., setUnitOverride)`에 넘겨 구성품 단가로 재배분한다. 세트 구성품 자체의 DC를 다시 적용해야 한다는 근거는 전표 경로와 R64 자료에서 찾지 못했다.

이번 구현은 가장 단순한 선택인 **부모 세트 단가 기준 1회 계산 후 구성품 전개**를 적용한다. 구성품별 별도 DC/`riUsage` 계산은 이번 범위에 포함하지 않는다.

## 2. RED-first 원문

불변식 1·2·3을 검증하는 `DiscountPriceCalculatorTest`를 구현 전에 추가했다.

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests '*Discount*' --console=plain
```

구현 전 터미널 원문(핵심 실패부):

```text
...DiscountPriceCalculatorTest.java:18: error: cannot find symbol
        DiscountPriceClient client = mock(DiscountPriceClient.class);
  symbol:   class DiscountPriceClient
...
...DiscountPriceCalculatorTest.java:22: error: cannot find symbol
        SlipDiscountCalculator calculator = new SlipDiscountCalculator(client);
  symbol:   class SlipDiscountCalculator
...
15 errors

FAILURE: Build failed with an exception.
> Task :services:slip-service:compileTestJava FAILED
BUILD FAILED
```

이는 테스트가 기대한 신규 가격계산 경계가 아직 존재하지 않아 발생한 RED였다.

## 3. 구현 내용

- `DiscountPriceClient`: `dc-config-service`의 `POST /internal/price-calculations` 호출을 추가했다. 2초 connect/3초 read timeout, `X-Internal-Token`, typed response를 사용한다.
- `SlipDiscountCalculator`: lineId별 계산 결과를 적용하고 결과가 없으면 입력 정가를 보존한다.
- `ProductSummary`: product-service lookup 응답의 `fixedDiscountRate`를 전달하도록 wire record를 확장했다. product-service는 percent 공간(예: `40.00`)으로 반환한다.
- `SlipService.create`: OUTBOUND이고 partnerCode를 해소할 수 있을 때만 라인별 계산을 호출한다. `categoryKey`는 `homemulti → HOMEMULTI`, `commercialMulti → COMMERCIAL_MULTI`, 나머지는 `OTHER`로 변환한다. 계산 결과를 기존 `addSlipLinesExpanded`에 전달하므로 라인별 가격과 BUNDLE 전개가 기존 저장 흐름을 유지한다.
- 계산 API 장애·토큰 누락·응답 결측은 빈 결과로 처리하고 정가 저장을 계속한다. 로그에 `전표 DC 계산 실패 — 정가 저장으로 계속합니다`를 남긴다.
- 마이그레이션 없음. 기존 테이블과 API 계약을 사용한다.

## 4. 검증 결과

```powershell
.\gradlew.bat :services:slip-service:test --tests '*Discount*' --tests '*SlipService*' --tests '*Price*' --console=plain
```

```text
BUILD SUCCESSFUL in 48s
```

신규 테스트 기준값:

- `4348703365` × `AR09TXEAAWKNEU-04` (1,080,000, 고정DC 없음) → 561,600
- `4348703365` × `MCU-S6NDB1N` (1,617,000, 고정DC 40%) → 970,200
- 전역DC 없는 거래처 대조군 → 정가 유지

## 5. 범위와 남은 항목

이번 라운드에서 불변식 1·2·3은 구현했다.

다음 항목은 완전한 실전 저장/화면 QA까지는 남겨 두었다.

1. 불변식 4: 한 전표의 혼합 라인에 대한 실 DB/실 API 통합 QA 및 라인 보존 검증
2. 불변식 5: 실제 `201 Created` 응답과 저장된 라인 보존의 실환경 검증
3. 불변식 6: 조회 실패 시 사용자 화면에 “DC 미적용” 상태를 표시하는 FE 계약. 현재 BE 로그와 정가 fallback까지만 구현
4. 불변식 7: 이번 변경에서 신규 UUID 노출 경로는 만들지 않았으나, 지정 화면의 별도 실렌더 QA는 수행하지 않음
5. 세트 구성품별 `riUsage` 기반 DC 기준 확정 및 구성품별 재계산

새 파일 목록:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DiscountPriceClient.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDiscountCalculator.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/DiscountPriceCalculatorTest.java`
- `docs/dev-reports/2026-08-06-874-r65-dc-integration.md`
