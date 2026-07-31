# PR #1006 / Issue #895 슬라이스 2 fix 라운드 보고서

## 범위

- 검증일: 2026-07-31 (KST)
- 대상 브랜치: `feat/895-schedule-s2`
- 수정 대상: 그룹웨어 관리자 v1 게이트웨이 라우팅, 일정 soft-delete 시 대상자 연쇄 정리
- 금지 범위: 소유자 존재 확인 완화, 일정 UI·캘린더·대시보드·공유·종일·알림, 내부 채팅
- git commit/push/merge: 수행하지 않음

## 사전 확인 및 라우팅 규약

`clients/desktop/src/renderer`를 직접 grep한 결과 일정 API 호출부는 아직 없었다. 같은 그룹웨어 도메인의 실제 관리자 CRUD 호출은 다음 규약을 사용한다.

- `clients/desktop/src/renderer/api/groupwareApproval.ts`: `/admin/groupware/approvals...`
- `clients/desktop/src/renderer/api/documentTemplate.ts`: `/admin/groupware/document-templates...`
- `clients/desktop/src/renderer/api/messengerApi.ts`: `/admin/groupware/messages...`
- 인증 전용 활성 조회만 `/groupware/...`를 사용한다.

기존 게이트웨이 정의도 이를 확인한다.

- `groupware-service-noprefix`: `/admin/groupware/**,/groupware/**` → no-strip
- `groupware-service-v1`: `/api/v1/groupware/**` → `StripPrefix=2` 후 `/groupware/**`

따라서 `/api/v1/groupware/admin/groupware/**`처럼 `groupware`를 중복하는 새 경로는 채택하지 않았다. 표준 v1 관리자 외부 경로 `/api/v1/admin/groupware/**`를 추가하고 `StripPrefix=2`로 기존 서비스 경로 `/admin/groupware/**`에 전달하도록 했다.

## ① 게이트웨이 경로

### RED

추가한 회귀 테스트:

```text
ApiGatewayContextLoadIT > 그룹웨어 관리자 v1 라우트는 기존 /admin/groupware 규약으로 전달 FAILED
java.lang.AssertionError at ApiGatewayContextLoadIT.java:432
FAILURE: Build failed with an exception.
BUILD FAILED
종료코드: 1
```

실패 원인은 `groupware-admin-v1` 라우트가 존재하지 않았기 때문이다.

### 변경 요지

`services/api-gateway/src/main/resources/application.yml`에 다음 라우트를 generic v1 라우트보다 앞에 추가했다.

```yaml
- id: groupware-admin-v1
  uri: lb://groupware-service
  predicates:
    - Path=/api/v1/admin/groupware/**
  filters:
    - StripPrefix=2
    - JwtAuthentication
```

기존 `groupware-service-v1`와 `groupware-service-noprefix`의 경로·필터는 변경하지 않았다.

### GREEN 및 전체 테스트

- 명령: `./gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayContextLoadIT.groupwareAdminV1Route_usesExistingAdminGroupwareContract --console=plain`
- 결과: 통과, 종료코드 `0`
- 명령: `./gradlew.bat :services:api-gateway:test --console=plain`
- 결과: 통과, 종료코드 `0`

테스트는 신규 경로의 Path, `StripPrefix=2`, JWT 인증, generic route보다 선행 선언을 검증한다. 기존 그룹웨어 라우트의 영향 건수는 **0건**이다.

### 재배포 후 실제 호출 증거

api-gateway는 개발책임자가 지정한 “groupware-service·auth-service 외 서비스 재빌드·재기동 금지” 범위에 포함되지 않아 재기동하지 않았다. 따라서 신규 소스 라우트가 실행 중인 게이트웨이에 반영되지 않았다.

- 실행 중 컨테이너: `samhan-api-gateway`, 기존 기동 시각 `2026-07-30T21:38:58.357537796Z`
- 실제 호출: `GET http://localhost:8080/api/v1/admin/groupware/schedules?...`
- 결과: HTTP `404`, 종료코드 `0`(호출 명령 자체 종료)
- 판정: **소스 테스트 PASS / 라이브 게이트웨이 재배포 BLOCKED**

기존 데스크톱 규약 경로는 재배포된 groupware를 통해 확인했다.

- 실제 호출: `POST http://localhost:8080/admin/groupware/schedules`
- 결과: HTTP `201`
- 실제 호출: `DELETE http://localhost:8080/admin/groupware/schedules/{throwawayId}`
- 결과: HTTP `200`

즉 데스크톱이 실제 사용하는 `/admin/groupware/**` 경로는 정상이며, 신규 v1 라우트는 api-gateway 재배포 후에만 라이브 확인할 수 있다.

## ② 일정 soft-delete 대상자 연쇄 정리

### RED

추가한 단위 테스트:

```text
ScheduleServiceTest > delete_soft_deletes_all_schedule_participants() FAILED
java.lang.AssertionError at ScheduleServiceTest.java:121
1 test completed, 1 failed
FAILURE: Build failed with an exception.
BUILD FAILED
종료코드: 1
```

기존 `ScheduleService.delete()`는 일정만 `markDeleted()`하고 `ScheduleParticipant`에는 삭제 표시를 하지 않았다.

### 변경 요지

`ScheduleService.delete()`에서 권한 확인을 통과한 뒤 일정의 모든 대상자 행에 동일한 호출자 식별자로 `markDeleted()`를 적용했다. hard delete나 기존 데이터 migration은 수행하지 않았다.

### GREEN 및 전체 테스트

- 명령: `./gradlew.bat :services:groupware-service:test --tests com.samhanair.logis.groupware.service.ScheduleServiceTest.delete_soft_deletes_all_schedule_participants --console=plain`
- 결과: 통과, 종료코드 `0`
- 명령: `./gradlew.bat :services:groupware-service:test --console=plain`
- 결과: `BUILD SUCCESSFUL`, 종료코드 `0`

### 재배포 후 실제 호출 증거

최초 Compose build에서 JAR COPY가 cache hit인 것을 발견해 `bootJar`를 명시적으로 다시 만들고 groupware만 재배포했다.

- 명령: `./gradlew.bat :services:groupware-service:bootJar --console=plain`
- 결과: `BUILD SUCCESSFUL`, 종료코드 `0`
- 명령: `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build groupware-service`
- 결과: 이미지 재생성, 종료코드 `0`
- 명령: `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --no-deps groupware-service`
- 결과: `samhan-groupware-service healthy`, 종료코드 `0`

`dev_master`로 전용 throwaway 일정을 만들고 기존 데스크톱 규약 경로로 삭제했다.

- 생성: HTTP `201`
- 삭제: HTTP `200`
- 삭제 후 SQL 확인: `schedules.is_deleted=t`, `schedule_participants.is_deleted=t`

### 영향 건수 및 정리

검증용 `QA895%` 일정 3건만 전용 throwaway로 식별했다. 참여자 행 2건은 기존 QA 잔재였고, 이번 fix throwaway 행 1건은 이미 애플리케이션 삭제로 정리됐다. cleanup SQL은 기존 데이터가 아닌 `QA895%` soft-deleted throwaway의 활성 참여자 **2건**에만 적용했다.

최종 SQL 결과:

```text
schedules 전체/활성                 45 / 42
schedule_participants 전체/활성     109 / 106
QA895 throwaway 일정 참여자         모두 is_deleted=true
```

기존 활성 데이터 불변식인 일정 42건·대상자 106건은 유지됐다. hard delete는 0건이다.

## 신규 파일

- `docs/dev-reports/2026-07-31-895-s2-r2-gateway-cascade-fix.md`

## `git status --porcelain` 원문

```text
 M services/api-gateway/src/main/resources/application.yml
 M services/api-gateway/src/test/java/com/samhanair/logis/gateway/it/ApiGatewayContextLoadIT.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ScheduleServiceTest.java
?? docs/dev-reports/2026-07-31-895-s2-r2-gateway-cascade-fix.md
```

## 이번에 안 본 것

- api-gateway 컨테이너 재빌드·재기동 및 신규 `/api/v1/admin/groupware/**` 라이브 정상 응답: 다른 서비스 작업 금지 제약으로 수행하지 않음
- `auth-service` 코드·재배포: 이번 두 결함의 변경 대상이 아니므로 수행하지 않음
- 소유자 존재 확인 로직과 `employees.account_id` 데이터 정합성: 제품 범위 밖이며 완화하지 않음
- 일정 UI, 캘린더, 대시보드 위젯, 부서/전사 공유, 종일 일정, 알림, 내부 채팅
