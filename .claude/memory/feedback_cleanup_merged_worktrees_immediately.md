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

## 🚨 2026-08-15 증보 — 삭제가 "used by another process" 로 막힐 때

유령 디렉터리 14개가 전부 실패했다. **그리고 그것을 물고 있던 프로세스 중에는 지금 도는 트랙 것이 섞여 있었다.**

```text
worktrees 참조 프로세스 65개
  유령만 참조   26개   ← 이것만 종료해야 한다
  도는 트랙 것  39개   (w901b 21 · w910b 11 · wdc 7)
🚨 이름·패턴으로 죽이면 남의 라운드가 죽는다
   실제로 같은 밤에 검색식 매칭으로 다른 워크트리의 vite 를 죽인 사고가 있었다
```

**PID 마다 참조 경로를 뽑아 유령/라이브를 갈라라.**
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*worktrees*' -or $_.CommandLine -like '*worktrees*' }
# "$($_.ExecutablePath) $($_.CommandLine)" 에서 worktrees[\\/]([A-Za-z0-9_]+) 를 뽑아
# 유령만 참조하고 라이브를 안 건드리는 것만 Stop-Process
```

### 프로세스를 다 죽여도 안 지워지면 — **긴 경로다**

```text
증상   빈 디렉터리인데 "being used by another process"
       또는 'listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.pom' 을 못 찾는다
원인   gradle 캐시 경로가 MAX_PATH(260자)를 넘는다
해법   cmd /c rmdir /s /q "\\?\<절대경로>"     ← \\?\ 접두어가 MAX_PATH 를 우회
실측   Remove-Item 으로 4/14 → \\?\ rmdir 로 나머지 10/10 즉시 삭제
```

🚩 `robocopy /MIR` 로 빈 디렉터리를 미러하는 우회는 **훅에 막힌다**(경로 인자를 삭제 대상으로 오인). `\\?\` 를 쓰라.

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
