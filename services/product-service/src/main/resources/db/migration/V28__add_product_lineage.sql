-- 품목 계보는 관리자 편집 필드와 분리된 생성 출처로 보존한다.
ALTER TABLE products
    ADD COLUMN lineage VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

-- 기존 R3 데이터는 당시 생성 경로를 보존한 category/product_category 조합으로 1회 backfill 한다.
UPDATE products p
   SET lineage = 'ECOUNT'
 WHERE EXISTS (
           SELECT 1
             FROM categories c
            WHERE c.id = p.category_id
              AND c.code = 'ECOUNT_MIG2'
              AND c.is_deleted = FALSE
       );

UPDATE products p
   SET lineage = 'SHEET'
 WHERE lineage = 'MANUAL'
   AND p.product_category IS NOT NULL
   AND EXISTS (
           SELECT 1
             FROM categories c
            WHERE c.id = p.category_id
              AND c.code = 'INDOOR_WALL'
              AND c.is_deleted = FALSE
       );

ALTER TABLE products
    ADD CONSTRAINT ck_products_lineage
    CHECK (lineage IN ('MANUAL', 'SHEET', 'ECOUNT'));

CREATE INDEX idx_products_lineage_active
    ON products (lineage)
    WHERE is_deleted = FALSE;

-- ECOUNT importer의 INSERT는 ECOUNT_MIG2 category를 사용하므로 신규 행도 출처를 자동 보존한다.
CREATE OR REPLACE FUNCTION set_product_lineage_from_creation_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.lineage = 'MANUAL'
       AND NEW.product_code IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM categories c
            WHERE c.id = NEW.category_id
              AND c.code = 'ECOUNT_MIG2'
              AND c.is_deleted = FALSE
       ) THEN
        NEW.lineage := 'ECOUNT';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_lineage_on_insert
    BEFORE INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION set_product_lineage_from_creation_category();
