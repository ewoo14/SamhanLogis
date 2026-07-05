# 2026-07-06 — config-audit downstream URL 재수렴

> PR #745 config-audit dev 슬라이스. git 작업은 PM commit 전제로 수행하지 않았다.

## 범위

- `SAMHAN_*_SERVICE_URL` 포트를 compose 실 포트 기준으로 전수 대조.
- arologis-service의 slip-service 기본 URL 8084 오배정을 8086으로 정정.
- prod compose의 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`가 실제 `UserClient` 동작까지 전달되도록 notification/groupware application 설정과 생성자 배선을 추가.
- notification-service env template의 `SAMHAN_ALIGO_API_URL` 빈 값을 application 기본값과 같은 명시 기본값으로 정합.

## 근본원인

1. arologis-service가 slip-service를 호출하는 기본값이 과거 product-service 포트인 8084로 남아 있었다. 반면 compose 기준 slip-service의 실 내부 포트는 local-all/prod/partner-order 모두 8086이다.
2. notification-service와 groupware-service의 prod compose는 `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT`를 주입하지만, 두 `UserClient` wrapper가 `UserVerifierProperties#setFailFast(false)`를 고정 호출했다. 따라서 prod 설정은 존재해도 fail-fast 동작으로 전환되지 않았다.
3. notification-service env template의 `SAMHAN_ALIGO_API_URL`은 빈 값이었다. Spring application 기본값은 `https://apis.aligo.in/send/`이고 운영 검증 스크립트도 명시 URL을 기대하는 흐름이 있어 템플릿과 런타임 기본값이 어긋났다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `infrastructure/env-templates/arologis-service.env` | `SAMHAN_SLIP_SERVICE_URL` 8084 -> 8086 |
| `services/arologis-service/src/main/resources/application.yml` | `samhan.slip-service.url` 기본값 8084 -> 8086 |
| `services/arologis-service/README.md` | 문서 예시와 의존 포트 8086 정정 |
| `infrastructure/env-templates/notification-service.env` | `SAMHAN_ALIGO_API_URL=https://apis.aligo.in/send/` 명시 |
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

## ALIGO template 판단

`SAMHAN_ALIGO_API_URL`은 `https://apis.aligo.in/send/`로 명시했다. `SAMHAN_ALIGO_KEY`, `SAMHAN_ALIGO_USERID`, `SAMHAN_ALIGO_SENDER`는 계속 빈 값이므로 local/template 상태에서 실 API 호출은 credential guard로 차단된다. 빈 env 값이 application 기본값을 덮어 쓰는 혼선을 없애고, 기존 operational validation 기대값과도 정합된다.

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
