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

## 관련
[[feedback_parallel_backend_tracks_share_docker_stack]](이미지 태그·데몬·DB 는 전역) · [[feedback_pm_verify_what_measurement_proves]](이 측정이 증명하는 것을 진술하라)
