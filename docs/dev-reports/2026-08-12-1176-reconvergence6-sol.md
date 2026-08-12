# #1176 재수렴 6회차 — CODEX SOL 적대검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` / HEAD `a37a1b0bf`
- 공유 DB 쓰기: 0건
- git 변경 계열 명령: 0건
- 스크립트 수정: 0건
- 검증 DB: `sol1176-r6-pg` 격리 PostgreSQL 16
- 복제: `pg_dump -Fc`를 `cmd.exe` 파일 redirection으로 host dump에 저장하고 `docker cp` + `pg_restore` 사용. PowerShell 파이프 미사용.

## 1. 판정 — 도달 가능한 결함 1건

### 실제 공유 DB 상태에서는 현재 점검·복구 스크립트가 snapshot 테이블 부재로 실행 불가

이 결함은 검증 하네스의 약점이 아니라, 현재 공유 DB를 대상으로 운영자가 현재 스크립트를 실행하는 경로에서 직접 재현된다.

재현 단계:

1. 공유 DB를 읽기 전용으로 확인한다. 실제 표지는 partner `1,000`, slip `295`, line `636`이고 `slip_db.qa_residue_target_snapshot`은 없다.
2. 이 상태를 파일 경유로 격리 DB에 그대로 복제한다.
3. 운영자가 현재 `2026-08-12-verify-and-repair.sql`을 실행한다.
4. 조회 모드와 유효 토큰 복구 모드가 모두 snapshot 조회에서 `exit 3`으로 중단된다. 상태 비교·복구 분기까지 도달하지 못한다.

원문:

```text
target_total | target_deleted | marker
-------------+----------------+-------
        1000 |           1000 |   1000

slip_marker
------------
        295

line_marker
------------
        636

snapshot_table
--------------
(NULL)

EXISTING-DELETED-NO-SNAPSHOT_VERIFY_EXIT=3
psql:/tmp/current-verify.sql:58: ERROR:  relation "qa_residue_target_snapshot" does not exist
LINE 2:   SELECT entity_id AS id FROM qa_residue_target_snapshot

EXISTING-DELETED-NO-SNAPSHOT_VALID_REPAIR_EXIT=3
psql:/tmp/current-verify.sql:58: ERROR:  relation "qa_residue_target_snapshot" does not exist
LINE 2:   SELECT entity_id AS id FROM qa_residue_target_snapshot
```

현재 rollback SQL 자체는 이 상태에서 `1,000 / 295 / 636`을 복구한다. 그러나 현재 점검·자동 복구 SQL은 실제 기존 삭제 상태를 읽거나 유효 토큰으로 복구할 수 없다. 이를 우회하려면 운영자가 먼저 전량 rollback한 뒤 현 버전 삭제를 다시 실행해 snapshot을 새로 만들어야 한다.

## 2. 한글 무결성 확인

복제 직후 원문:

```text
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)
```

한글 손상은 재현되지 않았다.

## 3. 증거 무결성 — RED 원문 3건

fix4 커밋 `3a3ed5cd8`의 SQL을 `git archive`로 임시 추출하고, 현재 `2026-08-12-fix6-red-repro.ps1`에 해당 원본 경로를 전달했다. 보고서의 세 RED는 모두 `exit 0`으로 재현됐다.

```text
RED-I1 non-target marker compensated by target loss: exit=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.

RED-I2 deleted_at NULL: exit=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.

RED-I4 stale snapshot compensated by marker count: exit=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
```

## 4. 증거 무결성 — GREEN 원문 5건

각 시나리오 전에 dump 원본으로 두 DB를 다시 만들었다. 서로의 mutation이 섞이지 않았다.

```text
GREEN-I1_EXIT=3
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  대상 외 표지= 1
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.

GREEN-I2_EXIT=3
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.

GREEN-I4_EXIT=3
slip_db: snapshot/physical slips= 296 / 295  deleted= 295  restored= 0  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.

GREEN-I3-VERIFY_EXIT=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 637 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.

GREEN-I3-REPAIR_EXIT=3
slip_db: snapshot/physical lines= 637 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
자동 복구 불가: 두 DB 중 한쪽이 완전 삭제/완전 복구 상태가 아닙니다.
```

보고서의 GREEN 5건은 모두 재현됐다.

## 5. 정상 경로 전량 재실행

실제 공유 DB 복제 상태를 먼저 rollback해 정상 복구 상태로 만든 뒤 현 버전 삭제를 실행했다.

### 삭제 및 삭제 상태 점검

```text
EXECUTE_EXIT=0
UPDATE 1000
CREATE TABLE
INSERT 0 931
UPDATE 636
UPDATE 295

VERIFY_DELETED_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
```

### 유효 토큰 복구 및 즉시 재점검

partner 쪽을 복구 상태로 만든 부분 상태에서 유효 토큰으로 slip 복구를 실행했다.

```text
VALID_REPAIR_EXIT=0
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

POST_REPAIR_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
```

복구 `exit 0` 직후 재점검도 `exit 0`이었다.

### rollback 수치

```text
ROLLBACK_EXIT=0
UPDATE 1000
partner_db rollback | 1000
UPDATE 636
UPDATE 295
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636
```

### 대상 외 전체행 지문

`row_to_json(row)` 전체를 ID 순으로 연결해 MD5를 계산했다.

```text
NON_TARGET_BEFORE=
7323:9711a98643b42c943a1a0e848a271516
slips=2395:ec236f90f55c2ded82a1622fbc1535d5
lines=2972:2f852017fde4c9fcdb73a76981d26f13

NON_TARGET_AFTER_DELETE=(동일)
NON_TARGET_AFTER_REPAIR=(동일)
NON_TARGET_FINGERPRINT_IDENTICAL=TRUE
```

### 토큰 없는 복구와 UPDATE 미실행

조회 모드, 즉 `repair`와 확인 토큰을 둘 다 전달하지 않은 경로는 보고서 주장대로 `mismatch_guard_failure`에서 종료됐고 전후 대상 전체행 지문이 같았다.

```text
NO_REPAIR_NO_CONFIRM_EXIT=3
복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.
psql:/tmp/current-verify.sql:208: ERROR:  division by zero

TOKENLESS_BEFORE=
slips=295:279f91f928ec9d1fe20d6f8d621222d4
lines=636:014f962eecefcda2107e6eae5095f25b
NO_REPAIR_NO_CONFIRM_AFTER=(동일)
NO_REPAIR_NO_CONFIRM_UNCHANGED=True
```

정확한 분기 대조를 위해 `repair=restore`만 주고 확인 토큰을 생략한 경로도 실행했다. 이 경우 오류명은 `mismatch_guard_failure`가 아니라 `repair_confirmation_failure`이며, 역시 UPDATE는 없었다. 원 보고서 본문은 “`repair`/확인 토큰을 전달하지 않는 경로”로 한정했으므로 그 본문 주장과는 모순되지 않는다.

```text
REPAIR_WITHOUT_CONFIRM_EXIT=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
psql:/tmp/current-verify.sql:204: ERROR:  division by zero
REPAIR_WITHOUT_CONFIRM_AFTER=(동일)
REPAIR_WITHOUT_CONFIRM_UNCHANGED=True
```

## 6. 전량 재실행 결과

보고서 말미에서 못 했다고 한 전량을 이번 라운드에서 다시 실행했다.

```text
RED I1/I2/I4: 3/3 재현
GREEN I1/I2/I3-verify/I3-repair/I4: 5/5 검출
정상 삭제/점검/유효 복구/즉시 재점검/rollback: 전부 기대 종료 코드와 수치 재현
대상 외 지문: 삭제·복구 전후 동일
무토큰 두 경로: 모두 UPDATE 없음
FIX2_REGRESSION_PASS exit=3
FIX4_STATIC_RED_GREEN_PASS
FIX6_RED_REPRO_PARSE_PASS
```

못 한 항목은 없다. 공유 DB에 대한 변경 실행은 금지 지시에 따라 수행하지 않았고, 모든 mutation은 격리 복제본에서만 수행했다.

## 7. 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
(삭제된 추적 파일 없음)
tools/.s24-build-only/build/deep/tracked-writer.mjs exists=True
```

격리 컨테이너 `sol1176-r6-pg`, dump 2개, `.qa-temp-sol-recon6` 임시 디렉터리를 정리했다. 이 라운드가 별도로 시작한 잔존 프로세스는 없다.
