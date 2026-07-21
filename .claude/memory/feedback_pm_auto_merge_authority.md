---
name: pm-auto-merge-authority
description: 개발책임자가 "PM 판단 하 자동 머지 가능" 위임 — 게이트(0수렴·CI green·mock gate·라이브QA) 충족 시 매 승인요청 없이 PM 자율 머지 (2026-06-25 모바일 슬2)
metadata:
  type: feedback
---

# PM 판단 하 자동 머지 위임 (2026-06-25)

개발책임자: **"PM 판단 하 자동 머지 가능"** (모바일 슬2 PR #597 머지 직전 위임).

**Why:** 슬1·슬2 canonical 워크플로우가 안정적으로 0수렴·라이브QA·CI green 게이트를 충족함을 확인 → 매 슬라이스 머지마다 명시 승인요청(AskUserQuestion)을 거치지 않고 PM 자율 머지 허용.

**How to apply:**
- canonical 8단계 머지 게이트 **전부 충족 시 PM 자율 머지**(draft 해제→squash 머지): ④⑤ 듀얼리뷰 0수렴(Codex confirm MERGE-OK) + 라이브 QA PASS + CI 전 green(GitGuardian dev시드 FP 제외) + mock gate(신규 셸/라우팅 변경 시) PASS.
- 머지 전 PM 종합(⑥) 게시·스크린샷 인라인(요청 시)은 유지. 머지 후 완결 핸드오프/메모리 박제.
- **자율 머지의 전제 = 게이트 엄수**: 게이트 미충족(0수렴 안 됨·CI red·라이브QA 실패)이면 머지 금지. 신규 업무규칙/정책 widening 등 비-게이트 판단은 여전히 개발책임자 확인.
- **main 직접 docs/memory 박제 push**는 별개 가드레일(머지 위임≠직접 push 위임) — auto-mode 분류기가 막으면 개발책임자 확인. (슬1 PR #596 docs push는 별도 "승인" 받음.)

## 🚨 2026-07-21 추가 위임 — **문서 전용 PR 은 상시 자율 머지**

개발책임자: **"앞으로 핸드오프 등의 문서는 그냥 머지하도록 해."**

**Why**: 2026-07-21 세션에서 PM 이 메모리 PR(#882)·핸드오프 PR(#884) 머지 방식을 **매번 물어봤고**, 그때마다 턴이 소모됐습니다. #882 승인은 "이 PR 한정"이었으나 개발책임자가 **상시 위임으로 확장**했습니다. 특히 핸드오프는 **main 에 들어가지 않으면 다른 PC 에서 재개 시 컨텍스트가 끊기므로** 지연 자체가 손실입니다.

**How to apply** — 코드 변경이 **0인** PR 은 CI green 확인 후 **묻지 않고 squash 머지**:
- `docs/**` (핸드오프·dev-report·spec·README 동기화·`samhan-public-overview.html`)
- `.claude/memory/**` · `CLAUDE.md` — 규칙 문서라 **PR 본문에 변경 요지를 반드시 명시**하고 머지(PM 해석. 개발책임자가 제외를 지시하면 따를 것)
- `migration/decisions/DECISIONS.md`

🚫 **적용 안 되는 것**: 코드·설정·CI·마이그레이션이 **한 줄이라도** 섞이면 문서 PR 이 아니며 [[feedback_infra_chore_not_canon_exempt]] 대로 **풀 캐논**입니다. **문서에 코드를 끼워 넣어 캐논을 우회하지 말 것.**
📌 머지 후에도 **결정 기록은 PR 에 남깁니다** → [[feedback_post_devlead_decisions_to_pr]].

관련: [[feedback_canonical_workflow]], [[feedback_pm_permission_autonomy]](권한코드 자율), [[feedback_infra_chore_not_canon_exempt]].
