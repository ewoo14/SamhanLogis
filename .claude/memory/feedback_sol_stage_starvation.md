---
name: feedback_sol_stage_starvation
description: 🚨 라운드는 OPUS→SOL 교대다. OPUS→fix→OPUS→fix 로 돌면 SOL 스테이지가 영영 안 온다 — 2세션 연속 재발(집PC 6머지 전건 + 07-28 5트랙 전건 0회). "다음 라운드" 의 기본값은 SOL 이다
metadata:
  type: feedback
---

# 🚨 **라운드의 기본값은 SOL 이다** — OPUS 를 연속으로 돌리면 2차 스테이지가 굶는다

[[feedback_canonical_workflow]] 5단계는 *"**3~4** 를 도달가능 0 까지 반복"* 이고 **3 = OPUS 라운드**, **4 = CODEX SOL 라운드**다. 두 스테이지는 **교대**한다.

그런데 실제 진행은 두 세션 연속으로 이렇게 흘렀다:

```
OPUS 라운드 → SONNET5 fix → OPUS 라운드 → SONNET5 fix → OPUS 라운드 → …
                                                          (SOL 스테이지 0회)
```

| 시점 | 실측 |
|---|---|
| 집PC 자기감사 | 머지된 **6건 전부** 마지막 fix 이후 SOL 재검증 없음 · 3건은 SOL 이 돌았으면 머지가 막혔을 것 |
| 2026-07-28 회사PC | 5트랙(**#957·#958·#967·#968·#969**) **전부 SOL 0회**. 트랙당 OPUS 라운드는 1~5회 |

## 왜 자연스럽게 굶는가

fix 를 커밋하면 **"방금 고친 게 맞나"** 를 확인하고 싶어진다. 그 충동의 기본 답이 *"내가(OPUS) 다시 본다"* 라서, [[feedback_reconvergence_before_merge]] 의 **재수렴 의무를 SOL 이 아닌 OPUS 로 이행**하게 된다. 재수렴은 실제로 이뤄지므로 **결손이 보이지 않는다** — 라운드 기록은 꽉 차 있고 c 도 떨어진다. 그래서 자기감사를 돌리기 전에는 아무도 못 잡는다.

🔑 **fix 후 재수렴은 SOL 이 해도 된다.** 오히려 그게 정본이다 — **이종 모델이 하는 재수렴이 동종 재수렴보다 강하다.** OPUS 가 자기 fix 지시의 결과를 자기가 검사하는 구조는 각도가 좁다.

## 규칙

- **fix 를 커밋한 직후 "다음은 무엇인가" 의 기본 답은 SOL 라운드다.** OPUS 라운드를 한 번 더 돌리려면 *왜 SOL 이 아닌가* 를 명시적으로 답해야 한다.
- 트랙 상태를 볼 때 **`SOL 실행 횟수`를 항상 함께 센다.** 라운드 번호(R1·R2…)만 세면 전부 OPUS 여도 진행돼 보인다.
- **머지 직전이 아니라 진행 중에 확인한다.** 머지게이트에서 발견하면 이미 여러 라운드를 낭비한 뒤다.
- SOL 라운드는 **CI green 을 기다릴 필요가 없다** — CI 는 머지게이트지 라운드 게이트가 아니다. 단, CI RED 의 원인이 그 PR 자신의 fix 라면 먼저 해소하는 편이 SOL 의 시간을 아낀다.

## 관련

[[feedback_canonical_workflow]] 5단계·머지게이트 ④ · [[feedback_reconvergence_before_merge]](재수렴 주체를 명시) · [[feedback_unverified_scope_is_not_zero_defects]](라운드가 안 본 것을 묻는 습관) · [[feedback_throughput_parallel_scope_freeze_batch]](🚫2검증스테이지는 불변 — 처리량 레버로도 못 줄인다)
