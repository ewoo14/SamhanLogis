# PR #1137 / 이슈 #1136 — S18 허용 정규식 축소

## 결론

S16의 정상 Flyway 출력 허용 조건 한 줄만 좁혔다. 숫자는 일반 정수 또는 3자리 단위 쉼표 형식만 허용하고, 실행 시간은 실제 Flyway 출력인 `HH:MM.mmm` 뒤에 `s`가 붙는 숫자형 표기만 허용한다.

실제 적용 패턴:

```regex
^\s*Successfully validated\s+[0-9]+(?:,[0-9]{3})*\s+migrations\s+\(execution time\s+\d{2}:\d{2}\.\d{3}s\)\s*$
```

예: `00:00.267s`.

## 1. 새로 가능해진 조합과 결과

숫자 조합은 `[0-9]+(?:,[0-9]{3})*`로 제한했다. 따라서 `96`, `1,234`, `12,345,678`은 허용되고 `,,,`, `12,34`는 거부된다. 실행 시간은 숫자형 `HH:MM.mmm` 뒤 `s`만 허용한다. fixture에서 `00:00.267s`, `00:01.002s`, `01:02.003s`를 허용 조합으로 밟았고 `permission denied`, `00:00s`를 거부 조합으로 밟았다.

### RED-A — 수정 전 원문

실행 명령:

```powershell
$out = @(& .\scripts\repair-flyway-checksums.ps1 -RepoPath $PWD -MigrationRoot $PWD -EnvFile <temporary-env> -Service auth-service -PostgresContainer unused -DockerCommand <fake-cmd> -WhatIf 2>&1)
$code = $LASTEXITCODE
```

fake Docker 입력 원문:

```text
Successfully validated ,,, migrations (execution time permission denied)
```

수정 전 출력 원문:

```text
Environment file: C:\Users\user\AppData\Local\Temp\s18-red-c7d93bd549eb4833949e89396a170677\infrastructure\.env
auth-service: checksum mismatch versions = (none)
RED-A exit=0
```

### RED-B 및 수정 후 fixture 결과

실행 명령:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 -RepoPath $PWD -MigrationRoot $PWD -EnvFile <temporary-env> -Service auth-service -PostgresContainer unused -DockerCommand <fake-cmd> -WhatIf 2>&1
$code = $LASTEXITCODE
```

정상 조합 원문과 종료코드:

```text
CASE: Successfully validated 96 migrations (execution time 00:00.267s)
Environment file: ...\infrastructure\.env
auth-service: checksum mismatch versions = (none)
EXIT=0

CASE: Successfully validated 1,234 migrations (execution time 00:01.002s)
Environment file: ...\infrastructure\.env
auth-service: checksum mismatch versions = (none)
EXIT=0

CASE: Successfully validated 12,345,678 migrations (execution time 01:02.003s)
Environment file: ...\infrastructure\.env
auth-service: checksum mismatch versions = (none)
EXIT=0
```

비정상 조합 원문과 종료코드:

```text
CASE: Successfully validated ,,, migrations (execution time permission denied)
Environment file: ...\infrastructure\.env
EXIT=1

CASE: Successfully validated 96 migrations (execution time permission denied)
Environment file: ...\infrastructure\.env
EXIT=1

CASE: Successfully validated 12,34 migrations (execution time 00:01.002s)
Environment file: ...\infrastructure\.env
EXIT=1
```

각 비정상 케이스의 stderr 원문은 다음 공통 판정을 포함했다.

```text
auth-service validate failed for a reason other than a checksum mismatch:
Successfully validated <비정상 원문>
```

## 2. 패턴 참조 전수 확인

실행 명령:

```powershell
rg -n -F '[0-9]+(?:,[0-9]{3})*' scripts .github
```

출력 원문:

```text
scripts\repair-flyway-checksums.ps1:209:                $line -notmatch '(?i)^\s*Successfully validated\s+[0-9]+(?:,[0-9]{3})*\s+migrations\s+\(execution time\s+\d{2}:\d{2}\.\d{3}s\)\s*$' -and
fragment-grep-exit=0
```

전체 정상 문장 관련 참조도 확인했다.

```powershell
rg -n 'Successfully validated|execution time' scripts .github
```

출력 원문:

```text
scripts\repair-flyway-checksums.test.ps1:109:echo Successfully validated 96 migrations (execution time 00:00.267s)
scripts\repair-flyway-checksums.test.ps1:155:        if ($successfulText -match 'validate failed for a reason other than a checksum mismatch|Successfully validated') { throw "successful Flyway validation was rejected: $successfulText" }
scripts\repair-flyway-checksums.ps1:209:                $line -notmatch '(?i)^\s*Successfully validated\s+[0-9]+(?:,[0-9]{3})*\s+migrations\s+\(execution time\s+\d{2}:\d{2}\.\d{3}s\)\s*$' -and
sentence-grep-exit=0
```

허용 패턴의 실행 코드 참조는 `scripts/repair-flyway-checksums.ps1:209` 한 곳이다. 다른 허용 패턴, S13/S14/S16 배선은 변경하지 않았다.

## 3. 지정 검증 및 동시 GREEN

### fixture

실행 명령:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.test.ps1
$repairCode = $LASTEXITCODE
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-applied-migrations.test.ps1
$guardCode = $LASTEXITCODE
```

출력 원문:

```text
Flyway repair credential scenarios: PASS
repair-flyway-checksums.test.ps1 exit=0
Flyway applied-migration guard scenarios: PASS
check-applied-migrations.test.ps1 exit=0
```

`repair-flyway-checksums.test.ps1` 안의 checksum mismatch + 비-checksum 오류 혼합 거부, fixture 입력 배선, baseline 거부, 서비스 누락 진단은 모두 기존 시나리오 그대로 통과했다.

### 실제 accounting-service · auth-service

실행 명령:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 -Service accounting-service -WhatIf 2>&1
$accountingCode = $LASTEXITCODE
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-flyway-checksums.ps1 -Service auth-service -WhatIf 2>&1
$authCode = $LASTEXITCODE
```

출력 원문:

```text
===ACCOUNTING===
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
accounting-service: checksum mismatch versions = (none)
ACCOUNTING_EXIT=0
===AUTH===
Environment file: C:\dev\Samhan-Public\.claude\worktrees\t1123\infrastructure\.env.local
auth-service: checksum mismatch versions = (none)
AUTH_EXIT=0
```

실제 두 서비스의 정상 Flyway 출력 형태는 각각 `Successfully validated 70 migrations (execution time 00:00.172s)`, `Successfully validated 96 migrations (execution time 00:00.215s)`였고, 두 `-WhatIf` 모두 exit 0으로 유지됐다.

## 변경 범위 및 신규 파일

- 수정: `scripts/repair-flyway-checksums.ps1` — 정상 출력 허용 정규식 한 줄.
- 신규: `docs/dev-reports/2026-08-08-1136-s18-pattern-tightened.md`.
- 실제 `repair` 실행, `flyway_schema_history` 수정, Docker 재기동, 전체 Gradle suite, commit/push/checkout은 수행하지 않았다.
