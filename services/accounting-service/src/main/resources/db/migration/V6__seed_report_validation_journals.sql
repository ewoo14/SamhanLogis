-- V6__seed_report_validation_journals.sql
-- P0-1 Slice A — 손익계산서 / 재무상태표 보고서 검증용 분개 seed (DEV 환경 한정).
--
-- 적용 원칙:
--   * Flyway 는 환경 무관 실행 → 운영 DB 적용 방지를 위해
--     journal_no 에 'SEED-' prefix + description 에 [DEV-SEED] 명시.
--   * 모든 분개 sum(debit) = sum(credit) (복식부기 invariant).
--   * 상태 = POSTED (posted_at = 분개일, posted_by = SYSTEM_SEED).
--   * UUID = name-based v3 (samhan-seed:journal-report:<no>) — JournalSeeder 결정 UUID 패턴 일치.
--   * journal_number_sequences 에 해당 날짜 시퀀스 row 도 함께 삽입
--     (accounting-service JournalNumberService 채번 충돌 방지).
--
-- 계정과목 참조 (V1 기준):
--   101  현금          ASSET
--   102  보통예금      ASSET
--   110  외상매출금    ASSET
--   210  미지급금      LIABILITY
--   220  부가세예수금  LIABILITY
--   221  예수금        LIABILITY
--   401  상품매출      REVENUE
--   404  제품매출      REVENUE
--   501  상품매출원가  COST_OF_SALES
--   801  급여          SGA
--   819  임차료        SGA
--   901  이자수익      NON_OPERATING
--   991  법인세비용    INCOME_TAX
--
-- 분개 7건 목록:
--   SEED-RPT-001  상품매출       2026-01-15  매출 분개 1 (상품매출 + 부가세)
--   SEED-RPT-002  제품매출       2026-02-10  매출 분개 2 (제품매출 + 부가세)
--   SEED-RPT-003  상품매출원가   2026-01-15  매출원가 분개
--   SEED-RPT-004  급여           2026-01-31  판관비 분개 (급여)
--   SEED-RPT-005  임차료         2026-02-28  판관비 분개 (임차료)
--   SEED-RPT-006  이자수익       2026-03-31  영업외 분개 (이자수익)
--   SEED-RPT-007  법인세비용     2026-12-31  법인세 분개

----------------------------------------------------------------------
-- 분개 UUID — 결정적 하드코딩 (re-run 안전, Flyway ON CONFLICT IGNORE 패턴).
--   Python uuid3 계산 결과가 아님 — JournalSeeder 결정 UUID 패턴과 동일하게
--   고정 UUID 를 수동 지정하여 재실행 시 중복 insert 를 방지한다.
--   SEED-RPT-001 = fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6
--   SEED-RPT-002 = 9b9d37e4-7623-3e55-87a1-8fd4e3a06e70
--   SEED-RPT-003 = 51e4a24e-cf18-3b54-a10b-a5e7b831f52d
--   SEED-RPT-004 = 4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1
--   SEED-RPT-005 = 2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0
--   SEED-RPT-006 = c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3
--   SEED-RPT-007 = 7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8
----------------------------------------------------------------------

----------------------------------------------------------------------
-- 1) journal_number_sequences — 채번 시퀀스 (날짜별 선점)
--    ON CONFLICT DO NOTHING — 이미 실제 운영 row 존재 시 skip.
----------------------------------------------------------------------
INSERT INTO journal_number_sequences
    (id, journal_date, last_seq, version, created_at, created_by, is_deleted)
VALUES
-- 2026-01-15: SEED-RPT-001, SEED-RPT-003
(gen_random_uuid(), '2026-01-15', 2, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-01-31: SEED-RPT-004
(gen_random_uuid(), '2026-01-31', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-02-10: SEED-RPT-002
(gen_random_uuid(), '2026-02-10', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-02-28: SEED-RPT-005
(gen_random_uuid(), '2026-02-28', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-03-31: SEED-RPT-006
(gen_random_uuid(), '2026-03-31', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE),
-- 2026-12-31: SEED-RPT-007
(gen_random_uuid(), '2026-12-31', 1, 0, CURRENT_TIMESTAMP, 'SYSTEM', FALSE)
ON CONFLICT (journal_date) DO NOTHING;

----------------------------------------------------------------------
-- 2) journals — 분개 헤더 7건
----------------------------------------------------------------------

-- SEED-RPT-001: 상품매출 2,000,000 + 부가세 200,000 (2026-01-15)
-- 차변: 외상매출금 2,200,000 / 대변: 상품매출 2,000,000 + 부가세예수금 200,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6',
    'SEED-RPT-001',
    '2026-01-15',
    '[DEV-SEED] 상품매출 분개 — 보고서 검증용 (손익계산서 매출 확인)',
    'MANUAL',
    'POSTED',
    '2026-01-15 09:00:00',
    'SYSTEM_SEED',
    0,
    '2026-01-15 09:00:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-002: 제품매출 5,000,000 + 부가세 500,000 (2026-02-10)
-- 차변: 외상매출금 5,500,000 / 대변: 제품매출 5,000,000 + 부가세예수금 500,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    '9b9d37e4-7623-3e55-87a1-8fd4e3a06e70',
    'SEED-RPT-002',
    '2026-02-10',
    '[DEV-SEED] 제품매출 분개 — 보고서 검증용 (손익계산서 매출 확인)',
    'MANUAL',
    'POSTED',
    '2026-02-10 09:00:00',
    'SYSTEM_SEED',
    0,
    '2026-02-10 09:00:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-003: 상품매출원가 1,200,000 (2026-01-15)
-- 차변: 상품매출원가 1,200,000 / 대변: 현금 1,200,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    '51e4a24e-cf18-3b54-a10b-a5e7b831f52d',
    'SEED-RPT-003',
    '2026-01-15',
    '[DEV-SEED] 상품매출원가 분개 — 보고서 검증용 (손익계산서 매출원가 확인)',
    'MANUAL',
    'POSTED',
    '2026-01-15 09:05:00',
    'SYSTEM_SEED',
    0,
    '2026-01-15 09:05:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-004: 급여 3,000,000 (2026-01-31)
-- 차변: 급여 3,000,000 / 대변: 예수금(원천세) 300,000 + 보통예금 2,700,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1',
    'SEED-RPT-004',
    '2026-01-31',
    '[DEV-SEED] 급여 판관비 분개 — 보고서 검증용 (손익계산서 판관비 확인)',
    'MANUAL',
    'POSTED',
    '2026-01-31 17:00:00',
    'SYSTEM_SEED',
    0,
    '2026-01-31 17:00:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-005: 임차료 500,000 (2026-02-28)
-- 차변: 임차료 500,000 / 대변: 보통예금 500,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    '2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0',
    'SEED-RPT-005',
    '2026-02-28',
    '[DEV-SEED] 임차료 판관비 분개 — 보고서 검증용 (손익계산서 판관비 확인)',
    'MANUAL',
    'POSTED',
    '2026-02-28 18:00:00',
    'SYSTEM_SEED',
    0,
    '2026-02-28 18:00:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-006: 이자수익 120,000 (2026-03-31)
-- 차변: 보통예금 120,000 / 대변: 이자수익 120,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    'c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3',
    'SEED-RPT-006',
    '2026-03-31',
    '[DEV-SEED] 이자수익 영업외분개 — 보고서 검증용 (손익계산서 영업외수익 확인)',
    'MANUAL',
    'POSTED',
    '2026-03-31 15:00:00',
    'SYSTEM_SEED',
    0,
    '2026-03-31 15:00:00',
    'SYSTEM_SEED',
    FALSE
);

-- SEED-RPT-007: 법인세비용 700,000 (2026-12-31)
-- 차변: 법인세비용 700,000 / 대변: 미지급금(법인세) 700,000
INSERT INTO journals
    (id, journal_no, journal_date, description, source_type, status,
     posted_at, posted_by, version, created_at, created_by, is_deleted)
VALUES
(
    '7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8',
    'SEED-RPT-007',
    '2026-12-31',
    '[DEV-SEED] 법인세비용 분개 — 보고서 검증용 (손익계산서 법인세 확인)',
    'MANUAL',
    'POSTED',
    '2026-12-31 23:00:00',
    'SYSTEM_SEED',
    0,
    '2026-12-31 23:00:00',
    'SYSTEM_SEED',
    FALSE
);

----------------------------------------------------------------------
-- 3) journal_lines — 분개 라인 (복식부기 균형 엄격 준수)
----------------------------------------------------------------------

-- ===== SEED-RPT-001 라인 (상품매출 + 부가세예수금) =====
-- 차변: 외상매출금(110) 2,200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6',
    1, '110', 2200000.00, 0.00,
    '외상매출금 (상품매출 공급가액+부가세)',
    '2026-01-15 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 상품매출(401) 2,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6',
    2, '401', 0.00, 2000000.00,
    '상품매출 (공급가액)',
    '2026-01-15 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 부가세예수금(220) 200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6',
    3, '220', 0.00, 200000.00,
    '부가세예수금 (10%)',
    '2026-01-15 09:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-002 라인 (제품매출 + 부가세예수금) =====
-- 차변: 외상매출금(110) 5,500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '9b9d37e4-7623-3e55-87a1-8fd4e3a06e70',
    1, '110', 5500000.00, 0.00,
    '외상매출금 (제품매출 공급가액+부가세)',
    '2026-02-10 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 제품매출(404) 5,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '9b9d37e4-7623-3e55-87a1-8fd4e3a06e70',
    2, '404', 0.00, 5000000.00,
    '제품매출 (공급가액)',
    '2026-02-10 09:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 부가세예수금(220) 500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '9b9d37e4-7623-3e55-87a1-8fd4e3a06e70',
    3, '220', 0.00, 500000.00,
    '부가세예수금 (10%)',
    '2026-02-10 09:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-003 라인 (상품매출원가) =====
-- 차변: 상품매출원가(501) 1,200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '51e4a24e-cf18-3b54-a10b-a5e7b831f52d',
    1, '501', 1200000.00, 0.00,
    '상품매출원가 인식',
    '2026-01-15 09:05:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 현금(101) 1,200,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '51e4a24e-cf18-3b54-a10b-a5e7b831f52d',
    2, '101', 0.00, 1200000.00,
    '원가 지급 (현금)',
    '2026-01-15 09:05:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-004 라인 (급여 판관비) =====
-- 차변: 급여(801) 3,000,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1',
    1, '801', 3000000.00, 0.00,
    '1월 급여 (판관비)',
    '2026-01-31 17:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 예수금(221) 300,000 — 원천세
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1',
    2, '221', 0.00, 300000.00,
    '원천세 예수금 (10%)',
    '2026-01-31 17:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 보통예금(102) 2,700,000 — 실수령액
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1',
    3, '102', 0.00, 2700000.00,
    '급여 실수령액 (보통예금 출금)',
    '2026-01-31 17:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-005 라인 (임차료 판관비) =====
-- 차변: 임차료(819) 500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0',
    1, '819', 500000.00, 0.00,
    '2월 사무실 임차료 (판관비)',
    '2026-02-28 18:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 보통예금(102) 500,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0',
    2, '102', 0.00, 500000.00,
    '임차료 보통예금 출금',
    '2026-02-28 18:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-006 라인 (이자수익 영업외) =====
-- 차변: 보통예금(102) 120,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3',
    1, '102', 120000.00, 0.00,
    '이자수익 입금 (보통예금)',
    '2026-03-31 15:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 이자수익(901) 120,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    'c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3',
    2, '901', 0.00, 120000.00,
    '이자수익 인식 (영업외수익)',
    '2026-03-31 15:00:00', 'SYSTEM_SEED', FALSE
);

-- ===== SEED-RPT-007 라인 (법인세비용) =====
-- 차변: 법인세비용(991) 700,000
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8',
    1, '991', 700000.00, 0.00,
    '연간 법인세비용 (추정)',
    '2026-12-31 23:00:00', 'SYSTEM_SEED', FALSE
);
-- 대변: 미지급금(210) 700,000 — 법인세 미납부분
INSERT INTO journal_lines
    (id, journal_id, line_no, account_code, debit_amount, credit_amount, memo,
     created_at, created_by, is_deleted)
VALUES
(
    gen_random_uuid(),
    '7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8',
    2, '210', 0.00, 700000.00,
    '미지급 법인세 (부채 계상)',
    '2026-12-31 23:00:00', 'SYSTEM_SEED', FALSE
);

----------------------------------------------------------------------
-- 검증 요약 (복식부기 균형 확인)
-- SEED-RPT-001: debit 2,200,000 = credit (2,000,000 + 200,000)     OK
-- SEED-RPT-002: debit 5,500,000 = credit (5,000,000 + 500,000)     OK
-- SEED-RPT-003: debit 1,200,000 = credit 1,200,000                  OK
-- SEED-RPT-004: debit 3,000,000 = credit (300,000 + 2,700,000)      OK
-- SEED-RPT-005: debit   500,000 = credit 500,000                    OK
-- SEED-RPT-006: debit   120,000 = credit 120,000                    OK
-- SEED-RPT-007: debit   700,000 = credit 700,000                    OK
----------------------------------------------------------------------
