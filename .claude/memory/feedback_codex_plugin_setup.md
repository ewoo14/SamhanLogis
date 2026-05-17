---
name: codex-plugin-setup
description: Codex CLI MCP 서버 사용 (mcp__codex__codex) — 2026-05-17 사용자 정정. Plugin (openai/codex-plugin-cc) 폐기. MCP 서버 통한 review/fix 모두 안정 동작.
metadata:
  type: feedback
---

# Codex CLI MCP 서버 사용 (2026-05-17 사용자 정정)

> **2026-05-17 사용자 명시**: "코덱스 플러그인 아니며 codex CLI로 MCP 서버를 활용". Plugin (`openai/codex-plugin-cc`) 폐기. **`mcp__codex__codex` MCP 도구 사용**.

## 핵심 규칙

| 구분 | 사용 도구 | 비고 |
|---|---|---|
| **Code review (read-only)** | `mcp__codex__codex` `sandbox: "read-only"` | review 5-agent (BE/FE/Designer/QA/DevOps) 병렬 호출 |
| **Code fix (write)** | `mcp__codex__codex` `sandbox: "workspace-write"` | 통합 fix commit |
| **Adversarial / 위험 작업** | `mcp__codex__codex` `sandbox: "danger-full-access"` | 신중 사용 |
| **Continue session** | `mcp__codex__codex-reply` `threadId` | 동일 thread 이어가기 |

## MCP 호출 표준 파라미터

```yaml
mcp__codex__codex:
  prompt: "<role-specific review/fix prompt>"
  sandbox: "read-only"             # review
  approval-policy: "never"         # interactive 차단
  model: "gpt-5.5-codex"           # 또는 "gpt-5.2-codex" 등
  cwd: "C:\\dev\\SamhanLogis"      # repo root
```

## MCP 서버 확인

```powershell
claude mcp list
# expected: codex: codex mcp-server - ✓ Connected
```

## review 5-agent dispatch 패턴

`feedback_dual_5agent_review.md` 와 정합:

1. **Claude 5 subagent 병렬** (single message multiple Agent tool calls — BE/FE/Designer/QA/DevOps)
2. **Codex 5-agent 병렬** (single message multiple `mcp__codex__codex` tool calls)
   - 각 호출은 본인 role (BE/FE/Designer/QA/DevOps) 명시 prompt
   - "위에 등록된 Claude `<same-role>-agent` 코멘트도 fetch 후 검토" 의무
   - 출력: PR comment markdown body 만

## fix dispatch 패턴

- review 결과 종합 후 1회 통합 prompt
- `sandbox: "workspace-write"` 로 파일 수정 + `git add` + `git commit` 까지
- `approval-policy: "never"` (interactive 금지)
- 또는 Claude 직접 fix (간단한 결함 1~2건 시)

## Plugin 폐기 이유 (2026-05-17 사용자 정정)

- Plugin write task 4건 연속 hang 입증 (SP-08-3-4, SP-08-4-1, SP-08-4-2)
- gpt-5.5 + medium 영구 변경 후에도 hang 재발
- Plugin read-only review 도 1 통합 prompt 만 가능 → 5-agent 병렬 불가 → cross-check 가시화 부족
- **MCP 서버**는 read-only/write 모두 안정 동작 + 5 병렬 호출 가능 → 사용자 정정

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `mcp__codex__codex` 도구 미인식 | MCP server 미연결 | `claude mcp list` 확인 → `codex` 미등록 시 `.mcp.json` 점검 |
| `apply_patch 실패` 0 files | `sandbox: "read-only"` 로 write 시도 | `sandbox: "workspace-write"` 로 변경 |
| MCP 호출 hang | interactive prompt 대기 | `approval-policy: "never"` 추가 |
| `unknown variant 'none'` | sandbox 값 오타 | `"read-only"` / `"workspace-write"` / `"danger-full-access"` 만 허용 |

## 관련 메모리

- [[powershell-utf8-writes]] — PowerShell cp949 트랩
- [[dual-5agent-review]] — Claude + Codex 양쪽 5-agent 리뷰 (MCP 호출)
- [[user-merge-authority]] — PM 자동 머지 (양쪽 0 결함 시)

## Plugin 잔재 정리 (필요 시)

```powershell
# Plugin 제거 (선택)
# Claude Code 세션 내:
# /plugin uninstall codex@openai-codex
# /plugin marketplace remove openai/codex-plugin-cc

# ~/.codex/config.toml 의 [windows] sandbox 는 codex CLI 직접 호출 시에만 영향 — MCP 서버는 별도 sandbox 파라미터 사용
```
