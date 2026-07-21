---
name: feedback-codex-cli-version-model-mismatch
description: codex CLI 이중 설치(PATH npm vs 데스크톱 앱 번들) — MCP는 PATH 쪽을 쓰므로 config.toml 모델 상향 시 PATH codex도 같이 업그레이드해야 400 안 남
metadata:
  type: feedback
---

2026-07-15 실증(#809 R3). `~/.codex/config.toml` 의 `model` 을 상향(예: `gpt-5.6-sol`)하면 **MCP 의 전 codex 호출이 `400 The '<model>' model requires a newer version of Codex` 로 차단**될 수 있다. 원인 = **codex CLI 이중 설치 + 버전 격차**.

**Why**: 이 PC 에 codex 가 두 곳에 있고 버전이 다르다.
- **PATH**: `C:\Users\<user>\AppData\Roaming\npm\codex.ps1` (npm 전역) — **MCP 서버(`codex mcp-server`)가 쓰는 것**
- 데스크톱 앱 번들: `C:\Users\<user>\AppData\Local\OpenAI\Codex\bin\<hash>\codex.exe`

config.toml 모델은 **최신 CLI 를 전제**하는데 PATH 쪽이 뒤처져 있으면(실측 0.131.0 vs 앱 번들 0.144.2 vs npm 최신 0.144.4) 400 이 난다. `model` 파라미터를 명시하든 생략하든 **동일하게 차단**된다(config 기본값이 먹기 때문).

**How to apply**:
1. 증상(`400 ... requires a newer version of Codex`) 시 **버전부터 대조**: `codex --version`(PATH) vs `Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin" -Directory` 하위 `codex.exe --version` vs `npm view @openai/codex version`.
2. `npm i -g @openai/codex@latest` 로 **PATH codex 업그레이드**.
3. ⚠️ **업그레이드해도 실행 중인 MCP 서버는 구버전 프로세스로 상주** → **세션 재시작 후에야 반영**된다. 인세션 재연결로는 복구 안 됨(= [[feedback_codex_kill_shares_mcp_vendor]] 와 동일 계열).
4. 🚫 **codex.exe kill 로 재시작 시도 금지** — MCP vendor 공유 바이너리까지 종료돼 세션 도구 레지스트리에서 이탈한다.
5. 재시작 직후 **연결 테스트 1줄**(모델/effort 확인)로 반영 검증 후 본 작업 디스패치.

**부수 교훈**: MCP tool **idle timeout 1800s** 로 대형 디스패치가 abort 돼도 **산출물은 디스크에 남고 Codex 는 계속 돈다**(#809 R1 fix 26파일 · R3 fix 28+9파일 실증). abort=미수행으로 단정 금지([[feedback_codex_detached_write_settle]] 동일 원칙).

## 🚨 2026-07-21 — idle timeout 은 **끄는 게 정답**이고, 그 설정은 **PC 마다 따로** 해야 한다

abort 는 codex 를 멈추지 않지만 **완료 통지를 끊어** 오케스트레이션을 망가뜨린다(2026-07-21 한 세션에서 **4회 이상** 발생, 매번 폴링으로 복구). 근본 대응은 **per-server timeout 상향**이다.

- **적용 = `scripts/setup-codex-mcp-timeout.ps1`**(멱등·백업·쓰기 후 재검증. 기본 2h). 양 PC 셋업 절차는 [dev-environment-setup-multi-pc.md](../../docs/dev-environment-setup-multi-pc.md) `1-A-2`.
- 🚨 **이 설정은 `~/.claude.json` 에 있고 git 추적 대상이 아니다** — `.claude/memory/` 처럼 자동으로 따라오지 않는다. **PC 를 옮기면 반드시 1회 실행**할 것. (2026-07-21 개발책임자 지시: "집PC 에서도 idle timeout 변경내역이 적용되도록".)
- ⚠️ **적용은 다음 세션부터** — MCP 설정은 연결 시점에 읽힌다. 설정을 바꿔도 **진행 중인 세션은 계속 1800s 로 abort** 되니, 그 세션에서는 폴링으로 버틴다.
- 전역 `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` 은 **비추천** — 모든 MCP 서버에 적용돼 진짜로 멈춘 서버까지 안 끊긴다. codex 만 per-server 로 여는 게 맞다.
- ⚠️ 스크립트는 **ASCII 전용**으로 유지할 것. PowerShell 5.1 이 BOM 없는 UTF-8 `.ps1` 을 ANSI 로 읽어 한글 문자열이 깨지면 **파싱 자체가 실패**한다(2026-07-21 실측 — 한글 주석 버전이 `TerminatorExpectedAtEndOfString` 로 죽었다). 한글 설명은 문서로 분리([[feedback_powershell_utf8_writes]]).

🚨 **정정 (2026-07-15 #809 R3 실증) — `git diff` 해시 2회 비교는 false-STABLE 을 준다**
이전 판의 "diff 해시 2회 비교로 쓰기 종료(STABLE) 확인" 지침은 **틀렸다**. Codex 가 **검증/사고 중인 구간엔 파일을 안 쓰므로** 20초 간격 해시가 동일하게 나온다 → "종료" 오판. 실제로는 그 시점에 컴파일·IT 실행·promtool 검증이 진행 중이었고 이후에도 계속 썼다.

**진짜 종료 신호 (이걸 쓸 것)**:
1. **rollout 로그의 LastWriteTime** — `~/.codex/sessions/<yyyy>/<MM>/<dd>/rollout-<ts>-<threadId>.jsonl`. 이게 90초+ 무변동이어야 턴 종료.
2. **완료의 유일한 진실원 = rollout 안의 `"type":"task_complete"` 이벤트.** 이게 있으면 끝난 것이고, `payload.last_agent_message` 에 최종보고 전문이 들어 있다.
3. 대기는 Bash `run_in_background` + `until [ $(( $(date +%s) - $(stat -c %Y "$f") )) -ge 90 ]` 로 **단발 통지**(Monitor 는 다건용).

🚨 **정정 (2026-07-21 실증) — `Get-Process codex` 개수/PID 는 MCP 디스패치 작업의 생존 신호가 아니다**
구판 지침("디스패치 시각과 StartTime 이 맞는 PID 가 살아 있으면 진행 중")은 **MCP 경로에서 틀렸다.** `mcp__codex__codex` 로 띄운 작업은 **`codex mcp-server` 프로세스 안에서 돌아 별도 `codex.exe` 를 만들지 않는다.** 실측: 트랙B 가 rollout 을 **0초 간격으로 쓰는 중인데도** `codex.exe` 는 딱 2개(`mcp-server`, WindowsApps `app-server`=데스크톱 앱)뿐이었다. 프로세스 개수로 세면 **살아 있는 작업을 정지로 오판**한다.
- 프로세스 목록은 **CommandLine 으로 역할을 구분**해서만 쓸 것: `mcp-server` = 상주 서버, `app-server` = 데스크톱 앱, 둘 다 **작업이 아니다**.
- gradle/Playwright 동시성 판정도 마찬가지 — `java.exe` 중 VSCode `redhat.java` LSP 를 gradle 로 오인하지 말 것(실측 3개 중 2개가 LSP였다). `Get-CimInstance Win32_Process` 의 CommandLine 으로 확인한다.

🚨 **통지 유실은 abort 통지 없이도 발생한다 (2026-07-21 실증)**
트랙A 는 `task_complete` 를 정상 발행했는데 **abort 메시지조차 없이** 완료 통지가 오지 않아 **22분간 완료 사실이 묻혀 있었다**. 즉 "abort 통지가 안 왔으니 아직 진행 중"은 성립하지 않는다.
⟹ **통지는 빠른 경로일 뿐 보장 경로가 아니다.** 개발책임자 지시(통지 대기 + 10분 폴링 **병행**)의 실제 근거가 이것이며, 폴링 때 확인할 것은 프로세스가 아니라 **rollout 의 `task_complete` 유무 + LastWriteTime** 이다. → [[feedback_autonomous_loop_schedulewakeup]]
💡 통지가 끊긴 뒤에는 **rollout 파일을 Monitor 로 감시**해 `task_complete` 출현을 통지로 되살릴 수 있다(무변동 경고도 같이 emit 해서 침묵을 진행중으로 오해하지 않게 할 것).

💡 **abort 로 잃은 threadId·최종보고는 rollout 로그에서 회수된다** — 파일명에 **threadId 가 박혀 있고**(`rollout-…-<threadId>.jsonl`) assistant 메시지 전문이 들어 있다. 회수 후 **`mcp__codex__codex-reply`(threadId)** 로 같은 세션을 이어받아 정식 보고를 받으면 된다(재디스패치 불필요).
⚠️ 이 jsonl 은 **UTF-8** 인데 Windows PowerShell 5.1 `Get-Content` 기본 인코딩이 ANSI 라 **한글이 mojibake** 로 나온다 → `[System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)` 로 읽되 **codex 가 쓰는 중이면 파일 잠금**이라 실패하니 종료 후 읽을 것.
