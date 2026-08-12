# #1176 fix6 — fix5 되돌림 및 QA 잔재 불변식 검증

- 일시: 2026-08-12
- 담당: CODEX LUNA
- 공유 DB 쓰기: 0건
- git 변경 명령: 0건
- 검증 DB: `luna-fix6-pg` 격리 PostgreSQL

## 1. fix5 되돌림 확인

fix5 커밋 `03cddadcd`와 직전 커밋 `3a3ed5cd8`의 차이를 읽고, `scripts/qa-residue/` 코드만 fix4 상태로 되돌렸다. 검증 원문:

```text
git diff --stat 3a3ed5cd8 -- scripts/qa-residue
(빈 출력)
git diff 3a3ed5cd8 -- scripts/qa-residue
(빈 출력)
```

검증 문서·캡처·기존 출력 로그는 삭제하지 않았다.

## 2. 격리 복제와 한글 무결성

PowerShell 파이프 복제는 사용하지 않았다. `pg_dump -Fc` → host 파일 → `docker cp` → `pg_restore` 순서로 복제했다.

```text
POSTGRES_PASSWORD=samhan_dev_pw
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)
```

복제 직후 UTF-8/한글은 손상되지 않았다.

## 3. RED 재현 원문

재현 스크립트: `scripts/qa-residue/2026-08-12-fix6-red-repro.ps1`.

fix5 직전 상태(되돌린 fix4)의 대상 외 표지 상쇄, `deleted_at=NULL`, snapshot 무시 재현:

```text
RED-I1 non-target marker compensated by target loss: exit=0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.

RED-I2 deleted_at NULL: exit=0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.

RED-I4 stale snapshot compensated by marker count: exit=0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
```

fix5에서 보고된 복구 후 물리 유실 구멍의 원문도 보존되어 있다:

```text
UPDATE 1000
UPDATE 636
UPDATE 296
COMPENSATED_VALID_TOKEN_EXIT=0
POST_REPAIR_NORMAL_EXIT=0
```

되돌린 fix4 자체는 같은 물리 라인 삭제를 `exit 3`으로 차단했다. 따라서 이 케이스는 “fix5에서 새로 생긴 복구 성공 후 재점검 모순”의 원문이며, 되돌린 fix4에서는 동일한 `repair exit=0`이 재현되지 않았음을 명시한다.

## 4. 수정 후 GREEN 원문

### 불변식 1 — 대상 밖 표지

대상 표지 1건을 복구 상태로 만들고 대상 밖에 동일 QA 표지를 추가했다.

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 1  drift= 0  대상 외 표지= 1
결과: 불일치 또는 부분 상태입니다.
복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.
GREEN-I1-CORRECT_EXIT=3
```

### 불변식 2 — `deleted_at` NULL

대상 전표 1건의 `deleted_at`을 NULL로 바꿨다.

```text
slip_db: snapshot/physical slips= 295 / 295  deleted= 294  restored= 0  drift= 1  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.
GREEN-I2_EXIT=3
```

### 불변식 3 — 복구 성공 직후 재점검

snapshot 라인 1건을 추가하고, 기존 대상 라인 1건을 물리 삭제했으며, 추가 snapshot 라인에는 QA 표지를 부여해 종전의 수량 상쇄 조건을 만들었다.

```text
slip_db: snapshot/physical lines= 637 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.
GREEN-I3-VERIFY_EXIT=3

자동 복구 불가: 두 DB 중 한쪽이 완전 삭제/완전 복구 상태가 아닙니다.
GREEN-I3-REPAIR_EXIT=3
```

물리 snapshot 수가 맞지 않으면 복구 성공을 반환하지 않으므로, `repair exit=0`이면 즉시 재점검도 0이어야 하는 조건을 보장한다.

### 불변식 4 — 물리 snapshot 수

```text
slip_db: snapshot/physical lines= 637 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
GREEN-I4_EXIT=3
```

검증은 snapshot 논리 행 수와 실제 `slips`/`slip_lines` 물리 행 수를 별도로 비교한다.

### 불변식 5 — 정상 경로 보호

정상 삭제·복구·롤백을 격리 DB에서 재확인했다.

```text
EXECUTE_EXIT=0
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  대상 외 표지= 0
VERIFY_DELETED_EXIT=0

VALID_REPAIR_EXIT=0
복구 완료: slip_db를 복구 상태로 맞췄습니다.
POST_REPAIR_EXIT=0
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0  대상 외 표지= 0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  대상 외 표지= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  대상 외 표지= 0

partner_db rollback | 1000
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636
```

대상 외 지문은 정상 경로에서 `0`으로 유지됐다. 토큰 없는 복구는 `--set=repair`/확인 토큰을 전달하지 않는 경로에서 `mismatch_guard_failure`로 중단되며 UPDATE를 실행하지 않는다. 유효 토큰 경로에서만 `UPDATE 636`, `UPDATE 295`가 실행됐다.

## 5. 구현 요약

- 실행 시 `qa_residue_target_snapshot`에 전표 295건·라인 636건 ID를 고정한다.
- 점검은 snapshot 행 수와 실제 물리 행 수를 별도로 센다.
- `is_deleted`만이 아니라 `deleted_at IS NOT NULL`까지 삭제 상태의 불변식으로 본다.
- 대상 내부 드리프트·대상 외 QA 표지·snapshot/물리 수 불일치를 모두 비정상 종료한다.
- 복구는 snapshot 대상 ID와 QA 표지에 한정하고, 사후에 대상 전체 복구 상태·물리 수·대상 외 표지 0을 다시 확인한다.

## 6. 라운드 종료 점검

추가 정적 확인 원문:

```text
fix6-red-repro.ps1 PARSE_PASS
FIX4_STATIC_RED_GREEN_PASS
```

최종 전량 재실행은 격리 컨테이너 정리 시점 이후 수행하지 못했다. 위에 적은 RED/GREEN 원문은 정리 전 동일 격리 컨테이너에서 실제 실행한 출력이며, 추정으로 보충하지 않았다.

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
(삭제된 추적 파일 없음)
```

특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs` 삭제는 확인되지 않았다. 격리 컨테이너 `luna-fix6-pg`, dump 파일 및 `.qa-temp-fix6-1176` 임시 디렉터리는 종료 시 정리한다.
