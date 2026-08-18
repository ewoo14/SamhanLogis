---
name: feedback_options_come_from_component_settings
description: 🚨🚨 견적/주문 화면의 옵션 목록은 하드코딩이 아니라 그 세트의 구성품에 설정된 variant 를 그대로 표시한다 (2026-08-17 개발책임자 정정)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T02:25:38.875Z
---

# 🚨🚨 옵션 목록은 **구성품 설정**에서 나온다 — 화면에 박지 마라

> 2026-08-17 개발책임자: *"옵션은 **구성품에 설정한 옵션 목록을 그대로 표시**하는걸로 했었는데? 아직도 옵션이 하드코딩되어있나?"*

## 확정

```text
세트를 고르면, 그 세트의 구성품에 설정된 variant 목록이 옵션 셀렉트가 된다
구성품에 없는 옵션은 화면에 나타나지 않는다
구성품 설정을 바꾸면 화면 옵션이 따라 바뀐다
```

## 실측 — DB 축은 이미 통일돼 있었다

```text
bundle_component.component_variant (2026-08-17 · product_db · is_deleted=false)

  PANEL      기본 68 · 공청 68 · 블랙 57 · 승강 57
  REMOTE     기본 188 · 컬러 65 · 유선 62
  MATERIAL   자재 273
  INDOOR     기본 271
  OUTDOOR    기본 271 · S6-1111-MANUAL 1
  ACCESSORY  기본 67

채움률  REMOTE 315/315 · PANEL 250/250 · MATERIAL 273/273 · INDOOR 271/271
```

반면 화면은 각자 고정 목록을 갖고 있다.

```text
index.ejs:7804  home_remote   기본 · 유선 · 컬러 · 제외
index.ejs:6638  comm_remote   제외 · 무선 · 유선 · 컬러유선
index.ejs:7846  ss_remote     유선리모컨 · 컬러유선리모컨
```

🔑 **이름이 화면마다 갈린 이유가 바로 이것이다.** 원천을 구성품 하나로 하면 통일이 저절로 된다.
⟹ 통일 작업은 *"화면 목록을 서로 맞추기"* 가 아니라 **"화면 목록을 지우고 구성품에서 읽기"** 다.

## 🚩 PM 이 틀린 것

```text
① "화면마다 하드코딩된 목록을 서로 맞추자" 로 브리핑을 짰다
   → 원천이 셋으로 남아 다음에 또 갈린다

② panel_type 축에 인피니트·동작감지를 늘릴지 개발책임자께 물었다
   → component_variant 에는 그 값들이 아예 없다
     화면 하드코딩에만 있던 값이라, 구성품 기준으로 바꾸면 애초에 안 나온다
     물어야 했던 것은 "이 값들이 사라지는 게 맞는가" 였다
```

## 살아 있는 관련 확정

```text
홈멀티 '기본' 은 실내기 종류별 3갈래 전개다 — 단일 값으로 접으면 안 된다
  index.ejs:8252-8267
  '기본'      실내기 종류마다 그 종류의 표준 리모컨
  '유선'·'컬러유선'  전량 한 모델
  ⟹ 의미의 층이 다르다

주문서웹 창고 결정은 유지 대상이다 (#1229 머지분 · 2026-08-17 개발책임자)
  "주문서는 창고결정이 들어가는게 맞고"
```

**Why:** 옵션 값은 업무 데이터지 화면 상수가 아니다. 세트마다 어떤 판넬·리모컨이 들어가는지는 구성품이 정하고, 화면은 그것을 보여주기만 한다. 화면이 목록을 갖는 순간 화면 수만큼 정본이 생긴다.

**How to apply:** 옵션 셀렉트를 만들거나 고칠 때 **목록의 출처가 어디인지 먼저 확인**하라. 코드 안 배열이면 그것이 결함이다. 관련 [[feedback_option_naming_unified_to_db_axis]] · [[feedback_daily_closing_uses_estimate_items]] · [[feedback_business_meaning_needs_confirmation_not_inference]]
