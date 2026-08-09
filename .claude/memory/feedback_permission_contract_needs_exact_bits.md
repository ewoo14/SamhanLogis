---
name: feedback_permission_contract_needs_exact_bits
description: 🚨 권한 계약 테스트는 "포함하는가" 가 아니라 "정확히 같은가" 로 · 특정 주체만 검사하면 나머지 축이 무방비 — 하루에 세 번 재발 (2026-08-09)
metadata:
  type: feedback
---

# 🚨 권한 계약 테스트의 구조적 공백 — 하루에 세 번

2026-08-09, 권한을 다루는 세 PR 에서 **같은 형태의 결함**이 각각 나왔다.

| PR | 증상 |
|---|---|
| `#1145` R6 | mock 이 `MANAGER 1111011` — 실 모델 `1111000` 보다 `download`·`print` **초과**. 계약 테스트가 못 잡음 |
| `#1130` | **DRIVER 에 권한을 임시 부여해도 161/161 통과** — false-green |
| `#978` R4 | `ROLE_INTERNAL → ROLE_BROKEN` 뮤테이션에도 18/18 통과 — authority 미단정 |

세 곳 다 **migration 자체는 정확했다.** 틀린 것은 **감시**였다.

## 두 가지 실패 방식

```
① "포함하는가" 로 검사한다        →  초과 부여를 못 잡는다
   toContain('x') · 부분 일치

② 특정 주체만 검사한다            →  나머지 축이 무방비다
   MANAGER 만 보고 DRIVER·PARTNER 는 안 봄
```

`#1145` R7 이 닫은 형태가 정본이다.

```
7비트 exact 검증
  can_view / can_create / can_update / can_delete /
  can_restore / can_download / can_print
"포함하는가" 가 아니라 "같은가" 로, **모든 역할**에 대해
```

## 🚨 mock 은 양쪽으로 틀릴 수 있다

`#1145` R7 에서 **초과와 누락이 동시에** 나왔다 — `download`·`print` 초과 + `inbound.manage` 누락.
```
mock 이 넓으면  실제로는 막히는 경로를 통과로 오인한다
mock 이 좁으면  Playwright 가 깨진다 (#1145 R4 에서 실측)
```
⟹ **정확히 같아야 한다.** 한 방향만 검사하면 반대가 샌다.

## How to apply

권한을 부여·이관·회수하는 PR 의 fix 브리핑에 항상 넣는다.

- **7비트 exact 대조표**를 산출물로 요구한다 — `mock 비트 ↔ 실 DB 비트`, 손댄 항목 **전수**
- 🚨 **뮤테이션 두 방향을 증명**하게 한다
  - 권한 없는 역할에 일시 부여 → 테스트가 **실패**해야 한다
  - mock 에 초과 비트를 일시로 넣음 → 테스트가 **실패**해야 한다
  - 각각 RED 원문 + `git status` 복구 증명
- 감시 축을 **특정 역할로 좁히지 말 것**. 한두 역할만 보면 나머지가 무방비다
- migration 이 PASS 여도 **감시가 없으면 다음 라운드가 조용히 넓힌다**

**Why:** 권한은 넓히기 쉽고 되돌리기 어렵다. 그리고 이 결함은 **migration 을 아무리 정확히 써도** 잡히지 않는다 — 감시가 별개 층이기 때문이다. 세 PR 에서 각각 독립적으로 재발한 것이 그 증거다.

관련: [[feedback_pm_verifies_round_and_directs_next_fix]] · [[feedback_mock_gate_leaks_to_real_api]] · [[feedback_test_adapted_to_new_behavior_hides_regression]] · [[feedback_bidirectional_red_for_fix]]
