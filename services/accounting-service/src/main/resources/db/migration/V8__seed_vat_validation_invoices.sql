-- V8__seed_vat_validation_invoices.sql
-- P0-1 Slice B — 부가세신고서 / 법인세신고서 검증용 TaxInvoice seed (DEV 환경 한정).
--
-- 적용 원칙:
--   * partner_id 는 UUID 더미 (cross-DB 외래키 없음 — 물류 MSA 독립 DB).
--   * tax_invoice_no 에 'SEED-' prefix + description 에 [DEV-SEED] 명시 → 운영 식별.
--   * 상태 = ISSUED + issued_at 설정 (VAT 신고 대상 기준).
--   * supply_date = 2026-04 (2Q 부가세 신고 기간 검증).
--   * VAT 10% 엄수: vat_amount = supply_amount * 0.10, total_amount = supply_amount * 1.10.
--   * UUID = 결정적 하드코딩 — Flyway re-run 안전 (ON CONFLICT DO NOTHING).
--   * invoice_type 컬럼: V7 에서 추가된 SALES/PURCHASE 구분.
--
-- TaxInvoice 5건:
--   SEED-VAT-S001  매출 세금계산서 — (주)삼한물류 운임 서비스   2026-04-05  5,000,000
--   SEED-VAT-S002  매출 세금계산서 — 한국통운 특송료             2026-04-15  3,200,000
--   SEED-VAT-S003  매출 세금계산서 — 동방물류 창고보관료         2026-04-25  1,800,000
--   SEED-VAT-P001  매입 세금계산서 — 현대오일뱅크 유류비         2026-04-10  2,500,000
--   SEED-VAT-P002  매입 세금계산서 — SK렌터카 차량임차비         2026-04-20  1,200,000
--
-- UUID 목록 (결정적):
--   SEED-VAT-S001 = a1b2c3d4-e5f6-7890-abcd-ef1234567801
--   SEED-VAT-S002 = a1b2c3d4-e5f6-7890-abcd-ef1234567802
--   SEED-VAT-S003 = a1b2c3d4-e5f6-7890-abcd-ef1234567803
--   SEED-VAT-P001 = a1b2c3d4-e5f6-7890-abcd-ef1234567811
--   SEED-VAT-P002 = a1b2c3d4-e5f6-7890-abcd-ef1234567812
--
-- partner_id 더미 UUID:
--   P-삼한물류    = b0000001-0000-0000-0000-000000000001
--   P-한국통운    = b0000001-0000-0000-0000-000000000002
--   P-동방물류    = b0000001-0000-0000-0000-000000000003
--   P-현대오일뱅크 = b0000001-0000-0000-0000-000000000011
--   P-SK렌터카    = b0000001-0000-0000-0000-000000000012

----------------------------------------------------------------------
-- 1) tax_invoice_number_sequences — 발행일 채번 시퀀스 (날짜별 선점)
--    ON CONFLICT DO NOTHING — 이미 실제 운영 row 존재 시 skip.
----------------------------------------------------------------------
INSERT INTO tax_invoice_number_sequences
    (id, issue_date, last_seq, version, created_at, created_by, is_deleted)
VALUES
-- 2026-04-05: SEED-VAT-S001
(gen_random_uuid(), '2026-04-05', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-10: SEED-VAT-P001
(gen_random_uuid(), '2026-04-10', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-15: SEED-VAT-S002
(gen_random_uuid(), '2026-04-15', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-20: SEED-VAT-P002
(gen_random_uuid(), '2026-04-20', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-25: SEED-VAT-S003
(gen_random_uuid(), '2026-04-25', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE)
ON CONFLICT (issue_date) DO NOTHING;

----------------------------------------------------------------------
-- 2) tax_invoices — 세금계산서 헤더 5건
----------------------------------------------------------------------

-- ===== SEED-VAT-S001: 매출 — (주)삼한물류 운임 서비스 (2026-04-05) =====
-- supply_amount=5,000,000 / vat_amount=500,000 / total_amount=5,500,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567801',
    'SEED-VAT-S001',
    'b0000001-0000-0000-0000-000000000001',
    '123-45-67001',
    '(주)삼한물류',
    '서울시 강남구 역삼동 100-1',
    '2026-04-05',
    5000000.00,
    500000.00,
    5500000.00,
    'ISSUED',
    '2026-04-05 10:00:00',
    'SYSTEM_SEED',
    'SALES',
    '[DEV-SEED] 매출 세금계산서 — 2Q 부가세신고 검증용 (운임 서비스)',
    0,
    '2026-04-05 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-VAT-S002: 매출 — 한국통운 특송료 (2026-04-15) =====
-- supply_amount=3,200,000 / vat_amount=320,000 / total_amount=3,520,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567802',
    'SEED-VAT-S002',
    'b0000001-0000-0000-0000-000000000002',
    '234-56-78002',
    '한국통운(주)',
    '부산시 남구 문현동 200-2',
    '2026-04-15',
    3200000.00,
    320000.00,
    3520000.00,
    'ISSUED',
    '2026-04-15 11:00:00',
    'SYSTEM_SEED',
    'SALES',
    '[DEV-SEED] 매출 세금계산서 — 2Q 부가세신고 검증용 (특송료)',
    0,
    '2026-04-15 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-VAT-S003: 매출 — 동방물류 창고보관료 (2026-04-25) =====
-- supply_amount=1,800,000 / vat_amount=180,000 / total_amount=1,980,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567803',
    'SEED-VAT-S003',
    'b0000001-0000-0000-0000-000000000003',
    '345-67-89003',
    '동방물류(주)',
    '인천시 중구 신흥동 300-3',
    '2026-04-25',
    1800000.00,
    180000.00,
    1980000.00,
    'ISSUED',
    '2026-04-25 14:00:00',
    'SYSTEM_SEED',
    'SALES',
    '[DEV-SEED] 매출 세금계산서 — 2Q 부가세신고 검증용 (창고보관료)',
    0,
    '2026-04-25 14:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-VAT-P001: 매입 — 현대오일뱅크 유류비 (2026-04-10) =====
-- supply_amount=2,500,000 / vat_amount=250,000 / total_amount=2,750,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567811',
    'SEED-VAT-P001',
    'b0000001-0000-0000-0000-000000000011',
    '456-78-90011',
    '현대오일뱅크(주)',
    '서울시 종로구 청진동 400-11',
    '2026-04-10',
    2500000.00,
    250000.00,
    2750000.00,
    'ISSUED',
    '2026-04-10 09:00:00',
    'SYSTEM_SEED',
    'PURCHASE',
    '[DEV-SEED] 매입 세금계산서 — 2Q 부가세신고 검증용 (유류비)',
    0,
    '2026-04-10 09:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-VAT-P002: 매입 — SK렌터카 차량임차비 (2026-04-20) =====
-- supply_amount=1,200,000 / vat_amount=120,000 / total_amount=1,320,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567812',
    'SEED-VAT-P002',
    'b0000001-0000-0000-0000-000000000012',
    '567-89-01012',
    'SK렌터카(주)',
    '서울시 서초구 서초동 500-12',
    '2026-04-20',
    1200000.00,
    120000.00,
    1320000.00,
    'ISSUED',
    '2026-04-20 15:00:00',
    'SYSTEM_SEED',
    'PURCHASE',
    '[DEV-SEED] 매입 세금계산서 — 2Q 부가세신고 검증용 (차량임차비)',
    0,
    '2026-04-20 15:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

----------------------------------------------------------------------
-- 검증 요약 (부가세 10% 균형 확인)
-- SEED-VAT-S001: 5,000,000 * 1.10 = 5,500,000  (vat=500,000)   OK  SALES
-- SEED-VAT-S002: 3,200,000 * 1.10 = 3,520,000  (vat=320,000)   OK  SALES
-- SEED-VAT-S003: 1,800,000 * 1.10 = 1,980,000  (vat=180,000)   OK  SALES
-- SEED-VAT-P001: 2,500,000 * 1.10 = 2,750,000  (vat=250,000)   OK  PURCHASE
-- SEED-VAT-P002: 1,200,000 * 1.10 = 1,320,000  (vat=120,000)   OK  PURCHASE
--
-- 매출 합계:  supply=10,000,000 / vat=1,000,000 / total=11,000,000
-- 매입 합계:  supply= 3,700,000 / vat=  370,000 / total= 4,070,000
-- 납부 VAT:   1,000,000 - 370,000 = 630,000 (2Q 예상 납부세액)
----------------------------------------------------------------------
