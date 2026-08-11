# D-G2 구현 조사 보고 — 전제 불일치로 중단

> 조사일: 2026-08-11
> 대상: PR #1166 / `feat/dg2-dc-cap-unify-48`
> 결정: 메인장비 부재 DC 상한을 주문서 48%로 통일
> 상태: **구현하지 않음**

## 1. 중단 사유

개발책임자 지시의 착수 조건은 다음과 같다.

```text
49 / 48 clamp가 실제 코드에 있어야 한다.
값이 49/48이 아니거나 clamp 지점이 없으면 구현하지 않고 중단한다.
```

코드 원문 대조 결과, 견적에는 `49% clamp`가 없다. 견적은 45% 기준에 tier bonus를 더하는 방식으로 최대 49%가 **산출**될 뿐이다. 주문에는 48%를 명시한 clamp가 있다. 또한 백엔드에는 문서별 49/48 clamp가 없고, 일반 DC 입력 상한 `0.9999`만 있다.

따라서 견적 49% clamp와 주문 48% clamp가 갈라져 있다는 전제가 성립하지 않아 구현을 중단한다. 49%를 48%로 바꾸는 코드·테스트·실데이터 생성은 수행하지 않았다.

## 2. 좌표 전수 및 원문 인용

### 2.1 프런트엔드 — 견적

운영 EJS 경로:

`clients/web/estimate-app/views/index.ejs:13948`

```js
if(hBonus > 0) calcH += hBonus;
```

`clients/web/estimate-app/views/index.ejs:13955`

```js
if(cBonus > 0) calcC += cBonus;
```

두 줄 모두 `Math.min(..., 0.49)` 또는 49% clamp가 아니다. 해당 래퍼의 tier 최대값은 다음과 같다.

`clients/web/estimate-app/views/index.ejs:13930-13934`

```js
if (sum >= 100000000) return 0.04;
if (sum >= 50000000)  return 0.03;
if (sum >= 30000000)  return 0.02;
if (sum >= 10000000)  return 0.01;
return 0;
```

따라서 기본 45%에서 최대 tier bonus 4%를 더해 49%가 될 수 있지만, 이것은 clamp가 아니다.

동일 레거시 견적 원문에도 같은 상태가 남아 있다.

- `tools/legacy-gas/종합견적서/index.html:13361` — `if(hBonus > 0) calcH += hBonus;`
- `tools/legacy-gas/종합견적서/index.html:13368` — `if(cBonus > 0) calcC += cBonus;`

### 2.2 프런트엔드 — 주문

`clients/web/order-app/index.html:8127`

```js
if(hBonus > 0) calcH = Math.min(calcH + hBonus, 0.48);
```

`clients/web/order-app/index.html:8134`

```js
if(cBonus > 0) calcC = Math.min(calcC + cBonus, 0.48);
```

주문 쪽에는 명시적인 `0.48` clamp가 실제로 존재한다. 실외기 부재 판정과 페널티는 같은 래퍼에서 별도로 수행된다.

`clients/web/order-app/index.html:8116-8119`

```js
const noMain = isNoMainUnit();
if(noMain) {
  if(isStandard45(calcH)) calcH = 0.40;
  if(isStandard45(calcC)) calcC = 0.40;
}
```

레거시 주문 원문에도 같은 48% clamp가 있다.

- `tools/legacy-gas/거래처 발송 주문서/index.html:7758` — `if(hBonus > 0) calcH = Math.min(calcH + hBonus, 0.48);`
- `tools/legacy-gas/거래처 발송 주문서/index.html:7765` — `if(cBonus > 0) calcC = Math.min(calcC + cBonus, 0.48);`

### 2.3 백엔드

백엔드 DC 설정 변경 경로는 49/48 문서별 clamp가 아니다.

`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/DcConfigService.java:112-117`

```java
BigDecimal homeRate = parsePercent(req.homeMultiDc());
BigDecimal commercialRate = parsePercent(req.commercialMultiDc());
if (homeRate != null || commercialRate != null) {
    dc.changeRates(
            homeRate != null ? homeRate : dc.getHomeDiscountRate(),
            commercialRate != null ? commercialRate : dc.getCommercialDiscountRate());
}
```

`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/DcConfig.java:132-134`

```java
public void changeRates(BigDecimal homeDiscountRate, BigDecimal commercialDiscountRate) {
    this.homeDiscountRate = clampRate(homeDiscountRate);
    this.commercialDiscountRate = clampRate(commercialDiscountRate);
}
```

`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/DcConfig.java:172-180`

```java
private static BigDecimal clampRate(BigDecimal v) {
    if (v == null) {
        return null;
    }
    if (v.signum() < 0) {
        return BigDecimal.ZERO;
    }
    BigDecimal max = new BigDecimal("0.9999");
    return v.compareTo(max) > 0 ? max : v;
}
```

즉 백엔드의 실제 일반 입력 상한은 `0.9999`이며, 실외기 부재·tier bonus·견적/주문 문서별 49/48 clamp는 확인되지 않았다. 백엔드 소스에서 `getTierBonusRate`, `isNoMainUnit`, `LATEST_CALC_RATES`의 대응 구현도 확인되지 않았다.

## 3. 단일화 지점 판정

판정 불가. 견적에는 49% clamp가 없고 주문에만 48% clamp가 있으며, 백엔드는 두 문서의 상한을 계산하지 않는다. 따라서 현재 코드 구조에서 “두 문서가 서로 다른 두 clamp 상수를 사용한다”는 식으로 단일화 지점을 정할 수 없다.

## 4. RED 및 조합표

착수 조건 위반으로 아래 테스트는 실행하지 않았다.

| 조합 | 견적 | 주문 | 신규/기존행 열기 | 상태 |
|---|---|---|---|---|
| 실외기 있음 × 48% 미만 | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 있음 × 정확히 48% | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 있음 × 48% 초과 | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 없음 × 48% 미만 | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 없음 × 정확히 48% | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 없음 × 48% 초과 | 미실행 | 미실행 | 신규 | 전제 불일치 중단 |
| 실외기 있음/없음 × 각 할인율 | 미실행 | 미실행 | 기존행 열기 | 전제 불일치 중단 |

RED-A의 “견적 실외기 없음 + 49% 입력이 현재 통과”는 위 원문상 tier 합산 경로에서는 가능하지만, 이를 입증하는 실데이터 생성은 수행하지 않았다. RED-B와 주문서 현행 동작도 변경 전제 확인 전에는 실행하지 않았다.

## 5. 변경·테스트·데이터·Git 상태

- production code 변경: 없음
- test 변경: 없음
- migration: 없음
- DB 직접 write: 없음
- 공유 DB write: 없음
- 실데이터 생성: 없음
- 신규 파일: 이 보고서 1개
- 실행한 테스트: 없음 — 구현 중단 조건에 따라 미실행
- Git 조작: 없음
- 배포 및 `samhan-*` 조작: 없음

## 6. 다음 결정 필요

구현을 재개하려면 먼저 다음 중 하나를 개발책임자가 정해야 한다.

1. 견적의 `45% + tier bonus` 합산 경로를 D-G2의 “49% 상한”으로 인정하고, 이를 48% clamp로 바꿀지
2. 견적과 주문의 레거시 HTML/EJS가 각각 별도 배포되는 현재 구조에서 48% 정책의 단일 소스를 어디에 둘지
3. 백엔드 `0.9999` 일반 상한도 D-G2 범위에 포함할지, 아니면 프런트 tier 계산만 범위로 볼지

개발책임자의 원래 지시대로 위 결정 전에는 구현하지 않는다.
