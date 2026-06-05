---
name: feedback-pm-permission-autonomy
description: 권한(RBAC/권한그룹/위임) 관련 코드는 PM 이 머지까지 전권 자율 — 단 PR 워크플로우 감시·지적 의무
metadata:
  type: feedback
---

2026-06-05 개발책임자 전권 위임: **권한 관련 코드(RBAC, 권한그룹/PG, 위임, @PreAuthorize→@RequirePermission 마이그레이션, 권한 매트릭스, seed)는 PM 이 검토부터 머지까지 전권 자율 진행**. 머지 승인 대기 불필요.

**단 조건**: PM 은 **PR 워크플로우 방식을 스스로 감시하고 지적**해야 함 — dual 5-team review([[feedback_dual_5agent_review]]) + 사이클 N=2([[feedback_cycle_n2_mandatory]]) + Codex 구현([[feedback_codex_implements_claude_reviews]]) + CI green 전 PM 리뷰 금지 + Docker 실 QA([[feedback_qa_docker_real_test]], [[feedback_no_fake_data_ever]]) + 조기 PR([[feedback_open_pr_early]]) + 백로그 분리 금지([[feedback_no_backlog_strict]]) 를 자율로 엄격 적용하고, 위반/약점을 스스로 적발·지적.

**Why**: 권한 작업이 연속·대규모(권한그룹 동적화 Phase A/B/C 등)라 매 슬라이스 머지 승인 대기는 비효율. 개발책임자는 품질 게이트(워크플로우)만 신뢰하고 진행은 PM 에 위임.

**How to apply**: 권한 슬라이스는 spec→plan→Codex 구현→dual review→CI green→Docker 실 QA→PM 자율 머지→다음 슬라이스 자동 진입([[feedback_pm_auto_continuous]]). 멈추는 시점 = 신규 **업무규칙/정책 결정**(예: widening 수용 여부 D-PAM-05, 빌트인 신원 범위)만 개발책임자 확인. 순수 기술/워크플로우 판단은 PM 자율. widening 등 보안 access 변경도 "정책 결정"이라 개발책임자 확인 대상이나, 그 외 구현·리뷰·머지는 전권.
