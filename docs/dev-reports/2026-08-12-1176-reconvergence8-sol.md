# #1176 재수렴 8회차 — CODEX SOL 적대검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete`
- 질문: **실 운영자가 이 절차를 밟는 경로에서 재현되는 결함이 있는가?**
- 공유 DB 쓰기: 0건. `samhan-postgres`에는 `pg_dump`와 SELECT만 실행했다.
- git 변경 계열 명령: 0건
- 스크립트 수정: 0건
- 검증 DB: `sol1176-r8-pg` 격리 PostgreSQL 16
- 복제: `pg_dump -Fc`를 `cmd.exe`의 host 파일 redirection으로 저장한 뒤 `docker cp` + `pg_restore`. PowerShell 파이프 미사용.

## 판정 — 도달 가능한 결함 0건

**없다. PM이 문서화된 순서대로 현재 공유 DB에서 pin을 1회 실행한 뒤 점검·필요 시 복구하는 경로를 차단할 재현 결함은 0건이다. PM은 공유 DB에서 pin 스크립트를 실행해도 된다.**

근거는 다음과 같다.

- 현재 공유 DB 복제 원본은 snapshot 없음, QA 삭제 표지 전표 `295`, 라인 `636`이었다.
- 무토큰·오건수·중간 실패는 모두 `exit 3`이며 snapshot 물리 테이블을 남기지 않았다.
- 최초 pin과 동시 pin은 transaction advisory lock으로 직렬화되어 정확히 931행만 기록했다.
- pin 뒤 정상 점검, 실제 복구 `295/636`, 즉시 재점검은 모두 `exit 0`이었다.
- fix7의 1↔1 표지 치환은 같은 표지 총수 `295/636`에서도 `exit 3`으로 거부했다.
- snapshot 부재 복구는 안내 문구와 함께 `exit 3`으로 fail-closed였다.
- 정상 삭제·rollback 수치와 대상 밖 전행 지문, 무토큰 복구 전후 대상 지문이 모두 일치했다.

## 복제 직후 한글·기준 상태

```text
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)

snapshot | slips
---------+------
         | 295

lines
-----
636
```

## A. pin 스크립트 자체

### 1. 멱등 — 두 번 실행 결과 동일, 두 번째 대상 테이블 쓰기 없음

최초 기록은 동시 실행 §6의 첫 프로세스가 수행했다. 그 뒤 순차 2회차에서 snapshot 행의 `entity_type/entity_id/xmin` 전체 지문을 비교했다.

```text
BEFORE=931:a2b84316679ca98255d4848d94c267cd
기록 예정: qa_residue_target_snapshot / qa-residue-softdelete-2026-08-12 / slip 295 / line 636
BEGIN
pg_advisory_xact_lock
이미 고정된 snapshot을 유지합니다: slip 295 / line 636 (쓰기 없음).
COMMIT
A1_SECOND_EXIT=0
AFTER=931:a2b84316679ca98255d4848d94c267cd
```

건수·ID·행 `xmin` 지문이 같으므로 두 번째 실행은 snapshot 대상 행을 쓰지 않았다.

### 2. 이미 snapshot이 있으면 덮어쓰지 않음

기존 snapshot에서 slip 1행을 시험 제거해 `294/636`으로 만든 뒤 실행했다.

```text
기존 snapshot 건수가 295/636과 달라 덮어쓰지 않고 중단합니다.
ROLLBACK
A2_EXISTING_BAD_EXIT=3
line=636
slip=294
```

누락 행을 격리 fixture에서 복원한 뒤 다른 key의 행을 추가해도 그 행을 보존했다.

```text
이미 고정된 snapshot을 유지합니다: slip 295 / line 636 (쓰기 없음).
COMMIT
A2_EXISTING_GOOD_EXIT=0
sol-r8-unrelated/slip/6647737c-94ad-4ad8-a361-12c3a05ea529
line=636
slip=295
```

### 3. 확인 토큰 없이는 쓰지 않음

```text
기록 예정: qa_residue_target_snapshot / qa-residue-softdelete-2026-08-12 / slip 295 / line 636
snapshot 고정 보류: --set=confirm=PIN_QA_RESIDUE_SNAPSHOT_2026-08-12 확인 토큰이 필요합니다.
A3_TOKENLESS_EXIT=3
snapshot=NULL
```

### 4. 기록 건수가 `295/636`과 다르면 rollback

격리본의 전표 표지 1건만 임시 변경해 source를 `294/636`으로 만들었다.

```text
CREATE TABLE
SELECT 294
SELECT 636
현재 QA 표지 건수가 295/636이 아니므로 snapshot을 기록하지 않습니다.
ROLLBACK
A4_COUNT_MISMATCH_EXIT=3
snapshot=NULL,slips=294
```

`CREATE TABLE`까지 실행됐지만 transaction rollback 뒤 물리 테이블은 없었다.

### 5. 중간 실패 — 반쪽 상태 없음

격리 DB에 `qa_residue_target_snapshot` DDL 완료 직후 예외를 내는 event trigger를 설치하고 원본 pin 스크립트를 수정 없이 실행했다.

```text
BEGIN
pg_advisory_xact_lock
ERROR: SOL_R8 injected failure after snapshot DDL
CONTEXT: PL/pgSQL function sol_r8_fail_snapshot_ddl() line 2 at RAISE
A5_MID_FAILURE_EXIT=3
snapshot=NULL
```

DDL 이후 실패도 동일 transaction에서 원자적으로 rollback되어 테이블이나 행이 남지 않았다. 시험 event trigger와 함수는 즉시 제거했다.

### 6. 동시에 두 번 실행

clean 상태에서 독립 `psql` 프로세스 둘을 실제 병렬 시작했다.

```text
=== A6 CONCURRENT RUN 1 ===
BEGIN
pg_advisory_xact_lock
CREATE TABLE
SELECT 295
SELECT 636
INSERT 0 931
snapshot 고정 완료: slip 295 / line 636.
COMMIT
EXIT=0

=== A6 CONCURRENT RUN 2 ===
BEGIN
pg_advisory_xact_lock
이미 고정된 snapshot을 유지합니다: slip 295 / line 636 (쓰기 없음).
COMMIT
EXIT=0
```

한 프로세스만 931행을 기록했고 다른 프로세스는 lock 뒤 기존 snapshot을 읽어 쓰지 않았다.

## B. pin 이후 동작

### 7. 점검·복구·즉시 재점검 `exit 0`, 실제 복구 `295/636`

삭제 상태 점검:

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
B7_VERIFY_DELETED_EXIT=0
```

partner만 복구한 mismatch에서 유효 토큰으로 slip 실제 복구:

```text
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 불일치 상태입니다.
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
COMMIT
복구 완료: slip_db를 복구 상태로 맞췄습니다.
B7_VALID_REPAIR_EXIT=0
```

즉시 재점검:

```text
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
B7_IMMEDIATE_REVERIFY_EXIT=0
```

### 8. fix7 표지 치환 시나리오 거부

snapshot 대상 전표·라인 각 1건을 복구 상태로 바꾸고, snapshot 밖 전표·라인 각 1건에 QA 표지를 붙였다. 물리 표지 총수는 계속 `295/636`이었다.

```text
marker_slips=295
marker_lines=636

partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1
slip_db: snapshot/physical lines= 636 / 636  deleted= 635  restored= 1  drift= 0  non-target= 1
결과: 불일치 상태입니다.
자동 복구 불가: 양쪽 DB가 완전 삭제/완전 복구 상태가 아닙니다.
B8_SWAP_REPAIR_EXIT=3
snapshot_slip_not_marked=1
outside_slip_marked=1
snapshot_line_not_marked=1
outside_line_marked=1
```

유효 복구 토큰까지 줬지만 UPDATE 전에 거부했다. fixture를 되돌린 직후 정상 삭제 control은 `B8_RESET_CONTROL_EXIT=0`이었다.

### 9. 불변식 4종 계속 검출

원본 `scripts/qa-residue/2026-08-12-fix6-red-repro.ps1`을 수정 없이 실행했다.

```text
RED-I1 non-target marker compensated by target loss: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1

RED-I2 deleted_at NULL: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  non-target= 0

RED-I4 stale snapshot compensated by marker count: exit=3
slip_db: snapshot/physical slips= 296 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0

RED-I3 hard-deleted target line repair exit=3, immediate recheck exit=3
slip_db: snapshot/physical lines= 636 / 635  deleted= 635  restored= 0  drift= 0  non-target= 0

B9_FIX6_HARNESS_PROCESS_EXIT=3
```

대상 밖 표지, `deleted_at=NULL`, snapshot/물리 수 불일치, hard-delete 뒤 복구·즉시 재점검 불일치를 모두 검출했다. harness의 I5는 I4가 추가한 stale snapshot 행을 유지하는 기존 순서 때문에 `exit 3`이며, clean 정상 control은 §7·§11에서 `exit 0`으로 별도 확인했다.

## C. fallback 제거 영향

### 10. snapshot 없는 복구 거부와 안내

snapshot 테이블을 격리 backup 이름으로 잠시 rename해 실제 이름이 없는 상태에서 유효 복구 토큰까지 주었다.

```text
BEFORE=slips=2777:25e4b756a1c1b6b39cfc09df21258598 lines=3988:18c94e2680a73cd4fe1d9c0d89b0383d
snapshot을 먼저 고정하십시오: 2026-08-12-pin-qa-residue-snapshot.sql
C10_MISSING_SNAPSHOT_REPAIR_EXIT=3
named_snapshot=NULL,backup_rows=931
AFTER=slips=2777:25e4b756a1c1b6b39cfc09df21258598 lines=3988:18c94e2680a73cd4fe1d9c0d89b0383d
```

안내 문구가 출력됐고 전행 ID+xmin 지문이 동일하여 UPDATE가 없었다.

### 11. 정상 경로를 막지 않음

정상 rollback:

```text
UPDATE 1000
partner_db rollback | 1000
UPDATE 636
UPDATE 295
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636
C11_ROLLBACK_EXIT=0
```

정상 삭제:

```text
UPDATE 1000
INSERT 0 0
UPDATE 636
UPDATE 295
C11_EXECUTE_EXIT=0
```

삭제 직후 점검은 §7과 같은 `1000/295/636`, `B7_VERIFY_AFTER_EXECUTE_EXIT=0`이었다.

대상 외 전행 `row_to_json(row)` 이중 MD5 지문:

```text
BEFORE
partner=7323:8cfbce71907cc309eca33704c003abb0
slips=2482:592d108a3878010ad1049dac69d44b40
lines=3352:541031c97b7814ec06132ee96d8d9a9c

AFTER
partner=7323:8cfbce71907cc309eca33704c003abb0
slips=2482:592d108a3878010ad1049dac69d44b40
lines=3352:541031c97b7814ec06132ee96d8d9a9c
```

무토큰 복구는 대상 행 ID+xmin 지문도 바꾸지 않았다.

```text
C11_TOKENLESS_BEFORE=slips=295:bff0678c192d3ede0d39710c6b6af18f lines=636:f18d002223dd8313bf469dc49c62dd48
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
C11_TOKENLESS_REPAIR_EXIT=3
C11_TOKENLESS_AFTER=slips=295:bff0678c192d3ede0d39710c6b6af18f lines=636:f18d002223dd8313bf469dc49c62dd48
```

## 증거 무결성 대조

`docs/dev-reports/2026-08-12-1176-fix9-pin-snapshot-luna.md`의 다음 주장을 독립 실행으로 재현했다.

- 복제 직후 한글 3건, snapshot 없음, 표지 `295/636`
- pin 무토큰 `exit 3`, 최초 `INSERT 0 931`, 2회차 `exit 0`
- 정상 점검·rollback·삭제·복구·즉시 재점검의 종료 코드와 `1000/295/636`
- snapshot 분기 복구의 실제 SELECT 순서 `SELECT 295` → `SELECT 636`
- 표지 치환 `294/635`, restored `1/1`, non-target `1/1`, 복구 `exit 3`
- I1/I2/I3/I4 `exit 3`과 I5의 stale fixture 순서 설명

인용 수치·종료 코드·출력 순서에서 불일치는 0건이다. fix9에서 실행 원문이 없었던 중간 실패와 동시 실행은 이 보고서 §5·§6에서 새로 실행 증거를 남겼다.

## PM 실행 판정

**실행 가능.** 현재 공유 DB에서 다음 순서를 지킨다.

1. pin 스크립트를 정확한 확인 토큰과 함께 1회 실행한다.
2. pin 결과 `slip 295 / line 636`, exit `0`을 확인한다.
3. verify를 조회 모드로 실행한다.
4. mismatch이고 문서화된 양쪽 완전 상태 조합일 때만 별도 승인 아래 복구 토큰을 사용한다.

이 판정은 현재 공유 DB의 snapshot 없음·표지 `295/636` 상태를 파일 복제한 시점에 한정한다. PM 실행 직전에 source 수치가 바뀌면 pin은 `exit 3`으로 거부해야 하며, 그 경우 실행 판정은 중단한다.

## 못 한 것

- 공유 DB에서 pin·복구·표지 변경은 금지 지시 때문에 실행하지 않았다. 따라서 공유 DB의 실제 pin 실행 결과 자체는 PM 실행 전까지 미확정이다.
- 그 밖의 요청 11개 항목은 모두 격리 복제본에서 실행했다.

## 라운드 종료 점검

```text
deleted_tracked_files=none
tools/.s24-build-only/build/deep/tracked-writer.mjs: exists=True
sol1176-r8-pg_container_count=0
.qa-temp-sol-recon8_exists=False
host_pg_dump_pg_restore_psql_processes=0
powershell_background_jobs=0
```

격리 컨테이너 `sol1176-r8-pg`, container 내부 dump, host dump 2개와 임시 디렉터리 `.qa-temp-sol-recon8`을 제거했다. 삭제된 추적 파일은 없고, 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재한다.
