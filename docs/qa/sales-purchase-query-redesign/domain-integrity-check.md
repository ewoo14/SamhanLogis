# 도메인 정합성 검증 SQL — sales-purchase-query-redesign

슬라이스: `feature/sales-purchase-query-redesign`
작성일: 2026-05-11
담당: QA agent

V20 마이그레이션(`V20__slip_query_columns.sql`) 신규 컬럼에 대한 도메인 정합성 검증 쿼리 모음.

---

## 항목 1: 신규 컬럼 NULL 비율 (legacy row backfill 가이드)

### 목적
V20 신규 컬럼은 모두 NULLable 로 추가되었다. 기존 레거시 행에서 NULL 비율을 확인하여
backfill 대상 컬럼과 규모를 파악한다.

### 대상 DB
`slip_db` (slip-service 전용 PostgreSQL)

```sql
-- V20 신규 컬럼 NULL 비율 일괄 조회
-- 실행 환경: slip_db (slip-service PostgreSQL)
SELECT
    COUNT(*)                                                        AS total_rows,
    COUNT(*) FILTER (WHERE business_number    IS NULL)             AS null_business_number,
    COUNT(*) FILTER (WHERE supervision_address IS NULL)            AS null_supervision_address,
    COUNT(*) FILTER (WHERE project_name       IS NULL)             AS null_project_name,
    COUNT(*) FILTER (WHERE recipient_phone    IS NULL)             AS null_recipient_phone,
    COUNT(*) FILTER (WHERE payment_due_date   IS NULL)             AS null_payment_due_date,
    COUNT(*) FILTER (WHERE printed_at         IS NULL)             AS null_printed_at,
    ROUND(100.0 * COUNT(*) FILTER (WHERE business_number IS NULL)
          / NULLIF(COUNT(*), 0), 2)                                AS pct_null_business_number,
    ROUND(100.0 * COUNT(*) FILTER (WHERE project_name IS NULL)
          / NULLIF(COUNT(*), 0), 2)                                AS pct_null_project_name
FROM slips
WHERE is_deleted = false;
```

### 합격 기준 (초기 배포 직후)
- `total_rows` 대비 신규 컬럼 NULL 비율 100% 허용 (backfill 전)
- V20 이후 생성된 행(`created_at >= '2026-05-11'`)에서만 NULL 비율 확인

```sql
-- V20 이후 신규 행에서 NULL 비율 (backfill 적용 여부 확인)
SELECT
    COUNT(*)                                                        AS new_rows,
    COUNT(*) FILTER (WHERE business_number IS NULL)                AS null_business_number,
    COUNT(*) FILTER (WHERE project_name    IS NULL)                AS null_project_name,
    COUNT(*) FILTER (WHERE printed_at      IS NULL)                AS null_printed_at
FROM slips
WHERE is_deleted = false
  AND created_at >= '2026-05-11 00:00:00';
```

---

## 항목 2: partner-service `business_registration_no` ↔ slips.`business_number` 정합성 (cross-DB snapshot)

### 목적
slip-service 의 `slips.business_number` 는 거래처 사업자등록번호 snapshot 이다.
partner-service DB 의 `partners.business_registration_no` 와 일치하는지 검증한다.

### 한계
- 두 DB는 별도 서비스 경계. 직접 cross-DB JOIN 불가 (MSA 아키텍처 제약).
- 검증 방법: **application-level snapshot 일치 검사** — slip-service API + partner-service API 를 통해 비교.

### 대안 SQL (각 DB 개별 실행 후 결과 비교)

```sql
-- [1단계] slip_db 에서 파트너별 사업자등록번호 snapshot 추출
-- 실행 환경: slip_db
SELECT DISTINCT
    partner_id,
    partner_name,
    business_number              AS slip_business_number,
    COUNT(*) OVER (PARTITION BY partner_id, business_number) AS slip_count
FROM slips
WHERE is_deleted = false
  AND partner_id IS NOT NULL
  AND business_number IS NOT NULL
ORDER BY partner_id;
```

```sql
-- [2단계] partner_db 에서 파트너별 실제 사업자등록번호 추출
-- 실행 환경: partner_db (partner-service PostgreSQL)
SELECT
    id                           AS partner_id,
    name                         AS partner_name,
    business_registration_no     AS partner_biz_no
FROM partners
WHERE is_deleted = false
  AND business_registration_no IS NOT NULL
ORDER BY id;
```

### 비교 스크립트 (Python/Shell 기반 — CI 환경용)
두 쿼리 결과를 CSV 로 export 후 partner_id 기준 merge:

```
불일치 조건:
  slip.business_number != partner.business_registration_no
  AND slip.partner_id = partner.id
```

### 합격 기준
- 불일치 row 0건 (또는 backfill 이전 NULL 행 제외 시 0건)
- V20 이후 생성된 슬립에서 불일치 0건 필수

---

## 항목 3: printed_at vs slip_print_log 정합성

### 목적
`slips.printed_at` 컬럼은 `recordPrint()` 도메인 메서드로만 채워진다.
별도 print_log 테이블이 존재할 경우 printed_at 과 로그 간 정합성을 검증한다.

### 현재 상태
V20 기준 별도 `slip_print_log` 테이블은 미존재 (향후 감사 로그 확장 시 추가 예정).
`printed_at IS NOT NULL` 인 행을 인쇄 완료로 단일 관리.

```sql
-- 인쇄 완료 슬립 수 확인
-- 실행 환경: slip_db
SELECT
    COUNT(*)                                        AS total_active,
    COUNT(*) FILTER (WHERE printed_at IS NOT NULL)  AS printed_count,
    COUNT(*) FILTER (WHERE printed_at IS NULL)       AS not_printed_count,
    MIN(printed_at)                                 AS earliest_print,
    MAX(printed_at)                                 AS latest_print
FROM slips
WHERE is_deleted = false;
```

### 합격 기준
- `printed_at IS NOT NULL` 행에서 `printed_at` 이 `created_at` 이후 시각 (논리 무결성)
- `printed_at` 이 `updated_at` 이하 시각 (타임스탬프 순서 정합)

```sql
-- printed_at 타임스탬프 논리 무결성 검증
SELECT
    id,
    slip_no,
    created_at,
    printed_at,
    updated_at
FROM slips
WHERE is_deleted = false
  AND printed_at IS NOT NULL
  AND (printed_at < created_at OR printed_at > updated_at);
-- 결과 0건 = 합격
```

---

## 항목 4: DeliveryBatch partial unique (driver_phone, batch_date)

### 목적
`delivery_batches.driver_phone + batch_date` 조합의 partial UNIQUE INDEX 유지 여부 검증.

```sql
-- 중복 (driver_phone, batch_date) 탐지
-- 실행 환경: slip_db
SELECT
    driver_phone,
    batch_date,
    COUNT(*) AS cnt
FROM delivery_batches
WHERE is_deleted = false
GROUP BY driver_phone, batch_date
HAVING COUNT(*) > 1;
-- 결과 0건 = 합격
```

---

## 항목 5: Idempotency 검증 — seeder 2회 재실행 후 row count 동일

### 목적
같은 `idempotency_key` 로 슬립 생성 요청을 2회 반복해도 slip row 가 1건만 존재함을 검증.

```sql
-- idempotency_key 기준 중복 row 탐지
-- 실행 환경: slip_db
SELECT
    idempotency_key,
    COUNT(*) AS cnt
FROM slips
WHERE is_deleted = false
  AND idempotency_key IS NOT NULL
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
-- 결과 0건 = 합격 (중복 없음)
```

### 연계 IT
`SlipQueryRedesignSpecIT.specIt5_idempotencySeederRerun()` — 동일 키 2회 요청 후 totalElements 일관성 검증.

---

## 실행 순서 가이드

1. `docs/qa/sales-purchase-query-redesign/domain-integrity-check.md` 의 SQL 을 순서대로 실행
2. 각 쿼리 결과를 `docs/qa/sales-purchase-query-redesign/` 에 CSV 로 저장 (선택)
3. 불합격 항목 발견 시 BE agent 에게 즉시 보고

---

## 요약 (검증 항목 수: 5개)

| 번호 | 항목 | DB | 합격 기준 |
|------|------|----|-----------|
| 1 | V20 신규 컬럼 NULL 비율 | slip_db | V20 이후 신규 행 backfill 현황 파악 |
| 2 | partner biz_no ↔ slip business_number 정합 | slip_db + partner_db | 불일치 0건 |
| 3 | printed_at 타임스탬프 논리 무결성 | slip_db | printed_at >= created_at, 0건 이상 |
| 4 | DeliveryBatch partial unique | slip_db | (driver_phone, batch_date) 중복 0건 |
| 5 | Idempotency row count | slip_db | idempotency_key 중복 0건 |
