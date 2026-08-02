---
name: project-codex-usage-limit-2026-08-05
description: Codex 계정 사용 한도 — 2026-07-30 발생 · 2026-07-31 회복 확인. usage limit 과 capacity 는 다른 현상이라는 구분이 요지
metadata:
  type: project
---

**해소됨 — 2026-07-31 회복 확인** (개발책임자 통보 + 작은 프롬프트 1회로 실측: `GPT-5 정상`). 아래는 남겨 둘 구분 지식입니다.

**2026-07-30 (집PC 세션) 실측** — `mcp__codex__codex` 호출이 모델 무관으로 즉시 거절됐습니다.

```text
You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage
to purchase more credits or try again at Aug 5th, 2026 2:52 PM.
```

- `gpt-5.6-luna`(구현·라운드 fix) · `gpt-5.6-sol`(2차 적대검증) **둘 다** 같은 에러 — **계정 레벨 한도**이지 모델 용량 문제가 아닙니다.
- 🔑 **`Selected model is at capacity` 와 다릅니다** — capacity 는 재시도/폴백(terra)으로 우회되지만([[feedback_model_substitution_delegated_to_pm]]), usage limit 은 **모델을 바꿔도 동일**합니다. 두 모델로 각 1회 확인했습니다.
- 🔑 **예고된 리셋 시각(08-05)보다 일찍 풀릴 수 있습니다** — 실제로 07-31 에 회복됐습니다. 리셋 시각을 근거로 며칠치 계획을 세우지 말고, **세션마다 다시 확인**하십시오.

**Why:** Codex 는 PM 세션 토큰과 별개 풀이라는 전제로 위임 대상입니다([[feedback_pm_delegate_to_codex_conserve_tokens]]). 그 전제가 사라지면 브리핑을 다 작성한 뒤 거절당하므로, 트랙을 띄우기 전에 확인해야 합니다.

**How to apply:**
- 세션 시작 시 Codex 트랙을 계획하기 전에 **한도부터 확인** — 작은 프롬프트 1회로 즉시 판별됩니다. 거절 문구가 `usage limit` 인지 `at capacity` 인지로 두 현상을 가르십시오.
- 한도 상태에서 남아 있는 캐논 경로 = **OPUS 기획 · OPUS 5-agents 적대리뷰 · SONNET5 라운드 fix · PM 라이브QA/종합/머지**. SONNET5 fix 는 캐논의 정식 역할이므로 클로드 대체가 아닙니다.
- 결손된 **2차 검증(SOL) 은 PR 에 명시 기록**할 것 — 안 돌린 스테이지를 "결함 0" 으로 세면 [[feedback_unverified_scope_is_not_zero_defects]] 그대로 재현됩니다.
- 크레딧 충전은 **개발책임자 결제** 사항 — PM 이 대신 결정할 수 없습니다.
