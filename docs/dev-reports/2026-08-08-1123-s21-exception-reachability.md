# S21 fix — 이슈 #1123 / PR #1124

## 판정 요약

S20의 결함 1은 **코드 결함이 아니라 권한 시드/운영 설정 공백**으로 판정했다.

- `SlipService.inspect()`는 날짜 예외 권한으로 마감 가드를 통과한 뒤, 실제 검수 결재선 권한을 별도로 확인한다. 두 권한을 함께 요구하는 것은 “마감된 날짜의 검수는 예외 권한을 가진 실제 검수자만 허용”이라는 권한 모델과 일치한다.
- S20 실 권한 모집단에는 `slip.closed-date-exception CREATE`와 OUTBOUND/INBOUND 검수 결재자의 교집합이 0명이다. 따라서 현재 배포된 시드로는 성공 조작자가 존재하지 않는다.
- 예외 권한 시드는 `V95__seed_slip_closed_date_exception_permission.sql:7-19`에서 MASTER/MANAGER 역할·두 권한그룹에만 기본 부여한다. 실제 계정별 조합은 관리자 API `PermissionAdminController.java:92-100`의 `PUT /auth/admin/permissions/account/{accountId}`로 MASTER가 만들 수 있다.
- 그러므로 `slip.closed-date-exception`이 검수 결재선을 우회하도록 코드를 바꾸지 않았다. 그렇게 바꾸면 날짜 예외만 가진 계정이 검수 상태를 전이할 수 있어 검수 권한 경계를 넓힌다.

결함 2는 코드 결함으로 수정했다. `inspect()`에서 `enforceSlipApprovalLine`을 `closedDateGuard.assertAllowed`보다 먼저 실행하도록 순서를 변경했다.

## RED-A · RED-B · 동시 GREEN 원문

### RED-A

```text
① 마감 예외 경로가 실제로 도달 가능하다 — FAIL
   실 권한 교집합: 0명
   dev_manager: 날짜 가드 통과 후 검수 결재선 403
② 권한이 없는 요청은 권한 오류를 받는다 — FAIL
   기존 403 요청이 활성 기준선에서 날짜 409를 먼저 반환
```

### RED-B

```text
③ 열린 날짜 정상 inspect() 1/1 성공 — PASS
   기존 367건 활성 기준선 sweep 367/367 409, 데이터 불변 — PASS
④ 마감 날짜 차단 유지 — PASS
```

### 동시 GREEN 판정

```text
S21 코드 검증: 결함 2 GREEN
  검수 결재선 거부 + 마감 날짜 → FORBIDDEN
  closedDateGuard 호출 없음

S21 전체: BLOCK
  결함 1은 코드가 아니라 시드/운영 권한 조합 공백이며,
  현재 환경에서 예외+검수 권한자의 실제 마감 inspect 성공은 아직 만들 수 없음.
```

개발책임자/PM의 다음 운영 조작은 MASTER 권한으로 실제 검수자 계정 하나에 `slip.closed-date-exception`의 CREATE를 계정 override 또는 검수자 그룹 권한으로 부여한 뒤, 마감 `INSPECTING → COMPLETED`를 확인하는 것이다. 그 조합을 만들기 전까지는 불변식 ①의 라이브 증거가 없다.

## 변경 내용과 판정 지점

### 코드

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:983-986`
  - 기존: `closedDateGuard → enforceSlipApprovalLine → mutation`
  - 변경: `enforceSlipApprovalLine → closedDateGuard → mutation`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java:743-756`
  - UUID 실사용자이면서 검수 결재선 거부인 요청이 마감 여부와 관계없이 `FORBIDDEN`을 받고 날짜 가드를 호출하지 않는 회귀 테스트 추가.

### 식별자·판정 지점 grep 전수 확인

```text
SlipService.java:983  public SlipDetailResponse inspect(...)
SlipService.java:985  enforceSlipApprovalLine(...)
SlipService.java:986  closedDateGuard.assertAllowed(...)
SlipClosedDateGuard.java:17  PAGE_CODE = "slip.closed-date-exception"
V95__seed_slip_closed_date_exception_permission.sql:7,18  기본 시드
PermissionAdminController.java:92  PUT /auth/admin/permissions/account/{accountId}
SlipServiceTest.java:743  회귀 테스트 식별자
```

전수 확인 결과, 이번 라운드에서 변경한 식별자는 `inspect` 검증 순서와 회귀 테스트 식별자뿐이다. `slip.closed-date-exception` 상수·시드 값·권한 우회 로직은 변경하지 않았다.

## 새로 가능해진 상태·권한 조합과 결과

이번 코드 변경은 새 권한을 만들지 않고 오류 우선순위만 바로잡았다.

| 상태/권한 조합 | 결과 | 근거 |
|---|---|---|
| 열린 날짜 + 검수 결재 권한 | 기존 정상 inspect 경로 유지 | S20 1/1 성공, S21 영향 범위 테스트 GREEN |
| 열린/마감 날짜 + 검수 결재 권한 없음 | 날짜와 무관하게 `FORBIDDEN` | S21 회귀 테스트, 날짜 가드 미호출 |
| 마감 날짜 + 검수 권한 있음 + 날짜 예외 없음 | `CONFLICT` 차단 유지 | S20 367/367 409 및 기존 가드 유지 |
| 마감 날짜 + 검수 권한 있음 + 날짜 예외 있음 | 의도된 성공 조합이나 현재 실 계정 0명 | 코드상 두 게이트 통과 시 mutation 도달; 운영 조합 생성 후 라이브 확인 필요 |

## 테스트

TDD 순서:

1. 새 회귀 테스트 RED: 기존 순서에서 마감 `CONFLICT`가 먼저 발생.
2. `SlipService.inspect()` 순서 최소 변경.
3. 새 회귀 테스트 GREEN: `FORBIDDEN`, 날짜 가드 미호출.

실행 결과:

```text
:services:slip-service:test --tests "*SlipServiceTest.inspect_withoutApprovalPermission_returnsForbiddenBeforeClosedDateGuard"
BUILD SUCCESSFUL

:services:slip-service:test --tests "*SlipService*Test"
BUILD SUCCESSFUL

:services:slip-service:test --tests "*SlipInspectControllerIT" --tests "*SlipOutboundApprovalEnforcementIT"
BUILD SUCCESSFUL
```

slip-service 전체 테스트는 통합 테스트 장기 실행으로 제한시간을 초과했다. 기존 Gradle 잔류 프로세스를 중지한 뒤 변경 파일 영향 범위 테스트 전체를 다시 실행해 위 세 명령에서 통과를 확인했다. 전체 Gradle 스위트와 Docker 재기동·재배포는 수행하지 않았다.

## 데이터 무결성 및 신규 확인용 데이터

- 기존 전표 조회(GET)나 상태 전이를 이번 라운드에 수행하지 않았다.
- DB 직접 INSERT/UPDATE/DELETE를 수행하지 않았다.
- `S21-1123` 메모가 있는 확인용 전표: **없음**. 결함 1이 시드 공백으로 판정되어 실 권한 조합 생성과 라이브 전표 조작을 PM/개발책임자 운영 단계로 남겼다.
- 기존 `S14-1123-*`, S16, S18, S20 전표와 soft-delete 기준선은 건드리지 않았다.

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-1123-s21-exception-reachability.md
```

기존 파일 변경:

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java
services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java
```
