# 2026-07-06 — config-audit downstream URL 재수렴

> PR #745 config-audit dev 슬라이스. git 작업은 PM commit 전제로 수행하지 않았다.

## 범위

- `SAMHAN_*_SERVICE_URL` 포트를 compose 실 포트 기준으로 전수 대조.
- arologis-service의 slip-service 기본 URL 8084 오배정을 8086으로 정정.
- prod compose의 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`가 실제 `UserClient` 동작까지 전달되도록 notification/groupware application 설정과 생성자 배선을 추가.
- notification-service env template/prod compose/Terraform user_data의 `SAMHAN_ALIGO_API_URL` 빈 override를 application 기본값과 같은 명시 기본값으로 정합.

## 근본원인

1. arologis-service가 slip-service를 호출하는 기본값이 과거 product-service 포트인 8084로 남아 있었다. 반면 compose 기준 slip-service의 실 내부 포트는 local-all/prod/partner-order 모두 8086이다.
2. notification-service와 groupware-service의 prod compose는 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`를 주입하지만, 두 `UserClient` wrapper가 `UserVerifierProperties#setFailFast(false)`를 고정 호출했다. 따라서 prod 설정은 존재해도 fail-fast 동작으로 전환되지 않았다.
3. notification-service env template, prod compose, Terraform user_data의 `SAMHAN_ALIGO_API_URL` 빈 값이 Spring application 기본값(`https://apis.aligo.in/send/`)을 가릴 수 있었다. 운영 검증 스크립트도 명시 URL을 기대하는 흐름이 있어 템플릿/운영 주입 지점과 런타임 기본값이 어긋났다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `infrastructure/env-templates/arologis-service.env` | `SAMHAN_SLIP_SERVICE_URL` 8084 -> 8086 |
| `services/arologis-service/src/main/resources/application.yml` | `samhan.slip-service.url` 기본값 8084 -> 8086 |
| `services/arologis-service/README.md` | 문서 예시와 의존 포트 8086 정정 |
| `infrastructure/env-templates/notification-service.env` | `SAMHAN_ALIGO_API_URL=https://apis.aligo.in/send/` 명시 |
| `infrastructure/docker-compose.prod.yml` | `SAMHAN_ALIGO_API_URL` compose 기본값을 application 기본값과 정합 |
| `infrastructure/terraform/templates/user_data.sh` | `SAMHAN_ALIGO_API_URL` EC2 env 기본값을 application 기본값과 정합 |
| `services/notification-service/src/main/resources/application.yml` | `samhan.user-client.fail-mode` 환경변수 배선 추가 |
| `services/groupware-service/src/main/resources/application.yml` | `samhan.user-client.fail-mode` 환경변수 배선 추가 |
| `services/notification-service/src/main/java/.../client/UserClient.java` | `FailMode` 생성자 주입 후 `setFailMode()` 전달 |
| `services/groupware-service/src/main/java/.../client/UserClient.java` | `FailMode` 생성자 주입 후 `setFailMode()` 전달 |
| `services/notification-service/src/test/java/.../UserClientFailModeTest.java` | STRICT가 delegate까지 도달하는 회귀 테스트 추가 |
| `services/groupware-service/src/test/java/.../UserClientFailModeTest.java` | STRICT가 delegate까지 도달하는 회귀 테스트 추가 |
| `services/notification-service/src/test/java/.../UserClientBulkVerifyTest.java` | 기존 fail-soft 기대값을 OPEN 명시로 보존 |
| `services/notification-service/src/test/java/.../UserClientContractTest.java` | 기존 계약 테스트 OPEN 명시 |
| `services/groupware-service/src/test/java/.../UserClientResolveDisplayNamesTest.java` | 기존 표시명 테스트 OPEN 명시 |
| `infrastructure/scripts/validate-config-audit.ps1` | compose 포트 sweep, ALIGO 기본값, fail-mode 배선 검증 추가 |

## 포트 sweep 결과

기준은 `infrastructure/docker-compose.local-all.yml`, `infrastructure/docker-compose.prod.yml`, `infrastructure/docker/docker-compose.arologis.yml`의 `SERVER_PORT`/container port이다. 상세 행 단위 검증은 `validate-config-audit.ps1 -Detailed`가 55개 체크로 수행한다.

| 대상 service | compose 포트 | env-template/application 소비처 | 결과 |
|---|---:|---|---|
| auth-service | 8081 | slip, notification, arologis, groupware, user 등 application/env-template | OK |
| user-service | 8083 | notification, groupware, arologis env/application | OK |
| product-service | 8084 | partner-order env-template | OK |
| inventory-service | 8085 | partner-order/dashboard env/application | OK |
| slip-service | 8086 | partner-order env-template, arologis env-template/application | OK, arologis 8084 오배정 정정 |
| accounting-service | 8087 | dashboard env/application | OK |
| partner-order-service | 8088 | dashboard env/application | OK |
| dc-config-service | 8089 | partner-order/partner-auth env/application | OK |
| partner-auth-service | 8091 | partner-order env-template | OK |
| groupware-service | 8092 | groupware env-template self URL | OK |
| notification-service | 8093 | notification/arologis env/application | OK |
| dashboard-service | 8094 | dashboard env-template self URL | OK |
| partner-service | 8095 | notification/dashboard/arologis/partner env/application | OK |
| arologis-service | 8097 | arologis env-template self URL | OK |

## failFast 설계 판단

prod의 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`는 유지하고 실제 배선했다. 이유는 notification/groupware의 `exists()`/`verifyBulk()`는 사용자 존재 검증 경계이고, 운영에서 user-service 장애를 fail-open으로 숨기면 잘못된 사용자 ID를 유효로 취급하거나 잘못된 수신자/결재자 상태를 통과시킬 수 있기 때문이다.

local/env-template 기본값은 `OPEN`으로 유지했다. 개발 환경 부팅성과 기존 단위 테스트의 fail-soft 기대값을 보존하기 위한 선택이다. prod compose만 `STRICT`로 전환하며, shared `UserVerifierProperties`의 기본 timeout(연결 1초, 읽기 5초)이 이미 있어 downstream 장애 시 무한 대기는 피한다.

groupware의 표시명 조회/search 계열은 기존처럼 메서드 내부에서 빈 결과 fail-soft를 유지한다. 이번 STRICT 전환 대상은 shared `DefaultUserVerifier`에 위임되는 사용자 존재 검증 경로다.

## ALIGO URL 판단

`SAMHAN_ALIGO_API_URL`은 application 기본값과 같은 `https://apis.aligo.in/send/`로 명시한다. 대상은 notification env template, prod compose, Terraform user_data의 EC2 env 파일 생성부다. `SAMHAN_ALIGO_KEY`, `SAMHAN_ALIGO_USERID`, `SAMHAN_ALIGO_SENDER`는 계속 빈 값이므로 local/template/prod bootstrap 상태에서 실 API 호출은 credential guard로 차단된다. 빈 env 값이 application 기본값을 덮어 쓰는 혼선을 없애고, 기존 operational validation 기대값과도 정합된다.

## RED -> GREEN 검증

### RED

- `.\infrastructure\scripts\validate-config-audit.ps1 -Detailed`
  - 실패 3건: `SAMHAN_SLIP_SERVICE_URL` 8084 2곳(arologis env-template/application), `SAMHAN_ALIGO_API_URL` 빈 값.
- `.\gradlew.bat :services:notification-service:test --tests "*UserClientFailModeTest" --no-build-cache`
  - `UserClient` 생성자에 `FailMode` 인자가 없어 compile 실패.
- `.\gradlew.bat :services:groupware-service:test --tests "*UserClientFailModeTest" --no-build-cache`
  - `UserClient` 생성자에 `FailMode` 인자가 없어 compile 실패.

### GREEN

- `.\infrastructure\scripts\validate-config-audit.ps1 -Detailed`
  - exit 0, `config-audit validation passed: 55 URL/template checks`.
- `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml config`
  - exit 0.
- `docker compose -f infrastructure/docker-compose.prod.yml config`
  - exit 0. 로컬 미설정 secret/env에 대한 compose warning만 발생.
- `docker compose -f infrastructure/docker/docker-compose.arologis.yml config`
  - exit 0. 로컬 미설정 secret/env에 대한 compose warning만 발생.
- `.\gradlew.bat :services:notification-service:test :services:groupware-service:test :services:arologis-service:test --no-build-cache`
  - `BUILD SUCCESSFUL in 1m 34s`, 35 actionable tasks.

## 마이그레이션 영향

DB schema/Flyway 변경 없음.

## 라운드1 (Opus 5-agent) fix — #745

> 조기 PR 리뷰 라운드1 지적 4건(HIGH 1 · MED 3), 전부 현재 PR 내(fix/config-audit-downstream-urls) 처리.

### 1. [HIGH] docker-compose.arologis.yml 다운스트림 env 누락

`infrastructure/docker/docker-compose.arologis.yml`의 arologis-service 블록에 `SAMHAN_PARTNER_SERVICE_URL`·`SAMHAN_SLIP_SERVICE_URL`·`SAMHAN_NOTIFICATION_SERVICE_URL`·`SAMHAN_AUTH_SERVICE_URL`이 전혀 선언돼 있지 않았다. `PartnerClient`/`NotificationClient`/`AuthPermissionAdminClientImpl`/`SlipClient`·`SlipServiceClient`·`SlipDispatchTaskClient`는 모두 `@Primary` 비-LoadBalanced 리터럴 `RestClient`라, 컨테이너 안에서 env 가 없으면 application.yml 자체 기본값(`http://localhost:PORT`)으로 폴백해 별도 컨테이너인 실서비스에 연결할 수 없다.

- 조치: 4개 env 를 실 컨테이너명:포트(`partner-service:8095`·`slip-service:8086`·`notification-service:8093`·`auth-service:8081`)로 추가, 기존 파일과 동일한 `${VAR:-default}` 표기 유지.
- 죽은 `SAMHAN_SLIP_DISPATCH_TASK_URL` 정리 판단: `grep -rn SAMHAN_SLIP_DISPATCH_TASK_URL services/` 결과 arologis-service 코드 어디에도 바인딩되지 않는 변수임을 확인(0건)하고 제거했다. `SlipDispatchTaskClient`의 배차 confirm/unavailable/수정/취소 회신 6종은 이미 `samhan.slip-service.url`(=`SAMHAN_SLIP_SERVICE_URL`)을 `SlipClient`/`SlipServiceClient`와 동일하게 그대로 소비하므로, 별도 URL 처럼 보이는 죽은 변수를 남겨두는 쪽이 오히려 향후 디버깅 시 혼선을 유발한다고 판단했다.
- 범위: `docker-compose.prod.yml`/`arologis-service.env`/`.env.example`의 동일 `SAMHAN_SLIP_DISPATCH_TASK_URL`은 이번 라운드 지적 범위(`docker-compose.arologis.yml` 한정) 밖이라 미변경 — 그 파일들은 `SAMHAN_SLIP_SERVICE_URL`도 이미 병행 선언돼 있어 HIGH 급 연결 실패 자체가 없다.

### 2. [MED] @Value 리터럴 폴백 오배정

- `SlipClient.java`/`SlipServiceClient.java`: `samhan.slip-service.url` 폴백 `http://localhost:8084` → `http://localhost:8086`.
- `SlipDispatchTaskClient.java`: 포트가 없던 폴백 `http://slip-service` → `http://slip-service:8086`.
- application.yml 이 `samhan.slip-service.url`을 항상 정의(`SAMHAN_SLIP_SERVICE_URL` 체이닝)하므로 정상 기동 시에는 도달하지 않는 코드지만, 유닛 테스트가 생성자에 명시 URL을 안 넘기는 경로나 향후 리팩터 시 오배정이 실런타임 값이 되는 것을 막기 위해 정정.

### 3. [MED] validate-config-audit.ps1 커버리지 확대

- **(a) 중첩표기 매칭**: 문자군 `[^}"'\s]+` 에서 `}`를 제외 대상에서 뺐다(`[^"'\s]+`). 그리디 `.*`는 실패 시 역추적하며 항상 줄의 **마지막** `:포트`를 찾아내므로, `}`를 더 이상 배제하지 않아도 중첩 유무와 무관하게 실제 포트를 정확히 추출한다. 이 한 줄 수정으로 `partner-order-service/application.yml` 145~149행(`${SAMHAN_X:http://${HOST:svc}:PORT}` 형태 5줄)이 신규로 검사 대상에 포함됐다(기존에는 조용히 스킵되던 커버리지 공백).
- **(b) 앵커블록 오인식 방지**: `Read-ComposePorts`/`Test-ComposeServiceHasLine` 모두 최상위 `services:` 진입 전/이후 구간을 추적하는 `$inServices` 상태를 추가했다. `x-service-depends`/`x-app-depends` YAML 앵커 내부의 `postgres`/`redis`/`rabbitmq`/`elasticsearch`/`eureka-server` 2-space 키, 그리고 파일 말미 `volumes:` 블록의 2-space 키(`arologis_signature_copies` 등)를 더 이상 "정식 서비스 블록"으로 오인식하지 않는다. 현재 파일 내용 기준으로는 이 앵커 구간에 포트 정보가 없어 실제 오탐은 없었지만, 앵커 내용이 바뀌면 언제든 실제 오탐으로 번질 수 있는 잠재 결함이었다.
- **(c) .java @Value URL 리터럴 스캔 추가**: `services/**/src/main/java/**/*.java`에서 `@Value("${samhan.<svc>-service.url:http://...:PORT}")` 패턴을 `Select-String`으로 스캔해 26건을 신규 등재(`DynamicPermissionClientConfig` 12종 + `AccountingClient`/`InventoryClient`/`PartnerClient`/`PartnerOrderClient`(dashboard) + `RestClientAligoCsvSourceClient`/`RestClientPartnerLookupClient`/`UserClient`(notification) + `UserClient`(groupware) + `AuthPermissionAdminClientImpl`/`NotificationClient`/`PartnerClient`/`SlipClient`/`SlipDispatchTaskClient`/`SlipServiceClient`(arologis)). RED 테스트로 `SlipClient.java`를 8084로 임시 되돌려 MISMATCH 검출 + exit 1을 확인한 뒤 복원 — java 스캔 자체가 향후 이 PR과 동일한 오배정을 실제로 잡아낸다는 것을 실증했다.
- 총 체크 수: 55 → **86**(+31).

### 4. [MED] CI 연결

- `.github/workflows/ci.yml`에 `config-audit-guard` job 신규 추가 (`notion-zero-guard`/`credential-plaintext-guard` 옆, `ubuntu-latest`·5분 timeout·`shell: pwsh`로 `validate-config-audit.ps1 -Detailed` 실행).
- CI 연결 검증 과정에서 스크립트의 크로스플랫폼 버그 2건을 자체 발견해 함께 수정했다(이번 라운드1 지적 항목엔 없지만, "회귀 게이트화"라는 item 4 목적 자체가 깨지는 결함이라 같은 슬라이스에서 처리):
  - `Get-UrlRecords`의 `application.yml`/`.java` 파일 필터가 `\\src\\main\\...` (윈도우 전용 백슬래시 리터럴)였다. `ubuntu-latest`의 `pwsh`는 forward-slash 경로를 쓰므로 이 필터는 **0건 매칭** — 로컬 Windows에서는 우연히 통과하는 false-green이고, 정작 CI(Linux)에서는 방금 추가한 (a)(c) 커버리지가 전부 조용히 사라지는 상황이었다. `[\\/]` 문자군으로 양쪽 구분자를 모두 인식하도록 교체.
  - `mcr.microsoft.com/powershell` Docker 이미지로 Linux `pwsh` 실행을 재현해 검증: 수정 전 31 checks(적용 안 된 커버리지만큼 축소) → 수정 후 **86 checks**(Windows와 완전히 동수).
  - GitHub Actions의 실제 `shell: pwsh` 스텝 호출 방식(`pwsh -command ". '<생성된-wrapper>.ps1'"`, dot-source)을 그대로 재현해 RED(exit 1)/GREEN(exit 0) 둘 다 확인했다. 단순히 `pwsh -Command "./script.ps1"`(dot-source 없이)로만 검증하면 스크립트의 `throw`가 화면에는 표시돼도 프로세스 exit code 가 0으로 새는 함정이 있어, 반드시 GH Actions와 동일한 dot-source wrapper 형태로 재현 검증해야 한다는 점을 확인했다.

## 검증 (라운드1 fix)

### RED

- `SlipClient.java`의 `samhan.slip-service.url` 폴백을 8084로 임시 되돌린 뒤 `validate-config-audit.ps1` 실행 → `MISMATCH samhan.slip-service.url slip-service 8084 8086 ...SlipClient.java:58`, `config-audit validation failed: 1 issue(s)`, exit 1. Windows PowerShell 5.1 및 Linux `pwsh`(Docker `mcr.microsoft.com/powershell`, GH Actions dot-source 방식 재현) 양쪽에서 동일하게 확인.

### GREEN

- `powershell.exe infrastructure/scripts/validate-config-audit.ps1 -Detailed` (Windows PowerShell 5.1) → `config-audit validation passed: 86 URL/template checks`, exit 0.
- `mcr.microsoft.com/powershell` 컨테이너(Linux, GH Actions `ubuntu-latest`의 `pwsh`와 동일 계열)에서 동일 스크립트 → 86 checks, exit 0 — Windows와 동수로 크로스플랫폼 정합 확인.
- `docker compose -f infrastructure/docker/docker-compose.arologis.yml config` → exit 0. 렌더 결과에 `SAMHAN_AUTH_SERVICE_URL`/`SAMHAN_PARTNER_SERVICE_URL`/`SAMHAN_NOTIFICATION_SERVICE_URL`/`SAMHAN_SLIP_SERVICE_URL` 4종 모두 존재, `SAMHAN_SLIP_DISPATCH_TASK_URL`은 부재(제거 확인).
- `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml config` / `docker compose -f infrastructure/docker-compose.prod.yml config` → 각 exit 0 (회귀 없음).
- `./gradlew :services:arologis-service:test --rerun-tasks --no-build-cache` → `BUILD SUCCESSFUL`, 15/15 actionable tasks executed(캐시 재사용 0), 78개 test 리포트 합산 535 tests · skipped 0 · failures 0 · errors 0 (`SlipClientTest`/`SlipDispatchTaskClientTest` 각 10/10 포함).

## 변경 파일 (라운드1 fix)

| 파일 | 변경 |
|---|---|
| `infrastructure/docker/docker-compose.arologis.yml` | 다운스트림 env 4종 추가(partner/slip/notification/auth) + 죽은 `SAMHAN_SLIP_DISPATCH_TASK_URL` 제거 |
| `services/arologis-service/.../client/SlipClient.java` | `@Value` 폴백 8084→8086 |
| `services/arologis-service/.../client/SlipServiceClient.java` | `@Value` 폴백 8084→8086 |
| `services/arologis-service/.../client/SlipDispatchTaskClient.java` | `@Value` 폴백 무포트→8086 |
| `infrastructure/scripts/validate-config-audit.ps1` | 중첩표기 regex 보강 · 앵커블록 오인식 가드 · `.java` 리터럴 스캔 추가 · 경로 구분자 크로스플랫폼 가드 |
| `.github/workflows/ci.yml` | `config-audit-guard` job 신규(회귀 게이트화) |

## 라운드2 (재수렴) fix — #745

> 라운드1 fix 게시 후 재수렴 라운드 지적 3건(중간 2 · 낮음 1), 전부 현재 PR 내(fix/config-audit-downstream-urls) 처리. worktree `.claude/worktrees/cfg` 에서 작업(git 은 PM commit 대행).

### 1. [중간] 죽은 SAMHAN_SLIP_DISPATCH_TASK_URL 잔존 3곳 정리

라운드1 fix(§ 위 item 1)는 `docker-compose.arologis.yml` 한 파일에서만 죽은 변수를 제거했고, 당시 dev-report 는 "`docker-compose.prod.yml`/`arologis-service.env`/`.env.example` 의 동일 변수는 이번 라운드 지적 범위 밖이라 미변경"이라고 명시적으로 스코프를 남겨뒀다. 재수렴 검토 결과 이 3곳이 실제로 그대로 남아 있었다 — `infrastructure/docker-compose.prod.yml:702`(arologis-service 블록), `infrastructure/env-templates/arologis-service.env:103`(주석이 "슬립 배차 회신 URL"이라 별도 유효 URL 처럼 오인 유발), `infrastructure/.env.example:109`.

- 재확인: `grep -rn "slip-dispatch-task\|SLIP_DISPATCH_TASK\|slipDispatchTask" services/` — `SlipDispatchTaskClient` 빈을 참조하는 테스트 mock(`DispatchSaveHistoryIT`/`InsungQuickIntegrationIT`) 2건만 매칭, `@Value` 바인딩 0건 재확인. `SlipDispatchTaskClient.java` 생성자가 실제 소비하는 property 는 `@Value("${samhan.slip-service.url:http://slip-service:8086}")` — `SlipClient`/`SlipServiceClient` 와 완전히 동일한 property 다. `SAMHAN_SLIP_DISPATCH_TASK_URL` 은 이름 자체에 `SERVICE` 토큰이 없어(`_TASK_URL` 로 끝남) config-audit 스캔 정규식(`SAMHAN_[A-Z0-9_]+_SERVICE_URL`) 대상도 애초에 아니었다 — 순수 dead literal.
- 조치: 3개 파일에서 해당 라인을 제거하고, 오해유발 주석("슬립 배차 회신 URL")을 "호출 URL = 위 SAMHAN_SLIP_SERVICE_URL 재사용" 설명으로 교체 — 라운드1 이 `docker-compose.arologis.yml` 에 남긴 "(제거됨) ..." 설명과 동일한 어조로 통일했다.
- 범위: `docs/migration/samhan-dispatch-board/`·`docs/qa/samhan-dispatch-board*/`·`docs/superpowers/`·`migration/decisions/DECISIONS.md` 등 과거 스펙/QA 시나리오/의사결정 문서에 남아 있는 동일 변수명 언급은 히스토리 레코드라 이번 지적 범위(`infrastructure/**` 4곳) 밖 — 미변경.

### 2. [중간] validate-config-audit.ps1 — compose environment 리터럴 스캔 사각지대 해소

라운드1 이 추가한 env-template/`application.yml`/`.java` 3원 스캔은 모두 "선언 템플릿" 이다. 정작 컨테이너에 실제로 주입되는 값의 진짜 진실원인 compose 파일(`docker-compose.local-all.yml`/`docker-compose.prod.yml`/`docker-compose.arologis.yml`) 자체 `environment:` 블록의 `SAMHAN_*_SERVICE_URL: http://host:PORT` 리터럴(3개 파일 합산 ~70줄, 서비스마다 반복 선언)은 스캔 대상이 아니었다 — arologis.yml 의 이번 회귀(SLIP 8086→8084 재발) 같은 오타가 compose 파일에서만 발생하면 기존 스캔은 이를 전혀 검출하지 못하는 회귀 사각지대였다.

- 조치: `Get-UrlRecords` 에 (d) 블록 신규 — 기존 `Read-ComposePorts` 가 쓰는 동일 3-파일 목록(`$ComposeFiles`)을 순회하며, 주석 줄(`^\s*#`)을 제외하고 (a) 스캔과 동일한 정규식(`(?<var>SAMHAN_[A-Z0-9_]+_SERVICE_URL):.*?http://[^"'\s]+:(?<port>\d+)`)으로 각 서비스 블록의 URL 리터럴을 추출, `Get-ServiceNameFromVar` 로 대상 서비스명을 도출해 기존 `$composePorts` 교차검증 파이프라인에 그대로 태운다.
- `Read-ComposePorts`/`Test-ComposeServiceHasLine` 의 `$inServices` 앵커블록 오인식 가드는 (d) 스캔에는 재사용하지 않았다 — (d) 는 "어느 서비스가 선언했는지" 가 아니라 "어떤 변수가 어떤 포트를 가리키는지" 만 필요해 앵커 블록 소속 여부와 무관하기 때문이다. 3개 compose 파일의 `x-*` 앵커(`x-spring-prod`/`x-service-memory`/`x-app-depends`) 내부에 `SAMHAN_*_SERVICE_URL` 패턴이 실제로 존재하지 않음을 grep 으로 사전 확인한 뒤 전체 파일 라인 스캔으로 충분하다고 판단했다.
- 신규 등재: local-all.yml 29건 + prod.yml 37건(기존 `SAMHAN_USER_CLIENT_FAIL_MODE` prod STRICT 특례 2건은 (d) 신규가 아니라 라운드1 이전부터 있던 별도 체크라 제외) + arologis.yml 4건 = **70건** 신규. 총 체크 수: 86 → **156**(+70).
- RED 실증: `docker-compose.arologis.yml` 의 `SAMHAN_SLIP_SERVICE_URL` 기본값을 8086→8084로 임시 변경 후 실행 → `MISMATCH SAMHAN_SLIP_SERVICE_URL slip-service 8084 8086 ...docker-compose.arologis.yml:59`, `config-audit validation failed: 1 issue(s)`, exit 1 — (d) 스캔이 compose 파일 자체의 오배선을 실제로 검출함을 실증한 뒤 즉시 원복(`diff` 로 원본과 바이트 단위 동일함 재확인).
- GREEN: 원복 후 재실행 → `config-audit validation passed: 156 URL/template checks`, exit 0. 신규 70건 포함 전체 156건 Status=OK.

### 3. [낮음] ci.yml — Config Audit Guard job명 YAML 주석 잘림

`.github/workflows/ci.yml:302` 의 `name: Config Audit Guard (다운스트림 URL/포트 정합, #745)` 는 따옴표 없는 plain scalar 였다. YAML 스펙상 공백 뒤에 오는 `#` 는 괄호 안이든 밖이든 무조건 주석 시작으로 해석되므로, `, #745)` 부분이 파싱 시 통째로 잘려나가 GitHub Actions PR 체크 목록/branch protection required-check 이름에는 `Config Audit Guard (다운스트림 URL/포트 정합,` 까지만 노출되는 상태였다.

- 조치: 값을 큰따옴표로 감쌈(`"Config Audit Guard (다운스트림 URL/포트 정합, #745)"`) — 같은 파일 내 기존 관례(`"design-system 사전 빌드 (file: dependency)"` 등 YAML 특수문자 포함 step name 은 이미 큰따옴표 사용)와 일치시켰다.
- 검증: PyYAML `safe_load` 로 수정 전/후 비교 — 수정 전 `name` 값 36자(`#745)` 로 끝나지 않음, 주석 잘림 재현) vs 수정 후 42자(`#745)` 로 정확히 끝남). 파일 전체 YAML 파싱도 정상 동작(`jobs['config-audit-guard']['name']` 접근 성공, 다른 job 정의에 영향 없음). `needs:` 는 job key(`config-audit-guard`)를 참조하므로 `name:` 표시값 변경과 무관 — 의존관계 영향 없음.

## 검증 (라운드2 재수렴 fix)

### RED

- `docker-compose.arologis.yml` 의 `SAMHAN_SLIP_SERVICE_URL` 기본값을 8086→8084로 임시 변경 → `validate-config-audit.ps1` 실행 → `MISMATCH SAMHAN_SLIP_SERVICE_URL slip-service 8084 8086 ...\docker-compose.arologis.yml:59`, `config-audit validation failed: 1 issue(s)`, exit 1. 즉시 원복.
- PyYAML 로 ci.yml job name 수정 전 문자열 재현 → 길이 36자, `#745)` 로 끝나지 않음 확인(주석 잘림 재현).
- 라운드1 종료 시점 스크립트(`git show HEAD:infrastructure/scripts/validate-config-audit.ps1`)를 (d) 블록 추가 전 상태로 원위치 임시 실행해 베이스라인 86건을 별도 재확인 — 죽은 변수 제거(item 1)가 (a)/(b)/(c) 기존 카운트에 영향 없음을 실증(변수명에 `SERVICE` 토큰이 없어 애초 미스캔 대상).

### GREEN

- `powershell.exe infrastructure/scripts/validate-config-audit.ps1 -Detailed` → `config-audit validation passed: 156 URL/template checks`, exit 0. 156건 전부 Status=OK(신규 (d) 70건 포함).
- `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml config` → exit 0. `scripts/launch-local-stack.ps1` 과 동일한 `-f` 순서(overlay 조합) — `docker-compose.local-all.yml` 단독 실행은 `samhan-net` 미정의로 exit 1 이 나지만, 이는 overlay 전용 설계(최상위 `networks:` 미선언, base 파일 의존)에 따른 기존 특성이고 본 PR 은 이 파일을 변경하지 않았다.
- `docker compose -f infrastructure/docker-compose.prod.yml config` → exit 0(미설정 secret/env 경고만, 기존과 동일).
- `docker compose -f infrastructure/docker/docker-compose.arologis.yml config` → exit 0(미설정 secret/env 경고만, 기존과 동일).
- `grep -rn "SAMHAN_SLIP_DISPATCH_TASK_URL=http\|SAMHAN_SLIP_DISPATCH_TASK_URL:\s*http" infrastructure/` → 0건.
- PyYAML `safe_load` 로 ci.yml job name 수정 후 문자열 재확인 → 길이 42자, `#745)` 로 정확히 끝남 확인.

## 변경 파일 (라운드2 재수렴 fix)

| 파일 | 변경 |
|---|---|
| `infrastructure/docker-compose.prod.yml` | 죽은 `SAMHAN_SLIP_DISPATCH_TASK_URL` 제거 + 설명 주석 추가 |
| `infrastructure/env-templates/arologis-service.env` | 죽은 `SAMHAN_SLIP_DISPATCH_TASK_URL` 제거, 오해유발 "슬립 배차 회신 URL" 주석 정정 |
| `infrastructure/.env.example` | 죽은 `SAMHAN_SLIP_DISPATCH_TASK_URL` 제거, 오해유발 주석 정정 |
| `infrastructure/scripts/validate-config-audit.ps1` | `Get-UrlRecords` (d) compose `environment:` 블록 리터럴 스캔 추가(local-all/prod/arologis 3종, +70건, 총 156건) |
| `.github/workflows/ci.yml` | `config-audit-guard` job `name` 값 큰따옴표로 감싸 YAML 주석 잘림(`#745)`) 수정 |

## Design 중간 fix — ALIGO family 정합

라운드 Design 중간 점검에서 `SAMHAN_ALIGO_API_URL`이 prod compose와 Terraform user_data에서 빈 값으로 주입되어 `services/notification-service/src/main/resources/application.yml`의 기본값(`https://apis.aligo.in/send/`)을 가리는 문제가 확인됐다. round1은 `notification-service.env`만 명시 기본값으로 맞췄고, 실제 운영 주입 지점 2곳은 빈 override가 남아 있었다.

- 조치: `infrastructure/docker-compose.prod.yml`의 `SAMHAN_ALIGO_API_URL`을 `${SAMHAN_ALIGO_API_URL:-https://apis.aligo.in/send/}`로 변경.
- 조치: `infrastructure/terraform/templates/user_data.sh`의 `SAMHAN_ALIGO_API_URL=`을 `SAMHAN_ALIGO_API_URL=https://apis.aligo.in/send/`로 변경.
- credential 가드 유지: `SAMHAN_ALIGO_KEY`, `SAMHAN_ALIGO_USERID`, `SAMHAN_ALIGO_SENDER`는 prod compose/Terraform/user template 모두 빈 값 유지.
- 검증 강화: `validate-config-audit.ps1`이 `notification-service.env`, prod compose, Terraform user_data의 `SAMHAN_ALIGO_API_URL`을 모두 application 기본값과 같은 값으로 검사하도록 확장.

### RED

- `powershell.exe infrastructure/scripts/validate-config-audit.ps1 -Detailed` → prod compose와 Terraform user_data의 `SAMHAN_ALIGO_API_URL` 2건 `MISMATCH`, exit 1.

### GREEN

- `powershell.exe infrastructure/scripts/validate-config-audit.ps1 -Detailed` → `config-audit validation passed: 158 URL/template checks`, exit 0.
- `docker compose -f infrastructure/docker-compose.prod.yml config | Select-String -Pattern 'ALIGO' -CaseSensitive:$false` → `SAMHAN_ALIGO_API_URL: https://apis.aligo.in/send/`, `SAMHAN_ALIGO_KEY/USERID/SENDER: ""` 확인. 원 요청의 `grep -i ALIGO`는 Windows PowerShell 환경에 `grep` 명령이 없어 동일 목적의 `Select-String`으로 대체했다.
- `rg -n "SAMHAN_ALIGO_API_URL(:\s*\$\{SAMHAN_ALIGO_API_URL:-\}|=)\s*$" infrastructure` → 매칭 0건(exit 1), 빈 override 잔존 없음.
