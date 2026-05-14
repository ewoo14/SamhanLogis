---
name: arologis-extract-autopilot
description: 2026-05-14 개발책임자 결정 — 본 conversation 의 아로로지스 독립 분리 작업은 머지 요청 외 모든 단계 자율 진행 (TM 통합 / PR 발행 / CI watch / false positive / 5-team 검토 자동)
metadata:
  type: feedback
---

본 conversation 의 **아로로지스 독립 분리 작업** 에 한해 머지 요청 외 모든 단계 자율 진행 권한 위임.

**Why:** 2026-05-14 개발책임자 명시 — "머지 요청 외에는 모든 작업 자동 승인 및 진행 요청". 분리 작업 효율 + 사용자 인터럽트 최소화.

**How to apply:**

자율 진행 (사용자 컨펌 SKIP):
- TM 통합 (worktree merge / 컴파일 가드 / 문서 동기화 / DECISIONS 갱신)
- 통합 PR 발행 (PR 본문 자동 작성, "PR 전 재 확인" 단계 SKIP)
- CI watch (`gh pr checks --watch`) + fail 시 자동 fix
- GitGuardian / false positive 자동 판정
- 5-team 결과 검토 (결함 시 자동 fix dispatch)
- 회귀 가드 (33 + 신규 IT 4 = 37 case)

사용자 결정 대기 (유일한 예외):
- **최종 머지 요청** — `@개발책임자: PR #XXX 머지 부탁드립니다` 메시지로 알림

**참조:** [[project_arologis_independent]] / [[feedback_user_merge_authority]] / [[feedback_pr_ci_monitoring]] / [[feedback_gitguardian_false_positive]] / [[feedback_monitor_no_permission]]
