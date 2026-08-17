---
name: feedback_recon_report_must_be_in_worktree
description: 🚨 정찰 보고서를 워크트리에 넣고 발주하라 — 본체에만 있으면 구현자가 못 읽고 중단한다 (2026-08-17 실측)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T14:15:32.160Z
---

# 🚨 정찰 보고서는 **그 워크트리 안에** 있어야 한다

## 무슨 일이 있었나 (2026-08-17)

정찰은 본체(`C:\dev\Samhan-Public`)에서 돌려 보고서를 `docs/dev-reports/` 에 저장했다. 구현은 워크트리에서 돈다.

```text
발주 브리핑   "docs/dev-reports/2026-08-17-uuid-exposure-recon/report.md 를 먼저 읽어라"
구현자        "이 워크트리에 그 파일이 없습니다"
              작업을 중단했다 — 옳은 판단이다
```

⟹ 목록 없이 UUID 를 제거하면 **쓰고 있는 것을 지운다.** 구현자가 멈춘 것이 맞다.

🚩 확인해 보니 **8개 워크트리 전부에 정찰 보고서가 0건**이었다. 다른 라운드들은 우연히 보고서를 안 봐도 되는 내용이었거나, 안 보고 진행했을 수 있다.

## 규칙

```text
발주 전에 정찰 보고서를 워크트리로 복사한다

  mkdir -p <워크트리>/docs/dev-reports/<보고서명>
  cp -r <본체>/docs/dev-reports/<보고서명>/. <워크트리>/docs/dev-reports/<보고서명>/

🚨 브리핑에서 "먼저 읽어라" 라고 지목한 파일은 전부 확인하라
   워크트리에 없으면 그 지시는 실행 불가다
```

## 왜 이런 일이 생기나

```text
정찰은 본체에서 돈다        읽기 전용이라 워크트리가 필요 없다
구현은 워크트리에서 돈다     격리가 필요하다
⟹ 두 산출물이 다른 곳에 있다
```

또한 워크트리는 **정찰 시점의 main 에서 갈라졌으므로** 그 뒤에 본체에 생긴 파일이 자동으로 따라오지 않는다.

## 대안 — 정찰도 워크트리에서 돌리기

```text
장점  보고서가 처음부터 그 자리에 있다
단점  정찰은 여러 트랙에 걸쳐 재사용되는 경우가 많다
      본체에 두면 다른 트랙도 참조할 수 있다

⟹ 본체에서 돌리되 발주 전에 복사하는 것이 현재 방식이다
```

**Why:** 브리핑이 참조하라고 한 파일이 없으면 구현자는 추측하거나 멈춘다. 추측하면 틀린 범위로 작업하고, 멈추면 라운드가 낭비된다.

**How to apply:** 워크트리 준비 절차에 넣어라 — `worktree add` → `.env.local` → `npm ci` → **정찰 보고서 복사** → PR 개설 → 발주. 관련 [[feedback_recon_before_every_track]] · [[feedback_new_worktree_needs_npm_ci]] · [[feedback_worktree_missing_gitignored_inputs]]
