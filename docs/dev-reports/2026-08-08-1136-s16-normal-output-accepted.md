# PR #1137 / 이슈 #1136 — S16 정상 출력 허용 fix

## 결론

S15의 두 결함을 수정했다.

- Flyway 10.10.0 정상 validate의 `Successfully validated N migrations (execution time ...)` 한 줄만 자유 텍스트 허용목록에 추가했다. checksum mismatch 탐지, 비-checksum 실패 거부, git baseline 판정은 그대로 유지했다.
- 기존 fixture `scripts/fixtures/flyway-validate-checksum-mismatch.txt`를 테스트가 별도 fake Docker 실행 입력으로 직접 `type`하도록 연결했다. 테스트가 fixture 내용을 읽고 정규식만 확인하던 경로는 제거했다.

실제 두 서비스 정상 preview, checksum-only 복구 도달, 미커밋 손상 거부, 비-checksum 실패 거부가 동시에 확인됐다. 실제 repair나 `flyway_schema_history` 변경은 하지 않았다.

## RED-A — 정상 실제 출력 두 서비스

S15에서 확보한 실제 Flyway 10.10.0 출력은 두 서비스 모두 다음 정상 문구를 포함했지만, fix 전 exit 1이었다.

```text
Successfully validated 70 migrations (execution time 00:00.206s)
accounting-service validate failed for a reason other than a checksum mismatch:
NORMAL_REAL_WHATIF_EXIT=1

Successfully validated 96 migrations (execution time 00:00.292s)
auth-service validate failed for a reason other than a checksum mismatch:
AUTH_REAL_WHATIF_EXIT=1
```

원인은 `Successfully validated ...`가 `$unexpectedLines`에서 허용되지 않았기 때문이다.

## RED-B 원문

기존 회귀 테스트의 미커밋 손상 입력(`V10`을 `-- uncommitted destruction`으로 치환)은 fix 전후 모두 다음 판정을 유지했다.

```text
RED-B raw output:
Flyway repair refused because the migration file is not identical to the current HEAD commit.
services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql:
HEAD=648dfeb08f11fd41215b6b97d44a60f7bc75d6b2
working-tree=b84715639f4083a1f64a1ccb3d5c5d7ed02f4d89
```

비-checksum 혼합 실패도 테스트에서 `Migration checksum mismatch`와 `Detected failed migration`을 함께 출력하고 거부했다.

## 동시 GREEN 원문

실제 공유 DB에 읽기 전용 `validate`만 수행했다. 명령은 `-WhatIf`였고 repair는 실행되지 않았다.

```text
powershell.exe -NoProfile -File scripts/repair-flyway-checksums.ps1 -Service accounting-service -WhatIf
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
accounting-service: checksum mismatch versions = (none)
ACCOUNTING_GREEN_EXIT=0

powershell.exe -NoProfile -File scripts/repair-flyway-checksums.ps1 -Service auth-service -WhatIf
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
auth-service: checksum mismatch versions = (none)
AUTH_GREEN_EXIT=0
```

테스트 fake Docker에도 실제 정상 출력 전문을 넣어 실행했다.

```text
Flyway OSS Edition 10.10.0 by Redgate
Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14)
Successfully validated 96 migrations (execution time 00:00.267s)
auth-service: checksum mismatch versions = (none)
```

checksum-only fixture 입력은 `V1`을 읽고 다음 복구 preview까지 도달했다.

```text
auth-service: checksum mismatch versions = 1
What if: Performing the operation "Flyway repair (checksum metadata only)" on target "auth-service".
```

## 새로 가능해진 상태·환경 조합

1. 실제 `accounting-service` + Flyway 10.10.0 정상 출력: exit 0. `70 migrations` 문구와 경고/DB 정보가 있어도 통과했다.
2. 실제 `auth-service` + Flyway 10.10.0 정상 출력: exit 0. `96 migrations` 문구와 경고/DB 정보가 있어도 통과했다.
3. fake Docker + 기존 checksum mismatch fixture + git baseline 일치: fixture를 실제 실행 입력으로 읽고 version 1 repair preview에 도달했다.

다음 상태는 새로 허용하지 않았다.

- git baseline 불일치: 계속 거부.
- checksum 이외의 validate 실패/실패 migration 혼합: 계속 거부.
- 서비스 매핑 누락·migration 디렉터리 누락: 계속 진단 후 거부.

## fixture 실행 입력 증거

`$fixtureDocker`가 `scripts/fixtures/flyway-validate-checksum-mismatch.txt`의 경로를 `type`으로 직접 출력하고 exit 1을 반환한다. 테스트는 이 Docker command를 실제 스크립트에 전달하고, 결과에서 `checksum mismatch versions = 1` 및 `What if`를 단정한다.

따라서 fixture는 현재 테스트 `scripts/repair-flyway-checksums.test.ps1`의 checksum-only preview 실행 입력이다. fixture 내용의 정규식 확인만 하는 경로가 아니다.

## 필수 3절

### 1. 새 상태·환경 조합과 결과

위 “새로 가능해진 상태·환경 조합” 3건을 각각 실행했고, 실제 두 서비스는 exit 0, fixture checksum-only는 preview 도달을 확인했다. RED-B 미커밋 손상과 비-checksum 실패는 계속 거부됐다.

### 2. 제거·이동·개명 식별자 grep 전수 확인

S14의 손으로 출력하던 `checksum-mismatch-real` mode와 `successfulValidationOutput`/`SUCCESSFUL_VALIDATION_OUTPUT` 식별자를 제거했다.

```text
rg -n "checksum-mismatch-real|successfulValidationOutput|SUCCESSFUL_VALIDATION_OUTPUT" scripts/repair-flyway-checksums.test.ps1
STALE_IDENTIFIERS=0
```

현재 fixture·테스트 참조는 다음 식별자만 남는다.

```text
flywayOutputFixture
fixtureDocker
successfulDocker
```

### 3. 변경 파일 참조 테스트 결과

변경된 두 파일을 참조하는 테스트를 실행했다.

```text
powershell.exe -NoProfile -File scripts/repair-flyway-checksums.test.ps1
Flyway repair credential scenarios: PASS
REPAIR_TEST_EXIT=0

powershell.exe -NoProfile -File scripts/check-applied-migrations.test.ps1
Flyway applied-migration guard scenarios: PASS
GUARD_TEST_EXIT=0
```

실제 서비스 명령의 종료코드는 파이프 없이 별도 변수로 측정했다: `ACCOUNTING_GREEN_EXIT=0`, `AUTH_GREEN_EXIT=0`.

## 변경·신규 파일

변경:

- `scripts/repair-flyway-checksums.ps1`
- `scripts/repair-flyway-checksums.test.ps1`

신규:

- `docs/dev-reports/2026-08-08-1136-s16-normal-output-accepted.md`

기존 `scripts/fixtures/flyway-validate-checksum-mismatch.txt`는 수정하지 않고 테스트 실행 입력으로 사용했다.

## 제한 준수

- 실제 Flyway `repair` 미실행.
- `flyway_schema_history` 수정 없음.
- Docker 재기동·재배포 없음.
- QA 잔재 DB 접근·삭제·서비스 취급 없음.
- 전체 Gradle suite 미실행.
- git commit/push/checkout 미실행.
