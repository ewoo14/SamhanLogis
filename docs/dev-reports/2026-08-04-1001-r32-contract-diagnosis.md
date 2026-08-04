# PR #1061 R32 계약 진단

- 대상 HEAD: `6cde10136`
- 라운드: R32 진단·설계 전용
- 제약: 코드 수정 없음, Git 상태 변경 명령 없음, 읽기 전용 SQL만 사용
- 조사 원칙: 확인한 출력은 축약하지 않고 그대로 기록하며, UUID는 사용자 노출 자료에서 제외한다.

## 조사 로그

### 0. 조사 시작

R31 최종 판정 보고서를 먼저 읽고, 41,100,000원 차이를 독립적인 읽기 전용 SQL로 재현한 뒤 코드 경로와 계약 경계를 추적한다.

### 0.1 R31 선행 판독

`docs/dev-reports/2026-08-04-1001-r31-final-review.md` 99줄 전체를 먼저 읽었다. R31이 제시한 재현 모집단은 `2026-01-01~2026-12-31`, 활성 거래처 master와 연결되는 27거래처, 비수금 journal의 401 매출과 110 채권이다. R31 주장은 401 `411,000,000원`, 110 차변 `452,100,000원`, 차이 `41,100,000원`이다. 아래 SQL에서는 이 수치를 인용하지 않고 스키마와 코드 조건에서 쿼리를 다시 구성한다.

### 0.2 대상 HEAD·작업트리 고정 확인

실행 명령:

```powershell
git rev-parse HEAD; git branch --show-current; git status --short
```

출력 원문:

```text
6cde10136dba112ea5b7cc95f831a3e637b2205b
?? docs/dev-reports/2026-08-04-1001-r32-contract-diagnosis.md
```

`git branch --show-current` 출력은 빈 줄이다. 요청한 `6cde10136` detached HEAD가 맞고, 작업트리에는 지시대로 조사 전에 만든 이 보고서만 신규 파일로 보인다.

### 0.3 읽기 전용 SQL 실행 대상 확인

실행 명령:

```powershell
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

출력 원문:

```text
NAMES                          IMAGE                                                  STATUS
samhan-slip-service            infrastructure-slip-service                            Up 4 hours (healthy)
samhan-product-service         infrastructure-product-service                         Up 6 hours (healthy)
samhan-api-gateway             infrastructure-api-gateway                             Up 6 hours (healthy)
samhan-accounting-service      infrastructure-accounting-service                      Up 6 hours (healthy)
samhan-auth-service            infrastructure-auth-service                            Up 6 hours (healthy)
samhan-notification-service    infrastructure-notification-service                    Up 6 hours (healthy)
samhan-partner-order-service   infrastructure-partner-order-service                   Up 6 hours (healthy)
samhan-dc-config-service       infrastructure-dc-config-service                       Up 6 hours (healthy)
samhan-eureka                  infrastructure-eureka-server                           Up 6 hours (healthy)
samhan-postgres                postgres:16-alpine                                     Up 6 hours (healthy)
samhan-user-service            infrastructure-user-service                            Up 6 hours (healthy)
samhan-inventory-service       infrastructure-inventory-service                       Up 6 hours (healthy)
samhan-partner-service         infrastructure-partner-service                         Up 6 hours (healthy)
samhan-arologis-service        infrastructure-arologis-service                        Up 2 hours (healthy)
samhan-partner-auth-service    infrastructure-partner-auth-service                    Up 6 hours (healthy)
samhan-grafana                 grafana/grafana:11.3.1                                 Up 6 hours (healthy)
samhan-minio                   minio/minio:latest                                     Up 6 hours (healthy)
samhan-elasticsearch           docker.elastic.co/elasticsearch/elasticsearch:8.15.3   Up 6 hours (healthy)
samhan-rabbitmq                rabbitmq:3.13-management-alpine                        Up 6 hours (healthy)
samhan-redis                   redis:7-alpine                                         Up 6 hours (healthy)
```

PostgreSQL은 `samhan-postgres` 컨테이너에서 실행 중이다. 이후 DB 명령은 모두 `psql -c` 한 번 호출 형태의 `SELECT` 또는 카탈로그 조회만 사용한다.

DB 컨테이너 환경에서 사용자·DB 이름을 변수로 읽어 실제 연결만 확인했다. 비밀번호나 전체 환경은 출력하지 않았다.

실행 명령:

```powershell
$dbEnv = docker inspect samhan-postgres --format '{{range .Config.Env}}{{println .}}{{end}}'; $dbUser = ($dbEnv | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''; $dbName = ($dbEnv | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''; docker exec samhan-postgres psql -U $dbUser -d $dbName -c "SELECT current_database() AS database_name, current_user AS database_user;"
```

출력 원문:

```text
 database_name | database_user 
---------------+---------------
 postgres      | samhan
(1 row)
```

서비스별 DB 목록을 카탈로그에서 확인했다.

실행 명령:

```powershell
$dbEnv = docker inspect samhan-postgres --format '{{range .Config.Env}}{{println .}}{{end}}'; $dbUser = ($dbEnv | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''; $dbName = ($dbEnv | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''; docker exec samhan-postgres psql -U $dbUser -d $dbName -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
```

출력 원문:

```text
            datname             
--------------------------------
 accounting_db
 accounting_probe
 accounting_probe_codex_luna_r2
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
 user_db
(19 rows)
```

## 1. 세 경로의 금액 산출 기준

### 1.1 41,100,000원 독립 재현: 대상 테이블 식별

`accounting_db` 관련 테이블 조회 출력 원문:

```text
 table_schema |              table_name              
--------------+--------------------------------------
 public       | accounting_audit_logs
 public       | accounting_edit_requests
 public       | accounting_periods
 public       | bank_accounts
 public       | bank_depositor_partner_mapping
 public       | cash_receipt_number_sequences
 public       | cash_receipts
 public       | chart_of_accounts
 public       | journal_collab_comments
 public       | journal_collab_suggestions
 public       | journal_lines
 public       | journal_number_sequences
 public       | journals
 public       | purchase_accounting_slip_allocations
 public       | purchase_accounting_slip_lines
 public       | purchase_accounting_slips
 public       | sales_accounting_slip_allocations
 public       | sales_accounting_slip_lines
 public       | sales_accounting_slips
 public       | supplier_bank_accounts
(20 rows)
```

`partner_db` 전체 테이블 조회 출력 원문:

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
(11 rows)
```

재현에 필요한 원장은 `accounting_db.journals`·`journal_lines`·`chart_of_accounts`, 선택 가능 거래처 확인은 `partner_db.partners`에 있다.

`accounting_db` 대상 열 조회 출력 원문:

```text
    table_name     | ordinal_position |     column_name     |          data_type          | is_nullable 
-------------------+------------------+---------------------+-----------------------------+-------------
 cash_receipts     |                1 | id                  | uuid                        | NO
 cash_receipts     |                2 | slip_no             | character varying           | NO
 cash_receipts     |                3 | partner_id          | uuid                        | NO
 cash_receipts     |                4 | amount              | numeric                     | NO
 cash_receipts     |                5 | transaction_date    | date                        | NO
 cash_receipts     |                6 | kind                | character varying           | NO
 cash_receipts     |                7 | memo                | text                        | YES
 cash_receipts     |                8 | journal_id          | uuid                        | YES
 cash_receipts     |                9 | external_ref        | character varying           | NO
 cash_receipts     |               10 | created_at          | timestamp without time zone | NO
 cash_receipts     |               11 | created_by          | character varying           | NO
 cash_receipts     |               12 | modified_at         | timestamp without time zone | YES
 cash_receipts     |               13 | modified_by         | character varying           | YES
 cash_receipts     |               14 | deleted_at          | timestamp without time zone | YES
 cash_receipts     |               15 | deleted_by          | character varying           | YES
 cash_receipts     |               16 | is_deleted          | boolean                     | NO
 cash_receipts     |               17 | status              | character varying           | NO
 cash_receipts     |               18 | debit_account_code  | character varying           | NO
 cash_receipts     |               19 | credit_account_code | character varying           | NO
 cash_receipts     |               20 | version             | bigint                      | NO
 cash_receipts     |               21 | reverse_journal_id  | uuid                        | YES
 cash_receipts     |               22 | lines_json          | jsonb                       | YES
 chart_of_accounts |                1 | code                | character varying           | NO
 chart_of_accounts |                2 | name                | character varying           | NO
 chart_of_accounts |                3 | category            | character varying           | NO
 chart_of_accounts |                4 | parent_code         | character varying           | YES
 chart_of_accounts |                5 | is_leaf             | boolean                     | NO
 chart_of_accounts |                6 | display_order       | integer                     | NO
 chart_of_accounts |                7 | created_at          | timestamp without time zone | NO
 chart_of_accounts |                8 | created_by          | character varying           | NO
 chart_of_accounts |                9 | modified_at         | timestamp without time zone | YES
 chart_of_accounts |               10 | modified_by         | character varying           | YES
 chart_of_accounts |               11 | deleted_at          | timestamp without time zone | YES
 chart_of_accounts |               12 | deleted_by          | character varying           | YES
 chart_of_accounts |               13 | is_deleted          | boolean                     | NO
 journal_lines     |                1 | id                  | uuid                        | NO
 journal_lines     |                2 | journal_id          | uuid                        | NO
 journal_lines     |                3 | line_no             | integer                     | NO
 journal_lines     |                4 | account_code        | character varying           | NO
 journal_lines     |                5 | debit_amount        | numeric                     | NO
 journal_lines     |                6 | credit_amount       | numeric                     | NO
 journal_lines     |                7 | partner_id          | uuid                        | YES
 journal_lines     |                8 | memo                | character varying           | YES
 journal_lines     |                9 | created_at          | timestamp without time zone | NO
 journal_lines     |               10 | created_by          | character varying           | NO
 journal_lines     |               11 | modified_at         | timestamp without time zone | YES
 journal_lines     |               12 | modified_by         | character varying           | YES
 journal_lines     |               13 | deleted_at          | timestamp without time zone | YES
 journal_lines     |               14 | deleted_by          | character varying           | YES
 journal_lines     |               15 | is_deleted          | boolean                     | NO
 journals          |                1 | id                  | uuid                        | NO
 journals          |                2 | journal_no          | character varying           | NO
 journals          |                3 | journal_date        | date                        | NO
 journals          |                4 | description         | character varying           | YES
 journals          |                5 | source_type         | character varying           | NO
 journals          |                6 | source_ref_id       | uuid                        | YES
 journals          |                7 | status              | character varying           | NO
 journals          |                8 | posted_at           | timestamp without time zone | YES
 journals          |                9 | posted_by           | character varying           | YES
 journals          |               10 | reversed_journal_id | uuid                        | YES
 journals          |               11 | version             | bigint                      | NO
 journals          |               12 | created_at          | timestamp without time zone | NO
 journals          |               13 | created_by          | character varying           | NO
 journals          |               14 | modified_at         | timestamp without time zone | YES
 journals          |               15 | modified_by         | character varying           | YES
 journals          |               16 | deleted_at          | timestamp without time zone | YES
 journals          |               17 | deleted_by          | character varying           | YES
 journals          |               18 | is_deleted          | boolean                     | NO
 journals          |               19 | source_ref          | character varying           | YES
 journals          |               20 | cash_receipt_id     | uuid                        | YES
(70 rows)
```

`partner_db.partners` 열 조회 출력 원문:

```text
 table_name | ordinal_position |       column_name        |          data_type          | is_nullable 
------------+------------------+--------------------------+-----------------------------+-------------
 partners   |                1 | id                       | uuid                        | NO
 partners   |                2 | partner_code             | character varying           | NO
 partners   |                3 | biz_no                   | character varying           | NO
 partners   |                4 | name                     | character varying           | NO
 partners   |                5 | address                  | character varying           | YES
 partners   |                6 | phone                    | character varying           | YES
 partners   |                7 | credit_limit             | numeric                     | NO
 partners   |                8 | outstanding_balance      | numeric                     | NO
 partners   |                9 | status                   | character varying           | NO
 partners   |               10 | created_at               | timestamp without time zone | NO
 partners   |               11 | created_by               | character varying           | NO
 partners   |               12 | modified_at              | timestamp without time zone | YES
 partners   |               13 | modified_by              | character varying           | YES
 partners   |               14 | deleted_at               | timestamp without time zone | YES
 partners   |               15 | deleted_by               | character varying           | YES
 partners   |               16 | is_deleted               | boolean                     | NO
 partners   |               17 | sub_biz_no               | character varying           | YES
 partners   |               18 | representative           | character varying           | YES
 partners   |               19 | business_type            | character varying           | YES
 partners   |               20 | industry                 | character varying           | YES
 partners   |               21 | fax                      | character varying           | YES
 partners   |               22 | email                    | character varying           | YES
 partners   |               23 | email2                    | character varying           | YES
 partners   |               24 | mobile                   | character varying           | YES
 partners   |               25 | zip_code1                | character varying           | YES
 partners   |               26 | address1                 | character varying           | YES
 partners   |               27 | zip_code2                | character varying           | YES
 partners   |               28 | address2                 | character varying           | YES
 partners   |               29 | search_keyword           | character varying           | YES
 partners   |               30 | partner_group1           | character varying           | YES
 partners   |               31 | partner_group2           | character varying           | YES
 partners   |               32 | website                  | character varying           | YES
 partners   |               33 | currency                 | character varying           | YES
 partners   |               34 | shipment_target          | boolean                     | YES
 partners   |               35 | sales_type               | character varying           | YES
 partners   |               36 | purchase_type            | character varying           | YES
 partners   |               37 | receivable_no_mgmt       | character varying           | YES
 partners   |               38 | payable_no_mgmt          | character varying           | YES
 partners   |               39 | outbound_adjustment_rate | numeric                     | YES
 partners   |               40 | inbound_adjustment_rate  | numeric                     | YES
 partners   |               41 | sales_price_group        | character varying           | YES
 partners   |               42 | purchase_price_group     | character varying           | YES
 partners   |               43 | credit_period_days       | integer                     | YES
 partners   |               44 | payment_due_days         | integer                     | YES
 partners   |               45 | registration_date        | date                        | YES
 partners   |               46 | transfer_info            | character varying           | YES
 partners   |               47 | note                     | text                        | YES
 partners   |               48 | manager_name             | character varying           | YES
 partners   |               49 | deleted_by_name          | character varying           | YES
(49 rows)
```

UUID 값은 출력하지 않았다. 교차 DB 집계에는 내부 조인 키만 사용하고 최종 출력은 거래처코드·이름과 금액만 낸다.

두 계정과목의 DB 정의를 먼저 확인했다.

실행 명령:

```sql
SELECT code, name, category, parent_code, is_leaf, is_deleted
FROM chart_of_accounts
WHERE code IN ('110','401')
ORDER BY code;
```

출력 원문:

```text
 code |    name    | category | parent_code | is_leaf | is_deleted 
------+------------+----------+-------------+---------+------------
 110  | 외상매출금 | ASSET    | 100         | t       | f
 401  | 상품매출   | REVENUE  | 400         | t       | f
(2 rows)
```

### 1.2 41,100,000원 독립 재현 결과

실행 명령은 `docker exec ... psql -U <컨테이너의 POSTGRES_USER> -d accounting_db -c "<아래 SQL>"` 형태였다. `INSERT/UPDATE/DELETE`는 없고 단일 `SELECT`만 실행했다.

```sql
WITH partner_amounts AS (
    SELECT
        jl.partner_id,
        SUM(CASE WHEN jl.account_code = '401' THEN jl.credit_amount - jl.debit_amount ELSE 0 END) AS sales_401,
        SUM(CASE WHEN jl.account_code = '110' THEN jl.debit_amount - jl.credit_amount ELSE 0 END) AS receivable_110,
        SUM(CASE WHEN jl.account_code = '401' THEN jl.debit_amount ELSE 0 END) AS debit_401,
        SUM(CASE WHEN jl.account_code = '401' THEN jl.credit_amount ELSE 0 END) AS credit_401,
        SUM(CASE WHEN jl.account_code = '110' THEN jl.debit_amount ELSE 0 END) AS debit_110,
        SUM(CASE WHEN jl.account_code = '110' THEN jl.credit_amount ELSE 0 END) AS credit_110
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    WHERE j.journal_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
      AND j.status IN ('POSTED','REVERSED')
      AND j.is_deleted = false
      AND jl.is_deleted = false
      AND j.cash_receipt_id IS NULL
      AND jl.partner_id IS NOT NULL
    GROUP BY jl.partner_id
),
sales_partners AS (
    SELECT *
    FROM partner_amounts
    WHERE sales_401 <> 0
)
SELECT
    COUNT(*) AS partner_count,
    TO_CHAR(SUM(debit_401), 'FM999,999,999,990') AS debit_401,
    TO_CHAR(SUM(credit_401), 'FM999,999,999,990') AS credit_401,
    TO_CHAR(SUM(sales_401), 'FM999,999,999,990') AS net_401,
    TO_CHAR(SUM(debit_110), 'FM999,999,999,990') AS debit_110,
    TO_CHAR(SUM(credit_110), 'FM999,999,999,990') AS credit_110,
    TO_CHAR(SUM(receivable_110), 'FM999,999,999,990') AS net_110,
    TO_CHAR(SUM(receivable_110 - sales_401), 'FM999,999,999,990') AS net_110_minus_net_401
FROM sales_partners;
```

출력 원문:

```text
 partner_count | debit_401 | credit_401  |   net_401   |  debit_110  | credit_110 |   net_110   | net_110_minus_net_401 
---------------+-----------+-------------+-------------+-------------+------------+-------------+-----------------------
            27 | 0         | 411,000,000 | 411,000,000 | 452,100,000 | 0          | 452,100,000 | 41,100,000
(1 row)
```

**재현 판정: R31의 41,100,000원은 현재 DB에서 독립 재현됐다.** 27거래처의 401은 전액 대변이고 110은 전액 차변이다. 따라서 이 모집단에서는 `110 - 401 = 41,100,000원`, 곧 401의 정확한 10%다. 계정과목 정의상 110은 자산인 외상매출금, 401은 수익인 상품매출이며, 실데이터는 매출 공급가액 401과 VAT를 포함한 채권 110의 전형적인 110% 관계를 보인다.

### 1.3 집계 경로: 110 채권 필드를 그대로 노출

1. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:115~124`
   - `GET /accounting/sales/aggregate`가 `SalesAggregateService.aggregate`를 호출한다.
2. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAggregateService.java:81~89`
   - `PartnerLedgerReadModelService.read(...).partners()`의 `salesTotal`, `paymentTotal`, `receivableBalance`를 그대로 `SalesAggregateRow`에 담는다.
3. `PartnerLedgerReadModelService.java:67~72,205~206`
   - 401은 `salesTotal`, 110 차변은 `receivableDebit`, 110 비수금 대변과 확정 입금은 `paymentTotal`, 집계 채권은 `receivableDebit - paymentTotal`이다.

핵심 원문:

```java
115:     @GetMapping("/accounting/sales/aggregate")
116:     @RequirePermission(page = REPORTS_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
117:     public ApiResponse<List<SalesAggregateRow>> aggregate(
118:             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
119:             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
120:             @RequestParam(required = false) String partnerCode,
121:             @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
122:         checkReportViewPermission(roleHeader);
123:         return ApiResponse.ok(salesAggregateService.aggregate(from, to, partnerCode));
124:     }
```

```java
81:     public List<SalesAggregateRow> aggregate(LocalDate from, LocalDate to, String partnerCode) {
82:         if (readModelService != null) {
83:             return readModelService.read(partnerCode, from, to).partners().stream()
84:                     .map(partner -> new SalesAggregateRow(
85:                             partner.partnerCode() == null ? "-" : partner.partnerCode(),
86:                             partner.businessNumber() == null ? "" : partner.businessNumber().replaceAll("[^0-9]", ""),
87:                             partner.partnerName() == null ? "-" : partner.partnerName(),
88:                             partner.salesTotal(), partner.paymentTotal(), partner.receivableBalance(), from, to))
89:                     .toList();
```

### 1.4 상세 경로: 401 `SALE_SUMMARY` 문서만 전달하고 110 채권 필드는 버림

1. `AccountingReportController.java:155~163`
   - `GET /accounting/journals/partner-ledger`가 `PartnerLedgerReadService.read`를 호출한다.
2. `PartnerLedgerReadService.java:51~60`
   - 같은 공통 read model에서 `selected()`를 읽지만 응답에는 `partner.documents()`만 담는다. `receivableBalance`는 `PartnerLedgerResponse`에 존재하지 않아 여기서 버려진다.
3. `PartnerLedgerResponse.java:8~14,26~34`
   - 응답 타입은 거래처 정보와 문서의 `amount/lines`만 갖고, 시작잔액·집계 채권·110 조정 문서가 없다.

핵심 원문:

```java
155:     /** 출고 판매전표 품목과 확정 입금보고서를 함께 반환하는 거래처별 원장 read 계약. */
156:     @GetMapping("/accounting/journals/partner-ledger")
157:     @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
158:     public ApiResponse<PartnerLedgerResponse> partnerLedger(
159:             @RequestParam(required = false) String partnerCode,
160:             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
161:             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
162:         return ApiResponse.ok(partnerLedgerReadService.read(partnerCode, from, to));
163:     }
```

```java
51:     @Transactional(readOnly = true)
52:     public PartnerLedgerResponse read(String partnerCode, LocalDate from, LocalDate to) {
53:         if (readModelService != null) {
54:             PartnerLedgerReadModel.Partner partner = readModelService.read(partnerCode, from, to).selected();
55:             if (partner == null) {
56:                 return new PartnerLedgerResponse(partnerCode, null, null, from, to, List.of());
57:             }
58:             return new PartnerLedgerResponse(partner.partnerCode(), partner.partnerName(),
59:                     partner.businessNumber(), from, to, partner.documents().stream()
60:                     .map(this::responseDocument).toList());
```

### 1.5 상세 화면의 401 방향과 인쇄 경로

`clients/desktop/src/renderer/api/partnerLedgerApi.ts:156~193`이 상세 문서를 차·대변 line으로 바꾼다. `SALE`이고 품목 line이 있을 때만 차변이다. 그 밖의 모든 문서, 즉 `SALE_SUMMARY`와 `CASH_RECEIPT`는 대변이다.

```typescript
156: export function buildPartnerLedgerLines(
157:   documents: PartnerLedgerSourceDocument[],
158: ): LedgerLine[] {
159:   let balance = 0
160:   const orderedDocuments = documents
161:     .map((document, index) => ({ document, index }))
162:     .sort(compareDocuments)
163: 
164:   return orderedDocuments.flatMap(({ document }) => {
165:     const rows = document.type === 'SALE' && document.lines.length > 0
166:       ? document.lines.map((line) => ({
167:           date: document.date,
168:           journalNo: document.documentNo,
169:           accountCode: '',
170:           accountName: '',
171:           description: `${line.productName}${line.modelName ? ` (${line.modelName})` : ''}`,
172:           debit: line.lineAmount,
173:           credit: '0',
174:           deliveryAddress: document.deliveryAddress,
175:           documentType: document.type,
176:         }))
177:       : [{
178:           date: document.date,
179:           journalNo: document.documentNo,
180:           accountCode: '',
181:           accountName: '',
182:           description: document.type === 'CASH_RECEIPT' ? '입금보고서' : '',
183:           debit: '0',
184:           credit: document.amount,
185:           deliveryAddress: document.deliveryAddress,
186:           documentType: document.type,
187:         }]
188:     return rows.map((row) => {
189:       balance += Number(row.debit) - Number(row.credit)
190:       return { ...row, balance: String(balance) }
191:     })
192:   })
193: }
```

`partnerLedgerApi.ts:259~268,285~298`은 상세 GET 응답의 `documents`만 위 함수에 전달한다.

```typescript
259: export async function getLedgerData(
260:   partnerCode: string,
261:   from: string,
262:   to: string,
263: ): Promise<LedgerData> {
264:   const res = await apiClient.get<ApiEnvelope<PartnerLedgerResponse>>(
265:     '/accounting/journals/partner-ledger',
266:     { params: { partnerCode, from, to } },
267:   )
268:   return mapPartnerLedgerResponse(res.data.data, partnerCode)
```

```typescript
285: /** GET/POST가 공유하는 PartnerLedgerResponse를 화면 line 모델로 투영한다. */
286: export function mapPartnerLedgerResponse(
287:   source: PartnerLedgerResponse,
288:   fallbackPartnerCode?: string,
289: ): LedgerData {
290:   return {
291:     partnerCode: source.partnerCode ?? fallbackPartnerCode ?? '',
292:     partnerName: source.partnerName ?? '',
293:     partnerBusinessNo: source.partnerBusinessNo ?? '',
294:     chatRoomNames: [],
295:     periodFrom: source.periodFrom,
296:     periodTo: source.periodTo,
297:     lines: buildPartnerLedgerLines(source.documents ?? []),
298:   }
```

`clients/desktop/src/renderer/print/PartnerLedgerView.tsx:217~247`도 별도 계산 원천이 없다. 인쇄 라우트가 `getLedgerData`로 상세 GET을 다시 호출하고, 이미 401 기준으로 만들어진 line의 차변·대변·잔액을 합산한다.

```typescript
217:   const ledgerQuery = useQuery<LedgerData>({
218:     queryKey: ['partner-ledger-print', partnerCodeParam, periodFrom, periodTo],
219:     queryFn: () => getLedgerData(partnerCodeParam ?? '', periodFrom, periodTo),
220:     enabled: Boolean(partnerCodeParam),
221:   })
222:   const data: PartnerLedgerData | null = useMemo(() => {
223:     if (!ledgerQuery.data) return null
224:     const source = ledgerQuery.data
225:     const lines = source.lines.map((line) => ({
226:       date: line.date,
227:       slipNo: line.journalNo,
228:       description: line.description,
229:       debit: Number(line.debit) || 0,
230:       credit: Number(line.credit) || 0,
231:       balance: Number(line.balance) || 0,
232:       deliveryAddress: line.deliveryAddress,
233:     }))
234:     return {
235:       partnerCode: source.partnerCode,
236:       partnerName: source.partnerName,
237:       businessRegNo: source.partnerBusinessNo,
238:       chatRoomName: source.chatRoomNames.join(' / '),
239:       periodFrom: source.periodFrom,
240:       periodTo: source.periodTo,
241:       openingBalance: 0,
242:       lines,
243:       totalDebit: lines.reduce((sum, line) => sum + line.debit, 0),
244:       totalCredit: lines.reduce((sum, line) => sum + line.credit, 0),
245:       closingBalance: lines.at(-1)?.balance ?? 0,
246:     }
247:   }, [ledgerQuery.data])
```

### 1.6 세 경로 결론

- **집계의 `salesTotal`**: 401 순대변(단, canonical 판매전표가 있으면 전표 품목 합계로 교체).
- **집계의 `receivableBalance`**: 110 차변에서 비수금 110 대변과 확정 입금을 차감.
- **상세**: 110 필드를 받지 못하고 `documents`만 받음. journal-only 거래처는 401 순대변이 `SALE_SUMMARY.amount`.
- **인쇄**: 상세 API를 재호출하므로 상세와 동일한 401 문서 기준.
- **현재 FE 방향 결함 포함 시**: `SALE_SUMMARY`도 수금처럼 대변으로 투영되어 401 매출이 잔액을 감소시킨다.

따라서 “집계는 110, 상세·인쇄는 401”은 파일·메서드 단위로 확정됐다. 더 정확히는 집계 화면의 **채권 잔액 열**이 110이고, 집계 화면의 **매출 합계 열**은 상세 문서와 같은 401이다. 집계 채권과 상세/인쇄 기말을 비교할 때만 110 대 401 계약 불일치가 드러난다.

## 2. `PartnerLedgerContract` 강제 범위와 우회 지점

### 2.1 현 HEAD 계약 원문

`shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java` 전체 출력 원문:

```text
   1: package com.samhanair.logis.common.ledger;
   2: 
   3: import java.util.List;
   4: 
   5: /** 거래처 원장 산출기의 공통 업무 계약. public 응답에는 UUID를 포함하지 않는다. */
   6: public final class PartnerLedgerContract {
   7:     /** R22 개발책임자 결정의 원장 판매 상태 집합. */
   8:     public static final List<String> CANONICAL_SALE_STATUSES = List.of(
   9:             "CONFIRMED", "DELIVERED", "COMPLETED", "INSPECTING", "SHIPPING");
  10: 
  11:     private PartnerLedgerContract() { }
  12: }
```

**현 HEAD의 `PartnerLedgerContract`는 타입도 계산도 공유하지 않는다.** 강제하는 것은 판매전표 조회에 쓸 상태 문자열 5개뿐이다. 계정과목 코드, 차변·대변 방향, VAT 처리, `salesTotal`·`receivableBalance`·상세 문서 금액의 관계, 필터 해소 실패의 의미, snapshot의 live/restored 출처는 전혀 표현하지 않는다. 클래스 Javadoc의 “공통 업무 계약” 범위가 실제 구현보다 넓다.

### 2.2 실제 공유물은 `PartnerLedgerReadModel`, 그러나 수치 불변식은 없음

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModel.java:8~36`은 집계 필드와 상세 문서를 한 타입에 담는다.

```java
8: /** 집계·상세·인쇄가 공유하는 거래처 원장 산출 결과. UUID는 내부 조인 전용이다. */
9: public record PartnerLedgerReadModel(List<Partner> partners, Partner selected) {
10:     public PartnerLedgerReadModel {
11:         partners = partners == null ? List.of() : List.copyOf(partners);
12:     }
13: 
14:     public record Partner(UUID partnerId, String partnerCode, String partnerName, String businessNumber,
15:                           List<Document> documents, BigDecimal salesTotal, BigDecimal paymentTotal,
16:                           BigDecimal receivableBalance) {
17:         public Partner {
18:             documents = documents == null ? List.of() : List.copyOf(documents);
19:             salesTotal = salesTotal == null ? BigDecimal.ZERO : salesTotal;
20:             paymentTotal = paymentTotal == null ? BigDecimal.ZERO : paymentTotal;
21:             receivableBalance = receivableBalance == null ? BigDecimal.ZERO : receivableBalance;
22:         }
23:     }
24: 
25:     public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT }
26: 
27:     public record Document(DocumentType type, String documentNo, LocalDate date, String partnerCode,
28:                            String partnerName, String deliveryAddress, BigDecimal amount,
29:                            List<Line> lines) {
30:         public Document {
31:             lines = lines == null ? List.of() : List.copyOf(lines);
32:         }
33:     }
34: 
35:     public record Line(String productName, String modelName, int quantity,
36:                        BigDecimal unitPriceWithVat, BigDecimal lineAmount) { }
```

이 타입은 null 정규화와 문서 목록 복사만 강제한다. `receivableBalance == 문서 차변 - 문서 대변`, `SALE_SUMMARY.amount`가 110인지 401인지, `SALE_SUMMARY`가 차변인지 같은 계산 규칙은 생성자에 없다. 따라서 **타입 공유는 되었지만 계산 계약은 아니다.**

### 2.3 같은 산출기 내부의 분기

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java`에서 계정과목과 산출식이 다음처럼 갈린다.

- `:34~35`: 이 서비스 자체가 `REVENUE="401"`, `RECEIVABLES="110"`을 선언한다. `PartnerLedgerContract`에는 없다.
- `:55~72`: journal 합계를 한 번 읽지만, 401은 `journalSales = credit - debit`, 110은 `receivableDebit += debit`, `paymentTotal += credit`로 서로 다른 bucket에 넣는다.
- `:109~117`: slip 문서가 없으면 401 `journalSales`만 `SALE_SUMMARY.amount`에 넣는다.
- `:196~207`: 동일 `Partner` record의 `receivableBalance`에는 110 차변 누계에서 `paymentTotal`을 뺀 값을 넣는다.

해당 코드 원문:

```java
34:     private static final String REVENUE = "401";
35:     private static final String RECEIVABLES = "110";
36: 
37:     /** 정책 정본: R17의 현행 집계 기준 상태 집합. slip-service도 이 계약으로 조회한다. */
38:     public static final List<String> CANONICAL_SALE_STATUSES = PartnerLedgerContract.CANONICAL_SALE_STATUSES;
39:     /** 정책 정본: slip 없는 journal 매출은 기존 금액을 summary 문서로 표시한다. */
40:     public static final PartnerLedgerReadModel.DocumentType JOURNAL_ONLY_DOCUMENT =
41:             PartnerLedgerReadModel.DocumentType.SALE_SUMMARY;
```

```java
55:         List<JournalLineRepository.PartnerAccountTotal> journalTotals =
56:                 journalLineRepository.aggregatePostedByPartnerAccount(from, to);
57:         Map<UUID, MutablePartner> groups = new LinkedHashMap<>();
58:         for (var total : journalTotals) {
59:             UUID id = total.getPartnerId();
60:             if (id == null || selectedId != null && !selectedId.equals(id)
61:                     || total.getSourceType() == JournalSourceType.CASH_RECEIPT) {
62:                 continue;
63:             }
64:             MutablePartner group = groups.computeIfAbsent(id, ignored -> new MutablePartner(id));
65:             BigDecimal debit = zero(total.getDebitTotal());
66:             BigDecimal credit = zero(total.getCreditTotal());
67:             if (REVENUE.equals(total.getAccountCode())) {
68:                 group.journalSales = group.journalSales.add(credit).subtract(debit);
69:             } else if (RECEIVABLES.equals(total.getAccountCode())) {
70:                 group.receivableDebit = group.receivableDebit.add(debit);
71:                 group.paymentTotal = group.paymentTotal.add(credit);
72:             }
```

```java
109:         for (MutablePartner group : groups.values()) {
110:             group.salesTotal = group.salesSeen ? group.slipSales : group.journalSales;
111:             if (!group.salesSeen && group.journalSales.signum() != 0) {
112:                 PartnerSummary summary = summaries.get(group.partnerId);
113:                 group.documents.add(new PartnerLedgerReadModel.Document(
114:                         JOURNAL_ONLY_DOCUMENT, journalSummaryDocumentNo(group, summary),
115:                         from, summary == null ? null : summary.partnerCode(),
116:                         summary == null ? null : summary.name(), null, group.journalSales, List.of()));
117:             }
```

```java
196:     private static PartnerLedgerReadModel.Partner freeze(MutablePartner group, PartnerSummary summary) {
197:         String code = group.partnerCode != null ? group.partnerCode : summary == null ? null : summary.partnerCode();
198:         String name = group.partnerName != null ? group.partnerName : summary == null ? null : summary.name();
199:         String biz = summary == null ? null : summary.bizNo();
200:         List<PartnerLedgerReadModel.Document> docs = group.documents.stream()
201:                 .sorted(Comparator.comparing(PartnerLedgerReadModel.Document::date,
202:                         Comparator.nullsFirst(Comparator.naturalOrder())).thenComparing(
203:                                 PartnerLedgerReadModel.Document::documentNo, Comparator.nullsFirst(String::compareTo)))
204:                 .toList();
205:         return new PartnerLedgerReadModel.Partner(group.partnerId, code, name, biz, docs,
206:                 group.salesTotal, group.paymentTotal, group.receivableDebit.subtract(group.paymentTotal));
207:     }
```

갈라짐은 공통 모델을 소비한 뒤가 아니라 **공통 모델을 만드는 한 메서드 안**에서 이미 발생한다. 401은 상세 문서의 금액, 110은 집계 채권 필드가 된다. 공유 타입은 이 두 값의 관계를 검사하지 않아 분리를 허용한다.

### 2.4 R18이 통합한 것과 통합하지 않은 것

Git 이력 출력 원문:

```text
68111eb02 [FIX] #1061 R22 — 개발책임자 결정 반영: 원장 상태 집합에 INSPECTING·SHIPPING 포함
505cbb78e [FIX] #1061 R20 — R19 결함 2건 (무필터 차단 · UUID 노출)
ff0171c19 [FIX] #1061 R18 — 집계·상세·인쇄를 공통 산출기로 통합 (구조 fix)
7356b4d28 [FIX] #1061 R16 — 진자 종결: 정상 금액 도달 + 오염 차단 동시 (RED-first)
7a48b50d4 [FIX] #1061 R15 — R14 회귀 차단 (금액 오염) · 사업자번호 조회 (RED-first)
90daac13d [FIX] #1061 R14 — R13 적대검증 결함 1~4 (RED-first)
28815b3c9 (feat/1001-ledger-spec-rest) [FIX] #1001 R14 — 수금 정본을 입금보고서로 · 번호를 저장값 그대로 표시
e125c851a [FIX] #1001 R13 — code-only 상세 422 + 인쇄 미리보기 미개방
9f09fbde8 [FIX] #1001 R11 — 무필터 집계 후보 집합 확장 + R9 수치 정정
f944aeb7a [FIX] #1001 무필터 전체 집계도 출고 slip 원천 사용
bd9082802 [FIX] #1001 목록과 상세의 금액 불일치 7,724,000원 해소
dfeef8510 [FIX] #1001 원장 조회를 partner_id 로 — 거래처 선택 시 매출 소실 해소
9e07125a2 [FEAT] #1001 거래처별 원장 — 판매전표·입금보고서 2종 + 부가세 포함 단가
920a5043a [FIX] #831 — partner lookup UNAVAILABLE 붕괴 계열 sweep (#924)
94eb29a30 fix(accounting): 거래처코드 sweep 리뷰 — PartnerAgingLine UUID 노출 제거 + N+1 batch화 (Codex 리뷰)
5e5b08735 feat(accounting): 거래처코드(사업자번호) 열 sweep — 회계 보고서 6종 (개발책임자 지시)
c48e156c5 feat(accounting-service): PR-E2 GAS B accounting 4건 이식 — 원장/거래명세서/계산서/일마감
```

`git blame`은 현재의 갈라진 두 계산과 공통 산출기 도입이 모두 R18 커밋 `ff0171c198`에서 함께 들어왔음을 보인다.

```text
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 29) /** 원장 원천·식별·정책을 한 번 해석해 모든 표면에 제공하는 공통 산출기. */
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 30) @Service
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 31) @RequiredArgsConstructor
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 32) @Transactional(readOnly = true)
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 33) public class PartnerLedgerReadModelService {
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 34)     private static final String REVENUE = "401";
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 35)     private static final String RECEIVABLES = "110";
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 36) 
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 37)     /** 정책 정본: R17의 현행 집계 기준 상태 집합. slip-service도 이 계약으로 조회한다. */
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 38)     public static final List<String> CANONICAL_SALE_STATUSES = PartnerLedgerContract.CANONICAL_SALE_STATUSES;
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 39)     /** 정책 정본: slip 없는 journal 매출은 기존 금액을 summary 문서로 표시한다. */
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 40)     public static final PartnerLedgerReadModel.DocumentType JOURNAL_ONLY_DOCUMENT =
ff0171c198 (ewoo14 2026-08-04 00:35:57 +0900 41)             PartnerLedgerReadModel.DocumentType.SALE_SUMMARY;
```

R18 보고서가 실제로 고정한 목표는 `receivableBalance == 상세 기말`이 아니라 다음 두 가지였다.

```text
- slip 없는 journal 매출: 현행 집계 금액을 보존하고 상세·인쇄에도 `SALE_SUMMARY` 문서로 표시한다.
- 집계 totals와 상세 documents의 매출 합은 같은 `PartnerLedgerReadModel` 산출값을 사용한다.
```

즉 R18의 “세 경로 일치”에서 비교한 집계 값은 **401 `salesTotal`**, 상세 값은 **401 `documents.amount`**였다. 110 `receivableBalance`와 상세 line의 기말잔액을 동일하게 만드는 목표나 검증은 없었다.

### 2.5 R18 회귀 게이트가 놓친 정확한 구멍

`services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelServiceTest.java:80~99`의 journal-only 회귀는 401 한 줄만 만든다. 110과 VAT 차이를 함께 넣지 않는다.

```java
80:     void journalOnlySalesBecomePubliclyUsableSummaryDocumentsWithoutUuid() {
81:         UUID partnerId = UUID.randomUUID();
82:         PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0005", "대상", "1653510155", "");
83:         when(partnerLookupClient.findByPartnerCodeResult("P-2026-0005"))
84:                 .thenReturn(PartnerLookupClient.LookupResult.found(partner));
85:         when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
86:                 new Total(partnerId, "401", BigDecimal.ZERO, new BigDecimal("26000000"))));
87:         when(salesClient.find(FROM, TO, "P-2026-0005", partnerId)).thenReturn(List.of());
88: 
89:         var result = new PartnerLedgerReadModelService(
90:                 salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
91:                 partnerLookupClient).read("P-2026-0005", FROM, TO);
92: 
93:         assertThat(result.selected().salesTotal()).isEqualByComparingTo("26000000");
94:         assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::type)
95:                 .containsExactly(PartnerLedgerReadModel.DocumentType.SALE_SUMMARY);
96:         assertThat(result.selected().documents().get(0).documentNo()).doesNotContain(partnerId.toString());
97:         assertThat(result.selected().documents().get(0).documentNo()).isEqualTo("P-2026-0005");
98:         assertThat(result.selected().partnerId()).isNotNull();
99:     }
```

`clients/desktop/src/renderer/api/partnerLedgerApi.test.ts:20~35`의 잔액 회귀도 `SALE`과 `CASH_RECEIPT`만 사용한다. `SALE_SUMMARY`가 없다.

```typescript
20:   it('keeps source order and computes a running debit-minus-credit balance', () => {
21:     const lines = buildPartnerLedgerLines([
22:       {
23:         type: 'SALE', documentNo: '2026/08/01-1', date: '2026-08-01', deliveryAddress: null,
24:         amount: '100', lines: [{ productName: 'A', modelName: null, quantity: 1,
25:           unitPriceWithVat: '100', lineAmount: '100' }],
26:       },
27:       {
28:         type: 'CASH_RECEIPT', documentNo: '2026/08/02-1', date: '2026-08-02', deliveryAddress: null,
29:         amount: '40', lines: [],
30:       },
31:     ])
32: 
33:     expect(lines.map((line) => line.balance)).toEqual(['100', '60'])
34:     expect(lines.map((line) => line.journalNo)).toEqual(['2026/08/01-1', '2026/08/02-1'])
35:   })
```

결론:

1. R18은 **호출 경로**를 공통 산출기로 모았다.
2. `PartnerLedgerContract`는 그 공통 산출기의 계산 타입이 아니라 **slip 상태 상수 저장소**였다.
3. 공통 산출 결과에 `documents`, `salesTotal`, `receivableBalance`를 병렬 필드로 두고 상호 불변식을 두지 않았다.
4. R18 테스트는 `401 salesTotal == 401 document amount`만 보았고, `110 = 401 + VAT`, `상세 closing == 집계 receivableBalance`, `SALE_SUMMARY는 차변`을 보지 않았다.
5. 따라서 R18 통합은 110/401 갈라짐을 “막지 못한” 정도가 아니라, 그 갈라짐을 포함한 산출 구조를 하나의 객체에 함께 고정했다.

## 3. 110·401 기준의 업무 의미와 실데이터 대가

### 3.1 현 DB 27거래처별 대가

두 DB의 UUID는 PowerShell 메모리에서만 내부 조인 키로 사용했다. 화면·보고서 출력은 활성 master의 거래처코드·이름만 포함한다. 두 SQL 모두 `psql -c`의 `SELECT`다.

```sql
-- accounting_db
WITH partner_amounts AS (
    SELECT
        jl.partner_id,
        SUM(CASE WHEN jl.account_code = '401' THEN jl.credit_amount - jl.debit_amount ELSE 0 END) AS sales_401,
        SUM(CASE WHEN jl.account_code = '110' THEN jl.debit_amount - jl.credit_amount ELSE 0 END) AS receivable_110
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    WHERE j.journal_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
      AND j.status IN ('POSTED','REVERSED')
      AND j.is_deleted = false
      AND jl.is_deleted = false
      AND j.cash_receipt_id IS NULL
      AND jl.partner_id IS NOT NULL
    GROUP BY jl.partner_id
)
SELECT partner_id, sales_401, receivable_110
FROM partner_amounts
WHERE sales_401 <> 0
ORDER BY partner_id;

-- partner_db
SELECT id, partner_code, name
FROM partners
WHERE is_deleted = false;
```

최종 출력 원문:

```text

거래처코드       거래처명       401_상품매출   110_외상매출금  차이_110-401
-----       ----       --------   ---------  ----------
P-2026-0002 한국공조시스템(주) 5,000,000  5,500,000  500,000   
P-2026-0003 부산냉난방테크    22,000,000 24,200,000 2,200,000 
P-2026-0004 광주에어시스템    9,000,000  9,900,000  900,000   
P-2026-0005 대구HVAC솔루션  26,000,000 28,600,000 2,600,000 
P-2026-0006 인천공조산업     13,000,000 14,300,000 1,300,000 
P-2026-0007 울산냉난방엔지니어링 30,000,000 33,000,000 3,000,000 
P-2026-0008 수원에어컨센터    17,000,000 18,700,000 1,700,000 
P-2026-0009 대전공조테크     4,000,000  4,400,000  400,000   
P-2026-0010 (주)성남에어시스템 21,000,000 23,100,000 2,100,000 
P-2026-0012 용인HVAC산업   25,000,000 27,500,000 2,500,000 
P-2026-0013 안양공조에너지    12,000,000 13,200,000 1,200,000 
P-2026-0014 부천에어테크     29,000,000 31,900,000 2,900,000 
P-2026-0015 남양주냉난방     16,000,000 17,600,000 1,600,000 
P-2026-0016 춘천공조설비     3,000,000  3,300,000  300,000   
P-2026-0017 원주에어컨공업    20,000,000 22,000,000 2,000,000 
P-2026-0018 강릉HVAC솔루션  7,000,000  7,700,000  700,000   
P-2026-0019 청주공조에너지    24,000,000 26,400,000 2,400,000 
P-2026-0020 (주)천안냉난방   11,000,000 12,100,000 1,100,000 
P-2026-0022 군산공조산업     15,000,000 16,500,000 1,500,000 
P-2026-0023 목포냉난방엔지니어링 2,000,000  2,200,000  200,000   
P-2026-0024 여수HVAC테크   19,000,000 20,900,000 1,900,000 
P-2026-0025 포항에어컨주식회사  6,000,000  6,600,000  600,000   
P-2026-0026 경주공조설비     23,000,000 25,300,000 2,300,000 
P-2026-0027 김해냉난방테크    10,000,000 11,000,000 1,000,000 
P-2026-0028 양산에어솔루션    27,000,000 29,700,000 2,700,000 
P-2026-0029 거제공조산업     14,000,000 15,400,000 1,400,000 
P-2026-0030 (주)창원HVAC  1,000,000  1,100,000  100,000   


```

27곳 모두 `110 = 401 × 1.1`이다. 가장 작은 거래처별 차이는 100,000원, 가장 큰 차이는 3,000,000원이고 총차이는 41,100,000원이다. 이 환경이 운영 원본이라는 증거는 없으므로 본 보고서는 이를 **현재 로컬 DB 실측**으로만 부른다.

### 3.2 기준별 포함·제외

| 기준 | 포함 | 제외 | 현 DB 27거래처 합계 |
|---|---|---|---:|
| 401 상품매출 순대변 | 상품 공급가액 수익. 401 대변에서 차변(반품·할인 등)을 차감 | 부가세예수금 255, 매출과 별개인 수동 110 조정 | 411,000,000원 |
| 110 외상매출금 순차변 | 고객에게 받을 총 채권. 이 데이터에서는 공급가액 401 + VAT 10% | 현금매출 등 110을 거치지 않는 매출, 110과 무관한 수익 | 452,100,000원 |

현재 집계 구현의 `receivableBalance`는 단순 110 순차변이 아니라, 비수금 110 차변·대변을 반영한 뒤 확정 입금보고서까지 차감한다. 상세/인쇄는 401 `SALE_SUMMARY`와 확정 입금을 line으로 만든다. 따라서 입금은 양쪽에서 같은 금액만큼 빠지며, 현재 27곳의 기준 차이 41,100,000원을 없애지 않는다.

### 3.3 어느 기준을 택할 때의 사용자 가시 결과

- **401 기준 통일**: 상세·인쇄의 매출 line과 집계의 기말 비교 기준은 공급가액이 된다. 현 27곳 합계 기말 출발점이 452,100,000원에서 411,000,000원으로 41,100,000원 감소한다. VAT를 사용자 원장 채권에서 볼 수 없고, 110에만 들어온 수동 채권 조정도 빠진다.
- **110 기준 통일**: 집계 채권과 상세·인쇄 기말의 출발점이 452,100,000원으로 맞는다. 상세 line에는 401만이 아니라 VAT 41,100,000원과 향후 110 수동 조정의 표현 방식이 필요하다. 품목 판매금액 또는 매출액과 기말 채권을 같은 숫자로 부를 수 없으므로 UI에서 “매출 합계”와 “채권 발생/잔액”을 분리해야 한다.

어느 기준이 업무적으로 옳은지는 여기서 결정하지 않는다. 다음 절에서 레거시·기획 원문이 이미 답을 고정했는지 확인한다.

## 4. 레거시 GAS·기획 문서의 선결 사실

### 4.1 `docs/planning/`에는 금액 기준 결정이 없음

`docs/planning/` 전체에서 `거래처별 원장|거래처 원장|원장생성|외상매출금|상품매출|부가세|채권|401|110|매출 합계|기말잔액|잔액`을 검색한 출력 원문:

```text
docs/planning\2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md:313:| 8 | RBAC role 미달 | 401/403 — `@PreAuthorize` |
docs/planning\2026-05-16_sp-08-2-dps-legacy-gas-parity.md:320:| 8 | RBAC role 미달 | 401/403 — `@PreAuthorize` 가드 |
docs/planning\2026-05-18_sp-08-6-sales-accounting-crud-parity.md:49:- A4 한 장 fit + 부가세 (10%) + 합계
```

앞의 `401` 두 건은 HTTP 상태이고, 마지막 한 건은 매출전표 인쇄 일반 요구다. `docs/planning/`에는 거래처 원장의 110/401 선택을 정한 문서가 없다.

### 4.2 Issue #1001과 개발책임자 정본 메모리는 이미 정상 판매 경로를 결정함

`gh issue view 1001 --json number,title,state,body`의 핵심 원문:

```text
## 불변식

1. 원장에 **판매전표(매출)와 입금보고서(수금) 두 종류만** 실린다
2. 각 행 왼쪽에 **전표번호**가 있다
3. 판매전표 행은 **내부 품목 내역까지 전부** 펼쳐진다
4. 품목 금액은 **부가세 포함 단가 × 수량** 이다 — 부가세별도 단가로 표시되지 않는다
5. 주소는 **배송주소 데이터**에서 온다 — 적요 텍스트를 파싱해 채우지 않는다
6. 표시 규약을 따른다 — 음수 `-X` 빨강 · 0 은 `—` · 코드 prefix 금지 (`feedback_accounting_report_display_conventions`)
7. 표시명(거래처 이름) 조회 실패 시 read 리포트는 **502 fail-closed** (`feedback_accounting_enrichment_failclosed_policy`)
```

`.claude/memory/project_partner_ledger_and_cash_receipt.md`에도 2026-07-30 개발책임자 결정이 같은 문장으로 고정돼 있다.

```text
> "거래처별원장 시드파일을 보면 왼쪽에 전표번호가 있잖아? **출고된 판매전표**와 **입금보고서** 2가지가 나옴."

| **판매전표 품목 금액** | 이카운트: 수량 × **부가세별도** 단가 | **우리 사양: 수량 × 부가세 포함 단가** |
```

현재 slip projection도 이 결정대로 구현돼 있다. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:40~54,88~106`은 `lineAmount`를 “부가세 포함 품목 금액”으로 정의하고, 저장된 `supplyAmount + vatAmount`를 우선한다.

```java
40:     /**
41:      * 원장 판매전표 품목 projection.
42:      *
43:      * @param productName 품목명 snapshot
44:      * @param modelName 모델명 snapshot
45:      * @param quantity 수량
46:      * @param unitPriceWithVat 부가세 포함 단가
47:      * @param lineAmount 부가세 포함 품목 금액
48:      */
49:     public record Line(
50:             String productName,
51:             String modelName,
52:             int quantity,
53:             BigDecimal unitPriceWithVat,
54:             BigDecimal lineAmount) {
```

```java
88:     /**
89:      * 저장된 권위 금액을 우선해 VAT 포함 품목 금액을 계산한다.
90:      *
91:      * <p>공급가액과 부가세가 모두 있으면 이를 더한다. 이는 소수 단가를 다시 수량과 곱할 때
92:      * 저장 시 원 단위 반올림과 달라지는 drift를 막는다. 구 legacy 라인은 보유한 VAT 포함
93:      * 단가 또는 기존 공급가액·부가세 값으로만 계산하고 배송주소와 달리 다른 필드로 보정하지 않는다.
94:      */
95:     private static BigDecimal lineAmount(SlipLine line) {
96:         if (line.getSupplyAmount() != null && line.getVatAmount() != null) {
97:             return line.getSupplyAmount().add(line.getVatAmount());
98:         }
99:         if (line.getUnitPriceWithVat() != null) {
100:             return line.getUnitPriceWithVat().multiply(BigDecimal.valueOf(line.getQuantity()));
101:         }
102:         if (line.getLineTotal() == null) {
103:             return null;
104:         }
105:         BigDecimal vatAmount = line.getVatAmount() == null ? BigDecimal.ZERO : line.getVatAmount();
106:         return line.getLineTotal().add(vatAmount);
```

### 4.3 레거시 GAS도 “401 하나” 또는 “110 하나”로 계산하지 않음

원본 `tools/legacy-gas/거래처별 원장생성 프로그램/Index.html`은 판매전표·입금·거래처별 채권·계정별원장 Excel 네 파일을 받는다. 금액 열 후보는 다음과 같다(`:261~265`).

```javascript
261:     const COLKEY = {
262:       sales: { no: ["판매번호","전표번호","일자-No","일자-No.","일자 - No."], cc: ["거래처코드","거래처 코드","거래처ID","거래처 id","거래처 id "], cn: ["거래처명","업체명","사업자명","이카운트 사업자명"], ad: ["배송주소","배송지","주소","납품주소"], amt: ["합계","총액","금액","판매금액","전표금액","공급가액"] },
263:       receipt: { no: ["일자-No.","일자-No","일자 - No.","전표번호","영수번호"], cc: ["거래처코드","거래처 코드","거래처ID","거래처 id"], amt: ["금액","수금금액","입금액","수납금액"] },
264:       bond: { cc: ["거래처코드","거래처 코드","거래처ID","거래처 id"], cn: ["거래처명","업체명","사업자명","이카운트 사업자명"], base: ["기초채권","이월잔액","전월잔액"], bal: ["잔액","현재잔액","미수잔액"], desc: ["적요","메모","비고"], ph: ["전화","연락처","대표전화","핸드폰"] },
265:       ledger: { no: ["전표번호"], code: ["거래처코드"], desc: ["적요"], debit: ["차변"], credit: ["대변"] }
```

열 선택기는 후보 배열 앞에서부터 실제 헤더를 찾는다(`:387~396`). 따라서 `합계`가 존재하면 `공급가액`보다 먼저 선택된다.

```javascript
387:     function findCol(headers, keys) {
388:       let low = headers.map(h => sStr(h).toLowerCase());
389:       for (let k of keys) {
390:         let kk = k.toLowerCase();
391:         for (let i = 0; i < low.length; i++) {
392:           if (low[i].includes(kk)) return headers[i];
393:         }
394:       }
395:       return null;
396:     }
```

실제 원장식은 다음과 같다(`:678~739`).

```javascript
678:         for (let code of codesTarget) {
679:           let bRows = dfBond.filter(r => r._code === code);
680:           let baseVal = bRows.length > 0 ? bRows[0]._base : 0.0;
681:           let nameBond = bRows.length > 0 ? sStr(bRows[0][B_cn]) : "";
682:           
683:           let sSubAll = dfSales.filter(r => r._code === code).sort((a,b) => (a._dt||0) - (b._dt||0));
684:           let nameSales = sSubAll.length > 0 ? sStr(sSubAll[sSubAll.length-1][S_cn]) : "";
685:           let name = nameSales || nameBond;
686:           let isForced = activeCodes.includes(code);
687: 
688:           if (!isForced) {
689:             if (isExcludedByName(name)) continue;
690:             if (isExcludedByWord(code, bondDescMap)) continue;
691:           }
692: 
693:           let sSub = salesF.filter(r => r._code === code);
694:           let rSub = receiptF.filter(r => r._code === code);
695: 
696:           let items = [];
697:           sSub.forEach(r => items.push({ dt: r._dt, slip: r._slip, ord: 0, key: r._key, desc: sStr(r[S_ad]), sale: r._amt, recv: 0.0 }));
698:           rSub.forEach(r => items.push({ dt: r._dt, slip: r._slip, ord: 0, key: r._key, desc: name || "", sale: 0.0, recv: r._amt }));
699: 
700:           let lRows = ledgerMap[code] || [];
701:           lRows.forEach(lr => {
702:             if (lr.dt && lr.dt >= startDate && lr.dt <= endDate) {
703:               let sAmt = 0.0, rAmt = 0.0;
704:               if (lr.account === '9199') sAmt = lr.credit;
705:               else if (lr.account === '9549') rAmt = lr.debit;
706:               else if (lr.account === '1089') { sAmt = lr.debit; rAmt = lr.credit; }
707:               if (sAmt !== 0 || rAmt !== 0) {
708:                 items.push({ dt: lr.dt, slip: lr.slip, ord: 2, key: lr.key, desc: lr.desc, sale: sAmt, recv: rAmt });
709:               }
710:             }
711:           });
712: 
713:           if (!isForced && items.length === 0 && Math.abs(baseVal) < 0.5) continue;
714: 
715:           items.sort((a, b) => {
716:             let tA = a.dt ? a.dt.getTime() : 0; let tB = b.dt ? b.dt.getTime() : 0;
717:             if (tA !== tB) return tA - tB;
718:             if (a.ord !== b.ord) return a.ord - b.ord;
719:             let nA = parseInt((a.slip||"0").replace(/\D/g, '')) || 0;
720:             let nB = parseInt((b.slip||"0").replace(/\D/g, '')) || 0;
721:             return nA - nB;
722:           });
723: 
724:           let carryBase = baseVal;
725:           let itemsShow = items;
726:           if (items.length > maxItems) {
727:             let omit = items.slice(0, items.length - maxItems);
728:             itemsShow = items.slice(items.length - maxItems);
729:             omit.forEach(o => carryBase += o.sale - o.recv);
730:           }
731: 
732:          let curBal = carryBase;
733:           let drawRows = [];
734:           if (carryBase !== 0) drawRows.push({ merge: "이월잔액", sale: "", recv: "", bal: fmtAmt(carryBase) });
735:           itemsShow.forEach(it => {
736:             curBal += it.sale - it.recv;
737:             drawRows.push({ key: it.key, desc: it.desc, sale: fmtAmt(it.sale), recv: fmtAmt(it.recv), bal: fmtAmt(curBal) });
738:           });
739:           drawRows.push({ merge: "합계", sale: "", recv: "", bal: fmtAmt(curBal) });
```

레거시는 `기초채권 + 판매전표 금액 - 입금 ± 계정별 조정`으로 잔액을 만든다. 계정별 조정 코드는 구 이카운트 코드 `1089/9199/9549`이며, 현 `110/401` 한 계정만 고르는 구조가 아니다.

### 4.4 “고를 게 있긴 한가” 판정

**정상 판매전표 경로에는 110 대 401의 선택지가 없다. 이미 사실이 정해져 있다.** 사용자 원장의 매출 line은 canonical OUTBOUND 판매전표의 `supplyAmount + vatAmount` 또는 VAT 포함 단가×수량이고, 수금 line은 확정 입금보고서다. 현 27거래처처럼 10% VAT가 붙은 단순 외상매출에서는 결과 숫자가 110 차변과 같아 보이지만, 출처는 110 journal 합계가 아니라 판매전표 문서다. 110 수동조정·현금매출·반품·누락 전표가 생기면 두 값은 다시 달라질 수 있다.

반대로 401 `SALE_SUMMARY`는 공급가액만 담으므로 개발책임자 불변식 4의 “VAT 포함”에 직접 어긋난다. `SALE_SUMMARY`는 Issue의 두 종류에도 없는 세 번째 문서형이다.

다만 **현 DB의 journal-only 27거래처를 어떻게 할지는 별도 호환 결정이 남는다.** 내부 UUID 목록을 출력하지 않고, 앞의 27개 accounting partner를 slip DB canonical OUTBOUND에 대조한 읽기 전용 결과는 다음과 같다.

```text
 canonical_slips | canonical_lines | vat_inclusive_amount 
-----------------+-----------------+----------------------
               0 |               0 |                    0
(1 row)
```

- 정본을 엄격 적용하면 이 27곳은 판매전표가 아니므로 상세·인쇄 매출 line에서 빠진다. 현 로컬 DB 기준 기존 401 fallback 411,000,000원 전부가 사라진다.
- VAT 포함 호환 summary를 110으로 만들면 452,100,000원을 보존하지만, 판매전표/입금보고서 두 종류만 허용한다는 Issue 계약을 확장하고 수동 110 조정이 매출로 오인될 수 있다.
- 정본 판매전표를 복구·연결할 수 있다면 문서 출처와 VAT 포함 금액을 모두 지키지만, 이 라운드는 원천 존재 여부와 복구 가능성을 확인하지 않았고 DB 쓰기도 금지됐다.

따라서 개발책임자께서 판단할 것은 “110 또는 401 중 어느 숫자”가 아니라 **판매전표가 없는 legacy journal을 제품 원장에 계속 보일 것인지, 정본 두 종류만 허용할 것인지**다.

## 5. 뿌리 B — 필터 누락의 단일 원인

### 5.1 미등록 코드는 `전체 조회`와 같은 상태로 소실됨

`PartnerLedgerReadModelService.read()`는 입력이 없을 때와 입력을 찾지 못했을 때 모두 `selectedSummary == null`, `selectedId == null`로 만든다(`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:49~56,128~139`). 이후 journal, 수금, 판매전표 세 조회에 모두 무필터 조건을 전달한다.

```java
49:    public PartnerLedgerReadModel read(String partnerCode, LocalDate from, LocalDate to) {
50:        if (from == null || to == null || to.isBefore(from)) {
51:            throw new IllegalArgumentException("from/to 기간이 올바르지 않습니다");
52:        }
53:        PartnerSummary selectedSummary = resolvePartner(partnerCode);
54:        UUID selectedId = selectedSummary == null ? null : selectedSummary.partnerId();
55:        List<JournalLineRepository.PartnerAccountTotal> journalTotals =
56:                journalLineRepository.aggregatePostedByPartnerAccount(from, to);
57:        Map<UUID, MutablePartner> groups = new LinkedHashMap<>();
58:        for (var total : journalTotals) {
59:            UUID id = total.getPartnerId();
60:            if (id == null || selectedId != null && !selectedId.equals(id)
61:                    || total.getSourceType() == JournalSourceType.CASH_RECEIPT) {
62:                continue;
63:            }
64:            MutablePartner group = groups.computeIfAbsent(id, ignored -> new MutablePartner(id));
65:            BigDecimal debit = zero(total.getDebitTotal());
66:            BigDecimal credit = zero(total.getCreditTotal());
67:            if (REVENUE.equals(total.getAccountCode())) {
68:                group.journalSales = group.journalSales.add(credit).subtract(debit);
69:            } else if (RECEIVABLES.equals(total.getAccountCode())) {
70:                group.receivableDebit = group.receivableDebit.add(debit);
71:                group.paymentTotal = group.paymentTotal.add(credit);
72:            }
73:        }
74:
75:        List<CashReceipt> receipts = findReceipts(from, to, selectedId);
76:        for (CashReceipt receipt : receipts) {
77:            if (receipt.getPartnerId() == null) continue;
78:            MutablePartner group = groups.computeIfAbsent(receipt.getPartnerId(), MutablePartner::new);
79:            group.paymentTotal = group.paymentTotal.add(zero(receipt.getAmount()));
80:            String no = resolveJournalNos(receipt);
81:            group.documents.add(new PartnerLedgerReadModel.Document(
82:                    PartnerLedgerReadModel.DocumentType.CASH_RECEIPT, no, receipt.getTransactionDate(),
83:                    null, null, null, zero(receipt.getAmount()), List.of()));
84:        }
85:
86:        List<PartnerLedgerSalesClient.Sale> sales = salesClient.find(from, to,
87:                selectedSummary == null ? null : selectedSummary.partnerCode(), selectedId);
```

같은 파일의 필터 해석 원문:

```java
128:    private PartnerSummary resolvePartner(String input) {
129:        if (input == null || input.isBlank()) return null;
130:        PartnerSummary summary = PartnerLookupSupport.foundOrNull(
131:                PartnerLookupSupport.byCode(partnerLookupClient, input));
132:        if (summary != null) return summary;
133:        var directory = PartnerLookupSupport.directory(partnerLookupClient, input.trim(), 10);
134:        if (directory.isUnavailable()) throw PartnerLookupSupport.unavailable();
135:        String number = digits(input);
136:        List<PartnerSummary> exact = directory.partners().stream()
137:                .filter(p -> input.trim().equals(p.partnerCode())
138:                        || number != null && number.equals(digits(p.bizNo()))).toList();
139:        return exact.size() == 1 ? exact.get(0) : null;
```

즉 입력 상태가 실제로는 `UNFILTERED`, `RESOLVED`, `NOT_FOUND` 세 가지인데 구현은 null 하나로 앞뒤 두 상태를 합쳤다. 결함 3의 직접 원인은 이 tri-state 손실이다.

### 5.2 무필터 결과는 미해결 판매전표를 별도 거래처처럼 승격함

slip-service의 조회는 `partnerId`와 `partnerCode`가 모두 null이면 모든 정본 상태 OUTBOUND를 반환한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:80~97`). accounting-service는 partner master에 연결되지 않은 결과도 `unresolved` map에 새 그룹으로 만든 뒤 최종 결과에 추가한다(`PartnerLedgerReadModelService.java:142~161`, `:119~122`).

```java
80:    @EntityGraph(attributePaths = "lines")
81:    @org.springframework.data.jpa.repository.Query("""
82:            SELECT DISTINCT s FROM Slip s
83:            WHERE s.isDeleted = false
84:              AND s.slipType = com.samhanair.logis.slip.domain.SlipType.OUTBOUND
85:              AND s.status IN :statuses
86:              AND s.slipDate BETWEEN :from AND :to
87:              AND ((:partnerId IS NOT NULL AND (s.partnerId = :partnerId
88:                                                OR :partnerCode IS NOT NULL AND s.partnerCode = :partnerCode))
89:                   OR :partnerId IS NULL AND (:partnerCode IS NULL OR s.partnerCode = :partnerCode))
90:            ORDER BY s.slipDate DESC, s.seqNo DESC
91:            """)
92:    List<Slip> findPartnerLedgerSales(
93:            @org.springframework.data.repository.query.Param("from") LocalDate from,
94:            @org.springframework.data.repository.query.Param("to") LocalDate to,
95:            @org.springframework.data.repository.query.Param("partnerCode") String partnerCode,
96:            @org.springframework.data.repository.query.Param("partnerId") java.util.UUID partnerId,
97:            @org.springframework.data.repository.query.Param("statuses") Collection<SlipStatus> statuses);
```

```java
142:    private MutablePartner resolveSale(PartnerLedgerSalesClient.Sale sale, Map<UUID, MutablePartner> groups,
143:                                       Map<UUID, PartnerSummary> summaries, PartnerSummary selected,
144:                                       Map<String, MutablePartner> unresolved) {
145:        if (sale == null) return null;
146:        MutablePartner group = sale.partnerId() == null ? null : groups.get(sale.partnerId());
147:        if (selected != null && group == null && selected.partnerId().equals(sale.partnerId())) {
148:            group = groups.computeIfAbsent(selected.partnerId(), MutablePartner::new);
149:        }
150:        if (group == null) {
151:            group = groups.values().stream().filter(g -> belongs(sale, summaries.get(g.partnerId))).findFirst().orElse(null);
152:        }
153:        if (selected != null && group == null) return null;
154:        if (group == null) {
155:            String code = normalize(sale.partnerCode());
156:            String key = code == null ? "slip:" + normalize(sale.slipNo()) : "code:" + code;
157:            group = unresolved.computeIfAbsent(key, ignored -> new MutablePartner(null));
158:            group.partnerCode = code;
159:            group.partnerName = sale.partnerName();
160:        }
161:        return group;
```

```java
119:        List<PartnerLedgerReadModel.Partner> result = new ArrayList<>();
120:        for (MutablePartner group : groups.values()) result.add(freeze(group, summaries.get(group.partnerId)));
121:        for (MutablePartner group : unresolved.values()) result.add(freeze(group, null));
122:        result.sort(Comparator.comparing(p -> p.partnerCode() == null ? "" : p.partnerCode()));
```

이 동작은 우연한 누락이 아니라 현재 테스트로 고정돼 있다. `SalesAggregateServiceTest.java:408~437`은 master/journal 후보가 없는 `QA-GATE-A/B`가 무필터 집계에 보여야 한다고 명시하고, `PartnerLedgerReadServiceTest.java:44~64`는 master에 없는 code-only 전표의 상세를 열도록 명시한다. 따라서 결함 4를 닫으려면 구현만이 아니라 이 과거 호환 불변식도 함께 폐기하거나 새 경계로 다시 정의해야 한다. `QA-GATE-` prefix를 하드코딩해 감추는 것은 제품 계약이 아니므로 설계 대상에서 제외한다.

## 6. 뿌리 C — 복원 상태가 표시 계층에만 존재함

### 6.1 화면은 복원본을 보이지만 저장·CSV·인쇄는 계속 live를 소비함

복원 결과는 `restoredLedger`라는 별도 state 하나에만 저장되고 화면 표에서만 우선된다(`clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:245,288~291,622~624`). 나머지 세 경로는 각각 live 원장을 직접 사용한다.

```tsx
245:  const [restoredLedger, setRestoredLedger] = useState<LedgerData | null>(null)
```

```tsx
288:  const handleRestore = async (batchNo: string) => {
289:    const restored = await restoreLedger(batchNo)
290:    setRestoredLedger(restored.ledger ? mapLedgerSnapshotResponse(restored.ledger) : null)
291:  }
```

```tsx
293:  const handleCaptureSnapshot = async () => {
294:    if (!selectedPartner || !ledgerQuery.data || isSavingSnapshot) return
295:    setIsSavingSnapshot(true)
296:    try {
297:      await captureLedger(selectedPartner, applied.from, applied.to)
298:      await historyQuery.refetch()
299:    } finally {
300:      setIsSavingSnapshot(false)
301:    }
302:  }
```

```tsx
313:  const handlePrint = () => {
314:    if (!selectedPartner) return
315:    // Electron은 보안상 renderer의 내부 window.open을 차단하고 단일 BrowserWindow를 사용한다.
316:    // 따라서 인쇄 전용 화면은 현재 창의 허용된 HashRouter 라우트로 이동한다.
317:    navigate(buildPrintPath(selectedPartner, applied.from, applied.to))
318:  }
```

```tsx
331:  const handleCsv = () => {
332:    if (!aggregateQuery.data) return
333:    const filename = `partner-ledger_${applied.from}_${applied.to}.csv`
334:    const csv = buildCsv(aggregateQuery.data, ledgerQuery.data ?? null)
335:    downloadCsv(filename, csv)
336:  }
```

```tsx
622:        ) : restoredLedger || ledgerQuery.data ? (
623:          <LedgerDetailTable data={restoredLedger ?? ledgerQuery.data!} />
624:        ) : null}
```

- 저장: `captureLedger(partnerCode, from, to)`를 호출하고, 서버 `LedgerSnapshotService.capture()`도 `partnerLedgerReadService.read()`로 현재 데이터를 다시 읽는다(`LedgerSnapshotService.java:34~45`).
- CSV: `ledgerQuery.data`를 직접 전달한다.
- 인쇄: route에는 거래처코드·기간만 들어가며, 인쇄 화면은 `getLedgerData()`를 다시 호출한다(`clients/desktop/src/renderer/print/PartnerLedgerView.tsx:205~247`).

따라서 복원 여부가 화면 전체의 데이터 출처 계약으로 승격되지 않은 것이 결함 5의 단일 원인이다.

### 6.2 서버는 Page를 주지만 클라이언트가 page/size도, 이동 UI도 제공하지 않음

서버는 기본 20건 Page를 정상 반환한다(`AccountingReportController.java:165~175`). 클라이언트 DTO에도 `totalPages`, `number`, `size`가 있으나 API 호출은 `partnerCode/from/to`만 보내고(`partnerLedgerApi.ts:218~225,325~335`), 화면은 `content` 한 페이지의 table만 그린다(`PartnerLedgerPage.tsx:652~684`). 결함 6은 저장소 조회 누락이 아니라 Page 계약을 소비하지 않은 FE 결함이다.

```java
165:    /** 거래처별 원장 자동 저장 이력 — 날짜 범위와 거래처 코드로 조회한다. */
166:    @GetMapping("/accounting/journals/ledger-history")
167:    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
168:    public ApiResponse<Page<LedgerHistoryResponse>> ledgerHistory(
169:            @RequestParam String partnerCode,
170:            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
171:            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
172:            @PageableDefault(size = 20, sort = "processedAt", direction = Sort.Direction.DESC)
173:            Pageable pageable) {
174:        return ApiResponse.ok(ledgerSnapshotService.history(partnerCode, from, to, pageable));
175:    }
```

## 7. 뿌리 D — 채번과 문구

### 7.1 원장 배치번호는 시계의 밀리초만 신뢰함

`LedgerSnapshotService.java:32,36~44`는 `LEDyyyyMMddHHmmssSSS`를 만들고 바로 저장한다. 같은 밀리초 두 요청이면 같은 문자열이다. DB에는 active row 대상 unique index가 있어(`V13__tax_invoice_batch.sql:41~44`) 중복 저장을 막지만, 두 번째 요청을 재채번하지 않으므로 사용자는 충돌 예외를 받는다.

```java
32:    private static final DateTimeFormatter BATCH_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");
```

```java
36:    public PartnerLedgerResponse capture(String partnerCode, LocalDate from, LocalDate to, UUID actor) {
37:        PartnerLedgerResponse result = partnerLedgerReadService.read(partnerCode, from, to);
38:        TaxInvoiceBatch batch = TaxInvoiceBatch.createDocumentSnapshot(
39:                DOCUMENT_TYPE, partnerCode,
40:                "LED" + LocalDateTime.now().format(BATCH_TIME),
41:                from, to, actor);
42:        batch.complete(LedgerSnapshotResponse.lineCount(result), 1, null, null,
43:                SnapshotCompression.compress(objectMapper, result));
44:        batchRepository.save(batch);
```

```sql
41:-- batch_no 는 active row 기준 unique
42:CREATE UNIQUE INDEX IF NOT EXISTS uidx_tax_invoice_batches_batch_no_active
43:    ON tax_invoice_batches (batch_no)
44:    WHERE is_deleted = FALSE;
```

같은 서비스에는 이미 `TaxInvoiceBatchNoGenerator.java:20~45`의 PostgreSQL transaction advisory lock + 최대 suffix 방식과 병렬 IT가 있다. 원장 채번도 이 검증된 패턴을 별도 namespace로 재사용할 수 있다. 단 기존 generator는 `TIB-` 전용이며 active row만 세므로 그대로 호출하는 설계는 아니다.

### 7.2 실제 행위는 수동 저장인데 화면과 Javadoc은 자동이라고 표기함

화면 버튼은 사용자가 누르는 `현재 원장 저장`이고 서버도 POST를 그때만 수행한다. 그런데 `PartnerLedgerPage.tsx:637`은 `자동 저장 이력`, `partnerLedgerApi.ts:325`와 `LedgerSnapshotService.java:48` 및 `AccountingReportController.java:165`도 자동 저장이라고 부른다. 결함 8은 동작 결함이 아니라 명칭 계약 불일치다.

## R33 fix 설계

R33은 아래 네 뿌리를 **각각 한 곳의 계약으로 닫고**, 화면별 보정 코드를 두지 않는다. A와 B의 호환 정책은 다음 절의 개발책임자 판단이 선행돼야 한다.

### A. 기준 불일치 — 결함 1·2

#### 닫힘 조건

한 거래처·기간에 대해 집계 `매출/수금/잔액`, 상세 line의 `차변/대변/누계`, 인쇄, CSV, snapshot이 **동일한 문서 집합을 한 번 접은 결과**여야 한다. 401·110을 서로 다른 화면에서 별도로 합산한 뒤 숫자가 우연히 맞기를 기대하지 않는다.

#### 변경 설계

1. `shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java`를 상태 상수 묶음에서 실제 계산 계약으로 승격한다.
   - 허용 정본 문서형: `SALE`, `CASH_RECEIPT`.
   - 판매 금액 기준: `VAT_INCLUDED_DOCUMENT_AMOUNT`.
   - 각 문서가 잔액에 미치는 효과를 명시한다. 판매는 `+amount`, 입금은 `-amount`; 음수 취소/반품은 부호를 반대로 투영한다.
   - 화면 열은 `delta >= 0`이면 차변 `delta`, `delta < 0`이면 대변 `abs(delta)`로 만든다. FE가 `type !== SALE` 같은 추론을 해서는 안 된다.
   - `salesTotal`, `paymentTotal`, `periodDelta/closingBalance`의 식을 계약에 둔다. 단순 DTO 타입 공유가 아니라 생성 시 식을 만족하지 않으면 만들 수 없는 factory/fold로 강제한다.
2. `PartnerLedgerReadModelService`는 먼저 정본 `documents`를 완성하고, 모든 합계는 그 documents를 fold해서 만든다.
   - `salesTotal = Σ SALE VAT포함 문서금액`
   - `paymentTotal = Σ CASH_RECEIPT 확정금액`
   - `periodDelta = Σ 문서 delta`
   - 기초잔액을 범위에 포함하기로 결정하면 `closingBalance = openingBalance + periodDelta`; 포함하지 않으면 필드와 화면명을 `기간 증감`으로 명시해 “현재 채권”으로 오해시키지 않는다.
3. 401은 회계 손익의 공급가액, 110은 매출채권 control account라는 **조정(reconciliation) 데이터**로 분리한다. 둘 중 하나를 사용자 판매 문서로 위장하지 않는다. 현 `JOURNAL_ONLY_DOCUMENT/SALE_SUMMARY` fallback은 개발책임자 호환 정책에 따라 다음 둘 중 하나로만 처리한다.
   - 정본 엄격: 제거하고 별도 “원천 판매전표 없음” 진단으로 남긴다.
   - 호환 유지: `SALE`이 아닌 명시적 `LEGACY_ACCOUNTING_ADJUSTMENT`로 모델링하고 출처 계정·VAT 불확실·차변/대변 효과를 DTO에 함께 둔다. 이 경우 Issue #1001의 두 문서형 계약 자체를 확장해야 하며, 110을 자동으로 매출로 간주해서는 안 된다.
4. `SalesAggregateService`, `PartnerLedgerReadService`, `LedgerSnapshotService`는 같은 완성 read model의 서로 다른 projection만 반환한다. FE `buildPartnerLedgerLines`, CSV, `PartnerLedgerView`는 서버가 준 debit/credit/balance 또는 공통 TS fold를 소비하고 별도 분개 규칙을 갖지 않는다.
5. 계약 회귀 테스트를 화면 단위가 아닌 한 fixture의 교차 표면으로 만든다.
   - 공급가 1,000원 + VAT 100원 판매, 400원 입금, 401 대변 1,000원, 110 차변 1,100원 fixture.
   - 기대: 집계 매출 1,100원, 상세 판매 차변 1,100원, 입금 대변 400원, 기간 증감/잔액 700원, 인쇄·CSV·snapshot도 동일.
   - 401 또는 110 journal만 바꿔도 정본 판매전표 기반 사용자 원장 금액은 변하지 않아야 한다.
   - 양수·음수 판매/입금 각각에서 음수 금액을 debit/credit 칸에 그대로 표시하지 않고 방향이 뒤집히는지 검증한다.
   - 정본 문서가 없는 경우는 선택된 호환 정책의 결과를 별도 fixture로 고정한다.

#### 반대급부

- 현 로컬 journal-only 27거래처는 엄격 계약에서 401 기준 411,000,000원 전부가 원장 매출에서 사라진다. 이것은 계산 손실이 아니라 원천 판매전표 부재를 노출하는 변화다.
- 호환형을 택하면 452,100,000원 같은 gross 추정치를 보존할 수 있지만, 수동 110 조정·반품·현금매출을 판매로 오인할 위험과 세 번째 문서형을 영구 지원하는 비용이 생긴다.
- “매출”을 401 회계 매출액으로 보던 사용자에게 VAT 포함 판매전표 합계는 41,100,000원 커 보인다. 화면 label을 `VAT 포함 판매금액`으로 명시하고 회계 매출 보고서는 별도 표면으로 유지해야 한다.
- 기초잔액까지 진짜 현재 채권으로 만들면 기간 전 전체 문서/입금 조회 또는 별도 검증된 기초잔액 원천이 필요해 성능·이관 범위가 커진다. 반대로 기초를 제외하면 `채권 잔액`이라는 명칭을 유지할 수 없다.

### B. 필터 누락 — 결함 3·4

#### 닫힘 조건

`미입력`, `등록 거래처로 해석됨`, `입력했으나 미등록`이 서로 다른 상태여야 한다. 무필터 목록과 단건 상세는 동일한 “사용자에게 노출 가능한 거래처” cohort를 사용하며, 목록에서 연 row는 같은 조건의 상세가 비어 있지 않아야 한다.

#### 변경 설계

1. `resolvePartner()`의 nullable 반환을 `PartnerFilterResolution` 같은 명시적 결과로 바꾼다.
   - `UNFILTERED`
   - `RESOLVED(active partner master)`
   - `NOT_FOUND(original input)`
   - partner-service 장애는 기존처럼 `UNAVAILABLE` 오류이고 `UNFILTERED`로 완화하지 않는다.
2. `NOT_FOUND`이면 repository/client를 무필터로 호출하지 않고 즉시 빈 집계/빈 상세 또는 합의한 404/422를 반환한다. 적어도 전체 자료 반환은 불가능한 구조로 만든다.
3. 무필터 목록의 공개 cohort를 active partner master로 닫는다.
   - journal·수금·판매전표 그룹 모두 active master가 batch lookup에서 확인된 경우만 최종 결과로 freeze한다.
   - `PartnerLedgerReadModelService.resolveSale()`의 `unresolved` 결과 승격을 제거한다.
   - slip의 `partner_id`가 없는 code-only 자료는 master code로 명확히 해석하고 연결할 수 있는 경우에만 포함하거나, 이관 완료 전까지 격리한다. `QA-GATE-` 문자열, 이름, 생성자 같은 테스트 흔적을 제품 필터로 사용하지 않는다.
4. 집계 row는 허용 정본 문서가 하나 이상인 거래처만 만든다. 상세는 row가 가진 canonical partner code/id로 같은 read model을 projection한다. 이렇게 하면 QA-GATE 빈 원장처럼 목록 cohort와 상세 cohort가 갈라질 수 없다.
5. 기존의 반대 불변식을 테스트에서 교체한다.
   - `NOSUCH9999` 필터 → 빈 결과이며 무필터 sales/client 호출 없음.
   - 무필터 → active master 연결 문서만 노출.
   - code-only·master 미등록 fixture → 숨김 또는 별도 격리 결과.
   - 목록의 모든 row를 순회해 상세 documents가 1개 이상인지 계약 테스트.
   - partner-service 장애 → 전체 결과로 fail-open하지 않음.

#### 반대급부

- 과거 R13이 의도적으로 살린 master 미등록 code-only 실거래 전표도 같이 안 보인다. 정상 자료가 섞여 있다면 R33 전에 partner master 연결/backfill하거나, 명시적 legacy 승인 필드를 도입해야 한다.
- active master 확인을 모든 후보에 적용하면 partner-service batch lookup 의존성과 조회 비용이 늘어난다. 후보 ID/code의 일괄 조회와 request 단위 cache가 필요하다.
- 미등록 필터를 빈 결과가 아니라 404/422로 택하면 사용자는 오타를 더 명확히 알지만 기존 FE error UX와 API 소비자가 바뀐다. 어느 응답이든 “전체 반환 금지”는 공통 불변식이다.
- test marker를 이름으로 거르지 않으므로 QA fixture의 격리는 seed 정리 또는 master 연결 정책으로 해야 한다.

### C. 복원 전파 — 결함 5·6

#### 닫힘 조건

사용자가 보는 원장의 출처가 `LIVE`인지 `SNAPSHOT(batchNo)`인지 화면 상태 하나로 표현되고, 저장·CSV·인쇄가 모두 그 출처를 소비해야 한다. 이력 21번째 이후도 UI에서 도달 가능해야 한다.

#### 변경 설계

1. `restoredLedger`와 `ledgerQuery.data`의 이중 우선순위를 `activeLedger` discriminated union으로 바꾼다.
   - `{ source: 'LIVE', partnerCode, from, to, data }`
   - `{ source: 'SNAPSHOT', batchNo, data, savedAt }`
   - 화면 표, 합계, CSV, 인쇄, 저장 버튼이 모두 `activeLedger`만 받는다.
   - 조회 조건/거래처를 바꾸면 LIVE로 전환하고, 복원 시 snapshot banner와 `현재 원장으로 돌아가기`를 제공한다.
2. 저장은 출처별 서버 계약으로 분리한다.
   - LIVE: 기존 capture가 서버에서 현재 read model을 읽어 저장.
   - SNAPSHOT: `sourceBatchNo`를 받는 copy endpoint가 서버의 기존 compressed payload를 읽어 **그대로 새 snapshot으로 복사**한다. 클라이언트가 보낸 ledger JSON을 저장하지 않는다.
   - 새 이력에는 원본 `sourceBatchNo` lineage를 보관해 감사 가능하게 한다. 구 line-format snapshot도 deserialize/rebuild하지 않고 원 payload를 복사해야 손실이 없다.
3. CSV는 `buildCsv(..., activeLedger.data)`를 사용한다. snapshot mode에서는 집계 live row를 섞지 않도록 snapshot 자체의 합계/메타만 사용하거나 CSV header에 `복원 배치번호/저장시각`을 적는다.
4. 인쇄 route에 사용자 노출 batch 번호를 선택적으로 넣는다. LIVE는 현 `partnerCode/from/to`, SNAPSHOT은 `batchNo`로 restore endpoint를 읽어 인쇄한다. UUID는 route·화면·파일명에 쓰지 않는다.
5. 이력 API client에 `page,size`를 추가하고 query key에도 page를 포함한다. `number/totalPages`를 사용한 이전·다음 또는 “더 보기”를 제공하며, 거래처/기간 변경과 새 저장 후 page 0으로 되돌려 refetch한다. 25건 fixture에서 21~25번째를 복원할 수 있는 FE test를 둔다.
6. 교차 동작 테스트: 과거 snapshot A를 복원한 뒤 live DB/API fixture를 B로 변경해도 화면·CSV·인쇄·복사 저장 모두 A여야 한다. `현재 원장으로 돌아가기` 후에만 B가 되어야 한다.

#### 반대급부

- snapshot 복사는 같은 payload를 중복 저장하므로 저장공간이 늘어난다. lineage와 원본 보존을 택한 감사 비용이다.
- `sourceBatchNo` 보관은 migration과 응답 DTO 확장이 필요하다. 기존 이력은 null lineage로 호환해야 한다.
- snapshot CSV에서 live 집계를 제거하면 기존 CSV의 “전체 집계 + 선택 상세” 혼합 형식이 달라진다. 두 파일을 분리하거나 출처를 명확히 표시해야 한다.
- page 방식은 새 저장으로 행이 앞에 끼면 사용자가 보던 페이지의 항목이 이동한다. 감사 탐색 안정성이 더 중요하면 후속으로 cursor pagination이 낫지만, 20건 초과 접근 결함은 현 Page 계약을 완전 소비하는 것으로 닫힌다.

### D. 소소 — 결함 7·8

#### 닫힘 조건

동시 저장 두 건이 서로 다른 사용자 노출 배치번호로 모두 성공하고, UI·API 문서는 실제 수동 저장 행위를 `저장 이력`으로 일관되게 부른다.

#### 변경 설계

1. 원장 전용 `LedgerSnapshotBatchNoGenerator`를 만든다. 형식은 현 `VARCHAR(20)` 안에 드는 `LED-yyyyMMdd-NNNNNN`으로 하고, 동일 날짜에 PostgreSQL transaction advisory lock을 잡은 뒤 **soft-delete 포함 전체** LED prefix의 최대 suffix + 1을 채번한다.
   - 시각은 표시용 `processedAt`으로만 사용하고 유일성 원천으로 쓰지 않는다.
   - 기존 `TaxInvoiceBatchNoGenerator`의 검증된 lock 패턴을 재사용하되 `TIB-` namespace/query와 섞지 않는다.
   - 현 active unique index는 최종 방어선으로 유지한다. 삭제된 audit 번호도 다시 쓰지 않도록 max query는 active 조건을 두지 않는다.
2. capture와 snapshot copy가 모두 같은 generator를 호출하게 한다. 같은 밀리초 병렬 capture N건이 모두 성공하고 번호가 중복되지 않는 IT, 기존 번호 gap/soft-delete가 있어도 재사용하지 않는 IT를 둔다.
3. `자동 저장 이력`을 `원장 저장 이력`으로 바꾸고, `LedgerSnapshotService`, controller, FE API의 “자동 저장” Javadoc/주석도 `사용자 저장`으로 맞춘다. 기능과 테스트명도 같은 용어를 쓴다.

#### 반대급부

- 날짜별 채번 구간은 같은 날 저장 시작 순간을 짧게 직렬화한다. payload 압축·저장은 lock 밖으로 옮기지 않더라도 현재 트랜잭션 동안 lock이 유지되므로, 채번 후 불필요한 장시간 작업을 피해야 한다.
- 번호 형식이 `LEDyyyyMMddHHmmssSSS`에서 `LED-yyyyMMdd-NNNNNN`으로 바뀐다. 기존 번호는 그대로 복원 가능하게 두고 파싱/정렬을 문자열 형식에 의존하는 테스트·mock·문서를 함께 수정해야 한다.
- audit 번호를 재사용하지 않는 정책은 삭제 후 suffix에 빈칸이 생겨도 메우지 않는다. 연속성보다 식별 안정성을 택하는 대가다.

## 개발책임자 판단 필요

### 1. 판매전표 없는 journal-only 27거래처의 제품 노출 정책

정상 원장의 금액 기준은 기획·Issue·레거시에서 VAT 포함 판매전표 금액으로 이미 정해져 있어 `110 대 401` 선택은 아니다. 그러나 현 로컬 27거래처에는 연결된 canonical OUTBOUND가 0건이므로 다음 중 정책 결정이 필요하다.

- **정본 엄격**: `SALE_SUMMARY`를 제거한다. 현 로컬 기준 27거래처·411,000,000원(401 fallback)이 상세/인쇄에서 사라진다.
- **정본 복구/연결**: 원천 판매전표를 이관·연결한 뒤 VAT 포함 문서로 보인다. 계약은 가장 깨끗하지만 원천 확보와 데이터 이관이 R33 선행조건이다.
- **legacy 조정형 유지**: journal-only를 명시적 세 번째 문서형으로 보인다. 110을 쓰면 현 표본 452,100,000원이지만 수동 채권 조정을 판매로 오인할 수 있고, 401을 쓰면 411,000,000원으로 VAT 포함 불변식을 어긴다. 어느 계정을 쓰더라도 “판매전표”라고 부를 수 없다.

### 2. master 미등록 code-only 판매전표의 공개 여부

과거 R13 테스트는 이를 의도적으로 공개했고, R31은 그 결과 QA-GATE 혼입·빈 원장을 결함으로 판정했다. 문자열 prefix로 QA만 거르는 것은 재발 방지가 아니다.

- **active master 연결 자료만 공개**: B 설계가 단순해지고 목록/상세 cohort가 일치하지만, 정상 legacy code-only도 backfill 전까지 숨겨진다.
- **승인된 legacy만 공개**: 별도 데이터 provenance/승인 필드와 관리 절차가 필요하다. 단순 code-only라는 사실만으로 공개하면 현 결함이 그대로 남는다.

### 3. 집계의 `채권 잔액`이 기간 증감인지, 기초 포함 잔액인지

현 구현은 조회기간 안의 110 차변·입금만 계산하고 상세도 0에서 시작하므로 진짜 기초 포함 잔액이 아니다. 레거시 GAS는 `기초채권 + 판매 - 입금 ± 조정`을 사용한다.

- **기간 증감**: 정본 문서 fold만으로 R33 범위를 닫을 수 있으나 label을 `기간 증감`으로 바꿔야 한다.
- **기초 포함 채권 잔액**: `from` 이전 정본의 누적 또는 별도 이관 기초잔액 원천을 계약에 추가해야 한다. 사용자 의미는 강하지만 조회·이관·성능 범위가 커진다.

## 이 라운드가 보지 않은 것

- production DB는 조회하지 않았다. 41,100,000원과 27거래처 수치는 현재 로컬 Docker DB의 읽기 전용 실측이다.
- DB write, Docker 재빌드·재배포·중지, 코드 수정, git add/commit/checkout/stash/restore를 하지 않았다.
- 전체 또는 부분 테스트를 실행하지 않았다. 이번 라운드는 소스·기존 테스트·문서·git 이력·읽기 전용 SQL 계약 진단이다.
- journal-only 27거래처의 원천 판매 XLSX/GAS 업로드 파일 존재 여부와 canonical slip 복구 가능성은 확인하지 않았다.
- production에서 master 미등록 code-only 실거래가 몇 건인지, QA-GATE 외 정상 legacy가 얼마나 숨겨지는지는 세지 않았다.
- 기초채권의 현행 정본 저장소와 `from` 이전 전체 누적 조회의 성능은 확인하지 않았다.
- snapshot 20건 초과와 동시 밀리초 충돌을 실제 쓰기로 재현하지 않았다. 사용자 제약상 DB 쓰기가 필요한 재현 대신 코드 경로·기존 unique 제약으로 확정했다.
- R33 구현 파일의 다른 PR 변경과 충돌 여부 및 migration version 슬롯은 조사하지 않았다.

## R32 판정

`DONE_WITH_CONCERNS` — 41,100,000원 독립 재현, 세 경로 기준, R18 계약 구멍, 기획·레거시 사실, B·C·D 원인 및 R33 닫힘 설계를 모두 기록했다. R33 착수 전에 위 세 가지 업무 정책을 개발책임자가 확정해야 한 번에 닫을 수 있다.
