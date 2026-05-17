---
name: dual-5agent-review
description: Claude 5-agent + Codex 5-agent (총 10 reviewer) 병렬 cross-check 사이클 + TM 통합 게시. 사이클당 PR comment 2건 (Claude TM 통합 1 + Codex TM 통합 1). 양쪽 0 결함 + CI green 까지 수렴.
metadata:
  type: feedback
---

모든 PR 에 **양쪽 5-agent 병렬 cross-check + TM 통합 게시** 적용:

## 사이클 구조

```
[head A: 초기 PR 발행]
  ↓
1. Claude 5-agent 병렬 리뷰 (head A)
   - subagent: backend-engineer / frontend-engineer / designer / qa-tester / devops-engineer 병렬 (single message multiple Agent tool calls)
   - 결과: 5 개 markdown body (PR comment 각자 등록 X)
  ↓
1.5. TM Claude 통합 — 5 agents 리뷰를 1 PR comment 로 종합 게시
   - tech-manager agent 가 BE/FE/Designer/QA/DevOps 결과 종합
   - 구조: 5 agent 결과 요약 표 (출처/우선순위/위치/내용) + 종합 결과 (APPROVE / 사이클 N+1 필요)
   - `gh pr comment <num> --body-file claude-tm-cycle-N.md`
  ↓
2. Codex 5-agent 병렬 재검 리뷰 (head A + TM Claude 통합 1 코멘트 포함)
   - codex CLI MCP 서버 `mcp__codex__codex` 5 회 병렬 호출 (BE/FE/Designer/QA/DevOps 각자 1 호출, sandbox=read-only)
   - 각 호출 prompt: head A diff + **위에 등록된 TM Claude 통합 코멘트의 같은 role 섹션 검토** + 추가 발견 + Claude 발견 valid/invalid/over-engineering 평가
   - 결과: 5 개 markdown body (PR comment 각자 등록 X)
  ↓
2.5. TM Codex 통합 — 5 agents 리뷰를 1 PR comment 로 종합 게시
   - tech-manager agent 가 Codex 5 결과 종합
   - Claude 발견 평가 + Codex 자체 발견 + 종합 결과
   - `gh pr comment <num> --body-file codex-tm-cycle-N.md`
  ↓
[양쪽 TM 통합 모두 0 결함 → 사용자/PM 머지 결정]
[결함 있으면 ↓]
  ↓
3. 통합 fix commit (head B = fix push 후)
   - Codex CLI MCP (sandbox=workspace-write) 또는 Claude 직접 — 1 commit 으로 묶음
  ↓
4. Claude 5-agent 재리뷰 + TM Claude 통합 (head B) — PR comment 1
  ↓
5. Codex 5-agent 재검 + TM Codex 통합 (head B) — PR comment 1
  ↓
[반복 — 수렴까지]
```

## 종료 조건

- 양쪽 TM 통합 모두 신규 P0/P1 결함 0 + 이전 사이클 발견 모두 해소
- CI 100% PASS
- 종료 시 사용자/PM 머지 결정 (`feedback_user_merge_authority.md` PM 자동 머지 가능)

## 운영 규칙

- **PR 코멘트는 TM 통합 2건** — Claude TM 통합 1 + Codex TM 통합 1 = **사이클 1회당 2 PR comment**. 가독성 우선, 각자 5+5=10 별도 등록 폐기 (2026-05-17 사용자 정정).
- **각 agent 5건 raw markdown** — 작업 산출물은 `docs/qa/<slug>/claude-{role}-cycle-N.md` / `codex-{role}-cycle-N.md` 로 저장만 (PR comment 등록 X, repo commit X). TM 통합 markdown 작성 시 source 자료.
- **head SHA 명시** — TM 통합 코멘트 첫 줄에 "head `<sha>` 기준" 명시 (사이클별 추적).
- **Codex CLI MCP 호출 규칙**:
  - 도구: `mcp__codex__codex` (Codex Plugin 사용 금지)
  - `sandbox: "read-only"` (review 는 read-only)
  - `approval-policy: "never"` (interactive 차단)
  - `model: "gpt-5.5-codex"` 또는 기본
  - prompt 의무 항목:
    - 본인 role (BE/FE/Designer/QA/DevOps) 명시
    - "위에 등록된 TM Claude 통합 코멘트의 같은 role 섹션 fetch 후 검토"
    - "Claude 발견 사항 중 valid/invalid/over-engineering 평가"
    - "Codex 자체 발견 + Claude 발견 보강"
    - 출력 형식: PR comment markdown body 만 (preamble/closing 없이)
- **fix 는 Codex CLI MCP `sandbox: "workspace-write"`** 또는 Claude 직접 — 1 commit 으로 묶음

## TM 통합 markdown 표준 구조

### Claude TM 통합 (사이클 N)

```markdown
## Claude 5-agent 사이클 N 통합 리뷰 (head `<sha>`)

> tech-manager agent 가 BE / FE / Designer / QA / DevOps 5 agent 결과 종합.

### 결함 종합 표

| 출처 | 우선순위 | 위치 | 내용 | 처리 권고 |
|---|---|---|---|---|
| BE | P1 | path:line | ... | 사이클 N+1 fix |
| ... |

### 각 agent 종합 판정

| Agent | 판정 |
|---|---|
| BE | APPROVE / 사이클 N+1 필요 |
| FE | APPROVE |
| Designer | APPROVE |
| QA | APPROVE |
| DevOps | APPROVE |

### TM 결정

- 종합: APPROVE / 사이클 N+1 필요
- 핵심 fix 후보: ...
- non-blocker 잔존: ...

**tech-manager — 2026-05-17**
```

### Codex TM 통합 (사이클 N)

```markdown
## Codex 5-agent 사이클 N 통합 리뷰 (head `<sha>`)

> tech-manager agent 가 Codex BE / FE / Designer / QA / DevOps 5 agent 결과 종합.

### Claude 발견 평가 종합

| Claude 발견 출처 | Codex 평가 (valid/invalid/over-engineering) | 사유 |
|---|---|---|
| ... | ... | ... |

### Codex 자체 신규 발견

| 출처 | 우선순위 | 위치 | 내용 |
|---|---|---|---|
| ... |

### TM 결정

- 종합: APPROVE / 사이클 N+1 필요

**tech-manager — 2026-05-17**
```

## Why

- PR #211 (SP-08-2) — 단일 통합 리뷰 후 머지 — DPS 회귀 4 P2 결함 발견
- PR #212 (SP-08-3-1) — 5-agent 양쪽 도입 → CI 미실행 / 운송사 endpoint 불일치 등 11건 추가 발견
- PR #217 (SP-08-4-2) — Codex 1회 통합 review 만 했을 때 Designer 누락 + UUID fallback 가드 누락 등 발견 지연 → 사용자 정정 (2026-05-17): Codex 도 5-agent 병렬 (BE/FE/Designer/QA/DevOps) 의무
- PR #217 사이클 3 (2026-05-17) — Claude 5 + Codex 5 = 10 PR comment 각자 등록 시 PR comment 영역 가독성 저하 → 사용자 정정: **TM 통합 2 PR comment 만 게시** (각자 raw 5 markdown 은 `docs/qa/` 저장만)
- 양쪽 5+5 = 10 reviewer cross-check 결과를 TM 가 종합 → 1+1=2 PR comment 가시화 = 효율 + 가독성 양립

## How to apply

- PR 발행 직후 → CI watch background + 사이클 1 시작
- **Claude 5 subagent 병렬 (single message multiple Agent tool calls)** → markdown body 5건 수집 → **tech-manager agent 통합** → 1 PR comment 등록
- **Codex 5-agent 병렬 (single message multiple `mcp__codex__codex` tool calls)** → markdown body 5건 수집 → **tech-manager agent 통합** → 1 PR comment 등록
- 사이클 N=3 까지 (그 이상이면 사용자 직접 결정 — 무한 반복 방지)
- 머지 trigger 는 사용자 또는 PM 자동 머지 (조건 충족 시)

[[pr-title-caps-bracket]] [[multi-agent-team-pattern]] [[integrated-pr-pattern]] [[pr-review-workflow]] [[user-merge-authority]] [[codex-cli-mcp]]
