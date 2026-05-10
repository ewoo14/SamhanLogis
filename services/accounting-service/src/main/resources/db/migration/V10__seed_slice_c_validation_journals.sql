-- V10__seed_slice_c_validation_journals.sql
-- P0-1 Slice C — 현금흐름표 / 자본변동표 검증용 분개 seed (DEV 환경 한정).
--
-- 적용 원칙:
--   * journal_no 에 'SEED-CF-' / 'SEED-EQ-' prefix + description 에 [DEV-SEED] 명시.
--   * 모든 분개 sum(debit) = sum(credit) (복식부기 invariant 엄격 준수).
--   * 상태 = POSTED (posted_by = SYSTEM_SEED).
--   * UUID = 결정적 하드코딩 — re-run 안전.
--   * ON CONFLICT DO NOTHING 전략.
--   * 일계표 / 월계표는 기존 V6 분개 7건 (2026-01~03) 활용 — 추가 seed 불필요.
--
-- 계정과목 참조 (V1 기준):
--   101  현금             ASSET
--   102  보통예금         ASSET
--   110  외상매출금       ASSET
--   161  차량운반구       ASSET
--   201  외상매입금       LIABILITY
--   210  미지급금         LIABILITY
--   260  장기차입금       LIABILITY
--   301  자본금           EQUITY
--   343  미처분이익잉여금 EQUITY
--   401  상품매출         REVENUE
--   501  상품매출원가     COST_OF_SALES
--   819  임차료           SGA
--
-- 분개 7건 목록:
--   현금흐름 검증 (CFO / CFI / CFF 각 활동 포함) — 5건
--   SEED-CF-001  CFO — 외상매출금 현금 회수         2026-05-05
--   SEED-CF-002  CFO — 임차료 현금 지급             2026-05-10
--   SEED-CF-003  CFO — 상품 매입 외상 결제          2026-05-15
--   SEED-CF-004  CFI — 차량운반구 취득 (현금 지급)  2026-05-20
--   SEED-CF-005  CFF — 장기차입금 차입 (현금 유입)  2026-05-25
--
--   자본변동 검증 — 2건
--   SEED-EQ-001  유상증자 (자본금 납입)             2026-05-02
--   SEED-EQ-002  배당금 지급 (이익잉여금 감소)      2026-05-30
--
-- UUID 목록 (결정적):
--   SEED-CF-001 = d1c2b3a4-e5f6-7890-abcd-ef0123456701
--   SEED-CF-002 = d1c2b3a4-e5f6-7890-abcd-ef0123456702
--   SEED-CF-003 = d1c2b3a4-e5f6-7890-abcd-ef0123456703
--   SEED-CF-004 = d1c2b3a4-e5f6-7890-abcd-ef0123456704
--   SEED-CF-005 = d1c2b3a4-e5f6-7890-abcd-ef0123456705
--   SEED-EQ-001 = d1c2b3a4-e5f6-7890-abcd-ef0123456711
--   SEED-EQ-002 = d1c2b3a4-e5f6-7890-abcd-ef0123456712

----------------------------------------------------------------------
-- 1) journal_number_sequences — 채번 시퀀스 선점
----------------------------------------------------------------------
INSERT INTO journal_number_sequences
    (id, journal_date, last_seq, version, created_at, created_by, is_deleted)
VALUES
-- 2026-05-02: SEED-EQ-001
(gen_random_uuid(), '2026-05-02', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-05: SEED-CF-001
(gen_random_uuid(), '2026-05-05', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-10: SEED-CF-002
(gen_random_uuid(), '2026-05-10', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-15: SEED-CF-003
(gen_random_uuid(), '2026-05-15', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-20: SEED-CF-004
(gen_random_uuid(), '2026-05-20', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-25: SEED-CF-005
(gen_random_uuid(), '2026-05-25', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-05-30: SEED-EQ-002
(gen_random_uuid(), '2026-05-30', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE)
ON CONFLICT (journal_date) DO NOTHING;

----------------------------------------------------------------------
-- 2) journals — 분개 헤더 7건
----------------------------------------------------------------------

-- SEED-CF-001: CFO — 외상매출금 현금 회수 (2026-05-05)
-- 차변: 현금(101) 1,500,000 / 대변: 외상매출금(110) 1,500,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456701',
    'SEED-CF-001', '2026-05-05',
    '[DEV-SEED] CFO — 외상매출금 현금 회수 (현금흐름표 영업활동 유입 검증)',
    'MANUAL', 'POSTED', '2026-05-05 10:00:00', 'SYSTEM_SEED',
    0, '2026-05-05 10:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-CF-002: CFO — 임차료 현금 지급 (2026-05-10)
-- 차변: 임차료(819) 300,000 / 대변: 현금(101) 300,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456702',
    'SEED-CF-002', '2026-05-10',
    '[DEV-SEED] CFO — 임차료 현금 지급 (현금흐름표 영업활동 유출 검증)',
    'MANUAL', 'POSTED', '2026-05-10 11:00:00', 'SYSTEM_SEED',
    0, '2026-05-10 11:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-CF-003: CFO — 외상매입금 현금 결제 (2026-05-15)
-- 차변: 외상매입금(201) 800,000 / 대변: 현금(101) 800,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456703',
    'SEED-CF-003', '2026-05-15',
    '[DEV-SEED] CFO — 외상매입금 현금 결제 (현금흐름표 영업활동 유출 검증)',
    'MANUAL', 'POSTED', '2026-05-15 14:00:00', 'SYSTEM_SEED',
    0, '2026-05-15 14:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-CF-004: CFI — 차량운반구 취득 현금 지급 (2026-05-20)
-- 차변: 차량운반구(161) 5,000,000 / 대변: 현금(101) 5,000,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456704',
    'SEED-CF-004', '2026-05-20',
    '[DEV-SEED] CFI — 차량운반구 취득 현금 지급 (현금흐름표 투자활동 유출 검증)',
    'MANUAL', 'POSTED', '2026-05-20 09:00:00', 'SYSTEM_SEED',
    0, '2026-05-20 09:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-CF-005: CFF — 장기차입금 차입 현금 유입 (2026-05-25)
-- 차변: 현금(101) 10,000,000 / 대변: 장기차입금(260) 10,000,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456705',
    'SEED-CF-005', '2026-05-25',
    '[DEV-SEED] CFF — 장기차입금 차입 현금 유입 (현금흐름표 재무활동 유입 검증)',
    'MANUAL', 'POSTED', '2026-05-25 10:00:00', 'SYSTEM_SEED',
    0, '2026-05-25 10:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-EQ-001: 유상증자 자본금 납입 (2026-05-02)
-- 차변: 보통예금(102) 20,000,000 / 대변: 자본금(301) 20,000,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456711',
    'SEED-EQ-001', '2026-05-02',
    '[DEV-SEED] 유상증자 자본금 납입 (자본변동표 CAPITAL_INCREASE 검증)',
    'MANUAL', 'POSTED', '2026-05-02 09:00:00', 'SYSTEM_SEED',
    0, '2026-05-02 09:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

-- SEED-EQ-002: 배당금 지급 (2026-05-30)
-- 차변: 미처분이익잉여금(343) 3,000,000 / 대변: 보통예금(102) 3,000,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES (
    'd1c2b3a4-e5f6-7890-abcd-ef0123456712',
    'SEED-EQ-002', '2026-05-30',
    '[DEV-SEED] 배당금 지급 (자본변동표 DIVIDEND 검증)',
    'MANUAL', 'POSTED', '2026-05-30 17:00:00', 'SYSTEM_SEED',
    0, '2026-05-30 17:00:00', 'SYSTEM_SEED', FALSE
) ON CONFLICT (id) DO NOTHING;

----------------------------------------------------------------------
-- 3) journal_lines — 분개 라인 (복식부기 균형 엄격 준수)
----------------------------------------------------------------------

-- ===== SEED-CF-001 라인 (외상매출금 현금 회수) =====
-- 차변: 현금(101) 1,500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456701',
    1, '101', 1500000.00, 0.00,
    '외상매출금 현금 회수',
    '2026-05-05 10:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 외상매출금(110) 1,500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456701',
    2, '110', 0.00, 1500000.00,
    '외상매출금 감소 (현금 회수)',
    '2026-05-05 10:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-CF-002 라인 (임차료 현금 지급) =====
-- 차변: 임차료(819) 300,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456702',
    1, '819', 300000.00, 0.00,
    '5월 임차료 (현금 지급)',
    '2026-05-10 11:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 현금(101) 300,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456702',
    2, '101', 0.00, 300000.00,
    '임차료 현금 지급',
    '2026-05-10 11:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-CF-003 라인 (외상매입금 현금 결제) =====
-- 차변: 외상매입금(201) 800,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456703',
    1, '201', 800000.00, 0.00,
    '외상매입금 현금 결제',
    '2026-05-15 14:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 현금(101) 800,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456703',
    2, '101', 0.00, 800000.00,
    '외상매입금 결제 (현금 출금)',
    '2026-05-15 14:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-CF-004 라인 (차량운반구 취득) =====
-- 차변: 차량운반구(161) 5,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456704',
    1, '161', 5000000.00, 0.00,
    '차량운반구 취득 (CFI 유출)',
    '2026-05-20 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 현금(101) 5,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456704',
    2, '101', 0.00, 5000000.00,
    '차량운반구 대금 현금 지급',
    '2026-05-20 09:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-CF-005 라인 (장기차입금 차입) =====
-- 차변: 현금(101) 10,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456705',
    1, '101', 10000000.00, 0.00,
    '장기차입금 현금 유입 (CFF)',
    '2026-05-25 10:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 장기차입금(260) 10,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456705',
    2, '260', 0.00, 10000000.00,
    '장기차입금 부채 계상',
    '2026-05-25 10:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-EQ-001 라인 (유상증자 자본금 납입) =====
-- 차변: 보통예금(102) 20,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456711',
    1, '102', 20000000.00, 0.00,
    '유상증자 납입금 입금 (보통예금)',
    '2026-05-02 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 자본금(301) 20,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456711',
    2, '301', 0.00, 20000000.00,
    '유상증자 자본금 계상 (CAPITAL_INCREASE)',
    '2026-05-02 09:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-EQ-002 라인 (배당금 지급) =====
-- 차변: 미처분이익잉여금(343) 3,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456712',
    1, '343', 3000000.00, 0.00,
    '배당금 — 이익잉여금 감소 (DIVIDEND)',
    '2026-05-30 17:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 보통예금(102) 3,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'd1c2b3a4-e5f6-7890-abcd-ef0123456712',
    2, '102', 0.00, 3000000.00,
    '배당금 보통예금 출금',
    '2026-05-30 17:00:00', 'SYSTEM_SEED', FALSE
);

----------------------------------------------------------------------
-- 검증 요약 (복식부기 균형 확인)
-- SEED-CF-001: debit 1,500,000 = credit 1,500,000                       OK (CFO 유입)
-- SEED-CF-002: debit   300,000 = credit   300,000                       OK (CFO 유출)
-- SEED-CF-003: debit   800,000 = credit   800,000                       OK (CFO 유출)
-- SEED-CF-004: debit 5,000,000 = credit 5,000,000                       OK (CFI 유출)
-- SEED-CF-005: debit 10,000,000 = credit 10,000,000                     OK (CFF 유입)
-- SEED-EQ-001: debit 20,000,000 = credit 20,000,000                     OK (증자)
-- SEED-EQ-002: debit 3,000,000 = credit 3,000,000                       OK (배당)
----------------------------------------------------------------------
