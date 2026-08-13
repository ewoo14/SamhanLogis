-- 구성품 특징과 형상 분리.
-- component_shape 자체가 360 판넬 여부의 정의다. NULL이면 360 판넬이 아니다.
ALTER TABLE bundle_component ADD COLUMN IF NOT EXISTS component_shape VARCHAR(16);

CREATE TABLE IF NOT EXISTS bundle_component_shape_backfill_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_variant VARCHAR(64) NOT NULL,
    feature_value VARCHAR(64),
    shape_value VARCHAR(16),
    source_count BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bundle_component_shape_backfill_source UNIQUE (source_variant)
);

INSERT INTO bundle_component_shape_backfill_audit(source_variant, feature_value, shape_value, source_count)
SELECT component_variant, component_variant, NULL, COUNT(*)
FROM bundle_component
WHERE is_deleted = FALSE
  AND component_variant IN ('기본','블랙','승강','공청')
GROUP BY component_variant
ON CONFLICT DO NOTHING;

INSERT INTO bundle_component_shape_backfill_audit(source_variant, feature_value, shape_value, source_count)
SELECT component_variant, split_part(component_variant, ' ', 2), split_part(component_variant, ' ', 1), COUNT(*)
FROM bundle_component
WHERE is_deleted = FALSE
  AND component_variant ~ '^(원형|사각) (블랙|승강|공청)$'
GROUP BY component_variant
ON CONFLICT DO NOTHING;

INSERT INTO bundle_component_shape_backfill_audit(source_variant, feature_value, shape_value, source_count)
SELECT '사각', '기본', '사각', COUNT(*)
FROM bundle_component
WHERE is_deleted = FALSE AND component_variant = '사각'
ON CONFLICT DO NOTHING;

INSERT INTO bundle_component_shape_backfill_audit(source_variant, feature_value, shape_value, source_count)
SELECT component_variant,
       CASE component_variant WHEN '유선리모컨' THEN '유선' WHEN '컬러유선리모컨' THEN '컬러' END,
       NULL, COUNT(*)
FROM bundle_component
WHERE is_deleted = FALSE AND component_variant IN ('유선리모컨','컬러유선리모컨')
GROUP BY component_variant
ON CONFLICT DO NOTHING;

-- 전후 원문 카운트 보존: audit의 source_count 합은 UPDATE 전 대상 행 수와 같다.
DO $$ DECLARE before_count BIGINT; after_count BIGINT; BEGIN
  SELECT COUNT(*) INTO before_count FROM bundle_component WHERE is_deleted = FALSE AND component_variant IS NOT NULL;
  UPDATE bundle_component SET
    component_shape = CASE WHEN component_variant ~ '^(원형|사각) ' THEN split_part(component_variant, ' ', 1)
                           WHEN component_variant = '사각' THEN '사각' ELSE NULL END,
    component_variant = CASE WHEN component_variant ~ '^(원형|사각) ' THEN split_part(component_variant, ' ', 2)
                             WHEN component_variant = '사각' THEN '기본'
                             WHEN component_variant = '유선리모컨' THEN '유선'
                             WHEN component_variant = '컬러유선리모컨' THEN '컬러'
                             ELSE component_variant END
  WHERE is_deleted = FALSE;
  SELECT COUNT(*) INTO after_count FROM bundle_component WHERE is_deleted = FALSE AND component_variant IS NOT NULL;
  RAISE NOTICE '[V40] component_variant non-null before=% after=%; source rows=%', before_count, after_count, (SELECT COALESCE(SUM(source_count),0) FROM bundle_component_shape_backfill_audit);
END $$;

-- OUTDOOR S6-1111-MANUAL 1건은 QA 잔재로 보이나 변경하지 않고 관찰만 한다.
