# 2026-08-12 공유 DB QA 잔재 식별 조사

## 조사 원칙

- 조사 시각 기준 현재 PC의 `samhan-postgres` 공유 개발 DB를 직접 측정한다.
- DB SQL은 `SELECT`만 실행한다. 데이터 변경, DDL, 서비스 재시작, 로그인 화면 접근은 하지 않는다.
- 식별과 오탐 위험 분석까지만 수행하며 삭제 후보를 실제로 삭제하지 않는다.
- 자격 값은 보고서에 기록하지 않는다.

## 1차 측정 — 공유 PostgreSQL 컨테이너 상태

실행 명령:

```text
docker ps --filter "name=samhan-postgres" --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"
```

원문 출력:

```text
samhan-postgres	Up 6 hours (healthy)	0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
```

판정: 조사 대상 컨테이너는 현재 실행 중이며 healthy 상태다. 이 명령은 컨테이너 상태만 읽었고 변경을 수행하지 않았다.

## 2차 측정 — 접속 전제와 DB 목록

`infrastructure/.env.local`의 키 이름을 값 없이 확인한 결과 PostgreSQL 접속 키는 없고 QA 화면 로그인용 키만 존재했다. 따라서 비밀번호를 추정하거나 출력하지 않았으며, 컨테이너 설정에서 `POSTGRES_USER`와 기본 DB 이름만 메모리 변수로 읽어 컨테이너 내부 로컬 소켓의 `psql`에 전달했다. 비밀번호는 읽지 않았다.

실행 SQL:

```sql
SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname;
```

원문 출력:

```text
           datname           
-----------------------------
 accounting_db
 arologis_db
 auth_db
 dashboard_db
 dc_config_db
 groupware_db
 inventory_db
 logging_db
 migration_db
 notification_db
 partner_auth_db
 partner_db
 partner_order_db
 postgres
 product_db
 slip_db
 slip_db_qa_e2estimate
 sol951_2ra_20260727_1420utc
 sol951_r2_6897d36597
 user_db
(20 rows)
```

판정: 이번 조사의 직접 대상인 `partner_db`, `slip_db`가 모두 존재한다. 별도로 `slip_db_qa_e2estimate` 및 SOL 명칭의 DB 2개도 존재하지만, 사용자 지정 공유 14-service DB의 직접 잔재 측정은 우선 `partner_db`와 `slip_db`에서 수행한다.

## 3차 측정 — `partner_db` 1차 범위

실행 SQL 1:

```sql
SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name;
```

원문 출력 1:

```text
 table_schema |         table_name         
--------------+----------------------------
 public       | blocked_partners
 public       | flyway_schema_history
 public       | partner_attachments
 public       | partner_audit_logs
 public       | partner_contacts
 public       | partner_credit_history
 public       | partner_edit_requests
 public       | partner_price_discounts
 public       | partner_revisions
 public       | partner_shipping_addresses
 public       | partners
 staging      | ecount_partner_raw
(12 rows)
```

실행 SQL 2:

```sql
SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='partners' ORDER BY tc.table_schema,tc.table_name,kcu.column_name;
```

원문 출력 2:

```text
 table_schema |       table_name       | column_name | referenced_table | referenced_column 
--------------+------------------------+-------------+------------------+-------------------
 public       | partner_attachments    | partner_id  | partners         | id
 public       | partner_credit_history | partner_id  | partners         | id
(2 rows)
```

실행 SQL 3:

```sql
SELECT COUNT(*) AS all_partners, COUNT(*) FILTER (WHERE to_jsonb(p)::text LIKE '%SOL1154R20-BULK-%') AS bulk_any_column, COUNT(*) FILTER (WHERE lower(to_jsonb(p)::text) LIKE '%sol-pr1154-r1%') AS pr1154_any_column FROM partners p;
```

원문 출력 3:

```text
 all_partners | bulk_any_column | pr1154_any_column 
--------------+-----------------+-------------------
         8323 |            1000 |              7252
(1 row)
```

중간 판정: 알려진 `SOL1154R20-BULK-` 계열은 현재 1,000행으로 과거 수치 1,001행과 일치하지 않는다. `sol-pr1154-r1` 단순 포함식은 7,252행을 잡으므로 그대로는 삭제 판별식으로 절대 사용할 수 없다. 열별 원인을 추가 측정한다.

### 열별 문자열 위치

실행 SQL 4:

```sql
SELECT e.key AS column_name, COUNT(DISTINCT p.id) AS matching_rows, COUNT(DISTINCT e.value) AS distinct_values FROM partners p CROSS JOIN LATERAL jsonb_each_text(to_jsonb(p)) e WHERE e.value LIKE '%SOL1154R20-BULK-%' GROUP BY e.key ORDER BY e.key;
```

원문 출력 4:

```text
 column_name  | matching_rows | distinct_values 
--------------+---------------+-----------------
 biz_no       |          1000 |            1000
 partner_code |          1000 |            1000
(2 rows)
```

실행 SQL 5:

```sql
SELECT e.key AS column_name, COUNT(DISTINCT p.id) AS matching_rows, COUNT(DISTINCT e.value) AS distinct_values FROM partners p CROSS JOIN LATERAL jsonb_each_text(to_jsonb(p)) e WHERE lower(e.value) LIKE '%sol-pr1154-r1%' GROUP BY e.key ORDER BY e.key;
```

원문 출력 5:

```text
 column_name | matching_rows | distinct_values 
-------------+---------------+-----------------
 created_by  |            49 |               1
 modified_by |          7252 |               1
(2 rows)
```

실행 SQL 6:

```sql
SELECT e.key AS column_name, e.value, COUNT(DISTINCT p.id) AS matching_rows FROM partners p CROSS JOIN LATERAL jsonb_each_text(to_jsonb(p)) e WHERE lower(e.value) LIKE '%sol-pr1154-r1%' GROUP BY e.key,e.value ORDER BY e.key,matching_rows DESC,e.value LIMIT 100;
```

원문 출력 6:

```text
 column_name |     value     | matching_rows 
-------------+---------------+---------------
 created_by  | sol-pr1154-r1 |            49
 modified_by | sol-pr1154-r1 |          7252
(2 rows)
```

중간 판정: `sol-pr1154-r1`은 열에 따라 의미가 완전히 다르다. 후보 판별식은 `created_by = 'sol-pr1154-r1'`(49행)로 한정해야 한다. `modified_by = 'sol-pr1154-r1'`은 7,252행을 포괄하므로 오탐 위험 때문에 삭제 판별식에서 제외해야 한다.

### 후보군 프로필과 즉시 확인된 오탐

실행 SQL 7:

```sql
SELECT 'bulk_partner_code_prefix' AS rule, COUNT(*) AS rows, COUNT(*) FILTER (WHERE is_deleted) AS already_soft_deleted, MIN(created_at) AS min_created_at, MAX(created_at) AS max_created_at, COALESCE(SUM(credit_limit),0) AS credit_limit_sum, COALESCE(SUM(outstanding_balance),0) AS outstanding_balance_sum FROM partners WHERE partner_code LIKE 'SOL1154R20-BULK-%'
UNION ALL
SELECT 'created_by_sol_pr1154_r1', COUNT(*), COUNT(*) FILTER (WHERE is_deleted), MIN(created_at), MAX(created_at), COALESCE(SUM(credit_limit),0), COALESCE(SUM(outstanding_balance),0) FROM partners WHERE created_by = 'sol-pr1154-r1'
UNION ALL
SELECT 'modified_only_sol_pr1154_r1', COUNT(*), COUNT(*) FILTER (WHERE is_deleted), MIN(created_at), MAX(created_at), COALESCE(SUM(credit_limit),0), COALESCE(SUM(outstanding_balance),0) FROM partners WHERE modified_by = 'sol-pr1154-r1' AND created_by IS DISTINCT FROM 'sol-pr1154-r1' AND partner_code NOT LIKE 'SOL1154R20-BULK-%';
```

원문 출력 7:

```text
            rule             | rows | already_soft_deleted |       min_created_at       |       max_created_at       | credit_limit_sum | outstanding_balance_sum 
-----------------------------+------+----------------------+----------------------------+----------------------------+------------------+-------------------------
 bulk_partner_code_prefix    | 1000 |                    0 | 2026-08-10 01:24:06.871321 | 2026-08-10 01:24:13.484628 |         -1000.00 |                    0.00
 created_by_sol_pr1154_r1    |   49 |                    0 | 2023-08-14 00:00:00        | 2026-08-09 07:00:24.249979 |                0 |                    0.00
 modified_only_sol_pr1154_r1 | 7203 |                    0 | 0024-01-08 00:00:00        | 2026-08-03 00:00:00        |                0 |                    0.00
(3 rows)
```

실행 SQL 8:

```sql
SELECT COUNT(*) AS overlap_rows FROM partners WHERE partner_code LIKE 'SOL1154R20-BULK-%' AND created_by = 'sol-pr1154-r1';
```

원문 출력 8:

```text
 overlap_rows 
--------------
            0
(1 row)
```

실행 SQL 9:

```sql
SELECT partner_code, biz_no, name, status, created_at, created_by, modified_at, modified_by, is_deleted, credit_limit, outstanding_balance FROM partners WHERE modified_by='sol-pr1154-r1' AND created_by IS DISTINCT FROM 'sol-pr1154-r1' AND partner_code NOT LIKE 'SOL1154R20-BULK-%' ORDER BY created_at, partner_code LIMIT 20;
```

원문 출력 9:

```text
 partner_code |   biz_no   |            name            | status |     created_at      |              created_by              |        modified_at         |  modified_by  | is_deleted | credit_limit | outstanding_balance 
--------------+------------+----------------------------+--------+---------------------+--------------------------------------+----------------------------+---------------+------------+--------------+---------------------
 4483500844   | 4483500844 | 능동에어컨(박수천)         | ACTIVE | 0024-01-08 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:38.660735 | sol-pr1154-r1 | f          |              |                0.00
 1321455323   | 1321455323 | 진성냉열-박진수            | ACTIVE | 0323-08-30 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:24.77546  | sol-pr1154-r1 | f          |              |                0.00
 2210698118   | 2210698118 | 춘천 에어컨설치용달-박재오 | ACTIVE | 1976-11-03 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:32.028657 | sol-pr1154-r1 | f          |              |                0.00
 6053453364   | 6053453364 | 레알컴퓨터에어컨-성지혜    | ACTIVE | 1979-02-26 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:42.119719 | sol-pr1154-r1 | f          |              |                0.00
 4038141892   | 4038141892 | (주)이레솔루션             | ACTIVE | 2018-02-13 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:37.090861 | sol-pr1154-r1 | f          |              |                0.00
 1010872517   | 1010872517 | Good day(김성율)           | ACTIVE | 2018-02-14 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:16.956386 | sol-pr1154-r1 | f          |              |                0.00
 2102387961   | 2102387961 | 어보브엔비(Above Envy)     | ACTIVE | 2018-02-19 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:29.680349 | sol-pr1154-r1 | f          |              |                0.00
 5498600983   | 5498600983 | 주식회사 일조공조시스템    | ACTIVE | 2018-02-20 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:40.924037 | sol-pr1154-r1 | f          |              |                0.00
 7128700104   | 7128700104 | 주식회사조은씨에스티       | ACTIVE | 2018-02-20 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:45.107785 | sol-pr1154-r1 | f          |              |                0.00
 1140317698   | 1140317698 | 한양-김경수                | ACTIVE | 2018-02-22 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:20.137572 | sol-pr1154-r1 | f          |              |                0.00
 2058301155   | 2058301155 | 서울홍릉초등학교           | ACTIVE | 2018-02-22 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:28.622517 | sol-pr1154-r1 | f          |              |                0.00
 3424100187   | 3424100187 | 지산엔지니어링             | ACTIVE | 2018-02-22 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:35.654282 | sol-pr1154-r1 | f          |              |                0.00
 1218147640   | 1218147640 | (주)범양플랜트(조태업)     | ACTIVE | 2018-02-26 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:21.48075  | sol-pr1154-r1 | f          |              |                0.00
 2198200240   | 2198200240 | 영동일고등학교             | ACTIVE | 2018-02-28 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:31.79795  | sol-pr1154-r1 | f          |              |                0.00
 5248700069   | 5248700069 | 주식회사 위시스템공조      | ACTIVE | 2018-02-28 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:40.437626 | sol-pr1154-r1 | f          |              |                0.00
 1409023904   | 1409023904 | 굿모닝마취통증의학과의원   | ACTIVE | 2018-03-02 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:26.296336 | sol-pr1154-r1 | f          |              |                0.00
 2148852954   | 2148852954 | 주식회사 티이              | ACTIVE | 2018-03-05 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:30.971764 | sol-pr1154-r1 | f          |              |                0.00
 4180727077   | 4180727077 | 태영에어컨                 | ACTIVE | 2018-03-05 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:37.998301 | sol-pr1154-r1 | f          |              |                0.00
 2110836934   | 2110836934 | 금강전자냉동-이유홍 외 1명 | ACTIVE | 2018-03-08 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:29.93232  | sol-pr1154-r1 | f          |              |                0.00
 1268203509   | 1268203509 | 여주대학교                 | ACTIVE | 2018-03-09 00:00:00 | 00000000-0000-0000-0000-000000000001 | 2026-08-09 07:00:23.33868  | sol-pr1154-r1 | f          |              |                0.00
(20 rows)
```

실행 SQL 10:

```sql
SELECT created_by, modified_by, status, is_deleted, COUNT(*) AS rows FROM partners WHERE partner_code LIKE 'SOL1154R20-BULK-%' OR created_by='sol-pr1154-r1' GROUP BY created_by,modified_by,status,is_deleted ORDER BY rows DESC,created_by,modified_by;
```

원문 출력 10:

```text
              created_by              |             modified_by              | status | is_deleted | rows 
--------------------------------------+--------------------------------------+--------+------------+------
 a0000000-0000-0000-0000-000000000001 | a0000000-0000-0000-0000-000000000001 | ACTIVE | f          | 1000
 sol-pr1154-r1                        | sol-pr1154-r1                        | ACTIVE | f          |   49
(2 rows)
```

중간 판정: 두 후보군은 서로 겹치지 않으며 모두 active다. `modified_by='sol-pr1154-r1'` 단독 조건은 실제 사업자번호·거래처명을 가진 업무 거래처 7,203행을 잡는 명백한 오탐 조건이다. 삭제 판별식으로 사용하면 안 된다.

### `created_by='sol-pr1154-r1'` 49행의 업무 데이터 혼입 위험

실행 SQL 11:

```sql
SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE column_name='partner_id' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name;
```

원문 출력 11:

```text
 table_schema |         table_name         | column_name 
--------------+----------------------------+-------------
 public       | partner_attachments        | partner_id
 public       | partner_contacts           | partner_id
 public       | partner_credit_history     | partner_id
 public       | partner_price_discounts    | partner_id
 public       | partner_revisions          | partner_id
 public       | partner_shipping_addresses | partner_id
(6 rows)
```

실행 SQL 12:

```sql
SELECT partner_code,biz_no,name,registration_date,created_at,created_by,modified_at,modified_by FROM partners WHERE created_by='sol-pr1154-r1' ORDER BY partner_code;
```

원문 출력 12:

```text
 partner_code |    biz_no    |                     name                     | registration_date |         created_at         |  created_by   |        modified_at         |  modified_by  
--------------+--------------+----------------------------------------------+-------------------+----------------------------+---------------+----------------------------+---------------
 -            | -            | 이상덕기사님(경기퀵)                         | 2023-08-14        | 2023-08-14 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:14.189139 | sol-pr1154-r1
 00           | 00           | 파인씨엔디                                   |                   | 2026-08-09 07:00:14.289526 | sol-pr1154-r1 | 2026-08-09 07:00:14.289526 | sol-pr1154-r1
 000-00-00000 | 000-00-00000 | 국제전자센타91호-이영규                      |                   | 2026-08-09 07:00:14.307661 | sol-pr1154-r1 | 2026-08-09 07:00:14.307661 | sol-pr1154-r1
 000000000    | 000000000    | 에어컨총각들(임시)                           |                   | 2026-08-09 07:00:14.324336 | sol-pr1154-r1 | 2026-08-09 07:00:14.324336 | sol-pr1154-r1
 01027569314  | 01027569314  | 개인-노은심                                  | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:14.832888 | sol-pr1154-r1
 01042234465  | 01042234465  | 개인-이범희                                  | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:15.27645  | sol-pr1154-r1
 01063917988  | 01063917988  | 개인-안성현                                  | 2026-07-27        | 2026-07-27 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:15.580778 | sol-pr1154-r1
 1067800423   | 1067800423   | 윤성공조시스템에어컨-김정호                  | 2026-08-04        | 2026-08-04 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:18.045302 | sol-pr1154-r1
 1162900757   | 1162900757   | 삼성SVC-박기환                               | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:20.4016   | sol-pr1154-r1
 1220474775   | 1220474775   | 준 ENG(엔지니어링)-김병은                    | 2026-07-29        | 2026-07-29 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:21.54106  | sol-pr1154-r1
 1220586360   | 1220586360   | 1세기냉동에어컨-구자경                       | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:21.545568 | sol-pr1154-r1
 1301120827   | 1301120827   | 대성시스템 - 고명산                          |                   | 2026-08-09 07:00:24.249979 | sol-pr1154-r1 | 2026-08-09 07:00:24.249979 | sol-pr1154-r1
 1341687728   | 1341687728   | 해리시스템에어컨-조봉희                      | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:25.21208  | sol-pr1154-r1
 1348653371   | 1348653371   | (주)삼광이엠씨                               | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:25.377312 | sol-pr1154-r1
 1350292004   | 1350292004   | 서전-한흥현                                  | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:25.397537 | sol-pr1154-r1
 1400193804   | 1400193804   | 시스템에어컨(장옥희)                         | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:26.183249 | sol-pr1154-r1
 1410570724   | 1410570724   | 가온삼성가정의원-박기성                      | 2026-07-31        | 2026-07-31 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:26.332915 | sol-pr1154-r1
 1454900675   | 1454900675   | 유성 디자인-최경숙                           | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:26.586551 | sol-pr1154-r1
 1848803303   | 1848803303   | 주식회사 내공관리형스터디카페압구정점-하제원 | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:27.553605 | sol-pr1154-r1
 2081606647   | 2081606647   | 미래냉동시스템-김영길                        | 2026-07-31        | 2026-07-31 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:29.186191 | sol-pr1154-r1
 2108801851   | 2108801851   | 아이앤디진성주식회사-이경준                  | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:29.804233 | sol-pr1154-r1
 2178118072   | 2178118072   | (주)토마토세븐-신동규                        | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:31.619089 | sol-pr1154-r1
 2212442336   | 2212442336   | 엠제이테크-이옥주                            | 2026-08-04        | 2026-08-04 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:32.101245 | sol-pr1154-r1
 2283101974   | 2283101974   | 바람기술-박종근(228)                         | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:32.479821 | sol-pr1154-r1
 2475500351   | 2475500351   | 아시아시스템에어컨-정성식                    | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:33.043128 | sol-pr1154-r1
 3121149542   | 3121149542   | MS시스템-강관모                              | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:34.758631 | sol-pr1154-r1
 3148602880   | 3148602880   | (주) 준형-윤여문                             | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:34.98752  | sol-pr1154-r1
 3187200515   | 3187200515   | 화인공조시스템-강보화                        | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:35.120233 | sol-pr1154-r1
 3202401587   | 3202401587   | 류원공조-류형석                              | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:35.17047  | sol-pr1154-r1
 3261702140   | 3261702140   | 드림 스펙트럼-윤순호                         | 2026-08-04        | 2026-08-04 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:35.287585 | sol-pr1154-r1
 3660901974   | 3660901974   | 블루시스템에어컨-민성준                      | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:36.125447 | sol-pr1154-r1
 3933001591   | 3933001591   | 예스가전홈케어-이은지                        | 2026-07-31        | 2026-07-31 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:36.770958 | sol-pr1154-r1
 4200401123   | 4200401123   | 커브스교동클럽-김진기                        | 2026-08-04        | 2026-08-04 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:38.055119 | sol-pr1154-r1
 4318701505   | 4318701505   | 주식회사비앤에프엔터프라이즈-박남기          | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:38.319922 | sol-pr1154-r1
 4541002543   | 4541002543   | 엔에스공조-노준호                            | 2026-08-07        | 2026-08-07 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:38.786506 | sol-pr1154-r1
 4984800849   | 4984800849   | 하나 냉열(박길환)                            | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:39.660296 | sol-pr1154-r1
 5148801923   | 5148801923   | (주)삼성알앤아이-조지현                      | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:40.24324  | sol-pr1154-r1
 5998603971   | 5998603971   | 주식회사무한에어-김문희                      | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:41.942918 | sol-pr1154-r1
 6162163178   | 6162163178   | BS시스템-송경후                              | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:42.768845 | sol-pr1154-r1
 6394400665   | 6394400665   | 엘지냉동ENG                                  | 2026-07-31        | 2026-07-31 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:43.4796   | sol-pr1154-r1
 6538703743   | 6538703743   | (주)광주에어컨-김구태                        | 2026-08-05        | 2026-08-05 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:43.716632 | sol-pr1154-r1
 6801101024   | 6801101024   | 노은공조시스템-김수용                        | 2026-08-04        | 2026-08-04 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:44.32041  | sol-pr1154-r1
 6928701696   | 6928701696   | 주식회사에이케이시스템앤솔루션-김미지        | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:44.669953 | sol-pr1154-r1
 7091200416   | 7091200416   | 스타 시스템 에어컨-유선재                    | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:45.035391 | sol-pr1154-r1
 7192801086   | 7192801086   | 승연ENG-양정석                               | 2026-07-31        | 2026-07-31 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:45.235576 | sol-pr1154-r1
 7258700449   | 7258700449   | 주식회사 영푸드텍-최수영                     | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:45.338975 | sol-pr1154-r1
 8480300363   | 8480300363   | 비&비(B&B)                                   | 2026-07-30        | 2026-07-30 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:48.074518 | sol-pr1154-r1
 8661401880   | 8661401880   | 정씨함박(영동점)-황명숙                      | 2026-08-06        | 2026-08-06 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:48.914095 | sol-pr1154-r1
 8911103170   | 8911103170   | 제이제이시스템-정호섭                        | 2026-08-03        | 2026-08-03 00:00:00        | sol-pr1154-r1 | 2026-08-09 07:00:49.860867 | sol-pr1154-r1
(49 rows)
```

실행 SQL 13:

```sql
SELECT COUNT(*) AS candidate_rows,
COUNT(*) FILTER (WHERE created_at < TIMESTAMP '2026-08-01') AS created_before_august,
COUNT(*) FILTER (WHERE registration_date IS NOT NULL) AS has_registration_date,
COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM staging.ecount_partner_raw r WHERE r.raw_partner_code=p.partner_code)) AS code_exists_in_staging,
COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM partners q WHERE q.id<>p.id AND (q.biz_no=p.biz_no OR q.name=p.name))) AS duplicate_bizno_or_name_in_partners
FROM partners p WHERE created_by='sol-pr1154-r1';
```

원문 출력 13:

```text
 candidate_rows | created_before_august | has_registration_date | code_exists_in_staging | duplicate_bizno_or_name_in_partners 
----------------+-----------------------+-----------------------+------------------------+-------------------------------------
             49 |                    16 |                    45 |                     49 |                                   0
(1 row)
```

중간 판정: 49행은 모두 ECOUNT staging 원본 코드와 대응하며 45행은 업무 등록일도 가진다. 중복 복제본도 아니다. `created_by` 값은 QA 실행 표지지만 행 자체는 실제 신규 업무 거래처일 가능성이 높다. 현재 증거만으로 이 49행을 잔재로 확정하거나 soft-delete하는 것은 위험하다.

### BULK 판별식, 테이블별 건수, 거래처 집계 오염

실행 SQL 14:

```sql
SELECT COUNT(*) AS bulk_rows,
COUNT(*) FILTER (WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$') AS exact_regex_rows,
COUNT(DISTINCT partner_code) AS distinct_codes,
COUNT(*) FILTER (WHERE biz_no=partner_code) AS biz_no_equals_code,
MIN((regexp_match(partner_code,'^SOL1154R20-BULK-([0-9]+)$'))[1]::int) AS min_suffix,
MAX((regexp_match(partner_code,'^SOL1154R20-BULK-([0-9]+)$'))[1]::int) AS max_suffix
FROM partners WHERE partner_code LIKE 'SOL1154R20-BULK-%';
```

원문 출력 14:

```text
 bulk_rows | exact_regex_rows | distinct_codes | biz_no_equals_code | min_suffix | max_suffix 
-----------+------------------+----------------+--------------------+------------+------------
      1000 |             1000 |           1000 |               1000 |          1 |       1000
(1 row)
```

실행 SQL 15:

```sql
WITH candidate AS (SELECT id,partner_code FROM partners WHERE partner_code LIKE 'SOL1154R20-BULK-%'), candidate49 AS (SELECT id,partner_code FROM partners WHERE created_by='sol-pr1154-r1')
SELECT 'partners' AS table_name,(SELECT COUNT(*) FROM candidate) AS bulk_rows,(SELECT COUNT(*) FROM candidate49) AS pr1154_created_rows
UNION ALL SELECT 'blocked_partners',(SELECT COUNT(*) FROM blocked_partners x JOIN candidate c ON x.partner_code=c.partner_code),(SELECT COUNT(*) FROM blocked_partners x JOIN candidate49 c ON x.partner_code=c.partner_code)
UNION ALL SELECT 'partner_attachments',(SELECT COUNT(*) FROM partner_attachments x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_attachments x JOIN candidate49 c ON x.partner_id=c.id)
UNION ALL SELECT 'partner_audit_logs',(SELECT COUNT(*) FROM partner_audit_logs x JOIN candidate c ON x.entity_id=c.id),(SELECT COUNT(*) FROM partner_audit_logs x JOIN candidate49 c ON x.entity_id=c.id)
UNION ALL SELECT 'partner_contacts',(SELECT COUNT(*) FROM partner_contacts x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_contacts x JOIN candidate49 c ON x.partner_id=c.id)
UNION ALL SELECT 'partner_credit_history',(SELECT COUNT(*) FROM partner_credit_history x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_credit_history x JOIN candidate49 c ON x.partner_id=c.id)
UNION ALL SELECT 'partner_edit_requests',(SELECT COUNT(*) FROM partner_edit_requests x JOIN candidate c ON x.entity_id=c.id),(SELECT COUNT(*) FROM partner_edit_requests x JOIN candidate49 c ON x.entity_id=c.id)
UNION ALL SELECT 'partner_price_discounts',(SELECT COUNT(*) FROM partner_price_discounts x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_price_discounts x JOIN candidate49 c ON x.partner_id=c.id)
UNION ALL SELECT 'partner_revisions',(SELECT COUNT(*) FROM partner_revisions x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_revisions x JOIN candidate49 c ON x.partner_id=c.id)
UNION ALL SELECT 'partner_shipping_addresses',(SELECT COUNT(*) FROM partner_shipping_addresses x JOIN candidate c ON x.partner_id=c.id),(SELECT COUNT(*) FROM partner_shipping_addresses x JOIN candidate49 c ON x.partner_id=c.id)
ORDER BY table_name;
```

원문 출력 15:

```text
         table_name         | bulk_rows | pr1154_created_rows 
----------------------------+-----------+---------------------
 blocked_partners           |         0 |                   0
 partner_attachments        |         0 |                   0
 partner_audit_logs         |         0 |                   0
 partner_contacts           |         0 |                   0
 partner_credit_history     |         0 |                   0
 partner_edit_requests      |         0 |                   0
 partner_price_discounts    |         0 |                   0
 partner_revisions          |         0 |                   0
 partner_shipping_addresses |         0 |                   0
 partners                   |      1000 |                  49
(10 rows)
```

실행 SQL 16:

```sql
SELECT status,is_deleted,
COUNT(*) AS residue_included_count,
COUNT(*) FILTER (WHERE partner_code NOT LIKE 'SOL1154R20-BULK-%') AS bulk_excluded_count,
COUNT(*) FILTER (WHERE partner_code NOT LIKE 'SOL1154R20-BULK-%' AND created_by IS DISTINCT FROM 'sol-pr1154-r1') AS both_candidates_excluded_count,
COALESCE(SUM(credit_limit),0) AS included_credit_limit,
COALESCE(SUM(credit_limit) FILTER (WHERE partner_code NOT LIKE 'SOL1154R20-BULK-%'),0) AS bulk_excluded_credit_limit,
COALESCE(SUM(outstanding_balance),0) AS included_outstanding,
COALESCE(SUM(outstanding_balance) FILTER (WHERE partner_code NOT LIKE 'SOL1154R20-BULK-%'),0) AS bulk_excluded_outstanding
FROM partners GROUP BY status,is_deleted ORDER BY status,is_deleted;
```

원문 출력 16:

```text
  status   | is_deleted | residue_included_count | bulk_excluded_count | both_candidates_excluded_count | included_credit_limit | bulk_excluded_credit_limit | included_outstanding | bulk_excluded_outstanding 
-----------+------------+------------------------+---------------------+--------------------------------+-----------------------+----------------------------+----------------------+---------------------------
 ACTIVE    | f          |                   8304 |                7304 |                           7255 |         1069999000.00 |              1070000000.00 |            700000.00 |                 700000.00
 ACTIVE    | t          |                     14 |                  14 |                             14 |                  0.00 |                       0.00 |                 0.00 |                      0.00
 SUSPENDED | f          |                      5 |                   5 |                              5 |            5000000.00 |                 5000000.00 |                 0.00 |                      0.00
(3 rows)
```

판정: BULK 잔재의 안전성이 가장 높은 판별식은 `partner_code ~ '^SOL1154R20-BULK-[0-9]+$' AND biz_no = partner_code AND created_at >= '2026-08-10 01:24:06' AND created_at < '2026-08-10 01:24:14'`이다. 현재 이 식은 정확히 1,000행이며 연관 자식 행은 0이다. active 거래처 화면/목록의 단순 집계는 7,304가 8,304로 1,000건(+13.69%) 부풀어 있다. active 신용한도 합계는 BULK의 음수 합계 -1,000원 때문에 1,070,000,000원 대신 1,069,999,000원으로 표시될 수 있다. 49행까지 제외한 7,255건은 참고치일 뿐, 해당 49행은 업무 데이터 가능성 때문에 삭제 근거로 사용할 수 없다.

## 4차 측정 — `slip_db` 끊긴 논리 참조

### 내부 FK와 DB 경계

실행 SQL 17:

```sql
SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name;
```

원문 출력 17(42개 테이블):

```text
 public | carriers
 public | delivery_batches
 public | dispatch_collab_comments
 public | dispatch_collab_suggestions
 public | dispatch_group_slips
 public | dispatch_groups
 public | dispatch_matched_driver
 public | dispatch_task
 public | dispatch_vehicle_group
 public | dispatch_vehicle_group_slip
 public | estimate_collab_comments
 public | estimate_collab_suggestions
 public | estimate_lines
 public | estimate_number_sequences
 public | estimate_revisions
 public | estimates
 public | external_carrier
 public | external_dispatch
 public | external_dispatch_slip
 public | flyway_schema_history
 public | partner_product_price_memory
 public | quote_snapshots
 public | serial_compensation_failures
 public | slip_attachments
 public | slip_audit_logs
 public | slip_cleanup_save_history
 public | slip_closing_baselines
 public | slip_closing_date_rules
 public | slip_collab_comments
 public | slip_collab_notification_outbox
 public | slip_collab_suggestions
 public | slip_comments
 public | slip_edit_requests
 public | slip_line_correction_audits
 public | slip_lines
 public | slip_number_sequences
 public | slip_outbound_cutoff
 public | slip_publish_audit
 public | slip_revisions
 public | slip_signature_audit
 public | slip_source_orders
 public | slips
(42 rows)
```

실행 SQL 18:

```sql
SELECT tc.table_name,kcu.column_name,ccu.table_name AS referenced_table,ccu.column_name AS referenced_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' ORDER BY tc.table_name,kcu.column_name;
```

원문 출력 18:

```text
         table_name          |     column_name      |    referenced_table    | referenced_column 
-----------------------------+----------------------+------------------------+-------------------
 dispatch_group_slips        | group_id             | dispatch_groups        | id
 dispatch_group_slips        | slip_id              | slips                  | id
 dispatch_groups             | carrier_id           | carriers               | id
 dispatch_matched_driver     | vehicle_group_id     | dispatch_vehicle_group | id
 dispatch_vehicle_group      | dispatch_task_id     | dispatch_task          | id
 dispatch_vehicle_group_slip | vehicle_group_id     | dispatch_vehicle_group | id
 estimate_lines              | estimate_id          | estimates              | id
 external_dispatch           | carrier_id           | external_carrier       | id
 external_dispatch_slip      | external_dispatch_id | external_dispatch      | id
 external_dispatch_slip      | slip_id              | slips                  | id
 slip_attachments            | slip_id              | slips                  | id
 slip_lines                  | slip_id              | slips                  | id
 slip_source_orders          | slip_id              | slips                  | id
 slips                       | delivery_batch_id    | delivery_batches       | id
(14 rows)
```

판정: 문제 참조는 DB 내부 FK가 아니라 `slip_lines.product_id → product_db.products.id`, `slips.partner_id → partner_db.partners.id`, `slips.*warehouse_id → inventory_db.warehouses.id`, 주문 관련 UUID처럼 DB 경계를 넘는 논리 참조다.

### 이름 기반 정찰

실행 SQL 22:

```sql
SELECT created_by,COUNT(*) AS line_rows,COUNT(DISTINCT slip_id) AS slips,COUNT(DISTINCT product_id) AS product_ids,MIN(created_at) AS min_created_at,MAX(created_at) AS max_created_at FROM slip_lines WHERE NOT is_deleted GROUP BY created_by ORDER BY line_rows DESC NULLS LAST LIMIT 30;
```

원문 출력 22:

```text
              created_by              | line_rows | slips | product_ids |       min_created_at       |       max_created_at       
--------------------------------------+-----------+-------+-------------+----------------------------+----------------------------
 a0000000-0000-0000-0000-000000000003 |       540 |   295 |          36 | 2026-07-15 20:46:53.120529 | 2026-08-08 21:51:59.038632
 system                               |       300 |   100 |         100 | 2026-05-09 16:59:33.210336 | 2026-05-09 16:59:33.901047
 a0000000-0000-0000-0000-000000000004 |        52 |    49 |          18 | 2026-07-23 01:15:50.940516 | 2026-08-09 01:08:35.700678
 a0000000-0000-0000-0000-000000000001 |        29 |    29 |           3 | 2026-08-09 01:07:58.111769 | 2026-08-09 22:52:07.000158
 a0000000-0000-0000-0000-000000000006 |        14 |    14 |           2 | 2026-08-08 21:03:32.606884 | 2026-08-08 22:43:18.915051
 system-internal                      |         3 |     3 |           1 | 2026-05-30 13:37:02.475652 | 2026-05-30 13:39:39.203575
 656b7049-33b0-4598-9be6-67f2ec9805b0 |         2 |     2 |           1 | 2026-08-08 20:40:23.845434 | 2026-08-08 20:40:48.417364
(7 rows)
```

실행 SQL 24:

```sql
SELECT COUNT(*) AS active_lines,COUNT(*) FILTER (WHERE product_id IS NULL) AS null_product_id,COUNT(*) FILTER (WHERE lower(coalesce(product_name,'')) ~ '(qa|test|테스트)') AS qa_test_name_lines,COUNT(DISTINCT slip_id) FILTER (WHERE lower(coalesce(product_name,'')) ~ '(qa|test|테스트)') AS qa_test_name_slips,COUNT(DISTINCT product_id) FILTER (WHERE lower(coalesce(product_name,'')) ~ '(qa|test|테스트)') AS qa_test_name_product_ids FROM slip_lines WHERE NOT is_deleted;
```

원문 출력 24:

```text
 active_lines | null_product_id | qa_test_name_lines | qa_test_name_slips | qa_test_name_product_ids 
--------------+-----------------+--------------------+--------------------+--------------------------
          940 |               0 |                648 |                306 |                      106
(1 row)
```

### `product_id` 실제 cross-DB 대조

`dblink`/FDW가 설치되어 있지 않아 각 DB에서 아래 `SELECT`를 실행해 UUID 목록을 읽고 PowerShell `HashSet`으로 차집합을 계산했다.

```sql
-- product_db
SELECT id::text FROM products;
SELECT id::text FROM products WHERE NOT is_deleted;
-- slip_db
SELECT DISTINCT product_id::text FROM slip_lines WHERE NOT is_deleted ORDER BY product_id::text;
```

원문 비교 출력:

```text
product_db_all=3237 active=3084
slip_distinct=149 physical_missing=101 soft_deleted_target=3 logical_missing_total=104
```

차집합 UUID를 `VALUES (...::uuid)` CTE로 `slip_db`에 다시 전달해 실행한 집계 SQL:

```sql
WITH missing(product_id) AS (VALUES /* product_db 활성 products에 없는 UUID 104개 */)
SELECT COUNT(*) AS broken_line_rows,COUNT(DISTINCT l.slip_id) AS broken_slips,COUNT(DISTINCT l.product_id) AS broken_product_ids,
COUNT(*) FILTER (WHERE lower(COALESCE(l.product_name,'')) ~ '(qa|test|테스트)') AS qa_test_named_lines,
COUNT(DISTINCT l.slip_id) FILTER (WHERE lower(COALESCE(l.product_name,'')) ~ '(qa|test|테스트)') AS qa_test_named_slips,
COUNT(DISTINCT l.product_id) FILTER (WHERE lower(COALESCE(l.product_name,'')) ~ '(qa|test|테스트)') AS qa_test_named_product_ids,
COALESCE(SUM(l.line_total),0) AS line_total_sum,COALESCE(SUM(l.supply_amount),0) AS supply_amount_sum,COALESCE(SUM(l.vat_amount),0) AS vat_amount_sum
FROM slip_lines l JOIN missing m ON m.product_id=l.product_id WHERE NOT l.is_deleted;
```

원문 출력:

```text
 broken_line_rows | broken_slips | broken_product_ids | qa_test_named_lines | qa_test_named_slips | qa_test_named_product_ids | line_total_sum | supply_amount_sum | vat_amount_sum 
------------------+--------------+--------------------+---------------------+---------------------+---------------------------+----------------+-------------------+----------------
              646 |          304 |                104 |                 643 |                 301 |                       103 |  1042812819.00 |     1042812819.00 |   104260289.00
(1 row)
```

물리 누락/soft-delete 대상 분해 원문 출력:

```text
     break_type      |              created_by              | lines | slips | product_ids | line_total_sum 
---------------------+--------------------------------------+-------+-------+-------------+----------------
 target_row_absent   | system                               |   300 |   100 |         100 |   991885000.00
 target_row_absent   | system-internal                      |     3 |     3 |           1 |     2520000.00
 target_soft_deleted | a0000000-0000-0000-0000-000000000003 |   335 |   193 |           3 |    47607819.00
 target_soft_deleted | a0000000-0000-0000-0000-000000000004 |     8 |     8 |           1 |      800000.00
(4 rows)
```

soft-delete된 대상 상품 확인 SQL:

```sql
SELECT id,product_code,name,model_name,created_at,created_by,deleted_at,deleted_by,is_deleted FROM products WHERE id IN ('57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid,'7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid,'ed278526-0e16-427d-8a92-2ca06164254a'::uuid) ORDER BY id;
```

원문 출력:

```text
                  id                  | product_code |                 name                 |  model_name   |         created_at         | created_by |         deleted_at         |    deleted_by     | is_deleted 
--------------------------------------+--------------+--------------------------------------+---------------+----------------------------+------------+----------------------------+-------------------+------------
 57dc63e2-43da-43e6-b73e-3c81822cf9a7 |              | QA797 일반 상업멀티 품목(회귀비교용) | QA797-GEN-01  | 2026-07-12 09:21:42.924557 | qa798      | 2026-07-28 20:34:06.45807  | system-sheet-sync | t
 7de11ab7-e70c-421e-80a4-7c6b51a2c6e9 |              | [QA797] 구성품A(기본2개)             | QA797-PART-01 | 2026-07-12 09:21:42.924557 | qa798      | 2026-07-28 20:34:09.228761 | system-sheet-sync | t
 ed278526-0e16-427d-8a92-2ca06164254a |              | [QA797] 구성품B(기본1개)             | QA797-PART-02 | 2026-07-12 09:21:42.924557 | qa798      | 2026-07-28 20:34:09.226039 | system-sheet-sync | t
(3 rows)
```

### 재현 가능한 판별식과 오탐 위험

현재 646행을 재현하는 판별식:

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

검증 원문 출력:

```text
              created_by              |           min_product_name           |      max_product_name      | lines | slips | product_ids |       min_created_at       |       max_created_at       
--------------------------------------+--------------------------------------+----------------------------+-------+-------+-------------+----------------------------+----------------------------
 a0000000-0000-0000-0000-000000000003 | QA797 일반 상업멀티 품목(회귀비교용) | [QA797] 구성품B(기본1개)   |   335 |   193 |           3 | 2026-07-15 20:46:53.120529 | 2026-07-27 03:47:01.218035
 system                               | 테스트제품-TEST-MODEL-0001           | 테스트제품-TEST-MODEL-0100 |   300 |   100 |         100 | 2026-05-09 16:59:33.210336 | 2026-05-09 16:59:33.901047
 a0000000-0000-0000-0000-000000000004 | PMQA 인쇄-비표준VAT                  | PMQA 필드확인              |     8 |     8 |           1 | 2026-07-23 01:15:50.940516 | 2026-07-23 04:06:13.531404
 system-internal                      | Product A                            | Samsung Product A          |     3 |     3 |           1 | 2026-05-30 13:37:02.475652 | 2026-05-30 13:39:39.203575
(4 rows)
```

오탐 위험: `system` 또는 `system-internal`만으로는 향후 업무 배치 행을 잡을 수 있으므로 단독 사용 금지다. 이름의 `(qa|test|테스트)`만 쓰면 실제 끊긴 3행(`Product A`, `Samsung Product A`)을 놓치고, 반대로 현재 active lines 기준 648행/306전표를 잡아 논리 끊김 646행/304전표보다 2행/2전표를 더 잡는다. 안전성은 정확한 생성 시간창과 QA797 대상 UUID의 결합에서 나온다.

### 전표 화면/집계 오염

후보 전표 헤더 상태 원문 중 요약 집계:

```text
후보 distinct slips 304
헤더 active 295
헤더 soft-deleted 9
```

실행 SQL:

```sql
WITH candidate_slips AS (SELECT DISTINCT l.slip_id FROM slip_lines l WHERE /* 위 646행 판별식 */),
active_totals AS (SELECT s.id,SUM(l.line_total) AS total,SUM(l.supply_amount) AS supply,SUM(l.vat_amount) AS vat FROM slips s JOIN slip_lines l ON l.slip_id=s.id AND NOT l.is_deleted WHERE NOT s.is_deleted GROUP BY s.id)
SELECT COUNT(*) AS all_active_slips,COUNT(*) FILTER (WHERE c.slip_id IS NOT NULL) AS residue_active_slips,COUNT(*) FILTER (WHERE c.slip_id IS NULL) AS residue_excluded_slips,
COALESCE(SUM(a.total),0) AS included_line_total,COALESCE(SUM(a.total) FILTER (WHERE c.slip_id IS NULL),0) AS excluded_line_total,
COALESCE(SUM(a.supply),0) AS included_supply,COALESCE(SUM(a.supply) FILTER (WHERE c.slip_id IS NULL),0) AS excluded_supply,
COALESCE(SUM(a.vat),0) AS included_vat,COALESCE(SUM(a.vat) FILTER (WHERE c.slip_id IS NULL),0) AS excluded_vat
FROM active_totals a LEFT JOIN candidate_slips c ON c.slip_id=a.id;
```

원문 출력:

```text
 all_active_slips | residue_active_slips | residue_excluded_slips | included_line_total | excluded_line_total | included_supply | excluded_supply | included_vat | excluded_vat 
------------------+----------------------+------------------------+---------------------+---------------------+-----------------+-----------------+--------------+--------------
              483 |                  295 |                    188 |       1153069392.00 |        111287573.00 |   1153069392.00 |    111287573.00 | 115285945.00 |  11128748.00
(1 row)
```

판정: 전표 목록/상태별 건수에서 active 후보 295건이 보이며, active 전표 라인 합계는 잔재 포함 1,153,069,392원 대 제외 111,287,573원이다. 잔재가 1,041,781,819원을 추가해 기준액 대비 약 936.11% 과대 표시한다. 공급가와 VAT도 각각 1,041,781,819원, 104,157,197원만큼 증가한다. DRAFT뿐 아니라 SENT/ACCEPTED/PROCESSING/COMPLETED/DELIVERED/CONFIRMED 등 여러 상태에 분포하므로 전표 목록·상태 카운트·매입/매출 금액 집계를 오염시킨다.

후보 전표에 연결된 `slip_db` 테이블별 행 수 SQL은 `candidate_slips`에 각 `slip_id`/`document_id` 열을 JOIN했다. 원문 출력:

```text
           table_name            | rows 
---------------------------------+------
 dispatch_collab_comments        |    0
 dispatch_collab_suggestions     |    0
 dispatch_group_slips            |    0
 dispatch_vehicle_group_slip     |    4
 estimate_collab_comments        |    0
 estimate_collab_suggestions     |    0
 external_dispatch_slip          |    0
 serial_compensation_failures    |    0
 slip_attachments                |    0
 slip_audit_logs                 |   86
 slip_collab_comments            |    3
 slip_collab_notification_outbox |    0
 slip_collab_suggestions         |    7
 slip_comments                   |    0
 slip_edit_requests              |    0
 slip_line_correction_audits     |    0
 slip_lines                      |  938
 slip_publish_audit              |    3
 slip_revisions                  |  300
 slip_signature_audit            |    0
 slip_source_orders              |    0
 slips                           |  304
(22 rows)
```

주의: 후보 슬립의 전체 라인은 938행이고 그중 끊긴 `product_id` 라인이 646행이다. 향후 soft-delete 승인 시 라인 646행만이 아니라 전표 헤더 및 정상 참조 라인·감사/개정 이력의 처리 정책을 별도로 결정해야 한다.

## 5차 측정 — 그 밖의 `slip_db` 끊긴 논리 참조

### `slips.partner_id → partner_db.partners.id`

원문 비교 출력:

```text
partner_ref_distinct=67 physical_missing=2 soft_deleted_target=0
```

실행 SQL 및 원문 출력:

```sql
SELECT id,slip_no,slip_date,slip_type,status,partner_id,partner_code,partner_name,created_at,created_by,is_deleted,deleted_at,deleted_by FROM slips WHERE partner_id IN ('00000000-0000-4000-8000-000000001156'::uuid,'22222222-2222-2222-2222-222222222222'::uuid) ORDER BY created_at;
```

```text
                  id                  |   slip_no    | slip_date  | slip_type | status |              partner_id              | partner_code |        partner_name         |         created_at         |              created_by              | is_deleted |         deleted_at         |          deleted_by          
--------------------------------------+--------------+------------+-----------+--------+--------------------------------------+--------------+-----------------------------+----------------------------+--------------------------------------+------------+----------------------------+------------------------------
 945bd81f-6431-4390-a05e-ea91d9d75484 | 2026/07/15-1 | 2026-07-15 | OUTBOUND  | DRAFT  | 22222222-2222-2222-2222-222222222222 |              | QA-793 라이브 테스트 거래처 | 2026-07-11 23:55:24.956047 | a0000000-0000-0000-0000-000000000004 | t          | 2026-08-07 16:54:39.516855 | issue-1096-test-seed-cleanup
 a5d9ff12-5e58-4796-bd81-391f66e6e763 | 2026/08/09-2 | 2026-08-09 | INBOUND   | DRAFT  | 00000000-0000-4000-8000-000000001156 |              | SOL lookup 실패 거래처      | 2026-08-09 11:59:32.681328 | a0000000-0000-0000-0000-000000000001 | f          |                            | 
(2 rows)
```

판정: 2건 모두 QA 성격이 명시적이다. 첫 행은 이미 soft-delete됐고, 두 번째 `SOL lookup 실패 거래처` 1건만 active DRAFT 화면에 남는다.

### `slips.source_warehouse_id → inventory_db.warehouses.id`

원문 비교 및 집계 출력:

```text
warehouse_refs=10 physical_missing=2 soft_deleted_target=0
     column_name     | is_deleted | status | slip_type |              created_by              | slips |       min_created_at       |       max_created_at       
---------------------+------------+--------+-----------+--------------------------------------+-------+----------------------------+----------------------------
 source_warehouse_id | f          | DRAFT  | OUTBOUND  | a0000000-0000-0000-0000-000000000001 |     5 | 2026-08-09 22:27:02.778321 | 2026-08-09 22:52:04.421956
 source_warehouse_id | f          | DRAFT  | OUTBOUND  | system-internal                      |     3 | 2026-05-30 13:37:02.464956 | 2026-05-30 13:39:39.203047
 source_warehouse_id | t          | DRAFT  | OUTBOUND  | system-internal                      |     1 | 2026-07-31 23:50:58.387557 | 2026-07-31 23:50:58.387557
 source_warehouse_id | t          | SENT   | OUTBOUND  | 00000000-0000-0000-0000-000000000000 |     1 | 2026-06-23 23:51:13.45032  | 2026-06-23 23:51:13.45032
(4 rows)
```

판정: 물리 누락 창고 UUID는 `00000000-0000-0000-0000-000000000001`, `11111111-1111-1111-1111-111111111111` 두 종이며 active DRAFT 8건, 이미 soft-delete 2건이 참조한다. `system-internal` 3건은 위 646행 후보에도 포함된다. 최근 생성자 UUID의 5건은 별도 SOL QA 여부를 승인 전에 확인해야 하며, 생성자 UUID만으로 삭제하면 오탐 위험이 있다.

### 주문 논리 참조

원문 비교 출력:

```text
source_order_line_refs=24 physical_missing=2 soft_deleted_target=22
partner_order_refs=5 physical_missing=0 soft_deleted_target=5
```

`slip_lines.source_order_line_id → partner_order_db.partner_order_lines.id` 원문 상세:

```text
     break_type      | is_deleted |              created_by              | lines | slips |       min_created_at       |       max_created_at       | line_total_sum 
---------------------+------------+--------------------------------------+-------+-------+----------------------------+----------------------------+----------------
 target_row_absent   | f          | system-internal                      |     3 |     3 | 2026-05-30 13:37:02.475652 | 2026-05-30 13:39:39.203575 |     2520000.00
 target_soft_deleted | t          | 00000000-0000-0000-0000-000000000000 |    20 |    13 | 2026-05-31 02:49:25.098065 | 2026-08-01 06:01:15.229793 |    48627272.00
 target_soft_deleted | t          | a0000000-0000-0000-0000-000000000001 |     6 |     3 | 2026-08-01 05:17:49.48022  | 2026-08-01 05:21:08.21947  |    29454546.19
(3 rows)
```

판정: active 물리 누락은 위 `system-internal` 3라인뿐이다. soft-deleted 주문 라인을 가리키는 26라인은 전부 전표 라인 자체도 soft-delete되어 화면 집계 오염이 아니다.

`slip_source_orders.partner_order_id → partner_order_db.partner_orders.id` 5종은 모두 `issue-1096-test-seed-cleanup`으로 soft-delete된 QA 주문이고, 연결된 전표도 모두 soft-delete 상태였다. 원문 출력:

```text
 partner_order_id                           order_no         status      deleted_by
 2a3394f7-843e-4798-94dd-95e92dafcfaa       2026/04/15-2     CONVERTED   issue-1096-test-seed-cleanup
 ed72e45c-f59c-46c0-95b7-d5e9ec233f55       2026/05/31-2     CONVERTED   issue-1096-test-seed-cleanup
 f0000001-0d2a-4000-b000-000000000001       2026/05/31-QA1   CONVERTED   issue-1096-test-seed-cleanup
 98aebb17-a3ea-48af-8d55-b06f308439fe       2026/05/31-3     CONVERTED   issue-1096-test-seed-cleanup
 77177936-5e2b-41d3-b15f-7f5f349b74c7       2026/05/31-4     CONVERTED   issue-1096-test-seed-cleanup
```

## 최종 식별표

| DB | 테이블/컬럼 | 현재 실측 | 판별식/성격 | 삭제 안전성 판단 |
|---|---|---:|---|---|
| partner_db | partners | 1,000행 | 정확 코드 정규식 + biz_no 동일 + 2026-08-10 01:24:06~14 집중 생성 | 높은 편. 자식 0, 합성 suffix 1~1000 |
| partner_db | partners | 49행 | created_by=`sol-pr1154-r1` | 삭제 승인 불가. 전부 staging 대응, 업무 거래처 가능성 큼 |
| partner_db | partners | 7,203행 | modified_by만 `sol-pr1154-r1` | 명백한 오탐. 삭제 조건 사용 금지 |
| slip_db | slip_lines.product_id | 646 active lines / 304 slips / 104종 | product_db active products에 대상 없음 | QA 성격 강함. 세부 판별식 사용 필요 |
| slip_db | slips (위 후보 전표) | 304행(295 active, 9 soft-deleted) | 후보 라인을 하나 이상 보유 | 헤더 단위 승인 정책 필요 |
| slip_db | slips.partner_id | 물리 누락 2건(1 active) | partner_db에 UUID 행 없음 | 두 건 모두 QA 명시적 |
| slip_db | slips.source_warehouse_id | 물리 누락 참조 10건(8 active) | inventory_db에 UUID 행 없음 | 3건은 확정 후보, 최근 5건은 추가 승인 판단 필요 |
| slip_db | slip_lines.source_order_line_id | 물리 누락 active 3라인 | partner_order_db에 UUID 행 없음 | 위 system-internal 후보와 동일 |
| slip_db | 주문 soft-delete 참조 | source line 26행, order link 6행 | 대상만 soft-delete | 참조측도 모두 soft-delete; 현재 화면 오염 아님 |

## 결론

1. 즉시 삭제 승인 후보로 가장 명확한 것은 `partner_db.partners` BULK 1,000행과 `slip_db`의 정확한 646행 판별식에 속한 QA 전표군이다. 단 실제 작업은 개발책임자 승인 후 soft-delete로만 해야 한다.
2. `sol-pr1154-r1` 49행은 잔재로 확정하면 안 된다. 이 표지는 QA 실행자가 만든 행이라는 뜻일 뿐, 행들은 ECOUNT 원본과 전부 대응하는 실제 업무 거래처일 가능성이 높다.
3. `modified_by='sol-pr1154-r1'`은 7,203개의 실 거래처를 잡는 확정 오탐 조건이다.
4. 금액 오염의 주원인은 `slip_db` active 후보 295전표이며, 라인 합계를 111,287,573원에서 1,153,069,392원으로 부풀린다.
5. 본 조사에서는 `SELECT` 외 SQL을 실행하지 않았고 데이터 한 행도 변경하지 않았다.
