---
name: feedback-git-worktree-cwd-use-dash-c
description: 상대경로 git worktree add 는 셸 cwd 를 타서 엉뚱한 곳에 워크트리를 만든다 — 경로 인자를 쓰는 git 은 항상 -C 로 고정 (2026-07-29 cwd 착오 3회째)
metadata:
  type: feedback
---

# 🚨 `git worktree add` 는 셸 cwd 를 탄다 — `git -C` 로 고정하라

**2026-07-29 실측 (cwd 착오 누적 3회째).** 셸 cwd 가 `clients/web/order-app` 인 상태에서

```bash
git worktree add ".claude/worktrees/t14-partner-onboarding" ...
```

를 실행해 워크트리가 **`clients/web/order-app/.claude/worktrees/t14-partner-onboarding`** 에 생성됐다. 전체 체크아웃 13,480 파일이 **소스 디렉토리 안에** 들어갔다.

## 왜 늦게 발견되는가

`git worktree add` 는 **성공**한다. 실패 신호가 없다. 드러난 것은 그 다음이었다.

```bash
$ git -C "D:/dev/.../worktrees/t14-partner-onboarding" add docs/...
The following paths are ignored by one of your .gitignore files:
.claude/worktrees
```

`git -C <의도한 경로>` 가 **메인 repo 를 toplevel 로** 반환하는 것이 결정적 증거였다.

```bash
$ git -C "$W" rev-parse --show-toplevel
D:/dev/Samhan-Public          # ← 워크트리가 아니다
```

## 왜 위험한가

`clients/web/order-app` 은 **다른 트랙이 vitest·vite 를 돌리는 디렉토리**다. 그대로 뒀으면 테스트 스캔이 13,480 파일을 훑거나 중복 모듈을 잡을 수 있었다. `.claude/worktrees` 가 gitignore 라 **`git status` 에도 안 보인다.**

## 적용

- **경로 인자를 받는 git 명령은 항상 `git -C <절대경로>`** 로 쓴다. `cd A && git ...` 는 앞 명령의 cwd 잔재를 탄다 (Bash 도구는 cwd 가 호출 간 유지된다).
- `git worktree add` 직후 **반드시 검증**한다:
  ```bash
  git -C "$W" rev-parse --show-toplevel   # $W 와 같아야 한다
  ```
  이 한 줄이 없으면 다음 커밋에서야 안다.
- 잘못 만들었으면 `git worktree remove --force <잘못된 경로>` 후 **잔재 디렉토리도 지우고**(`.git` 파일만 지워선 안 된다) `git worktree prune` 한 뒤 재생성한다.
- 체크아웃 파일 수를 로그로 확인한다 — 다른 워크트리와 자릿수가 다르면 불완전 체크아웃 신호다.

관련: [[feedback_worktree_missing_gitignored_inputs]] · [[feedback_check_tracked_before_delete]]
