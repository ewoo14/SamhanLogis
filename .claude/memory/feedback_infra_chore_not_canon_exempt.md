---
name: feedback_infra_chore_not_canon_exempt
description: CI/인프라/chore PR도 캐논 예외 아님 — 긴급·자명해 보여도 축약은 개발책임자 선확인 후에만
metadata:
  type: feedback
---

2026-07-06 #751(아티팩트 `continue-on-error`)·#750(미사용 JAR 업로드 제거) 회고. Actions 스토리지 쿼터로 CI 가 막히자 인프라 PR 을 듀얼 5-agent 리뷰 없이 정찰→검증→머지로 처리 — "1줄 PR도 동일 워크플로·단축금지"([[feedback_canonical_workflow]] [[feedback_review_5agent_no_shortcut_strict]])에 위배.

**Why:** 긴급 CI 언블록·provably safe(소비처 0·continue-on-error 비게이팅)여도, "인프라라서/자명해서 캐논 생략"을 PM 이 임의 판단하는 것 자체가 단축이며, "워크플로 위반이 매우 많다"는 개발책임자 지적의 반복 패턴. **축약 정당성은 PM 이 아니라 개발책임자가 판정.**

**How to apply:** CI/인프라/chore PR 도 기본은 캐논(Codex 개발→Opus 5-agent→Codex 재수렴→PM종합→머지). 긴급성 등으로 축약이 필요하면 **착수 전 개발책임자에게 "이 인프라 PR 은 축약 처리해도 되는지" 선확인**받고 그 결정을 PR 에 기록([[feedback_post_devlead_decisions_to_pr]]). 임의 단축 금지. [[feedback_expanded_scope_reinstate_review]] [[feedback_pm_no_direct_implementation]]
