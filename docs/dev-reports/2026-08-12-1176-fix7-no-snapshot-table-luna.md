# #1176 fix7 — snapshot 테이블 부재 상태의 점검·복구

- 일시: 2026-08-12
- 담당: CODEX LUNA
- 브랜치: `chore/qa-residue-softdelete`
- 공유 DB 쓰기: 0건
- 검증 DB: 격리 PostgreSQL `fix7-luna-pg`

## 원인

`2026-08-12-verify-and-repair.sql`이 `qa_residue_target_snapshot`을 점검과 slip 복구의 유일한 대상 집합으로 사용했다. 실제 공유 DB 덤프에서는 marker가 `295`건 남아 있었지만 snapshot 테이블은 없었고, 현재 SQL은 relation 오류로 `exit 3`을 반환했다.

## RED — 수정 전 원문

공유 DB를 `pg_dump -Fc` 파일로 덤프한 뒤 격리 컨테이너에 `pg_restore`했다. 복제 직후 한글 확인:

```text
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
```

복제본 상태:

```text
snapshot_table | slip_markers
---------------+-------------
(NULL)         | 295
```

수정 전 점검 원문:

```text
RED-A-NO-SNAPSHOT_EXIT=3
You are now connected to database "partner_db" as user "samhan".
BEGIN
COMMIT
You are now connected to database "slip_db" as user "samhan".
BEGIN
psql:/tmp/current-verify.sql:58: ERROR:  relation "qa_residue_target_snapshot" does not exist
```

## 수정

snapshot 존재 여부를 `to_regclass`로 확인하고, 없을 때는 다음 fallback을 사용한다.

- 삭제 상태: QA marker slip과 marker line으로 대상 재구성
- 복구 상태: 원래 QA line 후보 조건으로 대상 재구성
- snapshot 존재 상태: 기존 snapshot 기반 대상·물리 행 비교 유지
- 복구 시 대상 ID를 임시 테이블에 고정한 뒤 UPDATE와 사후 guard 수행
- marker 외 slip/line, `deleted_at IS NULL`, 물리 행 수 drift는 계속 불일치로 중단

## GREEN A — snapshot 테이블 없는 상태

격리본에서 snapshot 테이블이 없는 상태로 점검:

```text
GREEN-A-NO-SNAPSHOT_VERIFY_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

토큰 없는 복구:

```text
A_TOKENLESS_MISMATCH_EXIT=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
ERROR: division by zero
```

확인 결과 partner marker는 그대로 `0`이었고 UPDATE는 실행되지 않았다. 유효 토큰 복구와 즉시 재점검:

```text
A_VALID_REPAIR_MISMATCH_EXIT=0
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

A_POST_REPAIR_VERIFY_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

## GREEN B — snapshot 테이블 있는 상태

격리본에서 정상 삭제 후 snapshot 존재를 확인:

```text
B_SNAPSHOT_VERIFY_DELETED_EXIT=0
qa_residue_target_snapshot|931
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

유효 토큰 복구와 즉시 재점검:

```text
B_VALID_REPAIR_MISMATCH_EXIT=0
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

B_POST_REPAIR_VERIFY_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

## 기존 적대 불변식 재검증

기존 fix6 harness를 격리본에서 실행했다. I5는 I4가 의도적으로 stale snapshot 행을 추가한 뒤 snapshot을 정리하지 않고 정상 control을 실행하는 기존 harness 순서이므로 `exit 3`이 되었다. 이는 stale snapshot 불변식이 검출된 결과이며, 깨끗한 snapshot 상태의 B 정상 경로는 위에서 `exit 0`으로 별도 확인했다.

```text
RED-I1 non-target marker compensated by target loss: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1

RED-I2 deleted_at NULL: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  non-target= 0

RED-I4 stale snapshot compensated by marker count: exit=3
slip_db: snapshot/physical slips= 296 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0

RED-I3 hard-deleted target line repair exit=3, immediate recheck exit=3
slip_db: snapshot/physical lines= 636 / 635  deleted= 635  restored= 0  drift= 0  non-target=0
```

## 마무리 점검

```text
git diff --check  # 통과
tools/.s24-build-only/build/deep/tracked-writer.mjs exists=True
```

격리 컨테이너 `fix7-luna-pg`, dump 파일, `.qa-temp-fix7-1176`은 라운드 종료 시 정리했다. 공유 `samhan-postgres`에는 SELECT와 dump 읽기만 수행했다.
