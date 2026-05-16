---
name: dual-5agent-review
description: Claude 5-agent → Codex 5-agent (Claude 리뷰 재검 포함) → fix → 반복 cross-check 사이클. 양쪽 0 결함 + CI green 까지 수렴.
metadata:
  type: feedback
---

모든 PR 에 **반복 cross-check 사이클** 적용:

## 사이클 구조

```
[head A: 초기 PR 발행]
  ↓
1. Claude 5-agent 리뷰 (head A)
   - subagent: backend-engineer / frontend-engineer / designer / devops-engineer / qa-tester 병렬
   - 결과: 1 통합 markdown → 별도 PR 코멘트 1개
  ↓
2. Codex 5-agent 재검 리뷰 (head A + Claude 리뷰 포함)
   - codex exec 1회 호출
   - prompt: head A diff + **위에 등록된 Claude 5-agent 코멘트 본문도 함께 검토** + 추가 발견 + Claude 발견 valid 평가
   - 결과: 1 통합 markdown → 별도 PR 코멘트 1개 (Claude 와 합치지 X)
  ↓
[결함 0건이면 → 사용자/PM 머지 결정]
[결함 있으면 ↓]
  ↓
3. codex fix (head B = fix push 후)
  ↓
4. Claude 5-agent 재리뷰 (head B)
   - head A → head B diff 위주 + 이전 발견 사항 해소 확인
   - 결과: PR 코멘트 등록
  ↓
5. Codex 5-agent 재검 리뷰 (head B + Claude 재리뷰 포함)
   - 동일 prompt 패턴
   - 결과: PR 코멘트 등록
  ↓
[반복 — 수렴까지]
```

## 종료 조건

- 양쪽 5-agent 모두 신규 P0/P1 결함 0 + 이전 사이클 발견 모두 해소
- CI 100% PASS
- 종료 시 사용자/PM 머지 결정 (`feedback_user_merge_authority.md` PM 자동 머지 가능)

## 운영 규칙

- **PR 코멘트는 별도 등록** — Claude 5-agent 1개 + Codex 5-agent 1개 = 사이클 N회 시 최소 2N 개. cross-check 가시화 의무.
- **사이클 1회 = 2 코멘트 추가** — `gh pr review --comment --body-file <agent>-cycle-{N}-pr<num>.md` 형식.
- **head SHA 명시** — 각 코멘트 첫 줄에 "head `<sha>` 기준" 명시 (사이클별 추적).
- **Codex 재검 prompt 의무 항목**:
  - "위에 등록된 Claude 5-agent 코멘트를 PR comments API 로 fetch 하여 본문 검토"
  - "Claude 발견 사항 중 valid/invalid/over-engineering 평가"
  - "Codex 자체 발견 + Claude 발견 보강"
- **fix 는 Codex exec --dangerously-bypass-approvals-and-sandbox** (로컬/격리 환경 한정. 공용 CI runner 에서는 수동 commit 또는 sandbox=workspace-write 대체) — 1 commit 으로 묶음

## Why

- PR #211 (SP-08-2) — 단일 통합 리뷰 후 머지 — DPS 회귀 4 P2 결함 발견 (운영 영향 가능성)
- PR #212 (SP-08-3-1) — 5-agent 양쪽 도입 → **CI 미실행 / 운송사 endpoint 불일치 등 11건 추가 발견** (단일 리뷰 놓침)
- 양쪽 + 반복 = 결함 탐지 최대화. 비용/시간 증가하지만 회귀 비용보다 훨씬 적음
- 2026-05-16 사용자 명시 요청 (PR #212 적용 중 정정)

## How to apply

- PR 발행 직후 → CI watch background + 사이클 1 시작
- Claude 5 subagent 병렬 (single message multiple Agent tool calls)
- Codex 1회 호출 (5 섹션 통합 prompt + Claude 리뷰 fetch 명시)
- 사이클 N=3 까지 (그 이상이면 사용자 직접 결정 — 무한 반복 방지)
- 머지 trigger 는 사용자 또는 PM 자동 머지 (조건 충족 시)

[[pr-title-caps-bracket]] [[multi-agent-team-pattern]] [[integrated-pr-pattern]] [[pr-review-workflow]] [[user-merge-authority]]
