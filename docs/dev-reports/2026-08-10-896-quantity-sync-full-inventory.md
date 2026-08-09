# #896 수량 동기화 — 전수 인벤토리와 "기본값 세팅" 가능성 판정

> 2026-08-10 · PM(Claude) 종합 · 조사 기준 `0be8ecd8d`(브랜치 `feat/896-qty-sync-chip-track`, working tree clean)
> 11 에이전트 · 2,299,896 토큰 · 각 결론에 반증 라운드
> 개발책임자 지시: *"싱글중대형, 상업멀티, 구형 모두 동일한 규칙"* · *"양쪽 다"* · *"레거시 코드처럼 사용하고 싶어"* · *"기능은 모두 구현되었다면 기본값 세팅만 잘해주면 돼"* · *"누락 좀 없이"*

---

## 0. 한 줄 결론

> **개념은 스키마에 있고, 그것을 계산하는 코드가 저장소에 없습니다.**
> 옵션이 없는 순수 선형 계열은 지금 세팅만으로 되지만, **옵션이 얽힌 계열은 세팅해도 동작하지 않습니다.**

⟹ *"기능은 모두 구현되었다면"* 의 전제가 **부분적으로만 참**입니다. 그래서 세팅 목록과 함께 **무엇을 더 만들어야 하는지**를 이 문서가 함께 냅니다.

---

## 1. 계열 총계 — **합집합 45**

기존 S4 정찰(`2026-07-30-896-s4-quantity-sync-recon.md`)의 **20계열은 order-app 기준**이었고 estimate-app 을 명시 제외했습니다(§5). 이번이 양쪽 첫 전수입니다.

| 앱 | 홈멀티 | 싱글중대형 | 상업멀티 | 구형 | 소계 |
|---|---:|---:|---:|---:|---:|
| **종합견적서** `estimate-app` | 13 | 11 | 12 | 1 | **37** |
| **주문서** `order-app` | 16 | 5 | 9 | 0 | **30** |

두 수집본의 **입도가 달라** 그대로 더하면 안 됩니다(estimate 는 판넬 2계열을 하나로, order 는 싱글 BOM 4계열을 하나로 묶음). 공통 자로 재계수했습니다:

> **한 계열 = (source 모집합 · target 품목군 · 지배 옵션축)이 같은 업무 관계 하나**

```text
짝지어진 계열      35
종합견적서 전용    10       ← 전부 estimate 쪽 순증
주문서 전용         0
합집합             45
```

---

## 2. 🚨 가장 큰 위험 — 주문서는 서버 규칙을 **수량에 전혀 반영하지 않는다**

```text
grep -c "applyServer" clients/web/order-app/index.html   →  0
```

주문서의 유일한 규칙 소비는 `loadSingleS03QuantitySync_()`(`index.html:5545-5558`)인데 **`console.info` 만 하고 수량을 쓰지 않습니다.**

> **관리자가 규칙을 만들면 견적서 수량만 바뀌고 주문서는 legacy 값 그대로입니다.**
> 같은 안건에서 두 문서의 금액이 갈립니다.

개발책임자께서 *"양쪽 다"* 라고 하신 이유가 여기 있습니다.

---

## 3. 🚨 그리고 같은 규칙이 **네 곳**에 독립 구현돼 있습니다

인벤토리가 웹 두 파일만 셌고, 완전성 비평이 **세 번째·네 번째 구현**을 찾았습니다.

### M-1 — 서버 `BundleExpander`

```java
// services/product-service/.../BundleExpander.java:114-116
BigDecimal qty = c.getQtyMode() == BundleComponent.QtyMode.FOLLOW_SET
        ? setQty.multiply(c.getDefaultQty())
        : c.getDefaultQty();
```

클래스 Javadoc 이 이식 사실을 스스로 명시합니다(`:27-28`):

> *"BUNDLE(세트) → 구성품 전개 엔진 — legacy 종합견적서 index.html explodeSetParts/explodeCommSets_/splitIndoorOutdoorToK **완전 충실 이식**"*

그리고 **웹과 같은 옵션 축을 서버가 독립 재구현**합니다 — `ExpandOptions(remoteOption, …)`(`:513-518`), `pickPanel()`(`:173-232`), `resolveRemotes()`(`:235-266`), `allowRemoteChange()`(`:292-295`).

실측 구성품: **PANEL 250행 · REMOTE 315행 · MATERIAL 273행**.

### M-2 — 데스크톱 전표/견적

`bundleOptionDomain.ts:7` 에 같은 옵션 도메인이 또 있습니다.

⟹ **판넬·리모컨·유연호스·자재 4개 품목군은 한 견적에서 최대 4번 독립 결정됩니다.**

---

## 4. 🚨 옵션 조건 — 저장은 되는데 **평가기가 없다**

### 있는 것 — 저장·검증·API 왕복 완비

```java
// QuantitySyncRuleValidator.java:32-33
private static final Set<String> CONDITION_OPERATORS =
    Set.of("optionEquals", "optionIn", "all", "any", "not");
```

```sql
-- V24:15, :29
condition_json JSONB NOT NULL DEFAULT '{}'::jsonb
CHECK (jsonb_typeof(condition_json) = 'object')
```

요청·응답 DTO 둘 다 `@JsonProperty("when") JsonNode conditionJson`. 즉 **지금도 조건을 저장하고 내려받을 수 있습니다.**

### 없는 것 ① — 평가기

```text
Grep "optionEquals|optionIn"  →  clients/ 전체 0건
```

- `estimate-app` evaluator(`src/quantitySync.ts:41-70` · `public/quantitySync.js:23-54`)가 참조하는 필드는 **6개뿐**: `enabled` `estimateCategory` `aggregation` `inactiveBehavior` `sources` `targets`. `when`/`condition` 문자열이 **파일에 없습니다.**
- `when` 을 읽는 유일한 클라이언트는 order-app 인데, **읽는 이유가 거부하기 위해서**입니다:

```ts
// clients/web/order-app/src/quantitySync.ts:126-129
const when = rule.when ?? rule.conditionJson ?? {}
if (!when || typeof when !== 'object' || Array.isArray(when) || Object.keys(when).length > 0) {
  return selectionError('S-03 규칙은 조건 없는 설정만 지원합니다.')
}
```

> **조건이 하나라도 붙은 규칙은 order-app 에서 규칙 자체가 탈락합니다.**

### 없는 것 ② — 옵션 key 사전

`QuantitySyncRuleValidator.java:534-544` 주석이 스스로 미뤄 둔 것을 적고 있습니다 — 하드코딩 18개 key 의 근거를 저장소에서 못 찾았고, 실 legacy 식별자는 DOM selector(`#home_no_hose`)·플래그(`showIHose`·`outdoorModel`·`branchSlots`) 형태라 **문자 그대로 일치가 0개**였습니다.

---

## 5. 그래서 옵션이 걸린 계열이 얼마나 되는가

레거시 수량은 이 옵션들에 좌우됩니다:

| 옵션 | 하는 일 |
|---|---|
| `#home_no_hose` 유연호스 제외 | 호스 전 계열 **0** |
| `#home_hose_i` 유연호스 I형 | target 을 L형 ↔ I형 **대체**(한쪽 0). 거래처 DC 설정 `showIHose` 로 **자동 체크** |
| `#home_panel` 판넬변경 | `판넬제외` → 전부 0 / `공청판넬`·`AI` → **target 모델 통째 대체**(6~12개) |
| `#home_remote` 리모컨 | `제외` → 0 / `유선`·`컬러` → **다른 모델 + 유선키트** |
| `#home_no_branch` 분기관 제외 | 분기관 0 |
| `#home_foot` 실외기받침 | 발통 계열 on/off |

⟹ 45계열 중 **옵션 없는 순수 선형만이 지금 세팅으로 재현 가능**합니다. 나머지는 **평가기부터** 있어야 합니다.

---

## 6. 세팅 작업의 최대 함정 — 부분 성공이 없다

```js
// clients/web/estimate-app/public/quantitySync.js:61
// evaluateRule 이 하나라도 null 이면 → 전체 null
```

`evaluateRule` 이 `null` 을 내는 조건: `enabled !== true` · `estimateCategory` 불일치 · `aggregation !== 'SUM'` · `inactiveBehavior !== 'ZERO'` · sources/targets 비어 있음 · **모든 source/target `productCode` 가 카탈로그에 존재** · factor/multiplier 가 유한 양수.

> **규칙 45개를 넣었는데 그중 하나의 품목코드가 카탈로그에 없으면 45개가 다 죽습니다.**
> 그리고 그 순간 화면은 **전량 legacy fallback** 으로 조용히 돌아갑니다.

부수 위험 하나 더 — `targetCodes`(`index.ejs:8352-8353`)는 `trim()` 만 하고 **대소문자 그대로** 비교하는데 evaluator 는 uppercase 로 매칭합니다. 대소문자가 어긋난 규칙은 **evaluator 는 성공하는데 적용은 안 되는** 상태가 됩니다.

---

## 7. PM 권고 — 순서

| 단계 | 내용 | 왜 이 순서인가 |
|---|---|---|
| **A** | 주문서에 규칙 소비 경로를 붙인다 | 지금 세팅하면 **두 문서의 금액이 갈립니다.** 가장 급합니다 |
| **B** | 옵션 조건 평가기를 만든다 + 옵션 key 사전을 고정한다 | 이것 없이는 45계열 중 옵션 계열을 세팅해도 **동작하지 않습니다** |
| **C** | 계열별로 규칙을 세팅하고 **레거시와 exact diff 0** 을 확인한 뒤 전환 | S4 §4 가 이미 지시한 shadow 비교. `#1126` R6 의 계열 단위 병합 구조가 이 점진 전환을 가능하게 합니다 |
| **D** | 서버 `BundleExpander`·데스크톱과의 정합 | 같은 견적이 네 곳에서 다르게 계산되지 않도록 |

🚫 **A·B 없이 C 부터 하면 안 됩니다** — 세팅한 규칙이 주문서에서 무시되거나(A), 옵션을 못 읽어 틀린 수량을 냅니다(B).

---

## 8. 이 조사가 못 한 것

- 라이브 GUI 로 45계열을 하나씩 밟지 않았습니다(코드·DB 실측 기준).
- 데스크톱 표면(M-2)은 존재 확인까지이고 계열 단위로 세지 않았습니다.
- `H-07`(차감·하한·게이트)·`C-09`(보드 순서·누적용량)는 S4 가 이미 *"현 스키마 표현 판정 어려움"* 으로 분류했고 이번에도 같습니다.
