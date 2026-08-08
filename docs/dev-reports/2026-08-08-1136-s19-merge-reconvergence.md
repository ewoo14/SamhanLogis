# PR #1137 / 이슈 #1136 — S19 SOL 머지 재수렴

## 결론 — MERGE

**결함 0건. 머지 판정은 MERGE다.**

- 이슈 #1136 본체에 닿는 결함: **0건**
- 복구 스크립트 편의 기능 결함: **0건**
- 정상 개발자 작업 오차단: **0건**

현재 HEAD는 `d041025c87ff1f08fd0337a41d7a3cd6e44b8a5a`다. 실제 `accounting-service`와 `auth-service` 정상 `-WhatIf`는 모두 exit 0을 유지했다. S17의 비정상 성공 문자열, 비-checksum 실패, 미커밋 손상은 모두 exit 1이었다. 적용 migration 편집은 PR 및 main push 호출 형태 모두 exit 1이었고, 신규 migration 및 아직 main에 없는 migration의 수정은 exit 0이었다.

실제 `repair`, `flyway_schema_history` 변경, Docker 재기동·재배포, checkout·push 및 현재 작업 트리의 commit은 수행하지 않았다.

## 1. S18 축소 정규식 — 양방향 도달

### 1.1 실제 Flyway 정상 출력

S18과 같은 공개 명령을 실행했다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 -Service accounting-service -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 -Service auth-service -WhatIf
```

원문:

```text
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
accounting-service: checksum mismatch versions = (none)
ACCOUNTING_EXIT=0

Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
auth-service: checksum mismatch versions = (none)
AUTH_EXIT=0
```

동일 이미지 `flyway/flyway:10.10.0`, 동일 `samhan-net`, migration read-only mount로 직접 받은 원문도 대조했다.

```text
Database: jdbc:postgresql://postgres:5432/accounting_db (PostgreSQL 16.14)
Successfully validated 70 migrations (execution time 00:00.195s)
REAL_FLYWAY_accounting_EXIT=0

Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14)
Successfully validated 96 migrations (execution time 00:00.295s)
REAL_FLYWAY_auth_EXIT=0
```

실제 두 서비스 정상 경로는 계속 허용된다.

### 1.2 천 단위 구분자와 실행 시간

임시 fake Docker 출력을 `-DockerCommand` 공개 경계에 연결해 정규식 단독이 아니라 `Invoke-Docker → validate.Output → unexpectedLines → 최종 exit` 전체 경로를 밟았다.

```text
Successfully validated 1,234 migrations (execution time 00:00.267s)   EXIT=0
Successfully validated 1,234 migrations (execution time 00:01.002s)   EXIT=0
Successfully validated 1,234 migrations (execution time 01:02.003s)   EXIT=0
Successfully validated 12,345,678 migrations (execution time 99:59.999s) EXIT=0
```

천 단위 쉼표, 밀리초 3자리, 1분 이상 표기가 모두 허용됐다.

### 1.3 S17 문자열과 반대쪽

같은 전체 실행 경로의 원문과 결과다.

```text
Successfully validated ,,, migrations (execution time permission denied)
EXIT=1

Successfully validated 1,234 migrations (execution time permission denied)
EXIT=1
```

두 경우 모두 다음 판정으로 거부됐다.

```text
auth-service validate failed for a reason other than a checksum mismatch:
<입력 원문>
```

### 1.4 비-checksum 실패

#### DB 접속 불가 — 실제 Flyway

`-Network none`으로 실제 Flyway 컨테이너의 DB 접속만 끊고 validate했다.

```text
ERROR: Unable to obtain connection from database (jdbc:postgresql://postgres:5432/auth_db) for user 'samhan': The connection attempt failed.
SQL State  : 08001
Caused by: java.net.UnknownHostException: postgres
REAL_FLYWAY_db-unavailable_EXIT=1
```

같은 형식을 복구 스크립트 입력에 넣은 결과도 exit 1이었다.

#### schema history 없음 — 실제 Flyway와 스크립트 경계

서비스 DB가 아닌 `postgres` DB에 history table이 없음을 읽기 조회한 뒤 validate만 실행했다.

```text
POSTGRES_DB_HISTORY_BEFORE_MISSING=t
Schema history table "public"."flyway_schema_history" does not exist yet
ERROR: Validate failed: Migrations have failed validation
Detected resolved migration not applied to database: 1.
REAL_FLYWAY_schema-history-missing_EXIT=1
POSTGRES_DB_HISTORY_AFTER_MISSING=t
```

이 실제 출력 형식을 스크립트 경계에 다시 넣은 결과도 exit 1이었다. 전후 모두 history table은 없었다.

#### 권한 없음·예상 밖 출력

```text
ERROR: permission denied for table flyway_schema_history
permission-denied_EXIT=1

S19_UNEXPECTED_OUTPUT_SENTINEL
unexpected-exit-zero_EXIT=1
```

두 번째 입력은 fake Docker 자체는 exit 0이었지만, 허용되지 않은 출력이므로 복구 스크립트는 exit 1이었다.

#### 미커밋 손상

현재 HEAD의 auth V10을 임시 migration root에 복사한 뒤 blob을 대조했다. 먼저 정상 복사본은 다음과 같았다.

```text
NORMAL_HEAD_BLOB=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
NORMAL_COPY_BLOB=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
NORMAL_BLOB_EQUAL=True
```

복사본 내용을 미커밋 손상으로 교체한 뒤 같은 checksum mismatch 입력을 넣었다.

```text
DAMAGED_HEAD_BLOB=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
DAMAGED_WORKING_BLOB=c3e9a350b0632afc597a7c708399fd5be0fabbbe
DAMAGED_BLOB_EQUAL=False
Flyway repair refused because the migration file is not identical to the current HEAD commit.
UNCOMMITTED_DAMAGE_EXIT=1
```

## 2. 이슈 #1136 본체 도달성

### 2.1 적용 migration 편집이 CI 호출 경로에서 막히는가

임시 Git fixture에서 main의 `V1__base.sql`을 feature commit이 수정하도록 만들었다. workflow의 PR 호출 형태와 main push 호출 형태를 각각 그대로 실행했다.

```powershell
.\scripts\check-applied-migrations.ps1 -RepoPath <fixture> -BaseRef main
.\scripts\check-applied-migrations.ps1 -RepoPath <fixture> -BaseRef main -BeforeRef <push-before-sha>
```

두 경로의 실측 원문:

```text
FAIL: 적용된 Flyway 마이그레이션은 수정·삭제·이름변경할 수 없습니다.

변경된 파일:
  M services/auth-service/src/main/resources/db/migration/V1__base.sql

PR_APPLIED_EDIT_EXIT=1
PUSH_APPLIED_EDIT_EXIT=1
```

왜 실 경로인가: `.github/workflows/applied-migration-guard.yml`은 PR에서 `-BaseRef origin/main`, push에서 `github.event.before`를 `-BeforeRef`로 넘겨 같은 스크립트를 실행한다. 현재 PR에서도 실제 `Applied Flyway Migration Guard / 적용된 Flyway 마이그레이션 불변 가드` job이 이 workflow로 실행된 것을 확인했다.

따라서 이슈 #1136의 사고인 “main에 이미 있는 V migration 편집”은 PR과 main push 양쪽에서 CI 실패에 도달한다.

### 2.2 정상 개발자 작업 오차단 수

| 정상 작업 | 실측 입력 | 가드가 막은 건수 |
|---|---:|---:|
| 새 migration 추가 | 임시 fixture `A V2__new.sql` 1건 | **0** |
| 미적용 migration 수정 | main에 없는 V2를 추가 commit 뒤 다시 수정, 최종 diff `A` 1건 | **0** |
| rebase | 실제 현재 graph의 branch 쪽 migration 변화 0건, main 쪽 migration 변화 0건 | **0** |
| main 병합 | 같은 실제 graph에서 병합 후 main 대비 남을 migration 변화 0건 | **0** |

신규와 미적용 수정의 원문:

```text
A services/auth-service/src/main/resources/db/migration/V2__new.sql
NEW_ADDITION_GUARD_EXIT=0
NEW_ADDITION_BLOCKED_COUNT=0

A services/auth-service/src/main/resources/db/migration/V2__new.sql
UNAPPLIED_EDIT_GUARD_EXIT=0
UNAPPLIED_EDIT_BLOCKED_COUNT=0
```

미적용 파일을 여러 commit에서 고쳐도 main 기준 최종 상태는 `A`이므로 수정된 적용 파일을 뜻하는 `M`으로 바뀌지 않았다.

현재 실제 graph도 읽기 조회했다.

```text
MERGE_BASE=2ad80477d9a7b49d7a28977507b0b3440a546334
MAIN_ONLY_MIGRATION_CHANGE_COUNT=0
BRANCH_ONLY_MIGRATION_CHANGE_COUNT=0
PR_THREEDOT_MIGRATION_CHANGE_COUNT=0
CURRENT_GUARD_EXIT=0
```

14개 실제 서비스 DB의 versioned history와 현재 저장소 V 파일을 읽기 대조한 결과 저장소 V 파일 407개 중 DB에 없는 파일은 0개였다. 즉 현재 실 DB에는 “아직 적용되지 않은 저장소 V 파일” 표본이 없었고, 그 경로는 위 main 부재 fixture로 밟았다. DB에는 현재 `origin/main`보다 앞선 별도 배포 이력 3개(auth V95·V96, slip V118)가 있었지만, `origin/main` 가드 모집단 407개에는 포함하지 않았다.

### 2.3 정상 복구 — 로컬=커밋, DB 체크섬만 낡음

위 정상 auth V10 복사본에 실제 Flyway 10.10.0 checksum mismatch 형식을 입력하고 `-WhatIf`로 실행했다.

```text
NORMAL_HEAD_BLOB=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
NORMAL_COPY_BLOB=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
NORMAL_BLOB_EQUAL=True
auth-service: checksum mismatch versions = 10
What if: Performing the operation "Flyway repair (checksum metadata only)" on target "auth-service".
NORMAL_RECOVERY_EXIT=0
```

왜 실 경로인가: 현재 HEAD의 실제 migration blob을 사용했고, 공개 `-DockerCommand` 경계로 stale DB validate 출력을 넣은 뒤 git baseline과 `ShouldProcess`까지 통과했다. 실제 history는 바꾸지 않았다.

## 3. 회귀 울타리

### 3.1 DB 매핑·조용한 누락

14개 명시 서비스 DB만 읽기 조회했다. 14/14 DB와 `flyway_schema_history`가 존재했고 모든 현재 V 파일 버전이 적용 이력에 있었다. 전체 repair fixture는 14개 서비스의 처음 `accounting-service`부터 마지막 `user-service`까지 처리했다.

누락 fixture는 다음 원문으로 fail-closed였다.

```text
Service discovery failed; resolve the omitted service(s) before running Flyway repair.
dashboard-service (migration directory not found): ...\dashboard-service\src\main\resources\db\migration
new-service (no database mapping): ...\new-service\src\main\resources\db\migration
```

### 3.2 git baseline 전수와 적용 migration 가드

`origin/main` tree의 실제 V migration을 서비스별로 집계했다.

```text
accounting-service=70   arologis-service=25   auth-service=94
dashboard-service=7    dc-config-service=5   groupware-service=18
inventory-service=23   notification-service=10   partner-auth-service=3
partner-order-service=17   partner-service=13   product-service=32
slip-service=78   user-service=12
ORIGIN_MAIN_MIGRATIONS=407
AS_MODIFIED_BLOCK=407
AS_DELETED_BLOCK=407
AS_RENAMED_OLDPATH_BLOCK=407
```

현재 작업 트리의 migration blob은 정상 복구 표본에서 HEAD와 일치했고, 같은 파일의 미커밋 손상은 blob 불일치로 exit 1이었다. 수정·삭제·rename 분기는 origin/main의 407개 경로 전부를 대상으로 한다.

### 3.3 fixture가 실제 실행 입력인가

원본 fixture·guard 동시 실행:

```text
Flyway repair credential scenarios: PASS
REPAIR_EXIT=0
Flyway applied-migration guard scenarios: PASS
GUARD_EXIT=0
```

저장소 파일은 건드리지 않고 fixture와 test의 임시 복사본을 만들었다. checksum 핵심 행은 유지한 채 다음 sentinel을 추가했다.

```text
S19_UNEXPECTED_SENTINEL_FROM_MUTATED_FIXTURE
```

실측:

```text
fixture-backed checksum mismatch preview failed:
...
S19_UNEXPECTED_SENTINEL_FROM_MUTATED_FIXTURE
MUTATED_FIXTURE_TEST_EXIT=1
```

fixture 변이가 실제 repair 실행 입력까지 전달되어 결과를 exit 0에서 exit 1로 바꿨다.

## 4. S18 증거 무결성 — RED-A·GREEN 재현

S18 직전 script는 `git show d041025c8^:scripts/repair-flyway-checksums.ps1`로 읽어 임시 파일에 두고, 현재 script와 완전히 같은 repair 인자를 사용했다.

입력:

```text
Successfully validated ,,, migrations (execution time permission denied)
```

S18 직전 원문:

```text
auth-service: checksum mismatch versions = (none)
PRE_S18_RED_A_EXIT=0
```

현재 HEAD 원문:

```text
auth-service validate failed for a reason other than a checksum mismatch:
Successfully validated ,,, migrations (execution time permission denied)
CURRENT_GREEN_EXIT=1
```

S18 보고서의 RED-A와 수정 후 GREEN 전환을 같은 repair 호출 경계에서 재현했다. 이어서 보고서의 GREEN 명령 두 개도 그대로 재실행했다.

```text
Flyway repair credential scenarios: PASS
REPAIR_EXIT=0
Flyway applied-migration guard scenarios: PASS
GUARD_EXIT=0
```

실행 전후 현재 작업 트리는 다음과 같이 유지됐다.

```text
BEFORE_BRANCH=fix/1136-flyway-applied-migration-guard
AFTER_BRANCH=fix/1136-flyway-applied-migration-guard
BEFORE_HEAD=d041025c87ff1f08fd0337a41d7a3cd6e44b8a5a
AFTER_HEAD=d041025c87ff1f08fd0337a41d7a3cd6e44b8a5a
BEFORE_STATUS_COUNT=0
AFTER_STATUS_COUNT=0
```

## 5. 이 라운드가 보지 않은 것

- 실제 `flyway repair` 실행과 `flyway_schema_history` 변경. 사용자 제한에 따라 정상 복구는 `-WhatIf`까지만 도달했다.
- 실제 불법 migration 편집 commit을 원격 PR/main에 push해 GitHub job을 red로 만드는 행위. 대신 동일 workflow 인자의 PR·push 호출을 임시 Git fixture에서 exit 1까지 밟고, workflow 배선과 현재 PR의 실제 job 실행을 대조했다.
- 현재 브랜치에서 실제 `git rebase` 또는 `git merge` 실행. 사용자 제한에 따라 현재 graph의 merge-base 및 양쪽 migration delta를 읽어 차단 건수를 셌다.
- Docker 재기동·재배포, 애플리케이션 기동·로그인 기능, 전체 Gradle suite.
- QA 잔재 DB(`slip_db_qa_e2estimate`, `sol951_*`). 열거·조회·삭제하지 않았다.
- Flyway 10.10.0 이외 버전, 100분 이상 또는 시간 단위가 추가되는 실행 시간 출력 형식.
- 현재 `origin/main`에 아직 없는 별도 선행 배포 migration 3개의 불변성. 이 가드는 이슈 #1136 계약대로 `origin/main`을 적용 대상의 기준으로 삼는다.

## 6. 신규 파일

- `docs/dev-reports/2026-08-08-1136-s19-merge-reconvergence.md`
