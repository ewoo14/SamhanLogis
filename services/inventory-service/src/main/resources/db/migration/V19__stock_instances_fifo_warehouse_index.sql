-- S3 출고 예약 FIFO ForUpdate 최적화: 창고 조건까지 인덱스에서 제한.
CREATE INDEX IF NOT EXISTS ix_stock_instances_fifo_wh
    ON stock_instances (product_code, warehouse_id, status, received_at);
