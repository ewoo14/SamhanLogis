---
name: feedback_merge_main_into_worktree_regularly
description: 🚨 병렬 트랙에서는 워크트리에 main 을 자주 머지해라 — 안 하면 남이 고친 실패를 내 CI 가 계속 맞고, 원인이 내 브랜치에서는 아예 안 보인다 (2026-08-15 개발책임자 지시 · 실측 4건)
metadata:
  type: feedback
---

# 🚨 병렬 트랙 = **워크트리에 main 을 자주 머지한다**

2026-08-15 개발책임자 지시:

> *"병렬 진행이다보니 워크트리의 main 병합이 중요한거 같아."*

같은 밤 실측 4건이 전부 이것이었다.

## 실측

```text
#1210  브랜치가 main 보다 9 커밋 뒤
       CI 를 막던 messenger-ui-v2.test.tsx 가 브랜치에 아예 없었다
       🔑 CI 는 브랜치+main 머지 결과에서 돈다
          그래서 "브랜치를 아무리 뒤져도 원인이 안 보이는" 상태가 됐다
       ⟹ main 을 머지한 뒤에야 고칠 대상이 보였다

#1216  Internal Chat Desktop 실패 → main 머지로 소멸
#1218  Internal Chat Desktop 실패 → main 머지로 소멸
#1217  carrier-list-page · DocumentRenderer.image-* 실패
       main 은 같은 시각 CI success
       ⟹ 브랜치가 뒤였던 것
```

🔑 **남이 고친 것을 내가 계속 맞는다.** 그리고 그 실패는 **내 변경과 무관한 얼굴**로 나타나서, 내 코드를 파게 만든다.

## 왜 병렬에서 특히 심한가

```text
트랙이 5~6개면 main 이 하루에도 여러 번 움직인다
각 트랙은 자기 워크트리만 본다
⟹ 뒤처진 거리가 트랙마다 다르고, 그만큼 다른 실패를 맞는다
   같은 실패를 여러 트랙이 각자 디버깅하는 낭비가 생긴다
```

## How to apply

```text
① 라운드를 발주하기 전에 PM 이 워크트리에 origin/main 을 머지한다
   특히 CI 실패를 보면 "브랜치가 뒤인가" 를 첫 가설로 세워라
     git -C <worktree> log --oneline HEAD..origin/main | wc -l
② 실패가 내 변경과 무관해 보이면 main 에서 같은 테스트가 통과하는지 먼저 봐라
     gh run list --branch main --workflow ci.yml --limit 1
   main 이 green 이면 그건 내 결함이 아니라 뒤처짐이다
③ 다른 트랙이 머지되면 그 시점에 열린 워크트리 전부에 main 을 돌린다
```

## 🚨 다만 — **에이전트가 도는 워크트리에 머지하지 마라**

같은 밤 실측: 실행 중인 codex 가 있는 워크트리에 머지했더니 **충돌 마커가 있는 파일을 그 에이전트가 읽었다.**
렌더러가 500 이 났고, 에이전트는 그것을 자기 결함으로 조사하기 시작했다.

```text
✅ 머지 전에 그 워크트리에 도는 작업이 있는지 확인한다
✅ 있으면 라운드가 끝난 뒤에 머지한다
🚩 이미 머지해 충돌이 났고 에이전트가 돌고 있으면 git merge --abort 로 되돌려라
   충돌 마커가 있는 상태로 작업하면 그 자체가 새 결함을 만든다
```

🚩 **충돌 해소는 fix 다.** 한쪽을 고르지 말고 양쪽이 지키려던 것을 파일별로 밝혀라
→ [[feedback_merge_conflict_resolution_is_a_fix]]

관련: [[feedback_pr_conflict_blocks_all_workflows]](충돌이면 워크플로가 아예 안 생성된다) ·
[[feedback_parallel_backend_tracks_share_docker_stack]] · [[feedback_stale_deployment_looks_like_defect]] ·
[[feedback_unmerged_migration_blocks_other_tracks]]
