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
- ~~**main 직접 docs/memory 박제 push**는 별개 가드레일~~ → **2026-07-21 폐지.** 아래 참조.

## 🚨 2026-07-21 (현행) — **문서는 PR 없이 main 에 직접 커밋**

개발책임자 지시 2단계:
1. **"앞으로 핸드오프 등의 문서는 그냥 머지하도록 해."** (PR 자율 머지 위임)
2. **"메모리, 핸드오프 등의 문서는 PR을 만들어서 머지하지 말고 그냥 메인에 바로 커밋할것"** ← **현행. 1번을 대체함**

**Why**: 문서 1줄 바꾸는 데 브랜치→push→PR→CI 대기→머지가 붙으면 **CI 한 바퀴(수 분)를 문서에 쓰게 됩니다.** 2026-07-21 세션에서 #882·#884·#885·#886 **네 번을 그렇게 돌렸습니다.** 특히 핸드오프는 main 에 들어가야 타 PC 가 받으므로 지연 자체가 손실입니다. 구 가드레일("main 직접 push 는 별개 승인")은 **개발책임자가 명시적으로 폐지**했습니다.

**How to apply** — 코드 변경이 **0인** 커밋은 `main` 에서 바로 `git commit` → `git push`:
- `docs/**` (핸드오프·dev-report·spec·README 동기화·`samhan-public-overview.html`)
- `.claude/memory/**` · `CLAUDE.md`
- `migration/decisions/DECISIONS.md`

🚫 **적용 안 되는 것**: 코드·설정·CI·마이그레이션이 **한 줄이라도** 섞이면 문서가 아니며 [[feedback_infra_chore_not_canon_exempt]] 대로 **브랜치+PR+풀 캐논**입니다. 🚨 **문서에 코드를 끼워 넣어 캐논을 우회하지 말 것** — 이게 이 위임의 유일한 악용 경로입니다.
📌 개발책임자 **결정 기록은 여전히 해당 PR/이슈에** 남깁니다 → [[feedback_post_devlead_decisions_to_pr]]. 문서를 직접 커밋했다고 결정 기록까지 생략하지 마십시오.
⚠️ push 전 `git pull --ff-only` 로 최신화. 실패하면 rebase 후 재시도.

관련: [[feedback_canonical_workflow]], [[feedback_pm_permission_autonomy]](권한코드 자율), [[feedback_infra_chore_not_canon_exempt]].
