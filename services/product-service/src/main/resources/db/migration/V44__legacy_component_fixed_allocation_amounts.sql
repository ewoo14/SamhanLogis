-- PR #1241: 레거시 싱글 시트의 PANEL/REMOTE/MATERIAL 납품가를 세트 구성품 계약에 적재한다.
-- 고정 금액은 products.delivery_price(전역/멀티 단가)가 아니라 bundle_component 문맥의 값이다.
-- 원본: docs/qa/1241-271-diff-analysis/271-diff-full.csv 의 시트 값
UPDATE bundle_component bc
   SET allocation_mode = 'FIXED',
       allocation_weight = NULL,
       fixed_allocation_amount = CASE bc.component_product_code
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
       END
 WHERE bc.is_deleted = FALSE
   AND bc.component_kind IN ('PANEL', 'REMOTE', 'MATERIAL')
   AND EXISTS (
       SELECT 1
         FROM products parent
        WHERE parent.id = bc.bundle_product_id
          AND parent.is_deleted = FALSE
          AND parent.product_category = 'SINGLE_SET'
          AND parent.bundle_mode = 'EXPAND'
   )
   AND bc.component_product_code IN (
       'AFR-BC3F', 'AFR-BC9F', 'AFR-QC3F', 'AFR-TC9D', 'AFR-TC9F',
       'AR-EC05', 'AR-EH05', 'ARR-NK3F', 'ARR-PK8F', 'ARR-WK8F',
       'AWR-WE13N', 'PC1BWSK3NW', 'PC1NWSK3NW', 'PC4NUFK1NW', 'PC6NUNK1NW'
   );

-- V44 적용 건수: 246행 (시트 스냅샷의 PANEL/REMOTE/MATERIAL 구성품 행)
