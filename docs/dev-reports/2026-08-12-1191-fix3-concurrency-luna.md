# PR #1191 fix3 — clone-db-utf8 동시성·검증 창 수정

검증일: 2026-08-12  
담당: CODEX LUNA  
대상: `scripts/qa/clone-db-utf8.sh`  
제약: git 변경 계열 명령 금지, 공유 DB 쓰기 금지

## RED 원문

fix2 적대검증 보고서(`2026-08-12-1191-reconvergence2-sol.md`)의 실제 PowerShell → Git Bash 재현을 기준 RED로 남긴다.

### A-1. 원본 동시 쓰기 중 재조회 — `EXIT=1`

```text
POWERSHELL_COMMAND=$job=Start-Job { for($i=1;$i -le 240;$i++){ docker exec sol1191-reconv2-src psql ... -c "INSERT INTO live_data(name) VALUES ('실시간-$i')"; Start-Sleep -Milliseconds 35 } };
[clone] dumping sol2_live from host.docker.internal:55791
[clone] verifying UTF-8 content in sol2_live
WRITER_INSERTS=240
CASE=sol2_live_with_concurrent_writes EXIT=1
20240
UTF-8 검증 실패: db=sol2_live table=public.live_data column=name source_korean_rows=20029 target_korean_rows=20016
```

### A-2. `db` + `db_expected` 동시 요청 — `EXIT=1`

```text
createdb: error: database creation failed: ERROR: database "sol2_collision_expected" already exists
CASE=expected_name_collision EXIT=1
```

### A-3. 같은 target port 동시 복제 — `EXIT=125`

```text
RUN=1 INNER_EXIT=0
RUN=2 INNER_EXIT=125
Bind for 0.0.0.0:55836 failed: port is already allocated
SAME_PORT_POST_COUNT=0
```

### B-1. 첫 snapshot 비교 직후 행 맞바꿈 — `EXIT=0`

```text
LATE_FAULT_TARGET=qa-clone-utf8-20260812230747-600 PHASE=target_schema_snapshot_exists
UPDATE 2
[clone] PASS sol2_swap
INNER_EXIT=0
LATE_INJECTED=True PHASE=target_schema_snapshot_exists
```

## 원인 전수 조사

수정 전 live source 재조회는 다음 경로였다.

```text
information_schema.columns 조회 → 각 text 컬럼별 source psql count 조회 → target psql count 조회
```

`rg`로 수정 후 `scripts/qa/clone-db-utf8.sh`를 전수 확인한 결과, `samhan-postgres`의 `psql`, `information_schema`, `source_result`, `source_korean` 경로는 0건이다. live source에는 custom-format `pg_dump` 1회만 실행한다. 검증 정본은 계속 custom dump를 clone DB와 run-scoped expected DB에 각각 restore한 뒤 data/schema dump를 비교한다.

## 수정 내용

- target port를 고정 `QA_CLONE_TARGET_PORT`에서 `127.0.0.1::5432` Docker 자동 할당으로 변경했다.
- expected DB를 `${db}__qa_expected_${RUN_ID}`로 변경하고 PostgreSQL 63-byte identifier 제한도 처리했다.
- 첫 expected/target snapshot 비교 뒤 target data/schema를 다시 dump하여 최종 비교한다. late mutation은 `EXIT=1`이다.
- 최종 dump에도 `\\restrict`/`\\unrestrict` 정규화를 적용했다. 이 처리가 빠지면 PostgreSQL 16 dump별 보안 토큰이 달라져 정상 DB도 오차단된다.
- trap은 기존대로 컨테이너와 임시 디렉터리를 성공·실패 모두 제거한다.

## GREEN 원문 — PowerShell 정상 복제

명령은 PowerShell에서 Git Bash를 호출했다. 환경 파일과 자격은 기존 격리 QA 설정을 사용했고 공유 원본에는 dump/read만 수행했다.

```text
[clone] isolated container: qa-clone-utf8-20260812231700-868
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
CASE=partner_db_powerShell EXIT=0
```

## GREEN 원문 — PowerShell 동시 복제 2회

```text
RUN1:
[clone] isolated container: qa-clone-utf8-20260812231718-593
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
Exit : 0

RUN2:
[clone] isolated container: qa-clone-utf8-20260812231718-597
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
Exit : 0
```

두 실행의 컨테이너 이름과 Docker 자동 할당 port가 분리되었고, expected DB도 run ID가 달라 충돌하지 않는다.

## 불변식 4 재확인

기존 reconvergence2의 fixture 원문을 기준으로 custom dump 비교 결과를 유지한다.

```text
정상 partner_db 복제             EXIT=0  (이번 PowerShell 재실행)
ASCII 정상 DB                    EXIT=0  (기존 실측)
정당한 ?                         EXIT=0  (기존 실측)
원래 ? 있던 행 부분 손상          EXIT=1  (기존 실측)
JSONB 손상                       EXIT=1  (기존 실측)
행 사이 값 교환 (비교 전)         EXIT=1  (기존 실측)
전부/일부 테이블 손상             EXIT=1  (기존 실측)
dump 실패                        EXIT=1  (기존 실측)
_expected 성공·실패 정리          확인됨 (trap)
```

late swap은 첫 비교 뒤 최종 target dump와 expected dump를 다시 비교하므로, swap이 최종 dump 전에 들어오면 `cmp` 실패로 `EXIT=1`이 된다. 이 세션에서는 해당 적대 fixture source/주입 컨테이너가 없어 late swap GREEN 재실행은 못 했다. 못 한 것은 못 했다고 남긴다.

## 못 한 것

- 라이브 공유 DB에 동시 쓰기를 걸지 않았다. 공유 DB 쓰기 금지 때문이다. 동시 쓰기 RED는 전용 `sol1191-reconv2-src`에서 실제 삽입 240건으로 이미 기록되어 있다.
- 이 워크트리에 전용 adversarial source fixture와 자격 파일이 없어 동시 쓰기 GREEN 및 late swap GREEN의 새 실행은 못 했다.
- 기존에 통과한 ASCII/정당한 `?`/손상 fixture는 재실행하지 않고 reconvergence2 원문을 회귀 기준으로 사용했다.

## 종료 점검

```text
삭제된 추적 파일 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs 존재 확인
qa-clone 격리 컨테이너 0개
sol1191-reconv2-src 컨테이너 0개
관련 dump/임시 디렉터리 0개
관련 검증 프로세스 0개
```

`bash -n scripts/qa/clone-db-utf8.sh`도 `EXIT=0`으로 통과했다.
