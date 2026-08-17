---
name: feedback_stale_deployment_looks_like_defect
description: 🚨 라이브QA 전에 배포본 나이를 먼저 재라 — api-gateway 가 9일 낡아 main 의 라우트가 404 였고 제품 결함으로 오인할 뻔했다 (2026-07-31 #996)
metadata:
  type: feedback
---

# 🚨 낡은 배포본은 "없는 기능" 처럼 보인다 — 라이브QA 전에 **배포본 나이**를 재라

**2026-07-31 #996 실측.** 라이브QA 가 *"게이트웨이 경유 규칙 조회가 `404`"* 를 BLOCK 으로 냈다. 직결은 되는데 실 사용자 경로로는 안 되니 결함으로 보였다.

**그런데 라우트는 이미 `origin/main` 에 있었다.** `product-quantity-sync-rules-v1` 이 `#896 슬2` 에서 추가돼 있었고 설정 파일은 바꿀 것이 없었다.

```text
$ docker inspect -f '{{.Created}}' infrastructure-api-gateway
2026-07-22T16:17:50Z          ← 9일 전
```

**배포본이 9일 낡아, 그 사이 main 에 들어간 라우트가 살아 있는 게이트웨이에 없었다.**

PM 이 main 기준으로 재배포하자:

```text
2026-07-31T14:50:41Z
$ curl -o /dev/null -w "%{http_code}" ".../api/v1/quantity-sync-rules?..."
401                            ← 404(라우트 없음) → 401(도달, 인증 필요)
```

**Why:** 라이브QA 는 "실행해서 확인" 이 목적인데, **실행 대상이 무엇인지 확인하지 않으면** 낡은 코드의 동작을 현재 코드의 결함으로 기록한다. 그 결함을 고치려는 fix 라운드가 **고칠 것이 없는 코드를 건드리게** 되고, 실제로 이 트랙에서 그럴 뻔했다.

같은 날 `groupware_db` V14/`auth_db` V89(소스는 V18/V90)로 **머지된 기능이 없는 것처럼 보인** 사례도 있었다([[feedback_reconvergence_before_merge]] 계열).

**How to apply:**
- 🔑 **라이브QA 브리핑에 배포본 확인을 필수 항목으로 넣어라.**
  ```
  docker inspect -f '{{.Created}}' infrastructure-<service>
  ```
  생성 시각이 **오늘이 아니면** 그 서비스의 라이브 결과는 **현재 코드의 결과가 아니다.**
- **DB 마이그레이션 버전도 함께 확인하라** — `SELECT max(version::numeric) FROM flyway_schema_history WHERE success;`
- 라이브QA 가 *"없다 · 404 · 500"* 을 보고하면, **제품 결함으로 세기 전에** ① 배포본 나이 ② 소스에 실제로 있는지(`git show origin/main:<path>`) 를 먼저 확인하라.
- 배포 슬롯은 서비스 단위로 쪼개 배정할 수 있다(`--no-deps` 로 한 서비스만 재빌드). 다만 **`api-gateway` 는 전 트랙이 공유하는 단일 진입점**이라 재배포 시각을 PR 에 기록해, 그 시각 근처의 전이적 실패를 구분할 수 있게 하라.

## 🆕 2026-08-15 하룻밤에 **네 번** — 매번 다른 결함의 얼굴을 하고 나왔다

| # | 낡은 것 | 겉으로 보인 증상 | 무엇으로 파고들 뻔했나 |
|---|---|---|---|
| 1 | `api-gateway` (8/9 JAR) | `/app/notices/active` 401 → renderer 가 로그인 직후 로그아웃 | attestation 값 불일치 (두 라운드 낭비) |
| 2 | `auth-service` | `/auth/admin/menu-catalog` **500** `NoResourceFoundException` | 컨트롤러 경로 오타 |
| 3 | `slip-service` (V121/V122 반영 전) | `GET /slips` **500** `No enum constant DeliveryTag.SALE` | UI 셀렉터 문제 |
| 4 | 같은 `slip-service` 재배포 1차 | 위와 동일 | — (이번엔 바로 잡음) |

🔑 **네 번 다 "코드에 있는데 안 돈다" 인데, 증상은 401·500·`role=UNKNOWN` 으로 전부 달랐다.**
그래서 매번 다른 가설로 출발했고, 세 번은 엉뚱한 곳을 팠다.

### 무엇이 이걸 만들었나 — 스크립트가 아니라 **스크립트를 건너뛴 경로**

```text
redeploy-service.ps1 은 이미 옳았다
  bootJar → compose up --build --no-deps → health 검증
사고는 전부 그것을 우회했을 때 났다
  수동 docker compose up (--build 없음)
  redeploy-service.ps1 -SkipBuild
```

⟹ `-SkipBuild` 사용 시 **소스가 JAR 보다 최신이면 즉시 실패**하는 가드를 넣었다(계약 테스트 PASS).

### 적용 — 증상별로 이 가설을 **먼저** 세워라

```text
401 인데 자격 설정이 다 맞아 보인다        → 배포본 나이
500 인데 경로가 소스에 분명히 있다          → 배포본 나이
"No enum constant X"                       → 배포본 나이 + flyway 버전 (스키마가 코드보다 앞섰다)
"기능이 없는 것처럼 보인다"                 → 배포본 나이
🚩 컨테이너 안에서 직접 재라 — docker inspect 의 Created 는 이미지 시각이지 JAR 시각이 아니다
   docker exec <c> ls -l /app/app.jar     ← 워크트리 JAR 시각과 대조
```

🚨 **재배포는 반드시 `--build` 와 함께.** 빼면 이전 이미지가 그대로 뜨고, 그 순간부터 모든 관측이 거짓말이 된다.

## 🚨 2026-08-17 — **공유 컨테이너는 `main` 이미지다. 브랜치 신규 엔드포인트가 없는 게 정상이다**

PR #1271 라운드가 404 를 보고 *"라이브 캡처 불가"* 로 보고했다. **틀렸다.**

```text
브랜치에 있다   services/slip-service/.../SlipInternalController.java:449
                  @GetMapping("/inbound-lines")
                services/inventory-service/.../SlipServiceClient.java:78
                  return getSlips("inbound-lines", from, to)

공유 컨테이너   samhan-slip-service  image=infrastructure-slip-service
                Up 11 hours · created 2026-08-17 12:47   ← main 기준
⟹ 브랜치가 추가한 경로가 404 인 것이 당연하다
```

### 규칙

```text
🚨 브랜치가 추가한 엔드포인트는 **브랜치 JAR 로 띄운 서버**에서만 검증된다
🚫 공유 컨테이너를 브랜치 JAR 로 바꾸지 마라 — 병렬 트랙이 같이 쓴다. 바꾸면 그 트랙들이 오염된다
⟹ 격리로 별 포트에 띄우고 라운드 끝에 내린다

🚩 404 를 만나면 순서대로 물어라
   ① 브랜치 소스에 그 경로가 있는가        grep @GetMapping
   ② 내가 호출한 서버가 그 브랜치로 떠 있는가   ← 여기서 대부분 끝난다
   ③ 그래도 없으면 그때가 결함이다
```

🔑 **호출한 서버의 계보를 모르면 404 는 아무것도 증명하지 않는다.**

## 관련
[[feedback_parallel_backend_tracks_share_docker_stack]](이미지 태그·데몬·DB 는 전역) · [[feedback_pm_verify_what_measurement_proves]](이 측정이 증명하는 것을 진술하라) · [[feedback_unmerged_migration_blocks_other_tracks]] · [[feedback_compose_up_recreates_parent_containers]]
