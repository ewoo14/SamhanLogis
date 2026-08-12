# PR #1191 재수렴 3차 적대검증 — fix3 동시성·최종 재검증

검증일: 2026-08-12  
검증자: CODEX SOL  
대상: `scripts/qa/clone-db-utf8.sh`  
호출 환경: PowerShell → `C:\Program Files\Git\bin\bash.exe`  
브랜치: `chore/qa-clone-utf8-harness`

## 판정

**깨진 복제본이 통과하는 도달 가능한 경로가 1개 있다. 멀쩡한 복제본이 차단되는 경로는 이번 실행 범위에서 0개다. 머지하면 안 된다.**

- **SOL-R3-1 — 깨진 복제본 통과:** fix3의 최종 `pg_dump`가 시작되어 PostgreSQL snapshot을 잡은 뒤 target 값을 바꾸면 최종 dump는 변경 전 snapshot을 끝까지 출력한다. 실제 target은 `1:부산,2:서울`로 바뀌었지만 expected와 final dump가 같아 `INNER_EXIT=0`으로 통과했다.
- 첫 비교 입력이 완성되고 최종 dump 파일이 아직 없을 때 같은 swap을 넣은 경우는 `INNER_EXIT=1`과 `(최종 재검증)` 경로로 차단됐다. 즉 fix3가 닫은 창은 실제로 닫혔지만, 검증의 마지막 snapshot 뒤에 새 창이 남았다.
- 정상 `partner_db`, ASCII 위주 DB, 정당한 `?`, 실제 동시 쓰기 240건, 같은 DB 동시 복제 2회, 다른 DB 동시 복제 2회, 12테이블/120,000행은 모두 `EXIT=0`이었다.
- 비교 전 부분 손상, JSONB·배열·메타데이터 손상, 행 swap, 한 글자, U+FFFD, 빈 문자열, 전부 손상, 일부 테이블 손상, dump 실패는 모두 `EXIT=1`이었다.

공유 `samhan-postgres`에는 `partner_db`의 dump/read만 수행했다. 모든 fixture 생성, 동시 쓰기, target 손상 주입은 전용 `sol1191-reconv3-src`와 실행별 `qa-clone-utf8-*` 컨테이너에서만 수행했다. 대상 스크립트는 수정하지 않았다.

> PowerShell `Start-Job`이 native stderr를 역직렬화할 때 한글 오류문이 mojibake가 됐다. 해당 실행은 주입 SQL 성공 원문, DB명, `INNER_EXIT`를 판정 증거로 사용했고, 오류문의 한국어 원문은 현재 대상 스크립트의 고정 literal과 대조했다. 이를 정상 출력으로 가장하지 않는다.

## 공통 실행 형태와 fixture

```text
$bash='C:\Program Files\Git\bin\bash.exe'
& $bash -lc "cd /c/dev/Samhan-Public/.claude/worktrees/w1191 && QA_CLONE_ENV_FILE=.sol1191-reconv3-isolated.env bash scripts/qa/clone-db-utf8.sh <db>"
```

격리 source는 PostgreSQL 16 Alpine, Docker 자동 할당 host port `64388`이었다.

```text
sol3_live      50,000행 기준선
sol3_large     12 tables / 120,000 rows / text + JSONB + text[] + COMMENT
sol3_lateswap  400,002 rows
sol3_interrupt 1,000,000 rows
```

## A. 멀쩡한 것이 차단되는가

### 1. 정상 `partner_db` 복제 — `EXIT=0`

공유 DB에는 읽기만 했다.

```text
POWERSHELL_COMMAND=& $bash -lc "... QA_CLONE_ENV_FILE=.sol1191-reconv3-shared.env bash scripts/qa/clone-db-utf8.sh partner_db"
[clone] isolated container: qa-clone-utf8-20260812232258-1022
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A1_partner_db EXIT=0 ELAPSED_MS=9372
```

### 2. 한글이 거의 없는 정상 DB — `EXIT=0`

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol3_ascii"
[clone] isolated container: qa-clone-utf8-20260812232307-2009
[clone] dumping sol3_ascii from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_ascii
[clone] PASS sol3_ascii
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A2_ascii EXIT=0 ELAPSED_MS=6995
```

### 3. 정당한 `?`가 든 데이터 — `EXIT=0`

source 값은 `문의?확인합니다`와 `정상 한글`이었다.

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol3_question"
[clone] isolated container: qa-clone-utf8-20260812232314-1097
[clone] dumping sol3_question from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_question
[clone] PASS sol3_question
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A3_legit_question EXIT=0 ELAPSED_MS=7197
```

### 4. 원본에 실제 동시 쓰기 240건 — `EXIT=0`

PowerShell `Start-Job`으로 전용 source에 15ms 간격의 개별 `INSERT` 240회를 걸고 clone을 겹쳤다.

```text
POWERSHELL_COMMAND=$writer=Start-Job { for($i=1;$i -le 240;$i++){ docker exec sol1191-reconv3-src psql ... -c "INSERT INTO live_data(name) VALUES ('실시간-$i')"; Start-Sleep -Milliseconds 15 } }; & $bash -lc "... clone-db-utf8.sh sol3_live"
===== CASE=A4_concurrent_source_writes BEFORE=50000 =====
[clone] isolated container: qa-clone-utf8-20260812232356-651
[clone] dumping sol3_live from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_live
[clone] PASS sol3_live
[clone] PASS all databases; isolated container and dump files will be removed
WRITER_INSERTS=240
CASE=A4_concurrent_source_writes EXIT=0 ELAPSED_MS=7504 BEFORE=50000 AFTER=50240 DELTA=240
```

복제 중 실제 commit이 계속 발생했고 source는 50,000→50,240행으로 늘었다. live source 재조회에 의한 오차단은 재현되지 않았다.

### 5. 동시 복제 — 같은 DB 2회와 다른 DB 2회 모두 `EXIT=0`

#### 같은 DB (`sol3_large`) 2회

```text
POWERSHELL_COMMAND=$j1=Start-Job <clone sol3_large>; $j2=Start-Job <clone sol3_large>; Wait-Job $j1,$j2
OBSERVED=qa-clone-utf8-20260812232505-1312 PORTS=127.0.0.1:51382->5432/tcp
OBSERVED=qa-clone-utf8-20260812232505-1307 PORTS=127.0.0.1:51381->5432/tcp
[SAME1] [clone] PASS sol3_large
[SAME1] [clone] PASS all databases; isolated container and dump files will be removed
[SAME1] INNER_EXIT=0
[SAME2] [clone] PASS sol3_large
[SAME2] [clone] PASS all databases; isolated container and dump files will be removed
[SAME2] INNER_EXIT=0
```

#### 다른 DB (`sol3_ascii`, `sol3_question`) 2회

```text
POWERSHELL_COMMAND=$j3=Start-Job <clone sol3_ascii>; $j4=Start-Job <clone sol3_question>; Wait-Job $j3,$j4
OBSERVED=qa-clone-utf8-20260812232514-1857 PORTS=127.0.0.1:51595->5432/tcp
OBSERVED=qa-clone-utf8-20260812232514-1847 PORTS=127.0.0.1:51594->5432/tcp
[DIFF1] [clone] PASS sol3_ascii
[DIFF1] INNER_EXIT=0
[DIFF2] [clone] PASS sol3_question
[DIFF2] INNER_EXIT=0
CASE=A5 POST_CONTAINER_COUNT=0
```

컨테이너 이름과 자동 할당 port가 모두 달랐고 서로 밟지 않았다.

### 6. 큰 DB·여러 테이블 — `EXIT=0`

12테이블, 합계 120,000행, 각 테이블에 text·JSONB·text 배열·한글 metadata를 넣었다.

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol3_large"
[clone] isolated container: qa-clone-utf8-20260812232321-925
[clone] dumping sol3_large from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_large
[clone] PASS sol3_large
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A6_large_12tables_120k EXIT=0 ELAPSED_MS=8308
```

## B. 깨진 것이 통과하는가

손상 실행은 모두 PowerShell에서 clone을 `Start-Job`으로 시작하고, 실행별 target DB의 원래 행이 restore된 것을 `SELECT`로 확인한 다음 `docker exec ... psql`로 target에만 주입했다.

### 7. 원래 `?` 있던 행의 부분 손상 — `EXIT=1`

```text
FAULT_TARGET=/qa-clone-utf8-20260812232555-1336 READY=True
INJECT=UPDATE 1
INJECT_EXIT=0
[clone] isolated container: qa-clone-utf8-20260812232555-1336
[clone] dumping sol3_partial from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_partial
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

주입 SQL: `UPDATE z_target SET name='문의???' WHERE id=1`.

### 8. JSONB·배열·메타데이터 손상 — `EXIT=1`

```text
FAULT_TARGET=/qa-clone-utf8-20260812232602-1117 READY=True
INJECT=UPDATE 1
INJECT=COMMENT
INJECT_EXIT=0
[clone] verifying UTF-8 content in sol3_nested
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

주입 SQL은 JSONB 내부 `서울`을 U+FFFD로, 배열을 `['','']`로, table comment를 `BROKEN`으로 바꿨다.

### 9. 행 사이 값 교환 — 비교 전 `EXIT=1`

```text
FAULT_TARGET=/qa-clone-utf8-20260812232608-481 READY=True
INJECT=UPDATE 2
INJECT_EXIT=0
[clone] verifying UTF-8 content in sol3_swap
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

주입 SQL: `서울↔부산` 두 행 swap.

### 10. 행 사이 값 교환 — 첫 비교 직후 경계 `EXIT=1`, 최종 snapshot 뒤 `EXIT=0`

#### fix3가 의도한 창: 첫 snapshot 입력 완성 후, final 파일 생성 전 — `EXIT=1`

```text
POWERSHELL_COMMAND=<clone sol3_lateswap Start-Job>; poll /tmp/sol3_lateswap.target.schema.sql; confirm final file absent; UPDATE two rows
PHASE_TARGET_SCHEMA_NONEMPTY=True FINAL_FILE_AT_INJECT=NO TARGET=/qa-clone-utf8-20260812232726-1666
UPDATE 2
INJECT_EXIT=0
[clone] isolated container: qa-clone-utf8-20260812232726-1666
[clone] dumping sol3_lateswap from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_lateswap
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

현재 스크립트 고정 오류문 대조: `UTF-8 검증 실패: db=sol3_lateswap 원본/복제본 스냅샷 불일치 (최종 재검증)`.

#### 남은 창: final `pg_dump` snapshot이 잡힌 뒤 — 요구 `EXIT=1`, 관찰 `EXIT=0`

400,002행 fixture에서 final dump 파일이 80,935,996 bytes까지 출력 중이고 `pg_dump` PID가 살아 있음을 확인한 뒤 같은 swap을 넣었다.

```text
POWERSHELL_COMMAND=<clone sol3_lateswap Start-Job>; poll target.final.sql > 1,000,000 bytes; confirm pg_dump PID; UPDATE two rows
===== CASE=B10b_swap_after_final_dump_snapshot =====
FIRST_COMPARE_INPUTS_READY=YES FINAL_FILE_BYTES_AT_INJECT=80935996 PG_DUMP_PID=508 TARGET=/qa-clone-utf8-20260812232805-1496
UPDATE 2
INJECT_EXIT=0
1:부산,2:서울
[clone] isolated container: qa-clone-utf8-20260812232805-1496
[clone] dumping sol3_lateswap from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_lateswap
[clone] PASS sol3_lateswap
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
POST_CONTAINER_COUNT=0
```

이것이 **SOL-R3-1**이다. 첫 비교는 이미 끝났고 final dump도 실행 중이었지만, final dump가 잡은 MVCC snapshot보다 늦은 target 변경은 final 파일에 반영되지 않았다.

### 11. 한 행·한 글자, U+FFFD, 빈 문자열 — 모두 `EXIT=1`

```text
CASE=B11_one_row_one_char
FAULT_TARGET=/qa-clone-utf8-20260812232615-1923 READY=True
INJECT=UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=B11_replacement_fffd
FAULT_TARGET=/qa-clone-utf8-20260812232622-983 READY=True
INJECT=UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=B11_replacement_empty
FAULT_TARGET=/qa-clone-utf8-20260812232628-1597 READY=True
INJECT=UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

각각 `한글→한나`, `한글→U+FFFD`, `한글→''`를 한 행에만 주입했다.

## C. 잃지 않았는가

### 12. 전부 손상·일부 테이블 손상·dump 실패 — 모두 `EXIT=1`

```text
CASE=C12_all_corrupt
FAULT_TARGET=/qa-clone-utf8-20260812232635-1150 READY=True
INJECT=UPDATE 3
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=C12_partial_table_corrupt
FAULT_TARGET=/qa-clone-utf8-20260812232642-651 READY=True
INJECT=UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

dump 실패는 존재하지 않는 DB를 PowerShell에서 직접 호출했다.

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol3_missing_1191"
[clone] isolated container: qa-clone-utf8-20260812232941-269
[clone] dumping sol3_missing_1191 from host.docker.internal:64388
pg_dump: error: connection to server at "host.docker.internal" (192.168.65.254), port 64388 failed: FATAL:
database "sol3_missing_1191" does not exist
CASE=C12_dump_failure EXIT=1
POST_DUMPFAIL_CONTAINER_COUNT=0
POST_DUMPFAIL_TMP_DIR_COUNT=0
```

### 13. expected DB·컨테이너 수명 — 성공·실패·SIGTERM 중단 뒤 잔존 0

#### 성공 수명과 phase 시간

```text
[clone] isolated container: qa-clone-utf8-20260812232902-276
[clone] PASS sol3_large
INNER_EXIT=0
LIFECYCLE_CONTAINER=dc6f32de14af
EXPECTED_DB=sol3_large__qa_expected_1786544942116204300-276
T_CONTAINER_MS=1636
T_EXPECTED_MS=5879
T_FIRST_SCHEMA_MS=6982
T_FINAL_DUMP_MS=7662
T_EXIT_MS=8481
POST_SUCCESS_CONTAINER_COUNT=0
POST_SUCCESS_TMP_DIR_COUNT=0
```

이 실행의 port를 읽는 inspect template은 문법 오류로 값을 못 얻었으므로 port 증거로 사용하지 않는다. 자동 port 분리는 A-5와 아래 실패 수명·63-byte 경계 실행의 성공 원문으로 대조했다.

#### 비교 실패 수명

```text
UPDATE 2
LIFECYCLE_CONTAINER=21ba72495c74
PORT=127.0.0.1:64365
EXPECTED_DB=sol3_swap__qa_expected_1786544967463351800-1553
INJECT_EXIT=0
INNER_EXIT=1
POST_FAILURE_CONTAINER_COUNT=0
POST_FAILURE_TMP_DIR_COUNT=0
```

#### 실행 중 SIGTERM

1,000,000행 DB의 run-scoped expected DB가 만들어진 것을 확인한 뒤, 컨테이너 이름의 Bash PID에 Git Bash `kill -TERM`을 보냈다.

```text
===== CASE=C13_interrupt_SIGTERM_cleanup =====
BEFORE_INTERRUPT_CONTAINER=qa-clone-utf8-20260812233054-1596
EXPECTED_DB=sol3_interrupt__qa_expected_1786545054677533000-1596
MSYS_PID=1596
SIGNAL_EXIT=0
[clone] isolated container: qa-clone-utf8-20260812233054-1596
[clone] dumping sol3_interrupt from host.docker.internal:64388
[clone] verifying UTF-8 content in sol3_interrupt
INNER_EXIT=3840
POST_INTERRUPT_CONTAINER_COUNT=0
POST_INTERRUPT_TMP_DIR_COUNT=0
```

PowerShell가 받은 `3840`은 MSYS의 SIGTERM 종료 표현이며 성공으로 세지 않았다. trap은 실행되어 컨테이너와 임시 디렉터리를 정리했다.

추가로 같은 지점에서 `kill -INT`도 실행했다. `SIGNAL_EXIT=0`이었지만 clone은 중단되지 않고 끝까지 `INNER_EXIT=0`으로 완료됐으므로 “중단 cleanup” 증거로 세지 않는다. 완료 후 잔존은 0이었다.

#### 실행별 고유 이름·63-byte 경계

과거 결함인 실제 DB `sol3_collision` + `sol3_collision_expected` 한 호출을 다시 실행했다.

```text
[clone] PASS sol3_collision
[clone] PASS sol3_collision_expected
[clone] PASS all databases; isolated container and dump files will be removed
CASE=FIX3_expected_name_collision_regression EXIT=0
```

길이 63인 실제 DB 이름도 실행하고, 실행 중 잘린 expected 이름을 직접 관찰했다.

```text
LONG_DB=sol3_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx LENGTH=63
OBSERVED_EXPECTED=sol3_xxxxxxxxxxxxxxxxxxxxx__qa_expected_1786545111624115700-406
EXPECTED_LENGTH=63
PORT=127.0.0.1:53795
[clone] PASS sol3_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INNER_EXIT=0
POST_CONTAINER_COUNT=0
```

성공·실패·중단·긴 이름 실행에서 고유 이름이 계속 생성됐지만 종료 후 실행별 컨테이너가 제거되어 expected DB도 함께 사라졌고 `/tmp/qa-clone-utf8.*`는 0개였다.

#### port를 못 찾는 환경

Docker 자동 할당 port 고갈을 안전하게 만들 수 없어서 실행하지 못했다. 못 한 것으로 판정에서 제외한다. 고정 port 충돌 회귀는 A-5의 서로 다른 자동 port 4개로 확인했다.

## D. 실제 실행 환경

### 14. PowerShell 경유 A·B·C

위 A·B·C 전 실행은 PowerShell에서 명시적으로 Git Bash를 호출했다. 동시 쓰기·동시 복제·손상 타이밍은 PowerShell `Start-Job`과 `docker exec`로 걸었다.

```text
정상 기준선                 EXIT=0
동시 source 쓰기            EXIT=0
같은/다른 DB 동시 복제       INNER_EXIT=0,0 / 0,0
비교 전 손상                INNER_EXIT=1
첫 비교 뒤, final 전 swap    INNER_EXIT=1
final dump snapshot 뒤 swap  INNER_EXIT=0  <-- SOL-R3-1
dump 실패                   EXIT=1
SIGTERM 중단                INNER_EXIT=3840, 잔존 0
```

따라서 PowerShell 경유에서도 정상 허용과 기존 손상 차단은 성립하지만, final snapshot 뒤 손상 통과 경로도 그대로 도달한다.

## 최종 재검증의 시간

동일 PC 새 실행의 실측이다.

```text
partner_db                 9,372 ms
ASCII 100행                6,995 ms
정당한 ? 2행               7,197 ms
동시 쓰기 50,000행         7,504 ms
12테이블 / 120,000행       8,308 ms (별도 수명 관찰 실행 8,481 ms)
400,002행 late-swap 실행   약 15.3 s
```

120,000행 수명 관찰에서 첫 비교용 schema 파일 완성 `6,982 ms`, final dump 시작 관찰 `7,662 ms`, 종료 `8,481 ms`였다. 첫 비교 입력 완성 뒤 종료까지 약 `1,499 ms`, final dump 파일 생성 관찰 뒤 종료까지 약 `819 ms`가 추가로 보였다. fix2의 동일 fixture·동일 PC 시간 원문이 없으므로 “fix2 대비 정확히 몇 ms 증가”는 확정하지 못했다. 현재 120,000행 8.3~8.5초, 400,002행 약 15.3초는 실행 가능 범위였다.

## 증거 무결성 대조

- 직전 `2026-08-12-1191-reconvergence2-sol.md`의 네 결함 좌표와 현재 스크립트를 대조했다. live source 재조회 구문은 없어졌고, expected 이름에 run ID가 들어가며, Docker port는 `127.0.0.1::5432`, 첫 비교 뒤 final data/schema dump가 존재한다.
- fix3 보고서가 새 실행하지 못했던 동시 source 쓰기와 late swap을 이번 라운드에 실제 실행했다. 동시 쓰기는 source count `50,000→50,240`과 `WRITER_INSERTS=240`을 함께 확인했다.
- 모든 손상 판정은 target 식별자, 원래 행 존재 확인(`READY=True`), `UPDATE n`/`COMMENT`, `INJECT_EXIT=0`, clone `INNER_EXIT`를 함께 기록했다.
- SOL-R3-1은 단순 파일 존재가 아니라 final 파일 `80,935,996 bytes`, 실행 중 `pg_dump PID=508`, 주입 뒤 target 실제 값 `1:부산,2:서울`, 최종 `INNER_EXIT=0`을 함께 확인했다.
- PowerShell background job의 한글 stderr mojibake를 원문으로 재구성하지 않았다. 판정에는 DB명·주입 성공·exit를 사용하고, 고정 오류문은 현재 스크립트 literal과 별도로 대조했다.
- 성공 수명 port inspect 한 건은 template 오류가 났으므로 port 증거에서 제외했다. 다른 실측 port `51381`, `51382`, `51594`, `51595`, `64365`, `53795`를 사용했다.
- 대상 스크립트는 수정하지 않았다. 임시 env에는 격리 자격만 저장했고 보고서에는 비밀번호를 남기지 않았다.

## 못 한 것

- 공유 DB에 동시 쓰기는 걸지 않았다. 동일 PostgreSQL 16 격리 source에 실제 commit 240건을 겹쳤다.
- Docker 자동 host port 고갈은 다른 트랙의 port를 방해하지 않고 안전하게 만들 수 없어 실행하지 않았다.
- PowerShell 프로세스 강제 종료(`TerminateProcess`/kill -9)는 trap 자체가 실행될 수 없는 종료라 실행하지 않았다. Git Bash SIGTERM 중단은 실행했고 잔존 0을 확인했다.
- fix2 동일 fixture·동일 PC의 경과시간 원문이 없어 정확한 전후 증가량은 계산하지 못했다.

## 머지 판정

**머지 불가.** `SOL-R3-1` 때문에 최종 `pg_dump` snapshot이 시작된 뒤 target이 손상되면 깨진 복제본이 `EXIT=0`으로 통과한다. 정상 오차단은 이번 실행에서 0건이었다.

## 라운드 종료 점검

```text
DELETED_TRACKED COUNT=0
tools/.s24-build-only/build/deep/tracked-writer.mjs EXISTS=True BYTES=42
SCRIPT_DIFF scripts/qa/clone-db-utf8.sh LINES=0
bash -n scripts/qa/clone-db-utf8.sh EXIT=0
QA_CLONE_CONTAINERS=0
SOURCE_CONTAINERS=0
QA_TMP_DIRS=0
TEMP_ENV_FILES=0
RELATED_PROCESSES=0
git status --short: ?? docs/dev-reports/2026-08-12-1191-reconvergence3-sol.md
```

한 줄: `삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재(42 bytes); 대상 스크립트 diff 0줄; qa-clone 격리 컨테이너 0개; sol1191-reconv3-src 0개; 관련 dump/임시 디렉터리 0개; 임시 env 0개; 관련 검증 프로세스 0개.`
