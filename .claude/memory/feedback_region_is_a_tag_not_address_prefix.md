---
name: feedback_region_is_a_tag_not_address_prefix
description: 🚨 우리 판매전표의 "지방"·"야적" 은 배송주소 문자열이 아니라 delivery_tag(REGION·STACK) 태그다 — 이카운트 방식과 다름 (2026-08-01 개발책임자 정정)
metadata:
  type: feedback
---

# 🚨 "지방"·"야적" 은 **태그**다 — 배송주소 문자열이 아니다

**2026-08-01 개발책임자 정정:**

> 이카운트와 달리 우리 판매전표의 '지방'은 배송주소 앞에 '지방/'을 붙이는 방식이 아니라 **태그 방식**이므로 주의
>
> 그래 **지방뿐 아니라 야적도 태그 방식**이므로 주의해

## 실측

```java
// services/slip-service/.../domain/DeliveryTag.java:19
REGION("지방", SlipType.OUTBOUND, true),
STACK("야적",  SlipType.OUTBOUND, true),   // 지방과 같은 자리·같은 성격
```

```sql
SELECT delivery_tag, count(*) FROM slips WHERE deleted_at IS NULL GROUP BY 1;
 (없음) 2261 | DAY 52 | REGION 12 | STACK 11 | RETURN_RENTAL 10
```

`slips.delivery_tag VARCHAR(30)` — `DAY`(당일) · `REGION`(지방) · `STACK`(야적) · `RETURN_RENTAL` 등.

## 틀린 세 가지 방식

| | |
|---|---|
| ❌ 배송주소 앞 `지방/` 접두 파싱 | **이카운트 방식**이며 우리 것이 아니다 |
| ❌ 17개 시도 문자열 매칭 | `services/arologis-service/.../RegionalService.java` 가 이렇게 한다 — **현행이 틀렸다** |
| ✅ `slips.delivery_tag = 'REGION'` (지방) · `'STACK'` (야적) | 우리 정식 수단 |

**Why:** 레거시 GAS 와 이카운트는 지방 여부를 **문자열 표식**으로 다뤘다. 우리는 **열거형 태그**로 구조화했다. 계승·이관 작업에서 원본의 문자열 방식을 그대로 옮기면 **이미 있는 정식 수단을 우회**하고, 주소 표기가 바뀌면 조용히 오분류된다.

🔑 [[feedback_gas_full_inheritance_definition]] 의 원칙이 그대로 적용된다 — *"무엇을 판정하는가"* 는 계승 대상, *"어떻게 표시했는가"* 는 아니다. 레거시의 `지방` 표식은 후자다.

## How to apply

- **지방 · 야적 · 당일** 판정이 필요하면 **`delivery_tag` 를 보라.** 주소 문자열을 파싱하지 마라. 지방과 야적은 `autoMemo=true` 로 **같은 성격**이며 V52 배송일정 구조화 대상이다.
- 레거시·이카운트 이관 작업에서 *"`지방/` 접두"* 나 *"시도명 목록"* 이 나오면 **그것을 재현하지 말고 태그로 매핑**하라.
- ⚠️ **`REGION` 12건 · `STACK` 11건뿐이다.** 실제 지방 배송 건수와 맞는지, 아니면 태그가 잘 안 붙고 있는지는 별도 확인이 필요하다 — 태그 기반으로 바꾸기 전에 **양쪽 건수를 세어 대조**하라.
- `RegionalService` 의 17개 시도 분류를 태그 기반으로 바꿀 때는 **그것을 쓰는 곳을 전수로 찾아** 영향 건수를 먼저 세라([[feedback_fix_blocks_normal_path]]).

## 관련
[[feedback_gas_full_inheritance_definition]] · [[feedback_jeonpyo_not_slip]](용어 규율) · PR #1027(#1013 배차 계승)
