-- 슬2: 기존 순번코드를 product_aliases에 보존한다.
-- model_code가 없는 품목은 ProductSummaryResponse에서 product_code를 계속 노출하므로
-- 이 migration은 화면·전표의 legacy lookup 경로를 잃지 않게 한다.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM products p
          JOIN product_aliases a
            ON a.alias_code = p.product_code
           AND a.is_deleted = FALSE
         WHERE p.is_deleted = FALSE
           AND p.product_code IS NOT NULL
           AND btrim(p.product_code) <> ''
           AND a.main_product_id <> p.id
    ) THEN
        RAISE EXCEPTION 'product_code alias conflict: existing alias points to another product';
    END IF;
END $$;

INSERT INTO product_aliases (
    alias_code, main_product_id, source, created_at, created_by, is_deleted
)
SELECT btrim(p.product_code), p.id, 'S2_LEGACY_PRODUCT_CODE', NOW(), 'system', FALSE
  FROM products p
 WHERE p.is_deleted = FALSE
   AND p.product_code IS NOT NULL
   AND btrim(p.product_code) <> ''
   AND NOT EXISTS (
       SELECT 1
         FROM product_aliases a
        WHERE a.alias_code = btrim(p.product_code)
          AND a.is_deleted = FALSE
   );
