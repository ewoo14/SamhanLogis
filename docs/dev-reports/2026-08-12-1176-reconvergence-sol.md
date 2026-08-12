# PR #1176 재수렴 적대검증 — SOL

- 일시: 2026-08-12
- 대상: `chore/qa-residue-softdelete` HEAD `56f2ed069` (사용자 제공 기준, git 명령 미사용)
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다. 2건** — `[HIGH]` 가드 실패 시 DB 간 부분 복구, `[MEDIUM]` 실행 스크립트 재실행 가드가 종료 코드 0을 반환한다.
- 증거 무결성 예외: fix1 보고서의 되돌림 재실행 종료 코드 `1` 주장은 실제 PostgreSQL 16 `psql` 출력 `3`과 불일치한다.
- 공유 DB 쓰기: **0건**. 모든 UPDATE/rollback/fault injection은 격리 PostgreSQL에서만 수행했다.
- 집계: **passed 8 / skipped 0 / failed 3**

## 1. 격리 복제와 UTF-8

기존 격리 복제본 `sol1176-pg`에서 `pg_dump -Fc -f`로 파일 dump를 만들고, 로컬 파일을 경유해 신규 `reconv1176-pg`에 `pg_restore`했다. `pg_dump | pg_restore` PowerShell 파이프는 사용하지 않았다.

복제 직후 원문:

```text
       korean_text        | server_encoding | client_encoding
--------------------------+-----------------+-----------------
 복제 직후 한글 원문 확인 | UTF8            | UTF8
(1 row)

 marked_partners
-----------------
            1000

 marked_slips
--------------
          295

 marked_lines
--------------
          636
```

QA 잔재의 일부 상호·메모에는 소스 격리 DB부터 `?` 바이트가 저장돼 있었다. 복제 후 화면의 메뉴·필드·상태 라벨은 정상 한글로 렌더링됐고, 소스 데이터의 기존 `?`는 복제 인코딩 결함으로 오인하지 않았다.

## 2. 되돌림 본 실행 — 값까지 원상 복구 (PASS)

검증 전에 표지 ID를 별도 검증 테이블로 고정했다.

```text
 frozen_partner_ids
--------------------
               1000

 frozen_slip_ids | frozen_line_ids
-----------------+-----------------
             295 |             636
```

실행 원문:

```text
You are now connected to database "partner_db" as user "samhan".
BEGIN
SELECT 1000
UPDATE 1000
       measure       | rows
---------------------+------
 partner_db rollback | 1000
COMMIT
You are now connected to database "slip_db" as user "samhan".
BEGIN
SELECT 295
SELECT 636
UPDATE 636
UPDATE 295
        measure         | rows
------------------------+------
 slip_db.slips rollback |  295
           measure           | rows
-----------------------------+------
 slip_db.slip_lines rollback |  636
COMMIT
ROLLBACK_EXIT=0
```

고정 ID 전체의 삭제 필드 확인 원문:

```text
         measure         | rows | fully_restored | hash
-------------------------+------+----------------+----------------------------------
 partner_frozen_restored | 1000 |           1000 | 4a6cb9f24b2403c27b7bd1c2c3b641c6
 slip_frozen_restored    |  295 |            295 | 9b37416f771fb9ee9f63d49936b284ce
 line_frozen_restored    |  636 |            636 | 3960c82b3f4e5f62be2d653bf9f55960
```

`fully_restored` 판별식은 다음 값을 모두 확인했다.

```sql
NOT is_deleted
AND deleted_at IS NULL
AND deleted_by IS NULL
-- partners/slips
AND deleted_by_name IS NULL
```

건수만 복구된 반쪽 상태는 없었다.

## 3. 대상 외 기존 soft-delete 보존 (PASS)

되돌림 전 기존 삭제행 집합:

```text
partner 14   hash 49a1d8bf346895fbf999e9504a578489
slip 2294    hash 3d4769e81b4037110a7377b6631f55d4
line 3048    hash e920d872c87cedf8cd6e080239923067
```

되돌림 후 원문:

```text
partner_preexisting_deleted_after |   14 | 49a1d8bf346895fbf999e9504a578489
slip_preexisting_deleted_after    | 2294 | 3d4769e81b4037110a7377b6631f55d4
line_preexisting_deleted_after    | 3048 | e920d872c87cedf8cd6e080239923067
```

`deleted_by IS DISTINCT FROM 'qa-residue-softdelete-2026-08-12'`인 기존 삭제행은 행 수와 `to_jsonb(row)` 전체 지문이 모두 동일했다. 대상 외 행을 되살리지 않았다.

## 4. 멱등성

### 4.1 되돌림 재실행 — 데이터 무변경 및 비0 종료 (PASS), 정확한 종료 코드 증거 불일치 (FAIL-EVIDENCE)

```text
BEGIN
SELECT 0
예상치 불일치: partner_db 복구 표지가 1,000행이 아니므로 롤백합니다.
ROLLBACK
psql:/tmp/rollback.sql:34: ERROR:  division by zero
ROLLBACK_RERUN_EXIT=3
```

재실행 전후 전체 테이블 지문:

```text
partners cb0f6f40d338dbcb82e5f17294e130b1 -> cb0f6f40d338dbcb82e5f17294e130b1
slips    86825b2e5af20c0dd6762675d4dd961a -> 86825b2e5af20c0dd6762675d4dd961a
lines    d58dc3af36dc2c79320e24d79c08befd -> d58dc3af36dc2c79320e24d79c08befd
```

데이터 멱등성은 통과했고 실패도 비0으로 전달됐다. 단 fix1 보고서의 `프로세스 종료 코드는 1`과 달리 이 환경의 PostgreSQL 16 `psql` 실제 종료 코드는 `3`이다. 이는 허용된 **증거 무결성** 지적이다.

### 4.2 soft-delete 실행 스크립트 재실행 — ROLLBACK되지만 성공 종료 (FAIL)

이미 표지가 붙은 상태에서 `2026-08-12-soft-delete-qa-residue.sql`을 다시 실행했다.

```text
BEGIN
SELECT 0
예상치 불일치: partner 대상이 1,000행이 아니므로 롤백합니다.
ROLLBACK
EXECUTE_RERUN_EXIT=0
psql:/tmp/execute.sql:27: warning: \quit: extra argument "1" ignored
```

전후 전체 지문은 동일해 데이터 변경은 없었다.

```text
partners 8c33fa95a426bddced7609792c025982 -> 8c33fa95a426bddced7609792c025982
slips    522561617bedb3f5020e4463a99a74fd -> 522561617bedb3f5020e4463a99a74fd
lines    44c0a72caf0e59a8c34c961376a2565e -> 44c0a72caf0e59a8c34c961376a2565e
```

그러나 운영자나 자동화는 가드 실패를 성공으로 받는다. `\quit 1`은 이 `psql`에서 상태 코드 인자를 받지 않아 실패 전달이 되지 않는다. 재실행 안전 경로의 실사용 결함이다.

## 5. [HIGH] slip 가드 실패 시 partner만 먼저 커밋되는 부분 복구 (FAIL)

실제 공유 상태를 바꾸지 않고, 격리 복제본에서 표지 전표 1건의 `deleted_by`만 다른 값으로 바꿔 드리프트를 재현했다.

```sql
WITH target AS (
  SELECT id FROM slips
  WHERE is_deleted
    AND deleted_by='qa-residue-softdelete-2026-08-12'
  ORDER BY id LIMIT 1
)
UPDATE slips s
SET deleted_by='qa-adversarial-drift'
FROM target t
WHERE s.id=t.id;
```

실행 원문:

```text
slip_no     | is_deleted | deleted_by
------------+------------+---------------------
2026/03/24-1| t          | qa-adversarial-drift

partner_db:
SELECT 1000
UPDATE 1000
partner_db rollback | 1000
COMMIT

slip_db:
SELECT 294
SELECT 636
예상치 불일치: slip_db 복구 표지가 전표 295행·라인 636행이 아니므로 롤백합니다.
ROLLBACK
DRIFT_ROLLBACK_EXIT=3
```

실패 후 상태:

```text
partner_marker_left | partner_restored
--------------------+-----------------
                  0 |             1000

slip_marker_left | drift_slip_still_deleted
-----------------+-------------------------
             294 |                        1

line_marker_left
----------------
             636
```

slip 가드는 자기 DB 트랜잭션만 롤백한다. 앞서 커밋한 `partner_db` 1,000행은 되돌리지 못해 거래처만 살아나고 전표·라인은 삭제 상태로 남는다. 카운트 드리프트가 발생한 실제 복구 실행 경로에서 부분 원복을 만드는 `[HIGH]` 결함이다.

## 6. 복구 후 라이브 화면 (PASS)

기존 격리 스택 `sol1176-*`의 복제 DB에 되돌림을 실행한 뒤 gateway/auth/partner/slip/accounting 등 대상 서비스를 healthy로 확인했다. 앱 내 Browser는 연결 가능한 브라우저가 0개라 사용할 수 없었고, 동일 격리 URL을 프로젝트 Playwright Chromium 1.59.1로 직접 캡처했다.

- 거래처 목록: `SOL1154R20-BULK-0001` 검색 결과 노출
- 판매전표 목록: 정상 렌더
- 복구 판매전표 상세: 이전 404였던 `/sales/3f924f59-8f83-4be8-a297-363468da92c2`가 `2026/01/01-1`로 정상 렌더
- 입금보고서 목록/검색: `2026/07/27-1` 노출
- 입금보고서 상세: 통장연계·취소·금액 `13,579` 정상 렌더
- 입출금 내역: 계좌 선택과 빈 거래 목록 정상 렌더

배경 진단 API의 기존 503(`/logs/front`, 버전/공지)와 QA 거래처 코드의 원장 400은 관찰 원문에 남겼다. 복구 대상 목록/상세 진입을 막지는 않았고, 이번 rollback 변경으로 새로 생긴 오류로 판정하지 않았다.

스크린샷 전 경로:

1. `docs/qa/2026-08-12-1176-reconv/01-partners-list-restored.png`
2. `docs/qa/2026-08-12-1176-reconv/02-partner-restored-search.png`
3. `docs/qa/2026-08-12-1176-reconv/03-sales-slips-list-restored.png`
4. `docs/qa/2026-08-12-1176-reconv/04-sales-slip-restored-detail.png`
5. `docs/qa/2026-08-12-1176-reconv/05-cash-receipts-list.png`
6. `docs/qa/2026-08-12-1176-reconv/06-cash-receipt-search.png`
7. `docs/qa/2026-08-12-1176-reconv/07-cash-receipt-detail.png`
8. `docs/qa/2026-08-12-1176-reconv/08-bank-transactions.png`
9. `docs/qa/2026-08-12-1176-reconv/qa-observation.txt`

## 7. 종료 정리

- 기존 `sol1176-pg`는 캡처 전 dump로 되돌려 표지 `partner 1000 / slip 295 / line 636`을 복구했다.
- 검증 전 실행 중이던 `sol1176-partner-service`는 다시 healthy, 검증 전 중지 상태였던 `sol1176-slip-service`는 다시 중지 상태로 맞췄다.
- 이번 라운드 생성 컨테이너 `reconv1176-pg`: 제거.
- 신규 host port `42332`: listener 0.
- 임시 dump 디렉터리 `C:\Users\user\AppData\Local\Temp\reconv1176`: 제거.
- 임시 Playwright 하네스: 제거. QA 증거와 본 보고서만 보존.
- 공유 `samhan-postgres`: 쓰기·되돌림 실행 없음.
- git 명령: 0회.

정리 원문:

```text
restored_original_partner_markers | 1000
restored_original_slip_markers    | 295
restored_original_line_markers    | 636
PARTNER_RESTORED_HEALTH=healthy
RECONV_CONTAINER_LEFT=0
RECONV_TEMP_EXISTS=False
RECONV_PORT_LISTEN=0
sol1176-slip-service|Exited (143)
sol1176-partner-service|Up (...) (healthy)
```

삭제된 추적 파일 여부는 git 명령 없이 worktree index v2를 직접 읽어 실제 파일과 대조했다.

```text
INDEX_VERSION=2 TRACKED=19235 MISSING=0
TEMP_HARNESS_EXISTS=False
SCREENSHOT_COUNT=8
```

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다.** 정상 건수에서는 값과 대상 범위가 정확히 복구되지만, 어느 한 DB의 표지 건수가 드리프트하면 앞 DB가 이미 커밋되어 부분 복구가 발생한다. 또한 soft-delete 실행 스크립트 재실행 가드는 ROLLBACK 후 종료 코드 0을 반환해 실패를 성공으로 보고한다.
