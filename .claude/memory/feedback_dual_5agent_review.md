---
name: dual-5agent-review
description: Claude 5-agent + Codex 5-agent (총 10 reviewer) 병렬 cross-check 사이클 + TM 통합 게시. 사이클당 PR comment 2건 (Claude TM 통합 1 + Codex TM 통합 1). 양쪽 0 결함 + CI green 까지 수렴.
metadata:
  type: feedback
---

모든 PR 에 **양쪽 5-agent 병렬 cross-check + TM 통합 게시** 적용:

## 사이클 구조 (2026-05-17 사용자 정정 5회차 — 최종)

**핵심**: 사이클 1회 = Claude review → Claude fix → Codex review (Claude fix 후 head) → Codex fix → 사이클 N 종료. 양쪽 reviewer 가 본인 review 직후 즉시 fix 진행 (서로의 review 결과를 보고 cross-check fix). 통합 fix 단계 (사이클 N.5) 폐기.

```
[head A: 초기 PR 발행]
  ↓
1a. Claude 5-agent 병렬 리뷰 (head A)
   - subagent: BE / FE / Designer / QA / DevOps 병렬 (single message multiple Agent tool calls)
   - 결과: 5 개 markdown body (raw)
  ↓
1b. TM Claude 통합 — 1 PR comment 게시
   - tech-manager agent 가 5 결과 종합 → `gh pr comment <num> --body-file tm-claude-cycle-N.md`
  ↓
1c. **Claude fix (자체 review 기반 + Codex 사전 리뷰 cross-check)**
   - Claude 가 직접 fix (도메인 / FE / Designer / 문서) 또는 Codex CLI MCP workspace-write 위임
   - commit + push (head B)
  ↓
2a. Codex 5-agent 병렬 재검 리뷰 (head B + Claude TM 통합 코멘트 검토)
   - `mcp__codex__codex` 5 회 병렬 호출 (BE/FE/Designer/QA/DevOps 각자, sandbox=read-only)
   - prompt: head B diff + TM Claude 통합 코멘트 같은 role 섹션 검토 + valid/invalid 평가 + Codex 신규 발견
   - 결과: 5 개 markdown body (raw)
  ↓
2b. TM Codex 통합 — 1 PR comment 게시
   - `gh pr comment <num> --body-file tm-codex-cycle-N.md`
  ↓
2c. **Codex fix (자체 review 기반 + Claude review cross-check)**
   - Codex CLI MCP workspace-write 위임 (sandbox=workspace-write)
   - commit + push (head C — 본 사이클 N 최종 head)
  ↓
[사이클 N 종료 — 양쪽 TM 통합 모두 0 P0/P1 blocker 도달 → 머지 진행]
[잔존 시 ↓]
  ↓
3a. Claude 5-agent 재리뷰 (head C) — 사이클 N+1 시작
3b. TM Claude 통합 PR comment
3c. Claude fix → push (head D)
4a. Codex 5-agent 재검 (head D)
4b. TM Codex 통합 PR comment
4c. Codex fix → push (head E — 사이클 N+1 최종)
  ↓
[반복 — N=3 안 종료 의무]
```

### 핵심 변경 (5회차)

- **사이클 N.5 통합 fix 단계 폐기** — 양쪽 reviewer 가 본인 review 직후 즉시 fix
- 사이클 1회 commit 수: 최소 2개 (Claude fix + Codex fix), 결함 0 시 1개 또는 0개
- 양쪽 reviewer 가 서로의 review 를 cross-check 하여 fix 함 (Claude 가 Codex review 인지, Codex 가 Claude review 인지)
- Claude fix 와 Codex fix 가 동일 결함을 중복 fix 하지 않도록 사전 합의: 각자 본인 review 발견 결함 + 상대방 valid 평가한 결함만 책임

### Fix 책임 분담

- **Claude fix 책임**: Claude 5-agent review 발견 결함 + Codex 가 향후 valid 평가할 예상 결함 (선제적)
- **Codex fix 책임**: Codex 5-agent review 발견 결함 + Claude 가 valid 평가한 결함 중 사이클 1c 에서 누락된 항목 (보완)
- 양쪽 fix 후 잔존 시 다음 사이클로 이월

## 종료 조건

- 양쪽 TM 통합 모두 신규 **P0/P1 blocker 0** + CI 100% PASS → 머지 (Nit/non-blocker 는 후속 슬라이스 가능)
- 사이클 N=3 안 완료 의무 (2026-05-17 4회차 정정)
- 종료 시 사용자/PM 머지 결정 (`feedback_user_merge_authority.md` PM 자동 머지 가능)

## 결함 fix 정책 (2026-05-17 사용자 정정 5회차 — 최종)

- **사이클 N=3 안 완료 의무** — PR 1건당 사이클 1, 2, 3 안에서 모든 결함 (P0/P1/P2/Nit/non-blocker) fix + 머지. 사이클 4 이상 진행 금지.
- **사이클 1회 = Claude review → Claude fix → Codex review → Codex fix** (사용자 5회차 정정). 사이클 N.5 통합 fix 단계 폐기.
- **양쪽 fix 책임 분담**: Claude 는 자체 review 결함 + Codex valid 예상 결함 (선제적), Codex 는 자체 review 결함 + Claude valid 항목 중 미처리 보완.
- **한 사이클당 가능한 한 모든 결함 묶어 fix** — Codex fix 직후 본 사이클 결함 0 도달이 목표.
- **사이클 3 review 까지 잔존 결함 0 도달 못 한 경우**: blocker 만 fix 후 머지, Nit/non-blocker 는 후속 슬라이스 백로그.
- **사이클 3 review 후에도 P0/P1 blocker 잔존 시**: 사용자에게 보고 + 결정 위임 (사이클 4 진입 또는 PR 분리 등).
- **예외**: Codex sandbox EPERM 등 환경 한계로 사이클 fix 불가능한 항목 (예: Playwright browser 미실행)
- **History**: 2026-05-17 3회차 "완전 fix 까지 무제한" → 4회차 "사이클 N=3 제한" 정정 (PR #217 사이클 6 회고). PR #217 은 정정 시점 이미 사이클 6 진행 중 예외.

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
- **사이클 N=3 안 완료 의무** (2026-05-17 4회차 사용자 정정 — 최종). 사이클 4+ 진입 금지. 사이클 1.5/2.5 통합 fix 단계에서 가능한 한 모든 결함 묶어 처리.
- 머지 trigger 는 사용자 또는 PM 자동 머지 (조건 충족 시)

[[pr-title-caps-bracket]] [[multi-agent-team-pattern]] [[integrated-pr-pattern]] [[pr-review-workflow]] [[user-merge-authority]] [[codex-cli-mcp]]
