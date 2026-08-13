# PR #1176 재수렴 5회차 — SOL 운영 경로 검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` / 사용자 지정 HEAD `03cddadcd`
- 질문: **실 사용자/운영자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다.** fix5는 slip 대상 내부 표지 드리프트와 대상 외 표지를 분리 집계하지만, 다음 운영 상태를 정상으로 오판하거나 복구 성공으로 오판한다.
  1. partner 대상 외 QA 표지는 점검 집계에서 빠져 exit `0`이고 유효 토큰도 복구하지 않는다.
  2. partner/slip/line의 `deleted_at=NULL`은 QA 표지가 맞으면 exit `0`이고 유효 토큰도 복구하지 않는다.
  3. snapshot 대상 line이 hard delete되면 최초 점검은 exit `3`이지만, 유효 토큰 복구가 exit `0`으로 완료를 선언한 뒤 재점검은 다시 exit `3`이다.
  4. snapshot의 존재하지 않는 ID는 JOIN에서 사라진다. 오래된 snapshot 1건과 새 표지 1건이 보정되면 물리 snapshot은 637건인데 점검은 636건 정상, exit `0`이다.
- 공유 DB 쓰기: `0건`
- git 명령: `0회`
- 스크립트 변경: `0건`

## 1. 격리 복제와 증거 무결성

공유 `samhan-postgres`는 사용하지 않았다. 기존 격리본 `sol1176-pg`에서 custom dump를 만든 뒤 컨테이너 파일 → host 파일 → 신규 `reconv5-1176-pg` 파일 순서로 복원했다. 파이프는 사용하지 않았다.

```powershell
docker exec -e PGPASSWORD=sol1176-only sol1176-pg pg_dump -U samhan -d partner_db -Fc -f /tmp/reconv5-partner.dump
docker exec -e PGPASSWORD=sol1176-only sol1176-pg pg_dump -U samhan -d slip_db -Fc -f /tmp/reconv5-slip.dump
docker cp sol1176-pg:/tmp/reconv5-partner.dump ".qa-temp-reconv5-1176\partner.dump"
docker cp sol1176-pg:/tmp/reconv5-slip.dump ".qa-temp-reconv5-1176\slip.dump"
docker cp ".qa-temp-reconv5-1176\partner.dump" reconv5-1176-pg:/tmp/partner.dump
docker cp ".qa-temp-reconv5-1176\slip.dump" reconv5-1176-pg:/tmp/slip.dump
docker exec -e PGPASSWORD=reconv5-only reconv5-1176-pg pg_restore -U samhan -d partner_db --no-owner --no-privileges /tmp/partner.dump
docker exec -e PGPASSWORD=reconv5-only reconv5-1176-pg pg_restore -U samhan -d slip_db --no-owner --no-privileges /tmp/slip.dump
```

복제 직후 한글 SELECT 원문:

```text
 server_encoding | client_encoding |        korean_text
-----------------+-----------------+----------------------------
 UTF8            | UTF8            | 복제 직후 한글 SELECT 확인
(1 row)
```

격리 원본은 삭제 완료 상태(`partner 1,000 / slip 295 / line 636`)였고 fix5 snapshot 테이블은 없었다. 격리본 안에서 기존 rollback SQL로 복구한 뒤 fix5 execute SQL을 실행해 snapshot 포함 삭제 완료 기준 dump를 만들었다.

```text
ISOLATED_SOURCE_RESET_EXIT=0
NORMAL_EXECUTE_EXIT=0
NORMAL_DELETED_VERIFY_EXIT=0
```

## 2. 정상 상태 오탐과 정상 경로

전부 삭제됨과 전부 복구됨 모두 exit `0`이었다.

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: 대상 전표 total= 295  deleted-marker= 295  drift= 0  대상 외 표지= 0
slip_db: 대상 라인 total= 636  deleted-marker= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
NORMAL_DELETED_VERIFY_EXIT=0
```

```text
partner_db: total= 1000  deleted= 0  restored= 1000  other= 0
slip_db: 대상 전표 total= 295  deleted-marker= 0  drift= 0  대상 외 표지= 0
slip_db: 대상 라인 total= 636  deleted-marker= 0  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
NORMAL_ROLLBACK_EXIT=0
NORMAL_RESTORED_VERIFY_EXIT=0
```

정상 execute/rollback은 요청 수량 `partner 1,000 / slip 295 / line 636`을 처리했다. 삭제 필드를 제외한 대상 payload와 대상 외 전체 row JSON 지문은 실행 전·복구 후 같았다.

```text
PARTNER target payload     5b960cc7ffc02e352fc7c9d8732ee9fe == 5b960cc7ffc02e352fc7c9d8732ee9fe
PARTNER non-target full    977a619c3f272dac1496676a59bbb48f == 977a619c3f272dac1496676a59bbb48f
SLIP target payload        884f784c8240f29a46d279ec30c8b62e == 884f784c8240f29a46d279ec30c8b62e
LINE target payload        e6c6622771107685642df892f395d583 == e6c6622771107685642df892f395d583
SLIP non-target full       e6b41059948af2017444c3d1a0f94ce0 == e6b41059948af2017444c3d1a0f94ce0
LINE non-target full       6d0dff8b04942101a47ee769973e22cb == 6d0dff8b04942101a47ee769973e22cb
```

## 3. 상태 1 — 오래된 snapshot 감지가 샌다

### 3.1 존재하지 않는 snapshot ID가 JOIN에서 사라짐

삭제 완료 기준 상태에 존재하지 않는 line ID를 snapshot에 1건 추가했다. `qa_residue_target_snapshot`에는 외래키가 없고, 점검 SQL은 snapshot 자체의 수가 아니라 실제 테이블과 INNER JOIN된 수만 센다.

```sql
INSERT INTO qa_residue_target_snapshot(snapshot_key, entity_type, entity_id)
VALUES ('qa-residue-softdelete-2026-08-12', 'line', gen_random_uuid());

SELECT COUNT(*) FILTER (WHERE entity_type='line') AS physical_line_snapshot,
       COUNT(l.id) FILTER (WHERE q.entity_type='line') AS joined_existing_lines
FROM qa_residue_target_snapshot q
LEFT JOIN slip_lines l ON l.id=q.entity_id
WHERE q.snapshot_key='qa-residue-softdelete-2026-08-12';
```

```text
 physical_line_snapshot | joined_existing_lines
------------------------+-----------------------
                    637 |                   636

slip_db: 대상 라인 total= 636  deleted-marker= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
S1A_STALE_ORPHAN_SNAPSHOT_EXIT=0
```

이는 snapshot 증거가 637건인데 운영자 출력은 636건 정상이라고 하는 증거 무결성 결함이다.

### 3.2 오래된 1건과 새 1건이 보정됨

기존 snapshot line 1건을 hard delete하고, 대상 외 활성 line 1건에 QA 표지를 붙여 snapshot에 추가했다.

```sql
WITH victim AS (
  SELECT l.id
  FROM slip_lines l
  JOIN qa_residue_target_snapshot q ON q.entity_id=l.id
  WHERE q.snapshot_key='qa-residue-softdelete-2026-08-12' AND q.entity_type='line'
  ORDER BY l.id LIMIT 1
), gone AS (
  DELETE FROM slip_lines l USING victim v WHERE l.id=v.id RETURNING 1
)
SELECT COUNT(*) AS hard_deleted_old_snapshot_row FROM gone;

WITH target_lines AS (
  SELECT entity_id id FROM qa_residue_target_snapshot
  WHERE snapshot_key='qa-residue-softdelete-2026-08-12' AND entity_type='line'
), replacement AS (
  SELECT l.id FROM slip_lines l
  WHERE NOT l.is_deleted AND NOT EXISTS (SELECT 1 FROM target_lines t WHERE t.id=l.id)
  ORDER BY l.id LIMIT 1
), marked AS (
  UPDATE slip_lines l
  SET is_deleted=TRUE, deleted_at=clock_timestamp(),
      deleted_by='qa-residue-softdelete-2026-08-12'
  FROM replacement r WHERE l.id=r.id RETURNING l.id
)
INSERT INTO qa_residue_target_snapshot(snapshot_key,entity_type,entity_id)
SELECT 'qa-residue-softdelete-2026-08-12','line',id FROM marked;
```

```text
hard_deleted_old_snapshot_row=1
new_snapshot_rows=1
physical_line_snapshot=637
joined_existing_lines=636

slip_db: 대상 라인 total= 636  deleted-marker= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
S1B_STALE_COMPENSATED_SNAPSHOT_EXIT=0
```

fix4의 합계 보정 구멍이 snapshot 물리 행과 JOIN 생존 행 사이에서 다시 생긴다.

## 4. 상태 2 — 대상 행 hard delete 시 복구 성공 오판

snapshot 대상 line 1건을 실제로 삭제했다. 최초 점검은 총수 635로 감지했다.

```sql
WITH victim AS (
  SELECT l.id
  FROM slip_lines l
  JOIN qa_residue_target_snapshot q ON q.entity_id=l.id
  WHERE q.snapshot_key='qa-residue-softdelete-2026-08-12' AND q.entity_type='line'
  ORDER BY l.id LIMIT 1
), gone AS (
  DELETE FROM slip_lines l USING victim v WHERE l.id=v.id RETURNING 1
)
SELECT COUNT(*) AS hard_deleted_target_lines FROM gone;
```

```text
hard_deleted_target_lines=1
slip_db: 대상 라인 total= 635  deleted-marker= 635  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
S2_HARD_DELETED_TARGET_VERIFY_EXIT=3
```

그러나 유효 토큰 복구의 사후 검사는 snapshot 총수 636을 확인하지 않고 테이블 전체 QA 표지가 0인지만 본다. 635건만 복구하고 완료 exit `0`을 냈다.

```powershell
docker exec -e PGPASSWORD=reconv5-only reconv5-1176-pg `
  psql -X --set=repair=restore `
  --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 `
  -U samhan -d postgres -f /tmp/verify.sql
```

```text
UPDATE 635
UPDATE 295
복구 완료: slip_db를 복구 상태로 맞췄습니다.
S2_HARD_DELETED_TARGET_REPAIR_EXIT=0

slip_db: 대상 라인 total= 635  deleted-marker= 0  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
S2_HARD_DELETED_TARGET_POST_REPAIR_EXIT=3
```

운영자는 복구 명령의 exit `0`과 “복구 완료” 문구를 받지만 실제 누락 행은 복구되지 않는다.

## 5. 상태 3 — `deleted_at` 불일치 정상 오판

partner, 대상 slip, 대상 line 각 1건의 `deleted_at`만 NULL로 만들고 `is_deleted=TRUE`, QA `deleted_by`는 유지했다.

```sql
-- partner/slip/line에서 각각 snapshot 대상 1건 선택
UPDATE ...
SET deleted_at=NULL
WHERE id=(... LIMIT 1)
RETURNING is_deleted,deleted_at,deleted_by;
```

원문:

```text
is_deleted | deleted_at | deleted_by
-----------+------------+----------------------------------
t          |            | qa-residue-softdelete-2026-08-12
```

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: 대상 전표 total= 295  deleted-marker= 295  drift= 0  대상 외 표지= 0
slip_db: 대상 라인 total= 636  deleted-marker= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
S3_DELETED_AT_MISMATCH_EXIT=0
S3_VALID_TOKEN_EXIT=0
partner_null_deleted_at=1
slip_null_deleted_at=1
line_null_deleted_at=1
```

유효 토큰도 matched 분기에서 자동 복구 없이 끝나므로 세 불일치가 그대로 남았다.

## 6. 상태 4 — 대상 외 오표지 여러 건

대상 외 활성 slip 3건에 QA 표지를 붙였다.

```sql
WITH target_slips AS (
  SELECT entity_id id FROM qa_residue_target_snapshot
  WHERE snapshot_key='qa-residue-softdelete-2026-08-12' AND entity_type='slip'
), chosen AS (
  SELECT s.id FROM slips s
  WHERE NOT s.is_deleted AND NOT EXISTS (SELECT 1 FROM target_slips t WHERE t.id=s.id)
  ORDER BY s.slip_no LIMIT 3
)
UPDATE slips s
SET is_deleted=TRUE, deleted_at=clock_timestamp(),
    deleted_by='qa-residue-softdelete-2026-08-12',
    deleted_by_name='QA residue soft-delete'
FROM chosen c WHERE s.id=c.id;
```

```text
non_target_marked=3
slip_db: 대상 외 표지= 3
대상 외 전표 표지 행: (3 rows)
S4_MULTI_NON_TARGET_VERIFY_EXIT=3
```

세 건 모두 감지됐다. 토큰 없는 복구는 실행되지 않았다.

```text
S4_BEFORE_NO_TOKEN_NON_TARGET=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
S4_WITHOUT_CONFIRM_EXIT=3
S4_AFTER_NO_TOKEN_NON_TARGET=3
```

유효 토큰 복구와 재점검은 각각 exit `0`이었다.

```text
UPDATE 636
UPDATE 298
S4_VALID_REPAIR_EXIT=0
S4_POST_REPAIR_EXIT=0
```

## 7. 상태 5 — partner 과다 · slip 과소

partner 대상 외 1건에 QA 표지를 붙이고, snapshot 대상 slip 1건의 표지를 제거했다.

```text
non_target_partner_overmarked=1
target_slip_undermarked=1
partner target_marker=1000
partner non_target_marker=1
```

slip 과소 표지 때문에 전체 exit는 `3`이었지만 partner 대상 외 1건은 운영 출력에 나타나지 않았다.

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: 대상 전표 total= 295  deleted-marker= 294  drift= 0  대상 외 표지= 0
결과: 불일치 또는 부분 상태입니다.
S5_OPPOSITE_DIRECTION_VERIFY_EXIT=3
```

partner 누수를 분리하기 위해 삭제 완료 정상 상태에서 partner 대상 외 1건만 QA 표지로 만들었다.

```sql
WITH target AS (
  SELECT id FROM partners
  WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
    AND biz_no=partner_code
    AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
    AND created_at < TIMESTAMP '2026-08-10 01:24:14'
), chosen AS (
  SELECT p.id FROM partners p
  WHERE NOT p.is_deleted AND NOT EXISTS (SELECT 1 FROM target t WHERE t.id=p.id)
  ORDER BY p.partner_code LIMIT 1
)
UPDATE partners p
SET is_deleted=TRUE,deleted_at=clock_timestamp(),
    deleted_by='qa-residue-softdelete-2026-08-12',
    deleted_by_name='QA residue soft-delete'
FROM chosen c WHERE p.id=c.id;
```

```text
non_target_partner_marker=1
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: 대상 전표 total= 295  deleted-marker= 295  drift= 0  대상 외 표지= 0
slip_db: 대상 라인 total= 636  deleted-marker= 636  drift= 0  대상 외 표지= 0
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
PARTNER_NON_TARGET_ONLY_VERIFY_EXIT=0
PARTNER_NON_TARGET_ONLY_VALID_TOKEN_EXIT=0
partner_non_target_marker_left=1
```

partner 쪽은 대상 내부 1,000건만 집계하고 테이블 전체 대상 외 QA 표지를 세지 않으므로, 단독 오표지가 정상으로 오판되고 유효 토큰 복구도 실행되지 않는다.

## 8. 종료 코드와 운영자 구분

실행 원문:

```text
NORMAL_DELETED_VERIFY_EXIT=0
NORMAL_RESTORED_VERIFY_EXIT=0
S4_MULTI_NON_TARGET_VERIFY_EXIT=3
PREFLIGHT_FAILURE_EXIT=3
CONNECTION_FAILURE_EXIT=2
```

불일치와 사전검사는 모두 exit `3`이지만 콘솔 문구와 실행 파일로 구별된다.

```text
# verify SQL 상태 불일치
결과: 불일치 또는 부분 상태입니다.
복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.

# execute SQL 사전검사 실패
SELECT 999
예상치 불일치: partner 대상이 1,000행이 아니므로 실행하지 않습니다.
ROLLBACK
```

연결 실패 원문:

```powershell
docker exec -e PGPASSWORD=reconv5-only reconv5-1176-pg `
  psql -X -h 127.0.0.1 -p 6543 -U samhan -d postgres -c "SELECT 1;"
```

```text
psql: error: connection to server at "127.0.0.1", port 6543 failed: Connection refused
CONNECTION_FAILURE_EXIT=2
```

따라서 exit 숫자만 수집하는 자동화에서는 불일치와 사전검사를 구별할 수 없지만, 운영자가 원문 로그를 보면 위 한국어 문구로 구별할 수 있다.

## 9. 확인 토큰

상태 4에서 `--set=repair=restore`만 주고 confirm을 생략했다. exit `3`이었고 대상 외 표지는 전후 모두 3건이었다.

```text
S4_BEFORE_NO_TOKEN_NON_TARGET=3
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
S4_WITHOUT_CONFIRM_EXIT=3
S4_AFTER_NO_TOKEN_NON_TARGET=3
```

확인 토큰 없이 복구 UPDATE는 실행되지 않았다.

## 10. 라이브 QA

Browser 런타임 원문:

```text
No browser is available
[]
```

브라우저가 없으므로 과거 이미지 복사·합성을 하지 않았다. `docs/qa/2026-08-12-1176-reconv5/` 신규 PNG는 **0장**이며 화면 항목을 PASS로 판정하지 않는다.

## 11. 정적 회귀와 최종 판정

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/qa-residue/2026-08-12-fix4-regression.ps1
```

```text
FIX4_STATIC_RED_GREEN_PASS
FIX5_STATIC_REGRESSION_EXIT=0
```

**최종 판정: 실 사용자/운영자 경로로 재현 가능한 결함이 있다.** 정상 수량과 slip의 기본 대상/대상 외 집계는 동작하지만, partner 대상 외 표지, `deleted_at` 불변식, snapshot orphan 보정, hard-delete 후 복구 성공 판정에서 감지 또는 복구가 샌다.

## 12. 라운드 종료

- 공유 `samhan-postgres` 쓰기 `0건`; 모든 변경 재현은 `reconv5-1176-pg`에서만 수행했다.
- 복제는 custom dump 파일 경유였고 복제 직후 UTF8·한글 SELECT를 확인했다.
- 검증 종료 직전 advisory lock은 granted `0`, waiting `0`이었다.
- `reconv5-1176-pg` 컨테이너 `0건`, host `.qa-temp-reconv5-1176` 부재, 원본 격리 컨테이너 `/tmp/reconv5-*.dump` `0건`을 정리 후 확인했다.
- repo 파일 삭제 명령은 실행하지 않았다. git 명령 금지에 따라 index 조회는 하지 않았고, 작업 범위의 기존 추적 대상 SQL 3개·회귀 PowerShell 1개·fix5 보고서 1개가 모두 존재함을 다시 확인했다. 복구가 필요한 삭제 파일은 없었다. 필요 시 복구 명령은 사용자 규율대로 `git add -f`이다.
- 스크립트는 변경하지 않았고, 이번 라운드의 repo 변경은 본 보고서 1개뿐이다.
- Browser 부재에 따라 신규 QA PNG는 `0장`이다.
