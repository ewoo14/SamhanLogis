# #1176 fix9 — snapshot 정본 고정

- 일시: 2026-08-12
- 담당: CODEX LUNA
- 브랜치: \`chore/qa-residue-softdelete\`
- 공유 DB 쓰기: 0건
- 검증 DB: 격리 PostgreSQL \`fix9-luna-pg\`

## 결론

현재 표지 집합을 \`slip_db.qa_residue_target_snapshot\`에 고정하는 1회용 pin SQL을 추가했다. snapshot이 없으면 verify/repair가 더 이상 marker·candidate를 추정하지 않고 \`snapshot을 먼저 고정하십시오\`와 함께 거부한다.

## RED — 구현 전

### RED-1/3: snapshot 없는 fallback 치환

fix8/fix7에서 확인된 원문이다. 원래 대상 1건을 표지에서 빼고 대상 외 1건을 같은 표지로 바꾸어 표지 총수는 295/636을 유지했다. 기존 fallback은 점검·복구·재점검을 모두 \`exit 0\`으로 끝냈지만 원래 대상은 294/635만 복구했다.

\`\`\`text
RED-A-SWAP_VERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0

RED-A-SWAP_REPAIR_EXIT=0
SELECT 636
SELECT 295
UPDATE 636
UPDATE 295

RED-A-SWAP_IMMEDIATE_REVERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
original target restored: 294 / 295
original line target restored: 635 / 636
outside rows restored: 1 / 1
\`\`\`

### RED-4: snapshot 없음 허용

\`\`\`text
RED-A-NO-SNAPSHOT_VERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
\`\`\`

### RED-2/5 기존 적대 불변식

기존 fix6 harness의 RED 원문은 다음과 같았다.

\`\`\`text
RED-I1 non-target marker compensated by target loss: exit=3
RED-I2 deleted_at NULL: exit=3
RED-I3 hard-deleted target line repair exit=3, immediate recheck exit=3
RED-I4 stale snapshot compensated by marker count: exit=3
\`\`\`

## 구현

추가 파일: \`scripts/qa-residue/2026-08-12-pin-qa-residue-snapshot.sql\`

- 실행 예정 대상과 295/636을 먼저 출력한다.
- \`PIN_QA_RESIDUE_SNAPSHOT_2026-08-12\` 토큰이 없으면 CREATE/INSERT 없이 \`exit 3\`이다.
- snapshot이 이미 있으면 건수만 검증하고 덮어쓰지 않는다.
- 최초 기록은 advisory lock과 트랜잭션 안에서 수행하며, source/after 건수가 다르면 rollback한다.
- \`2026-08-12-verify-and-repair.sql\`의 snapshot 부재 fallback 두 경로를 제거했다.

## 격리 복제 및 한글 무결성

공유 DB는 \`pg_dump\` 파일 생성과 SELECT만 수행했다. custom-format dump는 파일 경유로 복사했으며, PowerShell pipe는 사용하지 않았다.

\`\`\`text
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)

snapshot | slips
----------+-------
         |   295
lines
------
  636
\`\`\`

## GREEN — snapshot 고정·멱등

\`\`\`text
PIN_WITHOUT_CONFIRM_EXIT=3
기록 예정: qa_residue_target_snapshot / qa-residue-softdelete-2026-08-12 / slip 295 / line 636
snapshot 고정 보류: --set=confirm=PIN_QA_RESIDUE_SNAPSHOT_2026-08-12 확인 토큰이 필요합니다.
\`\`\`

\`\`\`text
PIN_FIRST_EXIT=0
CREATE TABLE
SELECT 295
SELECT 636
INSERT 0 931
snapshot 고정 완료: slip 295 / line 636.

PIN_SECOND_EXIT=0
이미 고정된 snapshot을 유지합니다: slip 295 / line 636 (쓰기 없음).

qa-residue-softdelete-2026-08-12 | line | 636
qa-residue-softdelete-2026-08-12 | slip | 295
\`\`\`

## GREEN — 정상 B 경로

\`\`\`text
B_VERIFY_DELETED_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0

B_ROLLBACK_EXIT=0
partner_db rollback | 1000
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636

B_EXECUTE_EXIT=0
INSERT 0 0
UPDATE 636
UPDATE 295

B_VERIFY_AFTER_EXECUTE_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
\`\`\`

토큰 없는 복구는 UPDATE 없이 중단했다.

\`\`\`text
B_TOKENLESS_REPAIR_EXIT=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.

B_VALID_REPAIR_EXIT=0
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

B_IMMEDIATE_REVERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
\`\`\`

## GREEN — 치환 시나리오

snapshot UUID를 별도 보존한 격리본에서 원래 전표·라인 1건을 활성화하고 snapshot 밖 전표·라인 1건에 같은 QA 표지를 부여했다. 표지 총수는 295/636이었다.

\`\`\`text
GREEN_SWAP_REPAIR_EXIT=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1
slip_db: snapshot/physical lines= 636 / 636  deleted= 635  restored= 1  drift= 0  non-target= 1
결과: 불일치 상태입니다.
자동 복구 불가: 양쪽 DB가 완전 삭제/완전 복구 상태가 아닙니다.

snapshot target not marked: 1
outside marked after: 1
\`\`\`

즉 대상 외 행을 복구하지 않았고, 원래 대상과 현재 표지의 치환을 검출했다.

## 불변식 4종 재확인

수정 후 격리 \`fix6-red-repro.ps1\` 실행 결과:

\`\`\`text
RED-I1 non-target marker compensated by target loss: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1

RED-I2 deleted_at NULL: exit=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  non-target= 0

RED-I4 stale snapshot compensated by marker count: exit=3
slip_db: snapshot/physical slips= 296 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0

RED-I5 normal path control: exit=3
slip_db: snapshot/physical slips= 296 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0

RED-I3 hard-deleted target line repair exit=3, immediate recheck exit=3
slip_db: snapshot/physical lines= 636 / 635  deleted= 635  restored= 0  drift= 0  non-target= 0
\`\`\`

I5는 I4가 의도적으로 stale snapshot 행을 추가한 뒤 snapshot을 정리하지 않는 기존 harness 순서 때문에 \`exit 3\`이다. 깨끗한 snapshot 정상 control은 위 B 검증에서 \`exit 0\`으로 확인했다.

## PM 공유 DB 실행 명령

아래는 PM이 공유 \`samhan-postgres\`에서 실행할 정확한 명령이다. pin은 반드시 첫 실행에서만 확인 토큰을 함께 사용한다.

\`\`\`powershell
docker cp scripts/qa-residue/2026-08-12-pin-qa-residue-snapshot.sql samhan-postgres:/tmp/2026-08-12-pin-qa-residue-snapshot.sql
docker exec samhan-postgres psql -X -v ON_ERROR_STOP=1 -U samhan -d postgres -f /tmp/2026-08-12-pin-qa-residue-snapshot.sql --set=confirm=PIN_QA_RESIDUE_SNAPSHOT_2026-08-12
\`\`\`

그 뒤 점검:

\`\`\`powershell
docker cp scripts/qa-residue/2026-08-12-verify-and-repair.sql samhan-postgres:/tmp/2026-08-12-verify-and-repair.sql
docker exec samhan-postgres psql -X -v ON_ERROR_STOP=1 -U samhan -d postgres -f /tmp/2026-08-12-verify-and-repair.sql
\`\`\`

복구가 필요한 mismatch일 때만 PM 승인 하에 실행:

\`\`\`powershell
docker exec samhan-postgres psql -X -v ON_ERROR_STOP=1 -U samhan -d postgres -f /tmp/2026-08-12-verify-and-repair.sql --set=repair=restore --set=confirm=RESTORE_QA_RESIDUE_2026-08-12
\`\`\`

## 못 한 것

- 공유 DB에서 pin·복구·표지 변경은 실행하지 않았다. 따라서 공유 DB 실제 pin 이후의 운영 결과는 PM 실행 전까지 미확정이다.
- 격리 dump와 컨테이너는 검증에 사용했으며, 원본 공유 DB의 상태는 변경하지 않았다.

## 라운드 종료 점검

\`\`\`text
삭제된 추적 파일: 없음
tools/.s24-build-only/build/deep/tracked-writer.mjs: exists=True
\`\`\`

격리 컨테이너·dump·임시 디렉터리 정리 명령은 최종 검증 후 실행한다.

