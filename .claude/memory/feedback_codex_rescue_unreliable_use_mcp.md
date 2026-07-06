---
name: feedback_codex_rescue_unreliable_use_mcp
description: codex-rescue 서브에이전트는 이 환경서 구조화 리뷰에 unreliable(bg태스크化·샌드박스 차단) — Codex 5-agent 재수렴은 mcp__codex__codex 직접 호출로 genuine 확보
metadata:
  type: feedback
---

2026-07-06 #31·#752 리뷰 회고. Codex 5-agent 리뷰/재수렴을 `codex:codex-rescue` 서브에이전트로 돌리면 이 환경(집PC)에서 반복적으로:
- (a) `"Codex Task started in the background as task-XXX"` 만 남기고 **findings 미전달**(BE·QA 다수),
- (b) 샌드박스가 `gradlew`/`gh`/`npm`/`node` 를 `rejected: blocked by policy` 로 차단 → DevOps/QA 실질 검증 불가("N/A").

**Why:** codex-rescue 는 공유 런타임에 background 태스크를 spawn 하는 구조라 동기 findings 반환이 불안정하고, 샌드박스 정책이 빌드/네트워크 명령을 막아 "실행=검증"([[feedback_emit_real_tool_calls]])이 성립 안 됨. 결과적으로 캐논의 "Codex 도 매 라운드 5-agent"([[feedback_review_5agent_no_shortcut_strict]])가 기계적으로 미달 → 워크플로 위반.

**How to apply:** Codex 5-agent 라운드/재수렴은 **`mcp__codex__codex` 직접 호출**(차원별, sandbox `danger-full-access`, `approval-policy never`, git 금지, effort high — [[feedback_codex_plugin_setup]] [[feedback_codex_sandbox_git]])로 실행해 신뢰 가능한 동기 findings 확보. codex-rescue 는 보조로만. **미전달 라운드를 "Opus 5-dim+테스트 substance 로 커버됐다"로 무마 금지 — 미전달=미실행=위반**([[feedback_live_qa_every_round_screenshots]] 동일 원리), 정직 표기 후 mcp 로 실제 재수행. [[feedback_codex_mcp_session_limit]]
