# PR #1119 / Issue #1113 — S18 SOL 재수렴

## 판정

**S16의 resolver BLOCKER 2건은 모두 닫혔다. S17 변경 표면의 도달 결함은 0건이다.**

검증 HEAD는 `cd4fa592c79c5fd1d78d0346fc8012ee01585d92`였다. Windows PowerShell 5.1에서 S16의 주 경로 4종을 그대로 재실행했고, Dockerless 조건은 Docker daemon을 중지하지 않고 존재하지 않는 `DOCKER_HOST` pipe로 격리했다. 공유 Docker stack은 재기동·재생성·중지하지 않았다.

주 경로 중 정상 실행을 거짓으로 막은 경로는 **0개**다. 세 경로의 nonzero는 개발책임자가 판정에서 제외하도록 지정한 선재·별건 원인뿐이었고, 그 외 nonzero 원인은 없었다.

이 판정은 S17이 고친 resolver 두 BLOCKER와 요청된 신규 표면에 대한 것이다. S16의 나머지 별도 지적을 재판정하거나 소거하는 판정은 아니다.

## S16 주 경로 4종 재실행

| 실제 경로 | exit | 도달 결과 | 이번 PR 결함 여부 |
|---|---:|---|---|
| `start-local-full.ps1 -SkipDocker -SkipServices -SkipPortCheck` | 0 | 15/15 health UP, slip `18086`, partner-order `18088`, seed row count 전부 OK | 없음 |
| `run-smoke-tests.ps1` | 1 | 15/15 health UP, endpoint 7/8; 유일 실패는 제외 대상 inventory `/balances` 업무 404 | 없음 |
| `seed-local-stack.ps1 -SkipReimport` | 1 | gateway/auth/accounting health까지 도달 후 제외 대상 seed QA 자격 400 | 없음 |
| `run-load-test.ps1 -Profile smoke` | 1 | k6 exit 99; 제외 대상 `http_req_failed=1.27%`(4/313) threshold | 없음 |

S16에서 resolver 오판으로 막혔던 두 실제 경로는 다음과 같이 재수렴했다.

- `start-local-full`: slip `8186 DOWN`이 사라지고 `18086 UP`, 전체 15/15 UP, exit 0.
- `run-smoke-tests`: slip/partner-order 모두 실제 publish 포트에서 UP. exit 1의 유일 원인은 선재 inventory 업무 404다.

따라서 요청된 세 제외 원인과 그 외 원인을 분리하면 다음과 같다.

| nonzero 원인 | 분류 |
|---|---|
| inventory `/balances` 업무 404 | 요청상 판정 제외 |
| seed QA 자격 400 | 요청상 판정 제외 |
| k6 `http_req_failed=1.27%` | 요청상 판정 제외 |
| 그 외 원인 | **0건** |

## BLOCKER 1 — Docker publish 우선순위 재판정

현재 shell에는 `SAMHAN_SLIP_PORT=8186`이 남아 있고 live Docker publish는 `18086 -> 8086`이다. 동일 shell에서 resolver를 직접 실행한 결과는 다음과 같았다.

```text
LIVE_STALE_SLIP=18086
```

실제 소비자 두 경로도 slip을 `18086 UP`으로 판정했다. 따라서 S16의 환경변수 선점으로 인한 정상 경로 오차단은 닫혔다.

## BLOCKER 2 — Dockerless 3-file 합성 재판정

환경변수 override를 모두 제거하고 `DOCKER_HOST=npipe:////./pipe/samhan-s18-no-engine`로 둔 뒤, resolver 16개와 다음 실제 compose 합성 결과를 독립 대조했다.

```text
infrastructure/docker-compose.yml
infrastructure/docker-compose.local-all.yml
infrastructure/docker-compose.slip-port-override.yml
```

`docker compose ... config --format json`의 publish 값과 resolver 결과는 **16/16 일치, 불일치 0개**였다.

| 서비스 | resolver | 3-file 합성 | 판정 |
|---|---:|---:|---|
| eureka-server | 8761 | 8761 | 일치 |
| api-gateway | 8080 | 8080 | 일치 |
| auth-service | 8081 | 8081 | 일치 |
| user-service | 8083 | 8083 | 일치 |
| product-service | 8084 | 8084 | 일치 |
| inventory-service | 8085 | 8085 | 일치 |
| slip-service | 18086 | 18086 | 일치 |
| accounting-service | 8087 | 8087 | 일치 |
| partner-order-service | 18088 | 18088 | 일치 |
| dc-config-service | 8089 | 8089 | 일치 |
| partner-auth-service | 8091 | 8091 | 일치 |
| groupware-service | 8092 | 8092 | 일치 |
| notification-service | 8093 | 8093 | 일치 |
| dashboard-service | 8094 | 8094 | 일치 |
| partner-service | 8095 | 8095 | 일치 |
| arologis-service | 8097 | 8097 | 일치 |

override 대상은 정확히 **2/16**(`slip-service`, `partner-order-service`)이었고, 나머지 **14/16**에는 override 값이 잘못 전파되지 않았다.

같은 Dockerless 조건에서 `run-smoke-tests.ps1`도 별도로 실행했다. 15/15 health UP이며 slip `18086`, partner-order `18088`에 도달했다. exit 1은 제외 대상 inventory 업무 404 하나뿐이었다.

## 신규 표면 1 — 환경변수의 정당 사용

resolver를 실제 운영에 소비하면서 `SAMHAN_*_PORT`로 기동 위치 또는 호출 대상을 지정할 수 있는 entry path는 **8개**다.

1. `infrastructure/scripts/start-local-full.ps1`
2. `infrastructure/scripts/stop-local-full.ps1`
3. `infrastructure/scripts/operational-validation.ps1`
4. `scripts/run-load-test.ps1`
5. `scripts/seed-local-stack.ps1`
6. `tools/operational-validation/import-notion-csv.ps1`
7. `tools/operational-validation/run-smoke-tests.ps1`
8. `tools/test-data/seed-9-slice-fixtures.ps1`

내부 library·회귀 테스트는 entry path 수에서 제외했다. `launch-local-stack.ps1`은 compose가 실제 기동 위치를 정하는 Docker 전용 경로라 “스택이 없을 때 환경변수로 standalone 기동 위치 지정” 경로에는 포함하지 않았다.

Docker daemon은 살아 있지만 대상 컨테이너만 없도록 resolver의 container name을 프로세스 메모리에서만 부재 이름으로 바꾼 격리 probe 결과:

```text
DAEMON_UP_CONTAINER_ABSENT_ENV=18181
DAEMON_UP_CONTAINER_ABSENT_COMPOSE=8081
```

즉 ① container publish 조회 실패 후 명시 환경변수가 있으면 ② `18181`, 없으면 ③ compose `8081`로 내려갔다. 실제로 publish/대상 컨테이너가 없는 `logging-service`도 `SAMHAN_LOGGING_PORT=18182`를 그대로 반환했다. 파일은 수정하지 않았고 probe 종료 시 환경과 in-memory mapping을 복원했다.

따라서 요청에서 예시로 든 “스택이 안 떠 있을 때 어디에 띄울지 지정” 용도는 깨지지 않았다. 같은 이름의 running 컨테이너와 별도 standalone을 동시에 두고 환경변수로 후자를 선택하는 모드는 S17의 명시된 Docker 관측 우선 계약에 포함되지 않는다.

## 신규 표면 2 — 정상 경로 오차단 수

- 요청된 주 경로 4종에서 resolver 때문에 막힌 정상 경로: **0개**
- Dockerless smoke에서 resolver 때문에 막힌 정상 경로: **0개**
- Docker daemon alive / 대상 컨테이너 absent에서 ②로 내려가지 못한 경로: **0개**
- 3-file override가 비대상 서비스에 전파된 수: **0/14**

회귀 본체 `tools/operational-validation/test-s7-axis-redefined.ps1`도 Windows PowerShell 5.1에서 exit 0이었다.

## 공유 환경·프로세스 회수

- 공유 Docker stack은 up/down/recreate/restart하지 않았다.
- 종료 시 running container는 24개로 유지됐다.
- 종료 시 slip `18086`, partner-order `18088`은 healthy였다.
- `samhan-nginx` unhealthy는 선재 상태 그대로이며 손대지 않았다.
- k6 container 잔여는 0개다.
- `gradlew.bat --stop`: `No Gradle daemons are running.`, exit 0.
- PowerShell background job 잔여는 0개다.
- DB 직접 쓰기는 하지 않았다. `start-local-full`의 기존 row-count 검증 SELECT만 실행됐다.
- 커밋·push·코드 수정은 하지 않았다.

## 신규 파일

이 라운드가 만든 파일은 다음 4개다.

- `docs/dev-reports/2026-08-08-1113-s18-sol-reconvergence.md`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-041113.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-041113.log`
- `perf/k6/out/summary-smoke-20260808-041113.json` (gitignored)

`022301`, `033759`, `034532` raw log 6개는 라운드 시작 전부터 미추적 상태였으며 수정·삭제하지 않았다.

## 이 라운드가 보지 않은 것

- 공유 stack을 재기동·재생성하는 `launch-local-stack.ps1` / `start-local-full.ps1` full up.
- 실제 stop/down 및 `stop-local-full.ps1` / `stop-local-stack.ps1`의 S16 별도 종료코드 지적 재검증.
- `SEED_LOGIN_PW`를 주입한 seed 성공 경로와 reimport.
- inventory `/balances` 업무 404의 수정 또는 데이터 정합 재조사.
- k6 실패 요청의 품질·권한 원인 개선, baseline/peak/stress/7시간 soak.
- S16의 resolver 두 BLOCKER 외 나머지 별도 지적에 대한 수정 여부.
- AWS 배포·Terraform·외부 vendor·모바일/데스크톱 GUI 회귀.
- 검증 강도·문서 품질. 요청대로 도달성만 판정했다.
