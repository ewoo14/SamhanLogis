-- V12__seed_tax_invoice_issuance.sql
-- P0-4 세금계산서 발행 시나리오 검증용 seed (DEV 환경 한정).
--
-- 적용 원칙:
--   * V11 신규 컬럼(cancel_reason / tax_invoice_lines.unit) 포함.
--   * [DEV-SEED] 격리 식별자 — description 및 tax_invoice_no prefix 명시.
--   * partnerBusinessNo 정상 형식 (NNN-NN-NNNNN) 준수.
--   * UUID = 결정적 하드코딩 — Flyway re-run 안전 (ON CONFLICT DO NOTHING).
--   * VAT 10% 엄수: vat_amount = supply_amount * 0.10, total_amount = supply_amount * 1.10.
--   * 상태별 6건: DRAFT 2건 / ISSUED 3건 / CANCELLED 1건.
--   * 각 TaxInvoice 마다 라인 2~3건 포함.
--   * partner_id 더미 UUID (cross-DB 외래키 없음 — MSA 독립 DB).
--
-- TaxInvoice 6건:
--   DRAFT-001   DRAFT  매출  — (주)한진물류 운임 서비스         2026-05-05  2,000,000 (라인2건)
--   DRAFT-002   DRAFT  매출  — 대한통운(주) 창고보관료          2026-05-10  1,500,000 (라인2건)
--   ISSUED-001  ISSUED 매출  — (주)CJ대한통운 특송료            2026-05-03  3,000,000 (라인3건)
--   ISSUED-002  ISSUED 매출  — 롯데글로벌로지스(주) 운반료      2026-05-07  2,500,000 (라인2건)
--   ISSUED-003  ISSUED 매입  — (주)SK에너지 유류비              2026-05-09  1,800,000 (라인2건)
--   CANCELLED-001 CANCELLED 매출 — (주)범한판토스 물류용역비   2026-04-28  4,000,000 (라인3건)
--
-- UUID 목록 (결정적):
--   DRAFT-001    = c0d0e0f0-1234-5678-abcd-000000000101
--   DRAFT-002    = c0d0e0f0-1234-5678-abcd-000000000102
--   ISSUED-001   = c0d0e0f0-1234-5678-abcd-000000000201
--   ISSUED-002   = c0d0e0f0-1234-5678-abcd-000000000202
--   ISSUED-003   = c0d0e0f0-1234-5678-abcd-000000000203
--   CANCELLED-001= c0d0e0f0-1234-5678-abcd-000000000301
--
-- partner_id 더미 UUID:
--   P-한진물류         = d0000001-0000-0000-0000-000000000101
--   P-대한통운         = d0000001-0000-0000-0000-000000000102
--   P-CJ대한통운       = d0000001-0000-0000-0000-000000000201
--   P-롯데글로벌로지스  = d0000001-0000-0000-0000-000000000202
--   P-SK에너지         = d0000001-0000-0000-0000-000000000203
--   P-범한판토스        = d0000001-0000-0000-0000-000000000301

----------------------------------------------------------------------
-- 1) tax_invoice_number_sequences — ISSUED/CANCELLED 발행일 채번 시퀀스
--    ON CONFLICT DO NOTHING — 실운영 row 존재 시 skip.
----------------------------------------------------------------------
INSERT INTO tax_invoice_number_sequences
    (id, issue_date, last_seq, version, created_at, created_by, is_deleted)
VALUES
-- 2026-04-28: CANCELLED-001 발행일
(gen_random_uuid(), '2026-04-28', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-03: ISSUED-001 발행일
(gen_random_uuid(), '2026-05-03', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-07: ISSUED-002 발행일
(gen_random_uuid(), '2026-05-07', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-09: ISSUED-003 발행일
(gen_random_uuid(), '2026-05-09', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE)
ON CONFLICT (issue_date) DO NOTHING;

----------------------------------------------------------------------
-- 2) tax_invoices — 세금계산서 헤더 6건
----------------------------------------------------------------------

-- ===== DRAFT-001: DRAFT — (주)한진물류 운임 서비스 (2026-05-05) =====
-- supply_amount=2,000,000 / vat_amount=200,000 / total_amount=2,200,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000101',
    NULL,
    'd0000001-0000-0000-0000-000000000101',
    '102-81-12301',
    '(주)한진물류',
    '서울시 중구 청계천로 40',
    '2026-05-05',
    2000000.00,
    200000.00,
    2200000.00,
    'DRAFT',
    NULL,
    NULL,
    'SALES',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — DRAFT 세금계산서 (운임 서비스)',
    0,
    '2026-05-05 09:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== DRAFT-002: DRAFT — 대한통운(주) 창고보관료 (2026-05-10) =====
-- supply_amount=1,500,000 / vat_amount=150,000 / total_amount=1,650,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000102',
    NULL,
    'd0000001-0000-0000-0000-000000000102',
    '104-81-12302',
    '대한통운(주)',
    '서울시 마포구 상암동 1605',
    '2026-05-10',
    1500000.00,
    150000.00,
    1650000.00,
    'DRAFT',
    NULL,
    NULL,
    'SALES',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — DRAFT 세금계산서 (창고보관료)',
    0,
    '2026-05-10 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== ISSUED-001: ISSUED — (주)CJ대한통운 특송료 (2026-05-03) =====
-- supply_amount=3,000,000 / vat_amount=300,000 / total_amount=3,300,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000201',
    'SEED-P04-I001',
    'd0000001-0000-0000-0000-000000000201',
    '112-81-20301',
    '(주)CJ대한통운',
    '서울시 중구 남대문로 63',
    '2026-05-03',
    3000000.00,
    300000.00,
    3300000.00,
    'ISSUED',
    '2026-05-03 11:00:00',
    'SYSTEM_SEED',
    'SALES',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — ISSUED 세금계산서 (특송료)',
    0,
    '2026-05-03 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== ISSUED-002: ISSUED — 롯데글로벌로지스(주) 운반료 (2026-05-07) =====
-- supply_amount=2,500,000 / vat_amount=250,000 / total_amount=2,750,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000202',
    'SEED-P04-I002',
    'd0000001-0000-0000-0000-000000000202',
    '116-81-20302',
    '롯데글로벌로지스(주)',
    '서울시 강남구 논현로 508',
    '2026-05-07',
    2500000.00,
    250000.00,
    2750000.00,
    'ISSUED',
    '2026-05-07 13:00:00',
    'SYSTEM_SEED',
    'SALES',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — ISSUED 세금계산서 (운반료)',
    0,
    '2026-05-07 13:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== ISSUED-003: ISSUED — (주)SK에너지 유류비 (2026-05-09) =====
-- supply_amount=1,800,000 / vat_amount=180,000 / total_amount=1,980,000
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000203',
    'SEED-P04-I003',
    'd0000001-0000-0000-0000-000000000203',
    '125-81-20303',
    '(주)SK에너지',
    '서울시 종로구 종로 26',
    '2026-05-09',
    1800000.00,
    180000.00,
    1980000.00,
    'ISSUED',
    '2026-05-09 15:00:00',
    'SYSTEM_SEED',
    'PURCHASE',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — ISSUED 매입 세금계산서 (유류비)',
    0,
    '2026-05-09 15:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== CANCELLED-001: CANCELLED — (주)범한판토스 물류용역비 (2026-04-28) =====
-- supply_amount=4,000,000 / vat_amount=400,000 / total_amount=4,400,000
-- cancel_reason: V11 신규 컬럼 (5자 이상 의무)
INSERT INTO tax_invoices
    (id, tax_invoice_no, partner_id, partner_business_no, partner_name,
     partner_address, supply_date, supply_amount, vat_amount, total_amount,
     status, issued_at, issued_by, cancelled_at, cancelled_by, cancel_reason,
     invoice_type, description,
     version, created_at, created_by, is_deleted)
VALUES
(
    'c0d0e0f0-1234-5678-abcd-000000000301',
    'SEED-P04-C001',
    'd0000001-0000-0000-0000-000000000301',
    '220-81-30301',
    '(주)범한판토스',
    '서울시 강서구 공항대로 475',
    '2026-04-28',
    4000000.00,
    400000.00,
    4400000.00,
    'CANCELLED',
    '2026-04-28 10:00:00',
    'SYSTEM_SEED',
    '2026-04-30 09:00:00',
    'SYSTEM_SEED',
    '계약 변경으로 인한 세금계산서 취소 — 재발행 예정',
    'SALES',
    '[DEV-SEED] P0-4 발행 시나리오 검증 — CANCELLED 세금계산서 (물류용역비)',
    0,
    '2026-04-28 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

----------------------------------------------------------------------
-- 3) tax_invoice_lines — 각 TaxInvoice 라인 (총 14건)
--    unit 컬럼: V11 신규 (건/kg/CBM 등)
--    UUID = gen_random_uuid() — 헤더 UUID 파생 가독성 유지
----------------------------------------------------------------------

-- === DRAFT-001 라인 (2건) ===
-- 라인1: 항공운임 기본료  quantity=10 × unit_price=150,000 = supply=1,500,000  vat=150,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000101',
    'c0d0e0f0-1234-5678-abcd-000000000101',
    1,
    '항공운임 기본료',
    '건',
    '건',
    10.00,
    150000.00,
    1500000.00,
    150000.00,
    '5월 항공화물 기본 운임',
    '2026-05-05 09:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 연료할증료  quantity=10 × unit_price=50,000 = supply=500,000  vat=50,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000102',
    'c0d0e0f0-1234-5678-abcd-000000000101',
    2,
    '연료할증료',
    'kg',
    'kg',
    10.00,
    50000.00,
    500000.00,
    50000.00,
    '5월 YQ 연료할증',
    '2026-05-05 09:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- === DRAFT-002 라인 (2건) ===
-- 라인1: 창고보관료  quantity=100 × unit_price=10,000 = supply=1,000,000  vat=100,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000111',
    'c0d0e0f0-1234-5678-abcd-000000000102',
    1,
    '창고보관료',
    '박스',
    '박스',
    100.00,
    10000.00,
    1000000.00,
    100000.00,
    '5월 창고 보관 요금',
    '2026-05-10 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 입출고 작업비  quantity=50 × unit_price=10,000 = supply=500,000  vat=50,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000112',
    'c0d0e0f0-1234-5678-abcd-000000000102',
    2,
    '입출고 작업비',
    '건',
    '건',
    50.00,
    10000.00,
    500000.00,
    50000.00,
    '5월 입출고 핸들링 작업비',
    '2026-05-10 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- === ISSUED-001 라인 (3건) ===
-- 라인1: 특송 기본료  quantity=20 × unit_price=100,000 = supply=2,000,000  vat=200,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000201',
    'c0d0e0f0-1234-5678-abcd-000000000201',
    1,
    '특송 기본료',
    '건',
    '건',
    20.00,
    100000.00,
    2000000.00,
    200000.00,
    '5월 특송 기본 운임 20건',
    '2026-05-03 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 관세납부 대행료  quantity=10 × unit_price=50,000 = supply=500,000  vat=50,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000202',
    'c0d0e0f0-1234-5678-abcd-000000000201',
    2,
    '관세납부 대행료',
    '건',
    '건',
    10.00,
    50000.00,
    500000.00,
    50000.00,
    '5월 관세납부 대행 10건',
    '2026-05-03 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인3: 통관 수수료  quantity=5 × unit_price=100,000 = supply=500,000  vat=50,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000203',
    'c0d0e0f0-1234-5678-abcd-000000000201',
    3,
    '통관 수수료',
    '건',
    '건',
    5.00,
    100000.00,
    500000.00,
    50000.00,
    '5월 수입통관 수수료 5건',
    '2026-05-03 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- === ISSUED-002 라인 (2건) ===
-- 라인1: 육상운반료  quantity=50 × unit_price=40,000 = supply=2,000,000  vat=200,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000211',
    'c0d0e0f0-1234-5678-abcd-000000000202',
    1,
    '육상운반료',
    'km',
    'km',
    50.00,
    40000.00,
    2000000.00,
    200000.00,
    '5월 서울-인천 육상운반 50회',
    '2026-05-07 13:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 상하차 작업비  quantity=50 × unit_price=10,000 = supply=500,000  vat=50,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000212',
    'c0d0e0f0-1234-5678-abcd-000000000202',
    2,
    '상하차 작업비',
    '건',
    '건',
    50.00,
    10000.00,
    500000.00,
    50000.00,
    '5월 상하차 작업 인건비',
    '2026-05-07 13:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- === ISSUED-003 라인 (2건, 매입) ===
-- 라인1: 경유  quantity=2,000 × unit_price=800 = supply=1,600,000  vat=160,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000221',
    'c0d0e0f0-1234-5678-abcd-000000000203',
    1,
    '경유',
    '리터',
    'L',
    2000.00,
    800.00,
    1600000.00,
    160000.00,
    '5월 차량 경유 주유비',
    '2026-05-09 15:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 엔진오일  quantity=20 × unit_price=10,000 = supply=200,000  vat=20,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000222',
    'c0d0e0f0-1234-5678-abcd-000000000203',
    2,
    '엔진오일',
    '캔',
    '캔',
    20.00,
    10000.00,
    200000.00,
    20000.00,
    '5월 차량 엔진오일 교환',
    '2026-05-09 15:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- === CANCELLED-001 라인 (3건) ===
-- 라인1: 물류용역 기본료  quantity=1 × unit_price=3,000,000 = supply=3,000,000  vat=300,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000301',
    'c0d0e0f0-1234-5678-abcd-000000000301',
    1,
    '물류용역 기본료',
    '식',
    '식',
    1.00,
    3000000.00,
    3000000.00,
    300000.00,
    '4월 물류 용역 계약금',
    '2026-04-28 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인2: 포장재 비용  quantity=200 × unit_price=3,000 = supply=600,000  vat=60,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000302',
    'c0d0e0f0-1234-5678-abcd-000000000301',
    2,
    '포장재 비용',
    '개',
    '개',
    200.00,
    3000.00,
    600000.00,
    60000.00,
    '4월 박스/테이프 등 포장재',
    '2026-04-28 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 라인3: 보험료  quantity=1 × unit_price=400,000 = supply=400,000  vat=40,000
INSERT INTO tax_invoice_lines
    (id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
     supply_amount, vat_amount, memo, created_at, created_by, is_deleted)
VALUES
(
    'c1d1e1f1-1234-5678-abcd-000000000303',
    'c0d0e0f0-1234-5678-abcd-000000000301',
    3,
    '화물보험료',
    '건',
    '건',
    1.00,
    400000.00,
    400000.00,
    40000.00,
    '4월 화물 적하보험 (취소분)',
    '2026-04-28 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

----------------------------------------------------------------------
-- 검증 요약 (VAT 10% 균형 확인)
--
-- DRAFT-001   : supply=2,000,000  vat= 200,000  total=2,200,000  (DRAFT, SALES)
-- DRAFT-002   : supply=1,500,000  vat= 150,000  total=1,650,000  (DRAFT, SALES)
-- ISSUED-001  : supply=3,000,000  vat= 300,000  total=3,300,000  (ISSUED, SALES)
-- ISSUED-002  : supply=2,500,000  vat= 250,000  total=2,750,000  (ISSUED, SALES)
-- ISSUED-003  : supply=1,800,000  vat= 180,000  total=1,980,000  (ISSUED, PURCHASE)
-- CANCELLED-001: supply=4,000,000 vat= 400,000  total=4,400,000  (CANCELLED, SALES)
--
-- 라인 합계 검증 (TaxInvoice 헤더 supply = 라인 supply 합):
--   DRAFT-001   : 1,500,000 + 500,000 = 2,000,000  OK
--   DRAFT-002   : 1,000,000 + 500,000 = 1,500,000  OK
--   ISSUED-001  : 2,000,000 + 500,000 + 500,000 = 3,000,000  OK
--   ISSUED-002  : 2,000,000 + 500,000 = 2,500,000  OK
--   ISSUED-003  : 1,600,000 + 200,000 = 1,800,000  OK
--   CANCELLED-001: 3,000,000 + 600,000 + 400,000 = 4,000,000  OK
--
-- P0-4 시나리오 식별자 (P04ValidationIT 참조):
--   DRAFT      테스트: c0d0e0f0-...-000000000101 (DRAFT-001)
--   ISSUED     테스트: c0d0e0f0-...-000000000201 (ISSUED-001)
--   CANCELLED  테스트: c0d0e0f0-...-000000000301 (CANCELLED-001)
--   LIST 테스트: status=ISSUED → 3건 (ISSUED-001/002/003) 반환
----------------------------------------------------------------------
