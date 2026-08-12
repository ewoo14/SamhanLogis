# PR #1176 재수렴 2회차 — SOL 적대검증

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` / 사용자 제공 HEAD `4db840f99`
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다. 2건** — rollback과 soft-delete 실행 스크립트가 모두 사전검사 후의 동시 변경에 취약해 첫 DB만 커밋한다.
- 공유 DB 쓰기: **0건**. 공유 `samhan-postgres`에는 종료 시 SELECT만 수행했다.
- git 명령: **0회**. 구현·SQL 스크립트 변경: **0건**.

## 1. 격리 복제와 UTF-8

기존 격리 DB `sol1176-pg`에서 `pg_dump -Fc -f`로 컨테이너 내부 파일을 만들고, `docker cp`로 로컬 파일을 경유해 신규 `reconv2-1176-pg`에 `pg_restore`했다. `pg_dump | pg_restore` 파이프는 사용하지 않았다.

실행 명령:

```powershell
docker exec sol1176-pg pg_dump -U samhan -d partner_db -Fc -f /tmp/reconv2-partner.dump
docker exec sol1176-pg pg_dump -U samhan -d slip_db -Fc -f /tmp/reconv2-slip.dump
docker cp sol1176-pg:/tmp/reconv2-partner.dump "$env:TEMP\1176-reconv2\partner.dump"
docker cp sol1176-pg:/tmp/reconv2-slip.dump "$env:TEMP\1176-reconv2\slip.dump"
docker cp "$env:TEMP\1176-reconv2\partner.dump" reconv2-1176-pg:/tmp/partner.dump
docker cp "$env:TEMP\1176-reconv2\slip.dump" reconv2-1176-pg:/tmp/slip.dump
docker exec reconv2-1176-pg pg_restore -U samhan -d partner_db --no-owner --no-privileges /tmp/partner.dump
docker exec reconv2-1176-pg pg_restore -U samhan -d slip_db --no-owner --no-privileges /tmp/slip.dump
```

복제 직후 SELECT와 원문:

```sql
SELECT '복제 직후 한글 원문 확인' AS korean_text,
       current_setting('server_encoding') AS server_encoding,
       current_setting('client_encoding') AS client_encoding;
SELECT COUNT(*) AS marked_partners
FROM partners
WHERE is_deleted AND deleted_by='qa-residue-softdelete-2026-08-12';
```

```text
       korean_text        | server_encoding | client_encoding
--------------------------+-----------------+-----------------
 복제 직후 한글 원문 확인 | UTF8            | UTF8

 marked_partners
-----------------
            1000

 대상 | rows
------+------
 전표 |  295
 라인 |  636
```

## 2. [HIGH] rollback 사전검사 뒤 slip 변경 시 partner만 복구 커밋

### 재현 방법

스크립트는 수정하지 않았다. 별도 세션에서 표지 partner 1행에 row lock을 걸어 두고 원본 rollback 스크립트를 시작했다. partner/slip 사전검사가 모두 통과한 뒤 partner UPDATE가 실제 잠금 대기 중임을 `pg_stat_activity.wait_event_type='Lock'`으로 확인했다. 그때 다른 세션이 표지 slip 1행의 `deleted_by`를 변경하고 잠금 해제를 기다렸다.

잠금 SQL:

```sql
BEGIN;
SELECT id
FROM partners
WHERE is_deleted
  AND deleted_by='qa-residue-softdelete-2026-08-12'
ORDER BY id LIMIT 1 FOR UPDATE;
SELECT pg_sleep(15);
COMMIT;
```

동시 변경 SQL과 원문:

```sql
WITH target AS (
  SELECT id FROM slips
  WHERE is_deleted
    AND deleted_by='qa-residue-softdelete-2026-08-12'
  ORDER BY id LIMIT 1
)
UPDATE slips s
SET deleted_by='qa-adversarial-toctou'
FROM target t
WHERE s.id=t.id
RETURNING s.slip_no,s.is_deleted,s.deleted_by;
```

```text
PARTNER_UPDATE_BLOCKED=True
   slip_no    | is_deleted |      deleted_by
--------------+------------+-----------------------
 2026/03/24-1 | t          | qa-adversarial-toctou
UPDATE 1
DRIFT_EXIT=0
```

rollback 실행 원문:

```text
BEGIN
SELECT 1000
ROLLBACK
BEGIN
SELECT 295
SELECT 636
ROLLBACK
BEGIN
SELECT 1000
UPDATE 1000
partner_db rollback | 1000
COMMIT
BEGIN
SELECT 294
SELECT 636
예상치 불일치: slip_db 복구 표지가 전표 295행·라인 636행이 아니므로 롤백합니다.
ROLLBACK
psql:/tmp/rollback.sql:128: ERROR:  division by zero
TOCTOU_ROLLBACK_EXIT=3
```

실패 후 SELECT 원문:

```text
 partner_marker_left | partner_restored
---------------------+------------------
                   0 |             1000

 slip_marker_left | drift_slip_left
------------------+-----------------
              294 |               1

 line_marker_left
------------------
              636
```

사전검사와 실행 사이의 창은 고정된 짧은 구간이 아니다. 이번 실험에서는 `pg_sleep(15)` row lock 동안 실제로 열렸고 전체 재현은 18.6초였다. 운영 DB의 row lock·장기 트랜잭션만큼 늘어날 수 있다. 따라서 “양 DB 사전검사 후 실행”만으로는 부분 복구가 방지되지 않는다.

## 3. [HIGH] soft-delete 실행도 같은 TOCTOU에서 partner만 삭제 커밋

초기 복제본을 정상 rollback해 활성 상태로 만든 뒤, 같은 방식으로 partner 1행을 15초 잠갔다. 두 사전검사가 `partner 1000 / slip 295 / line 636`으로 통과하고 partner UPDATE가 잠금 대기 중일 때 대상 slip 1행을 다른 세션에서 soft-delete했다.

동시 변경 SQL:

```sql
WITH target AS (
  SELECT id FROM slips WHERE NOT is_deleted ORDER BY id LIMIT 1
)
UPDATE slips s
SET is_deleted=TRUE,
    deleted_at=CURRENT_TIMESTAMP,
    deleted_by='qa-adversarial-execute-toctou',
    deleted_by_name='QA adversarial'
FROM target t
WHERE s.id=t.id
RETURNING s.slip_no,s.is_deleted,s.deleted_by;
```

원문:

```text
EXECUTE_PARTNER_UPDATE_BLOCKED=True
   slip_no    | is_deleted |          deleted_by
--------------+------------+-------------------------------
 2026/03/24-1 | t          | qa-adversarial-execute-toctou
UPDATE 1
EXECUTE_DRIFT_EXIT=0

BEGIN
SELECT 1000
ROLLBACK
BEGIN
SELECT 646
SELECT 295
SELECT 636
ROLLBACK
BEGIN
SELECT 1000
UPDATE 1000
COMMIT
BEGIN
SELECT 294
SELECT 633
실행 직전 slip 표지가 변동되어 실행하지 않습니다.
ROLLBACK
psql:/tmp/execute.sql:137: ERROR:  division by zero
```

실패 후 원문:

```text
 partner_marked | partner_still_active
----------------+----------------------
           1000 |                    0

 script_marked | drift_marked
---------------+--------------
             0 |            1

 script_line_marked
--------------------
                  0
```

실행 스크립트도 사전검사 뒤 partner DB를 먼저 커밋하므로 같은 결함이 있다.

## 4. slip을 미리 실패시킨 고정 실패와 종료 코드

동시 변경이 아니라 **실행 전에** slip 표지를 1행 바꾼 경우에는 fix2 사전검사가 기대대로 partner UPDATE를 시작하지 않았다.

rollback 사전검사 실패 원문:

```text
SELECT 1000
ROLLBACK
SELECT 294
SELECT 636
예상치 불일치: slip 복구 표지가 전표 295행·라인 636행이 아니므로 실행하지 않습니다.
ROLLBACK
ROLLBACK_PREFLIGHT_EXIT=3

 partner_marker_left
---------------------
                1000
```

soft-delete 실행 사전검사 실패 원문:

```text
SELECT 1000
ROLLBACK
SELECT 646
SELECT 294
SELECT 633
예상치 불일치: slip 대상 전표 295행·라인 636행이 아니므로 실행하지 않습니다.
ROLLBACK
EXECUTE_PREFLIGHT_EXIT=3

 partner_active
----------------
           1000
```

연결 실패는 존재하지 않는 TCP port로 실제 초기 연결을 시도했다.

```powershell
docker exec -e PGPASSWORD=reconv2-only reconv2-1176-pg psql -X -h 127.0.0.1 -p 6543 -U samhan -d postgres -f /tmp/rollback.sql
echo $LASTEXITCODE
docker exec -e PGPASSWORD=reconv2-only reconv2-1176-pg psql -X -h 127.0.0.1 -p 6543 -U samhan -d postgres -f /tmp/execute.sql
echo $LASTEXITCODE
```

```text
psql: error: connection to server at "127.0.0.1", port 6543 failed: Connection refused
CONNECTION_REFUSED_EXIT=2
psql: error: connection to server at "127.0.0.1", port 6543 failed: Connection refused
EXECUTE_CONNECTION_REFUSED_EXIT=2
```

종료 코드 판정: 사전검사 실패 `3`, 실행 직전 가드 실패 `3`, 연결 실패 `2`, 정상 `0`으로 모두 비0/0 구분은 정직했다. 이번 라운드에서 종료 코드 거짓 결함은 재현되지 않았다.

## 5. 정상 경로와 대상 외 행

검증 전에 표지 ID를 별도 격리 검증 테이블에 고정했다.

```text
frozen_partner_ids | 1000
frozen_slip_ids    | 295
frozen_line_ids    | 636
```

정상 rollback 원문:

```text
UPDATE 1000
partner_db rollback | 1000
COMMIT
UPDATE 636
UPDATE 295
slip_db.slips rollback     | 295
slip_db.slip_lines rollback| 636
COMMIT
NORMAL_ROLLBACK_EXIT=0

 rows | fully_restored
------+----------------
 1000 |           1000

 대상  | rows | fully_restored
-------+------+----------------
 slips |  295 |            295
 lines |  636 |            636
```

`fully_restored`는 `NOT is_deleted`, `deleted_at IS NULL`, `deleted_by IS NULL`, 그리고 partner/slip의 `deleted_by_name IS NULL`을 모두 확인했다.

정상 soft-delete 재실행 원문:

```text
UPDATE 1000
COMMIT
UPDATE 636
UPDATE 295
COMMIT
NORMAL_EXECUTE_EXIT=0

 rows | fully_deleted
------+---------------
 1000 |          1000

 대상  | rows | fully_deleted
-------+------+---------------
 slips |  295 |           295
 lines |  636 |           636
```

대상 외 기존 soft-delete 행은 rollback 전후 행 수와 `to_jsonb(row)` 전체 지문이 같았다.

```text
partner 14   9633c54a06f3a22d55724086eafbb3bf -> 9633c54a06f3a22d55724086eafbb3bf
slips   2294 275f27e281197b543a734e575073d347 -> 275f27e281197b543a734e575073d347
lines   3048 a6e65ff408d08f6c9985fa005a847cd3 -> a6e65ff408d08f6c9985fa005a847cd3
```

## 6. 격리 라이브 QA

기존 격리 스택 `sol1176-*`의 복제 DB에 rollback을 실행한 뒤 slip-service를 healthy로 기동했다. 앱 내 Browser 런타임은 사용 가능한 브라우저가 0개여서, 저장소 Playwright 1.59.1 Chromium으로 동일 격리 URL을 캡처했다.

- 복구 거래처 `SOL1154R20-BULK-0001` 검색 노출
- 판매전표 목록 정상 렌더
- 삭제 전 404였던 복구 전표 `2026/01/01-1` 상세 정상 렌더
- 입금보고서 목록과 `2026/07/27-1` 상세의 `통장연계 / 취소 / 13,579` 정상 렌더
- 입출금 내역 계좌 화면 정상 렌더

화면 메뉴·필드·상태 라벨은 정상 한글이다. 일부 QA 상호·메모의 `?`는 복제 전 원본 데이터 값이다. 기존 격리 스택의 `/logs/front`, 버전·공지 503과 QA 거래처 원장 400은 관찰 원문에 남겼고 대상 화면 진입을 막지 않았다.

스크린샷 전 경로:

1. `docs/qa/2026-08-12-1176-reconv2/01-partners-list-restored.png`
2. `docs/qa/2026-08-12-1176-reconv2/02-partner-restored-search.png`
3. `docs/qa/2026-08-12-1176-reconv2/03-sales-slips-list-restored.png`
4. `docs/qa/2026-08-12-1176-reconv2/04-sales-slip-restored-detail.png`
5. `docs/qa/2026-08-12-1176-reconv2/05-cash-receipts-list.png`
6. `docs/qa/2026-08-12-1176-reconv2/06-cash-receipt-detail.png`
7. `docs/qa/2026-08-12-1176-reconv2/07-bank-transactions.png`
8. `docs/qa/2026-08-12-1176-reconv2/qa-observation.txt`

## 7. 라운드 종료 정리

라이브 QA 후 기존 격리 `sol1176-pg`에는 실행 스크립트를 다시 적용해 원래 표지 상태로 복원하고, 검증 전 중지 상태였던 slip-service를 다시 중지했다.

```text
SOL_STACK_RESTORE_EXIT=0
restored_original_partner_markers | 1000
restored_original_slip_markers    | 295
restored_original_line_markers    | 636
sol1176-slip-service|Exited (143)
```

공유 DB 종료 SELECT 원문:

```text
shared_partner_markers | 1000
shared_slip_markers    | 295
shared_line_markers    | 636
```

이번 라운드 생성 컨테이너·포트·임시 dump 정리 원문:

```text
RECONV2_CONTAINER_LEFT=0
RECONV2_TEMP_EXISTS=False
RECONV2_PORT_42342_LISTEN=0
```

git 명령 없이 worktree `.git` 포인터의 index v2를 직접 파싱해 추적 경로와 실제 파일을 대조했다.

```text
INDEX_SIGNATURE=DIRC INDEX_VERSION=2 TRACKED=19247 MISSING=0
```

삭제된 추적 파일은 없고, 임시 캡처 하네스 파일도 만들지 않았다. 보존 산출물은 본 보고서와 QA 스크린샷·관찰 파일뿐이다.

## 최종 판정

**실 사용자/운영자 경로로 재현 가능한 결함이 있다.** fix2의 고정 상태 사전검사는 slip이 이미 실패 상태이면 partner 커밋을 막지만, 사전검사 이후 partner 실행이 잠금 대기하는 동안 다른 세션이 slip 상태를 바꾸면 rollback과 soft-delete 실행 모두 partner DB만 커밋한다. 이미 공유 개발 DB에 적용된 soft-delete의 안전망으로는 원자성이 보장되지 않는다.
