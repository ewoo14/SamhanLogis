# PR #1176 재수렴 3회차 — SOL 운영 경로 검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` / 사용자 지정 HEAD `1a5070367`
- 질문: **실 사용자/운영자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다. HIGH 2건**
- 공유 DB 쓰기: **0건**. 공유 `samhan-postgres`에는 쓰지 않았다.
- git 명령: **0회**
- 스크립트 변경: **0건**

## 1. 격리 복제와 한글 증거

기존 격리본 `sol1176-pg`에서 custom-format dump 파일을 만든 뒤 호스트 파일을 경유하여 신규 `reconv3-1176-pg`에 복원했다. 파이프는 사용하지 않았다.

```powershell
docker exec sol1176-pg pg_dump -U samhan -d partner_db -Fc -f /tmp/reconv3-partner.dump
docker exec sol1176-pg pg_dump -U samhan -d slip_db -Fc -f /tmp/reconv3-slip.dump
docker cp sol1176-pg:/tmp/reconv3-partner.dump ".qa-temp-reconv3-1176\partner.dump"
docker cp sol1176-pg:/tmp/reconv3-slip.dump ".qa-temp-reconv3-1176\slip.dump"
docker cp ".qa-temp-reconv3-1176\partner.dump" reconv3-1176-pg:/tmp/partner.dump
docker cp ".qa-temp-reconv3-1176\slip.dump" reconv3-1176-pg:/tmp/slip.dump
docker exec reconv3-1176-pg pg_restore -U samhan -d partner_db --no-owner --no-privileges /tmp/partner.dump
docker exec reconv3-1176-pg pg_restore -U samhan -d slip_db --no-owner --no-privileges /tmp/slip.dump
```

복제 직후 SELECT 원문:

```text
        korean_text         | server_encoding | client_encoding
----------------------------+-----------------+-----------------
 복제 직후 한글 SELECT 확인 | UTF8            | UTF8

 partner_marked
----------------
           1000

 slip_marked
-------------
         295

 line_marked
-------------
         636
```

## 2. [HIGH] 같은 lock 계약 writer도 두 DB 사이 경쟁 창을 닫지 못함

### 원인

스크립트는 `\connect partner_db`와 `\connect slip_db`를 반복한다. `psql`의 `\connect`는 기존 DB 연결을 닫고 새 연결을 만들므로 세션 advisory lock도 그때 해제된다. 또한 PostgreSQL advisory lock은 database OID가 포함된 DB별 잠금 공간이다. 따라서 partner 단계가 같은 key를 보유해도 slip DB의 같은 key를 보호하지 못한다.

### 실재현

partner 대상 1행에 row lock을 걸어 rollback의 partner UPDATE를 대기시켰다.

```sql
BEGIN;
SELECT id
FROM partners
WHERE is_deleted
  AND deleted_by='qa-residue-softdelete-2026-08-12'
ORDER BY id LIMIT 1 FOR UPDATE;
SELECT pg_sleep(25);
COMMIT;
```

rollback이 대기하는 동안 경쟁 writer는 **동일한 lock 계약**을 지키며 slip DB에서 같은 key를 획득한 뒤 1행을 변경했다.

```sql
SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12')) AS same_contract_lock;
WITH target AS (
  SELECT id FROM slips
  WHERE is_deleted
    AND deleted_by='qa-residue-softdelete-2026-08-12'
  ORDER BY id LIMIT 1
)
UPDATE slips s
SET deleted_by='qa-reconv3-same-contract-writer'
FROM target t
WHERE s.id=t.id
RETURNING s.slip_no,s.is_deleted,s.deleted_by;
SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12')) AS same_contract_unlock;
```

원문:

```text
ROLLBACK_PARTNER_UPDATE_BLOCKED=True

 same_contract_lock
--------------------

   slip_no    | is_deleted |           deleted_by
--------------+------------+---------------------------------
 2026/03/24-1 | t          | qa-reconv3-same-contract-writer
UPDATE 1

 same_contract_unlock
----------------------
 t
```

rollback 결과와 종료 코드 원문:

```text
partner_db rollback | 1000
COMMIT

SELECT 294
SELECT 636
예상치 불일치: slip_db 복구 표지가 전표 295행·라인 636행이 아니므로 롤백합니다.
ROLLBACK
psql:/tmp/rollback.sql:140: ERROR:  division by zero
ROLLBACK_SAME_CONTRACT_RACE_EXIT=3

 partner_restored | partner_marker_left
------------------+---------------------
             1000 |                   0

 slip_marker_left | same_contract_drift
------------------+---------------------
              294 |                   1

 line_marker_left
------------------
              636
```

운영자가 동일 스크립트 계약을 준수해도 partner 1,000행만 먼저 커밋되는 부분 복구가 발생한다. fix3의 명시 한계보다 좁은 조건에서도 직렬화가 깨진다.

## 3. [HIGH] 연결 단절 시 대기 중 backend가 세션 잠금을 보유해 정상 경로를 차단함

partner 대상 1행을 별도 세션에서 잠근 뒤, 계약 writer가 advisory lock을 획득하고 그 행 UPDATE에서 대기하게 했다. 그 다음 writer client 컨테이너를 강제 종료해 연결을 끊었다.

```powershell
docker run -d --name reconv3-1176-netclient --network reconv3-1176-net `
  -e PGPASSWORD=reconv3-only -e PGAPPNAME=reconv3-disconnect-writer `
  postgres:16-alpine psql -X -h reconv3-1176-pg -U samhan -d partner_db `
  -c "SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12')); UPDATE partners SET deleted_by_name='blocked-writer' WHERE id=(SELECT id FROM partners WHERE is_deleted AND deleted_by='qa-residue-softdelete-2026-08-12' ORDER BY id LIMIT 1); SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));"
docker kill reconv3-1176-netclient
```

연결 단절 3초 후 원문:

```text
DISCONNECT_WRITER_BACKEND_PID=658
THREE_SECONDS_AFTER_CLIENT_KILL
 pid |     application_name      | state  | wait_event_type |  wait_event   | granted
-----+---------------------------+--------+-----------------+---------------+---------
 658 | reconv3-disconnect-writer | active | Lock            | transactionid | t

 normal_path_can_lock
----------------------
 f
```

client가 사라졌어도 PostgreSQL backend가 기존 행 잠금 대기에서 연결 단절을 아직 감지하지 못해 session advisory lock을 계속 보유했다. 그동안 정상 rollback/execute도 같은 lock에서 대기한다. 운영자가 터미널·컨테이너·네트워크를 비정상 종료하는 실제 경로에서 잔여 잠금으로 정상 작업이 막힐 수 있다.

backend를 명시 종료하면 잠금은 정리됐다.

```sql
SELECT pg_terminate_backend(658) AS terminate_disconnected_backend;
SELECT COUNT(*) FILTER(WHERE granted) AS granted_locks,
       COUNT(*) FILTER(WHERE NOT granted) AS waiting_locks
FROM pg_locks WHERE locktype='advisory';
```

```text
 terminate_disconnected_backend
--------------------------------
 t

 granted_locks | waiting_locks
---------------+---------------
             0 |             0
```

예외 자체로 `psql` 연결이 정상 종료되는 경로에서는 잠금 0건이었다.

```text
UNEXPECTED_EXCEPTION_EXIT=1
ERROR:  division by zero
advisory_locks_left | 0
```

따라서 “모든 비정상 종료에서 고아 잠금이 영구 잔존”하는 결함은 아니다. 문제는 연결 단절을 server backend가 즉시 감지하지 못하는 행 잠금 대기 구간이며, 이 구간에서는 정상 경로가 실제 차단된다.

## 4. 정상 경로·대상 보존·종료 코드

오염된 중간 시험 DB는 폐기하고 dump에서 다시 복원했다. 대상 ID와 삭제 필드 이외 payload, 대상 외 전체 row JSON 지문을 사전에 고정한 뒤 정상 rollback을 실행했다.

```text
NORMAL_ROLLBACK_EXIT=0

 rows | fully_restored | nondelete_payload_preserved
------+----------------+-----------------------------
 1000 |           1000 |                        1000

 non_target_changed
--------------------
                  0

 entity | rows | fully_restored | nondelete_payload_preserved
--------+------+----------------+-----------------------------
 slips  |  295 |            295 |                         295
 lines  |  636 |            636 |                         636

 entity | non_target_changed
--------+--------------------
 slips  |                  0
 lines  |                  0
```

`fully_restored`는 partner/slip의 `is_deleted=false`, `deleted_at/deleted_by/deleted_by_name=NULL`, line의 `is_deleted=false`, `deleted_at/deleted_by=NULL`을 모두 뜻한다. 삭제 필드 외 payload도 전 행 동일하며 대상 외 변경은 0행이다.

정상 soft-delete 재실행:

```text
NORMAL_EXECUTE_EXIT=0
partner_marked | 1000
slip_marked    | 295
line_marked    | 636
```

종료 코드 원문:

```text
NORMAL_ROLLBACK_EXIT=0
NORMAL_EXECUTE_EXIT=0

PREFLIGHT_FAILURE_EXIT=3
psql:/tmp/execute.sql:24: ERROR:  division by zero

CONNECTION_FAILURE_EXIT=2
psql: error: connection to server at "127.0.0.1", port 6543 failed: Connection refused
```

종료 코드 계약은 정상 `0`, 사전검사 실패 `3`, 최초 연결 실패 `2`로 정직했다.

## 5. lock 계약을 모르는 운영 writer

서비스/JPA 및 기존 운영 SQL 경로는 이 일회성 key를 획득하지 않는다. PostgreSQL advisory lock은 행 잠금이 아니므로 이들 writer를 강제 차단하지 않는다. 다만 본 라운드에서는 더 강한 결함, 즉 **같은 계약을 지킨 writer도 DB가 다르면 통과하는 현상**을 실제 재현했으므로 비계약 writer 가정 없이도 결함이 확정된다.

## 6. 격리 라이브 QA와 증거 무결성

`sol1176-pg` 격리 DB를 rollback하고 `sol1176-slip-service`, `sol1176-partner-service`를 재기동해 healthy 상태까지 만들었다. 공유 DB에는 쓰지 않았다.

```text
SOL_QA_ROLLBACK_EXIT=0
/sol1176-slip-service healthy
/sol1176-partner-service healthy
```

그러나 제공된 in-app Browser 조회 결과가 `No browser is available`, browser 목록 `[]`여서 이번 라운드의 실제 화면을 새로 열거나 캡처할 수 없었다. 이전 라운드 이미지를 복사하거나 합성하면 이번 실행 증거가 아니므로 증거 무결성 원칙에 따라 하지 않았다.

따라서 요청 경로 `docs/qa/2026-08-12-1176-reconv3/` 아래 신규 스크린샷은 **0장**이며 나열할 경로도 없다. 거래처 목록·판매전표 목록/상세·회계 입출금의 이번 라운드 시각 증거는 미확보다. 이 항목을 PASS로 판정하지 않는다.

## 7. 최종 판정

**실 사용자/운영자 경로로 재현 가능한 결함이 있다.**

1. **HIGH** — 같은 advisory-lock 계약 writer도 partner/slip DB 사이에서는 직렬화되지 않아 partner 1,000행 부분 커밋 후 slip 실패가 재현된다.
2. **HIGH** — 행 잠금 대기 중 client 연결이 비정상 단절되면 server backend가 살아 있는 동안 session advisory lock이 남아 정상 실행을 차단한다.

정상 단독 실행의 복구 정확성, 대상 외 무접촉, 종료 코드 계약은 유지된다.

## 8. 라운드 종료 정리

라이브 QA에 사용한 `sol1176-pg`는 원래 soft-delete 표지 상태로 재적용했고 slip service는 다시 중지했다.

```text
SOL_STACK_RESTORE_EXIT=0
restored_original_partner_markers | 1000
restored_original_slip_markers    | 295
restored_original_line_markers    | 636
sol1176-slip-service|Exited (143)
```

이번 라운드 전용 자원은 모두 정리했다.

```text
RECONV3_CONTAINER_LEFT=0
RECONV3_NETWORK_LEFT=0
RECONV3_TEMP_EXISTS=False
RECONV3_PORT_42343_LISTEN=0
```
