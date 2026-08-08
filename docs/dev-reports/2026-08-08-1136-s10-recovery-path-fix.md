# PR #1137 / 이슈 #1136 — S10 복구 경로 fix

## 결론

S9가 보고한 네 결함의 원인은 코드와 재현 데이터에서 모두 확인됐고, 네 경로를 수정했다. 실제 `flyway_schema_history`에는 접근하지 않았으며, Docker 재기동·재배포·git 명령도 수행하지 않았다.

## RED-A 원문 — 실제 Flyway 10.10.0 checksum-only 출력

수정 전 `repair-flyway-checksums.ps1 -Service auth-service -WhatIf`의 판정 원문:

```text
WARNING: Storing migrations in 'sql' is not recommended and default scanning of this location may be deprecated in a future release
WARNING: This version of Flyway is out of date. Upgrade to Flyway 13.2.0: https://rd.gt/3rXiSlV
Flyway OSS Edition 10.10.0 by Redgate
See release notes here: https://rd.gt/416ObMi
Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14)
ERROR: Validate failed: Migrations have failed validation
Migration checksum mismatch for migration version 1
-> Applied to database : -670111044
-> Resolved locally    : 400076994
Either revert the changes to the migration, or run repair to update the schema history.
Need more flexibility with validation rules? Learn more: https://rd.gt/3AbJUZE
EXIT_CODE=1
```

원인은 `-> Applied`를 `- Applied`만 허용한 정규식과, 실제 Flyway의 정상 warning/info/후속 안내행을 모두 unexpected로 세던 분류기였다.

## RED-B 원문 — fail-closed 유지

checksum 외 오류가 섞인 입력은 수정 전에도 repair를 허용하면 안 되는 경로이며, S10에서도 계속 거부해야 한다.

```text
Migration checksum mismatch for migration version 1
Detected failed migration version 2
EXIT_CODE=1
REPAIR_CALL_COUNT=0
```

접속 불가·schema history 부재·권한 오류·예상 밖 출력도 모두 동일하게 exit 1이어야 한다. checksum mismatch가 없거나 허용된 checksum-only 출력 모양이 아니면 예외를 발생시키는 구조를 유지했다.

## 수정 내용

1. `repair-flyway-checksums.ps1`
   - 서비스 이름을 DB 이름으로 변환하는 동적 계산을 제거했다.
   - 실제 계약 14개를 명시했다: `accounting_db`, `arologis_db`, `auth_db`, `dashboard_db`, `dc_config_db`, `groupware_db`, `inventory_db`, `notification_db`, `partner_auth_db`, `partner_order_db`, `partner_db`, `product_db`, `slip_db`, `user_db`.
   - 매핑되지 않은 서비스는 `Unknown service target`으로 fail-closed한다.
   - 실제 Flyway 출력의 `-> Applied/Resolved`와 warning/info/후속 안내행을 허용하되, 다른 오류행은 계속 거부한다.
   - Compose label은 Go-template 문자열 대신 `docker inspect` JSON을 읽어 PowerShell 5.1 따옴표 손실을 제거했다.
   - 테스트 격리를 위한 `DockerCommand` 주입점을 추가했다. 기본값은 기존처럼 `docker`다.
2. `check-applied-migrations.ps1`
   - 20초 targeted fetch timeout에서 Windows `taskkill.exe /PID /T /F`로 프로세스 트리를 종료한다.
   - 종료 후 root process가 끝났는지 최대 5초 대기하고 dispose한다.
3. `repair-flyway-checksums.test.ps1`
   - 제공된 실제 Flyway 10.10.0 전문을 fixture로 고정했다.
   - `auth-service -> auth_db` 매핑과 구식 `auth_service_db` 계산 제거를 회귀 검사한다.
   - checksum-only preview와 비-checksum 오류 fixture를 함께 실행한다.

## RED-A와 RED-B 동시 GREEN 원문

두 테스트를 순차 실행했고 각 종료코드는 파이프 없이 변수로 측정했다.

```text
Flyway repair credential scenarios: PASS
REPAIR_TEST_EXIT_CODE=0
Flyway applied-migration guard scenarios: PASS
GUARD_TEST_EXIT_CODE=0
```

RED-A는 실제 출력 전문 fixture에서 checksum mismatch를 인식하고 `What if: Performing the operation "Flyway repair (checksum metadata only)"`까지 도달했다. RED-B는 mixed validate error·비 checksum 출력에서 repair로 진행시키지 않고 fail-closed 판정을 유지한다.

## ① 새로 가능해진 상태·환경 조합과 결과

| 상태·환경 조합 | 결과 |
|---|---|
| 14개 실제 서비스명 + 실제 DB 계약 | 올바른 `*_db` JDBC 대상 선택 |
| 실제 Flyway 10.10.0 checksum-only 전문 | repair preview 도달, exit 0 |
| checksum mismatch + 비-checksum 오류 | exit 1, repair 거부 |
| DB 접속 불가·권한 없음·schema history 없음·판정 불가 | exit 1, fail-closed |
| Windows PowerShell 5.1 + Compose inspect 자동 탐색 | JSON label에서 `.env/.env.local` 후보 구성 |
| Compose inspect 실패/JSON 불량 | 확인한 후보를 안내하고 exit 1 |
| targeted fetch 20초 초과 | fetch 프로세스 트리 종료 후 exit 1 |

실제 DB에는 repair를 실행하지 않고 모든 복구 검증을 `-WhatIf` 또는 fixture로 수행했다.

## ② 식별자 전수 grep 결과

변경 축은 DB명 계산 식과 QA 잔재 DB 식별자다. `scripts infrastructure services .github`를 대상으로 grep했다.

```text
PATTERN=auth_service_db
NO_MATCH
PATTERN=_service_db
NO_MATCH
PATTERN=\.Name -replace '-', '_'
NO_MATCH
PATTERN=slip_db_qa_e2estimate
NO_MATCH
PATTERN=sol951_
NO_MATCH
```

QA 잔재는 서비스 매핑에 추가하지 않았다.

## ③ 변경 파일 참조 테스트 전부 실행 결과

```text
scripts/repair-flyway-checksums.test.ps1  PASS  EXIT_CODE=0
scripts/check-applied-migrations.test.ps1 PASS  EXIT_CODE=0
PowerShell parser check (두 production script) PARSE_OK
```

전체 Gradle suite는 실행하지 않았다.

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-1136-s10-recovery-path-fix.md
```

수정 파일 목록:

```text
scripts/repair-flyway-checksums.ps1
scripts/repair-flyway-checksums.test.ps1
scripts/check-applied-migrations.ps1
```
