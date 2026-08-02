---
name: feedback_merge_conflict_resolution_is_a_fix
description: 🚨 머지 충돌 해소는 fix 다 — RED-first·재수렴 대상. git 이 충돌로 표시하지 않는 의미 충돌이 따로 있다 (2026-08-01 #991↔#1003)
metadata:
  type: feedback
---

# 🚨 머지 충돌 해소는 **fix 다** — 그런데 fix 로 취급하지 않는다

**2026-08-01 #991 실측.** `origin/main` 을 머지하며 충돌을 풀고 커밋했다. 그것을 **정리 작업**으로 보고 RED-first 도, 재수렴도, 리뷰 라운드도 없이 넘겼다.

**CI 가 잡았다.** 82건 중 2건이 `409` 로 떨어졌고, 그 둘은 방금 머지해 들어온 #1003 의 계약(*"배포 전 발급된 멱등 키로 재시도하면 정상 replay"*)이었다.

```text
SlipPublishControllerIT.배포전_단건멱등키…replay한다   AssertionError: expected:<200> but was:<409>
SlipPublishMergeIT.배포전_병합멱등키…replay한다        AssertionError: expected:<200> but was:<409>
```

## 🔑 git 이 충돌로 표시하지 않는 충돌이 있다

두 PR 은 **서로 다른 파일**을 건드렸다.

```text
#1003  배포 전 멱등 키 replay 계약   (legacy 지문 = 그 시점 필드 구성을 재현)
#991   PublishLineRequest 에 categoryKey 추가

→ legacy 지문에 categoryKey 가 섞여 배포 전 키 재시도가 409
```

**텍스트 충돌이 없었고, 컴파일도 인자 수만 맞추면 통과했다.** 실행해야 드러났다.

**Why:** 병렬 트랙의 위험은 *"같은 줄을 고쳤나"* 가 아니라 *"같은 계약을 건드렸나"* 다. 후자는 도구가 알려주지 않는다.

## How to apply

- **머지 커밋도 fix 라운드로 돌려라** — 충돌을 풀었으면 그 표면에 대해 **양쪽 PR 의 테스트를 다 실행**하고, 로컬에서 못 돌리면 **CI 결과를 기다린 뒤에** 다음 단계로 간다.
- 🔑 **로컬 단위 테스트 통과를 근거로 삼지 마라.** #991 에서 `SlipPublishFingerprintTest` 6건이 종료코드 0 이었지만 **그 테스트는 문제의 경로를 지나지 않았다.**
- 충돌 해소 커밋 메시지에 **무엇을 어떤 근거로 골랐는지** 적어라. 의미 충돌은 나중에 읽으면 복원이 안 된다.
- 같은 표면을 건드리는 PR 두 개가 열려 있으면 **먼저 머지되는 쪽이 정한 계약**을 뒤에 오는 쪽 브리핑에 명시하라.

## 관련
[[feedback_fix_blocks_normal_path]](이 사건의 두 라운드 모두 정상 경로 차단이었다) · [[feedback_reconvergence_before_merge]](fix 는 새 표면을 만든다) · [[feedback_parallel_backend_tracks_share_docker_stack]]
