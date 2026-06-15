-- V16: 상품/비상품 구분 + 비상품 카테고리 시드.
-- 비상품(NON_GOODS)은 견적/전표 라인에는 사용할 수 있지만 inventory-service 에서 재고를 만들지 않는다.

ALTER TABLE products
    ADD COLUMN goods_type VARCHAR(16) NOT NULL DEFAULT 'GOODS';

UPDATE products
   SET goods_type = 'GOODS'
 WHERE goods_type IS NULL;

ALTER TABLE products
    ADD CONSTRAINT chk_products_goods_type
        CHECK (goods_type IN ('GOODS', 'NON_GOODS'));

INSERT INTO categories (id, code, name, parent_id, display_order,
                        serial_managed, created_at, created_by, is_deleted)
VALUES ('00000000-0000-0000-0000-000000001008',
        'SERVICE',
        '서비스/요금',
        NULL,
        90,
        FALSE,
        NOW(),
        'system',
        FALSE)
ON CONFLICT DO NOTHING;
