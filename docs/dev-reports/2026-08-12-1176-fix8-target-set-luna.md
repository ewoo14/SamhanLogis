# #1176 fix8 — snapshot 부재 시 대상 집합 확정성 조사

- 일시: 2026-08-12
- 담당: CODEX LUNA
- 브랜치: `chore/qa-residue-softdelete`
- 공유 DB 쓰기: 0건
- git 변경 계열 명령: 0건
- 검증 DB: 격리 PostgreSQL `fix8-luna-pg`

## 결론

이번 라운드에서는 안전한 코드 수정으로 종결할 수 없다. snapshot이 없는 상태에서 표지가 치환될 수 있다는 RED가 재현되었고, 현재 공유 DB·저장소·복제본에서 원본 target ID를 확정하는 별도 증거를 찾지 못했다. 따라서 marker/candidate fallback을 더 쌓아 복구를 허용하는 것은 불변식 1을 위반한다.

현재 SQL은 그대로 두었다. no-snapshot 자동 복구를 fail-closed로 바꾸면 불변식 1은 지키지만, 현재 요구한 “실 공유 DB의 marker 295/636 상태에서 295/636 복구 완주”를 동시에 지킬 수 없다. 두 불변식을 함께 만족하는 target source가 마련되기 전에는 어느 쪽도 성립하지 않는다.

## 대상 집합 확정 방식 선택지

| 방식 | 안전성 | 현재 상태에서 가능한가 | 결과 |
|---|---|---:|---|
| 현재 marker ID 집합 | 불안전 | 예 | 치환 RED에서 대상 외 행을 복구하므로 폐기 |
| marker + candidate 조건 재구성 | 불안전 | 예 | fix7의 결함. 1건 유실·1건 유입이 상쇄되면 검출 불가 |
| 삭제 시점의 영속 snapshot 테이블 | 안전 | 아니오 | B에서는 기존 구현이 정상. A에는 테이블이 없음 |
| 운영자 서명/승인 manifest(전표·라인 UUID) | 안전 | 현재 자료 없음 | manifest를 별도 공급받은 뒤에만 복구 가능 |
| 현재 행의 속성·시간·번호 추정 | 불안전 | 일부 가능 | 표지 치환과 구별할 수 없어 불변식 1을 보장하지 못함 |

고른 방식은 “영속 snapshot 또는 외부에서 확정된 immutable manifest가 없으면 복구하지 않음”이다. 이는 현재 자동 완주 요구와 충돌하므로, 이번 라운드의 판정은 **성립하지 않음**이다. 공유 DB에 임의로 snapshot을 만들거나 marker를 복구 대상으로 확정하지 않았다.

## RED — 치환 시나리오 원문

공유 DB를 `pg_dump -Fc` 파일로 읽어 격리본에 복원했다. PowerShell pipe는 사용하지 않았다. 복제 직후 한글 확인:

```text
        name
--------------------
 (주)한국냉동물류
 (주)서울택배
 대한화물서비스(주)
(3 rows)
```

공유 DB read-only 조사:

```text
partner candidate=1000
partner marker=1000
slip marker=295
line marker=636
snapshot_table=(NULL)
fallback slip candidate=295
fallback line candidate=636
```

격리본에서 원래 marker 전표·라인 1건은 `deleted_by='other-writer'`로 치환하고, 대상 외 활성 전표·라인 1건에는 QA marker를 부여했다. QA marker 총수는 `295/636`으로 유지됐다.

```text
 slip_markers | line_markers
--------------+--------------
          295 |          636
```

점검·복구·즉시 재점검:

```text
RED-A-SWAP_VERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.

RED-A-SWAP_REPAIR_EXIT=0
SELECT 636
SELECT 295
UPDATE 636
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.

RED-A-SWAP_IMMEDIATE_REVERIFY_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 0  restored= 295  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 0  restored= 636  drift= 0  non-target= 0
결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.

 original_slip_still_marked | qa_slip_markers | original_line_still_marked | qa_line_markers
----------------------------+-----------------+----------------------------+-----------------
                          1 |               0 |                          1 |               0
```

즉 실제 복구는 `294/635`이고 대상 외 행 1건이 복구됐다. 이는 불변식 1과 3의 RED다.

## 상태 A — snapshot 없음

- 정상 삭제 상태 점검: fix7 재현 및 이번 dump 조사에서 `exit 0`, `1000/295/636` 확인.
- 치환 상태: 위 RED처럼 점검 `exit 0`, 복구 `exit 0`, 즉시 재점검 `exit 0`이나 원본 대상 복구는 `294/635`.
- 대상 밖 표지 잔존, `deleted_at=NULL`, 물리 line 수 불일치, hard-delete 복구 불일치는 기존 fix6/fix7 적대 검증에서 계속 `exit 3`으로 검출.
- snapshot 자체가 없으므로 고정 ID 대비 물리 ID 불변식은 A에서 정의할 수 없다.
- 토큰 없는 복구는 기존 A 검증에서 `exit 3`, UPDATE 없음.

판정: 현재 marker만으로는 정상 상태에서 복구를 완주하는 것과 치환 시 대상 밖 복구 금지를 동시에 보장할 수 없다.

## 상태 B — snapshot 있음

격리본에서 rollback 후 정상 삭제를 수행했다.

```text
B_ROLLBACK_EXIT=0
partner_db rollback | 1000
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636

B_EXECUTE_EXIT=0
INSERT 0 931
UPDATE 636
UPDATE 295

B_VERIFY_DELETED_EXIT=0
slip_db: snapshot/physical slips= 295 / 295  deleted= 295  restored= 0  drift= 0  non-target= 0
slip_db: snapshot/physical lines= 636 / 636  deleted= 636  restored= 0  drift= 0  non-target= 0
```

partner를 복구 상태로 만든 mismatch에서:

```text
B_TOKENLESS_MISMATCH_EXIT=3
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
```

B는 고정 snapshot ID로 대상 밖 표지·물리 수·drift를 검출하고 `295/636`을 복구한다. fix7 보고서와 기존 적대 불변식 4종도 유지된다.

## fix7 보고서 정정

`docs/dev-reports/2026-08-12-1176-fix7-no-snapshot-table-luna.md`의 상태 B 유효 복구 원문 순서를 실제 psql 출력에 맞춰 정정했다.

```text
정정 전: SELECT 636 → SELECT 295
정정 후: SELECT 295 → SELECT 636
```

UPDATE 순서 `UPDATE 636 → UPDATE 295`는 그대로다. 수치와 동작은 변경하지 않았다.

## 못 한 것

- 원본 target UUID manifest를 현재 저장소, 공유 DB read-only 조회, 격리 dump에서 찾지 못했다.
- 공유 DB에는 SELECT와 dump 읽기만 수행했으며, snapshot 생성·복구·표지 변경을 하지 않았다.
- 따라서 불변식 1과 2를 동시에 만족하는 구현은 이번 라운드에 만들지 못했다. 이를 숨기고 추정 fallback을 추가하지 않았다.

## 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
(none)

tools/.s24-build-only/build/deep/tracked-writer.mjs exists=True
```

격리 컨테이너 `fix8-luna-pg`, dump 및 `.qa-temp-fix8-1176`, 임시 PostgreSQL 프로세스를 종료·정리했다. 공유 `samhan-postgres`는 계속 실행 중이며 쓰기하지 않았다.
