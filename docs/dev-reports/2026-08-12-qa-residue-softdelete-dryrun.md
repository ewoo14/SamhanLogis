# 공유 개발 DB QA 잔재 soft-delete dry-run 보고서

작성일: 2026-08-12  
범위: `partner_db.partners` BULK 잔재와 `slip_db` 끊긴 상품 참조 전표  
실행 원칙: 아래 조사는 SELECT만 실행했다. soft-delete 실행 SQL과 복구 SQL은 작성만 했고 실행하지 않았다.

## 결론

- `partner_db.partners`: 근거 문서의 BULK 판별식이 정확히 1,000행을 잡았다.
- `slip_db`: 근거 문서의 끊긴 상품 참조 판별식이 active line 646행, distinct slip 304건, 그중 active header 295건을 잡았다.
- active 후보 295건의 active line 전체는 636건이다. 이미 soft-delete된 line 291건을 포함한 후보 헤더 전체 line 수는 927건이다. 실행 대상은 현재 active인 헤더 295건과 그 헤더의 active line 636건이다.
- 상태는 DRAFT 148, SAVED 14, SENT 10, ACCEPTED 12, PROCESSING 11, COMPLETED 14, INSPECTING 4, CONFIRMED 7, DELIVERED 10, SHIPPING 5, REJECTED 5, CANCELED 55다.
- `accounting_db`에서 후보 전표를 직접 참조하는 journals, 매입/매출 회계전표, allocation, 입출금 전표는 모두 0건이었다.
- 실 업무 데이터로 확정되는 행은 확인하지 못했다. 다만 표본의 Stage 2 시드에는 삼성·LG·현대 등 실제 회사명처럼 보이는 이름이 포함되어 있어, 실행 전 개발책임자가 이 표본을 QA 시드로 재확인해야 한다. 표본의 `created_by`, 정확한 생성 시각, `[Stage 2 시드]` 메모는 QA 시드와 일치한다.
- `created_by` 또는 `modified_by` 오탐 표지는 조사 SQL, 실행 SQL, 복구 SQL 어디에도 사용하지 않았다.

## 산출물

- 실행 SQL: [2026-08-12-soft-delete-qa-residue.sql](../../scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql)
- 되돌림 SQL: [2026-08-12-rollback-soft-delete-qa-residue.sql](../../scripts/qa-residue/2026-08-12-rollback-soft-delete-qa-residue.sql)

실행 SQL은 각 DB 트랜잭션에서 사전 건수를 확인하고, partner 1,000 / slip 295 / active line 636과 다르면 중단·롤백한다. soft-delete 표시는 `is_deleted`, `deleted_at`, `deleted_by`를 갱신하며, 전표 헤더의 `deleted_by_name`도 함께 기록한다. 복구 SQL은 이 실행의 고유 `deleted_by` 표지만 대상으로 삼는다.

## 1. partner 대상 확인

실행 SQL 원문:

```sql
SELECT COUNT(*) AS bulk_rows,
       COUNT(*) FILTER (WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$') AS exact_regex_rows,
       COUNT(DISTINCT partner_code) AS distinct_codes,
       COUNT(*) FILTER (WHERE biz_no=partner_code) AS biz_no_equals_code,
       MIN((regexp_match(partner_code,'^SOL1154R20-BULK-([0-9]+)$'))[1]::int) AS min_suffix,
       MAX((regexp_match(partner_code,'^SOL1154R20-BULK-([0-9]+)$'))[1]::int) AS max_suffix
FROM partners
WHERE partner_code LIKE 'SOL1154R20-BULK-%';
```

원문 출력:

```text
 bulk_rows | exact_regex_rows | distinct_codes | biz_no_equals_code | min_suffix | max_suffix 
-----------+------------------+----------------+--------------------+------------+------------
      1000 |             1000 |           1000 |               1000 |          1 |       1000
(1 row)
```

dry-run 표본 SQL 원문:

```sql
SELECT partner_code,name,status,created_at,is_deleted
FROM partners
WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
  AND biz_no=partner_code
  AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
  AND created_at < TIMESTAMP '2026-08-10 01:24:14'
ORDER BY partner_code LIMIT 20;
```

원문 출력:

```text
     partner_code     |       name       | status |         created_at         | is_deleted 
----------------------+------------------+--------+----------------------------+------------
 SOL1154R20-BULK-0001 | R20 대량 보류 1  | ACTIVE | 2026-08-10 01:24:06.871321 | f
 SOL1154R20-BULK-0002 | R20 대량 보류 2  | ACTIVE | 2026-08-10 01:24:07.026975 | f
 SOL1154R20-BULK-0003 | R20 대량 보류 3  | ACTIVE | 2026-08-10 01:24:07.037711 | f
 SOL1154R20-BULK-0004 | R20 대량 보류 4  | ACTIVE | 2026-08-10 01:24:07.047806 | f
 SOL1154R20-BULK-0005 | R20 대량 보류 5  | ACTIVE | 2026-08-10 01:24:07.060448 | f
 SOL1154R20-BULK-0006 | R20 대량 보류 6  | ACTIVE | 2026-08-10 01:24:07.070339 | f
 SOL1154R20-BULK-0007 | R20 대량 보류 7  | ACTIVE | 2026-08-10 01:24:07.079815 | f
 SOL1154R20-BULK-0008 | R20 대량 보류 8  | ACTIVE | 2026-08-10 01:24:07.088601 | f
 SOL1154R20-BULK-0009 | R20 대량 보류 9  | ACTIVE | 2026-08-10 01:24:07.097337 | f
 SOL1154R20-BULK-0010 | R20 대량 보류 10 | ACTIVE | 2026-08-10 01:24:07.106526 | f
 SOL1154R20-BULK-0011 | R20 대량 보류 11 | ACTIVE | 2026-08-10 01:24:07.11578  | f
 SOL1154R20-BULK-0012 | R20 대량 보류 12 | ACTIVE | 2026-08-10 01:24:07.124811 | f
 SOL1154R20-BULK-0013 | R20 대량 보류 13 | ACTIVE | 2026-08-10 01:24:07.13335  | f
 SOL1154R20-BULK-0014 | R20 대량 보류 14 | ACTIVE | 2026-08-10 01:24:07.141557 | f
 SOL1154R20-BULK-0015 | R20 대량 보류 15 | ACTIVE | 2026-08-10 01:24:07.150673 | f
 SOL1154R20-BULK-0016 | R20 대량 보류 16 | ACTIVE | 2026-08-10 01:24:07.160096 | f
 SOL1154R20-BULK-0017 | R20 대량 보류 17 | ACTIVE | 2026-08-10 01:24:07.168971 | f
 SOL1154R20-BULK-0018 | R20 대량 보류 18 | ACTIVE | 2026-08-10 01:24:07.177061 | f
 SOL1154R20-BULK-0019 | R20 대량 보류 19 | ACTIVE | 2026-08-10 01:24:07.185327 | f
 SOL1154R20-BULK-0020 | R20 대량 보류 20 | ACTIVE | 2026-08-10 01:24:07.193707 | f
(20 rows)
```

판정: 표본은 전부 `R20 대량 보류 N`, ACTIVE, 대상 생성 시각창이다. 49행의 ECOUNT 가능 거래처와 modified 표지 행은 대상에 포함하지 않았다.

## 2. slip 대상 확인

판별식 원문:

```sql
NOT l.is_deleted AND (
  (l.created_by='system' AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336' AND TIMESTAMP '2026-05-09 16:59:33.901047')
  OR (l.created_by='system-internal' AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652' AND TIMESTAMP '2026-05-30 13:39:39.203575')
  OR l.product_id IN (
    '57dc63e2-43da-43e6-b73e-3c81822cf9a7',
    '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9',
    'ed278526-0e16-427d-8a92-2ca06164254a'
  )
)
```

원문 출력:

```text
 candidate_lines | candidate_slips | active_candidate_slips 
-----------------+-----------------+------------------------
             646 |             304 |                    295
(1 row)
```

active 후보 헤더에 연결된 라인 수 확인 원문:

```text
 all_lines_on_active_candidates | active_lines_on_active_candidates | deleted_lines_on_active_candidates 
--------------------------------+------------------------------------+-------------------------------------
                            927 |                                636 |                                 291
(1 row)
```

전표 표본 SQL 원문:

```sql
WITH candidate_lines AS (SELECT l.* FROM slip_lines l WHERE NOT l.is_deleted AND ((l.created_by='system' AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336' AND TIMESTAMP '2026-05-09 16:59:33.901047') OR (l.created_by='system-internal' AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652' AND TIMESTAMP '2026-05-30 13:39:39.203575') OR l.product_id IN ('57dc63e2-43da-43e6-b73e-3c81822cf9a7','7de11ab7-e70c-421e-80a4-7c6b51a2c6e9','ed278526-0e16-427d-8a92-2ca06164254a')))
SELECT s.slip_no,s.status,s.slip_type,s.slip_date,COALESCE(SUM(l.line_total),0) AS candidate_line_amount,COUNT(l.id) AS candidate_lines
FROM slips s JOIN candidate_lines l ON l.slip_id=s.id
WHERE NOT s.is_deleted
GROUP BY s.id ORDER BY s.created_at,s.slip_no LIMIT 30;
```

원문 출력:

```text
   slip_no    |   status   | slip_type | slip_date  | candidate_line_amount | candidate_lines 
--------------+------------+-----------+------------+-----------------------+----------------
 2026/01/01-1 | SENT       | OUTBOUND  | 2026-01-01 |             109000.00 |               1
 2026/01/02-1 | SENT       | OUTBOUND  | 2026-01-02 |             985000.00 |               2
 2026/01/03-1 | DRAFT      | OUTBOUND  | 2026-01-03 |            3408000.00 |               3
 2026/01/04-1 | DRAFT      | OUTBOUND  | 2026-01-04 |            8158000.00 |               4
 2026/01/05-1 | DRAFT      | OUTBOUND  | 2026-01-05 |           15998000.00 |               5
 2026/01/06-1 | SAVED      | OUTBOUND  | 2026-01-06 |            2754000.00 |               1
 2026/01/07-1 | SAVED      | OUTBOUND  | 2026-01-07 |            8160000.00 |               2
 2026/01/08-1 | SAVED      | OUTBOUND  | 2026-01-08 |           17016000.00 |               3
 2026/01/09-1 | SAVED      | OUTBOUND  | 2026-01-09 |           15236000.00 |               4
 2026/01/10-1 | SAVED      | OUTBOUND  | 2026-01-10 |           15656000.00 |               5
 2026/01/11-1 | SAVED      | OUTBOUND  | 2026-01-11 |             808000.00 |               1
 2026/01/12-1 | SAVED      | OUTBOUND  | 2026-01-12 |            4475000.00 |               2
 2026/01/13-1 | SAVED      | OUTBOUND  | 2026-01-13 |           11784000.00 |               3
 2026/01/14-1 | SENT       | OUTBOUND  | 2026-01-14 |           16528000.00 |               4
 2026/01/15-1 | SENT       | OUTBOUND  | 2026-01-15 |           10505000.00 |               5
 2026/01/16-1 | SENT       | OUTBOUND  | 2026-01-16 |             954000.00 |               1
 2026/01/17-1 | SENT       | OUTBOUND  | 2026-01-17 |            3675000.00 |               2
 2026/01/18-1 | ACCEPTED   | OUTBOUND  | 2026-01-18 |            8943000.00 |               3
 2026/01/19-1 | ACCEPTED   | OUTBOUND  | 2026-01-19 |            8658000.00 |               4
 2026/01/20-1 | ACCEPTED   | OUTBOUND  | 2026-01-20 |            9671000.00 |               5
 2026/01/21-1 | ACCEPTED   | OUTBOUND  | 2026-01-21 |             508000.00 |               1
 2026/01/22-1 | PROCESSING | OUTBOUND  | 2026-01-22 |            2980000.00 |               2
 2026/01/23-1 | PROCESSING | OUTBOUND  | 2026-01-23 |            8196000.00 |               3
 2026/01/24-1 | PROCESSING | OUTBOUND  | 2026-01-24 |           16936000.00 |               4
 2026/01/25-1 | PROCESSING | OUTBOUND  | 2026-01-25 |           29956000.00 |               5
 2026/01/26-1 | COMPLETED  | OUTBOUND  | 2026-01-26 |            5142000.00 |               1
 2026/01/27-1 | INSPECTING  | OUTBOUND  | 2026-01-27 |           14145000.00 |               2
 2026/01/28-1 | INSPECTING  | OUTBOUND  | 2026-01-28 |           27789000.00 |               3
 2026/01/29-1 | INSPECTING  | OUTBOUND  | 2026-01-29 |           21020000.00 |               4
 2026/01/30-1 | COMPLETED  | OUTBOUND  | 2026-01-30 |            3680000.00 |               5
(30 rows)
```

### 상태별 건수·금액

금액은 판별식에 잡힌 active line의 `line_total` 합계다.

```text
   status   | slips |    amount    
------------+-------+--------------
 ACCEPTED   |    12 | 161071000.00
 COMPLETED  |    14 | 106750000.00
 CONFIRMED  |     7 |  87872000.00
 DELIVERED  |    10 |  97132000.00
 DRAFT      |   148 |  70490000.00
 INSPECTING |     4 |  68696000.00
 PROCESSING |    11 | 123354000.00
 REJECTED   |     5 |  73448000.00
 SAVED      |    14 | 111377000.00
 SENT       |    10 |  65459000.00
 SHIPPING   |     5 |  62549000.00
 CANCELED   |    55 |  13583819.00
(12 rows)
```

### 실 업무 데이터 혼입 점검

`system` 생성 표본 30건은 `거래처-P-2026-0001` 등과 `[Stage 2 시드] 프로젝트=삼성 강남점 ...` 같은 실재 기업명 유사 텍스트를 포함한다. 그러나 전표는 정확한 QA 생성 시각창 안에 있고 `created_by=system`이다. 나머지 137건의 `a0000000-0000-0000-0000-000000000003` 전표는 QA797 계열이다. 현재 증거로 실제 업무 데이터 혼입은 확인되지 않았지만, 이 30건은 실행 직전 사람 눈으로 재확인할 명시적 위험 표본이다.

## 3. 자식·참조 영향

`slip_db` 후보 active header 295건에 직접 연결된 현재 행 수:

```text
         table_name          | rows 
-----------------------------+------
 dispatch_vehicle_group_slip |    4
 slip_audit_logs              |   86
 slip_collab_comments         |    3
 slip_collab_suggestions      |    7
 slip_lines                   |  927
 slip_publish_audit           |    3
 slip_revisions               |  291
 slips                        |  295
(8 rows)
```

`slip_lines` 927건 중 현재 active는 636건, 이미 soft-delete된 것은 291건이다. 실행 SQL은 active 636건만 갱신한다. 위 자식 행은 부모의 soft-delete로 DB 물리 FK가 끊기지는 않지만, 부모를 active 조건으로 조회하는 화면에서는 고아처럼 보일 수 있으므로 후속 자식 보존 정책은 별도 검토가 필요하다.

`accounting_db` cross-DB 논리 참조 확인 원문 출력:

```text
           reference           | count 
-------------------------------+-------
 cash_disbursements.slip_no    |     0
 cash_receipts.slip_no         |     0
 journals.source_ref_id        |     0
 purchase_alloc.source_slip_id |     0
 purchase_slip.slip_no         |     0
 sales_alloc.source_slip_id    |     0
 sales_slip.slip_no            |     0
(7 rows)
```

판정: 현재 회계 분개·매입/매출 회계전표의 참조는 확인되지 않았다. 다만 soft-delete 이후 회계 서비스가 전표 존재 여부를 active 플래그와 무관하게 조회하는 계약이 있는지는 별도 애플리케이션 검증 대상이다.

## 실행 보류 및 안전장치

- 이 라운드에서는 실행 SQL을 호출하지 않았다. `docker exec`로 보낸 것은 모두 SELECT였다.
- 서비스/컨테이너 재시작은 하지 않았다.
- 실행 파일은 DB별 트랜잭션, 사전·사후 건수 출력, 예상치 불일치 시 롤백, 고유 복구 표지를 포함한다.
- 실제 실행은 라이브 QA 2건 종료 후 개발책임자의 후속 trigger에서만 진행한다.
