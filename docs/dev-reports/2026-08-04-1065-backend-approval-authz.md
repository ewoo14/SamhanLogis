# PR #1066 / 이슈 #1065 백엔드 결재선 인가 구현 기록

- 작업일: 2026-08-04
- 작업 브랜치: `fix/1065-outbound-inspect-approval-gate`
- 기준 HEAD: `40fb17faf`
- 범위: OUTBOUND 상세 조회 가드와 검수 결재 게이트의 전표 단위 결재선 인가
- 원칙: git 명령 없음, Docker 이미지 재빌드·서비스 재배포 없음, DB 쓰기 없음, 전체 테스트 없음

## 작업 전 확인

선행 진단 보고서 `docs/dev-reports/2026-08-04-1065-diagnosis.md`를 먼저 읽었다.

진단이 확정한 원인:

- `kimeunji`와 동일한 ACCOUNTANT 문맥의 `GET /slips/{id}`가 `SlipSalesAccessGuard.guardOutboundSalesRead`에서 403으로 차단된다.
- 기존 OUTBOUND 상세 조회 허용 조건은 SALES/MANAGER/MASTER 역할, 해당 built-in 그룹, system master이며 결재선 멤버 조건이 없다.
- 결재선 USER 조회 키와 요청 계정 식별자는 auth account UUID이다.
- 이슈 당시 계정·전표·결재자 행은 현재 DB에 없으므로 테스트에서 상태를 구성해야 한다.

개발책임자 결정:

> 결재선 지정 = 그 전표·그 액션 권한 자동 부여

결재선에 포함된 계정은 해당 전표의 해당 액션과 상세 조회를 허용하고, 다른 전표에는 권한이 전파되지 않아야 한다. 결재선 조회 실패나 빈 결괏값은 fail-open이 되면 안 된다.

## 단계 기록

### 단계 1 — 코드 경로 및 테스트 구조 조사

완료.

확인한 호출 흐름:

```text
GET /slips/{id}
  -> SlipService.getOne(id)
  -> SlipController.getOne(...)
  -> SlipSalesAccessGuard.guardOutboundSalesRead(response.slipType(), role, groups, systemMaster)
  -> 기존 role / built-in group / system master OR 판정
  -> 모두 false이면 FORBIDDEN
```

현재 검수 액션 흐름:

```text
POST /slips/{id}/inspect
  -> SlipService.inspect(id, inspectorUserId)
  -> approvalGateForInspect(slipType)
  -> enforceSlipApprovalLine(slip, inspectorUserId, gate)
  -> ApprovalLineAuthorizeClient.authorize(documentType, actionKey, userId)
```

현재 결재 인가 계약의 원문:

```text
ApprovalLineAuthorizeClient.authorize(String documentType, String actionKey, UUID userId)
POST /auth/internal/approval-line/authorize
ApprovalLineAuthorizeRequest(documentType, actionKey, userId)
```

현재 auth 스키마의 원문 구조:

```text
approval_line_config(document_type, sequence, action_key, ...)
approval_line_approver(config_role_id, approver_type, approver_ref_id, ...)
```

두 테이블과 내부 인가 요청에는 `slip_id` 또는 전표별 결재선 인스턴스 키가 없다. 따라서 현재 계약에 `allowed=true`만 추가해 상세 가드에 OR로 연결하면, 검수 결재자로 지정된 계정이 모든 OUTBOUND 전표에 허용된다. 이는 불변식 C를 위반한다.

**Root cause hypothesis:** 이슈의 403은 상세 조회 가드가 검수 결재자 인가를 호출하지 않아서 발생했지만, 현재 결재 인가 모델은 문서 유형·액션별 전역 설정만 표현한다. 전표 단위 C를 유지하려면 결재 인가 요청 또는 slip-service 내부의 결재선 인스턴스가 반드시 전표 ID를 포함해야 하며, 기존 `ApprovalLineAuthorizeClient.authorize(documentType, actionKey, userId)`만 재사용하는 수정은 안전한 fix가 아니다.

### 단계 2 — RED 테스트

완료. `SlipOutboundApprovalEnforcementIT`에 실 HTTP로 전표를 생성하고 `SENT → ACCEPTED → PROCESSING → INSPECTING`까지 전이한 뒤, 같은 ACCOUNTANT 결재선 계정의 A/B와 기존 SALES 경로 C를 각각 검증했다. 결재선 인가는 기존 `ApprovalLineAuthorizeClient` mock 계약(`SLIP_OUTBOUND`, `OUTBOUND_INSPECT`, auth account UUID)으로 구성했다.

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redA_outboundInspectApprovalMember_canReadAssignedSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redB_outboundInspectApprovalMember_cannotReadAnotherSlip" --tests "com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redC_existingSalesRole_canReadOutboundSlip" --no-daemon --console=plain
```

RED 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:slip-service:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:slip-service:processTestResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:slip-service:compileJava UP-TO-DATE
> Task :services:slip-service:classes UP-TO-DATE
> Task :services:slip-service:compileTestJava
> Task :services:slip-service:testClasses

> Task :services:slip-service:test

SlipOutboundApprovalEnforcementIT > redA_outboundInspectApprovalMember_canReadAssignedSlip() FAILED
    java.lang.AssertionError at SlipOutboundApprovalEnforcementIT.java:146

2026-08-04T11:32:01.934+09:00  INFO 28452 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-04T11:32:01.937+09:00  INFO 28452 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : Shutdown initiated...
2026-08-04T11:32:01.948+09:00  INFO 28452 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : Shutdown completed.

> Task :services:slip-service:test FAILED
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended

3 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1065/services/slip-service/build/reports/tests/test/index.html

* Try:
> Run with --scan to get full insights.

BUILD FAILED in 40s
```

실패 위치 원문:

```text
java.lang.AssertionError: Status expected:<200> but was:<403>
    at com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT.redA_outboundInspectApprovalMember_canReadAssignedSlip(SlipOutboundApprovalEnforcementIT.java:146)
```

해석:

- RED-A가 현재 403으로 실패했다.
- RED-B는 현재도 결재선 밖 전표 403 조건을 만족하지만, 전역 `allowed=true`를 추가하면 200으로 새는 것을 막기 위해 같은 `INSPECTING` 상태의 별도 전표로 작성했다.
- RED-C는 기존 SALES 경로 회귀를 확인하는 보호 테스트이며 현재 통과했다.

### 단계 3 — 최소 구현

중단.

현재 저장소 계약만으로는 RED-A와 RED-B를 동시에 GREEN으로 만들 수 없다. `ApprovalLineAuthorizeClient`와 auth 내부 API는 전표 ID를 받지 않으며, auth DB에도 전표별 결재자 연결이 없다. 이 계약에 전역 `allowed=true`를 연결하는 구현은 RED-B를 깨고 불변식 C를 위반한다. 전표별 결재선 인스턴스 API/저장 모델을 새로 정하는 것은 이번 지시의 `SlipSalesAccessGuard`·`SlipService` 범위를 넘어서는 의미 있는 확장이라 사용자 결정 없이 진행하지 않았다.

### 단계 3 — 최소 구현

아직 실행 전.

### 단계 4 — GREEN 검증

아직 실행 전.

## 이 라운드가 보지 않은 것

- `clients/desktop/**` 프런트 권한 판정과 버튼 disabled 문제. 프런트는 PR #1057 머지 후 별도 라운드에서 다룬다.
- `services/slip-service/**/web/dto/SlipDetailResponse.java`. PR #1057과 충돌하므로 수정하지 않는다.
- `services/accounting-service/**`와 `services/inventory-service/**`. 각각 PR #1061, #1067 범위이므로 수정하지 않는다.
- 권한 시드와 역할 permission 키. 결재선 기반 인가는 역할 권한 확대가 아니므로 변경하지 않는다.
- 이슈 당시 실계정 `kimgicheol`, `kimeunji`, 전표 `2026/08/03-6` 및 당시 결재자 행. 현재 DB에 없어 테스트 fixture로 대체한다.
- Docker 이미지, 실행 중 서비스의 배포 상태, 라이브 QA 상태. 재빌드·재배포하지 않는다.
- 현재 A2 결재선 설정 API가 전표 종류별 전역 설정만 지원한다는 계약 공백. 이 라운드의 승인 여부가 특정 `slipId`에 귀속되는 신규 API/저장 모델은 구현 전 결정이 필요하다.

## 다음 단계 프런트 소비 계약 제안

구현은 하지 않는다. 프런트는 기존 역할 permission만으로 결재선 멤버의 전표별 접근 가능 여부를 추정하지 말고, 상세 응답 또는 전용 읽기 API가 제공하는 **현재 계정의 해당 전표·액션별 결재선 인가 결과**를 사용해야 한다. 결과는 최소한 `slipId`, `actionKey`, `canRead`, `canExecute`를 전표 범위로 묶어 제공하고, 다른 전표의 권한으로 재사용하지 않아야 한다. 결재선 미포함·조회 실패는 `false`로 소비하며, 기존 SALES/MANAGER/MASTER·built-in 그룹·system master 경로의 허용 결과는 그대로 유지해야 한다.
