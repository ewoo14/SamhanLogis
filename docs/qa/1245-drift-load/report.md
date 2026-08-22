# PR #1245 — drift 42건 적재 결과

검증일: 2026-08-18 (Asia/Seoul)  
브랜치: `data/legacy-csv-full-load`  
검증 기준: `bfca4ab79`

## ① 마이그레이션 번호 3중 확인

| 기준 | dc-config-service 마이그레이션 |
|---|---|
| 이 브랜치 | V1~V7 + **V8__load_42_drift_legacy_dc_configs.sql** |
| `origin/main` | V1~V6 |
| 다른 열린 PR | PR #1245의 V7만 확인. 다른 열린 PR의 V7/V8 선점 없음 |

따라서 V8이 다음 번호다. 이미 적용된 V7은 수정하지 않았다.

## ② 적재 전/후 42건 대조

`before`는 fresh PostgreSQL에서 V8 직전의 현행값이고, `after`는 V8 적용 직후다. 모든 42행은 백업 테이블과 현재 행을 개별 비교했다.

| 코드 | 적재 전 | 적재 후 핵심값 |
|---|---|---|
| 1023108393 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4500 |
| 1110854627 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4700 |
| 1588802571 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4800 / 상업 .4900 / I호스 true / 360 60000 / 4way 60000 / 1way 50000 / 스탠드 60000 / 디럭스 30000 / 단위 true·100·CEIL |
| 1700202752 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4600 / 상업 .4600 |
| 1928601146 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4500 / I호스 true |
| 1958803735 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4700 / 360·4way·1way·스탠드·1등급 20000 |
| 1978701449 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 2062722119 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4700 |
| 2081312022 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 2148720659 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 스탠드 30000 |
| 2188601069 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4600 / 360·4way·1way·스탠드 20000 |
| 2218135880 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4600 |
| 2246300824 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4500 |
| 3118142909 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4500 |
| 3123184794 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4700 / 상업 .4800 / I호스 true |
| 3128161229 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4700 / 360·4way·1way·스탠드 50000 |
| 3998102101 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 4340601242 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 모두 없음 |
| 4368601987 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4500 |
| 4481802127 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈·상업 .4700 |
| 4758802006 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4600 / 특이사항 원천값 |
| 4868101328 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4700 / I호스 true / 특이사항 원천값 |
| 4960901372 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 360 50000 / 4way 50000 / 1way 30000 / 스탠드 50000 / 1등급 30000 |
| 5041369971 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 4way 50000 / I호스 true |
| 5042231142 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 4way 50000 |
| 5218101918 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 6030686342 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4700 / I호스 true / 특이사항 원천값 |
| 6132977742 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 360 70000 / 4way 70000 / 1way 50000 / 스탠드 70000 / 디럭스 20000 |
| 6323101362 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | I호스 true / 특이사항 원천값 |
| 6345300755 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 6528702417 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 360·4way·1way·스탠드·1등급 30000 |
| 6708701231 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | I호스 true / 360·4way·1way·스탠드 50000 / 특이사항 원천값 |
| 6832001665 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈·상업 .4700 |
| 6931501445 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 360·4way·1way·스탠드 50000 |
| 7053900503 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4500 |
| 7098602166 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 360·4way·1way·스탠드 50000 / 디럭스·1등급 30000 |
| 7698100748 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 상업 .4600 |
| 7968102976 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | I호스 true / 단위 true·100·ROUND |
| 8412400727 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 홈 .4500 / I호스 true |
| 8428102605 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | I호스 true / 360 60000 / 4way 60000 / 1way 50000 / 스탠드 60000 / 단위 true·100·ROUND |
| 8718100468 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |
| 8848101425 | 홈 .4600 / 상업 .4700 / I호스 false / 단위 false | 특이사항 원천값 |

검증 수치:

- `UPDATE 42`
- V8 백업 행: `42`
- 백업 대비 값이 달라진 행: **42**
- `modified_by='PR1245'`: **42**

## ③ `4348703365` 무변경 확인

V8 대상 임시표와 백업표에 포함하지 않았다. fresh 적용 전후 모두 다음 값이 동일했다.

`home=0.4800, commercial=0.4900, show_i_hose=true, source=ADMIN_EDIT, modified_at=NULL, modified_by=NULL`

## ④ 변경 행 수

fresh DB 전체 활성행은 적재 전 `43`, 적재 후 `43`이다. 값 변경 행은 정확히 **42건**이며, 보호 행 1건은 변경되지 않았다.

## ⑤ 가역 절차

V8이 `dc_config_legacy_drift_1245_backup`에 기존 42행 전체를 백업한다. 운영 적용 후 원복이 필요하면 해당 백업 테이블을 삭제하지 않은 상태에서 다음을 실행한다.

```sql
BEGIN;
UPDATE dc_configs c
SET home_discount_rate=b.home_discount_rate,
    commercial_discount_rate=b.commercial_discount_rate,
    show_i_hose=b.show_i_hose,
    discount_360_amount=b.discount_360_amount,
    discount_4way_amount=b.discount_4way_amount,
    discount_1way_amount=b.discount_1way_amount,
    discount_stand_amount=b.discount_stand_amount,
    discount_deluxe_amount=b.discount_deluxe_amount,
    discount_first_grade_amount=b.discount_first_grade_amount,
    unit_round_to=b.unit_round_to,
    unit_processing_enabled=b.unit_processing_enabled,
    unit_round_mode=b.unit_round_mode,
    source=b.source, note=b.note,
    created_at=b.created_at, created_by=b.created_by,
    modified_at=b.modified_at, modified_by=b.modified_by,
    deleted_at=b.deleted_at, deleted_by=b.deleted_by,
    is_deleted=b.is_deleted
FROM dc_config_legacy_drift_1245_backup b
WHERE c.id=b.id;
COMMIT;
```

원복 검증은 백업의 42행과 현재 행의 모든 저장 필드를 `IS NOT DISTINCT FROM`으로 비교한다. fresh 검증 결과 정확히 `42`행 복귀, 전체 활성행 `43`행이었다. `4348703365`도 원복 대상이 아니며 계속 동일하다.

## ⑥ RED 원문

V8 전 fresh DB에서 RED 테스트를 실행한 원문:

```text
ERROR:  RED: drift 42건이 아직 적재되지 않음 (matched=0, protected=0)
CONTEXT: PL/pgSQL function inline_code_block line 24 at RAISE
```

RED 테스트 파일: `docs/qa/1245-drift-load/red-before-v8.sql`

## ⑦ fresh 적용 결과

- fresh PostgreSQL에서만 검증했다.
- V8 결과: `INSERT 0 42`(백업), `UPDATE 42`, `COMMIT`.
- 적용 후 전체 활성 `dc_configs`: `43`.
- 변경 필드 비교: `42`.
- 보호 코드 변경: `0`.
- 원복 후 백업과 완전 일치: `42`.
- 공유 DB에는 쓰기 작업을 하지 않았다.

## ⑧ 못 한 것과 이유

- 라이브 화면 확인: 지시 범위 밖이며 다음 라운드다.
- 운영 DB 적재: 머지 후 개발책임자 판단 사항이다.
- Git commit/push/add: 지시로 금지되어 수행하지 않았다.

## ⑨ `git status --porcelain` 원문

```text
?? docs/qa/1245-drift-load/
?? services/dc-config-service/src/main/resources/db/migration/V8__load_42_drift_legacy_dc_configs.sql
```

`git diff --check` 원문:

```text
(출력 없음, exit code 0)
```

## ⑩ 프로세스·컨테이너 회수

- 이번 작업에서 기동한 격리 컨테이너: `codex-pr1245-drift-pg`
- 회수: 보고서 작성 후 `docker rm -f codex-pr1245-drift-pg` 실행
- 공유 컨테이너 24개: 변경·회수하지 않음
- 다른 워크트리 프로세스: 건드리지 않음
