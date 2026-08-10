---
name: feedback_option_naming_unified_to_db_axis
description: 견적 옵션 명칭은 화면마다 달라져 있었고 DB 속성축(remote_type·panel_type)을 정본으로 통일하기로 했으며 통일 전에는 수량동기화 condition_json 이 화면마다 갈라진다
metadata:
  type: feedback
---

# 🚨 견적 옵션 명칭은 **DB 속성축**으로 통일한다 (2026-08-10 개발책임자 결정)

## 개발책임자

> *"유선과 유선리모컨 이런 거 **명칭 통일**하기로 하지 않았나?"* → *"**옵션 명칭** 말한 거야."*
> *"**통일하고 같은 트랙 내 별도 슬라이스로** 부탁해."*

---

## 실측 — 같은 개념이 화면마다 다른 이름이었다 (2026-08-10)

### 리모컨

```text
홈멀티     '리모컨'      기본 · 유선 · 컬러 · 제외                   index.ejs:7804 (home_remote)
상업멀티   '리모컨'      제외 · 무선 · 유선 · 컬러유선               index.ejs:6638 (comm_remote)
싱글중대형 '유선리모컨'  '' · 유선리모컨 · 컬러유선리모컨            index.ejs:7846 (ss_remote)
                        + 별도 체크박스 '리모컨 제외'                index.ejs:7847 (ss_remote_ex)
```

같은 것이 **`컬러` · `컬러유선` · `컬러유선리모컨`** 세 이름을 갖고 있고,
홈의 `기본` 은 상업의 `무선` 과 같은 뜻이며, 싱글만 **제외가 셀렉트가 아니라 체크박스**다.

### 판넬

```text
홈멀티     '' · 판넬제외 · 공청판넬 · 인피니트 25년형 · 인피니트 공청+동작감지 AI
상업멀티   판넬제외 · 기본판넬 · 블랙판넬 · 승강판넬 · 공청판넬 · 동작감지
싱글중대형 '' · 판넬제외 · 블랙판넬 · 승강판넬 · 공청판넬
```

홈은 **빈 문자열이 기본**이고 상업은 `기본판넬` 이 명시돼 있다.

---

## 🔑 정본은 이미 DB 에 있다

`#504`(F1.5)가 만든 속성 컬럼이 정본 축이다 (`ProductAttributeClassifier`).

```text
products.remote_type   유선 · 컬러유선 · 무선 · null    (실측 분포: 무선 14 · 유선 3)
products.panel_type    일반 · 공청 · 블랙 · 승강 · 360  (실측: 28 · 16 · 6 · 6 · 5)
```

⟹ **상업 화면만 이미 정본을 따르고 있었다.**

## 통일 규칙

```text
리모컨   값 = 무선 · 유선 · 컬러유선 · 제외        라벨 = '리모컨' (세 화면 공통)
  싱글     유선리모컨 → 유선 · 컬러유선리모컨 → 컬러유선
           '리모컨 제외' 체크박스 → 셀렉트의 '제외' 로 흡수
  홈멀티   컬러 → 컬러유선
  🚨 홈멀티 '기본' 은 **무선이 아니다** (2026-08-10 정찰 정정)

판넬     값 = 판넬제외 · 기본 · 블랙 · 승강 · 공청 · …   (panel_type 축)
  '기본판넬' 과 '' → 기본 · '블랙판넬' → 블랙 (이하 동일)
  🚨 인피니트 25년형 · 인피니트 공청+동작감지 AI · 상업 동작감지는
     현재 panel_type 값과 **직접 대응하지 않는다** — 축을 늘릴지 별도 결정 필요
```

---

## 🚨 홈멀티 `기본` 은 단일 값이 아니라 **실내기 종류별 3갈래 분기**다

정찰 전에는 *"기본 → 무선"* 으로 적었는데 **틀렸다** (`index.ejs:8252-8267` 원문).

```js
if (opt === '기본') {
  if (REMOTE_360_DEFAULT) setR(REMOTE_360_DEFAULT, cntC);   // 360 카세트
  if (R_CH)               setR(R_CH,  cntI);                // AR-CH01
  if (REMOTE_WIRELESS)    setR(REMOTE_WIRELESS, cntW + cntWall);  // 벽걸이 + 그 외
} else {
  const main = (opt === '유선') ? R_WE : R_WG;              // 전량 한 모델
  setR(main, tot); if (REMOTE_WIRED_KIT) setR(REMOTE_WIRED_KIT, tot);
}
```

🔑 **`기본` 은 "실내기마다 그 종류의 표준 리모컨" 이라는 뜻**이고,
   `유선`·`컬러유선` 은 "전량 한 모델" 이다. 의미의 층이 다르다.

⟹ 명칭만 바꿔 `기본`→`무선` 으로 접으면 **360 카세트와 1way 의 리모컨이 사라진다.**
   통일은 `기본` 을 **값으로 유지**하고, 그것이 무엇으로 전개되는지를
   수량동기화 규칙(실내기 종류별 source 칩)으로 표현하는 방향이어야 한다.

## 실 저장 데이터 — 이미 옵션 문자열이 DB 에 들어와 있다

```text
slip_lines 옵션 JSON 20건 중 '블랙판넬' 4건 (2026-08-10 17:17:43 KST 실측)
⟹ condition_json 이 0행이라 소급이 없다는 판단은 **옵션 문자열에는 해당하지 않는다**
   통일 시 기존 전표 행의 문자열 처리를 함께 정해야 한다
```

싱글의 `유선 선택 + 제외 체크` 조합은 현행 유효 동작상 **`제외` 가 우선**이고,
DB 에서 그 조합은 발견되지 않았다.

---

## 🚨 왜 지금 해야 하는가 — 수량 동기화가 여기에 걸린다

`quantity_sync_rule.condition_json` 이 결국 이 옵션 값을 담는다.
**화면마다 문자열이 다르면 규칙도 화면마다 갈라진다.**

```text
통일 전  AIM-A01N(유선리모컨 키트) 규칙을 **둘**로 나눠야 한다
         홈    condition #home_remote ∈ {유선, 컬러}
         싱글  condition #ss_remote ∈ {유선리모컨, 컬러유선리모컨} ∧ #ss_remote_ex=false
통일 후  하나로 쓸 수 있다
```

📌 **순서** — `#1126` 머지 → **옵션 명칭 통일** → 옵션 평가기 → 초기값 세팅.
   평가기보다 **먼저** 통일해야 두 번 고치지 않는다.

## 함께 손대야 하는 곳

```text
화면 3곳 (estimate-app · order-app · 데스크톱)
저장된 기본값  estimate_configs (dc_config_db) · SINGLE_DEFAULTS · HOME_DEFAULTS
시트 동기화    ProductSheetSyncService (옵션 문자열을 읽는다면)
condition_json 스펙과 기존 규칙 (현재 0행이라 소급 비용 없음 — 지금이 가장 싸다)
```

관련: [[feedback_qty_sync_body_to_accessory_chips]] · [[feedback_dc_terminology]] · [[feedback_role_naming_full]]
