-- S2a 품목리스트/품질 변경 조회 계약.
-- V26 이후 inventory-service의 다음 번호이며, 기존 migration은 수정하지 않는다.
CREATE INDEX IF NOT EXISTS ix_stock_instances_product_code_received
    ON stock_instances (product_code, received_at)
    WHERE is_deleted = FALSE;

COMMENT ON INDEX ix_stock_instances_product_code_received IS
    'S2a 품목리스트 productCode 범위 조회 순서 최적화';
