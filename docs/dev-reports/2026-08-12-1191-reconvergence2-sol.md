# PR #1191 재수렴 2차 적대검증 — custom dump expected DB

검증일: 2026-08-12  
검증자: CODEX SOL  
대상: `scripts/qa/clone-db-utf8.sh`  
호출 환경: PowerShell → `C:\Program Files\Git\bin\bash.exe`  
제약 준수: 공유 `samhan-postgres`에는 `partner_db`의 `pg_dump`와 `SELECT`만 실행했다. 모든 쓰기·손상 주입·동시 쓰기는 전용 `sol1191-reconv2-src` PostgreSQL 컨테이너에서만 실행했다.

## 결론

**깨진 복제본이 통과하는 경로가 1개 있고, 멀쩡한 복제본이 차단되는 경로가 3개 있다. 도달 가능한 결함은 4건이다.**

1. **SOL-R2-1, 정상 오차단:** custom dump 비교 뒤 원본의 한글/물음표 행 수를 다시 조회한다. 복제 중 원본에 정상 한글 행 240건을 계속 넣자 dump 시점 clone `20016`행과 재조회 원본 `20029`행이 달라져 정상 clone이 `EXIT=1`로 차단됐다.
2. **SOL-R2-2, 손상 통과:** expected/target snapshot 생성 직후 실제 target 행 두 개를 맞바꾸면 이미 만들어진 snapshot 비교는 통과하고, 후속 한글/물음표 행 수도 같아서 깨진 clone이 `EXIT=0`으로 통과했다.
3. **SOL-R2-3, 정상 오차단:** 한 번의 다중 DB 호출에 `db`와 실제 정상 DB `db_expected`가 함께 있으면 첫 DB의 보조 DB가 둘째 이름을 선점해 `createdb`가 실패한다.
4. **SOL-R2-4, 정상 오차단:** 동시에 두 복제가 같은 기본/지정 target port를 쓰면 하나가 bind 충돌로 `EXIT=125`가 된다. 포트를 다르게 주면 두 실행 모두 `EXIT=0`이므로 `_expected` 이름 자체가 컨테이너 사이에서 서로 밟히지는 않았다.

손상을 expected/target 직접 비교 전에 넣은 B·C 손상 fixture는 모두 `EXIT=1`이었다. `_expected` DB는 성공과 실패 양쪽에서 격리 컨테이너가 제거되며 같이 정리됐다.

> 아래 `Start-Job` 실행에서 PowerShell 래퍼 자체는 출력 수집 후 `0`으로 끝날 수 있다. 판정 exit는 같은 원문에 기록한 `INNER_EXIT`이며, 직접 호출은 `CASE=... EXIT=...`이다.

## A. 멀쩡한 것이 차단되는가

### 1. 정상 `partner_db` 복제 — `EXIT=0`

공유 DB에는 읽기만 했다.

```text
POWERSHELL_COMMAND=<samhan-postgres에서 읽은 접속 변수를 프로세스 env로 전달>;
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/dev/Samhan-Public/.claude/worktrees/w1191 && bash scripts/qa/clone-db-utf8.sh partner_db'
[clone] isolated container: qa-clone-utf8-20260812225634-957
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
CASE=partner_db EXIT=0
```

### 2. 한글이 거의 없는 정상 DB — `EXIT=0`

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_ascii'
[clone] isolated container: qa-clone-utf8-20260812225540-1410
[clone] dumping sol2_ascii from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_ascii
[clone] PASS sol2_ascii
[clone] PASS all databases; isolated container and dump files will be removed
CASE=sol2_ascii EXIT=0
[clone] warning: source 한글 컬럼 없음: sol2_ascii
```

### 3. 정당한 `?`가 든 정상 데이터 — `EXIT=0`

소스 값은 `문의?확인합니다`였다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_question'
[clone] isolated container: qa-clone-utf8-20260812225547-789
[clone] dumping sol2_question from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_question
[clone] PASS sol2_question
[clone] PASS all databases; isolated container and dump files will be removed
CASE=sol2_question EXIT=0
```

### 4. 복제 중 원본 동시 쓰기 — 요구 `EXIT=0`, 관찰 `EXIT=1`

전용 source DB에 PowerShell `Start-Job`으로 35ms 간격 삽입을 걸고 동시에 clone을 실행했다.

```text
POWERSHELL_COMMAND=$job=Start-Job { for($i=1;$i -le 240;$i++){ docker exec sol1191-reconv2-src psql ... -c "INSERT INTO live_data(name) VALUES ('실시간-$i')"; Start-Sleep -Milliseconds 35 } };
& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_live'
[clone] isolated container: qa-clone-utf8-20260812225748-376
[clone] dumping sol2_live from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_live
WRITER_INSERTS=240
CASE=sol2_live_with_concurrent_writes EXIT=1
20240
UTF-8 검증 실패: db=sol2_live table=public.live_data column=name source_korean_rows=20029 target_korean_rows=20016 source_question_mark_rows=0 target_question_mark_rows=0
  target sample: 기준-1
기준-2
기준-3
```

custom dump로 만든 expected와 clone은 일치했지만, 뒤의 원본 재조회가 더 최신 행을 보아 정상 clone을 막았다. **SOL-R2-1 재현**이다.

### 5. 큰 DB·여러 테이블 정상 복제 — `EXIT=0`

12개 테이블, 합계 60,000행, 각 행에 text·JSONB·text 배열을 둔 fixture다.

```text
SOURCE_COUNTS=12 tables / 60000 rows
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_large'
[clone] isolated container: qa-clone-utf8-20260812225554-1089
[clone] dumping sol2_large from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_large
[clone] PASS sol2_large
[clone] PASS all databases; isolated container and dump files will be removed
CASE=sol2_large EXIT=0
```

## B. 깨진 것이 통과하는가

### 6. 원래 `?`가 있던 행의 부분 손상 — `EXIT=1`

```text
UPDATE z_target SET name='정상???' WHERE id=1;
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812230258-904
[clone] isolated container: qa-clone-utf8-20260812230258-904
[clone] dumping sol2_partial from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_partial
UTF-8 검증 실패: db=sol2_partial 원본/복제본 스냅샷 불일치
INNER_EXIT=1
INJECTED=True
```

### 7. JSONB·배열·메타데이터 안 손상 — `EXIT=1`

JSONB 한글을 U+FFFD로, 배열을 빈 문자열로, 테이블 한글 주석을 ASCII로 바꿨다.

```text
UPDATE nested SET payload=jsonb_build_object('outer',jsonb_build_object('name',U&'\\FFFD')), tags=ARRAY['','']; COMMENT ON TABLE nested IS 'BROKEN';
UPDATE 1
COMMENT
FAULT_TARGET=qa-clone-utf8-20260812230327-1152
[clone] dumping sol2_nested from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_nested
UTF-8 검증 실패: db=sol2_nested 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=nested_array_metadata INJECTED=True
```

### 8. 행 사이 한글 값 맞바꿈

직접 비교 전에 주입하면 `EXIT=1`이다.

```text
UPDATE z_target SET name=CASE id WHEN 1 THEN '부산' WHEN 2 THEN '서울' END;
UPDATE 2
FAULT_TARGET=qa-clone-utf8-20260812230344-915
[clone] verifying UTF-8 content in sol2_swap
UTF-8 검증 실패: db=sol2_swap 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=row_swap INJECTED=True
```

그러나 target snapshot 파일이 생성된 직후 같은 손상을 넣으면 깨진 clone이 통과한다.

```text
POLL=docker exec <target> sh -c "test -s /tmp/sol2_swap.target.schema.sql"
UPDATE 2
LATE_FAULT_TARGET=qa-clone-utf8-20260812230747-600 PHASE=target_schema_snapshot_exists
[clone] isolated container: qa-clone-utf8-20260812230747-600
[clone] dumping sol2_swap from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_swap
[clone] PASS sol2_swap
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
LATE_INJECTED=True PHASE=target_schema_snapshot_exists
```

이미 생성된 snapshot은 손상 전 상태이고, 후속 한글/물음표 행 수는 맞바꿈 전후가 같다. **SOL-R2-2 재현**이다.

### 9. 한 행·한 글자만 손상 — `EXIT=1`

```text
UPDATE z_target SET name='한나' WHERE id=1;
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812230353-866
[clone] verifying UTF-8 content in sol2_onechar
UTF-8 검증 실패: db=sol2_onechar 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=one_char INJECTED=True
```

### 10. `?` 아닌 대체문자와 빈 문자열 손상 — 각각 `EXIT=1`

```text
# U+FFFD
UPDATE z_target SET name=U&'\\FFFD' WHERE id=1;
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812230401-1630
UTF-8 검증 실패: db=sol2_replace 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=replacement_fffd INJECTED=True

# 빈 문자열
UPDATE z_target SET name='' WHERE id=1;
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812230409-481
UTF-8 검증 실패: db=sol2_replace 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=replacement_empty INJECTED=True
```

## C. 잃지 않았는가

### 11. 전부 손상·일부 테이블 손상·dump 실패

```text
# 전부 손상
UPDATE z_target SET name='?';
UPDATE 3
FAULT_TARGET=qa-clone-utf8-20260812230417-1903
UTF-8 검증 실패: db=sol2_allbad 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=all_corrupt INJECTED=True

# 일부 테이블만 손상
UPDATE bad SET name='?';
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812230425-557
UTF-8 검증 실패: db=sol2_partialtable 원본/복제본 스냅샷 불일치
INNER_EXIT=1
CASE=partial_table_corrupt INJECTED=True

# dump 실패
& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_missing_1191'
[clone] isolated container: qa-clone-utf8-20260812230451-1925
[clone] dumping sol2_missing_1191 from host.docker.internal:55791
pg_dump: error: ... FATAL: database "sol2_missing_1191" does not exist
CASE=dump_failure EXIT=1
```

세 경로 모두 요구대로 `EXIT=1`이다.

## D. 실제 PowerShell 호출 환경

### 12. PowerShell 경유 A·B·C

위 A·B·C 전 실행은 PowerShell에서 명시적 Git Bash를 호출했다.

```text
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/dev/Samhan-Public/.claude/worktrees/w1191 && <격리 env> bash scripts/qa/clone-db-utf8.sh <db>'
```

관찰 exit는 정상 기준선 `0`, 손상 직접 비교 전 주입 `1`, dump 실패 `1`, 라이브 동시 쓰기 정상 clone 오차단 `1`, 직접 비교 뒤 손상 통과 `0`으로 PowerShell 경유에서도 그대로 성립했다. `Start-Job`의 native stderr는 PowerShell 직렬화 과정에서 한글이 mojibake로 표시됐으므로, 위 실패 문구는 동일 직접 호출의 UTF-8 원문과 DB명·exit를 대조해 기록했다.

## `${db}_expected` DB 수명과 새 표면

### 성공 수명

```text
DB_LIFECYCLE= -> sol2_large -> sol2_large,sol2_large_expected ->
INNER_EXIT=0
SEEN_CONTAINER=True SEEN_EXPECTED=True
POST_EXIT_CONTAINER_COUNT=0
```

`_expected`는 실행 중 실제 생성되며, 성공 후 컨테이너 제거와 함께 사라졌다.

### 실패 수명

```text
INNER_EXIT=1
INJECTED=True SEEN_EXPECTED_BEFORE_FAILURE=True TARGET=qa-clone-utf8-20260812230554-807
POST_FAILURE_CONTAINER_COUNT=0
```

비교 실패 시에도 `_expected`가 만들어진 것을 관찰했고, trap이 컨테이너를 제거해 남지 않았다. dump 실패도 종료 뒤 qa-clone 컨테이너가 남지 않았다.

### 같은 이름이 이미 있는 경우 — `EXIT=1`

격리 컨테이너는 매 실행 새로 생기므로 외부의 기존 DB는 충돌하지 않는다. 그러나 한 호출에 정상 원본 DB `sol2_collision`과 정상 원본 DB `sol2_collision_expected`를 함께 요청하면 내부 충돌이 도달 가능하다.

```text
& 'C:\Program Files\Git\bin\bash.exe' -lc '<격리 env> bash scripts/qa/clone-db-utf8.sh sol2_collision sol2_collision_expected'
[clone] PASS sol2_collision
[clone] dumping sol2_collision_expected from host.docker.internal:55791
createdb: error: database creation failed: ERROR: database "sol2_collision_expected" already exists
CASE=expected_name_collision EXIT=1
```

둘째 정상 DB 복제가 막히므로 **SOL-R2-3**이다.

### 동시에 두 복제

서로 다른 target port에서는 컨테이너별 `_expected`가 격리되어 둘 다 통과했다.

```text
qa-clone-utf8-20260812230623-1725 ... PASS sol2_large
PORT=55834 INNER_EXIT=0
qa-clone-utf8-20260812230623-1729 ... PASS sol2_large
PORT=55835 INNER_EXIT=0
DISTINCT_PORT_POST_COUNT=0
```

같은 target port에서는 하나가 막혔다.

```text
qa-clone-utf8-20260812230659-1807 ... PASS sol2_large
RUN=1 INNER_EXIT=0
qa-clone-utf8-20260812230659-1812
RUN=2 INNER_EXIT=125
Bind for 0.0.0.0:55836 failed: port is already allocated
SAME_PORT_POST_COUNT=0
```

서로의 `_expected` DB를 밟은 것은 아니지만 기본값 `55432`를 동시에 쓰는 실제 호출은 같은 방식으로 정상 한 건이 차단된다. **SOL-R2-4**다.

## 증거 무결성 대조

- 선행 `2026-08-12-1191-fix2-revert-and-invariants-luna.md`의 최종 구현 설명과 현재 파일을 대조했다. custom dump를 실제 clone과 `${db}_expected`에 각각 restore하고 data/schema dump를 비교하는 구조가 일치했다.
- 선행 보고서가 주장한 정상 `partner_db`, ASCII 기준선, 정당한 `?`, 직접 비교 전 부분 손상·JSONB 손상·행 맞바꿈, dump 실패 결과는 이번에 모두 새 실행으로 재현됐다.
- 선행 보고서의 “현재 구현은 원본을 재조회하지 않는다”는 설명과 달리 현재 스크립트는 snapshot 비교 뒤 `information_schema.columns` 및 각 text 계열 컬럼의 source count를 원본에서 다시 조회한다. 동시 쓰기 실측 `20029` 대 `20016`이 그 경로가 판정에 영향을 줌을 입증했다.
- 손상 주입은 `UPDATE`/`COMMENT` 성공 원문과 `FAULT_TARGET`을 함께 기록했다. 직접 비교 뒤 통과 재현은 target schema snapshot 파일 존재를 먼저 관찰한 뒤 `UPDATE 2` 성공을 확인했다.
- 검증 중 대상 스크립트는 수정하지 않았다. fixture용 env 파일에는 격리 컨테이너 자격만 썼고 보고서에 비밀번호를 남기지 않았다.

## 못 한 것

- 라이브 공유 DB에 실제 동시 쓰기를 걸지는 않았다. 공유 DB 쓰기 금지 때문에 동일 PostgreSQL 16 격리 source의 20,000행 기준선에 240건 실제 동시 삽입으로 검증했다.
- 모든 유니코드 대체문자를 전수하지 않았다. 요구된 U+FFFD와 빈 문자열은 각각 실행했다.

## 라운드 종료 점검

최종 정리 뒤 결과를 한 줄로 기록한다.

`삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재(42 bytes); sol1191-reconv2-src fixture 컨테이너 0개; qa-clone 격리 컨테이너 0개; qa-clone dump 임시 디렉터리 0개; 관련 검증 프로세스 0개; fixture 임시 env 파일 0개.`
