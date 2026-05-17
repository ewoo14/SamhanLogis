---
name: codex-plugin-setup
description: Codex plugin (openai/codex-plugin-cc) Windows 셋업 규칙 — sandbox unelevated 필수. setup-codex-plugin.ps1 idempotent script + ~/.codex/config.toml [windows] sandbox 트랩 해결
metadata:
  type: feedback
---

# Codex Plugin 셋업 (2026-05-17 신규)

> **2026-05-17 정정 (PR #216 + SP-08-4-2 회고)** — Plugin **write task 4건 연속 hang 입증** (사이클 3 SP-08-3-4, Phase 7 verification SP-08-4-1, 사이클 1.6 fix SP-08-4-1, Phase 2-3 SP-08-4-2). gpt-5.5 + medium 영구 변경 후에도 hang 재발. **Plugin 은 read-only review 만 사용** (사이클 4/5 SP-08-3-4 + 사이클 1/2/3 PR #216 review 모두 성공, 2~3분 정확). **Write 작업은 PowerShell + codex CLI 복귀** (사용자 `!` 호출 trade-off 인정).

`openai/codex-plugin-cc` 정식 plugin 설치 — **read-only review 만 사용**. write 는 PowerShell + codex CLI.

## 핵심 규칙

**Windows 환경에서 `~/.codex/config.toml` 의 `[windows] sandbox` 는 반드시 `"unelevated"` 로 설정.**

**Why:**
- 기본값 `"elevated"` 는 plugin task 호출 시 **`CreateProcessWithLogonW failed: 5`** UAC 권한 부족 → child process sandbox spawn 실패 → file 변경 0건
- 일반 user account (관리자 아님) + UAC elevation 없는 환경에서 다른 user account 로 process 실행 불가 — 이는 Windows API 한계
- `[projects.'c:\dev\samhanlogis'] sandbox_mode = "danger-full-access"` 만으로는 부족 (project trust 정책은 codex CLI 직접 호출에만 적용, plugin runtime 의 sandbox 강제 분기는 `codex-companion.mjs:488` 의 `request.write ? "workspace-write" : "read-only"` 가 우선)
- `"none"` 은 valid option 아님 (`elevated` 또는 `unelevated` 만 허용)

**How to apply:**
- 양 PC 첫 셋업 시 `.\scripts\setup-codex-plugin.ps1` 1회 실행 (idempotent — 이미 설정되어 있으면 skip)
- script 가 자동으로 `[windows] sandbox = "unelevated"` 보장 + SamhanLogis project trust 추가
- 셋업 후 `/codex:setup` 으로 검증 → `codex:rescue` subagent 위임 가능

## 셋업 절차 (양 PC 각 1회)

```powershell
# 1. codex CLI 설치
npm install -g @openai/codex

# 2. ChatGPT 로그인
codex login

# 3. config.toml 자동 셋업
.\scripts\setup-codex-plugin.ps1
```

Claude Code 세션 안에서:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

## Plugin 사용법 (PowerShell 우회 영구 폐기)

| 작업 | OLD (~2026-05-16) | NEW (2026-05-17 정정) |
|---|---|---|
| **자율 fix 위임 (write)** | PowerShell + codex CLI `--dangerously-bypass` | **PowerShell + codex CLI 복귀** (plugin write hang 4건 입증) |
| **Code review (read-only)** | 수동 호출 | **Plugin Agent tool `codex:codex-rescue` `--model gpt-5.5 --effort medium` short prompt** (성공 패턴) |
| Adversarial review (read-only) | N/A | `/codex:adversarial-review` (plugin) |
| 진행 상태 / 취소 | `Monitor` 도구 stream | `/codex:status` / `/codex:cancel` (plugin) |
| 한국어 prompt | `.tmp/*-prompt.txt` 영어 작성 (cp949 회피) | PowerShell 호출 시 동일 (영어 prompt 파일) |
| classifier 차단 | 매번 사용자 `!` 우회 호출 | 사용자 `!` 호출 (write 시) — 사용자 명시 trade-off 인정 |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `codex:rescue` 호출 시 "apply_patch 실패" 0 files | `[windows] sandbox = "elevated"` | `setup-codex-plugin.ps1` 재실행 |
| `/codex:setup` 가 `Codex unavailable` | codex CLI 미설치 | `npm install -g @openai/codex` |
| Auth `loggedIn: false` | ChatGPT 로그인 만료 | `! codex login` (Claude 세션 안) |
| `config.toml` `unknown variant 'none'` | sandbox = "none" 시도 | `"unelevated"` (또는 `"elevated"` 만 허용) |

## 관련 메모리

- [[powershell-utf8-writes]] — PowerShell cp949 트랩 (plugin 으로 회피)
- [[dual-5agent-review]] — Claude + Codex 5-agent 양쪽 리뷰 (plugin 으로 호출)
- [[pm-full-autonomy]] — PM 자율 머지 (plugin 으로 fix 위임 가능)

## 가이드

- [scripts/setup-codex-plugin.ps1](../../scripts/setup-codex-plugin.ps1) — idempotent 셋업
- [docs/dev-environment-setup-multi-pc.md §7](../../docs/dev-environment-setup-multi-pc.md) — 양 PC 셋업 가이드
