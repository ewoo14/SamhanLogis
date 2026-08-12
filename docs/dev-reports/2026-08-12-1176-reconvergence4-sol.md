# PR #1176 재수렴 4회차 — SOL 운영 경로 검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` / 사용자 지정 HEAD `3a3ed5cd8`
- 질문: **실 사용자/운영자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다. 점검 SQL이 slip 대상 집합을 검증하지 않고 테이블 전체 표지 총계만 비교해, 대상 누락과 대상 외 오표지가 서로 보정되면 부분 상태를 정상으로 오판한다.**
- 공유 DB 쓰기: `0건`
- git 명령: `0회`
- 스크립트 변경: `0건`

## 1. 격리 복제와 증거 무결성

기존 격리본 `sol1176-pg`를 원본으로 사용했다. dump는 custom format 파일로 만들고 host 파일을 거쳐 신규 `reconv4-1176-pg`에 복원했다. 파이프는 사용하지 않았다.

```powershell
docker exec -e PGPASSWORD=sol1176-only sol1176-pg pg_dump -U samhan -d partner_db -Fc -f /tmp/reconv4-partner.dump
docker exec -e PGPASSWORD=sol1176-only sol1176-pg pg_dump -U samhan -d slip_db -Fc -f /tmp/reconv4-slip.dump
docker cp sol1176-pg:/tmp/reconv4-partner.dump ".qa-temp-reconv4-1176\partner.dump"
docker cp sol1176-pg:/tmp/reconv4-slip.dump ".qa-temp-reconv4-1176\slip.dump"
docker cp ".qa-temp-reconv4-1176\partner.dump" reconv4-1176-pg:/tmp/partner.dump
docker cp ".qa-temp-reconv4-1176\slip.dump" reconv4-1176-pg:/tmp/slip.dump
docker exec -e PGPASSWORD=reconv4-only reconv4-1176-pg pg_restore -U samhan -d partner_db --no-owner --no-privileges /tmp/partner.dump
docker exec -e PGPASSWORD=reconv4-only reconv4-1176-pg pg_restore -U samhan -d slip_db --no-owner --no-privileges /tmp/slip.dump
```

복제 직후 한글 SELECT 원문:

```text
 server_encoding | client_encoding |        korean_text
-----------------+-----------------+----------------------------
 UTF8            | UTF8            | 복제 직후 한글 SELECT 확인
(1 row)
```

초기 상태와 점검 결과:

```text
partner_total | partner_marked | partner_restored
--------------+----------------+-----------------
         1000 |           1000 |                0

slip_marked | line_marked
------------+------------
        295 |         636

결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
BASE_DELETED_VERIFY_EXIT=0
```

## 2. 요구된 5개 부분 상태

각 상태는 격리본을 완전 복구한 뒤 정상 soft-delete SQL로 다시 `1000 / 295 / 636` 상태를 만든 독립 사이클에서 재현했다. 상태 3과 2, 상태 4와 1은 최종 행 상태는 같지만, 요청대로 단독 복구 전이를 별도로 다시 수행했다.

사용한 점검 명령:

```powershell
docker exec -e PGPASSWORD=reconv4-only reconv4-1176-pg `
  psql -X -U samhan -d postgres -f /tmp/verify.sql
```

| 번호 | 만든 상태 | 점검 원문 핵심 | 종료 코드 | 판정 |
|---:|---|---|---:|---|
| 1 | partner만 삭제, slip 미삭제 | `partner deleted=1000`, `slips=0`, `lines=0` | 3 | 감지 |
| 2 | slip만 삭제, partner 미삭제 | `partner restored=1000`, `slips=295`, `lines=636` | 3 | 감지 |
| 3 | partner만 복구, slip 삭제 유지 | `partner restored=1000`, `slips=295`, `lines=636` | 3 | 감지 |
| 4 | slip만 복구, partner 삭제 유지 | `partner deleted=1000`, `slips=0`, `lines=0` | 3 | 감지 |
| 5 | 대상 라인 636 삭제, 헤더 0 삭제 | `partner restored=1000`, `slips=0`, `lines=636` | 3 | 감지 |

종료 코드 원문:

```text
S1_PARTNER_ONLY_DELETED_EXIT=3
S2_SLIP_ONLY_DELETED_EXIT=3
S3_PARTNER_ONLY_RESTORED_EXIT=3
S4_SLIP_ONLY_RESTORED_EXIT=3
S5_CORRECTED_EXIT=3
```

5번을 만든 SQL은 실제 execute SQL과 같은 대상 전표 집합을 먼저 구한 뒤, 그 전표들의 활성 라인만 갱신했다.

```sql
WITH target_slips AS (
  SELECT DISTINCT s.id
  FROM slips s JOIN slip_lines l ON l.slip_id=s.id
  WHERE NOT s.is_deleted AND NOT l.is_deleted
    AND (
      (l.created_by='system' AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336' AND TIMESTAMP '2026-05-09 16:59:33.901047')
      OR (l.created_by='system-internal' AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652' AND TIMESTAMP '2026-05-30 13:39:39.203576')
      OR l.product_id IN ('57dc63e2-43da-43e6-b73e-3c81822cf9a7','7de11ab7-e70c-421e-80a4-7c6b51a2c6e9','ed278526-0e16-427d-8a92-2ca06164254a')
    )
), target_lines AS (
  SELECT l.id FROM slip_lines l JOIN target_slips s ON s.id=l.slip_id WHERE NOT l.is_deleted
)
UPDATE slip_lines l
SET is_deleted=true, deleted_at=clock_timestamp(), deleted_by='qa-residue-softdelete-2026-08-12'
FROM target_lines t WHERE l.id=t.id;
```

원문:

```text
UPDATE 636
lines_marked | headers_marked
-------------+---------------
         636 |              0

slip_db: slips deleted-marker= 0
slip_db: lines deleted-marker= 636
결과: 불일치 또는 부분 상태입니다.
S5_CORRECTED_EXIT=3
```

## 3. 재현 결함 — 총계가 보정되면 부분 상태를 정상으로 오판

### 원인

점검 SQL의 slip 쪽 조회는 대상 전표/라인 조건을 재구성하지 않는다. 두 테이블 전체에서 `deleted_by` 표지 개수만 센다.

```sql
SELECT COUNT(*) FILTER (WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12') AS slips_deleted,
       COUNT(*) AS slips_marker_scope
FROM slips;
SELECT COUNT(*) FILTER (WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12') AS lines_deleted
FROM slip_lines;
```

`slips_marker_scope`도 판정에 사용되지 않는다. 따라서 대상 전표 1건의 표지가 다른 값으로 드리프트한 동시에 대상 외 전표 1건이 QA 표지를 얻으면, 총계는 295로 유지된다.

### 재현 SQL

완전 삭제 상태에서 대상 전표 1건의 표지를 변경하고, 활성 대상 외 전표 1건에 QA 표지를 붙였다.

```sql
WITH drift_target AS (
  SELECT id FROM slips
  WHERE is_deleted AND deleted_by='qa-residue-softdelete-2026-08-12'
  ORDER BY slip_no LIMIT 1
)
UPDATE slips s
SET deleted_by='qa-reconv4-compensated-drift', deleted_by_name='reconv4 drift'
FROM drift_target t WHERE s.id=t.id
RETURNING s.slip_no,s.is_deleted,s.deleted_by;

WITH replacement AS (
  SELECT id FROM slips WHERE NOT is_deleted ORDER BY slip_no LIMIT 1
)
UPDATE slips s
SET is_deleted=true, deleted_at=clock_timestamp(),
    deleted_by='qa-residue-softdelete-2026-08-12', deleted_by_name='QA residue soft-delete'
FROM replacement r WHERE s.id=r.id
RETURNING s.slip_no,s.is_deleted,s.deleted_by;
```

실제 대상/대상 외 집계를 별도로 계산한 원문:

```text
target_marker | target_drift | non_target_marker | table_marker
--------------+--------------+-------------------+-------------
          294 |            1 |                 1 |          295
```

그러나 점검 SQL 원문은 다음과 같았다.

```text
partner_db: total= 1000  deleted= 1000  restored= 0  other= 0
slip_db: slips deleted-marker= 295
slip_db: lines deleted-marker= 636
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
COMPENSATED_PARTIAL_VERIFY_EXIT=0
```

유효한 복구 토큰을 함께 주어도 먼저 `matched` 분기로 들어가 복구가 실행되지 않았다.

```powershell
docker exec -e PGPASSWORD=reconv4-only reconv4-1176-pg `
  psql -X --set=repair=restore `
  --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 `
  -U samhan -d postgres -f /tmp/verify.sql
```

```text
결과: 양쪽 상태가 일치합니다. 자동 복구 없음.
COMPENSATED_VALID_TOKEN_EXIT=0

drift_left | marker_left
-----------+------------
         1 |         295
```

즉, fix4의 핵심인 감지·복구 경로에서 실제 부분 상태가 감지되지 않고, 확인형 복구도 실행되지 않는 운영 결함이다.

## 4. 확인 토큰과 종료 코드

상태 5(`headers=0`, `lines=636`)에서 `repair=restore`만 주고 토큰을 생략했다.

```text
복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.
REPAIR_WITHOUT_CONFIRM_EXIT=3
lines_after_no_token | headers_after_no_token
---------------------+-----------------------
                 636 |                      0
```

잘못된 토큰에서도 partner 1,000행은 그대로 삭제 상태였다.

```text
WRONG_CONFIRM_TOKEN_EXIT=3
partner_still_deleted
---------------------
                 1000
```

정확한 토큰을 준 확인형 복구는 `UPDATE 1000`, exit `0`이었고 재점검도 exit `0`이었다.

```text
VALID_CONFIRM_REPAIR_EXIT=0
POST_REPAIR_NORMAL_EXIT=0
```

종료 코드 구분 원문:

```text
BASE_DELETED_VERIFY_EXIT=0
NORMAL_RESTORED_VERIFY_EXIT=0
S5_CORRECTED_EXIT=3
PREFLIGHT_FAILURE_EXIT=3
CONNECTION_FAILURE_EXIT=2
```

사전검사 실패는 대상 partner 1행을 격리본에서 별도 표지로 바꿔 활성 대상이 999행이 되게 한 뒤 execute SQL을 실행했다.

```text
SELECT 999
예상치 불일치: partner 대상이 1,000행이 아니므로 실행하지 않습니다.
ROLLBACK
PREFLIGHT_FAILURE_EXIT=3
```

연결 실패 원문:

```powershell
docker exec -e PGPASSWORD=reconv4-only reconv4-1176-pg `
  psql -X -h 127.0.0.1 -p 6543 -U samhan -d postgres -c "SELECT 1;"
```

```text
psql: error: connection to server at "127.0.0.1", port 6543 failed: Connection refused
CONNECTION_FAILURE_EXIT=2
```

## 5. TCP 단절 뒤 xact lock의 실제 차단 시간

격리 network에서 한 backend가 대상 partner 1행을 잠그고 15초 sleep했다. 두 번째 client는 transaction을 열고 xact advisory lock을 획득한 뒤 같은 행 UPDATE에서 대기하게 했다. 두 번째 client container를 kill하고 1초 뒤 조회한 원문:

```text
pid | application_name            | state  | wait_event_type | wait_event    | mode          | granted
----+-----------------------------+--------+-----------------+---------------+---------------+--------
571 | reconv4-disconnect-writer   | active | Lock            | transactionid | ExclusiveLock | t
```

그 즉시 같은 advisory lock을 얻는 정상 경로를 실행했다.

```text
NORMAL_LOCK_WAIT_MS=12231
NORMAL_LOCK_EXIT=0
```

즉, 이 재현에서는 정상 실행이 **12.231초** 실제 차단됐다. 행 잠금 보유 transaction이 끝난 뒤 단절 backend가 진행·종료하면서 xact lock이 해제됐고, 마지막 잠금 집계는 다음과 같았다.

```text
granted_advisory_locks | waiting_advisory_locks
-----------------------+-----------------------
                     0 |                      0
```

따라서 fix4 문서의 한계는 관찰 가능한 운영 지연이다. xact lock은 transaction 종료에는 맞춰 해제되지만, TCP 단절 자체가 transaction 종료를 즉시 보장하지 않는다.

## 6. 정상 복구와 대상 외 무접촉

완전 복구 상태에서 정상 execute와 rollback을 연속 실행했다.

```text
FINAL_NORMAL_EXECUTE_EXIT=0
FINAL_NORMAL_ROLLBACK_EXIT=0

partner_db rollback | 1000
slip_db.slips rollback | 295
slip_db.slip_lines rollback | 636
```

삭제 필드를 제외한 대상 payload와 대상 외 전체 row JSON을 실행 전·복구 후 각각 정렬해 MD5로 비교했다.

```text
PARTNER_PAYLOAD_NONTARGET_EQUAL=True
SLIP_LINE_PAYLOAD_NONTARGET_EQUAL=True

PARTNER_BEFORE=5b960cc7ffc02e352fc7c9d8732ee9fe|977a619c3f272dac1496676a59bbb48f
PARTNER_AFTER =5b960cc7ffc02e352fc7c9d8732ee9fe|977a619c3f272dac1496676a59bbb48f

SLIP_BEFORE=884f784c8240f29a46d279ec30c8b62e|e6c6622771107685642df892f395d583|e6b41059948af2017444c3d1a0f94ce0|6d0dff8b04942101a47ee769973e22cb
SLIP_AFTER =884f784c8240f29a46d279ec30c8b62e|e6c6622771107685642df892f395d583|e6b41059948af2017444c3d1a0f94ce0|6d0dff8b04942101a47ee769973e22cb
```

정상 경로는 요청 수량 `partner 1,000 / slip 295 / line 636`을 복구했고, 비교 대상 외 row hash는 변하지 않았다.

## 7. 라이브 QA

Browser 런타임 선택 결과:

```text
No browser is available
```

문제 해결 절차에 따라 browser 목록을 한 번 조회한 결과도 다음과 같았다.

```text
[]
```

따라서 거래처 목록, 판매전표 목록/상세, 회계 입출금 화면은 이번 라운드에서 열 수 없었다. 과거 이미지 복사·합성은 하지 않았고 `docs/qa/2026-08-12-1176-reconv4/`의 신규 스크린샷은 **0장**이다. 화면 항목은 PASS로 판정하지 않는다.

## 8. 최종 판정

**실 사용자/운영자 경로로 재현 가능한 결함이 있다.**

점검 SQL은 단순한 DB 간 불일치와 `라인 636 / 헤더 0` 상태를 잡지만, slip 대상 집합 자체를 검증하지 않는다. 대상 누락과 대상 외 오표지가 총계를 보정하면 exit `0`으로 정상 오판하고, 유효한 복구 토큰을 준 운영자도 복구를 수행할 수 없다. 막는 대신 감지·복구로 전환한 fix4의 핵심 경로에서 감지가 새는 결함이다.

## 9. 라운드 종료

- 공유 `samhan-postgres`에는 쓰지 않았다.
- 격리 복제는 파일 경유였고 복제 직후 UTF8·한글 SELECT를 확인했다.
- 스크립트는 변경하지 않았다.
- 작업 중 파일 삭제 명령은 격리 임시 자원 정리에만 사용했고 repo 파일 삭제 명령은 실행하지 않았다. git 명령 금지에 따라 index 기반 확인은 하지 않았으며, 검증 대상 SQL 4개와 회귀 PowerShell 1개가 모두 존재하는 것은 재확인했다.
- 정리 직전 격리 DB의 이번 라운드 표지는 partner/slip/line 모두 0건, advisory lock도 granted/waiting 모두 0건이었다.
- `reconv4-1176-*` container `0건`, network `0건`, `.qa-temp-reconv4-1176` 부재를 정리 후 확인했다.
- Browser 부재에 따라 QA PNG는 `0장`이다.
- 정적 회귀는 Windows PowerShell 새 프로세스로 다시 실행해 다음 유효한 원문을 얻었다.

```text
FIX4_STATIC_RED_GREEN_PASS
FIX4_STATIC_FRESH_EXIT=0
```
