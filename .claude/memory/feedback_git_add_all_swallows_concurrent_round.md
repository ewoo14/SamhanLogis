---
name: feedback_git_add_all_swallows_concurrent_round
description: 같은 워크트리에서 다른 codex 라운드가 돌고 있을 때 git add -A 로 커밋하면 그 라운드의 미완성 산출물까지 삼켜 커밋 메시지가 내용과 어긋난다 — 2026-07-29 #992 실측
metadata:
  type: feedback
---

# 병렬 라운드 중 `git add -A` 는 남의 산출물을 삼킨다 (2026-07-29 · #992)

PM 이 라이브QA 문서를 커밋했다.

```bash
git add -A && git commit -F ... # "docs(qa): #992 라이브QA R3·R4 ..."
```

그런데 **같은 워크트리에서 fix 라운드가 동시에 돌고 있었다.** 그 라운드가 방금 쓴
`index.html`(+6) 과 `legacyResponseContract.test.ts`(+56) 가 함께 커밋됐다.

```text
b8ebb3be8 docs(qa): #992 라이브QA R3·R4 — 409 는 화면에서 도달 불가 · 실패 경로는 정상 해제

 clients/web/order-app/index.html                   |   6 +-      ← 코드 변경
 .../src/__tests__/legacyResponseContract.test.ts   |  56 ++++++  ← 코드 변경
 docs/qa/992-partner-register-live/R3-REPORT.md     | 123 +++++
 ...
```

**커밋 메시지는 `docs(qa)` 인데 내용은 코드 변경이었다.** 기록이 거짓이 된다.

## 왜 놓치기 쉬운가

- `git status` 를 커밋 **직전에** 찍어도, codex 가 그 사이에 쓰면 소용없다
- PM 은 라운드 완료 **통지를 받기 전에** 커밋할 수 있다 — 통지는 codex 가 끝난 뒤에 온다
- 커밋은 성공하고 push 도 성공한다. **아무 에러가 없다**
- 트랙 하나에 codex 를 여러 개 돌릴수록 확률이 올라간다

## 어떻게 막나

1. **커밋 전에 `git status --porcelain` 을 찍고, 그 목록이 지금 커밋하려는 것과 일치하는지 눈으로 대조한다.** 모르는 파일이 있으면 멈춘다
2. 같은 워크트리에 라운드가 돌고 있으면 **`git add -A` 대신 경로를 명시**한다
   ```bash
   git add docs/qa/992-partner-register-live/   # 이번에 커밋할 것만
   ```
3. 이미 삼켰으면 **커밋 메시지를 실제 내용에 맞게 amend** 한다. 쪼개는 것보다 정확한 기록이 우선이고,
   feature 브랜치는 `--force-with-lease` 로 고칠 수 있다
4. 🔑 **트랙 하나에는 codex 하나** 가 원칙이다. 같은 워크트리에 둘을 돌려야 한다면
   한쪽은 **읽기 전용**(적대검증·정찰)이어야 한다

## 관련

- [[feedback_pm_copy_untracked_files]] — 반대 방향 실수. `git diff --name-only` 는 신규 파일을 **빠뜨린다**
- [[feedback_parallel_agent_gradle_shared_tree_contention]] — 같은 트리를 여럿이 쓸 때의 다른 경합
