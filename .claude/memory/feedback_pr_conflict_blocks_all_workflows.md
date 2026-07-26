---
name: feedback_pr_conflict_blocks_all_workflows
description: PR 이 충돌(mergeable=CONFLICTING)이면 GitHub 이 pull_request 워크플로를 아예 생성하지 않는다 — "큐에 있음" 으로 오독 금지. 체크 수가 평소보다 적으면 mergeable 부터 확인
metadata:
  type: feedback
---

**PR 이 `mergeable=CONFLICTING`(= `mergeStateStatus=DIRTY`) 이면 GitHub 은 merge commit 을 만들 수 없어 `on: pull_request` 워크플로를 아예 생성하지 않는다.** push 해도 run 이 0건이고, 체크에는 push 트리거가 아닌 앱(GitGuardian 등)만 붙는다. **조용히 멈춘다 — 어디에도 "충돌 때문에 CI 를 못 돌린다" 는 메시지가 뜨지 않는다.**

**Why:** 2026-07-26 `#929` 실측. `#933`·`#934`·`#936` 이 머지되며 `migration/decisions/DECISIONS.md` 가 충돌했고, 그 뒤 **3개 커밋 연속**(`eb7ba588e` → `b90ca636d` → 재발동용 빈 커밋)이 전부 run 0건이었다. PM 이 `gh pr checks` 가 1건만 보여주는 것을 *"아직 큐에 있다"* 로 읽고 개발책임자께 그렇게 보고했다가 **"929는 CI 진행 중이지 않은데??"** 로 정정당했다. 빈 커밋 재발동도 무의미했다 — 원인이 push 가 아니라 PR 상태였기 때문이다. `origin/main` 병합으로 충돌을 해소하자 **즉시 21건이 pending 으로 붙었다**.

**How to apply:**

① 🚨 **체크 수가 평소보다 적으면 그 자체가 신호다.** 이 레포의 정상치는 33~41건. **1~2건뿐이면 "아직 안 붙었다" 가 아니라 "영원히 안 붙는다" 를 먼저 의심**하고 `gh pr view <N> --json mergeable,mergeStateStatus` 를 본다.

② **"큐에 있다" 는 확인 없이 말하지 않는다.** 대기·실행 중 run 은 `gh run list --json status -q '.[] | select(.status != "completed")'` 로 **실제로 있는지 확인**한다. 빈 출력이면 큐가 아니다.

③ **특정 SHA 에 무엇이 붙었는지는 직접 조회**한다 — `gh api repos/OWNER/REPO/commits/<sha>/check-runs -q .total_count` 와 `gh api repos/OWNER/REPO/actions/runs --jq '.workflow_runs[] | select(.head_sha=="<sha>")'`. 브랜치 단위 `gh run list --branch` 는 **직전 SHA 의 run 을 보여주며 최신 SHA 에 run 이 없다는 사실을 가린다**.

④ **오진 배제 순서** — 이 순서로 확인하면 낭비가 없다: (a) 커밋이 origin 에 있나 (b) 변경 파일이 워크플로 `paths` 필터에 매치되나 (c) `concurrency` 취소인가 (d) **`mergeable`**. (a)~(c) 가 전부 정상인데 run 이 0이면 거의 항상 (d) 다.

⑤ **장기 트랙은 정기적으로 `origin/main` 을 병합**한다. 3트랙 병렬 운용에서는 다른 트랙이 머지될 때마다 충돌 가능성이 생기고, 특히 `DECISIONS.md`·`ROADMAP.md`·`MEMORY.md` 같은 **모든 PR 이 append 하는 문서**가 상습 충돌 지점이다([[feedback_continuous_docs_sync]] 의 부작용).

⑥ 같은 날 `#927`·`#934` 에서는 **stale 브랜치**(squash 머지로 ancestry 단절)가 같은 계열의 증상을 냈다. **"체크가 이상하면 브랜치 상태부터"** 가 공통 교훈이다. [[feedback_stacked_pr_ci_false_green]] [[feedback_reconvergence_before_merge]]
