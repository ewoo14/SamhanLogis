# #1191 fix4 — handoff 보증 범위와 SOL-R3-1 판정

작성: CODEX LUNA / 2026-08-12

## 결론

`SOL-R3-1`은 닫을 수 있는 구멍이었다. 원인은 최종 `pg_dump`가 MVCC snapshot을 잡은 뒤에도 target에 쓰기가 가능했던 것이다. 최종 검증 직전에 격리 target의 모든 사용자 테이블에 `SHARE ROW EXCLUSIVE` 잠금을 걸고, final data/schema dump와 비교가 끝날 때까지 유지하도록 `scripts/qa/clone-db-utf8.sh`를 수정했다.

이 잠금은 `pg_dump`/`SELECT`의 `ACCESS SHARE`는 허용하지만 `INSERT`/`UPDATE`/`DELETE`와 DDL은 막는다. source DB에는 잠금을 걸지 않으므로 source 동시 쓰기 허용 조건은 영향을 받지 않는다.

## 검증이 보증하는 범위

이 하네스가 보증하는 것은 다음이다.

> final 검증 잠금이 확보된 시점부터 final data/schema dump와 비교가 끝나는 시점까지, 격리 복제본의 데이터·스키마가 expected DB와 일치하며 target 쓰기/DDL로 그 결과를 바꿀 수 없다.

따라서 하네스의 handoff boundary는 final 비교 성공 직후, 검증 프로세스가 성공을 반환하는 시점으로 정의한다. 그 boundary 뒤 라이브 QA가 의도적으로 수행하는 쓰기, 또는 별도 운영자가 잠금을 해제한 뒤 수행하는 변경은 이 하네스가 보증하지 않는다. 검증 이후의 QA 쓰기를 손상으로 오인해 막지 않는 것이 이 경계의 목적이다.

반대로 boundary 전에 발생한 target 손상은 QA 쓰기가 아니며, final 검증 잠금 또는 비교 결과로 반드시 실패해야 한다.

## RED — 수정 전 SOL-R3-1 재현 원문

공유 DB에는 dump/read만 수행했고, 아래 UPDATE는 격리 clone container에만 수행했다. PowerShell에서 Git for Windows Bash를 호출했다.

```text
RED_TARGET=qa-clone-utf8-20260812234905-329
RED_FINAL_BYTES=10324287
RED_BEFORE=000139d8-cea3-4ffc-9698-2524fbba9a58|안전재고 부족 — 제품 미확인
UPDATE 1
RED_UPDATE_EXIT=0
RED_AFTER=000139d8-cea3-4ffc-9698-2524fbba9a58|SOL-R3-1-손상
INNER_EXIT=0
[clone] PASS notification_db
[clone] PASS all databases; isolated container and dump files will be removed
```

실제 target 값은 바뀌었는데 final dump가 이전 snapshot을 계속 출력해 `INNER_EXIT=0`으로 통과했다. 이것이 수정 전의 결함이다.

## GREEN — final snapshot 이후 쓰기 재현

수정 후 같은 경계에서 target UPDATE를 별도 PowerShell job으로 시작했다. UPDATE job은 final dump가 진행되는 동안 `Running` 상태였고, clone은 정상적으로 성공했다.

```text
GREEN_TARGET=qa-clone-utf8-20260812235055-330
GREEN_FINAL_BYTES_AT_INJECT=30918102
GREEN_WRITE_JOB_STATE=Running
GREEN_WRITE_JOB_OUTPUT_BEFORE=
INNER_EXIT=0
[clone] PASS notification_db
[clone] PASS all databases; isolated container and dump files will be removed
GREEN_WRITE_AFTER_EXIT=
```

이 결과는 손상을 통과시킨 것이 아니다. UPDATE가 final 검증 잠금에 대기했고, 검증 성공과 cleanup 이후 target container가 제거됐다. 즉 final 검증 구간의 write는 handoff 전에 반영될 수 없었다.

## 불변식 재확인 원문

### 2. 정상 복제를 막지 않음

```text
정상 단일 clone: [clone] PASS notification_db / INNER_EXIT=0

CONCURRENT_1=[clone] PASS notification_db
CONCURRENT_2=[clone] PASS partner_db
POST_CONTAINER_COUNT=0
```

PowerShell 동시 clone은 서로 다른 격리 container/target DB를 사용했다. 직전 reconvergence3 보고서의 PowerShell 격리 source 동시 쓰기 240건 `EXIT=0`, 같은 DB/다른 DB 동시 복제 전부 `EXIT=0`도 유지된다. 이번 fix는 source가 아니라 target final 검증 잠금만 추가하므로 source 동시 쓰기 경로를 변경하지 않는다. 공유 DB에 동시 쓰기를 새로 걸지는 않았다.

### 3. 손상 검출 유지

첫 비교용 schema가 준비되고 final dump가 아직 시작되지 않은 경계에서 격리 target 한 행을 바꿨다.

```text
CORRUPT_TARGET=qa-clone-utf8-20260812235220-1344
UPDATE 1
CORRUPT_UPDATE_EXIT=0
INNER_EXIT=1
UTF-8 검증 실패: db=notification_db 원본/복제본 스냅샷 불일치 (최종 재검증)
```

직전 reconvergence3에서 확인된 부분 손상, JSONB/배열/메타데이터 손상, 행 교환, 전부 손상, 일부 테이블 손상, dump 실패 `EXIT=1`도 대상 비교 로직을 변경하지 않았으므로 유지된다. 이번 실행의 dump 실패 원문은 다음과 같다.

```text
[clone] dumping sol1191_missing_luna from samhan-postgres:5432
pg_dump: ... database "sol1191_missing_luna" does not exist
DUMP_FAILURE_EXIT=1
POST_DUMPFAIL_CONTAINER_COUNT=0
```

### 4. 성공·실패·중단 잔존 0

이번 PowerShell 실행 원문:

```text
정상 동시 clone       POST_CONTAINER_COUNT=0
손상 clone            cleanup 후 qa-clone container 0
dump failure          POST_DUMPFAIL_CONTAINER_COUNT=0
```

직전 보고서에서 성공·실패·SIGTERM 중단 후 container, `_expected` DB, dump/temp directory 잔존 0을 확인했다. 새 detached lock session도 target container의 수명에 종속되며 `EXIT` trap의 `docker rm -f`로 함께 제거된다.

## 검증 명령

```text
bash -n scripts/qa/clone-db-utf8.sh EXIT=0
```

PowerShell에서 Git for Windows Bash를 경유해 위 정상/손상/동시/실패 케이스를 실행했다. 환경 파일은 임시 생성 후 삭제했고 자격 값은 보고서에 남기지 않았다.

## 라운드 종료 점검

```text
DELETED_TRACKED_COUNT=0
tools/.s24-build-only/build/deep/tracked-writer.mjs EXISTS=True BYTES=42
QA_CLONE_CONTAINERS=0
QA_TMP_DIRS=0
TEMP_QA_ENV_FILES=0
RELATED_QA_PROCESSES=0
```

한 줄: `삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재(42 bytes); 격리 qa-clone 컨테이너·_expected DB·dump/임시 디렉터리·임시 QA env·관련 프로세스 잔존 0.`

## 머지 가능 여부

**머지 가능 판정.** 근거는 다음 세 가지다.

1. 수정 전 SOL-R3-1이 `INNER_EXIT=0`으로 재현됐다.
2. final 검증 구간의 target write를 잠금으로 차단한 뒤 같은 타이밍에서 정상 clone이 `INNER_EXIT=0`으로 끝났다.
3. 정상 동시 clone은 통과했고, 비교 전 손상과 dump 실패는 계속 `EXIT=1`이며, PowerShell 실행 후 잔존도 0이다.

단, 이 판정은 final 검증 성공 시점까지의 보증이다. 그 이후 라이브 QA가 수행하는 의도된 쓰기는 하네스 책임 범위 밖이라는 위 정의를 함께 적용해야 한다.
