---
name: temp-multimodel-review-workflow
description: 2026-06-11 개발책임자 임시 워크플로우 — Opus 계획/PR → Codex(GPT5.5) 개발 → Opus 5-agent → Codex 5-agent → Fable5 5-agent → PM (각 라운드 리뷰+fix+게시)
metadata:
  type: feedback
---

2026-06-11 개발책임자 지시 (**임시** — "내가 말할 때까지"). 슬라이스 사이클 6단계:

1. **Claude Opus 4.8** — 계획 + PR 개설
2. **Codex (GPT 5.5)** — 개발 + 개발내역 리뷰 게시 *(토큰 회복 시 진행)*
3. **Claude Opus 5-agent TM** — 리뷰 + fix + 게시
4. **Codex 5-agent TM** — 리뷰 + fix + 게시 *(토큰 회복 시)*
5. **Claude Fable 5 5-agent TM** — 리뷰 + fix + 게시 (**2026-06-22까지만 가용** → 그 이후 본 라운드 자동 제외, "가능한 시일까지만")
6. **PM** — 검토 → 머지 또는 다음 사이클 진입 여부 + 게시

**Why:** 기존 dual(Claude+Codex) 사이클에 Fable5 3번째 독립 리뷰어 + 명시 PM 라운드를 추가해 다모델 cross-check 강화.

**How to apply:** 각 라운드는 review→fix→PR 코멘트 게시 의무(리뷰어 라운드는 fix 포함). Codex 라운드(2·4)는 토큰 회복(예: 2026-06-11 10:11) 후 진행, 그 전까지 다른 라운드 선행. Fable5 라운드(5)는 2026-06-22 deadline 경과 시 제외. 진행 중 슬라이스(#461)는 이미 1·2단계(Opus 계획/PR + 구현) 완료 상태라 3단계(Opus 리뷰)부터 진입. 다음 신규 슬라이스부터 1~6 전체 순서. 종료=개발책임자 stop. [[feedback_dual_5agent_review]] [[feedback_codex_model_auto_switch]] [[feedback_codex_implements_claude_reviews]] 연장.
