# #1161 S2a 감사 발행자 구현 보고서

## 2026-08-12 시작 및 RED 기준

범위: `shared:audit-contract`, `shared:audit-publisher`, logging-service consumer/safe DTO, dc-config-service pilot, partner-auth-service pilot, desktop 개발자 로그 메뉴. S1.5 미완료에 따라 운영 queue arguments 변경 및 12개 publisher 활성화는 하지 않는다.

### 전제 확인 원문

```text
rg -n --glob 'services/*/src/main/java/**/*.java' 'RabbitTemplate|AmqpTemplate|CorrelationData|convertAndSend' services
[출력 없음]
```

현재 consumer가 blank id를 UUID로 생성하는 원문:

```java
private static String blankToUuid(String id) {
    return (id == null || id.isBlank()) ? UUID.randomUUID().toString() : id;
}
```

현재 사용자 응답이 raw resourceId/description을 통과시키는 원문:

```java
blankToDash(row.getResourceId()),
blankToDash(row.getDescription()),
```

### RED-1: `samhan.audit` 발행 부재

실행 명령:

```powershell
rg -n --glob 'services/*/src/main/java/**/*.java' 'RabbitTemplate|AmqpTemplate|CorrelationData|convertAndSend' services
```

실행 결과:

```text
[출력 없음]
```

이 기준은 현재 pilot에 publisher가 없음을 보여 준다. 자동화 RED 테스트는 Task 1에서 추가하고 실행 원문을 이어 붙인다.

### RED 테스트 원문

실행 명령:

```powershell
./gradlew :services:logging-service:test --tests '*S2aRedGateTest' --no-daemon
```

실행 결과:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked.
> Task :services:logging-service:test FAILED

S2aRedGateTest > activityResponse_neverExposesUuidAsDisplayedResourceOrDescription() FAILED
    java.lang.AssertionError at S2aRedGateTest.java:42

S2aRedGateTest > samhanAuditPublisher_isPresentAndReadyToPublish() FAILED
    java.lang.ClassNotFoundException at S2aRedGateTest.java:17

S2aRedGateTest > pilotWiring_exposesFailSoftPublisher() FAILED
    java.lang.ClassNotFoundException at S2aRedGateTest.java:23

3 tests completed, 3 failed

FAILURE: Build failed with an exception.
> There were failing tests. See the report at: file:///C:/dev/Samhan-Public/.claude/worktrees/w1161b/services/logging-service/build/reports/tests/test/index.html
BUILD FAILED in 18s
```

RED 원인: 공통 publisher 클래스/배선이 없고, 현재 ActivityLog 응답 생성 경로가 `resourceId`와 `description`을 표시값으로 직접 복사한다. Rabbit 장애 업무 실패 경로는 publisher 자체가 없어 fail-soft 계약을 제공하지 못하는 상태를 두 번째 RED gate로 고정했다.

### RED → GREEN 원문

구현 후 재실행:

```powershell
./gradlew :services:logging-service:test --tests '*S2aRedGateTest' --no-daemon
```

```text
> Task :services:logging-service:test
BUILD SUCCESSFUL in 16s
```

공통 계약/Publisher 및 세 pilot 컴파일:

```powershell
./gradlew :shared:audit-contract:test :shared:audit-publisher:test :services:logging-service:compileJava :services:dc-config-service:compileJava :services:partner-auth-service:compileJava --no-daemon
```

```text
> Task :services:logging-service:compileJava
> Task :services:dc-config-service:compileJava
> Task :services:partner-auth-service:compileJava
BUILD SUCCESSFUL in 15s
```

### RED-2: Rabbit 장애 시 업무 실패

현재 publisher/업무 연계 코드가 없으므로 장애 주입 테스트를 먼저 작성해, fail-soft 구현 전 업무 경로가 `AuditPublisher` 부재/동기 발행 계약을 충족하지 못하는 실패를 기록한다.

### RED-3: UUID 응답 노출

현재 `ActivityLogService`는 `resourceId`와 `description`을 표시 필드로 직접 복사한다. UUID fixture를 넣는 RED 테스트는 sanitizer 적용 전 노출을 검증 실패로 기록한다.

## 실행 원문 누적

(다음 측정부터 결과를 이 섹션에 이어 붙인다.)

### 격리 RabbitMQ 왕복 원문

실행 명령:

```powershell
./gradlew :shared:audit-publisher:test --tests '*AuditRabbitRoundTripIT' --no-daemon
```

```text
> Task :shared:audit-publisher:test
BUILD SUCCESSFUL in 24s
```

Testcontainers의 `rabbitmq:3.13-management-alpine` 격리 컨테이너와 임시 exclusive queue에서 `partner-auth-service` v2 이벤트를 publish 후 receive했고 `serviceName=partner-auth-service`를 확인했다.

### 변경 모듈 전량 테스트 원문

공통:

```text
./gradlew :shared:audit-contract:test :shared:audit-publisher:test --no-daemon
BUILD SUCCESSFUL in 12s
```

logging-service:

```text
./gradlew :services:logging-service:test --no-daemon
BUILD SUCCESSFUL in 1m 4s
```

dc-config-service:

```text
./gradlew :services:dc-config-service:test --no-daemon
BUILD SUCCESSFUL in 48s
```

partner-auth-service:

```text
./gradlew :services:partner-auth-service:test --no-daemon
BUILD SUCCESSFUL in 11s
```

초기 전량 실행에서 발생한 controller 생성자/RabbitTemplate 회귀를 수정한 뒤 위 전량 결과가 모두 통과했다. 기존 서비스별 audit/revision/history entity와 migration은 삭제하거나 변경하지 않았다.

중간 실패 원문(수정 전):

```text
PartnerAuthExceptionHandlerHttpMessageTest.java:19:
constructor PartnerAuthController ... cannot be applied to given types

DcConfigPermissionControllerIT:
No qualifying bean of type 'com.samhanair.logis.shared.audit.publisher.AuditPublisher'
No qualifying bean of type 'org.springframework.amqp.rabbit.core.RabbitTemplate'

79 tests completed, 32 failed
```

수정 후 동일 모듈 전량 결과는 위의 `BUILD SUCCESSFUL` 원문으로 재검증했다.

### desktop typecheck 원문

초기 실행은 다음 로컬 파생물 부재로 중단됐다:

```text
[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다.
- file: 의존 design-system dist이(가) 없습니다: ..\web\design-system\dist\index.d.ts.
```

격리된 `npm ci`와 design-system build 후 재실행:

```text
> @samhan/desktop@0.1.0 typecheck
> ... tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit ...
✔ ... real-QA ... pass 51
```

```text
Process exited with code 0
```

desktop mock 개발자 로그 메뉴에 dc-config-service/partner-auth-service pilot event 2건과 안전한 label을 추가했다. 화면 표시 fixture에는 UUID를 넣지 않았고, backend safe DTO도 UUID fallback을 사용하지 않는다.

### S2a 게이트 확인

- `samhan.audit.exchange`의 기존 exchange/queue/dlx 이름과 durable queue arguments는 변경하지 않았다.
- `shared:audit-publisher`는 A/B lane과 C lane을 분리하고 `offer`만 사용한다. Rabbit publish 예외는 worker에서 흡수한다.
- 두 pilot만 `samhan.audit.publisher.enabled: true`이고, 나머지 12개 서비스 build/application에는 publisher 의존/enablement를 추가하지 않았다.
- logging-service v1 blank id fallback은 호환 경로로 남기고 v2 blank id는 허용하지 않는 방향의 계약을 유지했다. 동일 event id 저장은 Elasticsearch ID upsert semantics에 의존한다.

최종 공통 재검증:

```text
./gradlew :shared:audit-contract:test :shared:audit-publisher:test --no-daemon
BUILD SUCCESSFUL in 30s

Test-Path AuditEventV2.java              True
Test-Path AuditPublisher.java            True
Test-Path SafeAuditLogResponse.java      True
Test-Path ActivityLogPage.tsx            True

publisher 의존 서비스 검색 결과:
services\logging-service\build.gradle
services\partner-auth-service\build.gradle
services\dc-config-service\build.gradle
```

### 라운드 종료 확인

삭제된 추적 파일 확인: 이번 라운드에서 삭제 명령/삭제 patch를 수행하지 않았으며, 생성·수정 대상으로 지정한 파일은 모두 존재한다. `git` 명령은 사용자 금지 지시에 따라 실행하지 않았다.

## 라운드 종료 확인

삭제된 추적 파일 확인: 아직 최종 확인 전.
