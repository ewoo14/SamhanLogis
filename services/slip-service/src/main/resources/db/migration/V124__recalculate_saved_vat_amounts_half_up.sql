-- P1-03: 저장된 전표·견적 라인의 공급가액/VAT를 HALF_UP 계약으로 재계산한다.
--
-- 대상은 현재 저장된 supply_amount가
-- ROUND(unit_price_with_vat * quantity / 1.1)와 다른 활성 라인뿐이다.
-- line_total은 공급가액의 호환 별칭이므로 supply_amount와 함께 맞춘다.
-- 회계 일마감으로 잠긴 전표(slips.lock_flag = TRUE)는 외부 회계/세금계산서와의
-- 불일치를 만들 수 있어 제외한다. 견적은 이 서비스 DB 안의 동일한 계산 계약으로 보정한다.

CREATE TEMP TABLE vat_half_up_recalculation_targets (
    target_kind VARCHAR(20) NOT NULL,
    line_id UUID NOT NULL,
    old_supply NUMERIC NOT NULL,
    old_vat NUMERIC NOT NULL,
    old_line_total NUMERIC NOT NULL,
    new_supply NUMERIC NOT NULL,
    new_vat NUMERIC NOT NULL,
    PRIMARY KEY (target_kind, line_id)
) ON COMMIT DROP;

INSERT INTO vat_half_up_recalculation_targets
    (target_kind, line_id, old_supply, old_vat, old_line_total, new_supply, new_vat)
SELECT
    'SLIP', sl.id, sl.supply_amount, sl.vat_amount, sl.line_total,
    ROUND(sl.unit_price_with_vat * sl.quantity / 1.1, 0),
    sl.unit_price_with_vat * sl.quantity - ROUND(sl.unit_price_with_vat * sl.quantity / 1.1, 0)
FROM slip_lines sl
JOIN slips s ON s.id = sl.slip_id
WHERE sl.is_deleted = FALSE
  AND s.is_deleted = FALSE
  AND s.lock_flag = FALSE
  AND sl.unit_price_with_vat IS NOT NULL
  AND sl.supply_amount <> ROUND(sl.unit_price_with_vat * sl.quantity / 1.1, 0);

INSERT INTO vat_half_up_recalculation_targets
    (target_kind, line_id, old_supply, old_vat, old_line_total, new_supply, new_vat)
SELECT
    'ESTIMATE', el.id, el.supply_amount, el.vat_amount, el.line_total,
    ROUND(el.unit_price_with_vat * el.quantity / 1.1, 0),
    el.unit_price_with_vat * el.quantity - ROUND(el.unit_price_with_vat * el.quantity / 1.1, 0)
FROM estimate_lines el
JOIN estimates e ON e.id = el.estimate_id
WHERE el.is_deleted = FALSE
  AND e.is_deleted = FALSE
  AND el.unit_price_with_vat IS NOT NULL
  AND el.supply_amount <> ROUND(el.unit_price_with_vat * el.quantity / 1.1, 0);

CREATE TEMP TABLE v124_non_target_before ON COMMIT DROP AS
SELECT 'SLIP'::VARCHAR(20) AS target_kind, sl.id AS line_id,
       sl.supply_amount, sl.vat_amount, sl.line_total
FROM slip_lines sl
JOIN slips s ON s.id = sl.slip_id
WHERE sl.is_deleted = FALSE
  AND s.is_deleted = FALSE
  AND s.lock_flag = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM vat_half_up_recalculation_targets t
      WHERE t.target_kind = 'SLIP' AND t.line_id = sl.id
  )
UNION ALL
SELECT 'ESTIMATE'::VARCHAR(20), el.id,
       el.supply_amount, el.vat_amount, el.line_total
FROM estimate_lines el
JOIN estimates e ON e.id = el.estimate_id
WHERE el.is_deleted = FALSE
  AND e.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM vat_half_up_recalculation_targets t
      WHERE t.target_kind = 'ESTIMATE' AND t.line_id = el.id
  );

DO $$
DECLARE
    v124_expected_rows INTEGER;
    v124_changed_rows INTEGER := 0;
    v124_updated_rows INTEGER;
    v124_non_target_changed INTEGER;
BEGIN
    SELECT COUNT(*) INTO v124_expected_rows
    FROM vat_half_up_recalculation_targets;

    UPDATE slip_lines sl
    SET supply_amount = t.new_supply,
        vat_amount = t.new_vat,
        line_total = t.new_supply,
        modified_at = NOW(),
        modified_by = 'migration:V124'
    FROM vat_half_up_recalculation_targets t
    WHERE t.target_kind = 'SLIP' AND t.line_id = sl.id;
    GET DIAGNOSTICS v124_updated_rows = ROW_COUNT;
    v124_changed_rows := v124_changed_rows + v124_updated_rows;

    UPDATE estimate_lines el
    SET supply_amount = t.new_supply,
        vat_amount = t.new_vat,
        line_total = t.new_supply,
        modified_at = NOW(),
        modified_by = 'migration:V124'
    FROM vat_half_up_recalculation_targets t
    WHERE t.target_kind = 'ESTIMATE' AND t.line_id = el.id;
    GET DIAGNOSTICS v124_updated_rows = ROW_COUNT;
    v124_changed_rows := v124_changed_rows + v124_updated_rows;

    IF v124_changed_rows <> v124_expected_rows THEN
        RAISE EXCEPTION 'V124 changed row count mismatch: expected %, changed %',
            v124_expected_rows, v124_changed_rows;
    END IF;

    SELECT COUNT(*) INTO v124_non_target_changed
    FROM (
        SELECT n.supply_amount AS before_supply, n.vat_amount AS before_vat,
               n.line_total AS before_line_total,
               sl.supply_amount AS after_supply, sl.vat_amount AS after_vat,
               sl.line_total AS after_line_total
        FROM v124_non_target_before n
        JOIN slip_lines sl ON n.target_kind = 'SLIP' AND n.line_id = sl.id
        UNION ALL
        SELECT n.supply_amount, n.vat_amount, n.line_total,
               el.supply_amount, el.vat_amount, el.line_total
        FROM v124_non_target_before n
        JOIN estimate_lines el ON n.target_kind = 'ESTIMATE' AND n.line_id = el.id
    ) unchanged
    WHERE before_supply IS DISTINCT FROM after_supply
       OR before_vat IS DISTINCT FROM after_vat
       OR before_line_total IS DISTINCT FROM after_line_total;

    IF v124_non_target_changed <> 0 THEN
        RAISE EXCEPTION 'V124 changed a non-target row: %', v124_non_target_changed;
    END IF;

    RAISE NOTICE 'V124 expected rows %, changed rows %, non-target changes %',
        v124_expected_rows, v124_changed_rows, v124_non_target_changed;
END $$;
