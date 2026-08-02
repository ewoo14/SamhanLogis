-- 재고 현황 전체/창고별 페이지 조회의 창고 선두 필터 인덱스.
-- 기존 V1 product 선두 인덱스와 기존 호출부를 유지한다.
CREATE INDEX IF NOT EXISTS ix_stock_balances_warehouse_active
    ON stock_balances (warehouse_id, product_id)
    WHERE is_deleted = false;
