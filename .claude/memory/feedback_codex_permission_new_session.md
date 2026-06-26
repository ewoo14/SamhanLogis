---
name: feedback_codex_permission_new_session
description: Codex MCP 권한(mcp__codex__codex 등) allow 추가는 세션 시작 시 로드 → 추가한 세션엔 미적용, 새 세션부터 자동허용
metadata:
  type: feedback
---

`settings.local.json` 의 `permissions.allow` 변경(예: `mcp__codex__codex`, `mcp__codex__codex-reply`)은 **세션 시작 시점에 로드**되므로, 진행 중 세션에 추가해도 그 세션에서는 Codex MCP 호출마다 권한 프롬프트가 계속 뜬다.

**Why:** Claude Code 는 세션 시작 시 settings 권한 상태를 고정한다. 진행 중 파일 편집은 hook watcher 가 일부 반영하나 permission allow-list 는 새 세션이 필요. (settings.local.json 에 entry 가 이미 있어도, 그 entry 추가 이전에 시작된 세션이면 미적용.)

**How to apply:** Codex 자동허용이 필요하면 ① `settings.local.json` 의 `permissions.allow` 에 `mcp__codex__codex` + `mcp__codex__codex-reply` 추가 ② **새 세션 시작**. 진행 중 세션에서 Codex 프롬프트가 반복되면 무리하게 재시도(사용자 중단 유발)하지 말고, 권한 추가 후 핸드오프로 새 세션 인계. 2026-06-26 슬12a 작업 중 개발책임자 지적("권한 추가했다고 했는데 새로운 세션에서 시작되어야 함"). 관련 [[feedback_codex_mcp_session_limit]] · [[feedback_codex_sandbox_git]].
