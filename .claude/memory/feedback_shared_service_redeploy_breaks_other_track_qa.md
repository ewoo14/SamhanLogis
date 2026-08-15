---
name: feedback-shared-service-redeploy-breaks-other-track-qa
description: 병렬 트랙이 같은 서비스를 건드리면 재배포가 다른 트랙의 라이브QA 를 조용히 깨뜨린다 — 가짜 결함이 나온다
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-15T19:25:42.721Z
---

2026-08-15~16 실측. **PM 이 같은 밤에 네 번 겪었다.**

```text
slip-service          #1218(w901b) 로 배포 → #1219 의 daily-closing 라우트가 없어 500
                      #1225(winb) 로 배포 → 또 없어서 500
                      #1219(wdc) 로 배포 → 그제서야 200
notification-service  #1218(w901b) 로 배포 → #1224 의 PartnerLinkStatus 가 빠져
                      "모호 · 후보 여러 건" 대신 "아직 거래처 미연결" 이 뜸
partner-order-service #1223 로 배포 전에는 거래처가 코드로 보임
```

**Why:** 공유 스택은 서비스당 컨테이너가 하나다. 어느 브랜치로 빌드하든 **그 브랜치의 코드만** 들어간다.
다른 트랙이 같은 서비스에 기능을 더했으면 그건 없다.
그런데 화면은 정상처럼 뜨고 **없는 기능이 "결함" 으로 보인다.**

실제 비용: 검증자가 두 번 500 을 보고했고, 한 번은 "jar 에 클래스가 없다" 는 오진단까지 갔다.
fix 라운드가 데이터로 성립하지 않는 것을 만들 뻔했다.

**How to apply:**

- 라이브QA 브리핑 맨 앞에 **"배포본이 이 HEAD 를 반영하는가"** 를 넣는다 — 화면을 보기 전에
- 재배포 전에 **그 서비스를 건드리는 다른 트랙이 있는지** 먼저 본다
  ```bash
  git branch --format='%(refname:short)' | while read b; do
    git diff --name-only origin/main.."$b" -- services/<svc> | head -1
  done
  ```
- 겹치면 **한 트랙씩 검증한다.** 배포 → 검증 → 다음 트랙 배포 → 검증
- 배포본 확인은 클래스 존재가 아니라 **그 기능의 문자열**로 한다
  ```bash
  docker exec <c> sh -c "unzip -p app.jar BOOT-INF/classes/<Path>.class | strings | grep -c '<mapping>'"
  ```
  🔑 `jar tf` 의 빈 출력을 "클래스 없음" 으로 읽은 오진단이 실제로 있었다
- 근본 해소는 **겹치는 트랙을 먼저 머지**하는 것이다. main 에 들어가면 모두가 물어 간다
- 🆕 **머지했다고 끝이 아니다.** 2026-08-16 실측 — 네 건을 머지한 뒤 main 소스는 깨끗했는데
  **컨테이너 8개가 옛 브랜치 빌드**라 없는 URL 이 실제로 500 을 줬다.
  ```text
  main 소스   14 서비스 빌드 성공 · 마이그레이션 456/456 · 교차 충돌 0
  배포본      auth·dashboard·inventory·notification·partner·product·slip 500
  ```
  ⟹ **머지 뒤에는 통합 건강 점검을 돌리고 미반영 서비스를 main 으로 재배포하라.**
  PR 별 CI 는 각자 base 에서 통과한 것이라 합쳐진 상태를 아무도 안 본다.
  확인은 marker 문자열로: `unzip -p app.jar <Class>.class | strings | grep -c <메서드명>`

관련: [[feedback_stale_deployment_looks_like_defect]] · [[feedback_parallel_backend_tracks_share_docker_stack]] ·
[[feedback_permission_denied_may_be_401_from_auth]]
