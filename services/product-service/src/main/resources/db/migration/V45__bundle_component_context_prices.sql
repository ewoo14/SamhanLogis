-- 부모 세트·구성품 pair별 시트 단가. NULL은 dual-read fallback을 의미한다.
ALTER TABLE bundle_component
    ADD COLUMN IF NOT EXISTS context_release_price NUMERIC(19, 2),
    ADD COLUMN IF NOT EXISTS context_delivery_price NUMERIC(19, 2);

COMMENT ON COLUMN bundle_component.context_release_price IS '부모 세트 문맥 구성품 출고가(원), NULL이면 전역 가격 fallback';
COMMENT ON COLUMN bundle_component.context_delivery_price IS '부모 세트 문맥 구성품 납품가(원), NULL이면 전역 납품가 fallback';

ALTER TABLE bundle_component
    ADD CONSTRAINT ck_bundle_component_context_release_price
        CHECK (context_release_price IS NULL OR context_release_price >= 0),
    ADD CONSTRAINT ck_bundle_component_context_delivery_price
        CHECK (context_delivery_price IS NULL OR context_delivery_price >= 0);

UPDATE bundle_component
SET context_delivery_price = CASE component_product_code
        WHEN 'AFR-BC3F' THEN 34000
        WHEN 'AFR-BC9F' THEN 34000
        WHEN 'AFR-QC3F' THEN 34000
        WHEN 'AFR-TC9D' THEN 45000
        WHEN 'AFR-TC9F' THEN 34000
        WHEN 'AR-EC05' THEN 16000
        WHEN 'AR-EH05' THEN 16000
        WHEN 'ARR-NK3F' THEN 34000
        WHEN 'ARR-PK8F' THEN 34000
        WHEN 'ARR-WK8F' THEN 34000
        WHEN 'AWR-WE13N' THEN 56000
        WHEN 'PC1BWSK3NW' THEN 128000
        WHEN 'PC1NWSK3NW' THEN 128000
        WHEN 'PC4NUFK1NW' THEN 128000
        WHEN 'PC6NUNK1NW' THEN 128000
        ELSE context_delivery_price
    END
WHERE is_deleted = FALSE
  AND component_product_code IN (
      'AFR-BC3F', 'AFR-BC9F', 'AFR-QC3F', 'AFR-TC9D', 'AFR-TC9F',
      'AR-EC05', 'AR-EH05', 'ARR-NK3F', 'ARR-PK8F', 'ARR-WK8F',
      'AWR-WE13N', 'PC1BWSK3NW', 'PC1NWSK3NW', 'PC4NUFK1NW', 'PC6NUNK1NW'
  );
