---
name: codex-exec-stdin-hang
description: codex exec 를 백그라운드(detached stdin)로 실행하면 시작 단계에서 무한 hang — </dev/null 리다이렉트 필수
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 08b51654-0341-4846-bc10-03bf78ad8103
---

2026-06-07 PR #417 사이클3 중 실측. `codex exec`(codex-cli 0.130.0)를 Claude Code Bash `run_in_background: true` 로 실행하면 세션 로그(`~/.codex/sessions/`)조차 생성하지 못하고 무한 hang (CPU ~0.1s, 42분 무활동 2회 재현). foreground 실행은 정상.

**Why:** detached stdin 에서 codex exec 가 stdin 대기 상태로 블록되는 것으로 추정.

**How to apply:** 백그라운드 codex exec 는 항상 `</dev/null` stdin 리다이렉트 부착: `codex exec ... "prompt" </dev/null 2>&1 | tail -N`. hang 감지법 = 디스패치 후 3분 내 `~/.codex/sessions/YYYY/MM/DD/` 에 신규 rollout-*.jsonl 미생성이면 hang — kill 후 재디스패치. [[codex-plugin-setup]] [[codex-mcp-session-limit]] 의 `codex exec` Bash 우회 경로 사용 시 적용.
