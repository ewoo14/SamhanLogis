# PR #1137 / 이슈 #1136 — S9 재수렴 적대검증

## 결론

**결함 0이 아니다. 실 사용자가 밟는 복구 경로 차단 3건과 S8 targeted-fetch가 만든 도달 결함 1건이 있다.** 정상 개발자 작업 4종이 가드에 잘못 막힌 건수는 **0건**이다.

1. **S9-BLOCK-1** — S8의 동적 DB명 계산은 현재 14개 서비스 모두 존재하지 않는 DB를 가리킨다. 실제 `auth-service -WhatIf`는 `auth_service_db does not exist`, exit 1이었다.
2. **S9-BLOCK-2** — S7의 checksum-only 정상 복구 차단은 실제 Flyway 10.10.0 출력에서는 닫히지 않았다. 표준 경고·DB 정보·`-> Applied/Resolved`·후속 안내행을 S8 분류기가 비-checksum 오류로 처리해 repair preview 전에 exit 1이다.
3. **S9-MAJOR-3** — Windows PowerShell 5.1에서 실제 Docker Compose label 조회 인자의 따옴표가 보존되지 않는다. 실행 중 컨테이너가 가리키는 다른 worktree의 `.env.local`이 존재해도 자동 발견하지 못해 exit 1이다. `-EnvFile` 명시 우회는 가능하다.
4. **S9-MAJOR-4** — targeted fetch가 20초를 넘으면 가드는 exit 1로 fail-closed하지만, Windows 개발자 경로에서 반환 직후 fetch 하위 프로세스가 2개 남는다. 가드가 약속한 timeout이 실행 중인 fetch를 끝내지 못한다.

따라서 S8 보고서의 **“S7 5건 전부 닫음”은 반증된다.** S7-BLOCK-1·S7-MAJOR-3·S7-MAJOR-4는 해당 재현점에서 닫혔다. S7-MAJOR-5의 고정 `ValidateSet` 거부도 닫혔지만 S8이 대신 만든 DB명 계산 때문에 복구 종단은 다시 막혔다. S7-MAJOR-2는 fake Docker 4행에서는 닫혔으나 실제 Flyway 출력에서는 닫히지 않았다.

검증 기준은 제공된 PR HEAD `949274d6e`, GitHub checks 41/41 green이다. 코드·workflow·DB schema history는 수정하지 않았다. 실제 DB 검증은 `validate`와 조회만 했고 모든 repair 실행은 fake Docker 또는 `-WhatIf`로 막았다.

## 도달 결함

### S9-BLOCK-1 — 14개 동적 대상의 계산 DB가 실제 DB에 0개 존재한다

S8은 서비스 이름의 모든 `-`를 `_`로 바꾸고 `_db`를 붙인다.

```powershell
Database = (($_.Name -replace '-', '_') + '_db')
```

그러나 이 레포의 DB 계약은 `auth-service -> auth_db`, `slip-service -> slip_db`, `partner-auth-service -> partner_auth_db`처럼 `service`를 DB명에 넣지 않는다. 실행 중인 `samhan-postgres`를 읽기 전용 조회해 동적 대상 전수를 대조한 원문은 다음과 같다.

```text
PSQL_EXIT_CODE=0
SERVICE=accounting-service CALCULATED=accounting_service_db PRESENT=False
SERVICE=arologis-service CALCULATED=arologis_service_db PRESENT=False
SERVICE=auth-service CALCULATED=auth_service_db PRESENT=False
SERVICE=dashboard-service CALCULATED=dashboard_service_db PRESENT=False
SERVICE=dc-config-service CALCULATED=dc_config_service_db PRESENT=False
SERVICE=groupware-service CALCULATED=groupware_service_db PRESENT=False
SERVICE=inventory-service CALCULATED=inventory_service_db PRESENT=False
SERVICE=notification-service CALCULATED=notification_service_db PRESENT=False
SERVICE=partner-auth-service CALCULATED=partner_auth_service_db PRESENT=False
SERVICE=partner-order-service CALCULATED=partner_order_service_db PRESENT=False
SERVICE=partner-service CALCULATED=partner_service_db PRESENT=False
SERVICE=product-service CALCULATED=product_service_db PRESENT=False
SERVICE=slip-service CALCULATED=slip_service_db PRESENT=False
SERVICE=user-service CALCULATED=user_service_db PRESENT=False
TARGET_COUNT=14
CALCULATED_PRESENT_COUNT=0
```

실제 개발자가 실행할 S7/S8 안내 명령을 `-WhatIf`로 밟았다. DB 변경에는 도달하지 않았다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 `
  -EnvFile C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local `
  -Service auth-service -WhatIf
```

```text
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
EXIT_CODE=1
auth-service validate failed for a reason other than a checksum mismatch:
ERROR: Unable to obtain connection from database (jdbc:postgresql://postgres:5432/auth_service_db) for user 'samhan': FATAL: database "auth_service_db" does not exist
SQL State  : 3D000
Message    : FATAL: database "auth_service_db" does not exist
```

왜 실 경로인가: guard가 위반 시 출력하는 바로 그 `-Service <실제 서비스명>` 명령이며, 현재 레포의 실행 중 PostgreSQL과 Compose 자격을 사용했다. 14개 중 우연히 계산명과 맞는 대상도 0개이므로 특정 신규 서비스만의 문제가 아니다.

### S9-BLOCK-2 — 실제 checksum-only Flyway 출력이 repair preview 전에 거부된다

실제 `auth_db`를 읽기만 하도록 임시 fixture의 서비스 이름을 `auth`로 두어 S9-BLOCK-1만 격리했다. 현재 auth migration 94개를 복사하고 임시 `V1`에 주석만 추가한 뒤 `-WhatIf`로 실행했다. 실제 `flyway_schema_history`는 수정하지 않았다.

```text
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
EXIT_CODE=1
MUTATED_FIXTURE=V1__init_account.sql
FIXTURE_REMOVED=True
auth validate failed for a reason other than a checksum mismatch:
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
```

S8은 상세행을 `^-\s*(Applied to database|Resolved locally)`만 허용하지만 실제 pinned image는 `-> Applied...`를 출력한다. 그 밖의 표준 warning/info/후속 안내행도 전부 `unexpectedLines`가 된다. fake Docker가 S8이 허용한 4행만 반환하면 정상 복구는 실행된다.

```text
auth-service: checksum mismatch versions = 1
auth-service: repair completed
Successfully repaired migration metadata
EXIT_CODE=0
REPAIR_CALL_COUNT=1
FIXTURE_REMOVED=True
```

왜 실 경로인가: 이미지도 스크립트 기본값과 같은 `flyway/flyway:10.10.0`이고, 실행 중인 실제 `auth_db`의 checksum mismatch를 읽기 전용으로 만들었다. S7-MAJOR-2가 요구한 정상 checksum-only 복구 자체다.

### S9-MAJOR-3 — 실제 Compose label이 있어도 Windows에서 `.env.local`을 자동 발견하지 못한다

실행 중 컨테이너는 다른 worktree에서 올라와 있고 그 working directory에 `.env.local`이 실제 존재한다.

```text
samhan-auth-service|Up 5 hours (healthy)
samhan-postgres|Up 15 hours (healthy)
```

```text
"com.docker.compose.project.working_dir":"C:\\dev\\Samhan-Public\\.claude\\worktrees\\t1123\\infrastructure"
```

스크립트와 같은 인자 배열을 Windows PowerShell 5.1에서 실행한 원문이다.

```text
EXIT_CODE=64
docker.exe : template parsing error: template: :1: function "com" not defined
```

따라서 인자 따옴표가 Docker까지 보존되지 않아 inspect가 실패하고, S8 fallback은 현재 worktree의 `infrastructure/.env*`만 확인한다.

```text
EXIT_CODE=1
Environment file not found. Checked: C:\dev\Samhan-Public\.claude\worktrees\t1136\infrastructure\.env, C:\dev\Samhan-Public\.claude\worktrees\t1136\infrastructure\.env.local
```

왜 실 경로인가: 이 레포의 실제 공유 Docker 스택은 다른 worktree에서 실행 중이며 개발자는 현재 PR worktree에서 복구 스크립트를 실행한다. 명시적 `-EnvFile`을 알면 우회할 수 있지만 기본 복구 경로는 막힌다.

### S9-MAJOR-4 — 20초 fetch timeout 뒤 fetch 프로세스가 남는다

임시 저장소의 origin SSH helper를 60초 정지시킨 뒤 로컬에 없는 `BeforeRef`로 실제 guard를 실행했다.

```text
EXIT_CODE=1
ELAPSED_SECONDS=20.3
FETCH_PROCESS_COUNT_AFTER_RETURN=2
```

가드는 fail-closed했으므로 이 경로가 green으로 떨어지지는 않는다. 그러나 `Process.Kill()`이 Windows Git의 하위 `git.exe`/SSH helper 트리를 끝내지 못해 가드 반환 뒤에도 fetch가 저장소 파일을 잡고 있었다. S9 fixture 정리를 위해 이 검증이 만든 프로세스만 식별해 종료했으며 최종 상태는 다음과 같다.

```text
S9_TEMP_DIR_COUNT=0
S9_FETCH_PROCESS_COUNT=0
```

왜 실 경로인가: 개발자 Windows 환경에서 원격 SSH/네트워크 fetch가 정지하는 경우이며, S8이 새로 추가한 20초 targeted-fetch 분기다. GitHub-hosted Linux runner에서 같은 프로세스 트리 모양인지는 이 라운드가 판정하지 않았다.

## 1차 각도 — 정상 경로 차단

작업 디렉터리의 VCS 상태는 건드리지 않고 임시 저장소에서 네 시나리오를 실제 commit graph로 만들었다.

```text
SCENARIO=new migration added
EXIT_CODE=0
SCENARIO=unapplied migration edited
EXIT_CODE=0
SCENARIO=feature rebased onto main
EXIT_CODE=0
SCENARIO=main merged into feature
EXIT_CODE=0
FIXTURE_REMOVED=True
```

차단되면 안 되는 정상 작업 중 실제로 막힌 수는 다음 원문 그대로다.

```text
0
```

현재 작업 트리의 실제 migration 파일은 파일시스템 열거 기준 407개다.

```text
MIGRATION_FILE_COUNT=407
SERVICE=accounting-service COUNT=70
SERVICE=arologis-service COUNT=25
SERVICE=auth-service COUNT=94
SERVICE=dashboard-service COUNT=7
SERVICE=dc-config-service COUNT=5
SERVICE=groupware-service COUNT=18
SERVICE=inventory-service COUNT=23
SERVICE=notification-service COUNT=10
SERVICE=partner-auth-service COUNT=3
SERVICE=partner-order-service COUNT=17
SERVICE=partner-service COUNT=13
SERVICE=product-service COUNT=32
SERVICE=slip-service COUNT=78
SERVICE=user-service COUNT=12
```

현재 원본을 `origin/main`과 비교한 실제 guard는 BLOCK 0건, exit 0이다.

```text
PASS: origin/main 대비 적용된 마이그레이션 변경 없음 (신규 migration 추가는 허용).
EXIT_CODE=0
```

407개 모두가 가드의 경로 판정에서 빠지지 않는지도, 실제 파일을 임시 기준 commit에 복사한 뒤 각 파일에 주석을 추가해 한 번에 확인했다.

```text
ALL_FILES_INPUT_COUNT=407
ALL_FILES_GUARD_EXIT_CODE=1
ALL_FILES_BLOCK_LINES=407
ALL_FILES_FIRST_BLOCK=  M services/accounting-service/src/main/resources/db/migration/V10__seed_slice_c_validation_journals.sql
ALL_FILES_LAST_BLOCK=  M services/user-service/src/main/resources/db/migration/V9__normalize_obsolete_member_role.sql
FIXTURE_REMOVED=True
```

따라서 실제 원본 407개 중 현재 HEAD에서 BLOCK은 0건이고, 동일 407개를 기존 migration 수정 상태로 만들면 407건 모두 BLOCK이다.

복구 스크립트는 단순화한 checksum-only 4행 fixture에서는 정상 복구를 거부하지 않지만, 실제 레포 DB명과 실제 Flyway 출력에서는 S9-BLOCK-1·2로 정상 복구를 거부한다.

## 2차 각도 — fail-open 재발

### 네 판정 불가/오류 입력

DB 접속 불가, schema history 부재, 권한 거부, 예상 밖 출력은 각각 독립 실행했다. 네 경우 모두 exit 1이었고 repair는 실행되지 않았다.

```text
CASE=db-unavailable
ERROR: Unable to obtain connection from database: Connection refused
EXIT_CODE=1

CASE=schema-absent
Successfully validated 1 migration
No failed validation detected
EXIT_CODE=1

CASE=permission-denied
ERROR: Unable to obtain connection from database
ERROR: permission denied for schema public
EXIT_CODE=1

CASE=unexpected-output
UNEXPECTED SUCCESS SHAPE
EXIT_CODE=1
FIXTURE_REMOVED=True
```

schema history 부재는 실제 `migration_db`에서도 읽기 전용으로 다시 밟았다. 전후 모두 table 부재이며 exit 1이다.

```text
Schema history table "public"."flyway_schema_history" does not exist yet
ERROR: Validate failed: Migrations have failed validation
Detected resolved migration not applied to database: 1.
EXIT_CODE=1
HISTORY_TABLE_ABSENT_AFTER=t
PSQL_EXIT_CODE=0
FIXTURE_REMOVED=True
```

따라서 질문의 네 경우에서 판정 불가가 다시 통과하는 경로는 재현되지 않았다. checksum mismatch인 경우에만 repair 후보로 들어가며, S9-BLOCK-2처럼 실제 정상 출력까지 과도하게 차단하는 쪽이다.

### CI 실패가 green이 되는가

현재 workflow 원문 검사 결과다.

```text
CONTINUE_ON_ERROR_COUNT=0
OR_TRUE_COUNT=0
JOB_IF_COUNT=0
GUARD_RUN_COUNT=1
```

407개 수정 fixture에서 guard 자체 종료코드도 1이었다. 따라서 실행된 guard 실패를 green으로 바꾸는 workflow 경로는 없다. 실제 PR checks 원문에서도 `적용된 Flyway 마이그레이션 불변 가드 pass 32s`를 포함해 41/41 green을 재확인했다.

## 3차 각도 — S8이 만든 새 표면

| S8 신규 상태·조합 | 실행 결과 |
|---|---|
| 로컬에 없는 SHA, origin에서 targeted fetch 가능 | exit 0 |
| origin에도 없는 SHA | exit 1, fail-closed |
| targeted fetch 20초 초과 | exit 1, 그러나 S9-MAJOR-4의 하위 프로세스 2개 잔존 |
| checksum mismatch + S8 fake 표준 4행 | exit 0, repair 1회 |
| checksum mismatch + 다른 validate 오류 | exit 1, repair 0회 |
| 실제 Flyway 10.10.0 checksum-only 출력 | S9-BLOCK-2, exit 1 |
| Compose inspect exit 1 | `Environment file not found. Checked: ...`, exit 1 |
| 실제 Compose inspect exit 0이어야 하는 Windows 호출 | 인자 quote 손실로 inspect exit 64, S9-MAJOR-3 |
| 기존 migration 서비스 14개 동적 열거 | 14개 선택, 계산 DB 존재 0개 — S9-BLOCK-1 |
| 신규 `new-service` + migration 디렉터리 | parameter binding 통과, `WhatIf`, exit 0 |
| migration 디렉터리 없는 서비스 | `Unknown service target`, exit 1 |
| repair 본체/테스트만 변경 | PR/push path에 각각 존재 |

targeted fetch 성공·실패 원문은 다음과 같다.

```text
CASE=recoverable-before
EXIT_CODE=0
CASE=unavailable-before
FAIL: 비교 기준 커밋을 로컬에서 찾지 못했습니다(ffffffffffffffffffffffffffffffffffffffff).
EXIT_CODE=1
FIXTURE_REMOVED=True
```

신규 서비스 선택 원문이다.

```text
CASE=new-service
new-service: checksum mismatch versions = 1
What if: Performing the operation "Flyway repair (checksum metadata only)" on target "new-service".
EXIT_CODE=0
FIXTURE_REMOVED=True
```

workflow path 원문 계수다.

```text
'scripts/repair-flyway-checksums.ps1' COUNT=2
'scripts/repair-flyway-checksums.test.ps1' COUNT=2
```

## 4차 각도 — S7 5건과 S8 증거 무결성

### S7-BLOCK-1 — 복구 가능한 before SHA fetch

**닫힘.** shallow checkout에 없는 이전 SHA를 동일 origin에서 fetch해 exit 0이었다. origin에도 없는 SHA는 exit 1을 유지했다. 제공 fixture도 재실행됐다.

```text
Flyway applied-migration guard scenarios: PASS
EXIT_CODE=0
```

### S7-MAJOR-2 — 정상 checksum-only 다중행 복구

**닫히지 않음.** S8이 인용한 fake Docker 4행은 재현되어 repair 1회·exit 0이었다. 그러나 실제 pinned Flyway 출력은 S9-BLOCK-2 원문처럼 exit 1이다. 따라서 S8의 fixture 출력은 재현되지만 “결함을 닫았다”는 종단 주장은 재현되지 않는다.

### S7-MAJOR-3 — Compose 기준 컨테이너 부재

**그 재현점은 닫힘.** inspect가 `Error: No such object`/exit 1이면 drive 오류 대신 후보를 출력하고 exit 1이다.

```text
CASE=inspect-missing
Environment file not found. Checked: ...\infrastructure\.env, ...\infrastructure\.env.local
EXIT_CODE=1
```

다만 컨테이너가 실제 존재하는 현재 Windows 경로에서는 S9-MAJOR-3이 별도로 재현됐다.

### S7-MAJOR-4 — repair-only 변경 workflow 미생성

**닫힘.** repair 본체·테스트 path는 PR과 push에 각각 1회씩 있어 위 원문처럼 각 COUNT=2다. 다만 workflow가 실제로 실행하는 repair test 명령 수는 다음과 같다.

```text
REPAIR_TEST_RUN_COUNT=0
```

S8 보고서는 local repair fixture PASS를 주장했으며 그 출력 자체는 아래처럼 재현됐다. CI에서 repair fixture가 실행된다는 주장은 S8 보고서에 없으므로 별도 도달 결함으로 세지 않는다.

```text
Flyway repair credential scenarios: PASS
EXIT_CODE=0
```

### S7-MAJOR-5 — 신규 서비스의 고정 ValidateSet 거부

**parameter binding 재현점은 닫힘.** `new-service`가 `WhatIf`까지 도달해 exit 0이었다. 그러나 계산 DB명 계약 때문에 실제 서비스의 종단 복구는 S9-BLOCK-1로 다시 막혔다.

### S8의 나머지 인용 출력

PowerShell parser 4개는 모두 재현됐다.

```text
scripts/check-applied-migrations.ps1 PARSE_ERROR_COUNT=0
scripts/check-applied-migrations.test.ps1 PARSE_ERROR_COUNT=0
scripts/repair-flyway-checksums.ps1 PARSE_ERROR_COUNT=0
scripts/repair-flyway-checksums.test.ps1 PARSE_ERROR_COUNT=0
TOTAL_PARSE_ERROR_COUNT=0
```

S8의 두 fixture PASS와 targeted fetch 성공/실패, 신규 서비스 선택, credential 회귀 출력은 재현됐다. 재현되지 않은 것은 “그 증거로 S7의 정상 checksum 복구와 서비스 종단 복구까지 닫혔다”는 결론이다.

## 이 라운드가 보지 않은 것

- 실제 권한을 회수하거나 저권한 role을 만들지 않았다. 권한 없음은 fake Docker로 실행했으므로 실제 PostgreSQL 권한 오류의 문구 변형은 보지 않았다.
- 실제 `flyway repair`는 실행하지 않았다. 실제 DB는 `validate`와 `SELECT`만 수행했고 `flyway_schema_history`는 전후 수정하지 않았다.
- 14개 잘못된 계산 DB 각각에 Flyway container를 14회 띄우지는 않았다. 실행 중 PostgreSQL catalog 전수 조회에서 계산명 존재가 0개임을 확인하고 `auth-service` 한 건을 실제 validate했다.
- 실제 main push/force-push 이벤트를 새로 만들지 않았다. targeted fetch graph는 격리 임시 저장소에서 실행했다.
- 실제 외부 fork PR은 만들지 않았다.
- Linux PowerShell에서 Docker Go-template 인자가 보존되는지, timeout 후 하위 프로세스가 남는지는 보지 않았다. S9-MAJOR-3·4는 이 레포 개발자의 실제 Windows PowerShell 5.1 경로 판정이다.
- 실제 원격 장애를 만들지 않고 격리 SSH helper를 정지시켜 20초 timeout을 밟았다.
- 표본 0건으로 결함 0을 주장한 축은 없다.

## 실행·정리

- 작업 디렉터리에는 branch 전환·add·commit·push를 하지 않았다. 정상 topology와 targeted fetch 재현용 VCS 조작은 시스템 임시 디렉터리의 격리 fixture에서만 수행했다.
- Docker 컨테이너를 재시작·재배포하지 않았다.
- S9가 만든 임시 디렉터리와 timeout 프로세스는 모두 정리했다.
- 코드·workflow는 수정하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1136-s9-reconvergence.md`
