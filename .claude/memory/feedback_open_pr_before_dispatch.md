---
name: feedback_open_pr_before_dispatch
description: "🚨 PR 을 먼저 열고 라운드를 발주한다 — PR 없이 돌리면 \"PM 이 나중에 게시\" 가 되고 실제로 빠진다 (2026-08-17 실측)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T08:19:04.082Z
---

# 🚨 **PR 을 먼저 열고** 라운드를 발주한다

> 2026-08-17 개발책임자: *"**게시는 항상 했지?**"*

## 실측 — 빠져 있었다

```text
PR #1241   코멘트 50건   ✅ 라운드마다 게시
PR #1260   코멘트  9건   ✅
PR #1261   코멘트  6건   ✅

PR #1262   코멘트  0건   ❌
PR #1263   코멘트  0건   ❌
PR #1264   코멘트  1건   ⚠️ 자동 코멘트뿐
```

## 원인

PR 이 없는 상태에서 라운드를 돌리고 브리핑에 이렇게 적었다.

```text
🚫 PR 이 아직 없으니 게시는 하지 마라. PM 이 PR 을 열고 게시한다
```

⟹ 구현자는 지시를 지켰다. **PM 이 PR 을 연 뒤 게시를 잊었다.** 보고서는 저장소에 다 있는데 PR 에서는 안 보인다.

## 규칙

```text
① 워크트리를 만들면 PR 을 먼저 연다
     빈 커밋이나 계획 문서 한 장으로 draft 가 아닌 OPEN PR 을 만든다
     → 이후 모든 라운드가 그 PR 에 직접 게시한다

② 그래도 PR 없이 돌려야 하면
     PR 을 여는 즉시 그동안의 보고서를 전부 게시한다
     🚨 PR 본문에 요약을 넣는 것으로 갈음하지 마라 — 라운드 보고서는 따로다

③ PR 을 열 때마다 코멘트 수를 확인한다
     gh pr view <번호> --json comments --jq '.comments | length'
     0 이면 밀린 게시가 있다는 뜻이다
```

## Why

**실행 = 게시 1:1** 은 이 저장소의 규약이다. 게시가 빠지면 개발책임자가 진행을 확인할 방법이 저장소 파일을 직접 여는 것뿐이고, 그건 PR 을 보는 것보다 훨씬 번거롭다. 또한 나중에 "왜 이렇게 고쳤나" 를 추적할 때 PR 타임라인이 정본이다.

**How to apply:** 워크트리 생성 직후 순서를 고정하라 — `worktree add` → `.env.local` 복사 → `npm ci` → **PR 개설** → 브리핑 발주. 관련 [[feedback_review_post_one_to_one_enforcement]] · [[feedback_new_worktree_needs_npm_ci]] · [[feedback_pr_open_not_draft]]
