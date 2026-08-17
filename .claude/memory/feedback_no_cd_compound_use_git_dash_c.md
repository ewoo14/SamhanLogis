---
name: feedback_no_cd_compound_use_git_dash_c
description: 🚨 `cd <경로> && <쓰기명령>` 은 모드와 무관하게 항상 권한창을 띄운다 — `git -C` 와 절대경로를 쓸 것 (2026-08-18 개발책임자 지적)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
---

# 🚨 `cd … && …` 복합 명령 금지 — **`git -C` 와 절대경로**

> 2026-08-18 개발책임자: *"bash 권한요청 없애려면 어떻게 해야할까?"* → 모드를 `dontAsk` 로 바꿨는데도 *"계속 뜨는데??"*

## 원인 — 분류기가 아니라 **별도 안전 게이트**다

권한창 원문:

```text
This command changes directory before running git, which can execute untrusted
hooks from the target directory. … On Windows with Git Bash, the final working
directory of this cd-compound cannot be statically determined, so relative write
targets cannot be checked for Cygwin-emulated symlinks and
🚨 this request cannot be delegated to the auto-approval classifier.
```

```text
permissions.defaultMode = dontAsk   ← 이걸로도 안 없어진다
auto 모드 분류기                     ← 이것과도 다른 층이다
⟹ cd 복합은 정적 판정이 불가능해서 위임 자체가 안 된다
```

## 규칙

```bash
🚫  cd /path/to/wt && git add -A
✅  git -C /path/to/wt add -A

🚫  cd /path/to/wt && rm -f docs/qa/*.log
✅  rm -f /path/to/wt/docs/qa/*.log

🚫  cd /path/to/wt && git commit -F - <<'EOF' … EOF
✅  git -C /path/to/wt commit -F - <<'EOF' … EOF
```

🚨 **읽기만 하는 `cd A && ls` 도 되도록 피하라.** 쓰기가 섞이는 순간 걸린다.
🚨 `git` 외 도구도 절대경로로: `python -c "open(r'C:\dev\…')"` · `docker … -v /abs:/abs`.

## 왜 우리가 특히 자주 걸리나

```text
워크트리를 9개 이상 동시에 운용한다
  wcat · wsrd · wmask · wdcp · wdc02 · wslip · wdps · wd03 · wuuid · wp2
⟹ 매 명령마다 cd 를 붙이는 습관이 생긴다
⟹ 야간 자율 진행 중 개발책임자가 원격이면 승인창을 볼 사람이 없다
```

🔑 **원격 세션에서 승인창은 곧 정지다.** 개발책임자가 *"이제 나 직접 파워쉘 못하므로 주의해"* 라고 못박은 조건에서, 물어보는 명령을 쓰는 것 자체가 진행을 멈추는 일이다.

## 곁가지 — Windows 경로 함정

Git Bash 경로를 Windows 프로그램에 그대로 넘기면 안 된다.

```bash
🚫  python -c "open('/c/dev/Samhan-Public/…')"      FileNotFoundError
✅  python -c "open(r'C:\dev\Samhan-Public\…')"
```

**Why:** 모드를 아무리 열어도 이 게이트는 안 열린다. 설정으로 풀 수 없는 것을 설정으로 풀려 하면 시간만 버리고, 그 사이 라운드가 멈춘다.

**How to apply:** 워크트리를 대상으로 하는 모든 명령은 `git -C <절대경로>` 또는 대상 절대경로로 쓴다. 관련 [[feedback_git_worktree_cwd_use_dash_c]] · [[feedback_monitor_no_permission]] · [[feedback_powershell_utf8_writes]]
