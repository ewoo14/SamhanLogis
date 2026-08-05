# PR #1059 / 이슈 #1013 — R6 Config Audit RED fix

작성일: 2026-08-02
담당: CI RED fix
작업 브랜치: `feat/1013-dispatch-inherit`
기준 HEAD: `ea3c5c05e`

## 1. 가드가 잡은 실제 2건

CI 원문은 다음과 같이 종료되었다.

```text
Exception: infrastructure/scripts/validate-config-audit.ps1:331
config-audit validation failed: 2 issue(s)
Process completed with exit code 1.
```

실패 job `91488728222`의 상세 출력과 동일 스크립트 로컬 실행에서 확인된 실제 항목은 다음 2건이다.

```text
MISMATCH samhan.slip-service.url slip-service 8084 8086 .\services\notification-service\src\main\java\com\samhanair\logis\notification\client\RestClientSlipServiceClient.java:32
MISMATCH SAMHAN_SLIP_SERVICE_URL slip-service 8084 8086 .\services\notification-service\src\main\resources\application.yml:56

config-audit validation failed: 2 issue(s)
```

두 값 모두 `notification-service`가 `slip-service`에 연결할 때 사용하는 기본 URL의 포트였고, `8084`는 `product-service` 포트였다.

## 2. 원인

R4에서 실 `RestClientSlipServiceClient`를 연결할 때 `slip-service` 기본 포트를 `8084`로 잘못 입력했다. 같은 잘못된 값이 Java `@Value` 기본값과 `application.yml`의 `SAMHAN_SLIP_SERVICE_URL` 기본값에 중복되어 가드가 각각 1건씩 검출했다.

## 3. fix

- `application.yml`의 `SAMHAN_SLIP_SERVICE_URL` 기본값을 `http://localhost:8084` → `http://localhost:8086`으로 수정했다.
- `RestClientSlipServiceClient`의 `samhan.slip-service.url` 기본값을 `http://localhost:8084` → `http://localhost:8086`으로 수정했다.
- 해당 client 단위 테스트의 `BASE_URL`도 실제 `slip-service` 계약인 `http://localhost:8086`으로 정렬했다.
- Config Audit Guard 스크립트와 탐지 범위는 변경하지 않았다.

## 4. 가드 GREEN 원문

실행 명령:

```powershell
.\infrastructure\scripts\validate-config-audit.ps1
```

결과:

```text
config-audit validation passed: 161 URL/template checks
```

## 5. 다운스트림 값 대조표

| 소비 설정/소비자 | 대상 서비스 | 설정값/기본값 | 실 서비스 포트 근거 | 판정 |
|---|---|---:|---|---|
| `SAMHAN_SLIP_SERVICE_URL` / `samhan.slip-service.url` | `slip-service` | `http://slip-service:8086` (compose), `http://localhost:8086` (기본값) | `docker-compose.local-all.yml` 및 `docker-compose.prod.yml`의 `slip-service.SERVER_PORT: "8086"`; healthcheck도 `localhost:8086` | 일치 |
| `RestClientSlipServiceClient` | `slip-service`의 `GET /internal/slips/outbound` | 기본 base URL `http://localhost:8086` | 동일 `slip-service` 애플리케이션 포트 `8086`; client가 `/internal/slips/outbound` 경로를 붙임 | 일치 |
| `notification-service.SERVER_PORT` | `notification-service` 자체 | `8093` | local/prod compose의 `notification-service.SERVER_PORT: "8093"` | 일치 |
| `SAMHAN_NOTIFICATION_SERVICE_URL` | `notification-service` | `http://notification-service:8093` | local/prod compose의 notification-service 포트 `8093` 및 관련 서비스 주입값 | 일치 |
| 이전 오기입 `http://localhost:8084` | `product-service` | 해당 없음 | local/prod compose의 `product-service.SERVER_PORT: "8084"` | 잘못된 대상, 제거 |

`blocked` 조회 client는 `partner-service`의 실제 설정을 별도로 변경하지 않았으며, 이번 RED의 원인은 `blocked` URL/포트가 아니었다. 기존 fail-closed 동작과 수신자 그룹화 로직도 수정하지 않았다.

## 6. notification-service 전체 테스트

실행 명령:

```powershell
.\gradlew.bat :services:notification-service:test --no-daemon
```

Gradle 원문 요약:

```text
> Task :services:notification-service:test
BUILD SUCCESSFUL in 2m 20s
18 actionable tasks: 4 executed, 14 up-to-date
```

생성된 `build/test-results/test/TEST-*.xml` 38개를 합산한 결과:

```text
233 tests / 0 failures / 0 errors / 0 skipped
```

이 수정은 R4/R5의 실 전표 preview 도달, `blocked` 조회 fail-closed, 동일 수신번호 그룹화(초과 1,909 → 0) 로직을 변경하지 않았다. 해당 실 데이터 수치의 독립 재측정·실 SMS 발송은 이 작업에서 수행하지 않았다.

## 7. 파일별 변경량

| 파일 | 추가 | 삭제 | 내용 |
|---|---:|---:|---|
| `services/notification-service/src/main/resources/application.yml` | +1 | −1 | slip-service 기본 포트 8084 → 8086 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientSlipServiceClient.java` | +1 | −1 | Java URL 기본 포트 8084 → 8086 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/client/RestClientSlipServiceClientTest.java` | +1 | −1 | 테스트 base URL 계약 정렬 |
| `docs/dev-reports/2026-08-02-1013-r6-config-audit-fix.md` | +105 | −0 | 본 R6 보고서 신규 추가 |

## 8. 새 파일 경로 목록

```text
docs/dev-reports/2026-08-02-1013-r6-config-audit-fix.md
```

기존 `docs/dev-reports/2026-08-02-1013-*.md` 파일은 덮어쓰거나 축약하지 않았다. 이 작업에서는 commit, push, checkout/브랜치 조작, Docker 이미지 재빌드, 공유 DB write, 실제 SMS 발송을 수행하지 않았다.
