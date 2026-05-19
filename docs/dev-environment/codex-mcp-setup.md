# Codex CLI MCP 서버 설정 가이드 (회사 PC 1회 셋업)

> 작성일: 2026-05-19
> 대상: 회사 PC (이미 자택 PC 에서 작동 중인 설정을 회사 PC 에 동일 적용)
> 참조: [.claude/memory/feedback_codex_plugin_setup.md](../../.claude/memory/feedback_codex_plugin_setup.md) (2026-05-17 사용자 정정 — Plugin 폐기, MCP 사용)

---

## 1. 본 repo 의 Codex 사용 패턴

본 SamhanLogis repo 의 Codex 호출 표준은 **`mcp__codex__codex` MCP 도구**. Plugin 방식 (`openai/codex-plugin-cc`) 은 hang 이슈로 2026-05-17 폐기. 모든 5-agent review / fix 사이클은 Claude Code 의 `Skill` 또는 직접 호출이 아닌, MCP 서버로 위임된 Codex CLI 가 처리.

### 사용 예시

| 작업 | 도구 | sandbox | 비고 |
|---|---|---|---|
| 5-agent code review (read-only) | `mcp__codex__codex` | `read-only` | BE/FE/Designer/QA/DevOps 5 병렬 |
| 통합 fix commit | `mcp__codex__codex` | `workspace-write` | 단일 fix prompt |
| Continue session | `mcp__codex__codex-reply` | (이전 thread 상속) | threadId 명시 |

---

## 2. 사전 준비

### 2-1. Node.js 18+ (또는 Codex CLI 가 요구하는 최신)

```powershell
node --version    # v18 이상 필요
# 미설치 시: https://nodejs.org/ 에서 LTS 다운로드 또는 winget install OpenJS.NodeJS.LTS
```

### 2-2. OpenAI 계정 + API key 또는 ChatGPT Plus 이상

- 자택 PC 에서 사용하던 OpenAI 계정 그대로 사용
- API key 발급: https://platform.openai.com/api-keys
- 또는 ChatGPT Plus/Pro 로그인 (Codex CLI 가 sign-in 흐름 지원)

---

## 3. Codex CLI 설치

```powershell
npm install -g @openai/codex
# 또는 OpenAI 공식 가이드 (https://github.com/openai/codex) 에 따라 brew/curl 설치
codex --version
```

### 첫 인증 (필수)

```powershell
codex
# → 첫 실행 시 brows ser 로그인 또는 API key 입력 안내
# ChatGPT 로그인 권장 (rate limit 우대)
```

`~/.codex/auth.json` 에 token 저장됨. 이후 자동 사용.

---

## 4. Claude Code MCP 서버 등록

`~/.claude.json` 또는 repo `.mcp.json` (project-scoped) 에 Codex MCP 서버 추가.

### 4-1. project-scoped (.mcp.json — 본 repo 에 commit 가능)

```json
{
  "mcpServers": {
    "codex": {
      "command": "codex",
      "args": ["mcp-server"],
      "env": {}
    }
  }
}
```

### 4-2. user-scoped (~/.claude/settings.json)

```json
{
  "mcpServers": {
    "codex": {
      "command": "codex",
      "args": ["mcp-server"]
    }
  }
}
```

> **권장**: project-scoped (.mcp.json) — repo 와 함께 sync 되어 양 PC 일관. 단 사용자 권한 (`enableAllProjectMcpServers` 또는 settings 확인 의무) 필요. 본 repo 의 다른 MCP 서버 (`notion`, `gdrive` 등) 와 동일 패턴.

---

## 5. 연결 확인

```powershell
claude mcp list
# 기대 출력:
# codex: codex mcp-server - ✓ Connected
```

`✗ Failed to connect` 인 경우:
- `codex` 명령이 PATH 에 있는지 확인 (`Get-Command codex`)
- `codex mcp-server` 직접 실행 → stdio 모드로 살아 있어야 함 (Ctrl+C 로 종료)
- Claude Code 재시작

---

## 6. ~/.codex/config.toml 권장 설정 (선택)

```toml
[default]
model = "gpt-5.5-codex"
approval_policy = "never"

[windows]
sandbox = "workspace-write"  # codex CLI 직접 호출 시 적용. MCP 서버는 호출별 sandbox 별도 지정
```

---

## 7. 5-agent review dispatch — Claude Code 에서 호출 예시

본 repo 의 표준 5-agent 패턴 (Claude review → Claude fix → Codex review → Codex fix, 1 cycle):

### Codex review 단계 (read-only)

```yaml
# Single message — 5 parallel mcp__codex__codex calls
mcp__codex__codex (BE reviewer):
  prompt: "PR #262 의 BE 영역 review — services/partner-service 의 EcountPartnerImporter ..."
  sandbox: "read-only"
  approval-policy: "never"
  model: "gpt-5.5-codex"
  cwd: "C:\\dev\\SamhanLogis"

mcp__codex__codex (FE reviewer):
  prompt: "PR #262 의 FE 영역 review — UI 변경 없음 확인"
  sandbox: "read-only"
  ...

mcp__codex__codex (Designer reviewer):  ...
mcp__codex__codex (QA reviewer):       ...
mcp__codex__codex (DevOps reviewer):   ...
```

5 호출 모두 PR comment 마크다운 body 만 출력. 호출자가 종합 후 PR comment post.

### Codex fix 단계 (workspace-write)

```yaml
mcp__codex__codex:
  prompt: "PR #262 의 5-agent review 결과를 종합하여 fix commit ..."
  sandbox: "workspace-write"
  approval-policy: "never"
  cwd: "C:\\dev\\SamhanLogis"
```

---

## 8. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `mcp__codex__codex` 도구 미인식 | MCP server 미연결 | `claude mcp list` → `.mcp.json` 또는 settings.json 점검 |
| `apply_patch 실패: 0 files` | `sandbox: "read-only"` 로 write 시도 | `sandbox: "workspace-write"` 로 변경 |
| MCP 호출 hang | interactive prompt 대기 | `approval-policy: "never"` 명시 |
| `unknown variant 'none'` | sandbox 값 오타 | `"read-only"` / `"workspace-write"` / `"danger-full-access"` 만 허용 |
| 한글 깨짐 (cp949) | PowerShell 콘솔 인코딩 | `chcp 65001` 또는 PowerShell 7 (Windows Terminal) 사용 |

---

## 9. 양 PC 일관성

- `.mcp.json` 은 repo 에 git tracked → 양 PC 자동 동기화
- `~/.codex/auth.json` 은 PC 별 1회 로그인 필요
- `~/.codex/config.toml` 은 PC 별 별도 — 자택 PC 의 설정을 회사 PC 에 복사 권장

---

## 10. 관련 메모리

- [feedback_codex_plugin_setup.md](../../.claude/memory/feedback_codex_plugin_setup.md) — Plugin 폐기 이유 + MCP 사용 패턴
- [feedback_dual_5agent_review.md](../../.claude/memory/feedback_dual_5agent_review.md) — Claude review → Claude fix → Codex review → Codex fix 사이클
- [feedback_multi_agent_team_pattern.md](../../.claude/memory/feedback_multi_agent_team_pattern.md) — 5-team agent 패턴
