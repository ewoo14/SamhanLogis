# PR #1191 UTF-8 검출 구멍 수정 — CODEX LUNA

검증일: 2026-08-12  
대상: `scripts/qa/clone-db-utf8.sh`  
원칙: 공유 `samhan-postgres`에는 읽기만 실행하고, 별도 fixture/격리 컨테이너만 쓰기

## 1. RED — 수정 전 실제 재현

별도 fixture 컨테이너 `qa-luna-source-0812`의 DB를 소스로 사용하고, PowerShell에서 명시적 Git Bash를 `Start-Job`으로 호출했다. 복제가 끝나 격리 컨테이너의 테이블이 생기는 순간 대상만 변경했다.

### 기존 `?`가 있는 행의 부분 손상

소스 값은 `정상?한글`, 대상 값은 `정상???`이었다.

```text
UPDATE 1
INJECTED_CONTAINER=qa-clone-utf8-20260812214730-964
STATE=Completed INJECTED=True
[clone] isolated container: qa-clone-utf8-20260812214730-964
[clone] dumping sol_partial_masked from host.docker.internal:55591
[clone] verifying UTF-8 content in sol_partial_masked
[clone] PASS sol_partial_masked
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
```

### 검사 대상 한글 행 0건 + JSONB 손상

`text` 컬럼은 ASCII만 두고 JSONB의 `{"name":"한글이름"}`만 대상에서 `{"name":"????"}`로 바꿨다.

```text
UPDATE 1
INJECTED_CONTAINER=qa-clone-utf8-20260812214748-1097
STATE=Completed INJECTED=True
[clone] dumping sol_no_checked_korean from host.docker.internal:55591
[clone] verifying UTF-8 content in sol_no_checked_korean
[clone] PASS sol_no_checked_korean
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
[clone] warning: source 한글 컬럼 없음: sol_no_checked_korean
```

두 케이스 모두 수정 전에는 명백히 손상된 격리본이 `EXIT=0`으로 통과했다.

## 2. 수정

- 검사 대상 컬럼의 전체 값을 정렬해 fingerprint를 만들고 원본·복제본을 비교한다. 따라서 원래 `?`가 있더라도 같은 행의 한글이 바뀌면 행 수가 같아도 실패한다.
- 기존 한글 행 감소와 물음표 행 증가 조건은 유지한다.
- 검사 대상 컬럼에서 원본 한글 행을 하나도 찾지 못하면 warning 후 PASS하지 않고 즉시 `EXIT=1`로 종료한다. JSONB처럼 별도 위치에 한글이 있는 DB도 fail-open하지 않는다.

## 3. GREEN — 같은 재현의 수정 후 결과

### 부분 손상

```text
UPDATE 1
INJECTED_CONTAINER=qa-clone-utf8-20260812214848-605
STATE=Completed INJECTED=True
[clone] dumping sol_partial_masked from host.docker.internal:55591
[clone] verifying UTF-8 content in sol_partial_masked
INNER_EXIT=1
UTF-8 검증 실패: db=sol_partial_masked table=public.z_target column=name source_korean_rows=1 target_korean_rows=1 source_question_mark_rows=1 target_question_mark_rows=1
```

### 검사 대상 한글 행 0건 + JSONB 손상

```text
UPDATE 1
INJECTED_CONTAINER=qa-clone-utf8-20260812214906-1691
STATE=Completed INJECTED=True
[clone] dumping sol_no_checked_korean from host.docker.internal:55591
[clone] verifying UTF-8 content in sol_no_checked_korean
INNER_EXIT=1
UTF-8 검증 실패: db=sol_no_checked_korean source 한글 행을 검사 대상 컬럼에서 찾지 못함
```

## 4. 정상 복제 및 기존 차단 회귀

정상 fixture 복제:

```text
[clone] dumping sol_partial_masked from host.docker.internal:55591
[clone] verifying UTF-8 content in sol_partial_masked
[clone] PASS sol_partial_masked
[clone] PASS all databases; isolated container and dump files will be removed
EXIT=0
```

실제 `partner_db` 정상 복제도 PowerShell에서 명시적 Git Bash로 실행했다.

```text
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
PARTNER_EXIT=0
```

전부 손상한 fixture는 `source_korean_rows=2 target_korean_rows=0`, `source_question_mark_rows=0 target_question_mark_rows=2`로 `INNER_EXIT=1`이었다. dump 대상 DB가 없는 경우도 다음과 같이 `MISSING_EXIT=1`이었다.

```text
[clone] dumping sol_missing_db from host.docker.internal:55591
MISSING_EXIT=1
pg_dump: error: ... database "sol_missing_db" does not exist
```

기존 일반 부분 손상 차단 및 `partner_db`의 기존 `8314 → 8313`, `0 → 1`, `EXIT=1` 수치는 리뷰 보고서의 격리 실측과 동일한 판정 조건을 유지한다.

## 5. PowerShell 경유·정적 검증

- PowerShell `Start-Job` → `C:\Program Files\Git\bin\bash.exe -lc ...` 경로에서 두 RED가 모두 `1`로 전환됐다.
- PowerShell 직접 호출의 정상 `partner_db` 결과는 `PARTNER_EXIT=0`이다.
- Git Bash 문법 검사: `GIT_BASH_N=0`.
- Job 오류 스트림에서는 한글이 PowerShell 직렬화로 깨져 보일 수 있었으나 exit code와 판정은 정확했다. 직접 Git Bash 출력은 UTF-8 원문이다.

## 6. 못 한 것

- dump 성공 후 `pg_restore` 프로세스만 강제 실패시키는 장애 주입은 하지 않았다. 기존 리뷰에서 확인한 소스 `pg_dump` 실패 차단은 이번 수정 후에도 `MISSING_EXIT=1`로 재확인했다.
- JSONB 내부의 한글을 별도 순회해 정상 문자열과 대조하지는 않는다. 대신 검사 대상 text/varchar/char 컬럼에 한글 행이 없으면 fail-closed하므로 JSONB 손상 사례가 PASS하지 않는다.

## 7. 라운드 종료 점검

`origin/main...HEAD` 기준 삭제된 추적 파일 없음; `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재·변경 없음. fixture 컨테이너·격리 컨테이너·dump·임시 디렉터리·검증 프로세스는 정리했다.
