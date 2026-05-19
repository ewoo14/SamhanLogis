# SP-08-FU2 도메인 정합성 검증 (SQL)

슬라이스: SP-08-FU2 (Test Safety Bulk — 4건 통합)
작성일: 2026-05-19
작성자: QA agent

---

## 1. P2-2 — destinationWarehouseId FK 정합

### 검증 목적

`slips.destination_warehouse_id` 가 `inventory-service` 의 `warehouses.id` 와
논리적으로 일치하는지 확인. 실제 DB-level FK 는 없으나 (서비스 분리) 컨벤션 일관성 검증.

### Q1-A: slip-service DB — destinationWarehouseId 있는 슬립의 name snapshot 채움 비율

```sql
-- slip-service DB (samhan_slip_db)
SELECT
    COUNT(*)                                           AS total_slips,
    COUNT(destination_warehouse_id)                    AS has_warehouse_id,
    COUNT(destination_warehouse_name)                  AS has_warehouse_name,
    ROUND(
        COUNT(destination_warehouse_name)::numeric
        / NULLIF(COUNT(destination_warehouse_id), 0) * 100, 1
    )                                                  AS snapshot_fill_pct
FROM slips
WHERE is_deleted = FALSE
  AND slip_type = 'INBOUND';
-- 기대: P2-2 구현 이후 신규 생성 슬립은 snapshot_fill_pct = 100 (inventory-service 응답 성공 시)
-- 기존 row: NULL 유지 (legacy 호환) → fill_pct < 100 허용
```

### Q1-B: destinationWarehouseName 이 있는 슬립의 null 안전성 확인

```sql
-- slip-service DB
SELECT id, slip_no, destination_warehouse_id, destination_warehouse_name
FROM slips
WHERE is_deleted = FALSE
  AND slip_type = 'INBOUND'
  AND destination_warehouse_id IS NOT NULL
  AND destination_warehouse_name IS NULL
ORDER BY created_at DESC
LIMIT 20;
-- 결과: P2-2 구현 이후 생성된 슬립은 0건이어야 함 (inventory-service 정상 응답 전제)
```

### Q1-C: Flyway V26 idempotency 확인

```sql
-- slip-service DB
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'slips'
  AND column_name = 'destination_warehouse_name';
-- 기대: 1건, data_type='character varying', character_maximum_length=100, is_nullable='YES'
```

---

## 2. P2-3 — partner-service UUID ↔ accounting-service PartnerLookupClient 조회 일관

### 검증 목적

`accounting-service` 의 분개 라인 `partner_id` (UUID) 가
`partner-service` 의 `partners.id` 와 동일한 UUID 체계임을 확인.

### Q2-A: accounting-service DB — partner_id 분포

```sql
-- accounting-service DB (samhan_accounting_db)
SELECT
    partner_id,
    COUNT(*)  AS line_count,
    SUM(debit_amount)  AS total_debit,
    SUM(credit_amount) AS total_credit
FROM journal_lines
WHERE partner_id IS NOT NULL
  AND is_deleted = FALSE
GROUP BY partner_id
ORDER BY total_debit DESC
LIMIT 10;
-- 목적: partner_id 가 UUID 형식임을 확인 + 상위 거래처 볼륨 파악
```

### Q2-B: partner-service DB — partner UUID 존재 확인 (cross-DB 수동 검증)

```sql
-- partner-service DB (samhan_partner_db)
-- Q2-A 의 partner_id UUID 를 이 쿼리에 직접 대입하여 파트너 존재 확인
SELECT id, partner_code, name, status
FROM partners
WHERE id = '<accounting-service 분개의 partner_id UUID>'
  AND is_deleted = FALSE;
-- 기대: 1건 반환 (UUID 일관)
-- 미반환 시: accounting 분개에 고아 partner_id 존재 — 데이터 정합 이슈
```

### Q2-C: PartnerLookupClient.findByPartnerId — placeholder 상태 확인 (P2-3 구현 전)

P2-3 구현 전: `findByPartnerId` 가 항상 `Optional.empty()` 반환.
아래 쿼리로 에이징 보고서 대상 row 의 예상 미조회 건수를 사전 파악.

```sql
-- accounting-service DB
-- asOfDate 기준 aging 집계 대상 partner_id 개수
SELECT COUNT(DISTINCT partner_id) AS distinct_partners_with_receivable
FROM journal_lines
WHERE account_code = '110'
  AND is_deleted = FALSE
  AND partner_id IS NOT NULL;
-- 결과 N건 = P2-3 미구현 시 "(미조회)" 로 표시되는 거래처 수
```

---

## 3. P2-4 — ChartOfAccount.code → JournalLine.accountCode 컨벤션 일관

### 검증 목적

`chart_of_accounts.code` 와 `journal_lines.account_code` 가 동일 코드 체계
(한국 일반기업회계기준)임을 확인. DB-level FK 미설정이므로 컨벤션 일관성을 SQL 로 검증.

### Q3-A: journal_lines 에서 ChartOfAccount 미매핑 account_code 추출

```sql
-- accounting-service DB
SELECT DISTINCT jl.account_code
FROM journal_lines jl
LEFT JOIN chart_of_accounts coa ON jl.account_code = coa.code
WHERE coa.code IS NULL
  AND jl.is_deleted = FALSE
ORDER BY jl.account_code;
-- 결과 0건 = 모든 account_code 가 chart_of_accounts 에 등록됨 (정합)
-- 결과 N건 = LEFT JOIN 시 accountName = null 로 반환되는 code 목록 (허용 — null 표시)
```

### Q3-B: 핵심 계정코드 시드 확인

```sql
-- accounting-service DB
SELECT code, name, category
FROM chart_of_accounts
WHERE code IN ('110', '201', '255', '400', '401', '501')
  AND is_deleted = FALSE
ORDER BY code;
-- 기대 결과:
-- 110 | 외상매출금 | ASSET
-- 201 | 외상매입금 | LIABILITY
-- 255 | 부가세예수금 | LIABILITY
-- 400 | 매출 | REVENUE
-- 401 | 기타매출 | REVENUE
-- 501 | 매출원가 | EXPENSE
```

### Q3-C: 복식부기 invariant — 모든 POSTED Journal 의 차변=대변

```sql
-- accounting-service DB
SELECT j.id, j.journal_no, j.status,
       SUM(jl.debit_amount)  AS total_debit,
       SUM(jl.credit_amount) AS total_credit,
       SUM(jl.debit_amount) - SUM(jl.credit_amount) AS diff
FROM journals j
JOIN journal_lines jl ON jl.journal_id = j.id AND jl.is_deleted = FALSE
WHERE j.status = 'POSTED'
  AND j.is_deleted = FALSE
GROUP BY j.id, j.journal_no, j.status
HAVING SUM(jl.debit_amount) != SUM(jl.credit_amount)
ORDER BY j.journal_no;
-- 기대 결과: 0건 (복식부기 invariant 충족)
-- 위반 시: LEFT JOIN accountName 추가 쿼리와 무관한 기존 데이터 문제 — 별도 대응 필요
```

---

## 4. 통합 정합성 요약

| 검증 | 쿼리 | 기대 결과 |
|---|---|---|
| P2-2 V26 컬럼 존재 | Q1-C | 1건 반환 |
| P2-2 snapshot 채움 | Q1-A | 신규 슬립 snapshot_fill_pct = 100 |
| P2-3 partner_id UUID 일관 | Q2-A + Q2-B 교차 | cross-DB UUID 매칭 |
| P2-3 고아 partner_id 없음 | Q2-B | 0건 미존재 (이상적) |
| P2-4 account_code 미매핑 | Q3-A | 0건 (신규 코드 사용 시 null 허용) |
| P2-4 핵심 시드 | Q3-B | 6건 정상 반환 |
| P2-4 복식부기 invariant | Q3-C | 0건 위반 |

---

## 5. 실행 환경

- slip-service DB: `samhan_slip_db` (docker-compose arologis 또는 로컬 PostgreSQL)
- accounting-service DB: `samhan_accounting_db`
- partner-service DB: `samhan_partner_db`
- cross-DB 검증은 동일 Docker 네트워크 내 각 DB 에 직접 접속하여 수동 실행
