---
name: feedback_freight_cutting_amount_first_entry
description: 운임·절삭은 제외 대상이 아니라 계승 대상 — 금액을 입력하면 수량 1 이 자동으로 붙어 견적서에 포함된다 (일반 품목과 입력 방향이 반대)
metadata:
  type: feedback
---

# 운임·절삭은 **금액 입력 → 수량 1 자동** (2026-08-06 개발책임자)

> 개발책임자 원문
> *"운임, 절삭의 경우 금액을 입력하면 수량이 '1' 자동 들어가면서 견적서에 포함되는 시스템이거든. 기존 GAS는 말야."*

## 규칙 (레거시 원문에서 확인)

`tools/legacy-gas/종합견적서/index.html:2698` `handleFreightInput`

```js
if (val === 0) { priceMap.set(model, 0);   qtyMap.set(model, 0); }        // 금액 0 → 수량 0
else           { priceMap.set(model, val); qtyMap.set(model, 1, true); }  // 금액 입력 → 수량 1 (lock)
if (isCut && val !== 0) val = -Math.abs(val);                             // 절삭은 항상 음수
```

렌더링(`:7004~`)은 일반 품목과 **입력 방향이 정반대**다.

```text
일반 품목    수량 입력 · 단가 자동
운임·절삭    금액 입력 · 수량 자동      수량 칸은 qty-static (읽기 전용)
                                       단가 칸에 전용 input 을 주입
정렬         목록 맨 뒤로 (index.html:5319-5320)
```

**Why**: 이 행들은 "제품이 아닌 잡행" 처럼 보이지만 **견적서에 실제로 포함되는 항목**이다. 카탈로그에서 빼면 견적 금액이 달라진다. `절삭`은 음수라 총액을 깎는다.

**How to apply**:
- `구형` 탭의 `운임`·`절삭` 행을 sync 에서 **제외하지 마라**. `products` 에 `selling_price = 0` 으로 있는 것이 정상 기준선이다 (금액 미입력 상태).
- 견적 화면을 만들 때 이 두 행은 **수량 입력을 막고 금액 입력을 열어야** 한다. 반대로 만들면 계승 실패다.
- 2026-08-06 실측: 우리 견적 화면(`EstimateFormPage.tsx` 등)에 이 처리가 **0건 — 미계승**이다.
- `거래처 발송 주문서` 계열 레거시는 운임·절삭을 표시에서 **제외**한다(`Code.js:681` 등). 문서마다 취급이 다르므로 **어느 레거시 문서인지 먼저 확정**할 것.

## 🚩 PM 이 여기서 만든 낭비

PM 이 레거시 GAS 를 **읽지 않은 채** *"제품이 아닌 행이 품목으로 저장되지 않는다"* 를 불변식으로 걸어 차단 라운드를 발주했다. 개발책임자가 즉시 정정했고(*"기존 GAS 코드를 확인했어야지"*), 라운드를 중단·되돌렸다(테스트 67줄 폐기).

🔑 **계승 트랙에서 "이건 잡행 같다" 는 판단은 레거시 원문 없이 내리면 안 된다.** 브리핑에 레거시 확인을 넣는 것으로는 부족하다 — **PM 이 먼저 보고 좌표를 줘야** 한다. 관련: [[feedback_gas_full_inheritance_definition]] · [[feedback_pm_gives_coordinates_not_means]] · [[feedback_pm_verifies_round_and_directs_next_fix]]
