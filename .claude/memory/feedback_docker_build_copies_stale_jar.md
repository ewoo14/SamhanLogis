---
name: feedback_docker_build_copies_stale_jar
description: "🚨🚨 docker compose build --no-cache 는 Gradle 을 돌리지 않는다 — Dockerfile 이 build/libs 의 낡은 JAR 를 그대로 복사해 \"최신 소스로 재배포했다\" 가 거짓이 된다 (2026-08-17 실측)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T03:42:15.582Z
---

# 🚨🚨 `docker compose build --no-cache` 는 **소스를 다시 컴파일하지 않는다**

## 실측 (2026-08-17)

```text
증상   공유 스택에서 인증이 필요한 API 호출이 전부 401
       로그인만 200 · 토큰 발급 정상 · JWT 검증도 통과

원인   11:02 에 --no-cache 로 재빌드한 gateway 이미지가
       2026-08-08/09 자 build/libs/api-gateway.jar 를 그대로 복사했다
       (JAR 파일 타임스탬프 Aug 9 01:38 · 8일 묵음)

       구형 JAR 에는 gateway attestation 주입 코드가 없다
       ⟹ 다운스트림의 HeaderAuthenticationFilter 가 fail-closed 401

재현   토큰만                    401 / 0 bytes
       토큰 + 유효 attestation   200 / 31,708 bytes
```

🔑 `infrastructure/docker/spring-service.Dockerfile` 은 **미리 빌드된 JAR 를 COPY** 한다.
`--no-cache` 는 Docker 레이어 캐시만 무효화하고 **Gradle 을 실행하지 않는다.**

## 규칙

```text
서비스 재배포 = ① Gradle bootJar  ② docker build  ③ up -d

  ./gradlew :services:<이름>:bootJar
  docker compose --env-file infrastructure/.env.local \
    -f infrastructure/docker-compose.yml \
    -f infrastructure/docker-compose.local-all.yml \
    up -d --build <이름>

🚨 ① 을 빼면 "최신 소스로 재배포했다" 는 거짓이 된다
🚨 재배포 후 반드시 JAR 타임스탬프를 확인하라
   ls -la services/<이름>/build/libs/*.jar
```

## PM 이 이 건에서 네 번 헛짚었다

```text
① 자격 회전 여파       자격 파일 6곳 전부 동일 (md5 5f83a4a8)        → 아님
② JWT 시크릿 불일치    SAMHAN_JWT_SECRET 15개 컨테이너 지문 동일     → 아님
③ Eureka 미등록        15개 등록 확인                                 → 아님
④ 라우트별 secret 오버라이드
   PR #1248 이 /auth/admin/menu-catalog 의
   secret: ${SAMHAN_AROLOGIS_JWT_SECRET:} 를 제거하고 머지됐다
   재배포했는데도 401 이 그대로였다                                  → 배포가 안 된 것이었다
```

🔑 **④ 에서 "고쳤는데 안 낫는다" 가 나왔을 때 배포를 의심했어야 했다.**
코드가 고쳐졌는데 증상이 그대로면, 그 코드가 실제로 도는지부터 확인한다.

## 함께 기억할 것

- `logging-service` 는 `profiles: [logging]` 이라 `up -d` 에서 빠진다 — `--profile logging` 필요
- `slip-service` 는 포트 8088 을 influxd 가 잡아 `docker-compose.slip-port-override.yml` 이 필요하다
- compose 조합은 `docker-compose.yml` + `docker-compose.local-all.yml` 이 정본이고 `--env-file infrastructure/.env.local` 이 있어야 한다 (`scripts/launch-local-stack.ps1:50-51,147`)

**Why:** 빌드 산출물이 저장소 트리에 남아 있고 Dockerfile 이 그것을 복사하므로, 컨테이너 나이와 코드 나이가 따로 논다. 컨테이너가 방금 떴다고 코드가 최신인 것이 아니다.

**How to apply:** *"최신 소스로 재배포했다"* 고 적기 전에 **JAR 타임스탬프**를 확인하라. 관련 [[feedback_stale_deployment_looks_like_defect]] · [[feedback_client_bundle_is_also_a_deployment]]
