---
name: dual-5agent-review
description: 모든 PR 에 Claude 5-agent + Codex 5-agent 양쪽 리뷰 의무 (BE/FE/Designer/DevOps/QA 각각, cross-check 결함 탐지율 최대화)
metadata:
  type: feedback
---

모든 PR 에 **Claude 5-agent + Codex 5-agent 양쪽 모두** 리뷰를 받는다.

- **Claude 5-agent**: `backend-engineer` / `frontend-engineer` / `designer` / `devops-engineer` / `qa-tester` subagent 디스패치 → 각 agent markdown 결과 → 1 통합 PR 코멘트 등록 (또는 5개 분리). single message multiple Agent tool calls 로 병렬 실행.
- **Codex 5-agent**: `codex exec` (또는 MCP codex) 1회 호출에 BE/FE/Designer/DevOps/QA 5 섹션 통합 prompt → 한국어 markdown → PR 코멘트 등록. read-only 라 `--dangerously` flag 없이도 classifier 통과.

**Why**: PR #211 (SP-08-2) 머지 후 사용자 명시 요청 (2026-05-16). Claude 통합 리뷰 + Codex 통합 리뷰 2건만으로는 도메인 전문 발견이 부족 — 실제로 5-agent 진행 시 Claude BE 가 `findByIdAndCreatedBy` TOCTOU + `@Version` race + FE 중복 저장 + Designer 색상 토큰 + QA INVENTORY role false green 등 **9건 신규 결함** 추가 발견 (Claude/Codex 통합 리뷰가 놓친 것). cross-check 결함 탐지율이 단일 통합보다 압도적.

**How to apply**:
- PR 발행 직후 → `gh pr checks --watch` background + 5-agent 양쪽 리뷰 동시 진행.
- Claude 5 subagent 병렬 (single message 안에 5 Agent tool calls — concurrent 실행).
- Codex 1회 호출 (5 섹션 통합 prompt, 비용 절감 + 일관성).
- 모든 리뷰 결과 종합 → codex fix 1번 (`codex exec --dangerously-bypass-approvals-and-sandbox`) 또는 PM 자동 머지 가능 시 skip.
- 5-team 패턴 (`[[multi-agent-team-pattern]]`) 과 정합 — 동일 5 역할 사용.
- 리뷰 markdown 본문은 `.tmp/<agent>-5agent-review-pr<num>.md` 임시 파일 (gitignored) 후 `gh pr review --comment --body-file`.

[[pr-title-caps-bracket]] [[multi-agent-team-pattern]] [[integrated-pr-pattern]] [[pr-review-workflow]]
