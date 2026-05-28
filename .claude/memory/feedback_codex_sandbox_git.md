# Codex MCP 디스패치 — 커밋은 Claude 대행 + approval-policy never

`mcp__codex__codex` 를 `sandbox: "workspace-write"` 로 호출하면 Codex 가 코드는 정상 수정하지만 **`.git/objects` 쓰기가 막혀 `git add`/commit 이 실패**한다 (`insufficient permission for adding an object to repository database .git/objects`). `approval-policy` 가 `on-failure`/`untrusted` 이면 이 실패 시 Codex 가 **"MCP server codex requests your input" 승인 팝업**을 띄운다 (사용자가 싫어함).

**Why:** workspace-write 샌드박스는 `.git` 을 보호 영역으로 취급해 객체 쓰기를 거부. 반면 Claude 의 Bash 도구는 정상 권한(`.git/objects` 는 user `ewoo2` 소유 `drwxr-xr-x`)이라 commit 가능.

**How to apply (Codex 디스패치 표준):**
1. **`approval-policy: "never"`** 로 호출 → Codex 가 승인 팝업을 절대 띄우지 않음.
2. Codex 프롬프트에 **"git add/commit/branch 등 git 명령 실행 금지 — 파일 수정만 하고 commit 은 Claude 가 대행"** 명시.
3. Codex 완료 후 Claude 가 `git status` 로 변경 확인 → targeted compile/test 로 검증([[verification-before-completion]]) → plan task 기준 logical commit 으로 Claude 가 commit ([[korean-commits]], Co-Authored-By Codex 명시).
4. model 주의: 본 ChatGPT 계정 Codex 는 `gpt-5.2-codex` **미지원** (400 error) — `model` 생략(기본) + `config:{model_reasoning_effort:"high"}` 로 보안/migration 시 고강도 ([[codex-model-auto-switch]]).

[[codex-implements-claude-reviews]] 의 "workspace-write + Claude commit 대행 폴백" 을 구체화. [[codex-plugin-setup]] [[codex-mcp-session-limit]] 참조.
