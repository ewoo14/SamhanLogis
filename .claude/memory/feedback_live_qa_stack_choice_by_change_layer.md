---
name: feedback_live_qa_stack_choice_by_change_layer
description: "🚨 라이브QA 스택 선택은 \"무엇이 바뀌었나\"로 정한다 — 백엔드가 바뀐 트랙을 공유 스택(main 기반)으로 QA 하면 그 변경이 없어 계속 막힌다 (2026-08-17 실측)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T04:00:49.933Z
---

# 🚨 라이브 QA 스택은 **변경 계층**으로 고른다

```text
프론트만 바뀐 트랙    공유 스택으로 충분 — 백엔드는 main 이면 된다
백엔드가 바뀐 트랙    그 브랜치로 빌드한 격리 스택이 필요하다
                      공유 스택은 origin/main 기반이라 그 변경이 없다
```

## 실측 (2026-08-17 · D-02 일마감 회계전표)

브랜치가 slip-service 응답을 확장했다 — `slipNo · partnerId · productCode · sourceLineNo · taxType`.

PM 이 *"401 이 풀렸으니 공유 스택으로 라이브 QA 하라"* 고 지시했고, 구현자는 **버튼이 disabled** 인 상태만 확인하고 끝났다. 공유 slip-service 에 그 필드가 없으니 당연했다.

⟹ 구현자가 임의값으로 우회하지 않은 것은 **옳은 판단**이다. PM 브리핑이 틀렸다.

## 헷갈린 이유

같은 날 별개의 문제가 겹쳤다.

```text
문제 A  공유 스택 인증 401
        원인: 8일 묵은 gateway JAR (attestation 주입 코드 부재)
        조치: bootJar 재빌드 + up -d --build + --force-recreate
        ⟹ 해결됨

문제 B  브랜치 백엔드 변경이 공유 스택에 없음
        A 를 해결하고 "이제 공유 스택으로 다 된다" 고 착각했다
        ⟹ 별개의 문제다
```

🔑 **인증이 뚫린 것과 그 브랜치 코드가 도는 것은 다른 명제다.**

## 발주 전 체크

```text
이 브랜치의 diff 에 services/ 아래 변경이 있는가
  있다  → 격리 스택 (그 서비스만 브랜치 빌드해도 된다)
  없다  → 공유 스택

격리 스택을 쓸 때
  ./gradlew :services:<이름>:bootJar 를 먼저 돌린다
    🚨 docker build --no-cache 만으로는 JAR 가 안 바뀐다 → [[feedback_docker_build_copies_stale_jar]]
  포트 8088 은 influxd 가 잡고 있다 — slip 은 docker-compose.slip-port-override.yml 필요
  검증 후 격리 컨테이너를 반드시 회수한다
  🚫 공유 스택 컨테이너를 내리거나 바꾸지 마라 — 개발책임자가 쓰는 화면이다
```

**Why:** 공유 스택은 개발책임자의 실사용 환경이자 main 의 거울이다. 미머지 브랜치를 거기에 올릴 수 없으므로, 브랜치 백엔드를 검증하려면 격리가 유일한 길이다.

**How to apply:** 라이브 QA 브리핑을 쓸 때 **먼저 `git diff origin/main...HEAD --stat` 로 services/ 변경 유무를 확인**하고 스택을 지정하라. 관련 [[feedback_docker_build_copies_stale_jar]] · [[feedback_qa_docker_real_test]] · [[feedback_parallel_backend_tracks_share_docker_stack]]
