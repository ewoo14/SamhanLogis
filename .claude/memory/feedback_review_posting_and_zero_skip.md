---
name: feedback_review_posting_and_zero_skip
description: PR 리뷰 게시 규칙(Claude TM·Codex TM 각각 따로 + PM 종합 마지막) + skip 0 until resolved + 슬라이스 무중단 자율
metadata:
  type: feedback
---

2026-06-06 개발책임자 야간 자율위임 지시. 모든 슬라이스/PR 에 적용.

**리뷰 게시 규칙**:
- **Claude TM 리뷰**(5-agent 종합)와 **Codex TM 리뷰**(5-섹션)를 PR 코멘트로 **각각 따로 게시**(한 코멘트에 합치지 말 것).
- 마지막에 **PM 종합 리뷰** 코멘트를 **반드시** 게시(양측 리뷰 종합 + 판단 + 머지 사유).

**skip 0 규칙**:
- Claude+Codex 5-agent & fix 사이클 후, **PM 판단상 skip 이 1건이라도 남으면 해결될 때까지 계속 fix**. (test.skip / false-green / 미실행 = 통과 아님 — [[feedback_no_fake_data_ever]], [[feedback_ci_test_filter_false_green]].) 슬라이스 관련 skip 우선, 불가피한 legacy quarantine 은 정직 명시.

**무중단 자율**:
- 슬라이스 끝날 때마다 개발책임자에게 묻지 말 것. **PM 이 연속 진행**(다음 슬라이스 자동 착수, 머지까지). 멈춤 = 신규 정책 결정만([[feedback_pm_permission_autonomy]]).

관련: [[feedback_dual_5agent_review]], [[feedback_tm_led_agent_discussion]], [[feedback_pr_ci_monitoring]], [[feedback_user_merge_authority]].
