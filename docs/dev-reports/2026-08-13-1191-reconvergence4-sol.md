# PR #1191 재수렴 4차 적대검증 — fix4 최종 잠금

검증일: 2026-08-13  
검증자: CODEX SOL  
대상: `scripts/qa/clone-db-utf8.sh`  
호출 환경: PowerShell → `C:\Program Files\Git\bin\bash.exe`  
브랜치: `chore/qa-clone-utf8-harness`

## 결론

**질문의 답은 예다. 정상 복제는 통과했고, 실제 값·JSONB·배열·대체문자·빈 문자열·전체/일부 손상은 차단됐다. 머지 가능으로 판정한다.**

- 정상 `partner_db`, 실제 UTF-8 한글과 정당한 `?`, ASCII 위주 DB, 원본 동시 쓰기 240 commit, 같은/다른 DB 동시 복제, 12테이블/120,000행이 모두 `EXIT=0`이었다.
- 원래 `?`가 있던 행의 추가 손실, JSONB/배열, 한 글자, U+FFFD, 빈 문자열, final handoff 구간의 commit, 전체/일부 테이블 손상, dump 실패가 모두 `EXIT=1`이었다.
- 새 `SHARE ROW EXCLUSIVE` 잠금은 원본에는 한 번도 나타나지 않았다(`0 ms`, 최대 0개). 원본에는 기존 `pg_dump`의 쓰기를 막지 않는 `ACCESS SHARE`만 1,791.184 ms 관찰됐다. 격리 target의 새 잠금은 큰 fixture에서 1,975 ms 관찰됐다.
- 90초 충돌 트랜잭션을 걸었을 때 29,402 ms 뒤 `EXIT=1`로 종료하고 target 컨테이너를 제거했다. 무한 대기는 재현되지 않았다. 단, 제한은 wall-clock/SQL `lock_timeout`이 아니라 60회 polling이므로 실행 환경에 따라 초 단위는 달라진다.
- 성공·비교 실패·dump 실패·SIGTERM·잠금 충돌 뒤 스크립트가 만든 `qa-clone` 컨테이너와 `/tmp/qa-clone-utf8.*` 잔존은 0이었다. 별도 fixture source 컨테이너 1개는 라운드 종료 제거 중 Docker Desktop exit-event 오류로 남았다.

공유 `partner_db`에는 dump/read만 수행했다. 쓰기 부하, fixture 구성, 손상 주입은 전용 `sol1191-reconv4-src` 및 실행별 `qa-clone-utf8-*`에서만 수행했다. 대상 스크립트는 수정하지 않았다. 아래에는 유효한 최종/재시도 실행만 적었고, 검증 하네스 자체의 잘못된 계측 시도는 판정에서 제외했다.

## 공통 실행 형태

```powershell
$bash='C:\Program Files\Git\bin\bash.exe'
$repo='/c/dev/Samhan-Public/.claude/worktrees/w1191'
& $bash -lc "cd $repo && QA_CLONE_ENV_FILE=.sol1191-reconv4-isolated.env bash scripts/qa/clone-db-utf8.sh <db>"
```

격리 source는 `postgres:16-alpine`, 자동 할당 host port `49293`이었다. 비밀번호는 출력·보고하지 않았다. 실제 한글 fixture는 PowerShell 콘솔 인코딩 개입을 피하려고 UTF-8 hex를 `convert_from(decode(hex,'hex'),'UTF8')`로 주입했고, source에서 `encode(convert_to(value,'UTF8'),'hex')`로 바이트를 확인했다.

## A. 정상 복제가 통과하는가

### 1. 정상 `partner_db` — `EXIT=0`

공유 DB에는 읽기만 했다.

```text
POWERSHELL_COMMAND=& $bash -lc "... QA_CLONE_ENV_FILE=.sol1191-reconv4-shared.env ... partner_db"
[clone] isolated container: qa-clone-utf8-20260813002204-1500
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A1_partner_db EXIT=0 ELAPSED_MS=10694
```

### 2. 한글이 거의 없는 DB — `EXIT=0`

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol4_ascii"
[clone] dumping sol4_ascii from host.docker.internal:49293
[clone] verifying UTF-8 content in sol4_ascii
[clone] PASS sol4_ascii
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A2_ascii EXIT=0 ELAPSED_MS=7969
```

### 3. 원래부터 정당한 `?`가 있는 실제 UTF-8 한글 — `EXIT=0`

source 값은 `문의?확인합니다`, `정상 한글`이었다. UTF-8 hex는 각각 `ebacb8ec9d983fed9995ec9db8ed95a9eb8b88eb8ba4`, `eca095ec838120ed959ceab880`이었다.

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol4_question"
[clone] isolated container: qa-clone-utf8-20260813003157-1109
[clone] dumping sol4_question from host.docker.internal:49293
[clone] verifying UTF-8 content in sol4_question
[clone] PASS sol4_question
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A3 EXIT=0
```

### 4. 원본에 다른 세션의 실제 쓰기 240 commit — `EXIT=0`

PowerShell `Start-Job`에서 15 ms 간격으로 독립 `INSERT` 240회를 실행하고 복제를 겹쳤다.

```text
POWERSHELL_COMMAND=$writer=Start-Job { 1..240 | % { docker exec sol1191-reconv4-src psql ... -c "INSERT ..."; Start-Sleep -Milliseconds 15 } }; <clone sol4_live>
===== CASE=A4_concurrent_source_writes BEFORE=50345 =====
[clone] isolated container: qa-clone-utf8-20260813002255-1219
[clone] PASS sol4_live
[clone] PASS all databases; isolated container and dump files will be removed
WRITER_STATE=Completed WRITER_INSERTS=240
CASE=A4_concurrent_source_writes EXIT=0 ELAPSED_MS=8089 BEFORE=50345 AFTER=50585 DELTA=240
```

복제 중 source의 실제 commit이 계속 발생했지만 정상 snapshot을 오차단하지 않았다.

### 5. 동시 복제 — 모두 `EXIT=0`, 간섭 0

같은 DB 두 개와 다른 DB 두 개를 각각 PowerShell `Start-Job`으로 동시에 실행했다.

```text
POWERSHELL_COMMAND=$j1=Start-CloneJob sol4_large SAME1; $j2=Start-CloneJob sol4_large SAME2; Wait-Job $j1,$j2
[SAME1] [clone] isolated container: qa-clone-utf8-20260813002358-1045
[SAME1] [clone] PASS sol4_large
[SAME1] INNER_EXIT=0
[SAME2] [clone] isolated container: qa-clone-utf8-20260813002358-1050
[SAME2] [clone] PASS sol4_large
[SAME2] INNER_EXIT=0

POWERSHELL_COMMAND=$j3=Start-CloneJob sol4_ascii DIFF1; $j4=Start-CloneJob sol4_question DIFF2; Wait-Job $j3,$j4
[DIFF1] [clone] PASS sol4_ascii
[DIFF1] INNER_EXIT=0
[DIFF2] [clone] PASS sol4_question
[DIFF2] INNER_EXIT=0
CASE=A5 POST_CONTAINER_COUNT=0
```

### 6. 여러 테이블의 큰 DB — `EXIT=0`

12테이블, 합계 120,000행 fixture다.

```text
POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol4_large"
[clone] isolated container: qa-clone-utf8-20260813002231-906
[clone] PASS sol4_large
[clone] PASS all databases; isolated container and dump files will be removed
CASE=A6_large EXIT=0 ELAPSED_MS=9282
```

## B. 새 잠금의 부작용

### 7. 원본·target 잠금 유지 시간 실측

원본에서는 2 ms 간격 PL/pgSQL watcher로 다른 backend의 relation lock을 계측했다. target은 PowerShell에서 실행 중 컨테이너의 `pg_locks`를 반복 조회했다.

```text
POWERSHELL_COMMAND=<20초 source pg_locks watcher Start-Job>; <clone sol4_lateswap>
[clone] PASS sol4_lateswap
CLONE_EXIT=0
NOTICE: SOURCE_ACCESS_FIRST_MS=1786548413856.869 LAST_MS=1786548415648.053 SPAN_MS=1791.18408203125 MAX=135
NOTICE: SOURCE_SRE_FIRST_MS=<NULL> LAST_MS=<NULL> SPAN_MS=0 MAX=0

POWERSHELL_COMMAND=<clone sol4_lateswap Start-Job>; <target pg_locks polling>
TARGET_SHARE_ROW_EXCLUSIVE_FIRST_MS=15665 LAST_MS=17640 OBSERVED_SPAN_MS=1975 MAX_LOCKS=1
INNER_EXIT=0
```

판정: 새 blocking lock이 원본을 잡은 시간은 **0 ms**다. 원본의 기존 `pg_dump ACCESS SHARE`는 **1,791.184 ms**였고 INSERT/UPDATE/DELETE를 막지 않는다. 새 lock은 격리 target에서 관찰 기준 **1,975 ms** 유지됐다. polling 사이의 미관찰 간격이 있으므로 target 수치는 최소 관찰 시간이다.

### 8. 잠금 획득 지연 — 무한 대기 아님, 29,402 ms 뒤 `EXIT=1`

첫 비교 직후 target에 외부 세션으로 90초 `ROW EXCLUSIVE` 충돌 트랜잭션을 걸었다. 90초가 끝나기 전에 복제 스크립트가 실패하고 target을 제거해 외부 연결도 끊겼다.

```text
POWERSHELL_COMMAND=<clone sol4_seqhole Start-Job>; <external blocker: BEGIN; UPDATE; pg_sleep(90); COMMIT>
===== CASE=B8_timeout_90s_blocker =====
TARGET=qa-clone-utf8-20260813003928-858 FIRST_COMPARE_READY=True T_MS=35230
BLOCKER_HELD=True T_HELD_MS=35762
[clone] verifying UTF-8 content in sol4_seqhole
INNER_EXIT=1
BLOCKER_EXIT=2
LOCK_WAIT_UNTIL_EXIT_MS=29402 TOTAL_MS=65168 POST_CONTAINER_COUNT=0
UTF-8 검증 실패: db=sol4_seqhole 최종 검증 잠금 확보 실패
server closed the connection unexpectedly
```

스크립트에는 PostgreSQL `lock_timeout`이나 wall-clock deadline은 없고 60회 polling이 있다. 이 PC의 Docker 왕복을 포함한 실측 대기는 29.402초였다. 따라서 DB/Docker가 응답하는 이 조건에서 무한 대기는 아니지만, 고정 6초 제한으로 해석하면 안 된다.

### 9. 잠금 보유 중 SIGTERM — 잠금·컨테이너 해제

1,000,000행 fixture에서 `ShareRowExclusiveLock` 1개를 실제 관찰한 뒤 컨테이너 이름의 Bash PID에 Git Bash `kill -TERM`을 보냈다.

```text
POWERSHELL_COMMAND=<clone sol4_interrupt Start-Job>; <poll ShareRowExclusiveLock>; & $bash -lc "kill -TERM 1884"
===== CASE=B9_SIGTERM_during_final_lock_RETRY =====
TARGET=qa-clone-utf8-20260813003525-1884 T_FOUND_MS=1556
LOCK_HELD=True COUNT=1 T_MS=17348
SIGNAL_EXIT=0 BASH_PID=1884
[clone] verifying UTF-8 content in sol4_interrupt
INNER_EXIT=3840
POST_CONTAINER_COUNT=0 TOTAL_MS=18404
```

MSYS가 SIGTERM 종료를 `3840`으로 전달했으며 성공은 아니다. `EXIT` trap이 컨테이너를 제거했으므로 그 안의 lock backend와 잠금도 함께 사라졌다.

## C. 인코딩 손실 검출

모든 손상은 source가 아니라 restore가 끝난 실행별 target에만 주입했다. `READY=True`, SQL의 `UPDATE n`, `INJECT_EXIT=0`, clone의 `INNER_EXIT`를 각각 확인했다.

### 10. 원래 `?`가 있던 행의 추가 손실 — `EXIT=1`

실제 UTF-8 `문의?확인합니다`를 target에서 `문의???`로 바꿨다.

```text
POWERSHELL_COMMAND=<clone sol4_partial Start-Job>; docker exec <target> psql ... "UPDATE z_target SET name=<UTF8 문의???> WHERE id=1"
===== CASE=C10_legit_question_plus_loss =====
FAULT_TARGET=qa-clone-utf8-20260813003235-338 READY=True
UPDATE 1
INJECT_EXIT=0
[clone] verifying UTF-8 content in sol4_partial
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

### 11. JSONB·배열 중첩 한글 손실 — `EXIT=1`

source는 JSONB city=`서울`, memo=`문의?`, 배열=`[서울, 부산]`이었다. target의 JSONB city를 U+FFFD로, 배열을 빈 문자열 둘로 바꿨다.

```text
POWERSHELL_COMMAND=<clone sol4_nested Start-Job>; docker exec <target> psql ... "UPDATE z_target SET payload=jsonb_set(...U+FFFD...), tags=ARRAY['','']"
===== CASE=C11_nested_jsonb_array =====
FAULT_TARGET=qa-clone-utf8-20260813003243-227 READY=True
UPDATE 1
INJECT_EXIT=0
[clone] verifying UTF-8 content in sol4_nested
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

### 12. 한 행·한 글자, U+FFFD, 빈 문자열 — 모두 `EXIT=1`

```text
CASE=C12_one_row_one_char
FAULT_TARGET=qa-clone-utf8-20260813003250-1613 READY=True
UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=C12_replacement_fffd
FAULT_TARGET=qa-clone-utf8-20260813003256-1896 READY=True
UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=C12_replacement_empty
FAULT_TARGET=qa-clone-utf8-20260813003303-1537 READY=True
UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0
```

각 SQL은 target 한 행만 `한글→한나`, `한글→U+FFFD`, `한글→''`로 변경했다.

### 13. 첫 비교 이후 final handoff 구간의 commit — `EXIT=1`

첫 data/schema 비교가 완성되고 final 파일이 아직 없음을 확인했다. 별도 target transaction이 row lock을 먼저 잡고 1초 뒤 값을 `BROKEN-AFTER-HANDOFF`로 바꿔 commit했다. commit은 성공했지만 final 재검증이 이를 잡았다.

```text
POWERSHELL_COMMAND=<clone sol4_lateswap Start-Job>; <poll first compare ready>; <target transaction UPDATE/sleep/UPDATE/COMMIT>
===== CASE=C13_final_handoff_mutation =====
TARGET=qa-clone-utf8-20260813003334-585 FIRST_COMPARE_READY=True T_MS=11197
BEGIN
UPDATE 1
pg_sleep
UPDATE 1
COMMIT
WRITER_EXIT=0
MUTATION_COMMITTED_T_MS=12972
[clone] verifying UTF-8 content in sol4_lateswap
INNER_EXIT=1
CASE=C13 EXIT_EXPECTED_NONZERO TOTAL_MS=19573 POST_CONTAINER_COUNT=0
UTF-8 검증 실패: db=sol4_lateswap 원본/복제본 스냅샷 불일치 (최종 재검증)
```

fix3에서 `EXIT=0`이었던 창이 이번에는 `EXIT=1`이었다.

### 14. 전체 손실·일부 테이블 손실·dump 실패 — 모두 `EXIT=1`

```text
CASE=C14_all_corrupt
FAULT_TARGET=qa-clone-utf8-20260813003411-1372 READY=True
UPDATE 3
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

CASE=C14_partial_table_corrupt
FAULT_TARGET=qa-clone-utf8-20260813003420-1807 READY=True
UPDATE 1
INJECT_EXIT=0
INNER_EXIT=1
POST_CONTAINER_COUNT=0

POWERSHELL_COMMAND=& $bash -lc "... clone-db-utf8.sh sol4_missing_1191"
[clone] isolated container: qa-clone-utf8-20260813003428-209
[clone] dumping sol4_missing_1191 from host.docker.internal:49293
pg_dump: ... database "sol4_missing_1191" does not exist
CASE=C14_dump_failure EXIT=1 POST_CONTAINER_COUNT=0
```

## D. 뒷정리와 PowerShell 실행 환경

### 15. 성공·실패·강제 종료 cleanup

각 케이스 직후 원문에 기록한 `POST_CONTAINER_COUNT=0`을 확인했다. 성공(A5), 비교 실패(C10~C14), dump 실패(C14), SIGTERM(B9), 90초 잠금 충돌(B8) 모두 동일했다. 실행 종료 후 Git Bash `/tmp/qa-clone-utf8.*`도 0개였고, expected DB는 실행별 target 컨테이너 내부에만 존재하므로 컨테이너 제거와 함께 사라졌다.

```text
SUCCESS_POST_CONTAINER_COUNT=0
COMPARE_FAILURE_POST_CONTAINER_COUNT=0
DUMP_FAILURE_POST_CONTAINER_COUNT=0
SIGTERM_POST_CONTAINER_COUNT=0
LOCK_TIMEOUT_POST_CONTAINER_COUNT=0
QA_TMP_DIR_COUNT=0
```

임시 env는 보고서 작성 뒤 제거했다. fixture source는 제거를 시도했으나 아래 라운드 종료 점검의 Docker 오류로 1개가 남았다.

### 16. PowerShell 경유 A·B·C

위 모든 clone은 PowerShell에서 Git Bash를 명시 호출했다. 동시 writer/clone, 동시 clone, lock watcher/blocker, target 손상 주입, SIGTERM도 PowerShell `Start-Job`과 `docker exec`에서 수행했다.

```text
PowerShell -> Git Bash -> clone 정상: A1/A2/A3/A4/A5/A6 EXIT=0
PowerShell -> lock 계측/충돌/중단: B7 EXIT=0, B8 EXIT=1, B9 INNER_EXIT=3840
PowerShell -> target 손상: C10/C11/C12/C13/C14 EXIT=1
```

따라서 프로젝트의 실제 호출 경로에서도 A·B·C 판정은 동일하다.

## 발견한 문제와 제한

**대상 스크립트의 기능상 차단 결함 0건.** 정상 복제 오차단 0건, 손상 통과 0건이었다.

운영 관찰 1건은 merge blocking으로 보지 않는다. 잠금 대기 제한은 wall-clock/SQL timeout이 아니라 60회 polling이어서 이 PC에서는 90초 blocker를 29.402초 뒤 차단했다. 고정 초 SLA는 아니지만 잠금은 격리 target에만 걸리고 원본 blocking lock은 0 ms였으며, 충돌 시 fail closed와 cleanup이 성립했다.

16개 동작 검증은 모두 수행했다. 공유 DB 쓰기는 하지 않았고, 모든 쓰기 부하·손상·잠금 충돌은 격리 fixture에서 실행했다. 다만 라운드 종료 시 fixture source 컨테이너 1개의 물리적 제거는 Docker Desktop 오류로 못 했다. 이는 대상 스크립트가 만든 clone 컨테이너가 아니며, 공유 서비스 전체를 재시작해야 할 수 있어 중단했다.

## 머지 판정

**머지 가능.** 근거는 (1) 가장 중요한 정상 경로 6종이 전부 `EXIT=0`, (2) 실제 UTF-8 한글 손실과 구조화 데이터/최종 handoff 손상 9종이 전부 `EXIT=1`, (3) 새 blocking lock의 원본 유지 시간 0 ms, (4) 잠금 충돌과 SIGTERM이 유한 종료하며 잔존 0, (5) 전 케이스가 실제 PowerShell 호출 경로에서 재현됐기 때문이다.

## 라운드 종료 점검

```text
DELETED_TRACKED_COUNT=0
tools/.s24-build-only/build/deep/tracked-writer.mjs EXISTS=True BYTES=42
SCRIPT_DIFF_NUMSTAT=<empty>
bash -n scripts/qa/clone-db-utf8.sh EXIT=0
QA_CLONE_CONTAINERS=0
QA_TMP_DIRS=0
TEMP_ENV_FILES=0
RELATED_JOBS=0
RELATED_PROCESSES=0
```

한 줄: `삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재(42 bytes); 대상 스크립트 diff 0줄; qa-clone 컨테이너 0개; dump/임시 디렉터리 0개; 임시 env 0개; 관련 job/process 0개.`

단, fixture source `sol1191-reconv4-src` 컨테이너 1개는 `docker rm -f` 두 번과 `docker kill --signal KILL` 한 번을 시도했으나 Docker Desktop이 `could not kill container: tried to kill container, but did not receive an exit event`를 반환해 제거하지 못했다. 컨테이너 안 PostgreSQL은 종료됐고 `docker top`에는 Docker 종료 과정의 `sync`만 남았지만, 공유 서비스가 다수 실행 중이어서 Docker Desktop 전체 재시작은 권한 범위를 넘어 수행하지 않았다. 따라서 15번의 실행별 임시 clone/DB/directory cleanup은 모두 통과했지만, 라운드 fixture source 컨테이너 cleanup 1건은 **못 했다**.
