---
name: feedback_pm_no_direct_implementation
description: "PM 직접 구현 금지 — 구현은 Codex, PM은 기획·리뷰·commit 대행만"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b6595c58-1401-4b50-805f-e460138d686c
---

2026-07-02 개발책임자 지시. **PM(Claude) 직접 구현 금지.** 구현(소스 작성)은 **Codex**가 담당. PM 은 기획·spec·plan·리뷰(Opus 5-agent)·commit 대행·PM 종합·머지만.

🚨 **스코프 한정(2026-07-02 개발책임자 재확인 — 반대방향 위반 후 정정)**: 본 금지는 **2단계 "초기 구현"(신규 기능 소스 작성)** 에만 적용된다. **리뷰 라운드 fix 에는 적용 안 됨** — **Opus 라운드에서 Opus 5-agent 가 발견한 결함은 Opus(=PM/Claude)가 직접 Edit 로 fix 하는 것이 원칙**(Codex 위임 금지), Codex 라운드 fix = Codex. 이는 [[feedback_canonical_workflow]] PREFLIGHT #4 와 동일. 개발책임자 원문: "OPUS가 발견한 결함은 직접 fix가 원칙." → 초기구현을 PM 직접구현으로 우회 = 위반 / Opus 라운드 fix 를 Codex 에 위임 = **반대방향 위반**(둘 다 금지).

**Why**: 표준 워크플로우([[feedback_canonical_workflow]])가 "Opus 기획+PR → Codex 개발 → 듀얼리뷰"인데, infra 제약(분류기/Codex MCP 오류) 시 PM 직접 구현으로 우회하려 하자 개발책임자가 명시 금지. Codex 구현이 듀얼리뷰 cross-check 의 전제(PM 이 구현하면 리뷰 독립성 훼손).

**How to apply**: 구현 착수 시 항상 Codex 디스패치(`mcp__codex__codex` danger-full-access 또는 codex exec). Codex 불가(MCP 세션한계/config 손상) 시 새 세션·codex exec Bash 우회·회복 대기 — PM 직접 구현으로 대체 금지. Codex=파일만 수정, Claude commit 대행([[feedback_codex_sandbox_git]]). [[feedback_canonical_workflow]]
