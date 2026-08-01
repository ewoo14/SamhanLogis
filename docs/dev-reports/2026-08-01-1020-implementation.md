# 2026-08-01-1020 끊어진 직원-사용자 계정 참조 복구 구현 보고서

## 1. 작업 시작 및 정찰 결과 확인

- 요청대로 구현 보고서를 먼저 생성했다.
- 정찰 보고서를 읽고 대상은 `user-service`의 직원 계정 논리 참조로 한정했다.
- 활성 직원 24건 중 끊어진 참조 16건이며, 16건 모두 재직자·동명이인 없음·이름과 로그인 ID가 각각 정확히 1건 일치한다.
- 정상 8건은 기존 참조를 변경하지 않아야 한다.
- 구현은 미리보기와 적용을 분리하고, 건별 매칭 근거를 기록해야 한다.

## 2. 설계 결정

- auth-service를 수정하지 않는 범위에서 후보 목록을 user-service 내부 수리 API로 받는다.
- `preview`는 이름+로그인 ID의 정확 일치 및 후보 수 1건을 검증해 연결 예정 목록을 저장하고 반환한다.
- `apply`는 계획 키로 저장된 후보를 다시 검증한 뒤에만 `Employee.linkToAccount(...)`를 호출한다.
- 정상 참조 직원은 preview 대상에서 제외하며, 각 계획 항목에 이름/로그인 ID 일치 근거를 저장한다.
- 적용·미리보기 기록은 신규 Flyway migration의 soft-delete/audit 구조로 남긴다.

## 3. RED — 실패 테스트 원문

실행:

```text
./gradlew :services:user-service:test --tests com.samhanair.logis.user.service.EmployeeAccountLinkReconciliationServiceTest --no-daemon
```

결과:

```text
> Task :services:user-service:compileTestJava FAILED
...EmployeeAccountLinkReconciliationServiceTest.java:11: error: cannot find symbol
import com.samhanair.logis.user.repository.EmployeeAccountLinkRepository;
... error: cannot find symbol EmployeeAccountLinkRepository
... error: cannot find symbol method findAllActiveByLoginIds(List<String>)
... error: cannot find symbol EmployeeAccountLinkReconciliationService
... error: package EmployeeAccountLinkReconciliationService does not exist
... error: cannot find symbol LinkStatus
... error: cannot find symbol EmployeeAccountLink

BUILD FAILED
```

기능 부재로 컴파일 실패하는 RED를 확인했으며, 이 시점 이후 구현을 시작한다.

## 4. GREEN — 최소 구현 및 단위 테스트

- `EmployeeAccountLinkReconciliationService`를 추가했다.
- 미리보기는 정확한 `full_name`+`login_id` 일치가 1건일 때만 계획을 저장하고, 이미 같은 account_id인 정상 행은 건너뛴다.
- 적용은 계획 키로 PLANNED 행만 읽고 직원의 현재 이름·로그인 ID·기존 account_id를 재검증한 뒤 `Employee.linkToAccount`로 변경한다.
- 연결 근거는 `full_name exact; login_id exact`로 건별 저장한다.
- RED 후 수정된 단위 테스트 결과:

```text
> Task :services:user-service:test
BUILD SUCCESSFUL in 22s
1 test completed, 0 failed
```

추가 회귀 테스트로 후보 2건은 계획하지 않고, 기존 정상 직원(account_id == employee.id)은 계획하지 않는 경우를 확인했다.
신규 3개 테스트 전체 결과:

```text
> Task :services:user-service:test
BUILD SUCCESSFUL in 20s
3 tests completed, 0 failed
```

## 5. 적용 경로 및 감사 migration

- `POST /admin/user/employee-account-links/preview`: 후보 목록을 검증하고 계획 키와 연결 예정 목록을 반환한다.
- `POST /admin/user/employee-account-links/{planKey}/apply`: 사용자가 확인한 계획 키만 별도 적용한다.
- `V12__add_employee_account_link_reconciliation.sql`에 신규 감사 테이블을 추가했다. 기존 migration은 수정하지 않았다.
- 감사 행은 `BaseEntity`의 7개 audit 필드와 soft delete를 포함하며, 이름·로그인 ID exact 일치 근거와 적용 상태를 건별 보존한다.
- API 응답에는 계정 UUID나 직원 UUID를 넣지 않고 담당자 이름·로그인 ID·근거만 반환한다.
- D 충족 수단은 preview 응답의 계획 키/연결 예정 목록이며, apply는 그 키를 별도 호출해야만 실행된다.

## 6. 정상 경로 보호 및 최종 비-Docker 검증

- 정상 직원 보호를 강화해 `employee.id == employee.account_id`인 행은 후보가 잘못 제출되어도 무조건 계획에서 제외한다.
- 기존 담당자 등록·수정/역할 변경·퇴사 경로는 새 검증 서비스를 호출하지 않으며, 기존 `EmployeeProvisioningServiceTest`를 포함한 service 패키지 테스트가 통과했다.
- 변경 모듈의 Docker 비의존 테스트 패키지(client/config/domain/service/web)를 전부 실행했다.

실행:

```text
./gradlew :services:user-service:test --tests 'com.samhanair.logis.user.client.*' --tests 'com.samhanair.logis.user.config.*' --tests 'com.samhanair.logis.user.domain.*' --tests 'com.samhanair.logis.user.service.*' --tests 'com.samhanair.logis.user.web.*' --no-daemon
```

결과 원문:

```text
> Task :services:user-service:test
BUILD SUCCESSFUL in 19s
13 actionable tasks: 1 executed, 12 up-to-date
```

최종 변경 후 핵심 service 패키지도 재실행했다.

```text
./gradlew :services:user-service:test --tests 'com.samhanair.logis.user.service.*' --no-daemon
> Task :services:user-service:test
BUILD SUCCESSFUL in 22s
13 actionable tasks: 2 executed, 11 up-to-date
```

`com.samhanair.logis.user.it.*` Testcontainers IT는 정적 초기화에서 PostgreSQL Docker 컨테이너를 시작하고 DB에 쓰므로, “Docker 재빌드·재기동 금지 / DB 읽기 전용” 조건 때문에 실행하지 않았다.

## 7. 완료

- 코드·신규 migration·테스트·구현 보고서를 남겼다.
- git 명령, Docker 재빌드·재기동, DB 직접 쓰기는 수행하지 않았다.
