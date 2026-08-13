---
name: feedback_docker_build_does_not_run_gradle
description: 🚨 `docker compose --build` 는 Gradle 을 돌리지 않는다 — 기존 build/libs/*.jar 를 복사만 한다. 컨테이너를 재생성해도 코드가 안 바뀌고, 그게 "없는 결함" 처럼 보인다 (2026-08-13 하루 3회)
metadata:
  type: feedback
---

# 🚨 컨테이너를 재빌드해도 **코드가 안 바뀐다**

`infrastructure/docker-compose.local-all.yml` 의 서비스 build 정의는 이렇다.

```yaml
dashboard-service:
  build:
    <<: *spring-build
    args:
      JAR_FILE: services/dashboard-service/build/libs/dashboard-service.jar
```

⟹ **Dockerfile 이 이미 빌드된 jar 를 복사한다.** `docker compose up -d --build` 는 **Gradle 을 돌리지 않는다.**

## 2026-08-13 실측 — 하루에 세 번 헤맸다

```
groupware-service
  Docker image created   2026-08-13T13:10:21Z   ← 방금 만든 이미지
  host groupware JAR     2026-07-23T19:12:22    ← 3주 전 jar 가 그대로 들어갔다
  CHAT_CONTROLLER_COUNT=0 · V20_COUNT=0 · V21_COUNT=0
```

### 그날의 증상 셋 — 전부 "코드 결함" 처럼 보였다

```
① 사내 메신저   "버전 정책을 확인하지 못했습니다"
                 → INTERNAL_CHAT_DESKTOP 400. Java enum 에는 있는데 배포본엔 없었다
                    (Flyway 이력이 V7 에서 멈춤 — V8 미적용)
② #1201 QA     GET /admin/groupware/chat/rooms → 500 NoResourceFoundException
                 PM 이 컨테이너를 재생성했는데도 그대로 500
③ #1181 정찰    "8개 앱 /app/version 404"
                 → 신선 빌드 후 다시 재니 9개 전부 200. 404 는 낡은 배포본 탓이었다
```

🔑 ③이 특히 위험하다. **정찰 보고서에 "404" 가 실측으로 박제됐고**, 그 위에서 판단이 쌓였다. 배포본 나이를 안 쟀으면 없는 결함을 고쳤을 것이다.

## 🔑 판별법

```
docker inspect <container> --format '{{.Created}}'     ← 컨테이너 생성 시각 (믿지 마라)
ls -la services/<svc>/build/libs/<svc>.jar             ← 🚨 이게 진짜 배포된 코드다
```

**둘이 어긋나면 jar 가 낡은 것이다.** 컨테이너 시각은 새것인데 기능이 없으면 100% 이것이다.

더 확실한 방법 — jar 안을 직접 세라.

```bash
unzip -l services/<svc>/build/libs/<svc>.jar | grep -c "<새로 추가된 클래스>"
unzip -l services/<svc>/build/libs/<svc>.jar | grep -c "V<번호>__"
```

## How to apply

**Gradle 을 먼저 돌린 뒤 compose 를 돌린다.** 순서를 손으로 기억하지 말고 스크립트를 써라.

```powershell
.\scripts\redeploy-service.ps1 groupware-service
.\scripts\redeploy-service.ps1 dashboard-service,accounting-service
```

🚨 라이브QA 브리핑에는 **"배포본 나이를 재라"** 를 항상 넣는다 → [[feedback_stale_deployment_looks_like_defect]] · [[feedback_client_bundle_is_also_a_deployment]]
그리고 검증자가 *"기능이 없다"* 고 보고하면 **결함으로 세기 전에 jar 나이부터 물어라.**

**Why:** 이 저장소는 *"낡은 배포본은 없는 기능처럼 보인다"* 를 이미 두 번 박제했는데, 둘 다 **"컨테이너를 새로 만들면 새 코드"** 라는 전제 위에 있었다. 그 전제가 틀렸다는 것이 이번에 확정됐다. 컨테이너를 재생성해도 jar 가 그대로면 아무것도 안 바뀐다.

관련: [[feedback_stale_deployment_looks_like_defect]] · [[feedback_client_bundle_is_also_a_deployment]] · [[project_local_stack_qa_gotchas]] · [[feedback_qa_environment_verification_first]]
