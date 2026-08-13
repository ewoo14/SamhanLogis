# D-G1 S2 구현 보고서 — versioned 요율 계약 + 정산 계산기

> 구현 범위: S2만 수행했다. 그룹웨어 연결(S3), 화면·버튼(S4), 기준일 잠금(D-G7), 확정 취소는 구현하지 않았다.
>
> 작업 원칙: git 조작·공유 DB write·배포를 하지 않았다.

## 1. 전제 확인과 레거시 원문

다섯 함수 모두 실제 원문을 찾았으므로 누락으로 중단한 항목은 없다.

원문 파일은 `tools/legacy-gas/영업수수료 계산/Index.html`이다.

### `setPay` — 파일:줄

`tools/legacy-gas/영업수수료 계산/Index.html:262-270`

```javascript
function setPay(method) {
  payMethod = method;
  var isCard = method === '카드결제';
  document.getElementById('paySlider').style.transform = isCard ? 'translateX(0)' : 'translateX(100%)';
  var items = document.querySelectorAll('#payToggle .toggle-item');
  items[0].classList.toggle('active', isCard);
  items[1].classList.toggle('active', !isCard);
  document.getElementById('row_card').style.display = isCard ? 'flex' : 'none';
  recalc();
}
```

금액 규칙은 `getValues`의 `payMethod === '카드결제'` 분기에서 카드결제일 때만 적용된다.

### `setWht` — 파일:줄

`tools/legacy-gas/영업수수료 계산/Index.html:274-282`

```javascript
function setWht(v) {
  whtApply = v === '적용';
  document.getElementById('whtSlider').style.transform = whtApply ? 'translateX(0)' : 'translateX(100%)';
  var items = document.querySelectorAll('#whtToggle .toggle-item');
  items[0].classList.toggle('active', whtApply);
  items[1].classList.toggle('active', !whtApply);
  document.getElementById('row_wht').style.display = whtApply ? 'flex' : 'none';
  recalc();
}
```

### `setExp` — 파일:줄

`tools/legacy-gas/영업수수료 계산/Index.html:285-295`

```javascript
function setExp(mode) {
  expMode = mode === 'manual' ? 'manual' : '8';
  var isEight = expMode === '8';
  document.getElementById('expSlider').style.transform = isEight ? 'translateX(0)' : 'translateX(100%)';
  var items = document.querySelectorAll('#expToggle .toggle-item');
  items[0].classList.toggle('active', isEight);
  items[1].classList.toggle('active', !isEight);
  document.getElementById('row_exp_manual').style.display = isEight ? 'none' : 'flex';
  recalc();
}
```

### `getExpenseRate` — 파일:줄

`tools/legacy-gas/영업수수료 계산/Index.html:297-301`

```javascript
function getExpenseRate() {
  if (expMode === 'manual') {
    return parseNum(document.getElementById('f_exp_manual').value) / 100;
  }
  return 0.08;
}
```

따라서 수기율이 없으면 기본 제경비율은 `0.08`이다. 수기율은 입력 백분율을 100으로 나눈 값을 건별로 사용한다.

### `xround` — 파일:줄

`tools/legacy-gas/영업수수료 계산/Index.html:318-320`

```javascript
function xround(n) {
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));
}
```

정의는 다음과 같다.

- 자리: 소수 0자리, 즉 원 단위.
- 방향: 절대값을 기준으로 반올림하고 원래 부호를 복원한다.
- `0.5`: 절대값 기준 0.5 이상 올림한다. `1.5 → 2`, `-1.5 → -2`다.
- 이식: `BigDecimal.setScale(0, RoundingMode.HALF_UP)`.

### 계산 순서 — `getValues` 원문

`tools/legacy-gas/영업수수료 계산/Index.html:323-340` 원문은 다음 순서다.

```javascript
var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;
var sales = total - equip + card;
var expense = xround(sales * -expenseRate);
var wht = whtApply ? xround(sales * -0.033) : 0;
var dogup = xround(install * -0.08);
var safety = -safetyInput;
var subtotal = sales + expense + wht + dogup + safety;
var payout = subtotal - prepaid;
var supply = xround(subtotal / 1.1);
var vat = subtotal - supply;
```

그러므로 순차 곱셈 방식도, 모든 항목을 원 매출 기준으로 따로 계산해 합산하는 방식도 아니다.

1. 총액에서 카드 공제를 먼저 반영한다.
2. `sales = total - equip + card`를 공제 기준액으로 만든다.
3. 제경비와 원천징수는 이 `sales` 기준액에서 각각 공제한다.
4. 설치비는 설치 입력액의 8%를 별도 공제하고, 안전관리비 입력액은 전액 공제한다.
5. 위 항목을 합산해 소계를 만든다.
6. 선지급은 소계나 계산 기준 금액이 아니라 `payout`에서만 차감한다.
7. 공급가와 부가세는 소계 기준으로 나눈다.

대표 fixture `total=10,000,000`, `equip=0`, `prepaid=0`, `install=0`, `safety=0`, 카드, 원천 적용, 기본 제경비 8%의 결과는 다음과 같다.

```text
card     = -300,000
sales    = 9,700,000
expense  = -776,000
wht      = -320,100
subtotal = 8,603,900
payout   = 8,603,900
supply   = 7,821,727
vat      = 782,173
```

## 2. 구현

### versioned 계약

`SalesCommissionRateContract`를 `BaseEntity` 기반 entity로 추가했다.

- `version_no` unique.
- `card_rate`, `expense_rate`, `withholding_rate`, `install_rate` 모두 BigDecimal.
- 공개 setter와 기존 계약 수정 메서드가 없다. 요율 변경은 새 계약 entity를 만든다.
- V98에 기본 version 1을 seed했다: `0.03`, `0.08`, `0.033`, `0.08`.
- BaseEntity 7 audit와 `is_deleted` soft delete를 포함했다.

### 계산기

`SalesCommissionSettlementCalculator`가 레거시 순서를 그대로 수행한다.

- `SalesCommissionPaymentMethod.CARD`일 때만 카드 공제.
- `manualExpenseRate == null`이면 계약의 기본 제경비율을 사용.
- 수기율이 있으면 해당 정산에만 적용하고 `applied_expense_rate`로 snapshot.
- 카드·제경비·원천·설치·공급가에만 `xround` 적용.
- 선지급은 `payout = subtotal - prepaid`에만 적용.
- VAT divisor는 `new BigDecimal("1.1")`이며 double 계산은 없다.

### 정산 snapshot과 계약 FK

`SalesCommissionSettlement`에 다음을 추가했다.

- `rate_contract_id`의 `ManyToOne` 계약 버전 참조.
- 계산 입력 snapshot: 총액, 장비대, 선지급, 설치 입력액, 안전관리비 입력액, 결제방식, 원천징수 적용 여부, 수기 제경비율.
- 계산 결과 snapshot: 적용 제경비율, 카드, sales, 제경비, 원천, 설치, 안전관리비, 소계, 지급액, 공급가, VAT.
- `recordCalculation(...)` domain chain 메서드로 계약·입력·결과를 함께 기록.
- 기존 S1 draft 호환을 위해 migration FK는 nullable이나, 계산 기록 시 계약 버전은 필수다.

요율 버전이 바뀌어도 과거 정산은 저장된 결과 snapshot을 읽는다. 테스트에서 version 1의 제경비 `-800`과 version 2의 `-700`을 각각 기록한 뒤 version 1 정산을 다시 확인해 `-800`이 유지됨을 확인했다.

### V98

accounting-service migration 최대값을 먼저 세어 `V97`임을 확인했고, `V98__add_sales_commission_rate_contract_snapshot.sql`을 추가했다.

- 계약 table과 기본 version 1 seed.
- S1 정산 table의 계약 FK와 입력·결과 snapshot columns.
- 계약 버전 unique constraint, FK, active index.
- 모든 신규 table에 BaseEntity 7 audit와 soft delete.

## 3. RED 원문

production type을 추가하기 전 `SalesCommissionSettlementCalculatorTest`와 계약 테스트를 작성하고 다음 명령을 실행했다.

```text
.\gradlew.bat :services:accounting-service:test --tests '*SalesCommissionSettlementCalculatorTest' --no-daemon
```

실행 원문 핵심은 다음과 같다.

```text
> Task :services:accounting-service:compileTestJava FAILED
error: cannot find symbol
import ...SalesCommissionSettlementCalculator
error: cannot find symbol
SalesCommissionPaymentMethod
error: cannot find symbol
SalesCommissionSettlementCalculationInput
error: cannot find symbol
SalesCommissionRateContract
...
28 errors
FAILURE: Build failed with an exception.
BUILD FAILED
```

이는 기존 테스트 회귀가 아니라 구현 전 신규 타입 부재로 인한 의도한 RED였다. snapshot/service 경로도 구현 전에 다음 RED를 확인했다.

```text
> Task :services:accounting-service:compileTestJava FAILED
required: SalesCommissionSettlementRepository,SalesCommissionSettlementNumberService
found:    SalesCommissionSettlementRepository,SalesCommissionSettlementNumberService,SalesCommissionSettlementCalculator
error: cannot find symbol
method calculate(UUID, SalesCommissionRateContract, SalesCommissionSettlementCalculationInput)
7 errors
BUILD FAILED
```

## 4. 조합표

| 조합 | 입력·계약 | 결과 및 검증 |
|---|---|---|
| 수기율 없음 | 총액 1,000,000, 장비대 100,000, 현금, 원천 미적용, 계약 제경비 8% | `sales=900,000`, `expense=-72,000` — 기본율 사용 |
| 수기율 있음 | 동일 입력, 수기 제경비율 7% | `expense=-63,000`, `appliedExpenseRate=0.07` |
| 선지급 없음 | 총액 1,000,000, 현금, 원천 미적용 | `subtotal=920,000`, `payout=920,000` |
| 선지급 있음 | 동일 입력, 선지급 100,000 | `subtotal=920,000`, `payout=820,000`; supply 계산 기준은 동일 |
| 요율 버전 변경 후 과거 조회 | version 1 제경비 8% → version 2 제경비 7% | 과거 snapshot `-800` 유지, 신규 snapshot `-700`, 각 정산이 자기 version을 참조 |
| 금액 0 | 모든 금액 0, 카드, 원천 적용 | 카드·소계·지급액·공급가·VAT 모두 0 |
| 반올림 경계 | 총액 50, 카드 3% | `-50 × 0.03 = -1.5`, xround 결과 `card=-2`, `sales=48` |
| 지급액 음수 | 총액 0, 선지급 100 | `subtotal=0`, `payout=-100` |
| 설치·안전관리비 | 총액 1,000, 장비대 100, 설치 100, 안전관리비 25, 현금·원천 미적용 | `sales=900`, `expense=-72`, `install=-8`, `safety=-25`, `subtotal=795`, `supply=723`, `vat=72` |

## 5. 테스트 결과

### S2 targeted

```text
SalesCommissionRateContractTest                         2 / 0 / 0 / 0
SalesCommissionSettlementCalculationSnapshotTest        2 / 0 / 0 / 0
SalesCommissionSettlementCalculatorTest                12 / 0 / 0 / 0
SalesCommissionRateContractMigrationSqlTest             1 / 0 / 0 / 0
SalesCommissionSettlementCalculationServiceTest         1 / 0 / 0 / 0
합계                                                     18 / 0 / 0 / 0
BUILD SUCCESSFUL
```

### S1 회귀

기존 S1과 동일한 4개 test class를 실행했다.

```text
SalesCommissionSettlementTest                    2 / 0 / 0 / 0
SalesCommissionSettlementNumberServiceTest       1 / 0 / 0 / 0
SalesCommissionSettlementServiceTest             7 / 0 / 0 / 0
SalesCommissionSettlementNumberSequenceIT        9 / 0 / 0 / 0
합계                                             19 / 0 / 0 / 0
BUILD SUCCESSFUL
```

### accounting 전체

```text
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon

Gradle HTML: 1,859 tests / failures=0 / ignored=10
BUILD SUCCESSFUL in 8m 47s
```

앞선 SOL 기준선 1,841건은 모두 유지됐고, 이번 S2 신규 테스트 18건이 추가되어 최종 1,859건이다.

### 기존 4행 경로 불변

최종 tracked diff의 기존 파일은 S2 snapshot을 붙인 accounting 정산 aggregate와 service뿐이다. `clients`, product-service, slip-service의 견적·전표 수수료 경로에는 변경이 없다. 새 코드는 `double`, `Double`, `Math.round`, `Math.floor`를 사용하지 않는다. `git diff --check`도 통과했다.

## 6. 신규·변경 파일

### 신규

- `docs/dev-reports/2026-08-11-dg1-s2-implementation.md`
- `docs/superpowers/specs/2026-08-11-dg1-s2-design.md`
- `docs/superpowers/plans/2026-08-11-dg1-s2.md`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionPaymentMethod.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionRateContract.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementCalculationInput.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementCalculationResult.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionRateContractRepository.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java`
- `services/accounting-service/src/main/resources/db/migration/V98__add_sales_commission_rate_contract_snapshot.sql`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionRateContractTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementCalculationSnapshotTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementCalculatorTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/migration/SalesCommissionRateContractMigrationSqlTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculationServiceTest.java`

### 기존 파일 변경

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlement.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java`

기존에 있던 `docs/dev-reports/2026-08-11-dg1-s1-date-lock.md` 미추적 파일은 건드리지 않고 보존했다. commit, push, 공유 DB write, 배포는 수행하지 않았다.
