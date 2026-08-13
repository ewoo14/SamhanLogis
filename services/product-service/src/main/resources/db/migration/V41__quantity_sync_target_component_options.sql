-- 수량 동기화 target 칩에서 구성품 특징·형상을 보존한다.
-- NULL/빈 값은 기존 규칙과 360 판넬이 아닌 target을 의미하므로 기존 26건을 그대로 유지한다.
ALTER TABLE quantity_sync_target
    ADD COLUMN IF NOT EXISTS component_variant VARCHAR(32),
    ADD COLUMN IF NOT EXISTS component_shape VARCHAR(16);

ALTER TABLE quantity_sync_target
    ADD CONSTRAINT chk_qst_component_shape
    CHECK (component_shape IS NULL OR component_shape IN ('원형', '사각'));
