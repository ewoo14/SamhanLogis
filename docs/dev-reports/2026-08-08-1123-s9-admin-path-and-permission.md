# #1123 S9 — 마감 기준선 관리자 경로 및 예외 권한 배선

## 결론

슬라이스 1 검증을 위해 다음을 추가했다.

- `POST/GET/DELETE /admin/slip-closing-baselines` 관리자 API
- `OUTBOUND`·`INBOUND` 별 기준선 생성/조회/soft-delete
- `slip.closed-date-admin` PageCode 및 MASTER/MANAGER 관리자 권한
- V95의 `slip.closed-date-exception` 권한을 실 계정 enforcement cache로 materialize하는 V96

칩 UI, 날짜 범위 일괄 추가, 지난 날짜 자동 마감, 날짜 검색은 변경하지 않았다.

## `allowed=false` 원인 확정

원인은 세 번째 후보인 **역할·그룹 seed와 실 계정 enforcement materialization의 단절**이다.

근거는 코드로 다음과 같다.

1. `PageCode.SLIP_CLOSED_DATE_EXCEPTION`의 코드는 V95 문자열
   `slip.closed-date-exception`과 동일하다. 따라서 문자열 불일치가 아니다.
2. V95는 `role_page_permission_templates`와 `group_page_permissions`만 등록한다.
   `PageCode` 등록도 이미 존재하므로 PageCode 누락도 아니다.
3. `DirectDynamicPermissionClient.check()`는 `AccountPermissionService.check()`로 위임하고,
   이 메서드는 `account_page_permissions`만 조회한다.
4. V95에는 `account_groups`와 `group_page_permissions`를 이용해
   `account_page_permissions`를 채우는 INSERT가 없다. 따라서 실 MANAGER 계정의
   조회 행이 없어 `Optional.empty().orElse(false)`로 `allowed=false`가 된다.

RED 테스트 최초 원문:

```text
AuthFlywayV95SeedIT.managerAccount_hasCreatePermissionInEnforcementCache
org.springframework.dao.EmptyResultDataAccessException: Incorrect result size: expected 1, actual 0
at JdbcTemplate.queryForObject(...)
at AuthFlywayV95SeedIT.java:45
```

V95와 V118은 편집하지 않았다. V96에서 V95 예외 권한과 관리자 PageCode 권한을
실 계정 cache에 materialize했다. 시스템 MASTER 계정은 기존 bypass 불변식을 위해
materialize 대상에서 제외했다.

## API 계약

```text
GET    /admin/slip-closing-baselines
POST   /admin/slip-closing-baselines
       { "slipType": "OUTBOUND", "baselineDate": "2026-08-08" }
DELETE /admin/slip-closing-baselines/{id}
```

모든 API는 `slip.closed-date-admin` 권한을 사용한다. 잘못된 enum 또는 날짜 형식은
Spring 요청 검증에서 400, 무권한 계정은 `@RequirePermission`에서 403이다.
기준선 설정은 현재 날짜가 이미 닫혔는지 검사하지 않으므로 언제나 설정 가능하다.

생성 규칙은 전표 종류별 활성 기준선 하나다. V118의 기본 비활성 행은 첫 POST에서
재사용해 활성화하고, 활성 기준선을 같은 전표 종류로 다시 POST하면 409다.
DELETE는 soft-delete이며 이후 동일 종류를 다시 생성할 수 있다. OUTBOUND/INBOUND
기준선은 각각 독립 조회되므로 한쪽이 다른 쪽 생성을 막지 않는다.

## 불변식 점검

- 기준선이 없거나 비활성이면 `SlipClosedDateGuard`는 기존처럼 열린 날짜를 허용한다.
- 날짜 규칙 조회는 `SlipType`을 함께 사용하므로 출고 마감이 입고 생성을 막지 않는다.
- S6의 컷오프+날짜 게이트 결합 코드는 수정하지 않았다.
- 예외 권한 없는 계정은 `account_page_permissions` 행이 없거나 CREATE=false라 차단된다.
- 관리자 API에서 기준선을 만드는 행위에는 날짜 마감 판정을 적용하지 않는다.

## 검증

```text
✅ :services:auth-service:test --tests com.samhanair.logis.auth.it.AuthFlywayV95SeedIT
✅ :services:slip-service:test --tests com.samhanair.logis.slip.service.closing.SlipClosingBaselineAdminServiceTest
✅ :services:slip-service:test --tests com.samhanair.logis.slip.service.closing.SlipClosedDateGuardTest
✅ git diff --check
```

공유 Docker 스택은 재기동하지 않았다. DB 직접 쓰기와 평문 비밀번호 사용도 없었다.

## 신규 파일

- `services/auth-service/src/main/resources/db/migration/V96__seed_slip_closed_date_admin_permission.sql`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AuthFlywayV95SeedIT.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/closing/CreateSlipClosingBaselineRequest.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/closing/SlipClosingBaselineResponse.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingBaselineAdminService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingPageCodes.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/closing/SlipClosingBaselineAdminServiceTest.java`

## diff stat

실행한 `git diff --stat` 결과의 삭제 줄 수는 **0**이다.
해당 명령은 아직 index에 올라가지 않은 신규 파일을 포함하지 않으므로, 위 신규 파일은
별도 목록으로 기록했다. 기존 추적 파일 변경도 삭제 0줄이다.

커밋과 push는 수행하지 않았다.
