---
name: dual-5agent-review
description: Claude 5-agent + Codex 5-agent (총 10 reviewer) 병렬 cross-check 사이클. 양쪽 0 결함 + CI green 까지 수렴. Codex 는 CLI MCP 서버 (mcp__codex__codex).
metadata:
  type: feedback
---

모든 PR 에 **양쪽 5-agent 병렬 cross-check 사이클** 적용:

## 사이클 구조

```
[head A: 초기 PR 발행]
  ↓
1. Claude 5-agent 병렬 리뷰 (head A)
   - subagent: backend-engineer / frontend-engineer / designer / qa-tester / devops-engineer 병렬 (single message multiple Agent tool calls)
   - 결과: 5 개 PR comment 각자 등록
  ↓
2. Codex 5-agent 병렬 재검 리뷰 (head A + Claude 5 코멘트 포함)
   - codex CLI MCP 서버 `mcp__codex__codex` 5 회 병렬 호출 (BE/FE/Designer/QA/DevOps 각자 1 호출)
   - 각 호출 prompt: head A diff + **위에 등록된 Claude 같은 role agent 코멘트도 함께 검토** + 추가 발견 + Claude 발견 valid 평가
   - 각 호출 결과: 1 PR comment → 총 5 개 PR comment 등록 (Claude 와 별도)
  ↓
[양쪽 0 결함 → 사용자/PM 머지 결정]
[결함 있으면 ↓]
  ↓
3. 통합 fix commit (head B = fix push 후)
   - Codex CLI MCP (sandbox=workspace-write) 또는 Claude 직접 — 1 commit 으로 묶음
  ↓
4. Claude 5-agent 재리뷰 (head B) — 5 PR comment
  ↓
5. Codex 5-agent 재검 리뷰 (head B + Claude 재리뷰 포함) — 5 PR comment
  ↓
[반복 — 수렴까지]
```

## 종료 조건

- 양쪽 5-agent (총 10) 모두 신규 P0/P1 결함 0 + 이전 사이클 발견 모두 해소
- CI 100% PASS
- 종료 시 사용자/PM 머지 결정 (`feedback_user_merge_authority.md` PM 자동 머지 가능)

## 운영 규칙

- **PR 코멘트는 각자 별도 등록** — Claude 5 + Codex 5 = 사이클 1회 시 최소 10 개. cross-check 가시화 의무.
- **사이클 1회 = 10 코멘트 추가** — `gh pr comment <num> --body-file <file>` 형식.
- **head SHA 명시** — 각 코멘트 첫 줄에 "head `<sha>` 기준" 명시 (사이클별 추적).
- **Codex CLI MCP 호출 규칙**:
  - 도구: `mcp__codex__codex` (Codex Plugin 사용 금지)
  - `sandbox: "read-only"` (review 는 read-only)
  - `approval-policy: "never"` (interactive 차단)
  - `model: "gpt-5.5-codex"` 또는 기본 (코드 read 충분한 모델)
  - prompt 의무 항목:
    - 본인 role (BE/FE/Designer/QA/DevOps) 명시
    - "위에 등록된 Claude `<same-role>-agent` 코멘트를 PR comments API 로 fetch 하여 본문 검토"
    - "Claude 발견 사항 중 valid/invalid/over-engineering 평가"
    - "Codex 자체 발견 + Claude 발견 보강"
    - 출력 형식: PR comment markdown body 만 (preamble/closing 없이)
- **fix 는 Codex CLI MCP `sandbox: "workspace-write"`** 또는 Claude 직접 — 1 commit 으로 묶음

## Why

- PR #211 (SP-08-2) — 단일 통합 리뷰 후 머지 — DPS 회귀 4 P2 결함 발견 (운영 영향 가능성)
- PR #212 (SP-08-3-1) — 5-agent 양쪽 도입 → CI 미실행 / 운송사 endpoint 불일치 등 11건 추가 발견
- PR #217 (SP-08-4-2) — Codex 1회 통합 review 만 했을 때 Designer 누락 + UUID fallback 가드 누락 등 발견 지연 → 사용자 정정 (2026-05-17): **Codex 도 5-agent 병렬 (BE/FE/Designer/QA/DevOps) 의무**
- 양쪽 5+5 = 10 reviewer cross-check = 결함 탐지 최대화

## How to apply

- PR 발행 직후 → CI watch background + 사이클 1 시작
- **Claude 5 subagent 병렬** (single message multiple Agent tool calls)
- **Codex 5-agent 병렬** (single message multiple `mcp__codex__codex` tool calls — BE/FE/Designer/QA/DevOps 5개)
- 사이클 N=3 까지 (그 이상이면 사용자 직접 결정 — 무한 반복 방지)
- 머지 trigger 는 사용자 또는 PM 자동 머지 (조건 충족 시)

[[pr-title-caps-bracket]] [[multi-agent-team-pattern]] [[integrated-pr-pattern]] [[pr-review-workflow]] [[user-merge-authority]] [[codex-cli-mcp]]
