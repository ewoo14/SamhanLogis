---
name: feedback-track-always-opens-with-pr
description: "트랙은 반드시 PR 과 함께 올린다 — \"빠른 fix\" 라도 main 직커밋은 안 된다"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-15T23:25:16.748Z
---

개발책임자 (2026-08-16): *"트랙은 반드시 PR과 함께 올려"*

## 무엇이 잘못이었나

개발책임자가 *"빠른 FIX 부탁해"* 라고 해서 견적웹 fix(`fb8ae7bb8`)를
**PR 없이 main 에 직접 커밋**했다. 변경이 한 줄이고 회귀 테스트가 붙어 있었지만
**PR·적대검증·라이브QA 게이트를 통째로 건너뛴 것**이다.

🔑 **"빠르게" 는 "절차를 빼고" 가 아니다.** 브랜치를 파고 PR 을 여는 데 드는 시간은
몇 초다. 건너뛰어서 아낀 시간보다, 검증 없이 main 에 들어간 변경의 위험이 크다.

## How to apply

- **작업을 시작할 때 브랜치부터 판다.** 커밋할 때가 아니라 시작할 때다
- 구현이 나오면 **즉시 PR 을 연다** — 검증이 끝난 뒤가 아니다
  ⟹ 리뷰·검증 기록이 PR 에 1:1 로 쌓여야 나중에 되짚을 수 있다
- 🚫 "한 줄이라서" · "급해서" · "명백해서" 는 예외 사유가 아니다
- 급하면 **PR 을 열고 바로 머지**하면 된다. PR 자체를 생략하지 마라
- 문서·메모리 전용 커밋은 트랙이 아니다 — main 직커밋 가능
  ([[feedback_pm_auto_merge_authority]])

관련: [[feedback_canonical_workflow]] · [[feedback_pr_open_not_draft]] ·
[[feedback_review_post_one_to_one_enforcement]] · [[feedback_fix_in_current_pr_no_split]]
