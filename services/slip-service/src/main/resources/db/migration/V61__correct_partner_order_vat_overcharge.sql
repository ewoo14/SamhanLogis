-- V61__correct_partner_order_vat_overcharge.sql
-- 과거 PARTNER_ORDER 전표의 VAT 중복 가산 19행 정정.
--
-- 안전성 계약:
--   * 조사로 확정된 전표번호·품목·모델·수량·기존 금액을 모두 일치시킨다.
--   * 매칭 행 수가 0이면 정정할 과거 데이터가 없는 환경의 no-op으로 통과한다.
--     0이 아닌 수가 정확히 19가 아니면 예외를 발생시켜 전체 트랜잭션을 롤백한다.
--   * 원천 주문이 소실된 2026/05/30-1~3과 정상 7행은 대상 집합에 넣지 않는다.
--   * 변경 전후 금액과 정정 사유를 별도 감사 이력에 남긴다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE slip_line_correction_audits (
    id              UUID         PRIMARY KEY,
    slip_id         UUID         NOT NULL,
    slip_line_id    UUID         NOT NULL,
    slip_no         VARCHAR(40)  NOT NULL,
    correction_type VARCHAR(40)  NOT NULL,
    before_values   JSONB        NOT NULL,
    after_values    JSONB        NOT NULL,
    reason          TEXT         NOT NULL,

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE slip_line_correction_audits IS
    '과거 전표 금액 정정 이력 — 변경 전후 금액과 정정 사유를 보존한다';
COMMENT ON COLUMN slip_line_correction_audits.before_values IS
    '정정 직전 slip_lines 금액 필드 JSON';
COMMENT ON COLUMN slip_line_correction_audits.after_values IS
    '정정 직후 slip_lines 금액 필드 JSON';
COMMENT ON COLUMN slip_line_correction_audits.reason IS
    '정정 사유 및 판정 근거';

CREATE INDEX ix_slip_line_correction_audits_slip
    ON slip_line_correction_audits (slip_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE TEMP TABLE vat_correction_targets (
    target_no       INTEGER PRIMARY KEY,
    slip_no         VARCHAR(40) NOT NULL,
    product_name    VARCHAR(200) NOT NULL,
    model_name      VARCHAR(100) NOT NULL,
    quantity        INTEGER NOT NULL,
    old_unit_price  NUMERIC(15,2) NOT NULL,
    old_unit_vat    NUMERIC(15,2) NOT NULL,
    old_supply      NUMERIC(17,2) NOT NULL,
    old_vat         NUMERIC(15,2) NOT NULL,
    old_line_total  NUMERIC(17,2) NOT NULL,
    new_unit_price  NUMERIC(15,2) NOT NULL,
    new_unit_vat    NUMERIC(15,2) NOT NULL,
    new_supply      NUMERIC(17,2) NOT NULL,
    new_vat         NUMERIC(15,2) NOT NULL,
    new_line_total  NUMERIC(17,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO vat_correction_targets (
    target_no, slip_no, product_name, model_name, quantity,
    old_unit_price, old_unit_vat, old_supply, old_vat, old_line_total,
    new_unit_price, new_unit_vat, new_supply, new_vat, new_line_total
) VALUES
    ( 1, '2026/05/31-1',  '삼성 DVM-S 10HP',       'AM100BNNDEH-57', 2, 3000000, 3300000,  6000000,  600000,  6600000, 2727272.50, 3000000, 5454545,  545455,  6000000),
    ( 2, '2026/05/31-10', '삼성 윈드프리 9평형',   'AR09TXEAAWKNEU-04', 1, 1080000, 1188000, 1080000,  108000,  1188000,  981818, 1080000,  981818,   98182,  1080000),
    ( 3, '2026/05/31-10', '삼성 윈드프리 7평형',   'AR07TXEAAWKNEU-03', 2,  840000,  924000, 1680000,  168000,  1848000,  763636.50, 840000, 1527273,  152727,  1680000),
    ( 4, '2026/05/31-2',  '삼성 윈드프리 5평형',   'AR05TXEAAWKNEU-01', 1,  750000,  825000,  750000,   75000,   825000,  681818,  750000,  681818,   68182,   750000),
    ( 5, '2026/05/31-3',  '삼성 윈드프리 5평형',   'AR05TXEAAWKNEU-01', 1,  750000,  825000,  750000,   75000,   825000,  681818,  750000,  681818,   68182,   750000),
    ( 6, '2026/05/31-4',  '삼성 비스포크 스탠드 20평형 (단종)', 'AF20BX1NWAEAH-50', 1, 2100000, 2310000, 2100000, 210000, 2310000, 1909091, 2100000, 1909091, 190909, 2100000),
    ( 7, '2026/05/31-4',  '삼성 DVM-S 3HP',         'AM030BNNDEH-51', 2,  900000,  990000, 1800000, 180000, 1980000,  818182,  900000, 1636364, 163636, 1800000),
    ( 8, '2026/05/31-5',  '',                       'AC100CNCDEH-76', 2, 2400000, 2640000, 4800000, 480000, 5280000, 2181818, 2400000, 4363636, 436364, 4800000),
    ( 9, '2026/05/31-6',  '삼성 윈드프리 11평형',  'AR11TXEAAWKNEU-05', 4, 1320000, 1452000, 5280000, 528000, 5808000, 1200000, 1320000, 4800000, 480000, 5280000),
    (10, '2026/05/31-6',  '',                       'AC100CNCDEH-76', 5, 2400000, 2640000,12000000,1200000,13200000, 2181818, 2400000,10909091,1090909,12000000),
    (11, '2026/05/31-6',  '삼성 비스포크 스탠드 20평형 (단종)', 'AF20BX1NWAEAH-50', 1, 2100000, 2310000, 2100000, 210000, 2310000, 1909091, 2100000, 1909091, 190909, 2100000),
    (12, '2026/05/31-7',  '',                       'AC100CNCDEH-76', 1, 2400000, 2640000, 2400000, 240000, 2640000, 2181818, 2400000, 2181818, 218182, 2400000),
    (13, '2026/05/31-8',  '삼성 윈드프리 11평형',  'AR11TXEAAWKNEU-05', 2, 1320000, 1452000, 2640000, 264000, 2904000, 1200000, 1320000, 2400000, 240000, 2640000),
    (14, '2026/05/31-8',  '삼성 윈드프리 5평형',   'AR05TXEAAWKNEU-01', 1,  750000,  825000,  750000,  75000,  825000,  681818,  750000,  681818,  68182,  750000),
    (15, '2026/05/31-8',  '삼성 DVM-S 3HP',         'AM030BNNDEH-51', 1, 1080000, 1188000, 1080000, 108000, 1188000,  981818, 1080000,  981818,  98182, 1080000),
    (16, '2026/05/31-9',  '삼성 윈드프리 6평형',   'AR06TXEAAWKNEU-02', 1,  720000,  792000,  720000,  72000,  792000,  654545,  720000,  654545,  65455,  720000),
    (17, '2026/05/31-9',  '삼성 윈드프리 11평형',  'AR11TXEAAWKNEU-05', 2, 1320000, 1452000, 2640000, 264000, 2904000, 1200000, 1320000, 2400000, 240000, 2640000),
    (18, '2026/07/05-1',  '삼성 윈드프리 13평형',  'AR13TXEAAWKNEU-06', 1, 1560000, 1716000, 1560000, 156000, 1716000, 1418182, 1560000, 1418182, 141818, 1560000),
    (19, '2026/07/05-2',  '삼성 윈드프리 13평형',  'AR13TXEAAWKNEU-06', 1, 1560000, 1716000, 1560000, 156000, 1716000, 1418182, 1560000, 1418182, 141818, 1560000);

DO $$
DECLARE
    target_count INTEGER;
BEGIN
    SELECT COUNT(*)
      INTO target_count
      FROM slips s
      JOIN slip_lines sl ON sl.slip_id = s.id
      JOIN vat_correction_targets t
        ON t.slip_no = s.slip_no
       AND t.model_name = sl.model_name
       AND t.quantity = sl.quantity
       AND t.old_unit_price = sl.unit_price
       AND t.old_unit_vat = sl.unit_price_with_vat
       AND t.old_supply = sl.supply_amount
       AND t.old_vat = sl.vat_amount
       AND t.old_line_total = sl.line_total
     WHERE s.source_type = 'PARTNER_ORDER'
       AND NOT s.is_deleted
       AND NOT sl.is_deleted;

    IF target_count NOT IN (0, 19) THEN
        RAISE EXCEPTION 'VAT correction target count must be 19, got %', target_count;
    END IF;
END $$;

INSERT INTO slip_line_correction_audits (
    id, slip_id, slip_line_id, slip_no, correction_type,
    before_values, after_values, reason,
    created_at, created_by, modified_at, modified_by, is_deleted
)
SELECT
    gen_random_uuid(), s.id, sl.id, s.slip_no, 'VAT_OVERCHARGE_CORRECTION',
    jsonb_build_object(
        'unit_price', sl.unit_price,
        'unit_price_with_vat', sl.unit_price_with_vat,
        'supply_amount', sl.supply_amount,
        'vat_amount', sl.vat_amount,
        'line_total', sl.line_total
    ),
    jsonb_build_object(
        'unit_price', t.new_unit_price,
        'unit_price_with_vat', t.new_unit_vat,
        'supply_amount', t.new_supply,
        'vat_amount', t.new_vat,
        'line_total', t.new_line_total
    ),
    '원천 partner order의 VAT 포함 단가와 대조해 중복 부가세 가산을 정정한다. 조사 확정 대상 19행이며 확인불가 행과 정상 행은 제외했다.',
    NOW(), 'v61-vat-correction', NOW(), 'v61-vat-correction', FALSE
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id
JOIN vat_correction_targets t
  ON t.slip_no = s.slip_no
 AND t.model_name = sl.model_name
 AND t.quantity = sl.quantity
 AND t.old_unit_price = sl.unit_price
 AND t.old_unit_vat = sl.unit_price_with_vat
 AND t.old_supply = sl.supply_amount
 AND t.old_vat = sl.vat_amount
 AND t.old_line_total = sl.line_total
WHERE s.source_type = 'PARTNER_ORDER'
  AND NOT s.is_deleted
  AND NOT sl.is_deleted;

UPDATE slip_lines sl
SET unit_price = t.new_unit_price,
    unit_price_with_vat = t.new_unit_vat,
    supply_amount = t.new_supply,
    vat_amount = t.new_vat,
    line_total = t.new_line_total,
    modified_at = NOW(),
    modified_by = 'v61-vat-correction'
FROM slips s
JOIN vat_correction_targets t
  ON t.slip_no = s.slip_no
WHERE sl.slip_id = s.id
  AND s.source_type = 'PARTNER_ORDER'
  AND NOT s.is_deleted
  AND NOT sl.is_deleted
  AND t.model_name = sl.model_name
  AND t.quantity = sl.quantity
  AND t.old_unit_price = sl.unit_price
  AND t.old_unit_vat = sl.unit_price_with_vat
  AND t.old_supply = sl.supply_amount
  AND t.old_vat = sl.vat_amount
  AND t.old_line_total = sl.line_total;
