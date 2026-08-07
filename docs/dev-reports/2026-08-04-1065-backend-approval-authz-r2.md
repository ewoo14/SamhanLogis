# PR #1066 / 이슈 #1065 백엔드 결재선 인가 구현 r2 기록

- 작업일: 2026-08-04
- 작업 브랜치: `fix/1065-outbound-inspect-approval-gate`
- 작업 시작 기준 HEAD: `7066df3e9`
- 범위: `SlipSalesAccessGuard.guardOutboundSalesRead`의 OUTBOUND 상세 조회 인가와 `SlipService` 검수 결재 게이트
- 원칙: git 명령 없음, Docker 이미지 재빌드·서비스 재배포 없음, DB 쓰기 없음, 지정 금지 경로 수정 없음, 직접 관련 테스트만 실행

## 개발책임자 결정 반영

직전 라운드는 결재선을 전표별 인스턴스로 해석했으나, 현재 데이터 모델과 인가 계약은 `문서유형 × 액션` 단위 전역 설정만 표현한다. 따라서 이번 라운드는 전표 ID를 새로 도입하거나 전표별 결재선 모델을 만들지 않고, 다음 경계로 구현한다.

```text
결재선에 있는가? ∧ 이 액션이 유효한 상태인가?
  → 예: 조회·실행 허용
  → 아니오: 기존 permission 키 판정
```

허용 범위는 `OUTBOUND × INSPECTING × 검수 결재자`로 한정한다. 같은 계정의 다른 상태 OUTBOUND 전표는 기존 permission 판정으로 돌아가므로 403이어야 한다. 기존 SALES/MANAGER/MASTER 역할, built-in 그룹, system master 경로는 그대로 유지한다. 결재선 조회 실패·빈 결과는 fail-open하지 않는다.

## RED 테스트 갱신 근거

직전 `redB`는 “같은 결재선 계정이어도 다른 전표는 403”이라는 전표별 결재선 인스턴스를 전제했다. 그러나 결재선 설정·내부 인가 요청·auth 스키마 어디에도 `slip_id`가 없고, 개발책임자는 해당 결재선이 모든 출고 전표의 검수자 지정이라고 정정했다. 따라서 `redB`는 삭제하지 않고 “같은 결재선 계정이 `INSPECTING`이 아닌 OUTBOUND 전표를 조회하면 403”으로 갱신한다. 이 테스트가 상태 경계를 고정한다.

## 단계 기록

### 단계 1 — 코드·계약·테스트 조사

완료.

확인한 현재 호출 흐름:

```text
GET /slips/{id}
  -> SlipController.getOne(id, role, groups, systemMaster)
  -> SlipService.getOne(id)
  -> SlipSalesAccessGuard.guardOutboundSalesRead(slipType, role, groups, systemMaster)
  -> role / built-in group / system master OR 판정
  -> 모두 false이면 FORBIDDEN
```

현재 상세 조회에는 `X-User-Id`, 전표 상태, 검수 액션 결재선 결과가 가드 입력으로 전달되지 않는다. 반면 검수 실행은 `SlipService.inspect`에서 `approvalGateForInspect`와 `enforceSlipApprovalLine`을 통해 동일한 `SLIP_OUTBOUND × OUTBOUND_INSPECT` 결재선 client를 호출한다.

결정한 최소 변경:

- `SlipController.getOne`에 현재 계정 `X-User-Id`를 받도록 한다.
- `SlipService`에 OUTBOUND 검수 결재선 조회를 위임하는 읽기용 메서드를 추가하고, 조회 실패는 `false`로 귀결시켜 상세 가드가 403으로 닫히게 한다. 기존 `enforceSlipApprovalLine`이 사용하는 동일 client·문서유형·액션키를 재사용한다.
- `SlipSalesAccessGuard.guardOutboundSalesRead`에 상태와 결재선 허용 결과를 받는 오버로드를 추가한다. `slipType == OUTBOUND && status == INSPECTING && approvalLineAllowed`일 때만 추가 허용하며, 그 밖에는 기존 `canReadOutboundSales` OR 판정을 그대로 적용한다.
- SALES/MANAGER/MASTER 역할, 허용 built-in 그룹, system master는 결재선 client 호출 여부와 무관하게 기존 조건으로 먼저 통과시킨다.

**Root cause:** 상세 조회 가드의 입력 계약에 검수 액션의 유효 상태와 현재 계정의 결재선 결과가 없었다. 전표별 결재선 인스턴스는 데이터 모델에 없으므로, 이번 결정에 맞게 전역 `OUTBOUND_INSPECT` 결재선은 `INSPECTING` 상태에만 적용한다.

### 단계 2 — RED 테스트

완료. `redB`는 전표별 결재선 전제를 제거하고 `SENT` 상태의 비검수 OUTBOUND 전표로 갱신했다. 실행 대상은 갱신된 `redA`, `redB`, `redC` 세 테스트다.

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redA_outboundInspectApprovalMember_canReadAssignedSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redB_outboundInspectApprovalMember_cannotReadNonInspectingSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redC_existingSalesRole_canReadOutboundSlip" --no-daemon --console=plain
```

RED 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:slip-service:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:slip-service:processTestResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :services:slip-service:compileJava UP-TO-DATE
> Task :services:slip-service:classes UP-TO-DATE
> Task :services:slip-service:compileTestJava
> Task :services:slip-service:testClasses

> Task :services:slip-service:test

SlipOutboundApprovalEnforcementIT > redA_outboundInspectApprovalMember_canReadAssignedSlip() FAILED
    java.lang.AssertionError at SlipOutboundApprovalEnforcementIT.java:146

2026-08-04T11:48:47.200+09:00  INFO 30848 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-04T11:48:47.203+09:00  INFO 30848 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown initiated...
2026-08-04T11:48:47.208+09:00  INFO 30848 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown completed.

> Task :services:slip-service:test FAILED
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes and appended

3 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1065/services/slip-service/build/reports/tests/test/index.html

* Try:
> Run with --scan to get full insights.

BUILD FAILED in 45s
```

결과: `redA`는 기존 403으로 실패했고, 갱신된 상태 경계 `redB`와 기존 SALES 경로 `redC`는 통과했다.

### 단계 3 — 최소 구현

완료.

변경 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipSalesAccessGuard.java`
  - `SlipStatus`와 `approvalLineAllowed`를 받는 단건 조회용 오버로드 추가.
  - `OUTBOUND && INSPECTING && approvalLineAllowed`일 때만 결재선 경로 허용.
  - 그 외에는 기존 role/built-in group/system master OR 판정을 그대로 적용.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
  - 검수 실행과 단건 조회가 동일한 `ApprovalLineAuthorizeClient`·문서유형·액션키를 사용하도록 조회 helper 정리.
  - `isOutboundInspectApprovalMember`에서 `configured && allowed`만 허용.
  - auth 호출 예외·빈 결과는 `false`로 닫아 상세 조회 가드가 403 판정하도록 처리.
  - 검수 실행의 기존 `configured && !allowed` 거부 동작은 유지.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java`
  - `X-User-Id`를 단건 조회에 전달.
  - 기존 역할 경로가 허용하지 않을 때만 검수 결재선 판정을 조회하고, 전표 상태와 함께 가드에 전달.
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipOutboundApprovalEnforcementIT.java`
  - `redB`를 전표별 결재선 전제에서 비-`INSPECTING` 상태 경계로 갱신.

### 단계 4 — GREEN 검증

완료. 갱신된 `redA`, `redB`, `redC`를 같은 Gradle 명령으로 실행했고 세 테스트가 모두 통과했다.

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redA_outboundInspectApprovalMember_canReadAssignedSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redB_outboundInspectApprovalMember_cannotReadNonInspectingSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redC_existingSalesRole_canReadOutboundSlip" --no-daemon --console=plain
```

GREEN 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:slip-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:slip-service:processTestResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :services:slip-service:compileJava
> Task :services:slip-service:classes

> Task :services:slip-service:compileTestJava

> Task :services:slip-service:testClasses
2026-08-04T11:51:46.448+09:00  INFO 21712 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-04T11:51:46.451+09:00  INFO 21712 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : Shutdown initiated...
2026-08-04T11:51:46.457+09:00  INFO 21712 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown completed.
> Task :services:slip-service:test

BUILD SUCCESSFUL in 48s
18 actionable tasks: 3 executed, 15 up-to-date
Note: D:\dev\Samhan-Public\.claude\worktrees\w1065\services\slip-service\src\test\java\com\samhanair\logis\slip\service\SlipServiceTest.java uses unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### 단계 5 — 직접 관련 회귀 검증

`SlipOutboundApprovalEnforcementIT` 전체(검수 실행·수락·입고 회귀 포함), `SlipSalesAccessGuardTest`, `ApprovalLineAuthorizeClientTest`를 실행했다. 전체 테스트 스위트는 실행하지 않았다.

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT" --tests "com.samhanair.logis.slip.web.SlipSalesAccessGuardTest" --tests "com.samhanair.logis.slip.client.ApprovalLineAuthorizeClientTest" --no-daemon --console=plain
```

검증 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:slip-service:processResources UP-TO-DATE
> Task :services:slip-service:processTestResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :services:slip-service:compileJava UP-TO-DATE
> Task :services:slip-service:classes UP-TO-DATE
> Task :services:slip-service:compileTestJava UP-TO-DATE
> Task :services:slip-service:testClasses UP-TO-DATE
2026-08-04T11:53:08.535+09:00  INFO 8256 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-04T11:53:08.538+09:00  INFO 8256 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown initiated...
2026-08-04T11:53:08.546+09:00  INFO 8256 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown completed.
> Task :services:slip-service:test

BUILD SUCCESSFUL in 39s
18 actionable tasks: 1 executed, 17 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

결과: 실패 0건.

## RED 원문

단계 2에 실행 명령과 RED 실행 결과 원문을 기록했다.

## GREEN 원문

단계 4에 세 테스트 GREEN 실행 결과 원문을, 단계 5에 직접 관련 회귀 실행 결과 원문을 기록했다.

## 불변식 확인 및 신규 파일

- A: `INSPECTING` OUTBOUND의 검수 결재선 계정 상세 조회 — `redA` GREEN.
- B: 같은 `OUTBOUND_INSPECT` 결재선 판정은 `SlipService.inspect` 실행 게이트에서도 유지 — 기존 `outboundInspect_nonApprover403_approver200` 포함 전체 IT GREEN.
- C: `INSPECTING`이 아닌 OUTBOUND는 결재선 결과가 있어도 기존 가드로 403 — 갱신 `redB` GREEN.
- D: 기존 SALES 경로와 role/group/system-master OR 판정 보존 — `redC` 및 `SlipSalesAccessGuardTest` GREEN. 기존 허용 경로에는 결재선 client 호출도 추가하지 않았다.
- E: 결재선 결과가 null이거나 auth 호출이 `BusinessException`으로 실패하면 조회용 판정은 `false`로 닫힌다. 상태·기존 권한이 동시에 허용하지 않는 한 가드는 403을 발생시킨다.

신규 파일:

- `docs/dev-reports/2026-08-04-1065-backend-approval-authz-r2.md` — 이번 라운드 작업·RED/GREEN·범위 보고서.

신규 제품 코드 파일은 없다.

## 프런트가 소비할 인가 계약 제안 (구현하지 않음)

프런트는 역할 permission만으로 결재선 멤버의 접근 가능 여부를 추정하지 말고, 백엔드가 계산한 현재 계정의 전표·액션별 결과를 소비해야 한다. 제안 응답은 최소 `slipId`, `actionKey`, `canRead`, `canExecute`를 포함하며, `OUTBOUND × INSPECTING × OUTBOUND_INSPECT`에서만 결재선 결과를 반영한다. 결재선 미포함·조회 실패는 `false`로 소비하고, 기존 역할·그룹·system master 허용 결과는 유지한다.

## 이 라운드가 보지 않은 것

- `clients/desktop/**` 프런트 권한 판정, 버튼 disabled, 상세 응답 표시. 별도 PR 범위다.
- `services/slip-service/**/web/dto/SlipDetailResponse.java`. 동시 PR 범위라 수정하지 않는다.
- `services/accounting-service/**`, `services/inventory-service/**`. 동시 PR 범위라 수정하지 않는다.
- 권한 시드 및 역할 permission 키 변경. 이번 결정은 결재선 기반 인가이며 역할 권한 확대가 아니다.
- 전표별 결재선 인스턴스 저장 모델·API 신설.
- Docker 이미지 재빌드, 서비스 재배포, DB 쓰기, 라이브 QA.
- 전체 테스트 스위트와 `SlipOutboundApprovalEnforcementIT` 직접 관련 범위를 벗어난 테스트.
