---
name: feedback_cleanup_merged_worktrees_immediately
description: 🚨 머지·종료된 워크트리는 즉시 정리한다 — 다만 지우기 전에 산출물 회수부터 (2026-08-09 개발책임자 지시)
metadata:
  type: feedback
---

# 🚨 머지·종료된 워크트리는 **바로** 정리한다 (2026-08-09 개발책임자 지시)

> 그래 머지 종료된 워크트리는 바로 알아서 정리 좀 부탁해.

한 세션에 **36개**까지 쌓였다. 그중 25개가 이미 머지·종료된 PR 의 것이었다.

## 절차 — 순서를 지켜야 한다

```
1  머지·종료 확인      gh pr list --head <branch> --state all --json number,state
2  미커밋 산출물 확인   git -C <wt> status --porcelain | grep -v '^?? \.claude/'
3  🚨 회수             보고서·캡처를 main 에 넣는다 (아래 "무엇을 회수하나")
4  main 에 있는지 대조  git ls-tree -r origin/main --name-only | grep -c "^<경로>/"
5  제거                git worktree remove <path> --force
                       git branch -D <branch>   (worktree 가 잡고 있으면 먼저 제거)
6  git worktree prune
```

🚨 **정리 확인은 `git worktree list` 가 아니라 `ls -d .claude/worktrees/*/` 로 센다 — 두 수가 같아야 정리된 것이다.** `remove` 없이 `prune` 만 돌면 등록만 사라지고 디렉토리가 남아 `list` 에 안 보인다(2026-08-12 실측: 디렉토리 50 vs 등록 6 = 고아 44. 그 자리에 `worktree add` 하면 `fatal: already exists`).

🚨 **3~4번을 건너뛰면 증거가 영영 사라진다.** 머지된 PR 은 브랜치가 지워지면 복구 경로가 없고, *"그때 무엇을 확인하고 머지했나"* 를 물으면 그것뿐이다.

## 무엇을 회수하고 무엇을 두고 오나

```
✅ 회수   docs/dev-reports/*.md      검증 판정과 근거
✅ 회수   docs/qa-shots/** · *.png   실제로 본 화면
🚫 두고   playwright 드라이버 · *.mjs · spec.ts
```

🔑 **드라이버는 증거가 아니라 재현 편의다.** 그리고 회수하면 하네스 가드를 깬다 — 2026-08-09 에 `${BASE_URL}/경로` 하드코딩과 `resolveQaShotsDir` 미경유로 **main 이 실제로 red 가 됐다**. 자세히는 [[feedback_qa_harness_commit_breaks_ci]].

## 실측 — 제거는 느리다

각 워크트리가 `node_modules` 포함 전체 체크아웃이라 **하나에 수십 초** 걸린다. 25개를 한 번에 돌리면 2분 타임아웃에 걸린다.
⟹ `run_in_background: true` 로 돌리고 다른 일을 한다.

## 남기는 것

```
진행 중 트랙          PR 이 OPEN 이고 라운드가 도는 것
미머지 작업이 있는 것  브랜치에만 있고 main 에 없는 커밋 (지우면 잃는다)
진단·정찰용           지금 쓰고 있는 것
```

**Why:** 워크트리가 쌓이면 ①디스크를 먹고 ②`git worktree list` 가 길어져 상태 파악이 늦어지고 ③**빈 디렉터리 잔재가 남아 `git worktree add` 를 실패시키거나, 더 나쁘게는 `git checkout -B` 가 메인 체크아웃의 브랜치를 바꾼다**(2026-08-09 `tflaky` 에서 실측 — 워크트리가 아닌 평범한 빈 디렉터리였다).

관련: [[feedback_pm_copy_untracked_files]] · [[feedback_qa_harness_commit_breaks_ci]] · [[feedback_qa_processes_leak_and_starve_machine]]
