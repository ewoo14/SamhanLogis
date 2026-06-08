---
name: cycle-pm-judgment-gate
description: 매 리뷰 사이클 종료마다 PM 판단+리뷰 게시 후 다음 사이클 진입 또는 머지 결정 (명시 게이트)
metadata:
  type: feedback
---

2026-06-08 개발책임자 지시: **매 사이클 종료 때마다 ① Claude TM·Codex TM 리뷰 각각 게시 + ② PM 판단(종합) 명시 게시 → ③ "다음 사이클 진입" 또는 "머지" 를 명시 결정** 후 진행.

## 정식 6단계 시퀀스 (2026-06-08 개발책임자 재지시 — 슬라이스당 적용)
1. **Claude 기획 + PR 개설** (Claude 가 spec/plan 후 **PR 을 먼저 연다** — open-pr-early).
2. **Codex 개발 + 개발상세내역 PR 게시** (Codex 구현 후 PR 에 개발 상세내역 코멘트 게시).
3. **Claude 5-agent TM 통합리뷰 + fix** (PR 에 리뷰 게시 + fix).
4. **Codex 5-agent TM 통합리뷰 + fix** (PR 에 리뷰 게시 + fix).
5. **PM 판단 + 리뷰 게시** (PM 종합 코멘트, CI green 후 머지 판단).
6. **사이클 2 진입 또는 머지** 명시 결정.
> [[dual-5agent-review]] 의 캐논 시퀀스를 이 6단계로 고정. [[open-pr-early]](1단계) + [[cycle-n2-mandatory]](사이클 N) + [[codex-implements-claude-reviews]](2단계 Codex 개발) 준수.

**Why**: 사이클 경계마다 PM 의 종합 판단을 가시화하고, 다음 사이클 vs 머지 결정을 명시적으로 남겨 진행 투명성 확보. [[review-posting-and-zero-skip]] + [[dual-5agent-review]]([[cycle-n2-mandatory]]) 의 사이클 경계 게이트화.

**How to apply**:
- 각 dual-review 사이클(N=1, N=2, ...) 종료 시 PR 에 Claude TM 리뷰 + Codex TM 리뷰 게시(각각), 이어 **PM 종합 판단 코멘트** 게시.
- PM 종합에 "사이클 N 결과 = 잔여 P1/P2 N건 → 다음 사이클 진입" 또는 "잔여 0 + CI green + 실 QA → 머지" 를 명시.
- CI green 전 머지용 PM 최종 리뷰 금지([[dual-5agent-review]] 함정)는 유지 — 머지 결정 PM 종합은 CI 완료 후.
- 사이클 N=3 안 수렴 의무, 4+ 진입 금지([[cycle-n2-mandatory]]).
