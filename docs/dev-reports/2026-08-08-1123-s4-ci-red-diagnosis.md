# PR #1124 / Issue #1123 — S4 CI red 진단 결과

## 결론

이번 CI red의 주원인은 `SlipClosedDateGuard`의 정상 경로 차단이 아니라 마이그레이션 버전 충돌이었다(B 경로).

- 기존: `V61__correct_partner_order_vat_overcharge.sql`
- 신규: `V61__create_slip_closed_date_policy.sql`
- 원문: `org.flywaydb.core.api.FlywayException: Found more than one migration with version 61`

추가로, 새 가드를 주입받도록 변경된 `MobilePartnerOrderServiceTest`에 가드 mock이 빠져 단위 테스트 7건이 실패했다. 운영 경로 결함이 아니라 `@InjectMocks` 테스트 fixture 누락이며 mock을 추가했다.

## 수정

1. 신규 slip closing migration을 `V118__create_slip_closed_date_policy.sql`로 이동했다. 현재 slip-service migration 최대 버전 V117 다음 번호이며, DB에 migration을 실행하지 않았다.
2. `permissionsApi.ts`의 `PageCode` union과 `PermissionMatrixPage.tsx`의 `PAGE_LABEL`에 `slip.closed-date-exception`을 동기화했다. 이 코드는 메뉴 catalog 항목이 아니라 예외 권한 코드이므로 catalog에는 추가하지 않았다.
3. `MobilePartnerOrderServiceTest`에 `SlipClosedDateGuard` mock을 추가했다.

## 가드 동작 확인

`SlipClosedDateGuardTest`: 5 tests, 0 failures.

- baseline `enabled=false`이면 과거 날짜도 통과하고 권한 조회를 호출하지 않는다(RED-B).
- manual closed rule은 비권한자를 거부하고 권한자를 허용한다(RED-A/C).
- OUTBOUND rule은 INBOUND 조회를 막지 않는다(RED-G).
- rule/baseline repository가 미설정 또는 empty이면 `isClosed=false`로 통과한다. 단, 명시적인 `MANUAL_CLOSED` rule은 baseline 비활성 여부와 무관하게 거부한다.

## 실패 원문과 전건 집계

수정 전 `./gradlew :services:slip-service:test`:

```text
1709 tests completed, 729 failed
org.flywaydb.core.api.FlywayException: Found more than one migration with version 61
-> V61__create_slip_closed_date_policy.sql
-> V61__correct_partner_order_vat_overcharge.sql
```

가드 단위 테스트와 기존 `SlipServiceTest`는 각각 `5/5`, `49/49` 통과했다. Flyway 충돌 해소 후 새 mock을 반영한 최종 전건:

```text
./gradlew :services:slip-service:test --no-daemon
exit code: 0
1709 tests / 0 failures / 0 errors / 0 skipped
BUILD SUCCESSFUL in 11m 26s
```

중간의 데몬 실행 1회는 테스트 결과 전에 `Gradle build daemon has been stopped: stop command received`로 종료되어 최종 판정에 사용하지 않았다.

## Frontend Desktop

CI 동일 범위인 design-system 선행 build와 desktop `typecheck`, `lint`, `build`, `build:web`, `build:capacitor`, `npm test`를 실행했다.

- 최초 실패: `1987 tests / 1 failed / 1986 passed`
- 원문: `permissionsApi.ts PageCode union이 BE PageCode enum page-code를 누락했습니다: slip.closed-date-exception`
- 수정 후 최종: typecheck exit 0, npm test exit 0
- lint/build/build:web/build:capacitor도 모두 exit 0

첫 수정 후 test 실행에서 일시적인 Vitest worker 종료가 있었으나 동일 명령 재실행에서 exit 0으로 통과했다.

## 작업 트리 및 준수 사항

- 커밋/push하지 않았다.
- DB 직접 쓰기 및 migration 실행을 하지 않았다.
- 공유 Docker stack을 재기동하지 않았다.
- `git diff --stat`: 4 insertions, 44 deletions. 삭제 줄 수는 44줄이다(신규 V118 파일은 untracked라 stat에 포함되지 않음).
- 신규 파일:
  - `services/slip-service/src/main/resources/db/migration/V118__create_slip_closed_date_policy.sql`
  - `docs/dev-reports/2026-08-08-1123-s4-ci-red-diagnosis.md`
