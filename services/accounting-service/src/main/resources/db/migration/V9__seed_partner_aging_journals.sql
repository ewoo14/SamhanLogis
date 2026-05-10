-- V9__seed_partner_aging_journals.sql
-- P0-1 Slice B — 거래처 미수/미지급 잔액 검증용 분개 seed (DEV 환경 한정).
--
-- 적용 원칙:
--   * V6 기존 분개 7건 (110/220 계정 사용) 과 분리 — 별도 journal_no 'SEED-AGE-' prefix.
--   * 미수 잔액 검증 (RECEIVABLE): 110(외상매출금) 차변 3건 — 서로 다른 partner_id.
--   * 미지급 잔액 검증 (PAYABLE):  201(외상매입금) 대변 2건.
--     (한국 일반기업회계기준: 201 외상매입금 LIABILITY)
--   * 모든 분개 sum(debit) = sum(credit) 복식부기 균형 엄격 준수.
--   * 상태 = POSTED (posted_by = SYSTEM_SEED).
--   * UUID = 결정적 하드코딩 — Flyway re-run 안전.
--   * journal_lines 의 partner_id 컬럼 활용 → partner_aging 집계 쿼리 검증 대상.
--   * ON CONFLICT DO NOTHING 전략.
--
-- 분개 5건 목록:
--   SEED-AGE-001  미수 — (주)삼한물류       110 차변 2,200,000  2026-04-05
--   SEED-AGE-002  미수 — 한국통운(주)       110 차변 3,520,000  2026-04-15
--   SEED-AGE-003  미수 — 동방물류(주)       110 차변 1,980,000  2026-04-25
--   SEED-AGE-004  미지급 — 현대오일뱅크    201 대변 2,750,000  2026-04-10
--   SEED-AGE-005  미지급 — SK렌터카        201 대변 1,320,000  2026-04-20
--
-- UUID 목록 (결정적):
--   SEED-AGE-001 = c2d3e4f5-a6b7-8901-cdef-012345678901
--   SEED-AGE-002 = c2d3e4f5-a6b7-8901-cdef-012345678902
--   SEED-AGE-003 = c2d3e4f5-a6b7-8901-cdef-012345678903
--   SEED-AGE-004 = c2d3e4f5-a6b7-8901-cdef-012345678911
--   SEED-AGE-005 = c2d3e4f5-a6b7-8901-cdef-012345678912
--
-- partner_id (V8 과 동일 더미 UUID 사용):
--   P-삼한물류    = b0000001-0000-0000-0000-000000000001
--   P-한국통운    = b0000001-0000-0000-0000-000000000002
--   P-동방물류    = b0000001-0000-0000-0000-000000000003
--   P-현대오일뱅크 = b0000001-0000-0000-0000-000000000011
--   P-SK렌터카    = b0000001-0000-0000-0000-000000000012
--
-- 계정과목 참조 (V1 기준):
--   101  현금          ASSET
--   110  외상매출금    ASSET    (미수 잔액 차변)
--   201  외상매입금    LIABILITY (미지급 잔액 대변)
--   102  보통예금      ASSET

----------------------------------------------------------------------
-- 1) journal_number_sequences — 채번 시퀀스 (날짜별 선점)
--    V6 에서 이미 삽입한 날짜와 겹치지 않는 2026-04 날짜만 삽입.
--    ON CONFLICT DO NOTHING — 실제 운영 row 또는 V8 시퀀스 존재 시 skip.
----------------------------------------------------------------------
INSERT INTO journal_number_sequences
    (id, journal_date, last_seq, version, created_at, created_by, is_deleted)
VALUES
-- 2026-04-05: SEED-AGE-001
(gen_random_uuid(), '2026-04-05', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-10: SEED-AGE-004
(gen_random_uuid(), '2026-04-10', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-15: SEED-AGE-002
(gen_random_uuid(), '2026-04-15', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-20: SEED-AGE-005
(gen_random_uuid(), '2026-04-20', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-04-25: SEED-AGE-003
(gen_random_uuid(), '2026-04-25', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE)
ON CONFLICT (journal_date) DO NOTHING;

----------------------------------------------------------------------
-- 2) journals — 분개 헤더 5건
----------------------------------------------------------------------

-- ===== SEED-AGE-001: 미수 — (주)삼한물류 (2026-04-05) =====
-- 차변: 외상매출금(110) 2,200,000 / 대변: 제품매출(404) 2,000,000 + 부가세예수금(220) 200,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c2d3e4f5-a6b7-8901-cdef-012345678901',
    'SEED-AGE-001',
    '2026-04-05',
    '[DEV-SEED] 거래처 미수 분개 — (주)삼한물류 (partner_aging 검증용)',
    'MANUAL',
    'POSTED',
    '2026-04-05 10:00:00',
    'SYSTEM_SEED',
    0,
    '2026-04-05 10:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-AGE-002: 미수 — 한국통운(주) (2026-04-15) =====
-- 차변: 외상매출금(110) 3,520,000 / 대변: 제품매출(404) 3,200,000 + 부가세예수금(220) 320,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c2d3e4f5-a6b7-8901-cdef-012345678902',
    'SEED-AGE-002',
    '2026-04-15',
    '[DEV-SEED] 거래처 미수 분개 — 한국통운(주) (partner_aging 검증용)',
    'MANUAL',
    'POSTED',
    '2026-04-15 11:00:00',
    'SYSTEM_SEED',
    0,
    '2026-04-15 11:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-AGE-003: 미수 — 동방물류(주) (2026-04-25) =====
-- 차변: 외상매출금(110) 1,980,000 / 대변: 제품매출(404) 1,800,000 + 부가세예수금(220) 180,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c2d3e4f5-a6b7-8901-cdef-012345678903',
    'SEED-AGE-003',
    '2026-04-25',
    '[DEV-SEED] 거래처 미수 분개 — 동방물류(주) (partner_aging 검증용)',
    'MANUAL',
    'POSTED',
    '2026-04-25 14:00:00',
    'SYSTEM_SEED',
    0,
    '2026-04-25 14:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-AGE-004: 미지급 — 현대오일뱅크(주) (2026-04-10) =====
-- 차변: 차량유류비(819 임차료 계정 대용) 2,500,000 + 부가세대급금(신규 차변으로 대체) →
-- 단순화: 차변: 현금(101) 2,750,000 / 대변: 외상매입금(201) 2,750,000
-- (미지급 잔액 발생: 현금 대여 → 외상매입금 계상, 미결제 상태)
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c2d3e4f5-a6b7-8901-cdef-012345678911',
    'SEED-AGE-004',
    '2026-04-10',
    '[DEV-SEED] 거래처 미지급 분개 — 현대오일뱅크(주) (partner_aging 검증용)',
    'MANUAL',
    'POSTED',
    '2026-04-10 09:00:00',
    'SYSTEM_SEED',
    0,
    '2026-04-10 09:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ===== SEED-AGE-005: 미지급 — SK렌터카(주) (2026-04-20) =====
-- 차변: 현금(101) 1,320,000 / 대변: 외상매입금(201) 1,320,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c2d3e4f5-a6b7-8901-cdef-012345678912',
    'SEED-AGE-005',
    '2026-04-20',
    '[DEV-SEED] 거래처 미지급 분개 — SK렌터카(주) (partner_aging 검증용)',
    'MANUAL',
    'POSTED',
    '2026-04-20 15:00:00',
    'SYSTEM_SEED',
    0,
    '2026-04-20 15:00:00',
    'SYSTEM_SEED',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

----------------------------------------------------------------------
-- 3) journal_lines — 분개 라인 (복식부기 균형 엄격 준수)
--    journal_lines.partner_id 컬럼 활용 → partner_aging 집계 쿼리 검증 대상.
--    CHECK 제약: (debit_amount > 0 AND credit_amount = 0)
--             OR (debit_amount = 0 AND credit_amount > 0)
----------------------------------------------------------------------

-- ===== SEED-AGE-001 라인 — (주)삼한물류 미수 =====
-- 차변: 외상매출금(110) 2,200,000 — partner_id=삼한물류
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678901',
    1, '110', 2200000.00, 0.00,
    'b0000001-0000-0000-0000-000000000001',
    '[DEV-SEED] 외상매출금 — (주)삼한물류 (미수 잔액)',
    '2026-04-05 10:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 제품매출(404) 2,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678901',
    2, '404', 0.00, 2000000.00,
    'b0000001-0000-0000-0000-000000000001',
    '[DEV-SEED] 제품매출 공급가액 — (주)삼한물류',
    '2026-04-05 10:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 부가세예수금(220) 200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678901',
    3, '220', 0.00, 200000.00,
    'b0000001-0000-0000-0000-000000000001',
    '[DEV-SEED] 부가세예수금 10%',
    '2026-04-05 10:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-AGE-002 라인 — 한국통운(주) 미수 =====
-- 차변: 외상매출금(110) 3,520,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678902',
    1, '110', 3520000.00, 0.00,
    'b0000001-0000-0000-0000-000000000002',
    '[DEV-SEED] 외상매출금 — 한국통운(주) (미수 잔액)',
    '2026-04-15 11:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 제품매출(404) 3,200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678902',
    2, '404', 0.00, 3200000.00,
    'b0000001-0000-0000-0000-000000000002',
    '[DEV-SEED] 제품매출 공급가액 — 한국통운(주)',
    '2026-04-15 11:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 부가세예수금(220) 320,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678902',
    3, '220', 0.00, 320000.00,
    'b0000001-0000-0000-0000-000000000002',
    '[DEV-SEED] 부가세예수금 10%',
    '2026-04-15 11:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-AGE-003 라인 — 동방물류(주) 미수 =====
-- 차변: 외상매출금(110) 1,980,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678903',
    1, '110', 1980000.00, 0.00,
    'b0000001-0000-0000-0000-000000000003',
    '[DEV-SEED] 외상매출금 — 동방물류(주) (미수 잔액)',
    '2026-04-25 14:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 제품매출(404) 1,800,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678903',
    2, '404', 0.00, 1800000.00,
    'b0000001-0000-0000-0000-000000000003',
    '[DEV-SEED] 제품매출 공급가액 — 동방물류(주)',
    '2026-04-25 14:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 부가세예수금(220) 180,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678903',
    3, '220', 0.00, 180000.00,
    'b0000001-0000-0000-0000-000000000003',
    '[DEV-SEED] 부가세예수금 10%',
    '2026-04-25 14:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-AGE-004 라인 — 현대오일뱅크(주) 미지급 =====
-- 차변: 현금(101) 2,750,000 / 대변: 외상매입금(201) 2,750,000 — partner_id=현대오일뱅크
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678911',
    1, '101', 2750000.00, 0.00,
    'b0000001-0000-0000-0000-000000000011',
    '[DEV-SEED] 현금 차변 — 현대오일뱅크(주) 유류비 미지급 대응',
    '2026-04-10 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 외상매입금(201) 2,750,000 — 미지급 잔액 계상
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678911',
    2, '201', 0.00, 2750000.00,
    'b0000001-0000-0000-0000-000000000011',
    '[DEV-SEED] 외상매입금 — 현대오일뱅크(주) (미지급 잔액)',
    '2026-04-10 09:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-AGE-005 라인 — SK렌터카(주) 미지급 =====
-- 차변: 현금(101) 1,320,000 / 대변: 외상매입금(201) 1,320,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678912',
    1, '101', 1320000.00, 0.00,
    'b0000001-0000-0000-0000-000000000012',
    '[DEV-SEED] 현금 차변 — SK렌터카(주) 차량임차비 미지급 대응',
    '2026-04-20 15:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 외상매입금(201) 1,320,000 — 미지급 잔액 계상
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount,
     partner_id, memo, created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c2d3e4f5-a6b7-8901-cdef-012345678912',
    2, '201', 0.00, 1320000.00,
    'b0000001-0000-0000-0000-000000000012',
    '[DEV-SEED] 외상매입금 — SK렌터카(주) (미지급 잔액)',
    '2026-04-20 15:00:00', 'SYSTEM_SEED', FALSE
);

----------------------------------------------------------------------
-- 검증 요약 (복식부기 균형 확인)
-- SEED-AGE-001: debit 2,200,000 = credit (2,000,000 + 200,000)   OK  RECEIVABLE 삼한물류
-- SEED-AGE-002: debit 3,520,000 = credit (3,200,000 + 320,000)   OK  RECEIVABLE 한국통운
-- SEED-AGE-003: debit 1,980,000 = credit (1,800,000 + 180,000)   OK  RECEIVABLE 동방물류
-- SEED-AGE-004: debit 2,750,000 = credit 2,750,000               OK  PAYABLE 현대오일뱅크
-- SEED-AGE-005: debit 1,320,000 = credit 1,320,000               OK  PAYABLE SK렌터카
--
-- 미수(110 차변) 합계:  2,200,000 + 3,520,000 + 1,980,000 = 7,700,000
-- 미지급(201 대변) 합계: 2,750,000 + 1,320,000            = 4,070,000
----------------------------------------------------------------------
