# 공유 개발 DB QA 잔재 soft-delete 실행 보고서

작성일: 2026-08-12  
작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\wqares`  
실행 스크립트: `scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql`

## 실행 전 재계수

partner 재계수 SQL 원문:

```sql
SELECT COUNT(*) AS partner_active_target FROM partners WHERE NOT is_deleted AND partner_code ~ '^SOL1154R20-BULK-[0-9]+$' AND biz_no = partner_code AND created_at >= TIMESTAMP '2026-08-10 01:24:06' AND created_at < TIMESTAMP '2026-08-10 01:24:14';
```

출력 원문:

```text
 partner_active_target 
-----------------------
                  1000
(1 row)
```

slip 재계수 SQL 원문:

```sql
WITH qa_slip_line_candidates AS (SELECT l.id AS line_id, l.slip_id FROM slip_lines l WHERE NOT l.is_deleted AND ((l.created_by = 'system' AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336' AND TIMESTAMP '2026-05-09 16:59:33.901047') OR (l.created_by = 'system-internal' AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652' AND TIMESTAMP '2026-05-30 13:39:39.203576') OR l.product_id IN ('57dc63e2-43da-43e6-b73e-3c81822cf9a7','7de11ab7-e70c-421e-80a4-7c6b51a2c6e9','ed278526-0e16-427d-8a92-2ca06164254a'))), qa_slip_targets AS (SELECT DISTINCT s.id FROM slips s JOIN qa_slip_line_candidates c ON c.slip_id = s.id WHERE NOT s.is_deleted), qa_line_targets AS (SELECT l.id FROM slip_lines l JOIN qa_slip_targets s ON s.id = l.slip_id WHERE NOT l.is_deleted) SELECT (SELECT COUNT(*) FROM qa_slip_targets) AS slip_active_target, (SELECT COUNT(*) FROM qa_line_targets) AS line_active_target, (SELECT COALESCE(SUM(l.line_total),0) FROM slip_lines l WHERE NOT l.is_deleted) AS active_line_amount;
```

출력 원문:

```text
 slip_active_target | line_active_target | active_line_amount 
--------------------+--------------------+--------------------
                295 |                636 |      1154100392.00
(1 row)
```

예상치 `partner 1,000 · slip active 295 · line active 636`와 일치하여 실행을 진행했다.

## 승인 스크립트 실행 원문 출력

실행 파일은 수정하지 않고 `scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql` 그대로 실행했다.

```text
You are now connected to database "partner_db" as user "samhan".
BEGIN
SELECT 1000
          measure           | rows 
----------------------------+------
 partner_db.partners before | 1000
(1 row)

UPDATE 1000
          measure          | rows 
---------------------------+------
 partner_db.partners after | 1000
(1 row)

COMMIT
You are now connected to database "slip_db" as user "samhan".
BEGIN
SELECT 646
SELECT 295
SELECT 636
       measure        | rows 
----------------------+------
 slip_db.slips before |  295
(1 row)

          measure          | rows 
---------------------------+------
 slip_db.slip_lines before |  636
(1 row)

UPDATE 636
UPDATE 295
       measure       | rows 
---------------------+------
 slip_db.slips after |  295
(1 row)

         measure          | rows 
--------------------------+------
 slip_db.slip_lines after |  636
(1 row)

COMMIT
```

건수 불일치 가드는 불일치 분기에 들어가지 않았고, 일치 분기에서 `COMMIT`까지 정상 진행됐다. 불일치 입력을 만들기 위해 승인 스크립트를 수정하거나 재실행하지는 않았다.

## 실행 후 복구 표지 확인

복구 표지 SELECT 원문:

```sql
SELECT deleted_by, is_deleted, COUNT(*) AS rows FROM partners WHERE deleted_by = 'qa-residue-softdelete-2026-08-12' GROUP BY deleted_by, is_deleted ORDER BY is_deleted;
SELECT deleted_by, is_deleted, COUNT(*) AS rows FROM slips WHERE deleted_by = 'qa-residue-softdelete-2026-08-12' GROUP BY deleted_by, is_deleted ORDER BY is_deleted;
SELECT deleted_by, is_deleted, COUNT(*) AS rows FROM slip_lines WHERE deleted_by = 'qa-residue-softdelete-2026-08-12' GROUP BY deleted_by, is_deleted ORDER BY is_deleted;
```

출력 원문:

```text
            deleted_by            | is_deleted | rows 
----------------------------------+------------+------
 qa-residue-softdelete-2026-08-12 | t          | 1000
(1 row)

            deleted_by            | is_deleted | rows 
----------------------------------+------------+------
 qa-residue-softdelete-2026-08-12 | t          |  295
(1 row)

            deleted_by            | is_deleted | rows 
----------------------------------+------------+------
 qa-residue-softdelete-2026-08-12 | t          |  636
(1 row)
```

복구 표지로 partner 1,000건, slip 295건, line 636건이 정확히 다시 잡혔다. 되돌림 SQL은 실행하지 않았다.

## 금액 검증

사후 금액 SQL 원문:

```sql
SELECT COALESCE(SUM(line_total),0) AS active_line_amount FROM slip_lines WHERE NOT is_deleted;
```

출력 원문:

```text
 active_line_amount 
--------------------
       112318573.00
(1 row)
```

실행 전 `1,154,100,392.00원`에서 실행 후 `112,318,573.00원`으로 내려갔다. 요청된 기대치 `111,287,573원`과는 `1,031,000원` 차이가 있으므로 금액 검증은 기대치와 불일치한다.

## 회계 영향 재확인

실행 후 `accounting_db` 7경로 확인 출력 원문:

```text
                      reference                      | count 
-----------------------------------------------------+-------
 cash_disbursements.slip_no                          |     0
 cash_receipts.slip_no                               |     2
 journals.source_ref_id                              |     0
 purchase_accounting_slip_allocations.source_slip_id |     0
 purchase_accounting_slips.slip_no                   |     0
 sales_accounting_slip_allocations.source_slip_id    |     0
 sales_accounting_slips.slip_no                      |     0
(7 rows)
```

6개 경로는 0건이지만 `cash_receipts.slip_no` 2건이 남아 있어, 7경로 전체 0건 기대와 불일치한다.

해당 2건 확인 SELECT 출력 원문:

```text
                  id                  |   slip_no    |  amount   | transaction_date |      kind      |              memo               | is_deleted |              deleted_by              
--------------------------------------+--------------+-----------+------------------+----------------+---------------------------------+------------+--------------------------------------
 45960645-bed7-44ba-af89-f57287a3adac | 2026/07/27-1 |  13579.00 | 2026-07-27       | BANK_LINKED    |                                 | f          | 
 e0d4c6cf-fc78-4456-8677-e3969bd2a141 | 2026/07/27-2 | 330000.00 | 2026-07-27       | MANUAL_RECEIPT | #937-RC3B-cashreceipt-throwaway | t          | a0000000-0000-0000-0000-000000000001
(2 rows)
```

회계 행은 변경하지 않았다.

## 운영 안전

- `DELETE`, `TRUNCATE`, `DROP`은 실행하지 않았다.
- partner, slip header, slip line의 `is_deleted` 계열 soft-delete만 승인 스크립트로 실행했다.
- 감사로그·개정이력·코멘트·제안·배차연결은 실행 대상으로 포함하지 않았다.
- 서비스 및 컨테이너를 재시작하지 않았다.
- 복구 스크립트는 실행하지 않았다.
