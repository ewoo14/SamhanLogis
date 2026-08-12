# #1176 재수렴 7회차 — CODEX SOL 적대검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete`
- 공유 DB 쓰기: 0건
- git 변경 계열 명령: 0건
- 스크립트 수정: 0건
- 검증 DB: `sol1176-r7-pg` 격리 PostgreSQL 16
- 복제: `pg_dump -Fc`를 `cmd.exe` 파일 redirection으로 host 파일에 저장한 뒤 `docker cp` + `pg_restore`. PowerShell 파이프 미사용.

## 1. 답 — 도달 가능한 결함 1건

**있다. snapshot 테이블이 없는 A에서 fallback은 원래 대상 ID를 알 수 없으므로, 현재 QA 표지와 후보 조건으로 대상 집합을 다시 만든다. 원래 대상이 같은 수의 대상 외 행으로 치환되면 점검·복구·즉시 재점검이 모두 `exit 0`인데도 잘못된 행을 복구한다.**

격리 A에서 다음 실제 데이터 상태를 만들었다.

1. 원래 QA 대상 전표 1건과 그 QA 표지 라인 1건의 `deleted_by`가 다른 writer 표지로 바뀐 상태를 재현했다.
2. 원래 대상이 아니던 활성 전표 1건과 라인 1건에 QA 삭제 표지를 부여했다. 이 라인은 삭제 뒤 새로 생긴 후보도 표현할 수 있도록 현재 fallback 후보 product 중 하나를 가진 상태로 만들었다.
3. QA 표지 총수는 계속 전표 `295`, 라인 `636`이었다.

원문:

```text
target_choice | outside_choice
--------------+---------------
            1 |              1

slip_marker | line_marker | omitted_original | included_outside
------------+-------------+------------------+-----------------
        295 |         636 |                1 |                1

A_SWAP_VERIFY_DELETED_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.

A_SWAP_VALID_REPAIR_EXIT=0
SELECT 636
SELECT 295
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

A_SWAP_IMMEDIATE_REVERIFY_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.

original_slips_restored_of_295 | original_lines_restored_of_636
-------------------------------+-------------------------------
                           294 |                            635

original_target_marker_lines_still_deleted | outside_lines_restored
--------------------------------------------+-----------------------
                                          1 |                      1
```

fallback의 `non-target=0`은 “원래 대상 밖이 없음”이 아니다. fallback이 현재 표지로 새로 구성한 집합 밖에 표지가 없다는 뜻이다. 따라서 표지 치환 자체를 대상 치환으로 받아들인다. snapshot이 있는 B에서는 고정 ID와 비교하므로 같은 치환을 I1/I4로 차단한다.

현재 공유 DB의 현 시점 표지 295건은 모두 후보 전표와 교차했고 `marked_without_candidate=0`이었다. 즉 현재 공유 DB가 이미 치환됐다고 단정하지는 않는다. 결함은 snapshot 없는 운영 상태에서 이후 대상 유실·대상 외 오표지가 정확히 상쇄되면 실제 운영 점검과 복구가 이를 승인한다는 것이다.

## 2. 복제 및 한글 무결성

공유 DB를 읽기 전용으로 확인한 원문:

```text
partner target_total=1000  marker=1000
slip_marker=295
line_marker=636
snapshot_table=(NULL)
```

복제 직후 한글 원문:

```text
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)
```

## 3. 상태 A — snapshot 테이블 없음

### 정상 점검·복구·즉시 재점검

A는 공유 DB 복제 직후 이미 정상 삭제 완료 상태다. 현재 삭제 SQL을 새로 실행하면 snapshot을 생성해 B가 되므로, A의 삭제 수치는 복제된 실제 삭제 상태에서 확인했다.

```text
A_VERIFY_DELETED_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.

UPDATE 1000

A_VALID_REPAIR_EXIT=0
SELECT 636
SELECT 295
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

A_IMMEDIATE_REVERIFY_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

### 토큰 없는 복구 — UPDATE 없음

```text
BEFORE
slips=295:9ce7a286011d9bfe2954dac0f297bf6d
lines=636:db4c56eb6beceb7fc5ae34d65421f37b

A_REPAIR_WITHOUT_CONFIRM_EXIT=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
psql:/tmp/verify.sql:136: ERROR:  division by zero

AFTER
slips=295:9ce7a286011d9bfe2954dac0f297bf6d
lines=636:db4c56eb6beceb7fc5ae34d65421f37b
```

### 대상 외 지문

원래 QA 표지 ID를 격리 보조 테이블에 고정한 뒤 그 밖의 `row_to_json(row)`을 ID 순서로 이중 MD5했다.

```text
partner 7323:8cfbce71907cc309eca33704c003abb0 -> 동일
slips  2482:592d108a3878010ad1049dac69d44b40 -> 동일
lines  3352:541031c97c7814ec06132ee96d8d9a9c -> 동일
```

### 단순 불변식 변형

```text
A_I1_EXIT=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  non-target= 1

A_I2_EXIT=3
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  non-target= 0

A_I3_REPAIR_EXIT=3
slip_db: snapshot/physical lines= 635 / 635  deleted= 635  restored= 0  drift= 0  non-target= 0
자동 복구 불가: 양쪽 DB가 완전 삭제/완전 복구 상태가 아닙니다.

A_I3_IMMEDIATE_RECHECK_EXIT=3
slip_db: snapshot/physical lines= 635 / 635  deleted= 635  restored= 0  drift= 0  non-target= 0
```

단순 대상 밖 표지, `deleted_at=NULL`, hard-delete 뒤 복구/재점검 불일치는 검출한다. 그러나 A에는 물리 snapshot 자체가 없으므로 고정 ID 대비 물리 수 불변식은 존재할 수 없다. 총수 `636` 불일치는 검출하지만, 1건 유실과 1건 유입이 상쇄된 §1 치환은 검출하지 못했다.

## 4. 상태 B — snapshot 테이블 있음

### rollback·정상 삭제·점검

```text
B_ROLLBACK_EXIT=0
UPDATE 1000
partner_db rollback | 1000
UPDATE 636
UPDATE 295
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636

B_EXECUTE_EXIT=0
UPDATE 1000
CREATE TABLE
INSERT 0 931
UPDATE 636
UPDATE 295

qa_residue_target_snapshot
931

B_VERIFY_DELETED_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

### 토큰 없는 복구·유효 복구·즉시 재점검

```text
BEFORE
slips=295:603a9d7ebfb397881b576e13451978f1
lines=636:ff6ace6da03dc6d381d8d1f2979a8334

B_REPAIR_WITHOUT_CONFIRM_EXIT=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.

AFTER
slips=295:603a9d7ebfb397881b576e13451978f1
lines=636:ff6ace6da03dc6d381d8d1f2979a8334

B_VALID_REPAIR_EXIT=0
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

B_IMMEDIATE_REVERIFY_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

대상 외 지문은 A와 같은 세 지문으로 삭제·복구 전후 모두 동일했다.

### 불변식 4종과 I5 설명

기존 fix6 harness 전체 순서 원문:

```text
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
```

깨끗한 snapshot 상태에서 정상 control을 단독 실행한 원문:

```text
B_STANDALONE_EXECUTE_EXIT=0
UPDATE 1000
INSERT 0 0
UPDATE 636
UPDATE 295

B_STANDALONE_I5_CONTROL_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  non-target= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.
```

따라서 fix7 보고서의 “전체 harness I5는 I4가 넣은 stale snapshot을 Reset-DeletedState가 제거하지 않아 `exit 3`이고, 깨끗한 단독 control은 `exit 0`” 설명은 맞다.

## 5. fix7 보고서 증거 무결성 대조

재현된 주장:

- A/B 정상 점검, 유효 복구, 즉시 재점검 종료 코드와 `1000/295/636` 수치
- A/B 무토큰 복구 `exit 3` 및 UPDATE 없음
- A의 `SELECT 636` 뒤 `SELECT 295`
- I1/I2/I3/I4 검출과 I5 stale 순서 설명
- 복제 직후 한글 3건

재현되지 않은 “원문” 1건:

```text
fix7 보고서 B:
SELECT 636
SELECT 295

실제 B 재실행:
SELECT 295
SELECT 636
```

현재 SQL의 snapshot 존재 분기는 `qa_repair_slips`를 먼저 만들고 그다음 `qa_repair_lines`를 만든다(`verify-and-repair.sql:113-115`). 따라서 B의 실제 psql 출력은 `SELECT 295` 다음 `SELECT 636`이다. 보고서 B 원문은 A fallback 출력이 복사된 것으로 보이며 그대로 재현되지 않는다. UPDATE 수치와 제품 동작에는 차이가 없지만, “원문” 증거는 불일치한다.

## 6. 못 한 것

- 공유 DB mutation은 금지 지시 때문에 실행하지 않았다. 모든 UPDATE/DELETE/DDL은 격리 복제본에서만 수행했다.
- A에는 정의상 snapshot 테이블이 없으므로 “snapshot 고정 ID와 물리 ID의 동일성” 자체는 검사할 수 없다. 이 공백이 §1 결함으로 실제 통과함을 확인했다.
- 그 밖의 요청 항목은 모두 실행했다.

## 7. 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
(none)

tools/.s24-build-only/build/deep/tracked-writer.mjs exists=True

docker ps -a --filter name=^/sol1176-r7-pg$: container_count=0
.qa-temp-sol-recon7: exists=False
round_processes=0 (background process를 시작하지 않음)
```

격리 컨테이너 `sol1176-r7-pg`, host dump 2개와 임시 디렉터리 `.qa-temp-sol-recon7`을 제거했다. 삭제된 추적 파일은 없고, 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재한다.
