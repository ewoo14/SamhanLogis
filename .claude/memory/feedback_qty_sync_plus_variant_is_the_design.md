---
name: feedback_qty_sync_plus_variant_is_the_design
description: "🚨🚨 원래 설계 의도 — 바뀌어야 할 부자재를 전부 수량동기화에 걸고 그 부자재에 '기본' 포함 옵션을 걸면 화면에서 설정된다 (2026-08-17 개발책임자)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T05:57:47.108Z
---

# 🚨🚨 설계 의도 = **수량동기화 + 부자재별 옵션**

> 2026-08-17 개발책임자: *"변경되어야하는 **부자재들 모두 수량 동기화에 걸고** 해당 부자재들에 **기본을 포함해 옵션들을 걸어놓으면** 설정할 수 있는거지"* · *"**이게 내 원래 설계 의도야**"*

## 세 조각이 맞물린다

```text
① 본체가 바뀌면 따라 바뀌어야 하는 부자재를 전부 수량동기화에 건다
     실내기·실외기 수량이 바뀌면 판넬·리모컨·자재·호스 등이 따라온다
     방향은 본체 → 부자재 (2026-08-10 확정)

② 각 부자재에 옵션을 건다 — '기본' 을 포함해서
     bundle_component.component_variant
     🚨 '기본' 은 기본값이 아니라 목록의 한 항목이다

③ 화면은 그 목록을 보여주고, 고른 값이 수량동기화 조건이 된다
     condition_json 이 그 옵션 값을 담는다
```

## 2026-08-17 기준 진척

```text
② 옵션        ✅ 채워져 있다
     REMOTE 315/315 (기본 188 · 컬러 65 · 유선 62)
     PANEL  250/250 (기본 68 · 공청 68 · 블랙 57 · 승강 57)
     MATERIAL 273/273 · INDOOR 271/271 · OUTDOOR 408 중 272 · ACCESSORY 81 중 67

③ 화면        ✅ PR #1260 이 연결
     화면 하드코딩 8곳 제거 → component_variant 에서 읽는다
     실측 옵션 수 홈 6/5 · 상업 6/7/360 2 · 싱글 3/5/360 2 · 인피니트 판넬 5

① 수량동기화   🚩 비어 있다
     quantity_sync_rule 활성 1건 · condition_json = {}
     ⟹ 다음 트랙 (개발책임자 확정: #1260 머지 후 바로 착수)
```

## 왜 ① 이 미뤄져 있었나

옵션 명칭이 화면마다 달라서 **같은 규칙을 화면 수만큼 나눠 써야 했다.**

```text
통일 전   AIM-A01N(유선리모컨 키트) 규칙을 둘로
            홈    #home_remote ∈ {유선, 컬러}
            싱글  #ss_remote ∈ {유선리모컨, 컬러유선리모컨} ∧ #ss_remote_ex=false
통일 후   하나로 쓸 수 있다
```

기록된 순서: `#1126` 머지 → **옵션 명칭 통일** → 옵션 평가기 → 초기값 세팅.
`#1260` 이 통일 단계이고, 그 다음이 ① 이다.

## 편집 표면 (2026-08-17 실측)

```text
기초품목  ProductFormPage.tsx:988    <Select label="특징" …>  세트 구성품 행마다
견적품목  EstimateItemsCatalogPage.tsx:957  <Select label="특징" …>  수량동기화 대상 품목
          같은 파일 :74-79  규칙 CRUD (create/delete/list/replace)
```

⟹ 판넬만이 아니라 **리모컨·자재·실내기·실외기 전부** 두 화면에서 설정 가능하다.

**Why:** 부자재는 본체에 종속돼 수량이 정해지고, 어떤 부자재가 들어갈지는 옵션이 정한다. 두 축을 데이터로 두면 화면은 보여주기만 하면 되고, 새 세트가 생겨도 코드를 안 고친다.

**How to apply:** 수량동기화 규칙을 채울 때 **부자재 전수**를 대상으로 삼아라. 일부만 걸면 나머지는 본체가 바뀌어도 따라오지 않는다. 관련 [[feedback_options_come_from_component_settings]] · [[feedback_qty_sync_body_to_accessory_chips]] · [[feedback_option_naming_unified_to_db_axis]]
