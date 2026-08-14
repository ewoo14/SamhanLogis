# #1144 복원 불가 slip 격리

## 결정

2026/08/09-2는 `partner_id`는 있으나 활성 partner 원본이 없어 코드를 복원할 근거가 없다. 해당 행은 삭제하지 않고 `is_deleted=true`로 격리하며, 원본 식별자와 복원 근거를 감사 행에 보존한다.

## 구현

- `SlipPartnerQuarantine`가 BaseEntity 7 audit 필드와 `slip_id`, `slip_no`, `partner_id`, 당시 `partner_code`, 상태, 사유, source를 보존한다.
- `POST /internal/slips/quarantine-unresolved-partner-slips`는 backfill 실패 목록에서 명시된 전표번호와 활성 UUID-only 조건의 교집합만 격리한다.
- `POST /internal/slips/restore-quarantined-partner-slips`는 partner 원본에서 확인된 코드만 `backfillPartnerCode` chain으로 채우고 `markRestored` chain으로 활성화한다. 감사 행은 삭제하지 않고 `restored_at/by/code`를 기록한다.
- `Slip`의 `@SQLRestriction`과 기존 활성 repository 조건으로 목록·합계·기간 조회·line join·partner ledger·allocation source·attachment·dispatch·delivery·mobile 경로에서 격리 행을 제외한다.

## RED / GREEN

RED는 새 테스트가 참조하는 격리 저장소가 없어 `compileTestJava`에서 실패했다. 구현 중 Testcontainers IT에서 중복 전표번호와 테스트 잔여행 단정도 발견해 테스트 격리를 고쳤다.

GREEN:

- `SlipPartnerBackfillIT`: 7 tests, 0 failures
- `SlipServiceTest`: 72 tests, 0 failures
- `SlipSalesQueryControllerIT`: 9 tests, 0 failures
- fresh Testcontainers PostgreSQL Flyway: `V120 - quarantine unresolved slip partner rows` 적용 성공

## Migration 번호 확인

`origin/main`과 현재 브랜치의 slip-service migration 최대값은 V119였다. 열린 PR #1208, #1207, #1206, #1204, #1203, #1188, #1180, #1162의 변경 파일을 전수 확인해 slip-service migration 추가가 없음을 확인했다. 따라서 V120을 선택했다. accounting-service의 기존 V102는 별도 서비스 namespace이므로 변경하지 않았다.
